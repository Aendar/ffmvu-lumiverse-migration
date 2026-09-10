import { pointerParts } from '../json-pointer.js';
import { asRecord, clone, isRecord } from './value-utils.js';
import { applyEquipmentAggregateStatDelta, assertEquipmentCapacity, recalculateEquipmentDerivedStats, } from './equipment-rules.js';
const DERIVED_INPUT_FIELDS = new Set([
    'Level',
    'Strength',
    'Agility',
    'Constitution',
    'Intelligence',
    'Wisdom',
    'Equipment',
]);
function mergeTarget(targets, target) {
    const key = target.kind === 'player' ? 'player' : 'familiar:' + target.id;
    const existing = targets.get(key);
    if (!existing) {
        targets.set(key, target);
        return;
    }
    existing.equipmentTouched = existing.equipmentTouched || target.equipmentTouched;
}
function allFamiliarIds(before, after) {
    return [...new Set([...Object.keys(asRecord(before.Familiar)), ...Object.keys(asRecord(after.Familiar))])];
}
function collectTargets(before, after, patch) {
    const targets = new Map();
    for (const operation of patch) {
        const parts = pointerParts(operation.path);
        if (!parts.length)
            continue;
        if (parts[0] === 'Mainchar') {
            if (parts.length === 1) {
                mergeTarget(targets, { kind: 'player', equipmentTouched: true });
                continue;
            }
            if (DERIVED_INPUT_FIELDS.has(parts[1])) {
                mergeTarget(targets, { kind: 'player', equipmentTouched: parts[1] === 'Equipment' });
            }
            continue;
        }
        if (parts[0] !== 'Familiar')
            continue;
        if (parts.length === 1) {
            for (const id of allFamiliarIds(before, after)) {
                mergeTarget(targets, { kind: 'familiar', id, equipmentTouched: true });
            }
            continue;
        }
        const id = parts[1];
        if (parts.length === 2) {
            mergeTarget(targets, { kind: 'familiar', id, equipmentTouched: true });
            continue;
        }
        if (DERIVED_INPUT_FIELDS.has(parts[2])) {
            mergeTarget(targets, { kind: 'familiar', id, equipmentTouched: parts[2] === 'Equipment' });
        }
    }
    return [...targets.values()];
}
function familiarOwner(state, id) {
    const owner = asRecord(state.Familiar)[id];
    return isRecord(owner) ? owner : null;
}
/**
 * Future-only deterministic reconciliation for current-schema model writes.
 * Callers persist the returned diff as an explicit system commit; replay never
 * reruns these formulas against historical nodes.
 */
export function reconcileModelEquipmentState(before, afterModel, canonicalPatch) {
    const next = clone(afterModel);
    for (const target of collectTargets(before, afterModel, canonicalPatch)) {
        const beforeOwner = target.kind === 'player'
            ? before.Mainchar
            : familiarOwner(before, target.id);
        const nextOwner = target.kind === 'player'
            ? next.Mainchar
            : familiarOwner(next, target.id);
        // Removing a Familiar removes its derived state with it; there is nothing
        // left to reconcile for that owner.
        if (!nextOwner)
            continue;
        if (target.equipmentTouched) {
            assertEquipmentCapacity(nextOwner);
            applyEquipmentAggregateStatDelta(nextOwner, beforeOwner?.Equipment, nextOwner.Equipment);
        }
        recalculateEquipmentDerivedStats(nextOwner);
    }
    return next;
}
//# sourceMappingURL=equipment-reconciliation.js.map