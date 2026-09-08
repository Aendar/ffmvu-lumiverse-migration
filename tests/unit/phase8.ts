import { applyGuiIntent } from '../../src/shared/domain/gui-intents.js';
import { createDefaultState } from '../../src/shared/state-defaults.js';
import { StateService } from '../../src/service/state-service.js';
import { MemoryJsonStorage } from '../../src/persistence/storage-port.js';
import { createProjectionRegistry } from '../../src/shared/projection-registry.js';
import { createReducerRegistry } from '../../src/shared/reducer-registry.js';
import { EventStore } from '../../src/persistence/event-store.js';
import { HeadResolver } from '../../src/head-resolver.js';
import { TranscriptAttemptStore, VariantIndexStore } from '../../src/persistence/anchor-store.js';
import { computeRecentChanges } from '../../src/shared/recent-changes.js';
import { isGuiVariableCoupledDomainPath, isGuiVariableDynamicCollectionPath } from '../../src/shared/domain/gui-variable-policy.js';

let passed = 0;
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error('ASSERT: ' + message);
  passed += 1;
}

function clothing(name: string, slot: string, layer: string) {
  return { Name: name, Type: 'Clothing', Slot: slot, Layer: layer, Placement: slot, Color: '', Material: '', Appearance: '', Condition: 'good', Arrangement: 'worn' };
}

