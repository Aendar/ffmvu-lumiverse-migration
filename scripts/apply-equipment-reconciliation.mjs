import fs from 'node:fs';

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, text) { fs.writeFileSync(file, text); }
function count(haystack, needle) { return haystack.split(needle).length - 1; }
function replaceExact(file, from, to, expected = 1) {
  const text = read(file);
  const found = count(text, from);
  if (found !== expected) throw new Error(`${file}: expected ${expected} exact matches, found ${found}`);
  write(file, text.split(from).join(to));
}
function replaceBetween(file, startMarker, endMarker, replacement) {
  const text = read(file);
  const start = text.indexOf(startMarker);
  if (start < 0) throw new Error(`${file}: missing start marker`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`${file}: missing end marker`);
  write(file, text.slice(0, start) + replacement + text.slice(end));
}

const file = 'src/service/state-service.ts';
replaceExact(
  file,
  "import { applyGuiIntent, buildGuiIntentPatch, buildStatePatch, type GuiIntent } from '../shared/domain/gui-intents.js';\n",
  "import { applyGuiIntent, buildGuiIntentPatch, buildStatePatch, type GuiIntent } from '../shared/domain/gui-intents.js';\nimport { reconcileModelEquipmentState } from '../shared/domain/equipment-reconciliation.js';\nimport { EQUIPMENT_RECONCILIATION_VERSION } from '../shared/domain/equipment-rules.js';\n",
);

