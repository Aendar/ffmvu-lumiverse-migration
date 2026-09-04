import { STATE_SCHEMA_VERSION } from './state-schema.js';
import { createDefaultState, DEFAULT_STATE } from './state-defaults.js';
import { asArray, asRecord, clamp, clone, isRecord, lower, text, tupleValue, uniqueStrings } from './domain/value-utils.js';
const CLOTHING_SLOTS = new Set(['Head', 'Torso', 'Legs', 'Feet', 'Extra']);
const CLOTHING_LAYERS = new Set(['Underwear', 'Base', 'Outerwear']);
const CLOTHING_STAT_FIELDS = [
    'WeaponDamage', 'WeaponMagDamage', 'ArmorPDefBonus', 'ArmorMDefBonus',
    'StrBonus', 'AgiBonus', 'ConBonus', 'IntBonus', 'WisBonus', 'ChaBonus',
    'MaxHPBonus', 'MaxMPBonus', 'Effects', 'SpecialAbility', 'EquipmentLevel', 'Rarity', 'Qty',
];
const RESOLVED_STATUSES = new Set([
    'resolved', 'closed', 'paid', 'paid off', 'paid_off', 'invalid', 'expired',
    'cancelled', 'canceled', 'complete', 'completed', 'fulfilled', 'dead',
]);
function mergeDefaults(target, source) {
    for (const [key, value] of Object.entries(source)) {
        if (target[key] === undefined || target[key] === null)
            target[key] = clone(value);
        else if (isRecord(target[key]) && isRecord(value))
            mergeDefaults(target[key], value);
    }
    return target;
}
function normalizeClothingItem(key, value) {
    const item = isRecord(value) ? clone(value) : {};
    const originalSlot = text(item.Slot).trim();
    item.Name = text(item.Name).trim() || key;
    item.Type = 'Clothing';
    item.Slot = CLOTHING_SLOTS.has(originalSlot) ? originalSlot : 'Extra';
    const layer = text(item.Layer).trim();
    item.Layer = CLOTHING_LAYERS.has(layer) ? layer : 'Base';
    if (item.Slot === 'Extra' && !text(item.Placement).trim())
        item.Placement = originalSlot || key;
    for (const field of ['Color', 'Material', 'Appearance', 'Condition', 'Arrangement']) {
        item[field] = item[field] === undefined || item[field] === null ? '' : text(item[field]);
    }
    for (const field of CLOTHING_STAT_FIELDS)
        delete item[field];
    return item;
}
function isClothingTombstone(key, value) {
    if (!isRecord(value) || Object.keys(value).length === 0)
        return true;
    const allowed = new Set([
        'Name', 'Type', 'Slot', 'Layer', 'Placement',
        'Color', 'Material', 'Appearance', 'Condition', 'Arrangement',
    ]);
    if (Object.keys(value).some(field => !allowed.has(field)))
        return false;
    return text(value.Name).trim() === key &&
        lower(value.Type) === 'clothing' &&
        text(value.Slot).trim() === 'Extra' &&
        text(value.Layer).trim() === 'Base' &&
        text(value.Placement).trim() === key &&
        ['Color', 'Material', 'Appearance', 'Condition', 'Arrangement']
            .every(field => !text(value[field]).trim());
}
function normalizeOutfit(owner) {
    if (!isRecord(owner.Outfit))
        owner.Outfit = { Initialized: false, Worn: {}, Wardrobe: {} };
    const outfit = asRecord(owner.Outfit);
    outfit.Initialized = Boolean(outfit.Initialized);
    outfit.Worn = asRecord(outfit.Worn);
    outfit.Wardrobe = asRecord(outfit.Wardrobe);
    for (const bucket of ['Worn', 'Wardrobe']) {
        const current = asRecord(outfit[bucket]);
        const opposite = asRecord(bucket === 'Worn' ? outfit.Wardrobe : outfit.Worn);
        for (const [key, item] of Object.entries(current)) {
            const itemRecord = asRecord(item);
            const identityKey = text(itemRecord.Name).trim() || key;
            const candidates = [opposite[key], opposite[identityKey], current[identityKey]];
            const realTwin = candidates.find(candidate => candidate !== item && isRecord(candidate) && !isClothingTombstone(identityKey, candidate));
            if (isClothingTombstone(identityKey, item) &&
                (!isRecord(item) || Object.keys(item).length === 0 || Boolean(realTwin))) {
                delete current[key];
                continue;
            }
            current[key] = normalizeClothingItem(key, item);
        }
    }
}
function migrateProjectionPaths(state) {
    const narrative = asRecord(state.Narrative);
    const npcs = asRecord(narrative.NPCs);
    for (const bucket of ['Hot', 'Warm']) {
        for (const [id, npc] of Object.entries(asRecord(npcs[bucket]))) {
            if (/^npc_\d{4,}$/.test(id) && !npcs[id])
                npcs[id] = npc;
        }
        delete npcs[bucket];
    }
    delete npcs.ColdCount;
    narrative.NPCs = npcs;
    const familiar = asRecord(state.Familiar);
    for (const [id, member] of Object.entries(asRecord(familiar.Hot))) {
        if (!familiar[id])
            familiar[id] = member;
    }
    delete familiar.Hot;
    delete familiar.ColdCount;
    state.Familiar = familiar;
    const gmNotes = asRecord(narrative.GM_Notes);
    gmNotes.Active = asRecord(gmNotes.Active);
    for (const [id, note] of Object.entries(asRecord(gmNotes.Candidates))) {
        if (!asRecord(gmNotes.Active)[id])
            asRecord(gmNotes.Active)[id] = note;
    }
    delete gmNotes.Candidates;
    delete gmNotes.ActiveCount;
    narrative.GM_Notes = gmNotes;
    const chekhov = asRecord(narrative.Chekhov);
    chekhov.Active = asRecord(chekhov.Active);
    for (const [id, seed] of Object.entries(asRecord(chekhov.Candidates))) {
        if (!asRecord(chekhov.Active)[id])
            asRecord(chekhov.Active)[id] = seed;
    }
    delete chekhov.Candidates;
    delete chekhov.ActiveCount;
    delete chekhov.ArchiveCount;
    delete chekhov.AuditDue;
    narrative.Chekhov = chekhov;
    const worldSim = asRecord(narrative.WorldSim);
    delete worldSim.ColdCount;
    narrative.WorldSim = worldSim;
    state.Narrative = narrative;
    delete state.ColdIndex;
    delete state.ProjectionMeta;
    return state;
}
function recordTurn(record) {
    if (!isRecord(record))
        return 0;
    return Number(record.ResolvedTurn ?? record.LastTouchedTurn ?? record.LastShiftTurn ?? record.Turn ?? 0) || 0;
}
function trimRecord(record, limit) {
    const entries = Object.entries(asRecord(record));
    entries.sort((a, b) => recordTurn(b[1]) - recordTurn(a[1]));
    return Object.fromEntries(entries.slice(0, limit));
}
function compactArchive(id, record, turn) {
    const source = asRecord(record);
    return {
        ID: source.ID || id,
        Status: source.Status || 'resolved',
        Summary: source.Outcome || source.Summary || source.Payoff || source.Setup || source.Subject || source.Title || '',
        ResolvedTurn: Number(source.ResolvedTurn ?? turn) || turn,
        LastTouchedTurn: Number(source.LastTouchedTurn ?? turn) || turn,
    };
}
function archiveResolved(activeRaw, archiveRaw, turn, prefix) {
    const active = asRecord(activeRaw);
    const nextArchive = asRecord(archiveRaw);
    for (const [id, value] of Object.entries(active)) {
        if (!isRecord(value) || !RESOLVED_STATUSES.has(lower(value.Status)))
            continue;
        nextArchive[prefix ? prefix + id : id] = compactArchive(id, value, turn);
        delete active[id];
    }
    return nextArchive;
}
function inferRelationshipRefs(key, relation) {
    const existingA = text(relation.A).trim();
    const existingB = text(relation.B).trim();
    if (existingA && existingB)
        return relation;
    const normalizedKey = text(key).trim();
    let inferredA = existingA;
    let inferredB = existingB;
    const playerWords = '(?:player|user|pc|mainchar)';
    let match = normalizedKey.match(new RegExp('^' + playerWords + '_(npc_\\d{4,})$', 'i'));
    if (match) {
        inferredA ||= 'player';
        inferredB ||= match[1] ?? '';
    }
    match ||= normalizedKey.match(new RegExp('^(npc_\\d{4,})_' + playerWords + '$', 'i'));
    if (match && !inferredB) {
        inferredA ||= match[1] ?? '';
        inferredB ||= 'player';
    }
    if (!inferredA || !inferredB) {
        const pair = normalizedKey.match(/^(npc_\d{4,})_(npc_\d{4,})$/i);
        if (pair) {
            inferredA ||= pair[1] ?? '';
            inferredB ||= pair[2] ?? '';
        }
    }
    if (inferredA)
        relation.A = ['user', 'pc', 'mainchar'].includes(lower(inferredA)) ? 'player' : inferredA;
    if (inferredB)
        relation.B = ['user', 'pc', 'mainchar'].includes(lower(inferredB)) ? 'player' : inferredB;
    return relation;
}
function actorAliasMap(state) {
    const aliases = new Map();
    const add = (alias, canonical) => {
        const key = lower(tupleValue(alias));
        if (key && !aliases.has(key))
            aliases.set(key, canonical);
    };
    for (const alias of ['player', 'user', '{{user}}', 'pc', 'mainchar'])
        add(alias, 'player');
    add(state.Mainchar.Name, 'player');
    for (const [id, npcRaw] of Object.entries(asRecord(state.Narrative.NPCs))) {
        const npc = asRecord(npcRaw);
        add(id, id);
        add(npc.ID, id);
        add(npc.DisplayName, id);
        add(npc.Name, id);
        for (const alias of asArray(npc.Aliases))
            add(alias, id);
    }
    for (const [id, memberRaw] of Object.entries(asRecord(state.Familiar))) {
        const member = asRecord(memberRaw);
        add(id, id);
        add(member.ID, id);
        add(member.Name, id);
        add(member.DisplayName, id);
        for (const alias of asArray(member.Aliases))
            add(alias, id);
    }
    return aliases;
}
function canonicalActorRef(value, aliases) {
    const raw = text(value).trim();
    return aliases.get(lower(raw)) || raw;
}
export function normalizeState(input) {
    const raw = isRecord(input) ? clone(input) : createDefaultState();
    migrateProjectionPaths(raw);
    mergeDefaults(raw, clone(DEFAULT_STATE));
    const state = raw;
    const narrative = state.Narrative;
    normalizeOutfit(state.Mainchar);
    for (const member of Object.values(asRecord(state.Familiar))) {
        if (isRecord(member))
            normalizeOutfit(member);
    }
    const turn = Math.max(0, Math.trunc(Number(narrative.Turn) || 0));
    narrative.Turn = turn;
    narrative.NextNpcId = Math.max(1, Math.trunc(Number(narrative.NextNpcId) || 1));
    narrative.Scene.OpenLoops = uniqueStrings(narrative.Scene.OpenLoops).slice(-12);
    narrative.Scene.PresentNPCs = uniqueStrings(narrative.Scene.PresentNPCs).slice(0, 24);
    narrative.Scene.RelevantWorldKeys = uniqueStrings(narrative.Scene.RelevantWorldKeys).slice(0, 24);
    let highestNpcId = 0;
    for (const [id, npcRaw] of Object.entries(asRecord(narrative.NPCs))) {
        if (!isRecord(npcRaw))
            continue;
        const numericId = /^npc_\d{4,}$/.test(id) ? Number(id.slice(4)) : 0;
        if (Number.isFinite(numericId))
            highestNpcId = Math.max(highestNpcId, numericId);
        npcRaw.ID = id;
        npcRaw.Aliases = uniqueStrings(npcRaw.Aliases).slice(0, 8);
        if (!text(npcRaw.DisplayName).trim()) {
            const aliases = asArray(npcRaw.Aliases);
            const fallbackName = text(npcRaw.Name).trim() || text(aliases[0]).trim();
            if (fallbackName)
                npcRaw.DisplayName = fallbackName;
        }
        if (Array.isArray(npcRaw.CurrentThought))
            npcRaw.CurrentThought = npcRaw.CurrentThought.at(-1) || '';
        if (Array.isArray(npcRaw.Knowledge))
            npcRaw.Knowledge = npcRaw.Knowledge.slice(-20);
        else if (isRecord(npcRaw.Knowledge))
            npcRaw.Knowledge = trimRecord(npcRaw.Knowledge, 20);
        if (isRecord(npcRaw.Agenda)) {
            delete npcRaw.Agenda.History;
            delete npcRaw.Agenda.Log;
            delete npcRaw.Agenda.Diary;
            delete npcRaw.Agenda.Past;
        }
    }
    narrative.NextNpcId = Math.max(narrative.NextNpcId, highestNpcId + 1);
    const actorAliases = actorAliasMap(state);
    narrative.Scene.PresentNPCs = uniqueStrings(narrative.Scene.PresentNPCs.map(value => canonicalActorRef(value, actorAliases))).slice(0, 24);
    for (const [relationId, relationRaw] of Object.entries(asRecord(narrative.Relationships))) {
        if (!isRecord(relationRaw))
            continue;
        const relation = inferRelationshipRefs(relationId, relationRaw);
        relation.A = canonicalActorRef(relation.A, actorAliases);
        relation.B = canonicalActorRef(relation.B, actorAliases);
        relation.Bond = clamp(relation.Bond, -100, 100);
        relation.Sparks = clamp(relation.Sparks, 0, 100);
        relation.Grudge = clamp(relation.Grudge, 0, 100);
        delete relation.History;
        delete relation.Log;
    }
    narrative.GM_Notes.Archive = archiveResolved(narrative.GM_Notes.Active, narrative.GM_Notes.Archive, turn, '');
    narrative.GM_Notes.Archive = trimRecord(narrative.GM_Notes.Archive, 30);
    narrative.Chekhov.Archive = archiveResolved(narrative.Chekhov.Active, narrative.Chekhov.Archive, turn, '');
    narrative.Chekhov.Archive = trimRecord(narrative.Chekhov.Archive, 50);
    narrative.Chekhov.AuditEvery = Math.max(4, Math.min(30, Math.trunc(Number(narrative.Chekhov.AuditEvery) || 8)));
    narrative.Chekhov.LastAuditTurn = Math.max(0, Math.trunc(Number(narrative.Chekhov.LastAuditTurn) || 0));
    narrative.WorldSim.Archive = archiveResolved(narrative.WorldSim.Threads, narrative.WorldSim.Archive, turn, 'thread:');
    narrative.WorldSim.Archive = archiveResolved(narrative.WorldSim.Pressures, narrative.WorldSim.Archive, turn, 'pressure:');
    narrative.WorldSim.Archive = trimRecord(narrative.WorldSim.Archive, 30);
    state.MVUStatMenu_DB_Ver = STATE_SCHEMA_VERSION;
    state.GameStarted = Boolean(state.GameStarted);
    return state;
}
//# sourceMappingURL=state-normalize.js.map