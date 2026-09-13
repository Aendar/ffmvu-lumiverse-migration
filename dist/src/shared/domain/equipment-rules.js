import { asRecord, isRecord, text, tupleValue } from './value-utils.js';
export const EQUIPMENT_RECONCILIATION_VERSION = 'equipment-derived-v1';
export const EQUIP_STAT_MAP = {
    StrBonus: 'Strength',
    AgiBonus: 'Agility',
    IntBonus: 'Intelligence',
    ConBonus: 'Constitution',
    WisBonus: 'Wisdom',
    ChaBonus: 'Charisma',
};
export const SLOT_LIMITS = {
    Hand: 2,
    Body: 1,
    Finger: 2,
    Wrist: 2,
    Ankle: 2,
    Neck: 1,
    Misc: 10,
};
export const ACCESSORY_SLOTS = new Set(['Finger', 'Wrist', 'Ankle', 'Neck']);
export function numericValue(owner, key, fallback = 0) {
    const n = Number(tupleValue(owner[key]));
    return Number.isFinite(n) ? n : fallback;
}
export function setNumeric(owner, key, value) {
    const current = owner[key];
    if (Array.isArray(current) && current.length >= 2 && typeof current[1] === 'string')
        current[0] = value;
    else
        owner[key] = value;
}
export function applyEquipmentItemStatDelta(owner, item, direction) {
    for (const [itemKey, statKey] of Object.entries(EQUIP_STAT_MAP)) {
        if (item[itemKey] === undefined)
            continue;
        const bonus = Number(item[itemKey]) || 0;
        if (!bonus)
            continue;
        setNumeric(owner, statKey, numericValue(owner, statKey, 0) + direction * bonus);
    }
}
function aggregateEquipmentStatBonuses(equipmentValue) {
    const totals = {};
    for (const itemKey of Object.keys(EQUIP_STAT_MAP))
        totals[itemKey] = 0;
    for (const raw of Object.values(asRecord(equipmentValue))) {
        if (!isRecord(raw))
            continue;
        for (const itemKey of Object.keys(EQUIP_STAT_MAP)) {
            const n = Number(raw[itemKey] ?? 0);
            if (Number.isFinite(n))
                totals[itemKey] += n;
        }
    }
    return totals;
}
/**
 * The stored core attributes include active equipment stat bonuses in the
 * current FFMVU schema. When model JSONPatch changes Equipment, apply only the
 * aggregate equipment delta to the already-written post-model attributes.
 * This preserves independent model changes to the same core stat while keeping
 * equipment effects identical to typed GUI equip/unequip behavior.
 */
export function applyEquipmentAggregateStatDelta(owner, beforeEquipment, afterEquipment) {
    const before = aggregateEquipmentStatBonuses(beforeEquipment);
    const after = aggregateEquipmentStatBonuses(afterEquipment);
    for (const [itemKey, statKey] of Object.entries(EQUIP_STAT_MAP)) {
        const delta = (after[itemKey] ?? 0) - (before[itemKey] ?? 0);
        if (delta)
            setNumeric(owner, statKey, numericValue(owner, statKey, 0) + delta);
    }
}
/**
 * Validate the same runtime slot/cap model used by the typed GUI path. Direct
 * model JSONPatch has no unambiguous custody/source semantics for an automatic
 * displacement, so over-cap model equipment is rejected atomically instead of
 * inventing an inventory transfer.
 */
export function assertEquipmentCapacity(owner) {
    const equipment = asRecord(owner.Equipment);
    let accessoryCount = 0;
    const ordinaryCounts = new Map();
    for (const [key, raw] of Object.entries(equipment)) {
        if (!isRecord(raw))
            throw new Error('EQUIPMENT_RECONCILIATION_INVALID_ITEM: ' + key);
        const slot = text(raw.Slot || raw.slot).trim();
        if (!slot || SLOT_LIMITS[slot] === undefined)
            throw new Error('EQUIPMENT_RECONCILIATION_INVALID_SLOT: ' + (slot || '<empty>'));
        if (ACCESSORY_SLOTS.has(slot))
            accessoryCount += 1;
        else
            ordinaryCounts.set(slot, (ordinaryCounts.get(slot) ?? 0) + 1);
    }
    if (accessoryCount > 3)
        throw new Error('EQUIPMENT_RECONCILIATION_ACCESSORY_LIMIT');
    for (const [slot, count] of ordinaryCounts) {
        if (count > SLOT_LIMITS[slot])
            throw new Error('EQUIPMENT_RECONCILIATION_SLOT_LIMIT: ' + slot);
    }
}
/**
 * Canonical current derived-stat formula owner. This runs only while preparing
 * a new explicit transaction; historical replay never calls it.
 */
export function recalculateEquipmentDerivedStats(owner) {
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
//# sourceMappingURL=equipment-rules.js.map