import { StateService } from '../../src/service/state-service.js';
import { MemoryJsonStorage } from '../../src/persistence/storage-port.js';
import { createProjectionRegistry } from '../../src/shared/projection-registry.js';
import { createReducerRegistry } from '../../src/shared/reducer-registry.js';
import { createDefaultState } from '../../src/shared/state-defaults.js';
import { buildModelPatchAuthorizationView } from '../../src/shared/patch-policy.js';
import { ACTIVE_PREFIX_FINGERPRINT_VERSION } from '../../src/persistence/types.js';
let passed = 0;
function assert(value, message) { if (!value)
    throw new Error('ASSERT: ' + message); passed += 1; }
async function main() {
    const storage = new MemoryJsonStorage();
    const service = new StateService(storage, createReducerRegistry(), createProjectionRegistry());
    const source = { userId: 'u', chatId: 'source' };
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
    const automaticScope = { userId: 'u', chatId: 'automatic-schema-upgrade' };
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
    assert(automaticNode.type === 'commit' && automaticNode.value.kind === 'migration'
        && automaticNode.value.note === 'automatic-schema-upgrade-v1.6'
        && automaticNode.value.reducerVersion === 'FFMVU-1.6.0'
        && automatic.state.MVUStatMenu_DB_Ver === 'FFMVU-1.6.0'
        && !('Mental_state' in automatic.state.Mainchar) && !('Chekhov' in automatic.state.Narrative), 'legacy schema upgrade is deterministic and requires no user-supplied migration draft');
    const source2 = { userId: 'u', chatId: 'source2' };
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
    const target = { userId: 'u', chatId: 'target' };
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
    assert(importedBase.type === 'base' &&
        importedBase.value.kind === 'fork' &&
        importedBase.value.provenance?.source === 'portable-snapshot' &&
        importedBase.value.transcriptBoundary?.throughMessageId === 'fresh-greeting', 'portable import creates a fork base with portable provenance and fresh-chat transcript boundary');
    let wrongImporterRejected = false;
    try {
        await service3.importLegacyState({ userId: 'u', chatId: 'portable-through-legacy' }, snapshot);
    }
    catch (error) {
        wrongImporterRejected = String(error).includes('LEGACY_IMPORT_PORTABLE_SNAPSHOT_USE_NATIVE_IMPORT');
    }
    assert(wrongImporterRejected, 'legacy import rejects portable snapshot format instead of normalizing the wrapper as state');
    let tamper = false;
    try {
        const bad = structuredClone(snapshot);
        bad.state.Narrative.Turn += 1;
        await service3.importPortableSnapshot({ userId: 'u', chatId: 'tamper' }, bad);
    }
    catch {
        tamper = true;
    }
    assert(tamper, 'portable snapshot integrity tampering fails closed');
    const newGameScope = { userId: 'u', chatId: 'newgame' };
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
//# sourceMappingURL=phase6.js.map