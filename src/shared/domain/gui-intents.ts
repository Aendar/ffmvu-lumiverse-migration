import { canonicalStringify } from '../hashing.js';
import type { JsonPatchOperation } from '../json-patch.js';
import type { FFMVUState, JsonValue, MutableRecord } from '../state-schema.js';
import { asRecord, clone, isRecord, text, tupleValue } from './value-utils.js';
import { isGuiVariableCoupledDomainPath, isGuiVariableDynamicCollectionPath } from './gui-variable-policy.js';

export type GuiOwnerRef =
  | { kind: 'player' }
  | { kind: 'familiar'; id: string };

export type GuiPath = string[];

export type GuiImageRef =
  | { kind: 'player-avatar' }
  | { kind: 'familiar-avatar'; id: string }
  | { kind: 'world-map' };

export type GuiFamiliarFlag = 'Is_present' | 'Is_in_battle_team';
export type GuiCharacterRecordCollection = 'Skills' | 'Talents';

export type GuiIntent =
  | { type: 'outfit.move'; owner: GuiOwnerRef; from: 'Worn' | 'Wardrobe'; itemKey: string }
  | { type: 'inventory.delete'; owner: GuiOwnerRef; itemKey: string }
  | { type: 'equipment.equip'; sourceOwner: GuiOwnerRef; targetOwner: GuiOwnerRef; itemKey: string }
  | { type: 'equipment.unequip'; owner: GuiOwnerRef; equipmentKey: string }
  | { type: 'image.set'; target: GuiImageRef; value: string }
  | { type: 'familiar.flag.set'; familiarId: string; field: GuiFamiliarFlag; value: boolean }
  | { type: 'character.record.update'; owner: GuiOwnerRef; collection: GuiCharacterRecordCollection; itemKey: string; updates: Record<string, JsonValue> }
  | { type: 'character.record.delete'; owner: GuiOwnerRef; collection: GuiCharacterRecordCollection; itemKey: string }
  | { type: 'variable.set'; path: GuiPath; value: JsonValue }
  | { type: 'variable.rename'; path: GuiPath; newKey: string }
  | { type: 'variable.delete'; path: GuiPath }
  | { type: 'variable.add'; parentPath: GuiPath; key: string; value: JsonValue };

function isOwnerRef(value: unknown): value is GuiOwnerRef {
  if (!isRecord(value)) return false;
  if (value.kind === 'player') return true;
  return value.kind === 'familiar' && typeof value.id === 'string' && Boolean(value.id.trim());
}

function isImageRef(value: unknown): value is GuiImageRef {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'player-avatar' || value.kind === 'world-map') return true;
  return value.kind === 'familiar-avatar' && typeof value.id === 'string' && Boolean(value.id.trim());
}

function validImageUrl(value: string): boolean {
  if (!value) return true;
  if (value.length > 4096) return false;
  const lower = value.toLowerCase();
  return lower.startsWith('http://') || lower.startsWith('https://');
}

const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const PROTECTED_ROOT_KEYS = new Set([
  'World_Calc', 'World', 'Mainchar', 'Familiar', 'Narrative',
  'MVUStatMenu_DB_Ver', 'GameStarted',
]);

function assertSafeKey(key: unknown, label: string): asserts key is string {
  if (typeof key !== 'string' || !key.trim() || key.length > 256 || FORBIDDEN_PATH_SEGMENTS.has(key)) {
    throw new Error('GUI_VARIABLE_INVALID_' + label.toUpperCase());
  }
}

function assertGuiPath(path: unknown, allowRoot = true): asserts path is GuiPath {
  if (!Array.isArray(path) || (!allowRoot && path.length === 0) || path.length > 64) {
    throw new Error('GUI_VARIABLE_INVALID_PATH');
  }
  for (const segment of path) assertSafeKey(segment, 'path_segment');
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 64) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(child => isJsonValue(child, depth + 1));
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([key, child]) =>
    !FORBIDDEN_PATH_SEGMENTS.has(key) && isJsonValue(child, depth + 1)
  );
}

function assertVariablePayload(value: unknown): asserts value is JsonValue {
  if (!isJsonValue(value)) throw new Error('GUI_VARIABLE_VALUE_NOT_JSON');
}

