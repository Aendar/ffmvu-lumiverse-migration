import { createDefaultState } from '../../src/shared/state-defaults.js';
import { normalizeState } from '../../src/shared/state-normalize.js';
import { validateState } from '../../src/shared/state-validate.js';
import { applyJsonPatch, assertModelOperationPolicy, canonicalizeTupleOperation } from '../../src/shared/json-patch.js';
import { pointerParts } from '../../src/shared/json-pointer.js';
import { buildPromptView } from '../../src/shared/projection.js';
import { createProjectionRegistry } from '../../src/shared/projection-registry.js';
import { createReducerRegistry } from '../../src/shared/reducer-registry.js';
import { canonicalStringify, sha256Hex } from '../../src/shared/hashing.js';
import { applyGameStartPayload, normalizeClock } from '../../src/shared/domain/gamestart.js';
let passed = 0;
function assert(condition, message) {
    if (!condition)
        throw new Error('ASSERT: ' + message);
    passed += 1;
}
function equal(actual, expected, message) {
    assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}; actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}
function throws(fn, fragment, message) {
    let hit = false;
    try {
        fn();
    }
    catch (error) {
        hit = String(error).includes(fragment);
    }
    assert(hit, message);
}
const base = createDefaultState();
equal(validateState(base), [], 'default state validates');
const normalized = normalizeState({
    ...base,
    Mainchar: {
        ...base.Mainchar,
        Outfit: {
            Initialized: true,
            Worn: { Cloak: {} },
            Wardrobe: { Cloak_2: { Name: 'Cloak', Type: 'Clothing', Slot: 'Torso', Layer: 'Outerwear', Color: 'black' } },
        },
    },
    Narrative: {
        ...base.Narrative,
        NPCs: { npc_0004: { Name: 'Evelyn', Aliases: ['Ev'] } },
        NextNpcId: 1,
        Relationships: { user_npc_0004: { Bond: 150, Sparks: -2, Grudge: 250 } },
        Scene: { ...base.Narrative.Scene, PresentNPCs: ['Evelyn'] },
    },
});
assert(!('Cloak' in normalized.Mainchar.Outfit.Worn), 'outfit tombstone removed');
equal(normalized.Narrative.NextNpcId, 5, 'NextNpcId advanced after highest stable NPC id');
equal(normalized.Narrative.Scene.PresentNPCs, ['npc_0004'], 'scene alias canonicalized');
const rel = normalized.Narrative.Relationships.user_npc_0004;
equal([rel.A, rel.B, rel.Bond, rel.Sparks, rel.Grudge], ['player', 'npc_0004', 100, 0, 100], 'relationship inferred/canonicalized/clamped');
const tupleOp = canonicalizeTupleOperation(base, { op: 'replace', path: '/Mainchar/Strength', value: 12 });
equal(tupleOp, { op: 'replace', path: '/Mainchar/Strength/0', value: 12 }, 'scalar tuple replace canonicalized to /0');
const patched = applyJsonPatch(base, [{ op: 'replace', path: '/Mainchar/Strength', value: 12 }]);
equal(patched.Mainchar.Strength, [12, 'Strength'], 'tuple label preserved by patch boundary repair');
throws(() => pointerParts('/Mainchar/__proto__/x'), 'Unsafe JSON Pointer segment', 'prototype pollution pointer rejected');
throws(() => assertModelOperationPolicy([{ op: 'move', from: '/a', path: '/b' }]), 'Model operation not allowed', 'model move operation rejected');
const auditState = createDefaultState();
auditState.Narrative.Turn = 8;
auditState.Narrative.Chekhov.LastAuditTurn = 0;
auditState.Narrative.Scene.Changed = true;
const prepared = buildPromptView(auditState, { consumeAudit: true });
const viewNarrative = prepared.view.Narrative;
const viewScene = viewNarrative.Scene;
const viewChekhov = viewNarrative.Chekhov;
equal(viewScene.Changed, true, 'projection sees pre-consumption Scene.Changed');
equal(viewChekhov.LastAuditTurn, 0, 'projection sees pre-consumption LastAuditTurn');
equal(prepared.state.Narrative.Scene.Changed, false, 'returned state consumes Scene.Changed');
equal(prepared.state.Narrative.Chekhov.LastAuditTurn, 8, 'returned state consumes audit turn');
const projectionRegistry = createProjectionRegistry();
assert(Boolean(projectionRegistry.get('FFMVU-1.5.8')), 'legacy projection registered by explicit version');
const reducerRegistry = createReducerRegistry();
assert(Boolean(reducerRegistry.get('FFMVU-1.5.8')), 'legacy reducer registered by explicit version');
assert(normalizeClock('6:07') === '06:07', 'clock normalizes H:MM');
const started = applyGameStartPayload(createDefaultState(), {
    date: 'Day 2', time: '6:07', weather: 'Rain', location: 'Gate', name: 'Player', age: '20', gender: 'M', race: 'Human',
    occupation: 'Adventurer', mental: 'Calm', charisma: 85, level: 1, exp: 0, core: 0, weaponRequest: 'spear',
    stats: { str: 15, agi: 15, con: 15, int: 10, wis: 10 },
});
equal(started.World.Time[0], '06:07', 'GameStart writes normalized clock');
equal(started.Mainchar.Hp_max[0], 71, 'GameStart HP formula parity');
equal(started.Mainchar.Sta_max[0], 126, 'GameStart stamina formula parity');
equal(started.Mainchar.Mp_max[0], 38, 'GameStart MP formula parity');
equal(started.Mainchar.Starting_weapon_status[0], 'pending', 'starting weapon one-shot status parity');
const canonical = canonicalStringify({ b: 2, a: 1 });
equal(canonical, '{"a":1,"b":2}', 'canonical key ordering stable');
const hash = await sha256Hex(canonical);
equal(hash, '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777', 'SHA-256 known vector');
console.log(`FFMVU Phase 1A unit checks passed: ${passed}`);
//# sourceMappingURL=run.js.map