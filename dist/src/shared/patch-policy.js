import { pointerParts } from './json-pointer.js';
import { asRecord, isRecord } from './domain/value-utils.js';
export const MODEL_PATCH_AUTHORIZATION_VERSION = 'ffmvu-model-auth-v1';
export function buildModelPatchAuthorizationView(view) {
    const worldCalc = asRecord(view.World_Calc);
    const narrative = asRecord(view.Narrative);
    const gm = asRecord(narrative.GM_Notes);
    const chekhov = asRecord(narrative.Chekhov);
    const worldSim = asRecord(narrative.WorldSim);
    return {
        version: MODEL_PATCH_AUTHORIZATION_VERSION,
        worldCalc: {
            Factions: Object.keys(asRecord(worldCalc.Factions)),
            Locations: Object.keys(asRecord(worldCalc.Locations)),
            Ruins: Object.keys(asRecord(worldCalc.Ruins)),
            Events: Object.keys(asRecord(worldCalc.Events)),
        },
        familiarIds: Object.keys(asRecord(view.Familiar)),
        npcIds: Object.keys(asRecord(narrative.NPCs)),
        relationshipIds: Object.keys(asRecord(narrative.Relationships)),
        gmNoteIds: Object.keys(asRecord(gm.Active)),
        chekhovIds: Object.keys(asRecord(chekhov.Active)),
        worldSimThreadIds: Object.keys(asRecord(worldSim.Threads)),
        worldSimPressureIds: Object.keys(asRecord(worldSim.Pressures)),
        nextNpcId: Math.max(1, Math.trunc(Number(narrative.NextNpcId) || 1)),
    };
}
function hasOwn(record, key) {
    return isRecord(record) && Object.prototype.hasOwnProperty.call(record, key);
}
function deny(message) { throw new Error('MODEL_PATCH_UNAUTHORIZED: ' + message); }
function authorizeProjectedCollection(operation, parts, baseCollection, visibleIds, label, idIndex) {
    const id = parts[idIndex];
    if (!id)
        deny(label + ' id missing');
    const exists = hasOwn(baseCollection, id);
    if (exists) {
        if (!visibleIds.includes(id))
            deny(label + ' entity omitted from frozen projection: ' + id);
        return;
    }
    if (operation.op !== 'add' || parts.length !== idIndex + 1)
        deny('new ' + label + ' must be one exact add at entity root: ' + id);
}
function numericNpcId(id) {
    const match = /^npc_(\d{4,})$/.exec(id);
    return match ? Number(match[1]) : null;
}
export function assertModelPatchAuthorization(baseState, operations, authorization) {
    if (authorization.version !== MODEL_PATCH_AUTHORIZATION_VERSION)
        deny('unsupported authorization version');
    const routingSegments = new Set(['Hot', 'Warm', 'Candidates', 'ColdCount', 'ActiveCount', 'ArchiveCount', 'AuditDue']);
    const newNpcIds = [];
    const nextNpcOps = [];
    for (const operation of operations) {
        const parts = pointerParts(operation.path);
        if (!parts.length)
            deny('state root is not writable');
        if (parts.some(part => routingSegments.has(part)))
            deny('projection routing label is not writable: ' + operation.path);
        if (parts[0] === 'ProjectionMeta')
            deny('ProjectionMeta is read-only');
        if (parts[0] === 'World') {
            if (parts.length < 2)
                deny('World root replacement is not allowed');
            continue;
        }
        if (parts[0] === 'Mainchar') {
            if (parts.length < 2)
                deny('Mainchar root replacement is not allowed');
            continue;
        }
        if (parts[0] === 'World_Calc') {
            const section = parts[1];
            if (!['Factions', 'Locations', 'Ruins', 'Events'].includes(section))
                deny('unknown World_Calc section: ' + String(parts[1]));
            const collection = asRecord(baseState.World_Calc)[section];
            authorizeProjectedCollection(operation, parts, collection, authorization.worldCalc[section], 'World_Calc/' + section, 2);
            continue;
        }
        if (parts[0] === 'Familiar') {
            authorizeProjectedCollection(operation, parts, baseState.Familiar, authorization.familiarIds, 'Familiar', 1);
            if (!hasOwn(baseState.Familiar, parts[1]))
                deny('model-created Familiar is not authorized by v0.5');
            continue;
        }
        if (parts[0] !== 'Narrative')
            deny('persistent root is not model-writable: ' + parts[0]);
        if (parts[1] === 'Turn') {
            if (parts.length !== 2)
                deny('Narrative.Turn must be written as one scalar');
            continue;
        }
        if (parts[1] === 'NextNpcId') {
            if (parts.length !== 2)
                deny('Narrative.NextNpcId must be written as one scalar');
            nextNpcOps.push(operation);
            continue;
        }
        if (parts[1] === 'Scene') {
            if (parts.length < 3)
                deny('Narrative.Scene root replacement is not allowed');
            continue;
        }
        if (parts[1] === 'NPCs') {
            const id = parts[2];
            const exists = hasOwn(baseState.Narrative.NPCs, id);
            authorizeProjectedCollection(operation, parts, baseState.Narrative.NPCs, authorization.npcIds, 'Narrative.NPCs', 2);
            if (!exists)
                newNpcIds.push(id);
            continue;
        }
        if (parts[1] === 'Relationships') {
            authorizeProjectedCollection(operation, parts, baseState.Narrative.Relationships, authorization.relationshipIds, 'Narrative.Relationships', 2);
            continue;
        }
        if (parts[1] === 'GM_Notes') {
            if (parts[2] !== 'Active')
                deny('only GM_Notes.Active is model-writable');
            authorizeProjectedCollection(operation, parts, baseState.Narrative.GM_Notes.Active, authorization.gmNoteIds, 'Narrative.GM_Notes.Active', 3);
            continue;
        }
        if (parts[1] === 'Chekhov') {
            if (parts[2] !== 'Active')
                deny('Chekhov audit/archive fields are backend-owned');
            authorizeProjectedCollection(operation, parts, baseState.Narrative.Chekhov.Active, authorization.chekhovIds, 'Narrative.Chekhov.Active', 3);
            continue;
        }
        if (parts[1] === 'WorldSim') {
            if (parts[2] === 'LastShift' && parts.length === 3)
                continue;
            if (parts[2] === 'Threads') {
                authorizeProjectedCollection(operation, parts, baseState.Narrative.WorldSim.Threads, authorization.worldSimThreadIds, 'Narrative.WorldSim.Threads', 3);
                continue;
            }
            if (parts[2] === 'Pressures') {
                authorizeProjectedCollection(operation, parts, baseState.Narrative.WorldSim.Pressures, authorization.worldSimPressureIds, 'Narrative.WorldSim.Pressures', 3);
                continue;
            }
            deny('WorldSim archive/unknown field is not model-writable');
        }
        deny('Narrative field is not model-writable: ' + String(parts[1]));
    }
    const uniqueNpcIds = [...new Set(newNpcIds)];
    if (uniqueNpcIds.length) {
        const numeric = uniqueNpcIds.map(id => ({ id, n: numericNpcId(id) })).sort((a, b) => (a.n ?? Infinity) - (b.n ?? Infinity));
        for (let i = 0; i < numeric.length; i++) {
            const expected = authorization.nextNpcId + i;
            if (numeric[i].n !== expected)
                deny('new NPC id must allocate contiguously from NextNpcId; expected npc_' + String(expected).padStart(4, '0') + ', got ' + numeric[i].id);
        }
        if (nextNpcOps.length !== 1 || !('value' in nextNpcOps[0]) || Number(nextNpcOps[0].value) !== authorization.nextNpcId + numeric.length) {
            deny('new NPC creation must advance Narrative.NextNpcId atomically');
        }
    }
    else if (nextNpcOps.length) {
        deny('Narrative.NextNpcId cannot change without new NPC creation');
    }
}
//# sourceMappingURL=patch-policy.js.map