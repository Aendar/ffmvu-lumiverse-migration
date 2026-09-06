import { asRecord, isRecord, text, tupleValue } from '../shared/domain/value-utils.js';
export function statusTupleValue(value) {
    return tupleValue(value);
}
export function statusText(value, fallback = '—') {
    const raw = tupleValue(value);
    if (raw === null || raw === undefined || raw === '')
        return fallback;
    if (typeof raw === 'object')
        return JSON.stringify(raw);
    return String(raw);
}
export function statusNumber(value) {
    const number = Number(tupleValue(value));
    return Number.isFinite(number) ? number : null;
}
export function statusPath(root, path) {
    let current = root;
    for (const segment of path.split('.').filter(Boolean)) {
        if (!isRecord(current) && !Array.isArray(current))
            return undefined;
        current = current[segment];
    }
    return current;
}
export function statusOwners(state) {
    const owners = [{
            id: 'player',
            label: statusText(state.Mainchar.Name, 'Main Character'),
            ref: { kind: 'player' },
            record: state.Mainchar,
        }];
    for (const [id, raw] of Object.entries(asRecord(state.Familiar))) {
        if (!isRecord(raw))
            continue;
        owners.push({
            id: 'familiar:' + id,
            label: statusText(raw.Name, id),
            ref: { kind: 'familiar', id },
            record: raw,
        });
    }
    return owners;
}
export function statusOwnerById(state, id) {
    return statusOwners(state).find(owner => owner.id === id) ?? statusOwners(state)[0];
}
export function statusItems(record) {
    const result = [];
    for (const [key, raw] of Object.entries(asRecord(record))) {
        if (!isRecord(raw)) {
            result.push({ key, name: key, qty: null, record: { Value: raw }, equippable: false });
            continue;
        }
        const qtyRaw = raw.Qty ?? raw.qty;
        const qtyNumber = qtyRaw === undefined ? null : Number(qtyRaw);
        const slot = text(raw.Slot ?? raw.slot).trim();
        const type = text(raw.Type ?? raw.type).toLowerCase();
        result.push({
            key,
            name: text(raw.Name ?? raw.name).trim() || key,
            qty: qtyNumber !== null && Number.isFinite(qtyNumber) ? qtyNumber : null,
            record: raw,
            equippable: Boolean(slot) || ['equipment', 'weapon', 'armor', 'accessory'].includes(type),
        });
    }
    return result;
}
export function statusHphOverview(state) {
    const hph = statusPath(state, 'Narrative.Scene.HPH.player');
    if (!isRecord(hph))
        return null;
    const read = (path) => statusNumber(statusPath(hph, path));
    return {
        bladder: read('Physiology.Bladder'),
        arousal: read('Physiology.Arousal'),
        erection: read('Physiology.ErectionLevel') ?? read('Physiology.ErectionCapacity'),
        semenMl: read('Physiology.SemenMl'),
        semenCapacityMl: read('Physiology.SemenCapacityMl'),
        lengthCm: read('Penis.LengthCm'),
        girthCm: read('Penis.GirthCm'),
    };
}
export function statusCoreBudget(values) {
    const list = [values.str, values.agi, values.con, values.int, values.wis];
    const integer = list.every(value => Number.isInteger(value) && value >= 5);
    const spent = list.reduce((sum, value) => sum + (value - 5), 0);
    return { spent, remaining: 50 - spent, valid: integer && spent <= 50 };
}
export function statusCompactObject(value, maxEntries = 8) {
    return Object.entries(asRecord(value)).slice(0, maxEntries).map(([key, raw]) => {
        if (isRecord(raw)) {
            const shown = raw.Name ?? raw.name ?? raw.Desc ?? raw.description ?? raw.Status ?? raw.status;
            return [key, shown === undefined ? JSON.stringify(raw) : statusText(shown)];
        }
        return [key, statusText(raw)];
    });
}
//# sourceMappingURL=statusmenu-model.js.map