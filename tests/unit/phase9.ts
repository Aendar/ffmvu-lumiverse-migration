import { createDefaultState } from '../../src/shared/state-defaults.js';
import {
  statusCoreBudget,
  statusHphOverview,
  statusItems,
  statusLegacyDeletePath,
  statusOwnerById,
  statusOwners,
  statusPath,
  statusText,
} from '../../src/lumi/statusmenu-model.js';

let passed = 0;
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error('ASSERT: ' + message);
  passed += 1;
}

function main(): void {
  const state = createDefaultState();
  state.Mainchar.Name[0] = 'Андар';
  state.Familiar.evelyn = {
    Name: ['Эвелин', 'Name'],
    Inventory: { dagger: { Name: 'Кинжал', Type: 'Weapon', Slot: 'Hand', Qty: 1 } },
    Equipment: {},
    Outfit: { Initialized: true, Worn: {}, Wardrobe: {} },
  };
  const owners = statusOwners(state);
  assert(owners.length === 2 && owners[0].id === 'player' && owners[1].id === 'familiar:evelyn', 'StatusMenu owner model includes player then familiars');
  assert(statusOwnerById(state, 'familiar:evelyn').ref.kind === 'familiar', 'owner selector resolves stable familiar ref');
  assert(JSON.stringify(statusLegacyDeletePath({ kind: 'player' }, 'Quests', 'quest_1')) === JSON.stringify(['Mainchar', 'Quests', 'quest_1']), 'legacy player Quest delete maps to exact Variables path');
  assert(JSON.stringify(statusLegacyDeletePath({ kind: 'familiar', id: 'evelyn' }, 'Buffs', 'Blessing')) === JSON.stringify(['Familiar', 'evelyn', 'Buffs', 'Blessing']), 'legacy Familiar Buff delete maps through stable familiar id');
  assert(statusLegacyDeletePath({ kind: 'player' }, 'Inventory', 'sword') === null, 'legacy generic delete mapping cannot bypass dedicated inventory semantics');
  assert(statusLegacyDeletePath({ kind: 'player' }, 'Equipment', 'sword') === null, 'legacy generic delete mapping cannot bypass equipment reversal semantics');

  state.Mainchar.Inventory.sword = { Name: 'Меч', Type: 'Weapon', Slot: 'Hand', Qty: 2 };
  state.Mainchar.Inventory.apple = { Name: 'Яблоко', Type: 'Food', Qty: 3 };
  const items = statusItems(state.Mainchar.Inventory);
  assert(items.find(item => item.key === 'sword')?.equippable === true, 'equipment-like inventory item is actionable');
  assert(items.find(item => item.key === 'apple')?.equippable === false, 'ordinary inventory item stays non-equippable');

  (state.Narrative.Scene as any).HPH = {
    player: {
      Physiology: { Bladder: 4, Arousal: 6, ErectionLevel: 8, SemenMl: 11, SemenCapacityMl: 20 },
      Penis: { LengthCm: 19, GirthCm: 14 },
    },
  };
  const hph = statusHphOverview(state);
  assert(hph?.bladder === 4 && hph?.erection === 8 && hph?.semenMl === 11, 'Overview reads canonical HPH physiology paths');
  assert(hph?.lengthCm === 19 && hph?.girthCm === 14, 'Overview reads canonical HPH penis dimensions');

  const budget = statusCoreBudget({ str: 15, agi: 15, con: 15, int: 15, wis: 15 });
  assert(budget.spent === 50 && budget.remaining === 0 && budget.valid, 'GameStart five-stat budget matches v1.4');
  assert(statusCoreBudget({ str: 16, agi: 15, con: 15, int: 15, wis: 15 }).valid === false, 'GameStart budget rejects >50 spent points');

  assert(statusText(['08:00', 'Time']) === '08:00', 'StatusMenu display unwraps labeled tuples');
  assert(statusPath(state, 'Narrative.Scene.HPH.player.Physiology.Arousal') === 6, 'StatusMenu state path reader is deterministic');

  console.log(`phase9 native StatusMenu model tests passed: ${passed}`);
}
main();
