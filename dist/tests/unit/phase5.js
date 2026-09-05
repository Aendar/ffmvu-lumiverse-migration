import { MemoryJsonStorage } from '../../src/persistence/storage-port.js';
import { StateService } from '../../src/service/state-service.js';
import { createProjectionRegistry } from '../../src/shared/projection-registry.js';
import { createReducerRegistry } from '../../src/shared/reducer-registry.js';
import { buildModelPatchAuthorizationView, assertModelPatchAuthorization } from '../../src/shared/patch-policy.js';
import { extractLastJsonPatch, resolveFinalJsonPatchEvidence } from '../../src/shared/model-output.js';
import { EventStore } from '../../src/persistence/event-store.js';
let passed = 0;
function assert(value, message) { if (!value)
    throw new Error('ASSERT: ' + message); passed += 1; }
class CacheFailStorage extends MemoryJsonStorage {
    failMaterializedTip = false;
    async setJson(path, value) {
        if (this.failMaterializedTip && path.endsWith('/indexes/materialized-tip.json'))
            throw new Error('simulated cache write failure');
        await super.setJson(path, value);
    }
}
async function main() {
    const storage = new MemoryJsonStorage();
    const state = new StateService(storage, createReducerRegistry(), createProjectionRegistry());
    const scope = { userId: 'u', chatId: 'c' };
    const genesis = await state.createGenesis(scope);
    const frozen = await state.getProjectionForNode(scope, genesis.nodeId);
    const authorization = buildModelPatchAuthorizationView(frozen.view);
    const liveShapeOutput = `<gametxt>fixture</gametxt>
<JSONPatch>
[
  {"op":"replace","path":"/World/Time/0","value":"09:17"},
  {"op":"add","path":"/World_Calc/Locations/market_square","value":{"Status":"active","Summary":"live fixture shape"}},
  {"op":"add","path":"/Mainchar/Outfit/Worn/travel_cloak","value":{"Name":"Travel Cloak","Type":"Clothing","Slot":"Torso","Layer":"Outerwear","Color":"brown","Material":"wool","Appearance":"","Condition":"good","Arrangement":"worn"}},
  {"op":"add","path":"/Narrative/NPCs/npc_0001","value":{"DisplayName":"Evelyn","Location":"market_square","Status":"active","IsPresent":true}},
  {"op":"replace","path":"/Narrative/NextNpcId","value":2},
  {"op":"replace","path":"/Narrative/Scene/LocationKey","value":"market_square"},
  {"op":"replace","path":"/Narrative/Scene/Changed","value":true}
]
</JSONPatch>`;
    const extracted = extractLastJsonPatch(liveShapeOutput);
    assert(extracted?.operations.length === 7, 'last model JSONPatch is extracted');
    const evidence = resolveFinalJsonPatchEvidence(liveShapeOutput, liveShapeOutput.replace(/\n\s+/g, '\n'));
    assert(evidence.selected?.canonicalPayload === extracted.canonicalPayload, 'raw/stored JSONPatch evidence tolerates serialization whitespace only');
    let evidenceMismatch = false;
    try {
        resolveFinalJsonPatchEvidence(liveShapeOutput, liveShapeOutput.replace('"09:17"', '"09:18"'));
    }
    catch {
        evidenceMismatch = true;
    }
    assert(evidenceMismatch, 'raw/stored semantic JSONPatch mismatch fails closed');
    assertModelPatchAuthorization(genesis.state, extracted.operations, authorization);
    const result = await state.finalizeModelAttempt(scope, {
        expectedParentNodeId: genesis.nodeId, expectedParentStateHash: genesis.stateHash,
        patch: extracted.operations, authorization,
        projectionVersion: frozen.projectionVersion, promptProtocolVersion: frozen.promptProtocolVersion,
        anchor: { messageId: 'a1', variantId: 'variant_1', generationId: 'g1', attemptId: 'attempt_1', messageRole: 'assistant', lineageAnchorId: 'variant_1' },
        requestId: 'attempt_1', rawGenerationHash: 'raw-generation', rawPatchPayloadHash: 'raw-patch',
        storedMessageTextHash: 'stored-message', presetVersion: 'FF5.2_MAX_MVU_v0.4.7.3 · Loom 69 Parity',
    });
    assert(result.status === 'committed' && result.modelCommitId !== null, 'model P1 is created');
    assert(result.systemCommitId !== null && result.committedNodeIds.length === 2, 'Scene.Changed consumption creates C2 in same finalize');
    assert(result.state.Narrative.Scene.Changed === false, 'C2 consumes Scene.Changed after Vnext');
    const store = new EventStore(storage);
    const physical = await store.resolveStoreHead(scope);
    assert(physical.status === 'ok' && physical.head?.committedArtifacts.length === 2, 'one ChatStoreRevision commits P1 + C2');
    const c2 = await store.readCommit(scope, result.systemCommitId);
    assert(c2.note === 'projection-consumption' && c2.projectionBinding.sourceNodeId === result.modelCommitId, 'C2 binding points to pre-consumption P1/Vnext');
    const deliveredAfterC2 = await state.getProjectionForNode(scope, result.systemCommitId);
    assert(deliveredAfterC2.sourceNodeId === result.modelCommitId && deliveredAfterC2.viewHash === result.nextPromptViewHash, 'restart from C2 reproduces Vnext');
    const refresh = await state.finalizeModelAttempt(scope, {
        expectedParentNodeId: result.systemCommitId, expectedParentStateHash: result.stateHash, patch: null,
        authorization: buildModelPatchAuthorizationView(deliveredAfterC2.view),
        projectionVersion: deliveredAfterC2.projectionVersion, promptProtocolVersion: deliveredAfterC2.promptProtocolVersion,
        anchor: { messageId: 'a2', variantId: 'variant_2', generationId: 'g2', attemptId: 'attempt_2', messageRole: 'assistant', lineageAnchorId: 'variant_2' },
        requestId: 'attempt_2',
    });
    assert(refresh.status === 'no_patch' && refresh.modelCommitId === null && refresh.systemCommitId !== null, 'no_patch retires non-direct binding');
    const refreshCommit = await store.readCommit(scope, refresh.systemCommitId);
    assert(refreshCommit.patch.length === 0 && refreshCommit.resultStateHash === refreshCommit.parentStateHash, 'projection-refresh keeps state bytes');
    assert(refreshCommit.projectionBinding.sourceNodeId === refresh.systemCommitId, 'projection-refresh is direct self-bound');
    let denied = false;
    try {
        assertModelPatchAuthorization(genesis.state, [
            { op: 'add', path: '/Narrative/NPCs/npc_0002', value: { DisplayName: 'wrong id' } },
            { op: 'replace', path: '/Narrative/NextNpcId', value: 3 },
        ], authorization);
    }
    catch {
        denied = true;
    }
    assert(denied, 'frozen authorization rejects non-contiguous new NPC identity');
    const flakyStorage = new CacheFailStorage();
    const flakyState = new StateService(flakyStorage, createReducerRegistry(), createProjectionRegistry());
    const flakyScope = { userId: 'u', chatId: 'cache-fault' };
    const flakyGenesis = await flakyState.createGenesis(flakyScope);
    const flakyFrozen = await flakyState.getProjectionForNode(flakyScope, flakyGenesis.nodeId);
    flakyStorage.failMaterializedTip = true;
    const cacheFaultCommit = await flakyState.finalizeModelAttempt(flakyScope, {
        expectedParentNodeId: flakyGenesis.nodeId,
        expectedParentStateHash: flakyGenesis.stateHash,
        patch: [{ op: 'replace', path: '/World/Time/0', value: '09:30' }],
        authorization: buildModelPatchAuthorizationView(flakyFrozen.view),
        projectionVersion: flakyFrozen.projectionVersion,
        promptProtocolVersion: flakyFrozen.promptProtocolVersion,
        anchor: { messageId: 'a-cache', variantId: 'variant_cache', generationId: 'g-cache', attemptId: 'attempt_cache', messageRole: 'assistant', lineageAnchorId: 'variant_cache' },
        requestId: 'attempt_cache',
    });
    const cacheFaultHead = await new EventStore(flakyStorage).resolveStoreHead(flakyScope);
    assert(cacheFaultCommit.status === 'committed' && cacheFaultHead.status === 'ok' && cacheFaultHead.head?.semanticTipNodeId === cacheFaultCommit.nodeId, 'materialized cache failure cannot roll back or relabel a durable StoreRevision');
    console.log(`phase5 model commit tests passed: ${passed}`);
}
main();
//# sourceMappingURL=phase5.js.map