export function assertGuiIntent(value: unknown): asserts value is GuiIntent {
  if (!isRecord(value) || typeof value.type !== 'string') throw new Error('GUI_INTENT_INVALID');
  if (value.type === 'outfit.move') {
    if (!isOwnerRef(value.owner) || !['Worn', 'Wardrobe'].includes(String(value.from)) || typeof value.itemKey !== 'string' || !value.itemKey) {
      throw new Error('GUI_INTENT_INVALID_OUTFIT_MOVE');
    }
    return;
  }
  if (value.type === 'inventory.delete') {
    if (!isOwnerRef(value.owner) || typeof value.itemKey !== 'string' || !value.itemKey) throw new Error('GUI_INTENT_INVALID_INVENTORY_DELETE');
    return;
  }
  if (value.type === 'equipment.equip') {
    if (!isOwnerRef(value.sourceOwner) || !isOwnerRef(value.targetOwner) || typeof value.itemKey !== 'string' || !value.itemKey) {
      throw new Error('GUI_INTENT_INVALID_EQUIP');
    }
    return;
  }
  if (value.type === 'equipment.unequip') {
    if (!isOwnerRef(value.owner) || typeof value.equipmentKey !== 'string' || !value.equipmentKey) throw new Error('GUI_INTENT_INVALID_UNEQUIP');
    return;
  }
  if (value.type === 'image.set') {
    if (!isImageRef(value.target) || typeof value.value !== 'string' || !validImageUrl(value.value.trim())) {
      throw new Error('GUI_INTENT_INVALID_IMAGE');
    }
    return;
  }
  if (value.type === 'familiar.flag.set') {
    if (typeof value.familiarId !== 'string' || !value.familiarId.trim()
      || !['Is_present', 'Is_in_battle_team'].includes(String(value.field))
      || typeof value.value !== 'boolean') {
      throw new Error('GUI_INTENT_INVALID_FAMILIAR_FLAG');
    }
    return;
  }
  if (value.type === 'character.record.update') {
    if (!isOwnerRef(value.owner) || !['Skills', 'Talents'].includes(String(value.collection))) throw new Error('GUI_INTENT_INVALID_CHARACTER_RECORD_UPDATE');
    assertSafeKey(value.itemKey, 'item_key');
    if (!isRecord(value.updates)) throw new Error('GUI_INTENT_INVALID_CHARACTER_RECORD_UPDATE');
    for (const [key, child] of Object.entries(value.updates)) {
      assertSafeKey(key, 'field');
      if (['$meta', '$key', 'template', 'name'].includes(key) || !isJsonValue(child)) throw new Error('GUI_INTENT_INVALID_CHARACTER_RECORD_UPDATE');
    }
    return;
  }
  if (value.type === 'character.record.delete') {
    if (!isOwnerRef(value.owner) || !['Skills', 'Talents'].includes(String(value.collection))) throw new Error('GUI_INTENT_INVALID_CHARACTER_RECORD_DELETE');
    assertSafeKey(value.itemKey, 'item_key');
    return;
  }
  if (value.type === 'variable.set') {
    assertGuiPath(value.path, false);
    assertVariablePayload(value.value);
    return;
  }
  if (value.type === 'variable.rename') {
    assertGuiPath(value.path, false);
    assertSafeKey(value.newKey, 'new_key');
    return;
  }
  if (value.type === 'variable.delete') {
    assertGuiPath(value.path, false);
    return;
  }
  if (value.type === 'variable.add') {
    assertGuiPath(value.parentPath, true);
    assertSafeKey(value.key, 'key');
    assertVariablePayload(value.value);
    return;
  }
  throw new Error('GUI_INTENT_UNSUPPORTED: ' + value.type);
}

const EQUIP_STAT_MAP: Record<string, string> = {
  StrBonus: 'Strength',
  AgiBonus: 'Agility',
  IntBonus: 'Intelligence',
  ConBonus: 'Constitution',
  WisBonus: 'Wisdom',
  ChaBonus: 'Charisma',
};

const SLOT_LIMITS: Record<string, number> = {
  Hand: 2,
  Body: 1,
  Finger: 2,
  Wrist: 2,
  Ankle: 2,
  Neck: 1,
  Misc: 10,
};

const ACCESSORY_SLOTS = new Set(['Finger', 'Wrist', 'Ankle', 'Neck']);

function same(a: unknown, b: unknown): boolean {
  if (a === undefined || b === undefined) return a === b;
  return canonicalStringify(a) === canonicalStringify(b);
}

