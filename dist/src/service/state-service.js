import { canonicalHash } from '../shared/hashing.js';
import { applyJsonPatch, assertPatchResourceLimits } from '../shared/json-patch.js';
import { LEGACY_PROJECTION_VERSION, LEGACY_REDUCER_VERSION, STATE_SCHEMA_VERSION } from '../shared/state-schema.js';
import { createDefaultState } from '../shared/state-defaults.js';
import { AnchorStore } from '../persistence/anchor-store.js';
import { EventStore } from '../persistence/event-store.js';
import { Materializer } from '../persistence/materializer.js';
import { createId, isoNow } from '../persistence/ids.js';
import { materializedTipPath } from '../persistence/paths.js';
import { EVENT_FORMAT_VERSION } from '../persistence/types.js';
import { ScopeMutex } from './scope-mutex.js';
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
    async createGenesis(scope, input = {}) {
        return this.mutex.run(scope, async () => {
            const head = await this.store.resolveStoreHead(scope);
            if (head.status !== 'empty')
                throw new Error('GENESIS_ALREADY_EXISTS_OR_STORE_UNHEALTHY: ' + head.status);
            const reducer = this.reducers.get(LEGACY_REDUCER_VERSION);
            const state = reducer.normalize(input.state ?? createDefaultState());
            const errors = reducer.validate(state);
            if (errors.length)
                throw new Error('Invalid genesis state: ' + errors.join('; '));
            const stateHash = await canonicalHash(state);
            const baseId = createId('base');
            const transactionId = createId('tx');
            const view = this.projections.get(LEGACY_PROJECTION_VERSION).build(state);
            const promptViewHash = await canonicalHash(view);
            const base = {
                eventFormatVersion: EVENT_FORMAT_VERSION, id: baseId, scope, kind: 'genesis', stateSchemaVersion: STATE_SCHEMA_VERSION,
                reducerVersion: LEGACY_REDUCER_VERSION, state, stateHash,
                projectionBinding: { sourceKind: 'node', sourceNodeId: baseId, sourceStateHash: stateHash, projectionVersion: LEGACY_PROJECTION_VERSION, promptProtocolVersion: 'ffmvu-model-state-v1', promptViewHash },
                ...(input.transcriptBoundary ? { transcriptBoundary: structuredClone(input.transcriptBoundary) } : {}),
                ...(input.provenance ? { provenance: structuredClone(input.provenance) } : {}),
                createdAt: isoNow(),
            };
            const baseArtifactHash = await this.store.writeBase(base);
            const revision = { eventFormatVersion: EVENT_FORMAT_VERSION, revisionId: createId('rev'), scope, previousStoreRevisionId: null, previousStoreRevisionHash: null, transactionId, committedArtifacts: [{ type: 'base', id: baseId, hash: baseArtifactHash }], semanticTipNodeId: baseId, semanticTipStateHash: stateHash, createdAt: isoNow() };
            await this.store.writeRevision(revision);
            const result = { nodeId: baseId, stateHash, state };
            await this.storage.setJson(materializedTipPath(scope), result);
            await this.anchors.putRoot({ anchorId: 'root', scope, baseNodeId: baseId, tipNodeId: baseId, updatedAt: isoNow() });
            return result;
        });
    }
    async commitPatch(scope, input) {
        return this.mutex.run(scope, async () => {
            assertPatchResourceLimits(input.patch);
            const physical = await this.store.resolveStoreHead(scope);
            if (physical.status !== 'ok' || !physical.head || !physical.headHash)
                throw new Error('STORE_NOT_WRITABLE: ' + physical.status);
            if (!await this.store.isNodeCommitted(scope, input.parentNodeId))
                throw new Error('PARENT_NOT_COMMITTED');
            const parent = await this.materializer.materialize(scope, input.parentNodeId);
            const reducer = this.reducers.get(LEGACY_REDUCER_VERSION);
            const nextState = reducer.normalize(applyJsonPatch(parent.state, input.patch));
            const errors = reducer.validate(nextState);
            if (errors.length)
                throw new Error('Invalid commit result: ' + errors.join('; '));
            const resultStateHash = await canonicalHash(nextState);
            const commitId = createId('node');
            const transactionId = createId('tx');
            const projection = this.projections.get(LEGACY_PROJECTION_VERSION).build(nextState);
            const promptViewHash = await canonicalHash(projection);
            const patchHash = await canonicalHash(input.patch);
            const commit = {
                eventFormatVersion: EVENT_FORMAT_VERSION, id: commitId, scope, kind: input.kind, anchor: structuredClone(input.anchor ?? {}), parentNodeId: parent.nodeId, parentStateHash: parent.stateHash,
                patch: structuredClone(input.patch), patchHash, reducerVersion: LEGACY_REDUCER_VERSION, resultStateHash,
                projectionBinding: { sourceKind: 'node', sourceNodeId: commitId, sourceStateHash: resultStateHash, projectionVersion: LEGACY_PROJECTION_VERSION, promptProtocolVersion: 'ffmvu-model-state-v1', promptViewHash },
                transactionId, previousStoreRevisionId: physical.head.revisionId, previousStoreRevisionHash: physical.headHash,
                ...(input.requestId ? { requestId: input.requestId } : {}), ...(input.note ? { note: input.note } : {}), createdAt: isoNow(),
            };
            const commitArtifactHash = await this.store.writeCommit(commit);
            const revision = { eventFormatVersion: EVENT_FORMAT_VERSION, revisionId: createId('rev'), scope, previousStoreRevisionId: physical.head.revisionId, previousStoreRevisionHash: physical.headHash, transactionId, committedArtifacts: [{ type: 'commit', id: commitId, hash: commitArtifactHash }], semanticTipNodeId: commitId, semanticTipStateHash: resultStateHash, createdAt: isoNow() };
            await this.store.writeRevision(revision);
            const result = { nodeId: commitId, stateHash: resultStateHash, state: nextState };
            await this.storage.setJson(materializedTipPath(scope), result);
            return result;
        });
    }
    async readLatestCommittedTransactionTip(scope) { const revision = await this.store.resolveStoreHead(scope); if (revision.status === 'empty')
        return null; if (revision.status !== 'ok' || !revision.head)
        throw new Error('STORE_HEAD_' + revision.status.toUpperCase()); return this.materializer.materialize(scope, revision.head.semanticTipNodeId); }
    async getProjectionForNode(scope, nodeId) { if (!await this.store.isNodeCommitted(scope, nodeId))
        throw new Error('NODE_NOT_COMMITTED'); const materialized = await this.materializer.materialize(scope, nodeId); const view = this.projections.get(LEGACY_PROJECTION_VERSION).build(materialized.state); return { nodeId: materialized.nodeId, stateHash: materialized.stateHash, view, viewHash: await canonicalHash(view) }; }
}
//# sourceMappingURL=state-service.js.map