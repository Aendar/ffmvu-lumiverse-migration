import { canonicalStringify } from './hashing.js';
import { asRecord, isRecord, text, tupleValue } from './domain/value-utils.js';
function same(a, b) {
    if (a === undefined || b === undefined)
        return a === b;
    return canonicalStringify(a) === canonicalStringify(b);
}
export function narrativeTimestampFromState(state) {
    return {
        date: String(state.World.Date?.[0] ?? ''),
        time: String(state.World.Time?.[0] ?? ''),
    };
}
function itemName(id, raw) {
    const record = asRecord(raw);
    return text(record.Name).trim() || text(record.DisplayName).trim() || id;
}
function collectionDiff(beforeRaw, afterRaw) {
    const before = asRecord(beforeRaw);
    const after = asRecord(afterRaw);
    const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    const added = [];
    const removed = [];
    const changed = [];
    for (const id of ids) {
        const a = before[id];
        const b = after[id];
        if (a === undefined && b !== undefined) {
            const record = asRecord(b);
            added.push({ id, name: itemName(id, b), ...(record.Qty !== undefined ? { qty: record.Qty } : {}) });
            continue;
        }
        if (a !== undefined && b === undefined) {
            const record = asRecord(a);
            removed.push({ id, name: itemName(id, a), ...(record.Qty !== undefined ? { qty: record.Qty } : {}) });
            continue;
        }
        if (!same(a, b)) {
            const ar = asRecord(a);
            const br = asRecord(b);
            const fields = [...new Set([...Object.keys(ar), ...Object.keys(br)])].filter(key => !same(ar[key], br[key])).sort();
            changed.push({
                id,
                name: itemName(id, b ?? a),
                fields,
                ...(ar.Qty !== undefined || br.Qty !== undefined ? { fromQty: ar.Qty ?? null, toQty: br.Qty ?? null } : {}),
                ...(ar.Arrangement !== undefined || br.Arrangement !== undefined ? { fromArrangement: ar.Arrangement ?? '', toArrangement: br.Arrangement ?? '' } : {}),
                ...(ar.Condition !== undefined || br.Condition !== undefined ? { fromCondition: ar.Condition ?? '', toCondition: br.Condition ?? '' } : {}),
            });
        }
    }
    if (!added.length && !removed.length && !changed.length)
        return null;
    return {
        ...(added.length ? { added } : {}),
        ...(removed.length ? { removed } : {}),
        ...(changed.length ? { changed } : {}),
    };
}
function actorDomains(state) {
    const result = { player: state.Mainchar };
    for (const [id, raw] of Object.entries(asRecord(state.Familiar))) {
        if (isRecord(raw))
            result[id] = raw;
    }
    return result;
}
function perActorCollectionDiff(before, after, selector) {
    const aActors = actorDomains(before);
    const bActors = actorDomains(after);
    const ids = [...new Set([...Object.keys(aActors), ...Object.keys(bActors)])].sort();
    const out = {};
    for (const id of ids) {
        const diff = collectionDiff(selector(aActors[id] ?? {}), selector(bActors[id] ?? {}));
        if (diff)
            out[id] = diff;
    }
    return Object.keys(out).length ? out : undefined;
}
const MAINCHAR_STAT_KEYS = [
    'Level', 'Exp', 'Core-points',
    'Strength', 'Agility', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma',
    'Hp_curr', 'Hp_max', 'Mp_curr', 'Mp_max', 'Sta_curr', 'Sta_max',
    'Physical_attack', 'Physical_defense', 'Magic_attack', 'Magic_defense', 'Magic_assist',
];
function statsDiff(before, after) {
    const out = {};
    for (const key of MAINCHAR_STAT_KEYS) {
        const a = tupleValue(before.Mainchar[key]);
        const b = tupleValue(after.Mainchar[key]);
        if (!same(a, b))
            out[key] = { from: a, to: b };
    }
    return Object.keys(out).length ? out : undefined;
}
function relationshipsDiff(before, after) {
    const a = asRecord(before.Narrative.Relationships);
    const b = asRecord(after.Narrative.Relationships);
    const ids = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    const out = {};
    for (const id of ids) {
        if (same(a[id], b[id]))
            continue;
        if (a[id] === undefined)
            out[id] = { change: 'added', current: b[id] };
        else if (b[id] === undefined)
            out[id] = { change: 'removed', previous: a[id] };
        else {
            const ar = asRecord(a[id]);
            const br = asRecord(b[id]);
            const summary = {};
            for (const key of ['Bond', 'Sparks', 'Grudge', 'Dynamic', 'LastShift', 'LastShiftTurn']) {
                if (!same(ar[key], br[key]))
                    summary[key] = { from: ar[key] ?? null, to: br[key] ?? null };
            }
            out[id] = Object.keys(summary).length ? summary : { change: 'updated' };
        }
    }
    return Object.keys(out).length ? out : undefined;
}
export function computeRecentChanges(before, after) {
    const outfit = perActorCollectionDiff(before, after, actor => asRecord(asRecord(actor.Outfit).Worn));
    const inventory = perActorCollectionDiff(before, after, actor => actor.Inventory);
    const equipment = perActorCollectionDiff(before, after, actor => actor.Equipment);
    const stats = statsDiff(before, after);
    const relationships = relationshipsDiff(before, after);
    const fromLocation = String(tupleValue(before.World.Location) ?? '');
    const toLocation = String(tupleValue(after.World.Location) ?? '');
    const location = fromLocation === toLocation ? undefined : { from: fromLocation, to: toLocation };
    if (!outfit && !inventory && !equipment && !stats && !relationships && !location)
        return null;
    return {
        observedAt: narrativeTimestampFromState(after),
        ...(outfit ? { Outfit: outfit } : {}),
        ...(inventory ? { Inventory: inventory } : {}),
        ...(equipment ? { Equipment: equipment } : {}),
        ...(location ? { Location: location } : {}),
        ...(stats ? { Stats: stats } : {}),
        ...(relationships ? { Relationships: relationships } : {}),
    };
}
//# sourceMappingURL=recent-changes.js.map