function ownerRecord(state: FFMVUState, owner: GuiOwnerRef): MutableRecord {
  if (owner.kind === 'player') return state.Mainchar as unknown as MutableRecord;
  const familiar = asRecord(state.Familiar)[owner.id];
  if (!isRecord(familiar)) throw new Error('GUI_OWNER_NOT_FOUND: familiar ' + owner.id);
  return familiar;
}

function requireCollection(owner: MutableRecord, key: string, create = false): MutableRecord {
  if (isRecord(owner[key])) return owner[key] as MutableRecord;
  if (!create) throw new Error('GUI_COLLECTION_NOT_FOUND: ' + key);
  owner[key] = {};
  return owner[key] as MutableRecord;
}

function setScalarPreservingTuple(owner: MutableRecord, key: string, value: string | boolean): void {
  const current = owner[key];
  if (Array.isArray(current) && current.length >= 2 && typeof current[1] === 'string') current[0] = value;
  else owner[key] = value;
}

function imageSet(state: FFMVUState, intent: Extract<GuiIntent, { type: 'image.set' }>): void {
  const value = intent.value.trim();
  if (!validImageUrl(value)) throw new Error('GUI_IMAGE_URL_INVALID');
  if (intent.target.kind === 'player-avatar') {
    setScalarPreservingTuple(state.Mainchar as unknown as MutableRecord, 'Image', value);
    return;
  }
  if (intent.target.kind === 'world-map') {
    setScalarPreservingTuple(state.World as unknown as MutableRecord, 'MapImage', value);
    return;
  }
  const familiar = ownerRecord(state, { kind: 'familiar', id: intent.target.id });
  setScalarPreservingTuple(familiar, 'Image', value);
}

function familiarFlagSet(state: FFMVUState, intent: Extract<GuiIntent, { type: 'familiar.flag.set' }>): void {
  const familiar = ownerRecord(state, { kind: 'familiar', id: intent.familiarId });
  setScalarPreservingTuple(familiar, intent.field, intent.value);
}

function numericValue(owner: MutableRecord, key: string, fallback = 0): number {
  const n = Number(tupleValue(owner[key]));
  return Number.isFinite(n) ? n : fallback;
}

function setNumeric(owner: MutableRecord, key: string, value: number): void {
  const current = owner[key];
  if (Array.isArray(current) && current.length >= 2 && typeof current[1] === 'string') {
    current[0] = value;
  } else {
    owner[key] = value;
  }
}

function applyEquipStats(owner: MutableRecord, item: MutableRecord, direction: 1 | -1): void {
  for (const [itemKey, statKey] of Object.entries(EQUIP_STAT_MAP)) {
    if (item[itemKey] === undefined) continue;
    const bonus = Number(item[itemKey]) || 0;
    if (!bonus) continue;
    setNumeric(owner, statKey, numericValue(owner, statKey, 0) + direction * bonus);
  }
}

