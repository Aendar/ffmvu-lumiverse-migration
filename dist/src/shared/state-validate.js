import { REQUIRED_MAINCHAR_TUPLES, REQUIRED_WORLD_TUPLES } from './state-schema.js';
import { asArray, asRecord, isLabeledTuple, isRecord, text } from './domain/value-utils.js';
export function validateState(state) {
    const errors = [];
    if (!isRecord(state))
        return ['stat_data is not an object'];
    const world = asRecord(state.World);
    for (const key of REQUIRED_WORLD_TUPLES) {
        if (!isLabeledTuple(world[key]))
            errors.push('World.' + key + ' is not a labeled tuple');
    }
    const mc = asRecord(state.Mainchar);
    for (const key of REQUIRED_MAINCHAR_TUPLES) {
        if (!isLabeledTuple(mc[key]))
            errors.push('Mainchar.' + key + ' is not a labeled tuple');
    }
    const narrative = state.Narrative;
    if (!isRecord(narrative))
        return [...new Set([...errors, 'Narrative is missing'])];
    const npcs = asRecord(narrative.NPCs);
    const familiarIds = new Set(Object.keys(asRecord(state.Familiar)));
    let highest = 0;
    for (const id of Object.keys(npcs)) {
        if (!/^npc_\d{4,}$/.test(id))
            errors.push('Invalid NPC ID: ' + id);
        const number = Number(id.slice(4));
        if (Number.isFinite(number))
            highest = Math.max(highest, number);
        if (isRecord(npcs[id]) && npcs[id].ID !== id)
            errors.push('NPC ID mismatch: ' + id);
    }
    if (!Number.isInteger(narrative.NextNpcId) || Number(narrative.NextNpcId) <= highest) {
        errors.push('NextNpcId was not advanced atomically');
    }
    for (const idRaw of asArray(asRecord(narrative.Scene).PresentNPCs)) {
        const id = text(idRaw);
        if (!npcs[id] && !familiarIds.has(id))
            errors.push('PresentNPCs references a missing actor: ' + id);
    }
    for (const [id, relation] of Object.entries(asRecord(narrative.Relationships))) {
        if (!isRecord(relation)) {
            errors.push('Relationship is not an object: ' + id);
            continue;
        }
        for (const side of ['A', 'B']) {
            if (!text(relation[side]))
                errors.push('Relationship ' + id + ' has an empty ' + side);
        }
    }
    return [...new Set(errors)];
}
export function assertValidState(state) {
    const errors = validateState(state);
    if (errors.length)
        throw new Error(errors.join('; '));
}
//# sourceMappingURL=state-validate.js.map