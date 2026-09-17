import type { FFMVUState, MutableRecord } from '../../state-schema.js';
import { asRecord, clone, isRecord, text } from '../value-utils.js';
import type { GuiIntent, GuiOwnerRef } from '../gui-intents.js';
import {
  ACCESSORY_SLOTS,
  SLOT_LIMITS,
  applyEquipmentItemStatDelta,
  recalculateEquipmentDerivedStats,
} from '../equipment-rules.js';

type EquipmentIntent = Extract<GuiIntent, { type: 'equipment.equip' | 'equipment.unequip' }>;

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
  applyEquipmentItemStatDelta(owner, equipData, -1);
  delete equipment[equipKey];
  recalculateEquipmentDerivedStats(owner);

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
    if (current.length >= limit) autoUnequip.push(...current.slice(0, current.length - limit + 1));
  } else {
    throw new Error('GUI_EQUIP_INVALID_SLOT: ' + slot);
  }

  for (const old of autoUnequip) {
    // Legacy StatusMenu parity: automatic unequips return to the inventory
    // that supplied the newly equipped item, even when targetOwner differs.
    reverseEquipAndReturn(targetOwner, equipment, old.key, old.item, sourceInventory);
  }

  applyEquipmentItemStatDelta(targetOwner, item, 1);
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

  recalculateEquipmentDerivedStats(targetOwner);
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