function recalculateDerivedStats(owner: MutableRecord): void {
  const level = numericValue(owner, 'Level', 1);
  const con = numericValue(owner, 'Constitution', 0);
  const str = numericValue(owner, 'Strength', 0);
  const agi = numericValue(owner, 'Agility', 0);
  const intel = numericValue(owner, 'Intelligence', 0);
  const wis = numericValue(owner, 'Wisdom', 0);

  let eqHP = 0;
  let eqMP = 0;
  let eqPAtk = 0;
  let eqMAtk = 0;
  let eqPDef = 0;
  let eqMDef = 0;
  for (const raw of Object.values(asRecord(owner.Equipment))) {
    if (!isRecord(raw)) continue;
    eqHP += Number(raw.MaxHPBonus || 0);
    eqMP += Number(raw.MaxMPBonus || 0);
    eqPAtk += Number(raw.WeaponDamage || 0);
    eqMAtk += Number(raw.WeaponMagDamage || 0);
    eqPDef += Number(raw.ArmorPDefBonus || 0);
    eqMDef += Number(raw.ArmorMDefBonus || 0);
  }

  const oldMaxHp = numericValue(owner, 'Hp_max', 0);
  const oldMaxMp = numericValue(owner, 'Mp_max', 0);
  const oldMaxSta = numericValue(owner, 'Sta_max', 0);

  const hpMax = Math.floor(20 + con * 3 + level * 6) + eqHP;
  const staMax = Math.floor(50 + con * 3 + agi * 2 + Math.floor(level * 5 / 3));
  const mpMax = Math.floor((50 + intel * 4 + wis * 2 + level * 5) / 3) + eqMP;
  const pAtk = Math.floor(str * 2 + level * 2) + eqPAtk;
  const mAtk = Math.floor(intel * 2 + level * 2) + eqMAtk;
  const pDef = Math.floor(con / 2 + level * 3) + eqPDef;
  const mDef = Math.floor(wis / 2 + level * 3) + eqMDef;
  const mAssist = Math.floor(wis * 1.5 + intel * 0.5 + level * 1.5);

  setNumeric(owner, 'Hp_max', hpMax);
  setNumeric(owner, 'Mp_max', mpMax);
  setNumeric(owner, 'Sta_max', staMax);
  setNumeric(owner, 'Physical_attack', pAtk);
  setNumeric(owner, 'Magic_attack', mAtk);
  setNumeric(owner, 'Physical_defense', pDef);
  setNumeric(owner, 'Magic_defense', mDef);
  setNumeric(owner, 'Magic_assist', mAssist);

  if (oldMaxHp > 0) setNumeric(owner, 'Hp_curr', Math.max(0, numericValue(owner, 'Hp_curr', 0) + (hpMax - oldMaxHp)));
  if (oldMaxMp > 0) setNumeric(owner, 'Mp_curr', Math.max(0, numericValue(owner, 'Mp_curr', 0) + (mpMax - oldMaxMp)));
  if (oldMaxSta > 0) setNumeric(owner, 'Sta_curr', Math.max(0, numericValue(owner, 'Sta_curr', 0) + (staMax - oldMaxSta)));

  if (numericValue(owner, 'Hp_curr', 0) > hpMax) setNumeric(owner, 'Hp_curr', hpMax);
  if (numericValue(owner, 'Mp_curr', 0) > mpMax) setNumeric(owner, 'Mp_curr', mpMax);
  if (numericValue(owner, 'Sta_curr', 0) > staMax) setNumeric(owner, 'Sta_curr', staMax);
}

function uniqueKey(record: MutableRecord, preferred: string, separator: string): string {
  if (!Object.prototype.hasOwnProperty.call(record, preferred)) return preferred;
  let index = 2;
  while (Object.prototype.hasOwnProperty.call(record, preferred + separator + index)) index += 1;
  return preferred + separator + index;
}

function moveOutfit(state: FFMVUState, intent: Extract<GuiIntent, { type: 'outfit.move' }>): void {
  const owner = ownerRecord(state, intent.owner);
  if (!isRecord(owner.Outfit)) owner.Outfit = { Initialized: false, Worn: {}, Wardrobe: {} };
  const outfit = owner.Outfit as MutableRecord;
  const worn = requireCollection(outfit, 'Worn', true);
  const wardrobe = requireCollection(outfit, 'Wardrobe', true);
  const source = intent.from === 'Worn' ? worn : wardrobe;
  const target = intent.from === 'Worn' ? wardrobe : worn;
  const rawItem = source[intent.itemKey];
  if (!isRecord(rawItem)) throw new Error('GUI_OUTFIT_ITEM_NOT_FOUND: ' + intent.itemKey);
  const item = clone(rawItem);

  if (intent.from === 'Wardrobe' && text(item.Slot) !== 'Extra') {
    for (const [wornKey, wornRaw] of Object.entries(worn)) {
      if (!isRecord(wornRaw)) continue;
      if (wornRaw.Slot !== item.Slot || wornRaw.Layer !== item.Layer) continue;
      wardrobe[uniqueKey(wardrobe, wornKey, '_')] = clone(wornRaw);
      delete worn[wornKey];
    }
  }

  target[uniqueKey(target, intent.itemKey, '_')] = item;
  delete source[intent.itemKey];
  outfit.Initialized = true;
}

function inventoryDelete(state: FFMVUState, intent: Extract<GuiIntent, { type: 'inventory.delete' }>): void {
  const inventory = requireCollection(ownerRecord(state, intent.owner), 'Inventory', false);
  if (!Object.prototype.hasOwnProperty.call(inventory, intent.itemKey)) {
    throw new Error('GUI_INVENTORY_ITEM_NOT_FOUND: ' + intent.itemKey);
  }
  delete inventory[intent.itemKey];
}

