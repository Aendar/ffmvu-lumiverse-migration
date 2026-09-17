import { createDefaultState } from '../../src/shared/state-defaults.js';
import { buildPromptView } from '../../src/shared/projection.js';
import { assertModelPatchAuthorization, buildModelPatchAuthorizationView } from '../../src/shared/patch-policy.js';
import type { JsonPatchOperation } from '../../src/shared/json-patch.js';

let passed = 0;
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error('ASSERT: ' + message);
  passed += 1;
}

function authorizationFor(state: ReturnType<typeof createDefaultState>) {
  return buildModelPatchAuthorizationView(buildPromptView(state).view);
}

function expectDenied(
  state: ReturnType<typeof createDefaultState>,
  patch: JsonPatchOperation[],
  expected: string,
  message: string,
): void {
  let error: unknown = null;
  try {
    assertModelPatchAuthorization(state, patch, authorizationFor(state));
  } catch (caught) {
    error = caught;
  }
  assert(String(error).includes(expected), message + ': ' + String(error));
}

function main(): void {
  const base = createDefaultState();
  base.Narrative.NPCs.npc_0001 = { ID: 'npc_0001', DisplayName: 'Эйлис' };
  base.Narrative.NextNpcId = 2;

  assertModelPatchAuthorization(base, [
    { op: 'add', path: '/Familiar/npc_0001', value: { ID: 'npc_0001', DisplayName: 'Эйлис' } },
  ], authorizationFor(base));
  assert(true, 'existing visible NPC can be promoted to Familiar by one root add with the same stable ID');

  expectDenied(base, [
    { op: 'add', path: '/Familiar/Эйлис', value: { ID: 'npc_0001', DisplayName: 'Эйлис' } },
  ], 'new Familiar must promote an existing Narrative.NPCs actor', 'human-readable Familiar key is rejected');

  expectDenied(base, [
    { op: 'add', path: '/Familiar/npc_0001', value: { ID: 'npc_9999', DisplayName: 'Эйлис' } },
  ], 'must preserve the source NPC stable ID', 'Familiar.ID must match the promoted NPC record key');

  expectDenied(base, [
    { op: 'add', path: '/Familiar/npc_0002', value: { ID: 'npc_0002', DisplayName: 'Unknown' } },
  ], 'new Familiar must promote an existing Narrative.NPCs actor', 'model cannot create a Familiar without an existing NPC source');

  const existing = structuredClone(base);
  existing.Familiar.npc_0001 = { ID: 'npc_0001', DisplayName: 'Эйлис', Affection: 50 };
  assertModelPatchAuthorization(existing, [
    { op: 'replace', path: '/Familiar/npc_0001/Affection', value: 51 },
  ], authorizationFor(existing));
  assert(true, 'existing Familiar updates remain authorized');

  const turn = createDefaultState();
  turn.Narrative.Turn = 27;
  const turnAuthorization = authorizationFor(turn);

  assertModelPatchAuthorization(turn, [
    { op: 'replace', path: '/Narrative/Turn', value: 27 },
  ], turnAuthorization);
  assert(true, 'administrative model patch may leave Narrative.Turn unchanged');

  assertModelPatchAuthorization(turn, [
    { op: 'replace', path: '/Narrative/Turn', value: 28 },
  ], turnAuthorization);
  assert(true, 'one sequential model turn increment is authorized');

  expectDenied(turn, [
    { op: 'replace', path: '/Narrative/Turn', value: 30 },
  ], 'must stay unchanged or advance by exactly one', 'Narrative.Turn cannot jump over failed turns');

  expectDenied(turn, [
    { op: 'replace', path: '/Narrative/Turn', value: 26 },
  ], 'must stay unchanged or advance by exactly one', 'Narrative.Turn cannot move backwards');

  expectDenied(turn, [
    { op: 'replace', path: '/Narrative/Turn', value: 28 },
    { op: 'replace', path: '/Narrative/Turn', value: 27 },
  ], 'may be written at most once', 'Narrative.Turn cannot be rewritten twice in one model patch');

  expectDenied(turn, [
    { op: 'replace', path: '/Narrative/Turn', value: '28' as unknown as number },
  ], 'must be an integer add/replace value', 'Narrative.Turn rejects stringified numbers');

  console.log(`phase12 Familiar/turn regression checks passed: ${passed}`);
}

main();
