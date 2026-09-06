import { canonicalStringify } from '../hashing.js';
import { asRecord, clone, isRecord, text, tupleValue } from './value-utils.js';
function isOwnerRef(value) {
    if (!isRecord(value))
        return false;
    if (value.kind === 'player')
        return true;
    return value.kind === 'familiar' && typeof value.id === 'string' && Boolean(value.id.trim());
}
export function assertGuiIntent(value) {
    if (!isRecord(value) || typeof value.type !== 'string')
        throw new Error('GUI_INTENT_INVALID');
    if (value.type === 'outfit.move') {
        if (!isOwnerRef(value.owner) || !['Worn', 'Wardrobe'].includes(String(value.from)) || typeof value.itemKey !== 'string' || !value.itemKey) {
            throw new Error('GUI_INTENT_INVALID_OUTFIT_MOVE');
        }
        return;
    }
    if (value.type === 'inventory.delete') {
        if (!isOwnerRef(value.owner) || typeof value.itemKey !== 'string' || !value.itemKey)
            throw new Error('GUI_INTENT_INVALID_INVENTORY_DELETE');
        return;
    }
    if (value.type === 'equipment.equip') {
        if (!isOwnerRef(value.sourceOwner) || !isOwnerRef(value.targetOwner) || typeof value.itemKey !== 'string' || !value.itemKey) {
            throw new Error('GUI_INTENT_INVALID_EQUIP');
        }
        return;
    }
    if (value.type === 'equipment.unequip') {
        if (!isOwnerRef(value.owner) || typeof value.equipmentKey !== 'string' || !value.equipmentKey)
            throw new Error('GUI_INTENT_INVALID_UNEQUIP');
        return;
    }
    throw new Error('GUI_INTENT_UNSUPPORTED: ' + value.type);
}
const EQUIP_STAT_MAP = {
    StrBonus: 'Strength',
    AgiBonus: 'Agility',
    IntBonus: 'Intelligence',
    ConBonus: 'Constitution',
    WisBonus: 'Wisdom',
    ChaBonus: 'Charisma',
};
const SLOT_LIMITS = {
    Hand: 2,
    Body: 1,
    Finger: 2,
    Wrist: 2,
    Ankle: 2,
    Neck: 1,
    Misc: 10,
};
const ACCESSORY_SLOTS = new Set(['Finger', 'Wrist', 'Ankle', 'Neck']);
function same(a, b) {
    if (a === undefined || b === undefined)
        return a === b;
    return canonicalStringify(a) === canonicalStringify(b);
}
function ownerRecord(state, owner) {
    if (owner.kind === 'player')
        return state.Mainchar;
    const familiar = asRecord(state.Familiar)[owner.id];
    if (!isRecord(familiar))
        throw new Error('GUI_OWNER_NOT_FOUND: familiar ' + owner.id);
    return familiar;
}
function requireCollection(owner, key, create = false) {
    if (isRecord(owner[key]))
        return owner[key];
    if (!create)
        throw new Error('GUI_COLLECTION_NOT_FOUND: ' + key);
    owner[key] = {};
    return owner[key];
}
function numericValue(owner, key, fallback = 0) {
    const n = Number(tupleValue(owner[key]));
    return Number.isFinite(n) ? n : fallback;
}
function setNumeric(owner, key, value) {
    const current = owner[key];
    if (Array.isArray(current) && current.length >= 2 && typeof current[1] === 'string') {
        current[0] = value;
    }
    else {
        owner[key] = value;
    }
}
function applyEquipStats(owner, item, direction) {
    for (const [itemKey, statKey] of Object.entries(EQUIP_STAT_MAP)) {
        if (item[itemKey] === undefined)
            continue;
        const bonus = Number(item[itemKey]) || 0;
        if (!bonus)
            continue;
        setNumeric(owner, statKey, numericValue(owner, statKey, 0) + direction * bonus);
    }
}
function recalculateDerivedStats(owner) {
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
        if (!isRecord(raw))
            continue;
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
    if (oldMaxHp > 0)
        setNumeric(owner, 'Hp_curr', Math.max(0, numericValue(owner, 'Hp_curr', 0) + (hpMax - oldMaxHp)));
    if (oldMaxMp > 0)
        setNumeric(owner, 'Mp_curr', Math.max(0, numericValue(owner, 'Mp_curr', 0) + (mpMax - oldMaxMp)));
    if (oldMaxSta > 0)
        setNumeric(owner, 'Sta_curr', Math.max(0, numericValue(owner, 'Sta_curr', 0) + (staMax - oldMaxSta)));
    if (numericValue(owner, 'Hp_curr', 0) > hpMax)
        setNumeric(owner, 'Hp_curr', hpMax);
    if (numericValue(owner, 'Mp_curr', 0) > mpMax)
        setNumeric(owner, 'Mp_curr', mpMax);
    if (numericValue(owner, 'Sta_curr', 0) > staMax)
        setNumeric(owner, 'Sta_curr', staMax);
}
function uniqueKey(record, preferred, separator) {
    if (!Object.prototype.hasOwnProperty.call(record, preferred))
        return preferred;
    let index = 2;
    while (Object.prototype.hasOwnProperty.call(record, preferred + separator + index))
        index += 1;
    return preferred + separator + index;
}
function moveOutfit(state, intent) {
    const owner = ownerRecord(state, intent.owner);
    if (!isRecord(owner.Outfit))
        owner.Outfit = { Initialized: false, Worn: {}, Wardrobe: {} };
    const outfit = owner.Outfit;
    const worn = requireCollection(outfit, 'Worn', true);
    const wardrobe = requireCollection(outfit, 'Wardrobe', true);
    const source = intent.from === 'Worn' ? worn : wardrobe;
    const target = intent.from === 'Worn' ? wardrobe : worn;
    const rawItem = source[intent.itemKey];
    if (!isRecord(rawItem))
        throw new Error('GUI_OUTFIT_ITEM_NOT_FOUND: ' + intent.itemKey);
    const item = clone(rawItem);
    if (intent.from === 'Wardrobe' && text(item.Slot) !== 'Extra') {
        for (const [wornKey, wornRaw] of Object.entries(worn)) {
            if (!isRecord(wornRaw))
                continue;
            if (wornRaw.Slot !== item.Slot || wornRaw.Layer !== item.Layer)
                continue;
            wardrobe[uniqueKey(wardrobe, wornKey, '_')] = clone(wornRaw);
            delete worn[wornKey];
        }
    }
    target[uniqueKey(target, intent.itemKey, '_')] = item;
    delete source[intent.itemKey];
    outfit.Initialized = true;
}
function inventoryDelete(state, intent) {
    const inventory = requireCollection(ownerRecord(state, intent.owner), 'Inventory', false);
    if (!Object.prototype.hasOwnProperty.call(inventory, intent.itemKey)) {
        throw new Error('GUI_INVENTORY_ITEM_NOT_FOUND: ' + intent.itemKey);
    }
    delete inventory[intent.itemKey];
}
function equippedInSlot(equipment, slot) {
    const out = [];
    for (const [key, raw] of Object.entries(equipment)) {
        if (isRecord(raw) && raw.Slot === slot)
            out.push({ key, item: raw });
    }
    return out;
}
function accessoryCount(equipment) {
    let count = 0;
    for (const raw of Object.values(equipment)) {
        if (isRecord(raw) && ACCESSORY_SLOTS.has(text(raw.Slot)))
            count += 1;
    }
    return count;
}
function reverseEquipAndReturn(owner, equipment, equipKey, equipData, inventory) {
    applyEquipStats(owner, equipData, -1);
    delete equipment[equipKey];
    recalculateDerivedStats(owner);
    const invItem = clone(equipData);
    invItem.Qty = 1;
    if (isRecord(inventory[equipKey])) {
        const existing = inventory[equipKey];
        existing.Qty = (Number(existing.Qty) || 0) + 1;
    }
    else {
        inventory[equipKey] = invItem;
    }
}
function equipmentEquip(state, intent) {
    const sourceOwner = ownerRecord(state, intent.sourceOwner);
    const targetOwner = ownerRecord(state, intent.targetOwner);
    const sourceInventory = requireCollection(sourceOwner, 'Inventory', false);
    const rawItem = sourceInventory[intent.itemKey];
    if (!isRecord(rawItem))
        throw new Error('GUI_INVENTORY_ITEM_NOT_FOUND: ' + intent.itemKey);
    const item = clone(rawItem);
    const equipment = requireCollection(targetOwner, 'Equipment', true);
    const slot = text(item.Slot || item.slot).trim();
    if (!slot)
        throw new Error('GUI_EQUIP_MISSING_SLOT');
    const autoUnequip = [];
    if (ACCESSORY_SLOTS.has(slot)) {
        if (accessoryCount(equipment) >= 3)
            throw new Error('GUI_ACCESSORY_LIMIT_REACHED');
    }
    else if (SLOT_LIMITS[slot] !== undefined) {
        const current = equippedInSlot(equipment, slot);
        const limit = SLOT_LIMITS[slot];
        if (current.length >= limit) {
            autoUnequip.push(...current.slice(0, current.length - limit + 1));
        }
    }
    else {
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
        if (qty > 1)
            sourceRaw.Qty = qty - 1;
        else
            delete sourceInventory[intent.itemKey];
    }
    else {
        delete sourceInventory[intent.itemKey];
    }
    recalculateDerivedStats(targetOwner);
}
function equipmentUnequip(state, intent) {
    const owner = ownerRecord(state, intent.owner);
    const equipment = requireCollection(owner, 'Equipment', false);
    const raw = equipment[intent.equipmentKey];
    if (!isRecord(raw))
        throw new Error('GUI_EQUIPMENT_ITEM_NOT_FOUND: ' + intent.equipmentKey);
    const inventory = requireCollection(owner, 'Inventory', true);
    reverseEquipAndReturn(owner, equipment, intent.equipmentKey, clone(raw), inventory);
}
export function applyGuiIntent(input, intent) {
    const state = clone(input);
    if (intent.type === 'outfit.move')
        moveOutfit(state, intent);
    else if (intent.type === 'inventory.delete')
        inventoryDelete(state, intent);
    else if (intent.type === 'equipment.equip')
        equipmentEquip(state, intent);
    else if (intent.type === 'equipment.unequip')
        equipmentUnequip(state, intent);
    else {
        const neverIntent = intent;
        throw new Error('GUI_INTENT_UNSUPPORTED: ' + JSON.stringify(neverIntent));
    }
    return state;
}
function escapePointerToken(value) {
    return value.replace(/~/g, '~0').replace(/\//g, '~1');
}
function diffValue(before, after, path, out) {
    if (same(before, after))
        return;
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
            if (!Object.prototype.hasOwnProperty.call(before, key))
                out.push({ op: 'add', path: childPath, value: clone(after[key]) });
            else
                diffValue(before[key], after[key], childPath, out);
        }
        return;
    }
    out.push({ op: 'replace', path, value: clone(after) });
}
export function buildGuiIntentPatch(before, after) {
    const out = [];
    diffValue(before, after, '', out);
    return out;
}
//# sourceMappingURL=gui-intents.js.map