function equippedInSlot(equipment: MutableRecord, slot: string): Array<{ key: string; item: MutableRecord }> {
  const out: Array<{ key: string; item: MutableRecord }> = [];
  for (const [key, raw] of Object.entries(equipment)) {
    if (isRecord(raw) && raw.Slot === slot) out.push({ key, item: raw });
  }
  return out;
}

function accessoryCount(equipment: MutableRecord): number {
  let count = 0;
  for (const raw of Object.values(equipment)) {
    if (isRecord(raw) && ACCESSORY_SLOTS.has(text(raw.Slot))) count += 1;
  }
  return count;
}

function reverseEquipAndReturn(owner: MutableRecord, equipment: MutableRecord, equipKey: string, equipData: MutableRecord, inventory: MutableRecord): void {
  applyEquipStats(owner, equipData, -1);
  delete equipment[equipKey];
  recalculateDerivedStats(owner);

  const invItem = clone(equipData);
  invItem.Qty = 1;
  if (isRecord(inventory[equipKey])) {
    const existing = inventory[equipKey] as MutableRecord;
    existing.Qty = (Number(existing.Qty) || 0) + 1;
  } else {
    inventory[equipKey] = invItem;
  }
}

function equipmentEquip(state: FFMVUState, intent: Extract<GuiIntent, { type: 'equipment.equip' }>): void {
  const sourceOwner = ownerRecord(state, intent.sourceOwner);
  const targetOwner = ownerRecord(state, intent.targetOwner);
  const sourceInventory = requireCollection(sourceOwner, 'Inventory', false);
  const rawItem = sourceInventory[intent.itemKey];
  if (!isRecord(rawItem)) throw new Error('GUI_INVENTORY_ITEM_NOT_FOUND: ' + intent.itemKey);
  const item = clone(rawItem);
  const equipment = requireCollection(targetOwner, 'Equipment', true);

  const slot = text(item.Slot || item.slot).trim();
  if (!slot) throw new Error('GUI_EQUIP_MISSING_SLOT');

  const autoUnequip: Array<{ key: string; item: MutableRecord }> = [];
  if (ACCESSORY_SLOTS.has(slot)) {
    if (accessoryCount(equipment) >= 3) throw new Error('GUI_ACCESSORY_LIMIT_REACHED');
  } else if (SLOT_LIMITS[slot] !== undefined) {
    const current = equippedInSlot(equipment, slot);
    const limit = SLOT_LIMITS[slot];
    if (current.length >= limit) {
      autoUnequip.push(...current.slice(0, current.length - limit + 1));
    }
  } else {
    throw new Error('GUI_EQUIP_INVALID_SLOT: ' + slot);
  }

  for (const old of autoUnequip) {
    // Legacy StatusMenu parity: automatic unequips return to the inventory
    // that supplied the newly equipped item, even when targetOwner differs.
    reverseEquipAndReturn(targetOwner, equipment, old.key, old.item, sourceInventory);
  }

  applyEquipStats(targetOwner, item, 1);
  const finalEquipData = clone(item);
  delete finalEquipData.Qty;
  delete finalEquipData.$key;
  delete finalEquipData.$raw;
  const finalItemKey = uniqueKey(equipment, intent.itemKey, ' ');
  equipment[finalItemKey] = finalEquipData;

  const sourceRaw = sourceInventory[intent.itemKey];
  if (isRecord(sourceRaw) && sourceRaw.Qty) {
    const qty = Number(sourceRaw.Qty);
    if (qty > 1) sourceRaw.Qty = qty - 1;
    else delete sourceInventory[intent.itemKey];
  } else {
    delete sourceInventory[intent.itemKey];
  }

  recalculateDerivedStats(targetOwner);
}

function equipmentUnequip(state: FFMVUState, intent: Extract<GuiIntent, { type: 'equipment.unequip' }>): void {
  const owner = ownerRecord(state, intent.owner);
  const equipment = requireCollection(owner, 'Equipment', false);
  const raw = equipment[intent.equipmentKey];
  if (!isRecord(raw)) throw new Error('GUI_EQUIPMENT_ITEM_NOT_FOUND: ' + intent.equipmentKey);
  const inventory = requireCollection(owner, 'Inventory', true);
  reverseEquipAndReturn(owner, equipment, intent.equipmentKey, clone(raw), inventory);
}