const method = `  async finalizeModelAttempt(scope: StateScope, input: FinalizeModelAttemptInput): Promise<FinalizeModelAttemptResult> {
    return this.mutex.run(scope, async () => {
      const physical = await this.store.resolveStoreHead(scope);
      if (physical.status !== 'ok' || !physical.head || !physical.headHash) throw new Error('STORE_NOT_WRITABLE: ' + physical.status);
      if (!await this.store.isNodeCommitted(scope, input.expectedParentNodeId)) throw new Error('PARENT_NOT_COMMITTED');

      const parentArtifact = await this.store.readNode(scope, input.expectedParentNodeId);
      const parent = await this.materializer.materialize(scope, input.expectedParentNodeId);
      if (parent.stateHash !== input.expectedParentStateHash) throw new Error('MODEL_COMMIT_CONFLICT: frozen parent state hash mismatch');
      const reducer = this.reducers.get(parentArtifact.value.reducerVersion);

      const rawPatch = input.patch ?? [];
      let canonicalPatch: JsonPatchOperation[] = [];
      let workingState = structuredClone(parent.state);
      let hasModelPatch = false;
      let canonicalPatchHash: string | undefined;
      let r1State: FFMVUState;
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
        if (r1Errors.length) throw new Error('Invalid model commit result: ' + r1Errors.join('; '));
      } catch (error) {
        throw new ModelPatchRejectedError(String(error));
      }

      const r1StateHash = hasModelPatch ? await canonicalHash(r1State) : parent.stateHash;
      const modelCommitId = hasModelPatch ? createId('node') : null;
      const r1NodeId = modelCommitId ?? parent.nodeId;
      const projectionImplementation = this.projections.get(input.projectionVersion);
      const r1Projection = projectionImplementation.build(r1State);
      const r1PromptViewHash = await canonicalHash(r1Projection);

      let reconciledState = r1State;
      let reconciledStateHash = r1StateHash;
      let reconciliationPatch: JsonPatchOperation[] = [];
      let reconciliationCommitId: string | null = null;
      if (hasModelPatch && parentArtifact.value.reducerVersion === CURRENT_REDUCER_VERSION) {
        try {
          const candidate = reducer.normalize(reconcileModelEquipmentState(parent.state, r1State, canonicalPatch));
          const errors = reducer.validate(candidate);
          if (errors.length) throw new Error('Invalid equipment reconciliation result: ' + errors.join('; '));
          reconciliationPatch = buildStatePatch(r1State, candidate);
          assertPatchResourceLimits(reconciliationPatch);
          if (reconciliationPatch.length) {
            reconciledState = candidate;
            reconciledStateHash = await canonicalHash(candidate);
            reconciliationCommitId = createId('node');
          }
        } catch (error) {
          throw new ModelPatchRejectedError('EQUIPMENT_RECONCILIATION_FAILED: ' + String(error));
        }
      }

      const preConsumptionNodeId = reconciliationCommitId ?? r1NodeId;
      const preConsumptionState = reconciledState;
      const preConsumptionStateHash = reconciledStateHash;
      const nextProjection = projectionImplementation.build(preConsumptionState);
      const nextPromptViewHash = await canonicalHash(nextProjection);
      const transactionId = createId('tx');
      const commits: StateCommit[] = [];

      if (modelCommitId) {
        commits.push({
          eventFormatVersion: EVENT_FORMAT_VERSION, id: modelCommitId, scope, kind: 'model',
          anchor: structuredClone(input.anchor), parentNodeId: parent.nodeId, parentStateHash: parent.stateHash,
          patch: structuredClone(canonicalPatch), patchHash: canonicalPatchHash!, reducerVersion: parentArtifact.value.reducerVersion, resultStateHash: r1StateHash,
          projectionBinding: { sourceKind: 'node', sourceNodeId: modelCommitId, sourceStateHash: r1StateHash, projectionVersion: input.projectionVersion, promptProtocolVersion: input.promptProtocolVersion, promptViewHash: r1PromptViewHash },
          transactionId, previousStoreRevisionId: physical.head.revisionId, previousStoreRevisionHash: physical.headHash, requestId: input.requestId,
          ...(input.rawGenerationHash ? { rawGenerationHash: input.rawGenerationHash } : {}),
          ...(input.rawPatchPayloadHash ? { rawPatchPayloadHash: input.rawPatchPayloadHash } : {}),
          ...(input.storedMessageTextHash ? { storedMessageTextHash: input.storedMessageTextHash } : {}),
          ...(input.presetVersion ? { presetVersion: input.presetVersion } : {}),
          createdAt: isoNow(),
        });
      }

      if (reconciliationCommitId) {
        commits.push({
          eventFormatVersion: EVENT_FORMAT_VERSION, id: reconciliationCommitId, scope, kind: 'system',
          anchor: structuredClone(input.anchor), parentNodeId: r1NodeId, parentStateHash: r1StateHash,
          patch: structuredClone(reconciliationPatch), patchHash: await canonicalHash(reconciliationPatch), reducerVersion: parentArtifact.value.reducerVersion, resultStateHash: reconciledStateHash,
          projectionBinding: { sourceKind: 'node', sourceNodeId: reconciliationCommitId, sourceStateHash: reconciledStateHash, projectionVersion: input.projectionVersion, promptProtocolVersion: input.promptProtocolVersion, promptViewHash: nextPromptViewHash },
          transactionId, previousStoreRevisionId: physical.head.revisionId, previousStoreRevisionHash: physical.headHash, requestId: input.requestId,
          note: EQUIPMENT_RECONCILIATION_VERSION, createdAt: isoNow(),
        });
      }

      const consumptionPatch = computeProjectionConsumptionPatchForReducer(
        parentArtifact.value.reducerVersion,
        preConsumptionState,
        nextProjection,
      );
      let finalNodeId = preConsumptionNodeId;
      let finalStateHash = preConsumptionStateHash;
      let finalState = preConsumptionState;
      let systemCommitId: string | null = reconciliationCommitId;

      if (consumptionPatch.length) {
        const consumedState = reducer.normalize(applyJsonPatch(preConsumptionState, consumptionPatch));
        const errors = reducer.validate(consumedState);
        if (errors.length) throw new Error('Invalid projection consumption result: ' + errors.join('; '));
        const consumedStateHash = await canonicalHash(consumedState);
        systemCommitId = createId('node');
        commits.push({
          eventFormatVersion: EVENT_FORMAT_VERSION, id: systemCommitId, scope, kind: 'system',
          anchor: structuredClone(input.anchor), parentNodeId: preConsumptionNodeId, parentStateHash: preConsumptionStateHash,
          patch: structuredClone(consumptionPatch), patchHash: await canonicalHash(consumptionPatch), reducerVersion: parentArtifact.value.reducerVersion, resultStateHash: consumedStateHash,
          projectionBinding: { sourceKind: 'node', sourceNodeId: preConsumptionNodeId, sourceStateHash: preConsumptionStateHash, projectionVersion: input.projectionVersion, promptProtocolVersion: input.promptProtocolVersion, promptViewHash: nextPromptViewHash },
          transactionId, previousStoreRevisionId: physical.head.revisionId, previousStoreRevisionHash: physical.headHash, requestId: input.requestId,
          note: 'projection-consumption', createdAt: isoNow(),
        });
        finalNodeId = systemCommitId;
        finalStateHash = consumedStateHash;
        finalState = consumedState;
      } else if (!modelCommitId) {
        const binding = parentArtifact.value.projectionBinding;
        const directMatches =
          binding.sourceKind === 'node' && binding.sourceNodeId === parent.nodeId && binding.sourceStateHash === parent.stateHash &&
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
        const committedArtifacts: ChatStoreRevision['committedArtifacts'] = [];
        for (const commit of commits) {
          const artifactHash = await this.store.writeCommit(commit);
          committedArtifacts.push({ type: 'commit', id: commit.id, hash: artifactHash });
        }
        await this.store.writeRevision({
          eventFormatVersion: EVENT_FORMAT_VERSION, revisionId: createId('rev'), scope,
          previousStoreRevisionId: physical.head.revisionId, previousStoreRevisionHash: physical.headHash,
          transactionId, committedArtifacts, semanticTipNodeId: finalNodeId, semanticTipStateHash: finalStateHash, createdAt: isoNow(),
        });
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

`;

replaceBetween(
  file,
  '  async finalizeModelAttempt(scope: StateScope, input: FinalizeModelAttemptInput): Promise<FinalizeModelAttemptResult> {',
  '  async readLatestCommittedTransactionTip(',
  method,
);

console.log('Applied atomic equipment reconciliation to StateService.');