async function main(): Promise<void> {
  const base = createDefaultState();
  base.Mainchar.Outfit.Initialized = true;
  base.Mainchar.Outfit.Worn.cap = clothing('Шапка', 'Head', 'Base');
  base.Mainchar.Outfit.Wardrobe.hat = clothing('Шляпа', 'Head', 'Base');

  const dressed = applyGuiIntent(base, { type: 'outfit.move', owner: { kind: 'player' }, from: 'Wardrobe', itemKey: 'hat' });
  assert(Boolean(dressed.Mainchar.Outfit.Worn.hat) && !dressed.Mainchar.Outfit.Worn.cap, 'Wardrobe -> Worn replaces same Slot+Layer');
  assert(Boolean(dressed.Mainchar.Outfit.Wardrobe.cap), 'displaced worn item returns to Wardrobe');

  const restored = applyGuiIntent(dressed, { type: 'outfit.move', owner: { kind: 'player' }, from: 'Worn', itemKey: 'hat' });
  assert(Boolean(restored.Mainchar.Outfit.Wardrobe.hat) && !restored.Mainchar.Outfit.Worn.hat, 'Worn -> Wardrobe moves item back atomically');

  const gear = createDefaultState();
  gear.Mainchar.Inventory.sword = { Name: 'Меч', Type: 'Weapon', Slot: 'Hand', Qty: 2, StrBonus: 2, WeaponDamage: 3 };
  const equipped = applyGuiIntent(gear, { type: 'equipment.equip', sourceOwner: { kind: 'player' }, targetOwner: { kind: 'player' }, itemKey: 'sword' });
  assert(Boolean(equipped.Mainchar.Equipment.sword) && (equipped.Mainchar.Inventory.sword as any).Qty === 1, 'equip moves one quantity from inventory to equipment');
  assert(equipped.Mainchar.Strength[0] === 7 && equipped.Mainchar.Physical_attack[0] === 19, 'legacy equipment attribute + derived attack recalculation is preserved');

  const unequipped = applyGuiIntent(equipped, { type: 'equipment.unequip', owner: { kind: 'player' }, equipmentKey: 'sword' });
  assert(!unequipped.Mainchar.Equipment.sword && (unequipped.Mainchar.Inventory.sword as any).Qty === 2, 'manual unequip returns item to owner inventory and stacks Qty');
  assert(unequipped.Mainchar.Strength[0] === 5 && unequipped.Mainchar.Physical_attack[0] === 12, 'manual unequip reverses attribute and derived stat bonuses');

  const handLimit = createDefaultState();
  handLimit.Mainchar.Equipment.old1 = { Name: 'Старый 1', Type: 'Weapon', Slot: 'Hand', StrBonus: 1 };
  handLimit.Mainchar.Equipment.old2 = { Name: 'Старый 2', Type: 'Weapon', Slot: 'Hand', StrBonus: 1 };
  handLimit.Mainchar.Strength[0] = 7;
  handLimit.Mainchar.Inventory.new = { Name: 'Новый', Type: 'Weapon', Slot: 'Hand', Qty: 1, StrBonus: 3 };
  const handNext = applyGuiIntent(handLimit, { type: 'equipment.equip', sourceOwner: { kind: 'player' }, targetOwner: { kind: 'player' }, itemKey: 'new' });
  assert(!handNext.Mainchar.Equipment.old1 && Boolean(handNext.Mainchar.Equipment.old2) && Boolean(handNext.Mainchar.Equipment.new), 'Hand limit=2 auto-unequips oldest item');
  assert(Boolean(handNext.Mainchar.Inventory.old1), 'auto-unequipped hand item returns to supplying inventory');

  const accessory = createDefaultState();
  accessory.Mainchar.Equipment.a = { Name: 'A', Type: 'Accessory', Slot: 'Finger' };
  accessory.Mainchar.Equipment.b = { Name: 'B', Type: 'Accessory', Slot: 'Wrist' };
  accessory.Mainchar.Equipment.c = { Name: 'C', Type: 'Accessory', Slot: 'Neck' };
  accessory.Mainchar.Inventory.d = { Name: 'D', Type: 'Accessory', Slot: 'Ankle', Qty: 1 };
  let accessoryRejected = false;
  try {
    applyGuiIntent(accessory, { type: 'equipment.equip', sourceOwner: { kind: 'player' }, targetOwner: { kind: 'player' }, itemKey: 'd' });
  } catch (error) {
    accessoryRejected = String(error).includes('GUI_ACCESSORY_LIMIT_REACHED');
  }
  assert(accessoryRejected, 'legacy global accessory cap of 3 is enforced');

  const cross = createDefaultState();
  cross.Familiar.evelyn = {
    Name: ['Эвелин', 'Name'],
    Equipment: { old: { Name: 'Старый клинок', Type: 'Weapon', Slot: 'Hand' }, old2: { Name: 'Кинжал', Type: 'Weapon', Slot: 'Hand' } },
    Inventory: {},
  };
  cross.Mainchar.Inventory.axe = { Name: 'Топор', Type: 'Weapon', Slot: 'Hand', Qty: 1 };
  const crossNext = applyGuiIntent(cross, { type: 'equipment.equip', sourceOwner: { kind: 'player' }, targetOwner: { kind: 'familiar', id: 'evelyn' }, itemKey: 'axe' });
  assert(Boolean(crossNext.Mainchar.Inventory.old), 'legacy cross-character auto-unequip returns displaced target gear to source inventory');

  const deleted = applyGuiIntent(crossNext, { type: 'inventory.delete', owner: { kind: 'player' }, itemKey: 'old' });
  assert(!deleted.Mainchar.Inventory.old, 'inventory delete removes exact dictionary key');

  const controls = createDefaultState();
  controls.Familiar.evelyn = {
    Name: ['Эвелин', 'Name'],
    Image: ['https://example.com/old-evelyn.jpg', 'Image'],
    Is_present: true,
    Is_in_battle_team: false,
  };
  const playerImage = applyGuiIntent(controls, {
    type: 'image.set',
    target: { kind: 'player-avatar' },
    value: 'https://example.com/player.jpg',
  });
  assert(playerImage.Mainchar.Image[0] === 'https://example.com/player.jpg' && playerImage.Mainchar.Image[1] === controls.Mainchar.Image[1], 'player avatar URL preserves the existing labeled tuple metadata');
  const clearedPlayerImage = applyGuiIntent(playerImage, {
    type: 'image.set',
    target: { kind: 'player-avatar' },
    value: '',
  });
  assert(clearedPlayerImage.Mainchar.Image[0] === '' && clearedPlayerImage.Mainchar.Image[1] === controls.Mainchar.Image[1], 'switching to a browser-local image can clear a stale authoritative URL without losing tuple metadata');

  const familiarImage = applyGuiIntent(playerImage, {
    type: 'image.set',
    target: { kind: 'familiar-avatar', id: 'evelyn' },
    value: 'https://example.com/evelyn.jpg',
  });
  assert((familiarImage.Familiar.evelyn as any).Image[0] === 'https://example.com/evelyn.jpg'
    && (familiarImage.Familiar.evelyn as any).Image[1] === 'Image', 'familiar avatar URL preserves existing labeled tuple shape');

  const mapImage = applyGuiIntent(familiarImage, {
    type: 'image.set',
    target: { kind: 'world-map' },
    value: 'https://example.com/map.jpg',
  });
  assert((mapImage.World as any).MapImage === 'https://example.com/map.jpg', 'world map image can be added as a typed GUI field');

  const familiarPresent = applyGuiIntent(mapImage, {
    type: 'familiar.flag.set',
    familiarId: 'evelyn',
    field: 'Is_present',
    value: false,
  });
  assert((familiarPresent.Familiar.evelyn as any).Is_present === false, 'Familiar Present toggle writes exact boolean field');

  const familiarBattle = applyGuiIntent(familiarPresent, {
    type: 'familiar.flag.set',
    familiarId: 'evelyn',
    field: 'Is_in_battle_team',
    value: true,
  });
  assert((familiarBattle.Familiar.evelyn as any).Is_in_battle_team === true, 'Familiar BattleTeam toggle writes exact boolean field');

  let invalidImageRejected = false;
  try {
    applyGuiIntent(controls, { type: 'image.set', target: { kind: 'player-avatar' }, value: 'javascript:alert(1)' });
  } catch (error) {
    invalidImageRejected = String(error).includes('GUI_IMAGE_URL_INVALID');
  }
  assert(invalidImageRejected, 'typed image intent rejects non-http/https values');

  const variables = createDefaultState();
  variables.Mainchar.Inventory['Серебро'] = { Type: 'Money', Qty: 54, Desc: 'Серебряные монеты' };
  variables.Narrative.GM_Notes.Active = {
    Guta_Info: { Type: 'Fact', Setup: 'Старая запись', Status: 'active' },
  };

  const renamedVariable = applyGuiIntent(variables, {
    type: 'variable.rename',
    path: ['Mainchar', 'Inventory', 'Серебро'],
    newKey: 'Монеты',
  });
  assert(Boolean(renamedVariable.Mainchar.Inventory['Монеты']) && !renamedVariable.Mainchar.Inventory['Серебро'], 'Variables rename preserves entry value under a new key');

  const editedVariable = applyGuiIntent(renamedVariable, {
    type: 'variable.set',
    path: ['Mainchar', 'Inventory', 'Монеты', 'Qty'],
    value: 60,
  });
  assert((editedVariable.Mainchar.Inventory['Монеты'] as any).Qty === 60, 'Variables set edits an exact primitive leaf');

  const tupleEdited = applyGuiIntent(editedVariable, {
    type: 'variable.set',
    path: ['Mainchar', 'Name', '0'],
    value: 'Андар Айнзем',
  });
  assert(tupleEdited.Mainchar.Name[0] === 'Андар Айнзем' && tupleEdited.Mainchar.Name[1] === 'Name', 'Variables set can edit tuple value without destroying its label');

  const addedVariable = applyGuiIntent(tupleEdited, {
    type: 'variable.add',
    parentPath: ['Narrative', 'GM_Notes', 'Active'],
    key: 'New_Note',
    value: { Type: 'Fact', Setup: 'Новая запись', Status: 'active' },
  });
  assert(Boolean(addedVariable.Narrative.GM_Notes.Active.New_Note), 'Variables add creates an object child');

  const deletedVariable = applyGuiIntent(addedVariable, {
    type: 'variable.delete',
    path: ['Narrative', 'GM_Notes', 'Active', 'New_Note'],
  });
  assert(!deletedVariable.Narrative.GM_Notes.Active.New_Note, 'Variables delete removes an exact object child');

  let rootProtected = false;
  try {
    applyGuiIntent(deletedVariable, { type: 'variable.delete', path: ['Narrative'] });
  } catch (error) {
    rootProtected = String(error).includes('GUI_VARIABLE_PROTECTED_ROOT');
  }
  assert(rootProtected, 'Variables editor cannot delete protected root state domains');

  let collisionRejected = false;
  try {
    applyGuiIntent(deletedVariable, {
      type: 'variable.rename',
      path: ['Mainchar', 'Inventory', 'Монеты'],
      newKey: 'Монеты',
    });
  } catch (error) {
    collisionRejected = String(error).includes('GUI_INTENT_NO_CHANGE');
  }
  assert(collisionRejected, 'Variables rename rejects a no-op key rename');

  let structuralRenameRejected = false;
  try {
    applyGuiIntent(deletedVariable, {
      type: 'variable.rename',
      path: ['World', 'Weather'],
      newKey: 'Погода',
    });
  } catch (error) {
    structuralRenameRejected = String(error).includes('GUI_VARIABLE_STRUCTURAL_KEY');
  }
  assert(structuralRenameRejected, 'Variables rename rejects fixed schema keys such as World.Weather');

  let structuralDeleteRejected = false;
  try {
    applyGuiIntent(deletedVariable, {
      type: 'variable.delete',
      path: ['Mainchar', 'Strength'],
    });
  } catch (error) {
    structuralDeleteRejected = String(error).includes('GUI_VARIABLE_STRUCTURAL_KEY');
  }
  assert(structuralDeleteRejected, 'Variables delete rejects fixed schema fields');

  let structuralAddRejected = false;
  try {
    applyGuiIntent(deletedVariable, {
      type: 'variable.add',
      parentPath: ['World'],
      key: 'Custom',
      value: 'x',
    });
  } catch (error) {
    structuralAddRejected = String(error).includes('GUI_VARIABLE_STRUCTURAL_CONTAINER');
  }
  assert(structuralAddRejected, 'Variables add is restricted to dynamic record collections');

  assert(!isGuiVariableDynamicCollectionPath(['Mainchar', 'Equipment'])
    && !isGuiVariableDynamicCollectionPath(['Familiar', 'evelyn', 'Equipment']), 'Equipment is not exposed as a generic Variables-managed collection');
  assert(isGuiVariableCoupledDomainPath(['Mainchar', 'Equipment', 'sword', 'StrBonus'])
    && isGuiVariableCoupledDomainPath(['Familiar', 'evelyn', 'Equipment', 'blade']), 'player and Familiar Equipment descendants are classified as coupled domains');

  let equipmentDeleteRejected = false;
  try {
    applyGuiIntent(equipped, { type: 'variable.delete', path: ['Mainchar', 'Equipment', 'sword'] });
  } catch (error) {
    equipmentDeleteRejected = String(error).includes('GUI_VARIABLE_COUPLED_DOMAIN');
  }
  assert(equipmentDeleteRejected, 'Variables cannot delete equipped items without domain consequences');

  let equipmentSetRejected = false;
  try {
    applyGuiIntent(equipped, { type: 'variable.set', path: ['Mainchar', 'Equipment', 'sword', 'StrBonus'], value: 99 });
  } catch (error) {
    equipmentSetRejected = String(error).includes('GUI_VARIABLE_COUPLED_DOMAIN');
  }
  assert(equipmentSetRejected, 'Variables cannot edit equipped stat bonuses without recalculation');

  let equipmentRenameRejected = false;
  try {
    applyGuiIntent(equipped, { type: 'variable.rename', path: ['Mainchar', 'Equipment', 'sword'], newKey: 'blade' });
  } catch (error) {
    equipmentRenameRejected = String(error).includes('GUI_VARIABLE_COUPLED_DOMAIN');
  }
  assert(equipmentRenameRejected, 'Variables cannot rename Equipment entries through the generic structural path');

  let equipmentAddRejected = false;
  try {
    applyGuiIntent(equipped, {
      type: 'variable.add',
      parentPath: ['Mainchar', 'Equipment'],
      key: 'ghost',
      value: { Name: 'Ghost', Type: 'Weapon', Slot: 'Hand', StrBonus: 50 },
    });
  } catch (error) {
    equipmentAddRejected = String(error).includes('GUI_VARIABLE_COUPLED_DOMAIN');
  }
  assert(equipmentAddRejected, 'Variables cannot add Equipment entries without equip semantics');

  let familiarEquipmentRejected = false;
  try {
    applyGuiIntent(crossNext, { type: 'variable.delete', path: ['Familiar', 'evelyn', 'Equipment', 'old2'] });
  } catch (error) {
    familiarEquipmentRejected = String(error).includes('GUI_VARIABLE_COUPLED_DOMAIN');
  }
  assert(familiarEquipmentRejected, 'Familiar Equipment has the same coupled-domain protection');

  const legacyLists = createDefaultState();
  legacyLists.Mainchar.Skills = {
    fireball: { Desc: 'Old description', Level: 1, Active: true, Tags: ['fire'], name: 'hidden-name', $meta: { source: 'legacy' } },
  };
  legacyLists.Mainchar.Talents = {
    brave: { Desc: 'Old talent', Rank: 1, Nested: { note: 'keep' }, template: 'hidden-template' },
  };
  legacyLists.Mainchar.Quests = { quest_1: { Desc: 'Test quest' } };
  legacyLists.Mainchar.Buffs = { Blessing: { Desc: 'Test buff' } };
  legacyLists.Mainchar.Ailments = { Poisoned: { Desc: 'Test ailment' } };

  const editedSkill = applyGuiIntent(legacyLists, {
    type: 'skill.update',
    skillKey: 'fireball',
    fields: { Desc: 'New description', Level: 2, Active: false, Tags: ['fire', 'arcane'] },
  });
  assert((editedSkill.Mainchar.Skills.fireball as any).Desc === 'New description'
    && (editedSkill.Mainchar.Skills.fireball as any).Level === 2
    && (editedSkill.Mainchar.Skills.fireball as any).Active === false, 'Skill edit merges top-level legacy fields with preserved JSON types');
  assert((editedSkill.Mainchar.Skills.fireball as any).name === 'hidden-name'
    && (editedSkill.Mainchar.Skills.fireball as any).$meta.source === 'legacy', 'Skill edit preserves hidden legacy metadata fields');

  const editedTalent = applyGuiIntent(legacyLists, {
    type: 'talent.update',
    talentKey: 'brave',
    fields: { Desc: 'New talent', Rank: 3, Nested: { note: 'changed' } },
  });
  assert((editedTalent.Mainchar.Talents.brave as any).Desc === 'New talent'
    && (editedTalent.Mainchar.Talents.brave as any).Rank === 3
    && (editedTalent.Mainchar.Talents.brave as any).Nested.note === 'changed'
    && (editedTalent.Mainchar.Talents.brave as any).template === 'hidden-template', 'Talent edit mirrors legacy top-level field merge while preserving hidden template metadata');

  const deletedSkill = applyGuiIntent(editedSkill, { type: 'skill.delete', skillKey: 'fireball' });
  assert(!deletedSkill.Mainchar.Skills.fireball, 'typed Skill delete removes only the exact Mainchar.Skills entry');
  const deletedTalent = applyGuiIntent(editedTalent, { type: 'talent.delete', talentKey: 'brave' });
  assert(!deletedTalent.Mainchar.Talents.brave, 'typed Talent delete removes only the exact Mainchar.Talents entry');

  let protectedSkillFieldRejected = false;
  try {
    applyGuiIntent(legacyLists, { type: 'skill.update', skillKey: 'fireball', fields: { name: 'must-not-change' } });
  } catch (error) {
    protectedSkillFieldRejected = String(error).includes('GUI_SKILLS_FIELD_PROTECTED');
  }
  assert(protectedSkillFieldRejected, 'typed Skill edit cannot modify legacy-hidden name metadata');
  const withoutQuest = applyGuiIntent(legacyLists, { type: 'variable.delete', path: ['Mainchar', 'Quests', 'quest_1'] });
  assert(!withoutQuest.Mainchar.Quests.quest_1, 'legacy Quest delete uses the validated dynamic collection path');
  const withoutBuff = applyGuiIntent(legacyLists, { type: 'variable.delete', path: ['Mainchar', 'Buffs', 'Blessing'] });
  assert(!withoutBuff.Mainchar.Buffs.Blessing, 'legacy Buff delete uses the validated dynamic collection path');
  const withoutAilment = applyGuiIntent(legacyLists, { type: 'variable.delete', path: ['Mainchar', 'Ailments', 'Poisoned'] });
  assert(!withoutAilment.Mainchar.Ailments.Poisoned, 'legacy Ailment delete uses the validated dynamic collection path');

  const worldLists = createDefaultState();
  worldLists.World_Calc.Factions = { guild: { Desc: 'Old faction', Influence: 2, name: 'hidden-name' } };
  worldLists.World_Calc.Locations = { harbor: { Desc: 'Old harbor', Danger: 1 } };
  worldLists.World_Calc.Ruins = { tower: { Desc: 'Old tower', Explored: false } };
  worldLists.World_Calc.Events = { storm: { Desc: 'Old storm', Active: true, template: 'hidden-template' } };

  const editedFaction = applyGuiIntent(worldLists, {
    type: 'worldcalc.update',
    section: 'Factions',
    itemKey: 'guild',
    fields: { Desc: 'New faction', Influence: 5 },
  });
  assert((editedFaction.World_Calc.Factions.guild as any).Desc === 'New faction'
    && (editedFaction.World_Calc.Factions.guild as any).Influence === 5
    && (editedFaction.World_Calc.Factions.guild as any).name === 'hidden-name', 'World_Calc Factions edit merges visible top-level fields and preserves hidden metadata');

  const editedLocation = applyGuiIntent(worldLists, {
    type: 'worldcalc.update',
    section: 'Locations',
    itemKey: 'harbor',
    fields: { Desc: 'New harbor', Danger: 3 },
  });
  assert((editedLocation.World_Calc.Locations.harbor as any).Desc === 'New harbor'
    && (editedLocation.World_Calc.Locations.harbor as any).Danger === 3, 'World_Calc Locations edit uses the same frozen legacy merge semantics');

  const editedRuin = applyGuiIntent(worldLists, {
    type: 'worldcalc.update',
    section: 'Ruins',
    itemKey: 'tower',
    fields: { Desc: 'Mapped tower', Explored: true },
  });
  assert((editedRuin.World_Calc.Ruins.tower as any).Explored === true, 'World_Calc Ruins edit preserves boolean field types');

  const editedEvent = applyGuiIntent(worldLists, {
    type: 'worldcalc.update',
    section: 'Events',
    itemKey: 'storm',
    fields: { Desc: 'Storm ended', Active: false },
  });
  assert((editedEvent.World_Calc.Events.storm as any).Active === false
    && (editedEvent.World_Calc.Events.storm as any).template === 'hidden-template', 'World_Calc Events edit preserves hidden template metadata');

  const deletedFaction = applyGuiIntent(editedFaction, { type: 'worldcalc.delete', section: 'Factions', itemKey: 'guild' });
  const deletedLocation = applyGuiIntent(editedLocation, { type: 'worldcalc.delete', section: 'Locations', itemKey: 'harbor' });
  const deletedRuin = applyGuiIntent(editedRuin, { type: 'worldcalc.delete', section: 'Ruins', itemKey: 'tower' });
  const deletedEvent = applyGuiIntent(editedEvent, { type: 'worldcalc.delete', section: 'Events', itemKey: 'storm' });
  assert(!deletedFaction.World_Calc.Factions.guild
    && !deletedLocation.World_Calc.Locations.harbor
    && !deletedRuin.World_Calc.Ruins.tower
    && !deletedEvent.World_Calc.Events.storm, 'selected World_Calc delete intents remove only exact section entries');

  let protectedWorldFieldRejected = false;
  try {
    applyGuiIntent(worldLists, { type: 'worldcalc.update', section: 'Events', itemKey: 'storm', fields: { template: 'must-not-change' } });
  } catch (error) {
    protectedWorldFieldRejected = String(error).includes('GUI_WORLDCALC_FIELD_PROTECTED');
  }
  assert(protectedWorldFieldRejected, 'typed World_Calc edit cannot modify legacy-hidden template metadata');

  const worldStorage = new MemoryJsonStorage();
  const worldService = new StateService(worldStorage, createReducerRegistry(), createProjectionRegistry());
  const worldScope = { userId: 'u', chatId: 'worldcalc-gui' };
  const worldGenesis = await worldService.createGenesis(worldScope, { state: worldLists });
  const worldCommit = await worldService.commitGuiIntent(worldScope, {
    expectedParentNodeId: worldGenesis.nodeId,
    expectedParentStateHash: worldGenesis.stateHash,
    intent: { type: 'worldcalc.update', section: 'Locations', itemKey: 'harbor', fields: { Danger: 4 } },
    anchor: { lineageAnchorId: 'root' },
    requestId: 'gui-worldcalc-update',
  });
  const storedWorldCommit = await new EventStore(worldStorage).readCommit(worldScope, worldCommit.nodeId);
  assert((worldCommit.state.World_Calc.Locations.harbor as any).Danger === 4
    && storedWorldCommit.kind === 'gui'
    && storedWorldCommit.note === 'gui-intent:worldcalc.update', 'StateService commits selected World_Calc edits through normal optimistic GUI transaction semantics');

  const skillStorage = new MemoryJsonStorage();
  const skillService = new StateService(skillStorage, createReducerRegistry(), createProjectionRegistry());
  const skillScope = { userId: 'u', chatId: 'skills-talents-gui' };
  const skillGenesis = await skillService.createGenesis(skillScope, { state: legacyLists });
  const skillCommit = await skillService.commitGuiIntent(skillScope, {
    expectedParentNodeId: skillGenesis.nodeId,
    expectedParentStateHash: skillGenesis.stateHash,
    intent: { type: 'skill.update', skillKey: 'fireball', fields: { Desc: 'Committed description', Level: 4 } },
    anchor: { lineageAnchorId: 'root' },
    requestId: 'gui-skill-update',
  });
  const storedSkillCommit = await new EventStore(skillStorage).readCommit(skillScope, skillCommit.nodeId);
  assert((skillCommit.state.Mainchar.Skills.fireball as any).Desc === 'Committed description'
    && storedSkillCommit.kind === 'gui'
    && storedSkillCommit.note === 'gui-intent:skill.update', 'StateService commits typed Skill edit as an ordinary lineage-scoped GUI transaction');

  const storage = new MemoryJsonStorage();
  const state = new StateService(storage, createReducerRegistry(), createProjectionRegistry());
  const scope = { userId: 'u', chatId: 'gui' };
  const genesis = await state.createGenesis(scope, { state: gear });
  const guiCommit = await state.commitGuiIntent(scope, {
    expectedParentNodeId: genesis.nodeId,
    expectedParentStateHash: genesis.stateHash,
    intent: { type: 'equipment.equip', sourceOwner: { kind: 'player' }, targetOwner: { kind: 'player' }, itemKey: 'sword' },
    anchor: { lineageAnchorId: 'root' },
    requestId: 'gui-1',
  });
  const commit = await new EventStore(storage).readCommit(scope, guiCommit.nodeId);
  assert(commit.kind === 'gui' && commit.anchor.lineageAnchorId === 'root', 'StateService writes GUI mutations as lineage-scoped gui commits');

  let coupledServiceRejected = false;
  try {
    await state.commitGuiIntent(scope, {
      expectedParentNodeId: guiCommit.nodeId,
      expectedParentStateHash: guiCommit.stateHash,
      intent: { type: 'variable.delete', path: ['Mainchar', 'Equipment', 'sword'] },
      anchor: { lineageAnchorId: 'root' },
      requestId: 'gui-equipment-variable-delete',
    });
  } catch (error) {
    coupledServiceRejected = String(error).includes('GUI_VARIABLE_COUPLED_DOMAIN');
  }
  const afterCoupledRejectHead = await new EventStore(storage).resolveStoreHead(scope);
  const afterCoupledRejectState = await state.materializer.materialize(scope, guiCommit.nodeId);
  assert(coupledServiceRejected
    && afterCoupledRejectHead.status === 'ok'
    && afterCoupledRejectHead.head?.semanticTipNodeId === guiCommit.nodeId, 'StateService rejects generic Equipment deletion without writing another StoreRevision');
  assert(Boolean(afterCoupledRejectState.state.Mainchar.Equipment.sword)
    && afterCoupledRejectState.state.Mainchar.Strength[0] === 7
    && afterCoupledRejectState.state.Mainchar.Physical_attack[0] === 19, 'rejected Variables Equipment mutation leaves coupled equipment/stat state unchanged');

  const root = await state.anchors.readRoot(scope);
  assert(Boolean(root), 'root anchor exists');
  root!.tipNodeId = guiCommit.nodeId;
  await state.anchors.putRoot(root!);
  const resolver = new HeadResolver(state.store, state.materializer, state.anchors, new TranscriptAttemptStore(storage), new VariantIndexStore(storage));
  const resolved = await resolver.resolve(scope, genesis.nodeId, []);
  assert(resolved.health === 'ok' && resolved.nodeId === guiCommit.nodeId, 'GUI commit becomes semantic head after lineage anchor binding');

  const offscreen = computeRecentChanges(genesis.state, guiCommit.state);
  assert(Boolean(offscreen?.Inventory?.player) && Boolean(offscreen?.Equipment?.player) && offscreen?.Stats?.Strength?.to === 7, 'GUI commit automatically surfaces as net RecentChanges');

  let staleRejected = false;
  try {
    await state.commitGuiIntent(scope, {
      expectedParentNodeId: genesis.nodeId,
      expectedParentStateHash: 'stale-hash',
      intent: { type: 'inventory.delete', owner: { kind: 'player' }, itemKey: 'sword' },
      anchor: { lineageAnchorId: 'root' },
      requestId: 'gui-stale',
    });
  } catch (error) {
    staleRejected = String(error).includes('GUI_COMMIT_CONFLICT');
  }
  assert(staleRejected, 'stale GUI state hash fails closed');

  const controlScope = { userId: 'u', chatId: 'legacy-controls-gui' };
  const controlGenesis = await state.createGenesis(controlScope, { state: controls });
  const controlCommit = await state.commitGuiIntent(controlScope, {
    expectedParentNodeId: controlGenesis.nodeId,
    expectedParentStateHash: controlGenesis.stateHash,
    intent: { type: 'familiar.flag.set', familiarId: 'evelyn', field: 'Is_present', value: false },
    anchor: { lineageAnchorId: 'root' },
    requestId: 'gui-familiar-present',
  });
  assert((controlCommit.state.Familiar.evelyn as any).Is_present === false, 'StateService commits Familiar toggle through validated GUI path');
  const controlArtifact = await new EventStore(storage).readCommit(controlScope, controlCommit.nodeId);
  assert(controlArtifact.kind === 'gui' && controlArtifact.note === 'gui-intent:familiar.flag.set', 'Familiar toggle remains an ordinary typed gui commit');

  const variableScope = { userId: 'u', chatId: 'variables-gui' };
  const variableGenesis = await state.createGenesis(variableScope, { state: variables });
  const variableCommit = await state.commitGuiIntent(variableScope, {
    expectedParentNodeId: variableGenesis.nodeId,
    expectedParentStateHash: variableGenesis.stateHash,
    intent: { type: 'variable.rename', path: ['Mainchar', 'Inventory', 'Серебро'], newKey: 'Монеты' },
    anchor: { lineageAnchorId: 'root' },
    requestId: 'gui-variable-rename',
  });
  assert(Boolean(variableCommit.state.Mainchar.Inventory['Монеты']), 'StateService commits Variables edits as validated gui state');
  const variableArtifact = await new EventStore(storage).readCommit(variableScope, variableCommit.nodeId);
  assert(variableArtifact.kind === 'gui' && variableArtifact.note === 'gui-intent:variable.rename', 'Variables StateService commit remains an ordinary typed gui commit');

  console.log(`phase8 GUI intent tests passed: ${passed}`);
}
void main();