function characterRecordUpdate(state: FFMVUState, intent: Extract<GuiIntent, { type: 'character.record.update' }>): void {
  const collection = requireCollection(ownerRecord(state, intent.owner), intent.collection, false);
  const current = collection[intent.itemKey];
  if (!isRecord(current)) throw new Error('GUI_CHARACTER_RECORD_NOT_FOUND: ' + intent.itemKey);
  for (const [key, value] of Object.entries(intent.updates)) current[key] = clone(value);
}

function characterRecordDelete(state: FFMVUState, intent: Extract<GuiIntent, { type: 'character.record.delete' }>): void {
  const collection = requireCollection(ownerRecord(state, intent.owner), intent.collection, false);
  if (!Object.prototype.hasOwnProperty.call(collection, intent.itemKey)) throw new Error('GUI_CHARACTER_RECORD_NOT_FOUND: ' + intent.itemKey);
  delete collection[intent.itemKey];
}

function pathParent(root: unknown, path: GuiPath): { parent: MutableRecord | unknown[]; key: string } {
  if (!path.length) throw new Error('GUI_VARIABLE_ROOT_MUTATION_FORBIDDEN');
  let current: unknown = root;
  for (const segment of path.slice(0, -1)) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) throw new Error('GUI_VARIABLE_PATH_NOT_FOUND');
      current = current[index];
      continue;
    }
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) throw new Error('GUI_VARIABLE_PATH_NOT_FOUND');
    current = current[segment];
  }
  if (!isRecord(current) && !Array.isArray(current)) throw new Error('GUI_VARIABLE_PARENT_NOT_CONTAINER');
  return { parent: current as MutableRecord | unknown[], key: path[path.length - 1] };
}

function hasContainerKey(parent: MutableRecord | unknown[], key: string): boolean {
  if (Array.isArray(parent)) {
    const index = Number(key);
    return Number.isInteger(index) && index >= 0 && index < parent.length;
  }
  return Object.prototype.hasOwnProperty.call(parent, key);
}

function protectedRootMutation(path: GuiPath): boolean {
  return path.length === 1 && PROTECTED_ROOT_KEYS.has(path[0]);
}

function assertVariablePathNotCoupled(path: GuiPath): void {
  if (isGuiVariableCoupledDomainPath(path)) throw new Error('GUI_VARIABLE_COUPLED_DOMAIN');
}

function variableSet(state: FFMVUState, intent: Extract<GuiIntent, { type: 'variable.set' }>): void {
  if (protectedRootMutation(intent.path)) throw new Error('GUI_VARIABLE_PROTECTED_ROOT');
  assertVariablePathNotCoupled(intent.path);
  const { parent, key } = pathParent(state, intent.path);
  if (!hasContainerKey(parent, key)) throw new Error('GUI_VARIABLE_PATH_NOT_FOUND');
  if (Array.isArray(parent)) {
    const index = Number(key);
    if (!Number.isInteger(index)) throw new Error('GUI_VARIABLE_ARRAY_INDEX_INVALID');
    parent[index] = clone(intent.value);
  } else {
    parent[key] = clone(intent.value);
  }
}

function variableRename(state: FFMVUState, intent: Extract<GuiIntent, { type: 'variable.rename' }>): void {
  if (protectedRootMutation(intent.path)) throw new Error('GUI_VARIABLE_PROTECTED_ROOT');
  assertVariablePathNotCoupled(intent.path);
  if (!isGuiVariableDynamicCollectionPath(intent.path.slice(0, -1))) throw new Error('GUI_VARIABLE_STRUCTURAL_KEY');
  const { parent, key } = pathParent(state, intent.path);
  if (Array.isArray(parent)) throw new Error('GUI_VARIABLE_RENAME_ARRAY_UNSUPPORTED');
  if (!Object.prototype.hasOwnProperty.call(parent, key)) throw new Error('GUI_VARIABLE_PATH_NOT_FOUND');
  if (key === intent.newKey) throw new Error('GUI_INTENT_NO_CHANGE');
  if (Object.prototype.hasOwnProperty.call(parent, intent.newKey)) throw new Error('GUI_VARIABLE_KEY_EXISTS');
  parent[intent.newKey] = parent[key];
  delete parent[key];
}

