import type { FFMVUState, MutableRecord } from '../../state-schema.js';
import { asRecord, clone, isRecord, text, tupleValue } from '../value-utils.js';
import type { GuiIntent, GuiOwnerRef } from '../gui-intents.js';

type EquipmentIntent = Extract<GuiIntent, { type: 'equipment.equip' | 'equipment.unequip' }>;

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

/**
 * Existing v0.13.25 GUI parity rule. Keep private until the stamina formula and
 * derived-stat ownership are explicitly versioned for model/system reconciliation.
 */
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

function equipmentEquip(state: FFMVUState, intent: Extract<EquipmentIntent, { type: 'equipment.equip' }>): void {
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

function equipmentUnequip(state: FFMVUState, intent: Extract<EquipmentIntent, { type: 'equipment.unequip' }>): void {
  const owner = ownerRecord(state, intent.owner);
  const equipment = requireCollection(owner, 'Equipment', false);
  const raw = equipment[intent.equipmentKey];
  if (!isRecord(raw)) throw new Error('GUI_EQUIPMENT_ITEM_NOT_FOUND: ' + intent.equipmentKey);
  const inventory = requireCollection(owner, 'Inventory', true);
  reverseEquipAndReturn(owner, equipment, intent.equipmentKey, clone(raw), inventory);
}

export function applyEquipmentIntent(inputState: FFMVUState, intent: EquipmentIntent): FFMVUState {
  const state = clone(inputState);
  if (intent.type === 'equipment.equip') equipmentEquip(state, intent);
  else equipmentUnequip(state, intent);
  return state;
}
