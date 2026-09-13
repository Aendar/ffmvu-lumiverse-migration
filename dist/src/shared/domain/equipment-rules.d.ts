import type { MutableRecord } from '../state-schema.js';
export declare const EQUIPMENT_RECONCILIATION_VERSION = "equipment-derived-v1";
export declare const EQUIP_STAT_MAP: Record<string, string>;
export declare const SLOT_LIMITS: Record<string, number>;
export declare const ACCESSORY_SLOTS: Set<string>;
export declare function numericValue(owner: MutableRecord, key: string, fallback?: number): number;
export declare function setNumeric(owner: MutableRecord, key: string, value: number): void;
export declare function applyEquipmentItemStatDelta(owner: MutableRecord, item: MutableRecord, direction: 1 | -1): void;
/**
 * The stored core attributes include active equipment stat bonuses in the
 * current FFMVU schema. When model JSONPatch changes Equipment, apply only the
 * aggregate equipment delta to the already-written post-model attributes.
 * This preserves independent model changes to the same core stat while keeping
 * equipment effects identical to typed GUI equip/unequip behavior.
 */
export declare function applyEquipmentAggregateStatDelta(owner: MutableRecord, beforeEquipment: unknown, afterEquipment: unknown): void;
/**
 * Validate the same runtime slot/cap model used by the typed GUI path. Direct
 * model JSONPatch has no unambiguous custody/source semantics for an automatic
 * displacement, so over-cap model equipment is rejected atomically instead of
 * inventing an inventory transfer.
 */
export declare function assertEquipmentCapacity(owner: MutableRecord): void;
/**
 * Canonical current derived-stat formula owner. This runs only while preparing
 * a new explicit transaction; historical replay never calls it.
 */
export declare function recalculateEquipmentDerivedStats(owner: MutableRecord): void;
