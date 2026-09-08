import { MemoryJsonStorage } from '../../src/persistence/storage-port.js';
import { ModelPatchRejectedError, StateService } from '../../src/service/state-service.js';
import { createProjectionRegistry } from '../../src/shared/projection-registry.js';
import { createReducerRegistry } from '../../src/shared/reducer-registry.js';
import { buildModelPatchAuthorizationView, assertModelPatchAuthorization } from '../../src/shared/patch-policy.js';
import { extractLastJsonPatch, resolveContinueJsonPatchEvidence, resolveFinalJsonPatchEvidence } from '../../src/shared/model-output.js';
import { EventStore } from '../../src/persistence/event-store.js';

let passed = 0;
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error('ASSERT: ' + message); passed += 1; }

class CacheFailStorage extends MemoryJsonStorage {
  failMaterializedTip = false;
  override async setJson(path: string, value: unknown): Promise<void> {
    if (this.failMaterializedTip && path.endsWith('/indexes/materialized-tip.json')) throw new Error('simulated cache write failure');
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

  const liveGoldenOutput = `<UpdateVariable><UpdateAnalysis>State updated.</UpdateAnalysis><JSONPatch>[{"op":"replace","path":"/Narrative/Turn","value":1},{"op":"replace","path":"/World/Location/0","value":"Дорога у городка Вязовый Брод"},{"op":"replace","path":"/Mainchar/Outfit/Initialized","value":true},{"op":"add","path":"/Mainchar/Outfit/Worn/shlyapa","value":{"Name":"Большая нависающая колдовская шляпа","Type":"Clothing","Slot":"Head","Layer":"Base","Placement":"на голове","Color":"тёплый оливковый с жёлтым узором","Material":"плотный войлок","Appearance":"широкие поля нависают над лицом, по тулье вышитый жёлтый ветвистый узор","Condition":"целая, слегка потёртая от дороги","Arrangement":"надета, слегка сдвинута вперёд"}},{"op":"add","path":"/Mainchar/Outfit/Worn/plashch","value":{"Name":"Согревающий плащ-накидка","Type":"Clothing","Slot":"Torso","Layer":"Outerwear","Placement":"на плечах, до середины бедра","Color":"тёмно-синий с вышивкой созвездий","Material":"плотная шерсть с магической пропиткой","Appearance":"плотная дорожная накидка, вышитые серебристые созвездия","Condition":"добротная","Arrangement":"застёгнута у горла"}},{"op":"add","path":"/Mainchar/Outfit/Worn/platye","value":{"Name":"Дорожное платье","Type":"Clothing","Slot":"Torso","Layer":"Base","Placement":"корпус","Color":"тёмно-оливковый","Material":"лёгкая, но плотная дорожная ткань","Appearance":"простое практичное платье для дороги","Condition":"чистое, выношенное","Arrangement":"подпоясано широким кожаным ремнём"}},{"op":"add","path":"/Mainchar/Outfit/Worn/sapogi","value":{"Name":"Высокие чёрные кожаные сапоги","Type":"Clothing","Slot":"Feet","Layer":"Base","Placement":"ноги до середины бедра","Color":"чёрный","Material":"гладкая кожа","Appearance":"высокие, выше середины бедра","Condition":"ухоженные","Arrangement":"надеты поверх чулок"}},{"op":"add","path":"/Mainchar/Outfit/Worn/chulki_bandelety","value":{"Name":"Чулки и бандалетки","Type":"Clothing","Slot":"Legs","Layer":"Underwear","Placement":"ноги под сапогами","Color":"приглушённый","Material":"тонкая ткань","Appearance":"дорожные чулки и бандалетки","Condition":"целые","Arrangement":"под сапогами"}},{"op":"add","path":"/Mainchar/Inventory/sumka","value":{"Name":"Кожаная сумка через плечо","Type":"Bag","Qty":1,"Desc":"Прочная дорожная сумка, носится через плечо."}},{"op":"add","path":"/Mainchar/Inventory/zapisnaya_knizhka","value":{"Name":"Записная книжка в кожаном чехле","Type":"Item","Qty":1,"Desc":"Увесистая записная книжка; чехол крепится на ремень."}},{"op":"add","path":"/Mainchar/Inventory/sergi","value":{"Name":"Изумрудные серьги","Type":"Accessory","Qty":1,"Desc":"Бабушкин подарок; надеты."}},{"op":"add","path":"/Mainchar/Inventory/kulon","value":{"Name":"Золотой кулон-дуб с изумрудными листьями","Type":"Accessory","Qty":1,"Desc":"Надет на шее."}},{"op":"add","path":"/Mainchar/Inventory/mednye_monety","value":{"Name":"Медные монеты","Type":"Money","Qty":85,"Desc":"Монеты в мешочке."}},{"op":"add","path":"/Mainchar/Inventory/serebryanye_monety","value":{"Name":"Серебряные монеты","Type":"Money","Qty":15,"Desc":"Монеты в мешочке."}},{"op":"replace","path":"/Narrative/Scene/LocationKey","value":"doroga_u_vyazovogo_broda"},{"op":"replace","path":"/Narrative/Scene/Focus","value":"Утренняя дорога у городка Вязовый Брод: открытые ворота, доска объявлений, равнодушная стража"},{"op":"replace","path":"/Narrative/Scene/LastBeat","value":"Эвелин стоит на дороге перед открытыми воротами городка; утренняя жизнь идёт мимо, никто к ней не обращается, дорога открыта в обе стороны"}]</JSONPatch></UpdateVariable>`;

  const extracted = extractLastJsonPatch(liveGoldenOutput);
  assert(extracted?.operations.length === 17, 'exact live v0.5 JSONPatch is extracted');
  const canonicalStoredOutput = `<JSONPatch>${extracted!.canonicalPayload}</JSONPatch>`;
  const evidence = resolveFinalJsonPatchEvidence(liveGoldenOutput, canonicalStoredOutput);
  assert(evidence.selected?.canonicalPayload === extracted!.canonicalPayload, 'exact live raw wrapper matches canonical host-stored JSONPatch');
  let evidenceMismatch = false;
  try { resolveFinalJsonPatchEvidence(liveGoldenOutput, canonicalStoredOutput.replace('Дорога у городка Вязовый Брод', 'Другая дорога')); } catch { evidenceMismatch = true; }
  assert(evidenceMismatch, 'raw/stored semantic JSONPatch mismatch fails closed');

  const oldPatch = '<JSONPatch>[{"op":"replace","path":"/Narrative/Turn","value":1}]</JSONPatch>';
  const continuedNoPatch = resolveContinueJsonPatchEvidence(oldPatch, oldPatch + ' appended prose', oldPatch + ' appended prose');
  assert(continuedNoPatch.appendedSegment === ' appended prose' && continuedNoPatch.selected === null && continuedNoPatch.hostContentMode === 'full', 'Continue ignores pre-existing completed JSONPatch when suffix has no new patch');

  const continuedPatchPost = oldPatch + ' more prose <JSONPatch>[{"op":"replace","path":"/Narrative/Turn","value":2}]</JSONPatch>';
  const continuedPatch = resolveContinueJsonPatchEvidence(oldPatch, continuedPatchPost, continuedPatchPost);
  assert((continuedPatch.selected?.operations[0] as any)?.value === 2 && !continuedPatch.selectedCrossesBoundary, 'Continue selects only a newly completed suffix JSONPatch');

  const partial = '<UpdateVariable><JSONPatch>[{"op":"replace","path":"/Narrative/Turn","value":';
  const completed = partial + '3}]</JSONPatch></UpdateVariable>';
  const boundaryPatch = resolveContinueJsonPatchEvidence(partial, completed, completed);
  assert((boundaryPatch.selected?.operations[0] as any)?.value === 3 && boundaryPatch.selectedCrossesBoundary, 'Continue can complete a JSONPatch that started before the append boundary');

  const suffixModePost = oldPatch + ' tail';
  const suffixMode = resolveContinueJsonPatchEvidence(oldPatch, ' tail', suffixModePost);
  assert(suffixMode.hostContentMode === 'segment' && suffixMode.appendedSegment === ' tail', 'Continue accepts hosts that report only the appended segment');

  let continueMismatch = false;
  try { resolveContinueJsonPatchEvidence(oldPatch, 'different', suffixModePost); } catch { continueMismatch = true; }
  assert(continueMismatch, 'Continue lifecycle content mismatch fails closed');
  assertModelPatchAuthorization(genesis.state, extracted!.operations, authorization);

  const result = await state.finalizeModelAttempt(scope, {
    expectedParentNodeId: genesis.nodeId, expectedParentStateHash: genesis.stateHash,
    patch: extracted!.operations, authorization,
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
  const c2 = await store.readCommit(scope, result.systemCommitId!);
  assert(c2.note === 'projection-consumption' && c2.projectionBinding.sourceNodeId === result.modelCommitId, 'C2 binding points to pre-consumption P1/Vnext');

  const deliveredAfterC2 = await state.getProjectionForNode(scope, result.systemCommitId!);
  assert(deliveredAfterC2.sourceNodeId === result.modelCommitId && deliveredAfterC2.viewHash === result.nextPromptViewHash, 'restart from C2 reproduces Vnext');

  const refresh = await state.finalizeModelAttempt(scope, {
    expectedParentNodeId: result.systemCommitId!, expectedParentStateHash: result.stateHash, patch: null,
    authorization: buildModelPatchAuthorizationView(deliveredAfterC2.view),
    projectionVersion: deliveredAfterC2.projectionVersion, promptProtocolVersion: deliveredAfterC2.promptProtocolVersion,
    anchor: { messageId: 'a2', variantId: 'variant_2', generationId: 'g2', attemptId: 'attempt_2', messageRole: 'assistant', lineageAnchorId: 'variant_2' },
    requestId: 'attempt_2',
  });
  assert(refresh.status === 'no_patch' && refresh.modelCommitId === null && refresh.systemCommitId !== null, 'no_patch retires non-direct binding');
  const refreshCommit = await store.readCommit(scope, refresh.systemCommitId!);
  assert(refreshCommit.patch.length === 0 && refreshCommit.resultStateHash === refreshCommit.parentStateHash, 'projection-refresh keeps state bytes');
  assert(refreshCommit.projectionBinding.sourceNodeId === refresh.systemCommitId, 'projection-refresh is direct self-bound');

  const rejectedStorage = new MemoryJsonStorage();
  const rejectedState = new StateService(rejectedStorage, createReducerRegistry(), createProjectionRegistry());
  const rejectedScope = { userId: 'u', chatId: 'rejected-model-patch' };
  const rejectedGenesis = await rejectedState.createGenesis(rejectedScope);
  const rejectedFrozen = await rejectedState.getProjectionForNode(rejectedScope, rejectedGenesis.nodeId);
  let rejectedError: unknown = null;
  try {
    await rejectedState.finalizeModelAttempt(rejectedScope, {
      expectedParentNodeId: rejectedGenesis.nodeId,
      expectedParentStateHash: rejectedGenesis.stateHash,
      patch: [{ op: 'replace', path: '/Narrative/Turn/0', value: 1 }],
      authorization: buildModelPatchAuthorizationView(rejectedFrozen.view),
      projectionVersion: rejectedFrozen.projectionVersion,
      promptProtocolVersion: rejectedFrozen.promptProtocolVersion,
      anchor: { messageId: 'bad-a1', variantId: 'bad-v1', generationId: 'bad-g1', attemptId: 'bad-attempt-1', messageRole: 'assistant', lineageAnchorId: 'bad-v1' },
      requestId: 'bad-attempt-1',
    });
  } catch (error) { rejectedError = error; }
  const rejectedHead = await new EventStore(rejectedStorage).resolveStoreHead(rejectedScope);
  assert(rejectedError instanceof ModelPatchRejectedError && String(rejectedError).includes('Missing replace path: /Narrative/Turn/0'), 'invalid model JSONPatch is classified as a model rejection');
  assert(rejectedHead.status === 'ok' && rejectedHead.head?.semanticTipNodeId === rejectedGenesis.nodeId, 'rejected model JSONPatch writes no partial state or StoreRevision');

  const tupleCollisionStorage = new MemoryJsonStorage();
  const tupleCollisionState = new StateService(tupleCollisionStorage, createReducerRegistry(), createProjectionRegistry());
  const tupleCollisionScope = { userId: 'u', chatId: 'tuple-collision' };
  const tupleCollisionSeed = structuredClone(genesis.state);
  tupleCollisionSeed.Narrative.Scene.PresentNPCs = ['npc_0001', 'npc_0002'];
  tupleCollisionSeed.Narrative.Scene.Changed = false;
  const tupleCollisionGenesis = await tupleCollisionState.createGenesis(tupleCollisionScope, { state: tupleCollisionSeed });
  const tupleCollisionFrozen = await tupleCollisionState.getProjectionForNode(tupleCollisionScope, tupleCollisionGenesis.nodeId);
  const tupleCollisionResult = await tupleCollisionState.finalizeModelAttempt(tupleCollisionScope, {
    expectedParentNodeId: tupleCollisionGenesis.nodeId,
    expectedParentStateHash: tupleCollisionGenesis.stateHash,
    patch: [
      { op: 'replace', path: '/Narrative/Scene/PresentNPCs', value: ['npc_0002'] },
      { op: 'replace', path: '/World/Weather', value: 'Rain' },
    ],
    authorization: buildModelPatchAuthorizationView(tupleCollisionFrozen.view),
    projectionVersion: tupleCollisionFrozen.projectionVersion,
    promptProtocolVersion: tupleCollisionFrozen.promptProtocolVersion,
    anchor: { messageId: 'tuple-a1', variantId: 'tuple-v1', generationId: 'tuple-g1', attemptId: 'tuple-attempt-1', messageRole: 'assistant', lineageAnchorId: 'tuple-v1' },
    requestId: 'tuple-attempt-1',
  });
  assert(tupleCollisionResult.status === 'committed' && tupleCollisionResult.modelCommitId !== null, 'path-aware tuple collision model transaction commits');
  assert(JSON.stringify(tupleCollisionResult.state.Narrative.Scene.PresentNPCs) === JSON.stringify(['npc_0002']), 'ordinary string array is replaced as a whole value');
  assert(tupleCollisionResult.state.World.Weather[0] === 'Rain' && tupleCollisionResult.state.World.Weather[1] === 'Weather', 'real labeled tuple preserves its label');

  const tupleCollisionCommit = await new EventStore(tupleCollisionStorage).readCommit(tupleCollisionScope, tupleCollisionResult.modelCommitId!);
  assert(tupleCollisionCommit.patch.length === 3
    && tupleCollisionCommit.patch[0].op === 'remove'
    && tupleCollisionCommit.patch[0].path === '/Narrative/Scene/PresentNPCs'
    && tupleCollisionCommit.patch[1].op === 'add'
    && tupleCollisionCommit.patch[1].path === '/Narrative/Scene/PresentNPCs'
    && tupleCollisionCommit.patch[2].op === 'replace'
    && tupleCollisionCommit.patch[2].path === '/World/Weather/0', 'stored canonical patch distinguishes ordinary arrays from known labeled tuples');

  const restartedTupleCollisionState = new StateService(tupleCollisionStorage, createReducerRegistry(), createProjectionRegistry());
  const replayedTupleCollision = await restartedTupleCollisionState.materializer.materialize(tupleCollisionScope, tupleCollisionResult.nodeId);
  assert(replayedTupleCollision.stateHash === tupleCollisionResult.stateHash
    && JSON.stringify(replayedTupleCollision.state.Narrative.Scene.PresentNPCs) === JSON.stringify(['npc_0002'])
    && replayedTupleCollision.state.World.Weather[0] === 'Rain', 'stored R3 canonical patch replays identically after restart under legacy reducer semantics');

  const hphStorage = new MemoryJsonStorage();
  const hphState = new StateService(hphStorage, createReducerRegistry(), createProjectionRegistry());
  const hphScope = { userId: 'u', chatId: 'hph-structural-parent' };
  const hphGenesis = await hphState.createGenesis(hphScope);
  assert(!Object.prototype.hasOwnProperty.call(hphGenesis.state.Narrative.Scene, 'HPH'), 'legacy reducer/default remains byte-compatible and does not pre-initialize HPH');
  const hphFrozen = await hphState.getProjectionForNode(hphScope, hphGenesis.nodeId);
  const hphOwner = {
    Physiology: {
      Bladder: 0, Arousal: 0, SemenMl: null, SemenCapacityMl: null,
      ErectionCapacity: 10, LastPhysAt: { Date: '1 июня', Time: '06:00' },
    },
    Penis: null,
    Scrotum: null,
    Sex: null,
  };
  const hphResult = await hphState.finalizeModelAttempt(hphScope, {
    expectedParentNodeId: hphGenesis.nodeId,
    expectedParentStateHash: hphGenesis.stateHash,
    patch: [{ op: 'add', path: '/Narrative/Scene/HPH/player', value: hphOwner }],
    authorization: buildModelPatchAuthorizationView(hphFrozen.view),
    projectionVersion: hphFrozen.projectionVersion,
    promptProtocolVersion: hphFrozen.promptProtocolVersion,
    anchor: { messageId: 'hph-a1', variantId: 'hph-v1', generationId: 'hph-g1', attemptId: 'hph-attempt-1', messageRole: 'assistant', lineageAnchorId: 'hph-v1' },
    requestId: 'hph-attempt-1',
    rawPatchPayloadHash: 'raw-hph-child-only',
  });
  assert(Boolean((hphResult.state.Narrative.Scene.HPH as any)?.player), 'first HPH owner add succeeds even when legacy state lacks the HPH container');
  const hphCommit = await new EventStore(hphStorage).readCommit(hphScope, hphResult.modelCommitId!);
  assert(hphCommit.patch.length === 2
    && hphCommit.patch[0].op === 'add'
    && hphCommit.patch[0].path === '/Narrative/Scene/HPH'
    && hphCommit.patch[1].path === '/Narrative/Scene/HPH/player', 'canonical model commit prepends exactly one structural HPH parent');
  assert(hphCommit.rawPatchPayloadHash === 'raw-hph-child-only', 'raw model patch evidence remains distinct from structural canonicalization');

  const explicitHphStorage = new MemoryJsonStorage();
  const explicitHphState = new StateService(explicitHphStorage, createReducerRegistry(), createProjectionRegistry());
  const explicitHphScope = { userId: 'u', chatId: 'hph-explicit-parent' };
  const explicitHphGenesis = await explicitHphState.createGenesis(explicitHphScope);
  const explicitHphFrozen = await explicitHphState.getProjectionForNode(explicitHphScope, explicitHphGenesis.nodeId);
  const explicitHphResult = await explicitHphState.finalizeModelAttempt(explicitHphScope, {
    expectedParentNodeId: explicitHphGenesis.nodeId,
    expectedParentStateHash: explicitHphGenesis.stateHash,
    patch: [{ op: 'add', path: '/Narrative/Scene/HPH', value: { player: hphOwner } }],
    authorization: buildModelPatchAuthorizationView(explicitHphFrozen.view),
    projectionVersion: explicitHphFrozen.projectionVersion,
    promptProtocolVersion: explicitHphFrozen.promptProtocolVersion,
    anchor: { messageId: 'hph-a2', variantId: 'hph-v2', generationId: 'hph-g2', attemptId: 'hph-attempt-2', messageRole: 'assistant', lineageAnchorId: 'hph-v2' },
    requestId: 'hph-attempt-2',
  });
  const explicitHphCommit = await new EventStore(explicitHphStorage).readCommit(explicitHphScope, explicitHphResult.modelCommitId!);
  assert(explicitHphCommit.patch.length === 1 && explicitHphCommit.patch[0].path === '/Narrative/Scene/HPH', 'backend does not duplicate a parent the model already created correctly');

  let denied = false;
  try {
    assertModelPatchAuthorization(genesis.state, [
      { op: 'add', path: '/Narrative/NPCs/npc_0002', value: { DisplayName: 'wrong id' } },
      { op: 'replace', path: '/Narrative/NextNpcId', value: 3 },
    ], authorization);
  } catch { denied = true; }
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
