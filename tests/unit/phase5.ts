import { MemoryJsonStorage } from '../../src/persistence/storage-port.js';
import { StateService } from '../../src/service/state-service.js';
import { createProjectionRegistry } from '../../src/shared/projection-registry.js';
import { createReducerRegistry } from '../../src/shared/reducer-registry.js';
import { buildModelPatchAuthorizationView, assertModelPatchAuthorization } from '../../src/shared/patch-policy.js';
import { extractLastJsonPatch, resolveFinalJsonPatchEvidence } from '../../src/shared/model-output.js';
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