function variableDelete(state: FFMVUState, intent: Extract<GuiIntent, { type: 'variable.delete' }>): void {
  if (protectedRootMutation(intent.path)) throw new Error('GUI_VARIABLE_PROTECTED_ROOT');
  assertVariablePathNotCoupled(intent.path);
  if (!isGuiVariableDynamicCollectionPath(intent.path.slice(0, -1))) throw new Error('GUI_VARIABLE_STRUCTURAL_KEY');
  const { parent, key } = pathParent(state, intent.path);
  if (!hasContainerKey(parent, key)) throw new Error('GUI_VARIABLE_PATH_NOT_FOUND');
  if (Array.isArray(parent)) {
    const index = Number(key);
    if (!Number.isInteger(index)) throw new Error('GUI_VARIABLE_ARRAY_INDEX_INVALID');
    parent.splice(index, 1);
  } else {
    delete parent[key];
  }
}

function variableAdd(state: FFMVUState, intent: Extract<GuiIntent, { type: 'variable.add' }>): void {
  assertVariablePathNotCoupled(intent.parentPath);
  if (!isGuiVariableDynamicCollectionPath(intent.parentPath)) throw new Error('GUI_VARIABLE_STRUCTURAL_CONTAINER');
  let parent: unknown = state;
  for (const segment of intent.parentPath) {
    if (Array.isArray(parent)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= parent.length) throw new Error('GUI_VARIABLE_PATH_NOT_FOUND');
      parent = parent[index];
      continue;
    }
    if (!isRecord(parent) || !Object.prototype.hasOwnProperty.call(parent, segment)) throw new Error('GUI_VARIABLE_PATH_NOT_FOUND');
    parent = parent[segment];
  }
  if (!isRecord(parent)) throw new Error('GUI_VARIABLE_ADD_PARENT_NOT_OBJECT');
  if (Object.prototype.hasOwnProperty.call(parent, intent.key)) throw new Error('GUI_VARIABLE_KEY_EXISTS');
  parent[intent.key] = clone(intent.value);
}

export function applyGuiIntent(input: FFMVUState, intent: GuiIntent): FFMVUState {
  const state = clone(input);
  if (intent.type === 'outfit.move') moveOutfit(state, intent);
  else if (intent.type === 'inventory.delete') inventoryDelete(state, intent);
  else if (intent.type === 'equipment.equip') equipmentEquip(state, intent);
  else if (intent.type === 'equipment.unequip') equipmentUnequip(state, intent);
  else if (intent.type === 'image.set') imageSet(state, intent);
  else if (intent.type === 'familiar.flag.set') familiarFlagSet(state, intent);
  else if (intent.type === 'character.record.update') characterRecordUpdate(state, intent);
  else if (intent.type === 'character.record.delete') characterRecordDelete(state, intent);
  else if (intent.type === 'variable.set') variableSet(state, intent);
  else if (intent.type === 'variable.rename') variableRename(state, intent);
  else if (intent.type === 'variable.delete') variableDelete(state, intent);
  else if (intent.type === 'variable.add') variableAdd(state, intent);
  else {
    const neverIntent: never = intent;
    throw new Error('GUI_INTENT_UNSUPPORTED: ' + JSON.stringify(neverIntent));
  }
  return state;
}

function escapePointerToken(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function diffValue(before: unknown, after: unknown, path: string, out: JsonPatchOperation[]): void {
  if (same(before, after)) return;
  if (before === undefined) {
    out.push({ op: 'add', path, value: clone(after) });
    return;
  }
  if (after === undefined) {
    out.push({ op: 'remove', path });
    return;
  }
  if (isRecord(before) && isRecord(after)) {
    const beforeKeys = Object.keys(before);
    const afterKeys = Object.keys(after);
    for (const key of beforeKeys) {
      if (!Object.prototype.hasOwnProperty.call(after, key)) {
        out.push({ op: 'remove', path: path + '/' + escapePointerToken(key) });
      }
    }
    for (const key of afterKeys) {
      const childPath = path + '/' + escapePointerToken(key);
      if (!Object.prototype.hasOwnProperty.call(before, key)) out.push({ op: 'add', path: childPath, value: clone(after[key]) });
      else diffValue(before[key], after[key], childPath, out);
    }
    return;
  }
  out.push({ op: 'replace', path, value: clone(after) });
}

export function buildGuiIntentPatch(before: FFMVUState, after: FFMVUState): JsonPatchOperation[] {
  const out: JsonPatchOperation[] = [];
  diffValue(before, after, '', out);
  return out;
}
