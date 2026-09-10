import { StateService, ModelPatchRejectedError } from '../../src/service/state-service.js';
import { MemoryJsonStorage } from '../../src/persistence/storage-port.js';
import { EventStore } from '../../src/persistence/event-store.js';
import { createProjectionRegistry } from '../../src/shared/projection-registry.js';
import { createReducerRegistry } from '../../src/shared/reducer-registry.js';
import { createDefaultState } from '../../src/shared/state-defaults.js';
import { buildModelPatchAuthorizationView } from '../../src/shared/patch-policy.js';
import type { JsonPatchOperation } from '../../src/shared/json-patch.js';

let passed = 0;
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error('ASSERT: ' + message);
  passed += 1;
}

async function finalize(
  state: StateService,
  scope: { userId: string; chatId: string },
  parent: Awaited<ReturnType<StateService['createGenesis']>>,
  patch: JsonPatchOperation[],
  requestId: string,
) {
  const frozen = await state.getProjectionForNode(scope, parent.nodeId);
  return state.finalizeModelAttempt(scope, {
    expectedParentNodeId: parent.nodeId,
    expectedParentStateHash: parent.stateHash,
    patch,
    authorization: buildModelPatchAuthorizationView(frozen.view),
    projectionVersion: frozen.projectionVersion,
    promptProtocolVersion: frozen.promptProtocolVersion,
    anchor: {
      messageId: requestId + '-message',
      variantId: requestId + '-variant',
      generationId: requestId + '-generation',
      attemptId: requestId + '-attempt',
      messageRole: 'assistant',
      lineageAnchorId: requestId + '-variant',
    },
    requestId,
  });
}

