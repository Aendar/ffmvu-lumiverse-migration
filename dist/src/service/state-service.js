import { canonicalHash } from '../shared/hashing.js';
import { applyJsonPatch, assertModelOperationPolicy, assertPatchResourceLimits, canonicalizeIncomingModelOperation } from '../shared/json-patch.js';
import { assertModelPatchAuthorization } from '../shared/patch-policy.js';
import { computeProjectionConsumptionPatchForReducer } from '../shared/projection-consumption.js';
import { CURRENT_PROJECTION_VERSION, CURRENT_REDUCER_VERSION, LEGACY_PROJECTION_VERSION, LEGACY_REDUCER_VERSION, STATE_SCHEMA_VERSION } from '../shared/state-schema.js';
import { createDefaultState, createLegacyDefaultState } from '../shared/state-defaults.js';
import { AnchorStore } from '../persistence/anchor-store.js';
import { EventStore } from '../persistence/event-store.js';
import { Materializer } from '../persistence/materializer.js';
import { createId, isoNow } from '../persistence/ids.js';
import { materializedTipPath } from '../persistence/paths.js';
import { EVENT_FORMAT_VERSION, PORTABLE_SNAPSHOT_FORMAT } from '../persistence/types.js';
import { ScopeMutex } from './scope-mutex.js';
import { applyGameStartPayload } from '../shared/domain/gamestart.js';
import { extractLegacyImport } from '../shared/domain/snapshot.js';
import { applyGuiIntent, buildGuiIntentPatch, buildStatePatch } from '../shared/domain/gui-intents.js';
const HPH_SCENE_ROOT = '/Narrative/Scene/HPH';
export class ModelPatchRejectedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ModelPatchRejectedError';
    }
}
function withRequiredModelStructuralParents(state, patch) {
    const scene = state.Narrative.Scene;
    const hphMissing = !Object.prototype.hasOwnProperty.call(scene, 'HPH');
    if (!hphMissing)
        return [...patch];
    const writesHphRoot = patch.some(operation => operation.path === HPH_SCENE_ROOT);
    const writesHphDescendant = patch.some(operation => operation.path.startsWith(HPH_SCENE_ROOT + '/'));
    if (!writesHphDescendant || writesHphRoot)
        return [...patch];
    // HPH owner state remains trigger-created by the model. This only supplies the otherwise-missing
    // structural parent so a first valid add to /Narrative/Scene/HPH/<owner> can be applied atomically.
    return [{ op: 'add', path: HPH_SCENE_ROOT, value: {} }, ...patch];
}
export class StateService {
    storage;
    reducers;
    projections;
    store;
    materializer;
    anchors;
    mutex = new ScopeMutex();
    constructor(storage, reducers, projections) {
        this.storage = storage;
        this.reducers = reducers;
        this.projections = projections;
        this.store = new EventStore(storage);
        this.materializer = new Materializer(this.store, reducers);
        this.anchors = new AnchorStore(storage);
    }
    async updateMaterializedTipCache(scope, value) {
        try {
            await this.storage.setJson(materializedTipPath(scope), value);
        }
        catch { /* cache is acceleration only; committed StoreRevision remains authoritative */ }
    }
    async createGenesis(scope, input = {}) {
        return this.mutex.run(scope, async () => {
            const head = await this.store.resolveStoreHead(scope);
            if (head.status !== 'empty')
                throw new Error('GENESIS_ALREADY_EXISTS_OR_STORE_UNHEALTHY: ' + head.status);
            const reducerVersion = input.reducerVersion ?? CURRENT_REDUCER_VERSION;
            const projectionVersion = input.projectionVersion ?? CURRENT_PROJECTION_VERSION;
            const promptProtocolVersion = input.promptProtocolVersion ?? 'ffmvu-model-state-v1';
            const stateSchemaVersion = input.stateSchemaVersion ?? (reducerVersion === LEGACY_REDUCER_VERSION ? LEGACY_REDUCER_VERSION : STATE_SCHEMA_VERSION);
            const reducer = this.reducers.get(reducerVersion);
            const state = reducer.normalize(input.state ?? (reducerVersion === LEGACY_REDUCER_VERSION ? createLegacyDefaultState() : createDefaultState()));
            const errors = reducer.validate(state);
            if (errors.length)
                throw new Error('Invalid genesis state: ' + errors.join('; '));
            const stateHash = await canonicalHash(state);
            const baseId = createId('base');
            const transactionId = createId('tx');
            const defaultView = this.projections.get(projectionVersion).build(state);
            const defaultPromptViewHash = await canonicalHash(defaultView);
            let projectionBinding;
            let projectionSeed;
            if (input.projectionSeed) {
                const seed = structuredClone(input.projectionSeed);
                this.projections.get(seed.projectionVersion);
                const seedHash = await canonicalHash(seed.projection);
                if (seedHash !== seed.promptViewHash)
                    throw new Error('GENESIS_PROJECTION_SEED_HASH_MISMATCH');
                projectionSeed = seed;
                projectionBinding = {
                    sourceKind: 'base-seed', sourceBaseId: baseId,
                    projectionVersion: seed.projectionVersion,
                    promptProtocolVersion: seed.promptProtocolVersion,
                    promptViewHash: seed.promptViewHash,
                };
            }
            else {
                projectionBinding = {
                    sourceKind: 'node', sourceNodeId: baseId, sourceStateHash: stateHash,
                    projectionVersion,
                    promptProtocolVersion,
                    promptViewHash: defaultPromptViewHash,
                };
            }
            const base = {
                eventFormatVersion: EVENT_FORMAT_VERSION, id: baseId, scope, kind: input.kind ?? 'genesis', stateSchemaVersion,
                reducerVersion, state, stateHash, projectionBinding,
                ...(projectionSeed ? { projectionSeed } : {}),
                ...(input.transcriptBoundary ? { transcriptBoundary: structuredClone(input.transcriptBoundary) } : {}),
                ...(input.provenance ? { provenance: structuredClone(input.provenance) } : {}),
                createdAt: isoNow(),
            };
            const baseArtifactHash = await this.store.writeBase(base);
            const revision = { eventFormatVersion: EVENT_FORMAT_VERSION, revisionId: createId('rev'), scope, previousStoreRevisionId: null, previousStoreRevisionHash: null, transactionId, committedArtifacts: [{ type: 'base', id: baseId, hash: baseArtifactHash }], semanticTipNodeId: baseId, semanticTipStateHash: stateHash, createdAt: isoNow() };
            await this.store.writeRevision(revision);
            const result = { nodeId: baseId, stateHash, state };
            await this.updateMaterializedTipCache(scope, result);
            await this.anchors.putRoot({ anchorId: 'root', scope, baseNodeId: baseId, tipNodeId: baseId, updatedAt: isoNow() });
            return result;
        });
    }
    async startNewGame(scope, payload, transcriptBoundary) {
        const state = applyGameStartPayload(createDefaultState(), payload);
        return this.createGenesis(scope, {
            state,
            kind: 'genesis',
            ...(transcriptBoundary ? { transcriptBoundary } : {}),
            provenance: { source: 'gamestart-v1.4', gameStarted: true },
        });
    }
    async importLegacyState(scope, input, transcriptBoundary) {
        const extracted = await extractLegacyImport(input);
        return this.createGenesis(scope, {
            state: extracted.state,
            kind: 'legacy-import',
            reducerVersion: LEGACY_REDUCER_VERSION,
            projectionVersion: extracted.projectionSeed?.projectionVersion ?? LEGACY_PROJECTION_VERSION,
            promptProtocolVersion: extracted.projectionSeed?.promptProtocolVersion ?? 'ffmvu-model-state-v1',
            stateSchemaVersion: LEGACY_REDUCER_VERSION,
            ...(extracted.projectionSeed ? { projectionSeed: extracted.projectionSeed } : {}),
            ...(transcriptBoundary ? { transcriptBoundary } : {}),
            provenance: extracted.provenance,
        });
    }
    async exportPortableSnapshot(scope, nodeId) {
        if (!await this.store.isNodeCommitted(scope, nodeId))
            throw new Error('SNAPSHOT_NODE_NOT_COMMITTED');
        const materialized = await this.materializer.materialize(scope, nodeId);
        const artifact = await this.store.readNode(scope, nodeId);
        const projection = await this.getProjectionForNode(scope, nodeId);
        const portableWithoutHash = {
            format: PORTABLE_SNAPSHOT_FORMAT,
            createdAt: isoNow(),
            source: {
                chatId: scope.chatId,
                nodeId,
                stateHash: materialized.stateHash,
                turn: Number(materialized.state.Narrative.Turn) || 0,
                gameDate: String(materialized.state.World.Date?.[0] ?? ''),
                gameTime: String(materialized.state.World.Time?.[0] ?? ''),
            },
            stateSchemaVersion: artifact.value.reducerVersion === LEGACY_REDUCER_VERSION ? LEGACY_REDUCER_VERSION : STATE_SCHEMA_VERSION,
            reducerVersion: artifact.value.reducerVersion,
            state: structuredClone(materialized.state),
            stateHash: materialized.stateHash,
            projectionSeed: {
                projectionVersion: projection.projectionVersion,
                promptProtocolVersion: projection.promptProtocolVersion,
                projection: structuredClone(projection.view),
                promptViewHash: projection.viewHash,
                provenance: 'fork-exact',
            },
        };
        const snapshotHash = await canonicalHash(portableWithoutHash);
        return { ...portableWithoutHash, snapshotHash };
    }
    async importPortableSnapshot(scope, snapshot, transcriptBoundary) {
        if (!snapshot || snapshot.format !== PORTABLE_SNAPSHOT_FORMAT)
            throw new Error('UNSUPPORTED_PORTABLE_SNAPSHOT_FORMAT');
        const { snapshotHash, ...payload } = snapshot;
        if (await canonicalHash(payload) !== snapshotHash)
            throw new Error('PORTABLE_SNAPSHOT_HASH_MISMATCH');
        const reducer = this.reducers.get(snapshot.reducerVersion);
        this.projections.get(snapshot.projectionSeed.projectionVersion);
        const normalized = reducer.normalize(snapshot.state);
        const errors = reducer.validate(normalized);
        if (errors.length)
            throw new Error('PORTABLE_SNAPSHOT_INVALID_STATE: ' + errors.join('; '));
        if (await canonicalHash(normalized) !== snapshot.stateHash)
            throw new Error('PORTABLE_SNAPSHOT_STATE_HASH_MISMATCH');
        if (await canonicalHash(snapshot.projectionSeed.projection) !== snapshot.projectionSeed.promptViewHash) {
            throw new Error('PORTABLE_SNAPSHOT_PROJECTION_HASH_MISMATCH');
        }
        return this.createGenesis(scope, {
            state: normalized,
            kind: 'fork',
            reducerVersion: snapshot.reducerVersion,
            projectionVersion: snapshot.projectionSeed.projectionVersion,
            promptProtocolVersion: snapshot.projectionSeed.promptProtocolVersion,
            stateSchemaVersion: snapshot.stateSchemaVersion,
            projectionSeed: {
                ...structuredClone(snapshot.projectionSeed),
                provenance: 'fork-exact',
            },
            ...(transcriptBoundary ? { transcriptBoundary } : {}),
            provenance: {
                source: 'portable-snapshot',
                sourceChatId: snapshot.source.chatId,
                sourceNodeId: snapshot.source.nodeId,
                sourceStateHash: snapshot.source.stateHash,
                sourceSnapshotHash: snapshot.snapshotHash,
                sourceCreatedAt: snapshot.createdAt,
            },
        });
    }
    /**
     * Upgrade one legacy head to the current schema without involving the UI,
     * a copied snapshot, or an LLM. The resulting migration commit preserves
     * the existing transcript/variant lineage just like any other system state
     * transition.
     */
    async autoMigrateLegacyState(scope, input) {
        if (!await this.store.isNodeCommitted(scope, input.parentNodeId))
            throw new Error('AUTO_MIGRATION_SOURCE_NOT_COMMITTED');
        const parent = await this.materializer.materialize(scope, input.parentNodeId);
        if (parent.stateHash !== input.expectedParentStateHash)
            throw new Error('AUTO_MIGRATION_STALE_HEAD');
        const artifact = await this.store.readNode(scope, input.parentNodeId);
        if (artifact.value.reducerVersion !== LEGACY_REDUCER_VERSION)
            throw new Error('AUTO_MIGRATION_NOT_REQUIRED');
        const reducer = this.reducers.get(CURRENT_REDUCER_VERSION);
        const target = reducer.normalize(parent.state);
        const errors = reducer.validate(target);
        if (errors.length)
            throw new Error('AUTO_MIGRATION_TARGET_INVALID: ' + errors.join('; '));
        const patch = buildStatePatch(parent.state, target);
        assertPatchResourceLimits(patch);
        return this.commitPatch(scope, {
            parentNodeId: parent.nodeId,
            expectedParentStateHash: parent.stateHash,
            patch,
            kind: 'migration',
            anchor: structuredClone(input.anchor),
            requestId: input.requestId,
            note: 'automatic-schema-upgrade-v1.6',
            reducerVersion: CURRENT_REDUCER_VERSION,
            projectionVersion: CURRENT_PROJECTION_VERSION,
            promptProtocolVersion: 'ffmvu-model-state-v1',
            requireCurrentPhysicalTip: true,
        });
    }
    async commitGuiIntent(scope, input) {
        if (!input.anchor.lineageAnchorId)
            throw new Error('GUI_LINEAGE_ANCHOR_REQUIRED');
        const parent = await this.materializer.materialize(scope, input.expectedParentNodeId);
        if (parent.stateHash !== input.expectedParentStateHash) {
            throw new Error('GUI_COMMIT_CONFLICT: expected parent state hash mismatch');
        }
        const rawNext = applyGuiIntent(parent.state, input.intent);
        const reducerArtifact = await this.store.readNode(scope, input.expectedParentNodeId);
        const reducer = this.reducers.get(reducerArtifact.value.reducerVersion);
        const next = reducer.normalize(rawNext);
        const errors = reducer.validate(next);
        if (errors.length)
            throw new Error('Invalid GUI intent result: ' + errors.join('; '));
        const patch = buildGuiIntentPatch(parent.state, next);
        if (!patch.length)
            throw new Error('GUI_INTENT_NO_CHANGE');
        return this.commitPatch(scope, {
            parentNodeId: input.expectedParentNodeId,
            expectedParentStateHash: input.expectedParentStateHash,
            patch,
            kind: 'gui',
            anchor: structuredClone(input.anchor),
            requestId: input.requestId,
            note: 'gui-intent:' + input.intent.type,
        });
    }
    async commitPatch(scope, input) {
        return this.mutex.run(scope, async () => {
            assertPatchResourceLimits(input.patch);
            const physical = await this.store.resolveStoreHead(scope);
            if (physical.status !== 'ok' || !physical.head || !physical.headHash)
                throw new Error('STORE_NOT_WRITABLE: ' + physical.status);
            if (input.requireCurrentPhysicalTip && (physical.head.semanticTipNodeId !== input.parentNodeId
                || (input.expectedParentStateHash !== undefined && physical.head.semanticTipStateHash !== input.expectedParentStateHash)))
                throw new Error('COMMIT_STALE_HEAD');
            if (!await this.store.isNodeCommitted(scope, input.parentNodeId))
                throw new Error('PARENT_NOT_COMMITTED');
            const parentArtifact = await this.store.readNode(scope, input.parentNodeId);
            const parent = await this.materializer.materialize(scope, input.parentNodeId);
            if (input.expectedParentStateHash && parent.stateHash !== input.expectedParentStateHash) {
                throw new Error('COMMIT_CONFLICT: expected parent state hash mismatch');
            }
            const reducerVersion = input.reducerVersion ?? parentArtifact.value.reducerVersion;
            const reducer = this.reducers.get(reducerVersion);
            const nextState = reducer.normalize(applyJsonPatch(parent.state, input.patch));
            const errors = reducer.validate(nextState);
            if (errors.length)
                throw new Error('Invalid commit result: ' + errors.join('; '));
            const resultStateHash = await canonicalHash(nextState);
            const commitId = createId('node');
            const transactionId = createId('tx');
            const projectionVersion = input.projectionVersion ?? parentArtifact.value.projectionBinding.projectionVersion;
            const promptProtocolVersion = input.promptProtocolVersion ?? parentArtifact.value.projectionBinding.promptProtocolVersion;
            const projection = this.projections.get(projectionVersion).build(nextState);
            const promptViewHash = await canonicalHash(projection);
            const patchHash = await canonicalHash(input.patch);
            const commit = {
                eventFormatVersion: EVENT_FORMAT_VERSION, id: commitId, scope, kind: input.kind, anchor: structuredClone(input.anchor ?? {}), parentNodeId: parent.nodeId, parentStateHash: parent.stateHash,
                patch: structuredClone(input.patch), patchHash, reducerVersion, resultStateHash,
                projectionBinding: { sourceKind: 'node', sourceNodeId: commitId, sourceStateHash: resultStateHash, projectionVersion, promptProtocolVersion, promptViewHash },
                transactionId, previousStoreRevisionId: physical.head.revisionId, previousStoreRevisionHash: physical.headHash,
                ...(input.requestId ? { requestId: input.requestId } : {}), ...(input.note ? { note: input.note } : {}), createdAt: isoNow(),
            };
            const commitArtifactHash = await this.store.writeCommit(commit);
            const revision = { eventFormatVersion: EVENT_FORMAT_VERSION, revisionId: createId('rev'), scope, previousStoreRevisionId: physical.head.revisionId, previousStoreRevisionHash: physical.headHash, transactionId, committedArtifacts: [{ type: 'commit', id: commitId, hash: commitArtifactHash }], semanticTipNodeId: commitId, semanticTipStateHash: resultStateHash, createdAt: isoNow() };
            await this.store.writeRevision(revision);
            const result = { nodeId: commitId, stateHash: resultStateHash, state: nextState };
            await this.updateMaterializedTipCache(scope, result);
            return result;
        });
    }
    async finalizeModelAttempt(scope, input) {
        return this.mutex.run(scope, async () => {
            const physical = await this.store.resolveStoreHead(scope);
            if (physical.status !== 'ok' || !physical.head || !physical.headHash)
                throw new Error('STORE_NOT_WRITABLE: ' + physical.status);
            if (!await this.store.isNodeCommitted(scope, input.expectedParentNodeId))
                throw new Error('PARENT_NOT_COMMITTED');
            const parentArtifact = await this.store.readNode(scope, input.expectedParentNodeId);
            const parent = await this.materializer.materialize(scope, input.expectedParentNodeId);
            if (parent.stateHash !== input.expectedParentStateHash)
                throw new Error('MODEL_COMMIT_CONFLICT: frozen parent state hash mismatch');
            const reducer = this.reducers.get(parentArtifact.value.reducerVersion);
            const rawPatch = input.patch ?? [];
            let canonicalPatch = [];
            let workingState = structuredClone(parent.state);
            let hasModelPatch = false;
            let canonicalPatchHash;
            let r1State;
            try {
                assertPatchResourceLimits(rawPatch);
                assertModelOperationPolicy(rawPatch);
                const patchWithStructuralParents = withRequiredModelStructuralParents(parent.state, rawPatch);
                for (const rawOperation of patchWithStructuralParents) {
                    const operations = canonicalizeIncomingModelOperation(workingState, rawOperation);
                    for (const operation of operations) {
                        canonicalPatch.push(structuredClone(operation));
                        workingState = applyJsonPatch(workingState, [operation]);
                    }
                }
                assertPatchResourceLimits(canonicalPatch);
                assertModelPatchAuthorization(parent.state, canonicalPatch, input.authorization);
                hasModelPatch = canonicalPatch.length > 0;
                canonicalPatchHash = hasModelPatch ? await canonicalHash(canonicalPatch) : undefined;
                r1State = hasModelPatch ? reducer.normalize(workingState) : structuredClone(parent.state);
                const r1Errors = reducer.validate(r1State);
                if (r1Errors.length)
                    throw new Error('Invalid model commit result: ' + r1Errors.join('; '));
            }
            catch (error) {
                throw new ModelPatchRejectedError(String(error));
            }
            const r1StateHash = hasModelPatch ? await canonicalHash(r1State) : parent.stateHash;
            const modelCommitId = hasModelPatch ? createId('node') : null;
            const r1NodeId = modelCommitId ?? parent.nodeId;
            const projectionImplementation = this.projections.get(input.projectionVersion);
            const nextProjection = projectionImplementation.build(r1State);
            const nextPromptViewHash = await canonicalHash(nextProjection);
            const transactionId = createId('tx');
            const commits = [];
            if (modelCommitId) {
                commits.push({
                    eventFormatVersion: EVENT_FORMAT_VERSION, id: modelCommitId, scope, kind: 'model',
                    anchor: structuredClone(input.anchor), parentNodeId: parent.nodeId, parentStateHash: parent.stateHash,
                    patch: structuredClone(canonicalPatch), patchHash: canonicalPatchHash, reducerVersion: parentArtifact.value.reducerVersion, resultStateHash: r1StateHash,
                    projectionBinding: { sourceKind: 'node', sourceNodeId: modelCommitId, sourceStateHash: r1StateHash, projectionVersion: input.projectionVersion, promptProtocolVersion: input.promptProtocolVersion, promptViewHash: nextPromptViewHash },
                    transactionId, previousStoreRevisionId: physical.head.revisionId, previousStoreRevisionHash: physical.headHash, requestId: input.requestId,
                    ...(input.rawGenerationHash ? { rawGenerationHash: input.rawGenerationHash } : {}),
                    ...(input.rawPatchPayloadHash ? { rawPatchPayloadHash: input.rawPatchPayloadHash } : {}),
                    ...(input.storedMessageTextHash ? { storedMessageTextHash: input.storedMessageTextHash } : {}),
                    ...(input.presetVersion ? { presetVersion: input.presetVersion } : {}),
                    createdAt: isoNow(),
                });
            }
            const consumptionPatch = computeProjectionConsumptionPatchForReducer(parentArtifact.value.reducerVersion, r1State, nextProjection);
            let finalNodeId = r1NodeId;
            let finalStateHash = r1StateHash;
            let finalState = r1State;
            let systemCommitId = null;
            if (consumptionPatch.length) {
                const consumedState = reducer.normalize(applyJsonPatch(r1State, consumptionPatch));
                const errors = reducer.validate(consumedState);
                if (errors.length)
                    throw new Error('Invalid projection consumption result: ' + errors.join('; '));
                const consumedStateHash = await canonicalHash(consumedState);
                systemCommitId = createId('node');
                commits.push({
                    eventFormatVersion: EVENT_FORMAT_VERSION, id: systemCommitId, scope, kind: 'system',
                    anchor: structuredClone(input.anchor), parentNodeId: r1NodeId, parentStateHash: r1StateHash,
                    patch: structuredClone(consumptionPatch), patchHash: await canonicalHash(consumptionPatch), reducerVersion: parentArtifact.value.reducerVersion, resultStateHash: consumedStateHash,
                    projectionBinding: { sourceKind: 'node', sourceNodeId: r1NodeId, sourceStateHash: r1StateHash, projectionVersion: input.projectionVersion, promptProtocolVersion: input.promptProtocolVersion, promptViewHash: nextPromptViewHash },
                    transactionId, previousStoreRevisionId: physical.head.revisionId, previousStoreRevisionHash: physical.headHash, requestId: input.requestId,
                    note: 'projection-consumption', createdAt: isoNow(),
                });
                finalNodeId = systemCommitId;
                finalStateHash = consumedStateHash;
                finalState = consumedState;
            }
            else if (!modelCommitId) {
                const binding = parentArtifact.value.projectionBinding;
                const directMatches = binding.sourceKind === 'node' && binding.sourceNodeId === parent.nodeId && binding.sourceStateHash === parent.stateHash &&
                    binding.projectionVersion === input.projectionVersion && binding.promptProtocolVersion === input.promptProtocolVersion &&
                    binding.promptViewHash === nextPromptViewHash;
                if (!directMatches) {
                    systemCommitId = createId('node');
                    commits.push({
                        eventFormatVersion: EVENT_FORMAT_VERSION, id: systemCommitId, scope, kind: 'system',
                        anchor: structuredClone(input.anchor), parentNodeId: parent.nodeId, parentStateHash: parent.stateHash,
                        patch: [], patchHash: await canonicalHash([]), reducerVersion: parentArtifact.value.reducerVersion, resultStateHash: parent.stateHash,
                        projectionBinding: { sourceKind: 'node', sourceNodeId: systemCommitId, sourceStateHash: parent.stateHash, projectionVersion: input.projectionVersion, promptProtocolVersion: input.promptProtocolVersion, promptViewHash: nextPromptViewHash },
                        transactionId, previousStoreRevisionId: physical.head.revisionId, previousStoreRevisionHash: physical.headHash, requestId: input.requestId,
                        note: 'projection-refresh', createdAt: isoNow(),
                    });
                    finalNodeId = systemCommitId;
                }
            }
            if (commits.length) {
                const committedArtifacts = [];
                for (const commit of commits) {
                    const artifactHash = await this.store.writeCommit(commit);
                    committedArtifacts.push({ type: 'commit', id: commit.id, hash: artifactHash });
                }
                await this.store.writeRevision({
                    eventFormatVersion: EVENT_FORMAT_VERSION, revisionId: createId('rev'), scope,
                    previousStoreRevisionId: physical.head.revisionId, previousStoreRevisionHash: physical.headHash,
                    transactionId, committedArtifacts, semanticTipNodeId: finalNodeId, semanticTipStateHash: finalStateHash, createdAt: isoNow(),
                });
                await this.updateMaterializedTipCache(scope, { nodeId: finalNodeId, stateHash: finalStateHash, state: finalState });
            }
            return {
                nodeId: finalNodeId, stateHash: finalStateHash, state: finalState,
                status: hasModelPatch ? 'committed' : 'no_patch',
                modelCommitId, systemCommitId, transactionId: commits.length ? transactionId : null,
                committedNodeIds: commits.map(commit => commit.id), nextPromptViewHash,
                ...(canonicalPatchHash ? { canonicalPatchHash } : {}),
            };
        });
    }
    async readLatestCommittedTransactionTip(scope) { const revision = await this.store.resolveStoreHead(scope); if (revision.status === 'empty')
        return null; if (revision.status !== 'ok' || !revision.head)
        throw new Error('STORE_HEAD_' + revision.status.toUpperCase()); return this.materializer.materialize(scope, revision.head.semanticTipNodeId); }
    async getProjectionForNode(scope, nodeId) {
        if (!await this.store.isNodeCommitted(scope, nodeId))
            throw new Error('NODE_NOT_COMMITTED');
        const target = await this.materializer.materialize(scope, nodeId);
        const artifact = await this.store.readNode(scope, nodeId);
        const binding = artifact.value.projectionBinding;
        if (binding.sourceKind === 'base-seed') {
            if (artifact.type !== 'base' || !artifact.value.projectionSeed)
                throw new Error('BASE_SEED_BINDING_WITHOUT_SEED');
            const seed = artifact.value.projectionSeed;
            if (binding.sourceBaseId !== artifact.value.id || seed.projectionVersion !== binding.projectionVersion || seed.promptProtocolVersion !== binding.promptProtocolVersion)
                throw new Error('BASE_SEED_BINDING_MISMATCH');
            const viewHash = await canonicalHash(seed.projection);
            if (viewHash !== binding.promptViewHash || viewHash !== seed.promptViewHash)
                throw new Error('BASE_SEED_PROJECTION_HASH_MISMATCH');
            return { nodeId: target.nodeId, stateHash: target.stateHash, reducerVersion: artifact.value.reducerVersion, sourceKind: 'base-seed', sourceBaseId: artifact.value.id, projectionVersion: binding.projectionVersion, promptProtocolVersion: binding.promptProtocolVersion, view: structuredClone(seed.projection), viewHash };
        }
        if (!binding.sourceNodeId || !binding.sourceStateHash)
            throw new Error('NODE_PROJECTION_BINDING_INCOMPLETE');
        if (!await this.store.isNodeCommitted(scope, binding.sourceNodeId))
            throw new Error('PROJECTION_SOURCE_NOT_COMMITTED');
        const source = await this.materializer.materialize(scope, binding.sourceNodeId);
        if (source.stateHash !== binding.sourceStateHash)
            throw new Error('PROJECTION_SOURCE_STATE_HASH_MISMATCH');
        const view = this.projections.get(binding.projectionVersion).build(source.state);
        const viewHash = await canonicalHash(view);
        if (viewHash !== binding.promptViewHash)
            throw new Error('PROJECTION_BINDING_HASH_MISMATCH');
        return { nodeId: target.nodeId, stateHash: target.stateHash, reducerVersion: artifact.value.reducerVersion, sourceKind: 'node', sourceNodeId: source.nodeId, sourceStateHash: source.stateHash, projectionVersion: binding.projectionVersion, promptProtocolVersion: binding.promptProtocolVersion, view, viewHash };
    }
}
//# sourceMappingURL=state-service.js.map