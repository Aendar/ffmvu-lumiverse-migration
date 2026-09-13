import { StateService } from '../../src/service/state-service.js';
import { MemoryJsonStorage } from '../../src/persistence/storage-port.js';
import { createProjectionRegistry } from '../../src/shared/projection-registry.js';
import { createReducerRegistry } from '../../src/shared/reducer-registry.js';
import { createDefaultState } from '../../src/shared/state-defaults.js';
import { buildModelPatchAuthorizationView } from '../../src/shared/patch-policy.js';
import { ACTIVE_PREFIX_FINGERPRINT_VERSION, type StateScope } from '../../src/persistence/types.js';
import { V160_PROJECTION_VERSION, V160_REDUCER_VERSION } from '../../src/shared/state-schema.js';

let passed = 0;
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error('ASSERT: ' + message); passed += 1; }

async function main() {
  const storage = new MemoryJsonStorage();
  const service = new StateService(storage, createReducerRegistry(), createProjectionRegistry());
  const source: StateScope = { userId: 'u', chatId: 'source' };

  const imported = await service.importLegacyState(source, {
    stat_data: {
      ...createDefaultState(),
      World: { ...createDefaultState().World, Time: ['11:00', 'Time'], Location: ['Дервендег', 'Location'] },
      Narrative: { ...createDefaultState().Narrative, Turn: 115 },
      GameStarted: true,
    },
    ff_mvu_prompt_view: {
      Version: 'FFMVU-1.5.8',
      World: { Time: ['10:55', 'Time'] },
      Marker: 'legacy-exact-projection',
    },
    ff_mvu_snapshot_meta: { Turn: 115, LegacyHash: 'deadbeef' },
  });
  assert(imported.state.Narrative.Turn === 115 && imported.state.World.Time[0] === '11:00', 'legacy import takes authoritative state from stat_data');
  const importedProjection = await service.getProjectionForNode(source, imported.nodeId);
  assert(importedProjection.sourceKind === 'base-seed' && importedProjection.view.Marker === 'legacy-exact-projection', 'legacy ff_mvu_prompt_view is used only as exact first-turn projection seed');

  const automaticScope: StateScope = { userId: 'u', chatId: 'automatic-schema-upgrade' };
  const automaticLegacy = await service.importLegacyState(automaticScope, {
    stat_data: { ...createDefaultState(), MVUStatMenu_DB_Ver: 'FFMVU-1.5.8', GameStarted: true },
  });
  const automatic = await service.autoMigrateLegacyState(automaticScope, {
    parentNodeId: automaticLegacy.nodeId,
    expectedParentStateHash: automaticLegacy.stateHash,
    anchor: { lineageAnchorId: 'root' },
    requestId: 'automatic-schema-upgrade',
  });
  const automaticNode = await service.store.readNode(automaticScope, automatic.nodeId);
  assert(
    automaticNode.type === 'commit' && automaticNode.value.kind === 'migration'
      && automaticNode.value.note === 'automatic-schema-upgrade-v1.7'
      && automaticNode.value.reducerVersion === 'FFMVU-1.7.0'
      && automatic.state.MVUStatMenu_DB_Ver === 'FFMVU-1.7.0'
      && !('Mental_state' in automatic.state.Mainchar) && !('Chekhov' in automatic.state.Narrative)
      && automatic.state.Mainchar.Physiology.LastPhysAt.Time === '08:00',
    'legacy schema upgrade is deterministic and requires no user-supplied migration draft',
  );

  const checkpointScope: StateScope = { userId: 'u', chatId: 'legacy-checkpoint-existing' };
  const checkpointLegacy = await service.importLegacyState(checkpointScope, {
    stat_data: { ...createDefaultState(), MVUStatMenu_DB_Ver: 'FFMVU-1.5.8', GameStarted: true },
  });
  const checkpointOldRoot = await service.anchors.readRoot(checkpointScope);
  const checkpointBoundary = {
    throughMessageId: 'existing-chat-last-message',
    activePrefixHash: 'existing-chat-prefix-hash',
    fingerprintVersion: ACTIVE_PREFIX_FINGERPRINT_VERSION,
  };
  const stagedMigration = await service.stageLegacyMigrationCheckpoint(checkpointScope, {
    parentNodeId: checkpointLegacy.nodeId,
    expectedParentStateHash: checkpointLegacy.stateHash,
    transcriptBoundary: checkpointBoundary,
    requestId: 'checkpoint-migration-test',
  });
  const checkpointRootBeforeBind = await service.anchors.readRoot(checkpointScope);
  const stagedMigrationNode = await service.store.readNode(checkpointScope, stagedMigration.nodeId);
  const stagedMigrationPhysical = await service.store.resolveStoreHead(checkpointScope);
  assert(
    checkpointOldRoot?.baseNodeId === checkpointLegacy.nodeId &&
    checkpointRootBeforeBind?.baseNodeId === checkpointLegacy.nodeId,
    'staged schema checkpoint does not replace semantic RootAnchor before backend race checks',
  );
  assert(
    stagedMigrationNode.type === 'base' &&
    stagedMigrationNode.value.kind === 'fork' &&
    stagedMigrationNode.value.reducerVersion === 'FFMVU-1.7.0' &&
    stagedMigrationNode.value.transcriptBoundary?.throughMessageId === checkpointBoundary.throughMessageId &&
    stagedMigrationNode.value.provenance?.source === 'schema-migration-checkpoint' &&
    stagedMigration.state.MVUStatMenu_DB_Ver === 'FFMVU-1.7.0' &&
    !('Mental_state' in stagedMigration.state.Mainchar) &&
    !('Chekhov' in stagedMigration.state.Narrative),
    'legacy checkpoint stages deterministic current-schema authority without preserving retired fields',
  );
  assert(
    stagedMigrationPhysical.status === 'ok' &&
    stagedMigrationPhysical.head?.semanticTipNodeId === stagedMigration.nodeId,
    'staged checkpoint appends to the existing physical StoreRevision chain without ambiguity',
  );
  await service.anchors.putRoot({
    anchorId: 'root',
    scope: checkpointScope,
    baseNodeId: stagedMigration.nodeId,
    tipNodeId: stagedMigration.nodeId,
    updatedAt: 'checkpoint-test',
  });
  const checkpointRootAfterBind = await service.anchors.readRoot(checkpointScope);
  assert(
    checkpointRootAfterBind?.baseNodeId === stagedMigration.nodeId &&
    checkpointRootAfterBind.tipNodeId === stagedMigration.nodeId,
    'checkpoint becomes semantic root only after explicit binding',
  );

  const legacyPortable = await service.exportPortableSnapshot(automaticScope, automaticLegacy.nodeId);
  assert(legacyPortable.reducerVersion === 'FFMVU-1.5.8', 'legacy portable fixture preserves source reducer version');
  const restoreScope: StateScope = { userId: 'u', chatId: 'portable-restore-existing' };
  const restoreBefore = await service.createGenesis(restoreScope, {
    state: { ...createDefaultState(), Narrative: { ...createDefaultState().Narrative, Turn: 999 } },
  });
  const restoreOldRoot = await service.anchors.readRoot(restoreScope);
  const stagedRestore = await service.stagePortableSnapshotCheckpoint(
    restoreScope,
    legacyPortable,
    checkpointBoundary,
    'portable-restore-test',
  );
  const restoreRootBeforeBind = await service.anchors.readRoot(restoreScope);
  const stagedRestoreNode = await service.store.readNode(restoreScope, stagedRestore.nodeId);
  assert(
    restoreOldRoot?.baseNodeId === restoreBefore.nodeId &&
    restoreRootBeforeBind?.baseNodeId === restoreBefore.nodeId,
    'in-place portable restore leaves existing semantic root untouched until binding',
  );
  assert(
    stagedRestoreNode.type === 'base' &&
    stagedRestoreNode.value.reducerVersion === 'FFMVU-1.7.0' &&
    stagedRestoreNode.value.provenance?.source === 'portable-snapshot-checkpoint' &&
    stagedRestoreNode.value.provenance?.sourceSnapshotHash === legacyPortable.snapshotHash &&
    stagedRestoreNode.value.provenance?.sourceStateHash === legacyPortable.stateHash &&
    stagedRestore.state.MVUStatMenu_DB_Ver === 'FFMVU-1.7.0' &&
    !('Mental_state' in stagedRestore.state.Mainchar) &&
    !('Chekhov' in stagedRestore.state.Narrative),
    'legacy portable restore verifies original snapshot then stages migrated v1.7 state with original hashes in provenance',
  );

  const v160Scope: StateScope = { userId: 'u', chatId: 'v160-physiology-cleanup' };
  const v160State = createDefaultState();
  delete (v160State.Mainchar as Record<string, unknown>).Physiology;
  v160State.Familiar.evelyn = {
    Name: ['Эвелин', 'Name'],
    Hair_Style: ['длинные чёрные волосы, коса', 'Hair Style'],
    Personality: ['сдержанная', 'Personality'],
    Physical_Features: ['высокая', 'Physical Feature'],
    ExSkill: ['магия', 'Ex Skill'],
    Bio: ['устаревший профиль', 'Bio'],
    Biography: ['дубликат', 'Biography'],
  };
  (v160State.Narrative.Scene as any).HPH = {
    player: {
      Physiology: {
        ErectionCapacity: 10, ErectionLevel: 8, Bladder: 5, Arousal: 7,
        SemenMl: 12, SemenCapacityMl: 20, LastPhysAt: { Date: '1 июня', Time: '06:00' },
      },
      Penis: { LengthCm: 24, GirthCm: 17, Position: 'supported', ErectionLevel: 8 },
      Scrotum: { Position: 'between thighs' },
      Sex: { Active: true },
    },
  };
  const v160Base = await service.createGenesis(v160Scope, {
    state: v160State,
    reducerVersion: V160_REDUCER_VERSION,
    projectionVersion: V160_PROJECTION_VERSION,
  });
  const v170 = await service.autoMigrateLegacyState(v160Scope, {
    parentNodeId: v160Base.nodeId,
    expectedParentStateHash: v160Base.stateHash,
    anchor: { lineageAnchorId: 'root' },
    requestId: 'v160-physiology-cleanup',
  });
  const migratedFamiliar = v170.state.Familiar.evelyn as Record<string, unknown>;
  const migratedHph = (v170.state.Narrative.Scene.HPH as Record<string, any>).player;
  assert(
    v170.state.Mainchar.Physiology.Hunger === 0 &&
      v170.state.Mainchar.Physiology.Bladder === 5 && v170.state.Mainchar.Physiology.Arousal === 7 &&
      v170.state.Mainchar.Physiology.LastPhysAt.Time === '06:00' &&
      v170.state.Mainchar.Physiology.Reproductive?.SemenMl === 12 &&
      v170.state.Mainchar.Physiology.Reproductive?.SemenCapacityMl === 20 &&
      (migratedFamiliar.Physiology as any).Thirst === 0 &&
      !('Hair_Style' in migratedFamiliar) && !('Personality' in migratedFamiliar) &&
      !('Physical_Features' in migratedFamiliar) && !('ExSkill' in migratedFamiliar) &&
      !('Bio' in migratedFamiliar) && !('Biography' in migratedFamiliar) &&
      !('CurrentHairstyle' in migratedFamiliar) &&
      migratedHph.Physiology === undefined && migratedHph.ErectionCapacity === undefined && migratedHph.ErectionLevel === undefined &&
      migratedHph.Penis.LengthCm === 24 && migratedHph.Penis.ErectionLevel === undefined &&
      migratedHph.Scrotum.Position === 'between thighs' && migratedHph.Sex.Active === true,
    'v1.6 migration moves physiology to persistent actors, removes redundant familiar profile fields without guessing a hairstyle, and preserves only HPH geometry',
  );

  const source2: StateScope = { userId: 'u', chatId: 'source2' };
  const service2 = new StateService(storage, createReducerRegistry(), createProjectionRegistry());
  const state = createDefaultState();
  state.Narrative.Scene.Changed = true;
  const base = await service2.createGenesis(source2, { state });
  const projection = await service2.getProjectionForNode(source2, base.nodeId);
  const finalized = await service2.finalizeModelAttempt(source2, {
    expectedParentNodeId: base.nodeId,
    expectedParentStateHash: base.stateHash,
    patch: [{ op: 'replace', path: '/Narrative/Turn', value: 1 }],
    authorization: buildModelPatchAuthorizationView(projection.view),
    projectionVersion: projection.projectionVersion,
    promptProtocolVersion: projection.promptProtocolVersion,
    anchor: { messageId: 'a1', variantId: 'v1', lineageAnchorId: 'v1' },
    requestId: 'a1',
  });
  assert(finalized.systemCommitId !== null, 'fixture ends on C2 one-shot binding');
  const beforeExport = await service2.getProjectionForNode(source2, finalized.nodeId);
  const snapshot = await service2.exportPortableSnapshot(source2, finalized.nodeId);

  const target: StateScope = { userId: 'u', chatId: 'target' };
  const service3 = new StateService(storage, createReducerRegistry(), createProjectionRegistry());
  const boundary = {
    throughMessageId: 'fresh-greeting',
    activePrefixHash: 'fresh-prefix-hash',
    fingerprintVersion: ACTIVE_PREFIX_FINGERPRINT_VERSION,
  };
  const loaded = await service3.importPortableSnapshot(target, snapshot, boundary);
  const afterImport = await service3.getProjectionForNode(target, loaded.nodeId);
  assert(loaded.stateHash === finalized.stateHash, 'portable snapshot preserves authoritative state exactly');
  assert(afterImport.sourceKind === 'base-seed' && afterImport.viewHash === beforeExport.viewHash, 'portable snapshot preserves exact next-turn projection across chat fork');
  const importedBase = await service3.store.readNode(target, loaded.nodeId);
  assert(
    importedBase.type === 'base' &&
    importedBase.value.kind === 'fork' &&
    importedBase.value.provenance?.source === 'portable-snapshot' &&
    importedBase.value.transcriptBoundary?.throughMessageId === 'fresh-greeting',
    'portable import creates a fork base with portable provenance and fresh-chat transcript boundary',
  );

  let wrongImporterRejected = false;
  try {
    await service3.importLegacyState({ userId: 'u', chatId: 'portable-through-legacy' }, snapshot);
  } catch (error) {
    wrongImporterRejected = String(error).includes('LEGACY_IMPORT_PORTABLE_SNAPSHOT_USE_NATIVE_IMPORT');
  }
  assert(wrongImporterRejected, 'legacy import rejects portable snapshot format instead of normalizing the wrapper as state');

  let tamper = false;
  try {
    const bad = structuredClone(snapshot);
    bad.state.Narrative.Turn += 1;
    await service3.importPortableSnapshot({ userId: 'u', chatId: 'tamper' }, bad);
  } catch { tamper = true; }
  assert(tamper, 'portable snapshot integrity tampering fails closed');

  const newGameScope: StateScope = { userId: 'u', chatId: 'newgame' };
  const service4 = new StateService(storage, createReducerRegistry(), createProjectionRegistry());
  const ng = await service4.startNewGame(newGameScope, {
    date: '1 июня', time: '6:07', weather: 'Ясно', location: 'Дорога',
    name: 'Андар', age: '34', gender: 'Мужской', race: 'Человек', occupation: 'Амнезия',
    mental: 'Спокоен', charisma: 85, level: 1, exp: 0, core: 0, weaponRequest: 'двуручный топор',
    stats: { str: 15, agi: 15, con: 15, int: 10, wis: 10 },
  });
  assert(ng.state.GameStarted === true && ng.state.World.Time[0] === '06:07', 'New Game uses GameStart and creates initialized genesis');

  console.log(`phase6 snapshot/import tests passed: ${passed}`);
}
void main();