async function main(): Promise<void> {
  // Golden case from the supplied long-running save: the new sword was added to
  // Equipment while Physical_attack remained at the old axe-only value 47.
  const goldenStorage = new MemoryJsonStorage();
  const goldenState = new StateService(goldenStorage, createReducerRegistry(), createProjectionRegistry());
  const goldenScope = { userId: 'u', chatId: 'equipment-golden' };
  const goldenSeed = createDefaultState();
  goldenSeed.Mainchar.Level[0] = 1;
  goldenSeed.Mainchar.Strength[0] = 20;
  goldenSeed.Mainchar.Constitution[0] = 15;
  goldenSeed.Mainchar.Agility[0] = 15;
  goldenSeed.Mainchar.Sta_max[0] = 126;
  goldenSeed.Mainchar.Sta_curr[0] = 126;
  goldenSeed.Mainchar.Equipment.axe = {
    Name: 'Двуручный боевой топор', Type: 'Weapon', Slot: 'Hand', WeaponDamage: 5,
  };
  goldenSeed.Mainchar.Physical_attack[0] = 47;
  const goldenGenesis = await goldenState.createGenesis(goldenScope, { state: goldenSeed });
  const golden = await finalize(goldenState, goldenScope, goldenGenesis, [
    {
      op: 'add', path: '/Mainchar/Equipment/sword', value: {
        Name: 'Тёмный двуручный меч из гланмордонской стали',
        Type: 'Weapon', Slot: 'Hand', WeaponDamage: 7,
      },
    },
  ], 'golden');

  assert(golden.Mainchar.Physical_attack[0] === 54, 'model equipment write reconciles Physical_attack from both equipped weapons');
  assert(golden.Mainchar.Sta_max[0] === 126, 'canonical stamina formula is 50 + Con*3 + Agi*2 + floor(Level*5/3)');
  assert(golden.modelCommitId !== null && golden.systemCommitId !== null, 'equipment change creates model plus deterministic system commit');
  assert(golden.committedNodeIds.length === 2, 'equipment reconciliation is atomic in the same two-node transaction when no projection consumption is needed');

  const goldenStore = new EventStore(goldenStorage);
  const goldenHead = await goldenStore.resolveStoreHead(goldenScope);
  assert(goldenHead.status === 'ok' && goldenHead.head?.committedArtifacts.length === 2, 'one ChatStoreRevision publishes model and equipment reconciliation together');
  const reconciliation = await goldenStore.readCommit(goldenScope, golden.systemCommitId!);
  assert(reconciliation.kind === 'system' && reconciliation.note === 'equipment-derived-v1', 'reconciliation is explicit versioned system evidence');
  assert(reconciliation.parentNodeId === golden.modelCommitId, 'reconciliation is a child of the exact model commit');

  // Existing stale saves are intentionally not repaired by unrelated turns.
  const oldStorage = new MemoryJsonStorage();
  const oldState = new StateService(oldStorage, createReducerRegistry(), createProjectionRegistry());
  const oldScope = { userId: 'u', chatId: 'old-save-future-only' };
  const oldSeed = structuredClone(golden.state);
  oldSeed.Mainchar.Physical_attack[0] = 47;
  const oldGenesis = await oldState.createGenesis(oldScope, { state: oldSeed });
  const unrelated = await finalize(oldState, oldScope, oldGenesis, [
    { op: 'replace', path: '/Narrative/Turn', value: 1 },
  ], 'unrelated');
  assert(unrelated.Mainchar.Physical_attack[0] === 47, 'unrelated model turn does not retroactively repair an old derived value');
  assert(unrelated.systemCommitId === null, 'unrelated model turn does not create an equipment reconciliation commit');

  // Core-stat invalidation also owns derived maxima and locks the chosen stamina rule.
  const staminaStorage = new MemoryJsonStorage();
  const staminaState = new StateService(staminaStorage, createReducerRegistry(), createProjectionRegistry());
  const staminaScope = { userId: 'u', chatId: 'stamina-formula' };
  const staminaGenesis = await staminaState.createGenesis(staminaScope);
  const stamina = await finalize(staminaState, staminaScope, staminaGenesis, [
    { op: 'replace', path: '/Mainchar/Constitution/0', value: 15 },
    { op: 'replace', path: '/Mainchar/Agility/0', value: 15 },
  ], 'stamina');
  assert(stamina.Mainchar.Sta_max[0] === 126, 'core-stat model writes deterministically recalculate stamina with the approved formula');
  assert(stamina.systemCommitId !== null, 'core-stat invalidation persists derived outputs as an explicit system commit');

  // Equipment core-stat bonuses are applied as a delta, matching typed GUI equip semantics.
  const bonusStorage = new MemoryJsonStorage();
  const bonusState = new StateService(bonusStorage, createReducerRegistry(), createProjectionRegistry());
  const bonusScope = { userId: 'u', chatId: 'equipment-stat-delta' };
  const bonusSeed = createDefaultState();
  bonusSeed.Mainchar.Level[0] = 1;
  bonusSeed.Mainchar.Strength[0] = 22;
  bonusSeed.Mainchar.Equipment.axe = {
    Name: 'Топор', Type: 'Weapon', Slot: 'Hand', WeaponDamage: 5, StrBonus: 2,
  };
  bonusSeed.Mainchar.Physical_attack[0] = 51;
  const bonusGenesis = await bonusState.createGenesis(bonusScope, { state: bonusSeed });
  const bonus = await finalize(bonusState, bonusScope, bonusGenesis, [
    {
      op: 'add', path: '/Mainchar/Equipment/sword', value: {
        Name: 'Меч', Type: 'Weapon', Slot: 'Hand', WeaponDamage: 7, StrBonus: 3,
      },
    },
  ], 'bonus');
  assert(bonus.Mainchar.Strength[0] === 25, 'new equipment StrBonus is applied to the stored effective core stat exactly once');
  assert(bonus.Mainchar.Physical_attack[0] === 64, 'derived attack uses reconciled core stat plus all equipped weapon damage');

  // Direct JSONPatch has no source-owner semantics for automatic displacement;
  // an over-cap equipment result therefore fails closed before any revision is published.
  const capStorage = new MemoryJsonStorage();
  const capState = new StateService(capStorage, createReducerRegistry(), createProjectionRegistry());
  const capScope = { userId: 'u', chatId: 'equipment-cap' };
  const capSeed = createDefaultState();
  capSeed.Mainchar.Equipment.one = { Name: 'One', Type: 'Weapon', Slot: 'Hand', WeaponDamage: 1 };
  capSeed.Mainchar.Equipment.two = { Name: 'Two', Type: 'Weapon', Slot: 'Hand', WeaponDamage: 1 };
  const capGenesis = await capState.createGenesis(capScope, { state: capSeed });
  let capError: unknown = null;
  try {
    await finalize(capState, capScope, capGenesis, [
      { op: 'add', path: '/Mainchar/Equipment/three', value: { Name: 'Three', Type: 'Weapon', Slot: 'Hand', WeaponDamage: 1 } },
    ], 'cap');
  } catch (error) {
    capError = error;
  }
  const capHead = await new EventStore(capStorage).resolveStoreHead(capScope);
  assert(capError instanceof ModelPatchRejectedError && String(capError).includes('EQUIPMENT_RECONCILIATION_SLOT_LIMIT: Hand'), 'over-cap model equipment is rejected as one model mutation');
  assert(capHead.status === 'ok' && capHead.head?.semanticTipNodeId === capGenesis.nodeId, 'failed reconciliation publishes neither model nor system commit');

  console.log('phase11 equipment reconciliation checks passed:', passed);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
