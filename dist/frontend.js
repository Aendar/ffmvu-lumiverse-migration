// ---- bundled from dist/src/shared/domain/value-utils.js ----
export function clone(value) {
    if (typeof structuredClone === 'function')
        return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}
export function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
export function asRecord(value) {
    return isRecord(value) ? value : {};
}
export function asArray(value) {
    return Array.isArray(value) ? value : [];
}
export function text(value) {
    return value === null || value === undefined ? '' : String(value);
}
export function lower(value) {
    return text(value).trim().toLowerCase();
}
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
}
export function tupleValue(value) {
    return Array.isArray(value) ? value[0] : value;
}
export function uniqueStrings(values) {
    const result = [];
    const seen = new Set();
    for (const value of asArray(values)) {
        if (typeof value !== 'string' || !value.trim() || seen.has(value))
            continue;
        seen.add(value);
        result.push(value);
    }
    return result;
}
export function isLabeledTuple(value) {
    return Array.isArray(value) && value.length >= 2 && typeof value[1] === 'string';
}

// ---- bundled from dist/src/shared/domain/gui-variable-policy.js ----
const VARIABLE_DYNAMIC_COLLECTION_PATTERNS = [
    ['World_Calc', 'Factions'],
    ['World_Calc', 'Locations'],
    ['World_Calc', 'Ruins'],
    ['World_Calc', 'Events'],
    ['Mainchar', 'Inventory'],
    ['Mainchar', 'Quests'],
    ['Mainchar', 'Skills'],
    ['Mainchar', 'Talents'],
    ['Mainchar', 'Buffs'],
    ['Mainchar', 'Ailments'],
    ['Mainchar', 'Outfit', 'Worn'],
    ['Mainchar', 'Outfit', 'Wardrobe'],
    ['Mainchar', 'Real_estate', 'Estates'],
    ['Mainchar', 'Real_estate', 'Buildings'],
    ['Mainchar', 'Real_estate', 'Assets'],
    ['Familiar', '*', 'Inventory'],
    ['Familiar', '*', 'Quests'],
    ['Familiar', '*', 'Skills'],
    ['Familiar', '*', 'Talents'],
    ['Familiar', '*', 'Buffs'],
    ['Familiar', '*', 'Ailments'],
    ['Familiar', '*', 'Spells'],
    ['Familiar', '*', 'Outfit', 'Worn'],
    ['Familiar', '*', 'Outfit', 'Wardrobe'],
    ['Narrative', 'GM_Notes', 'Active'],
    ['Narrative', 'GM_Notes', 'Archive'],
    ['Narrative', 'Chekhov', 'Active'],
    ['Narrative', 'Chekhov', 'Archive'],
    ['Narrative', 'WorldSim', 'Threads'],
    ['Narrative', 'WorldSim', 'Pressures'],
    ['Narrative', 'WorldSim', 'Archive'],
];
export function isGuiVariableDynamicCollectionPath(path) {
    return VARIABLE_DYNAMIC_COLLECTION_PATTERNS.some(pattern => pattern.length === path.length &&
        pattern.every((segment, index) => segment === '*' || segment === path[index]));
}
export function isGuiVariableCoupledDomainPath(path) {
    return (path.length >= 2 && path[0] === 'Mainchar' && path[1] === 'Equipment')
        || (path.length >= 3 && path[0] === 'Familiar' && path[2] === 'Equipment');
}

// ---- bundled from dist/src/shared/domain/tuple-paths.js ----
const WORLD_LABELED_FIELDS = new Set([
    'Date', 'Time', 'Location', 'Weather',
]);
const CHARACTER_LABELED_FIELDS = new Set([
    'Name', 'Image', 'Race', 'Age', 'Gender', 'Occupation', 'Level', 'Exp', 'Core-points', 'Mental_state',
    'Strength', 'Agility', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma',
    'Hp_curr', 'Hp_max', 'Mp_curr', 'Mp_max', 'Sta_curr', 'Sta_max',
    'Physical_attack', 'Physical_defense', 'Magic_attack', 'Magic_defense', 'Magic_assist',
    'Starting_weapon_request', 'Starting_weapon_status',
]);
const FAMILIAR_LABELED_FIELDS = new Set([
    ...CHARACTER_LABELED_FIELDS,
    'Is_present', 'Is_in_battle_team', 'Familiar_Status', 'Identity', 'Location',
    'Affection', 'Height', 'Cup_Size', 'Body_Measurements',
    'M_level', 'Lewdness', 'Control_desire', 'Sex_count',
]);
export function isKnownLabeledTuplePath(path) {
    if (path.length === 2 && path[0] === 'World')
        return WORLD_LABELED_FIELDS.has(path[1]);
    if (path.length === 2 && path[0] === 'Mainchar')
        return CHARACTER_LABELED_FIELDS.has(path[1]);
    if (path.length === 3 && path[0] === 'Familiar')
        return FAMILIAR_LABELED_FIELDS.has(path[2]);
    return false;
}
export function isLabeledTupleAtPath(path, value) {
    return isKnownLabeledTuplePath(path) && Array.isArray(value) && value.length >= 2 && typeof value[1] === 'string';
}
export function isKnownOrdinaryArrayPath(path) {
    if (path.length === 3 && path[0] === 'Narrative' && path[1] === 'Scene') {
        return ['OpenLoops', 'PresentNPCs', 'RelevantWorldKeys'].includes(path[2]);
    }
    if (path.length === 4 && path[0] === 'Narrative' && path[1] === 'NPCs') {
        return ['Aliases', 'Knowledge'].includes(path[3]);
    }
    if (path.length === 3 && path[0] === 'Familiar') {
        return ['Aliases', 'Knowledge'].includes(path[2]);
    }
    return false;
}

// ---- bundled from dist/src/lumi/statusmenu-model.js ----
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
const LEGACY_SAFE_DELETE_COLLECTIONS = new Set(['Quests', 'Buffs', 'Ailments']);
export function statusLegacyDeletePath(owner, relativeListPath, itemKey) {
    const parts = relativeListPath.split('.').filter(Boolean);
    if (!owner || parts.length !== 1 || !LEGACY_SAFE_DELETE_COLLECTIONS.has(parts[0]) || !itemKey)
        return null;
    return owner.kind === 'player'
        ? ['Mainchar', parts[0], itemKey]
        : ['Familiar', owner.id, parts[0], itemKey];
}

// ---- bundled from dist/src/lumi/statusmenu-legacy-template.js ----
// Generated from legacy-reference/statusmenu.json (StatusMenu FF + MVU v2.8.1).
// Keep this visual template synchronized with the frozen legacy reference.
// Runtime behavior is rebound to Lumiverse/StateService in frontend.ts.
export const LEGACY_STATUS_CSS = ":root {\n        --text-primary: #e0f7fa;\n        --text-secondary: #81d4fa;\n        --accent-primary: #00e5ff;\n        --border-color: rgba(0, 229, 255, 0.3);\n        --background-card: rgba(0, 20, 40, 0.65);\n    }\n    /* mvu-row-sync-v4 */\n    * { box-sizing: border-box; }\n    /* Gradient Animation */\n    @keyframes gradient-flow {\n        0% { background-position: 0% 50%; }\n        50% { background-position: 100% 50%; }\n        100% { background-position: 0% 50%; }\n    }\n\n    body {\n        font-family: 'Segoe UI', sans-serif;\n        background: transparent;\n        color: var(--text-primary);\n        margin: 0; padding: 10px;\n        font-size: 16px;\n    }\n\n    .status-container, .status-card {\n        display: flex; flex-direction: column;\n        background: linear-gradient(-45deg, #001f3f, #003366, #006064, #013243);\n        background-size: 400% 400%;\n        animation: gradient-flow 30s ease infinite;\n        border: 1px solid var(--border-color);\n        border-radius: 8px;\n        min-height: 500px;\n        overflow: hidden;\n        max-width: 100%;\n        box-sizing: border-box;\n        transition: width 0.3s;\n        margin: 0 auto;\n    }\n\n    /* .tab-nav is the canonical tab container. PreviewRenderer uses it too (was .preview-tabs). */\n    .tab-nav {\n        display: flex;\n        background: rgba(0,0,0,0.3);\n        border-bottom: 1px solid var(--border-color);\n        overflow-x: auto;\n    }\n    .tab-btn {\n        padding: 12px 20px; color: var(--text-secondary); cursor: pointer;\n        border-bottom: 2px solid transparent; user-select: none;\n    }\n    .tab-btn.active {\n        color: var(--accent-primary); border-bottom-color: var(--accent-primary);\n    }\n    /* Builder Preview tab buttons — display-only (cursor: default, no click handler) */\n    .p-tab-btn {\n        padding: 12px 20px;\n        color: var(--text-secondary);\n        cursor: default;\n        border-bottom: 2px solid transparent;\n        user-select: none;\n    }\n    .p-tab-btn.active {\n        color: var(--accent-primary);\n        border-bottom: 2px solid var(--accent-primary);\n    }\n\n    /* Pagination — shared flex layout */\n    .pagination-controls,\n    .pagination-controls-sm {\n        display: flex;\n        justify-content: center;\n        align-items: center;\n    }\n    /* Large pagination (PreviewRenderer top-level list pager) */\n    .pagination-controls {\n        gap: 15px;\n        margin-top: 15px;\n        padding-top: 10px;\n        border-top: 1px solid var(--border-color);\n    }\n    .pager-btn {\n        background: transparent;\n        border: 1px solid var(--accent-primary);\n        color: var(--accent-primary);\n        width: 30px;\n        height: 30px;\n        border-radius: 4px;\n        cursor: pointer;\n        font-weight: bold;\n    }\n    .pager-btn:disabled {\n        border-color: #555;\n        color: #555;\n        cursor: not-allowed;\n    }\n    .pager-btn:hover:not(:disabled) {\n        background: rgba(0, 229, 255, 0.2);\n    }\n    .page-info {\n        font-size: 0.9em;\n        color: #aaa;\n    }\n    .tab-content { display: none; padding: 10px; height: 100%; overflow-y: auto; }\n    .tab-content.active { display: block; }\n\n    .grid-row { display: flex; flex-wrap: wrap; margin: 0 -5px; align-items: stretch; align-content: flex-start; max-width: 100%; }\n    .responsive-stats-grid {\n        display: grid;\n        grid-template-columns: repeat(auto-fit, minmax(55px, 1fr));\n        gap: 2px;\n        width: 100%;\n    }\n    /* When .grid-row and .responsive-stats-grid are used together, flex wins via specificity (0,2,0 > 0,1,0).\n       This replaces the old duplicate .grid-row rule that was previously used as a cascade anchor. */\n    .grid-row.responsive-stats-grid { display: flex; flex-wrap: wrap; margin: 0 -5px; align-items: stretch; align-content: flex-start; }\n    .grid-full-width {\n        grid-column: 1 / -1;\n    }\n    \n    /* Responsive Grid Layout Adjustments */\n    .responsive-stats-grid .checkbox-display {\n        justify-content: flex-start;\n    }\n    .col-wrapper { padding: 5px; box-sizing: border-box; min-width: 0; max-width: 100%; overflow: hidden; }\n    .info-card {\n        background: var(--background-card);\n        border: 1px solid var(--border-color);\n        border-radius: 6px;\n        padding: 8px;\n        height: 100%;\n    }\n    .card-header {\n        color: var(--accent-primary); font-weight: bold;\n        border-bottom: 1px solid var(--border-color);\n        padding-bottom: 3px; margin-bottom: 4px;\n    }\n\n    .prop-list {\n        display: flex;\n        flex-wrap: wrap;\n        margin: 0 -4px;\n        width: 100%;\n    }\n    .prop-row-wrapper { \n        padding: 1px 4px; \n        box-sizing: border-box; \n        min-width: 55px;\n        flex: 1 0 auto;\n    }\n    .prop-row {\n        display: flex;\n        flex-wrap: wrap;\n        align-items: center;\n        border-bottom: 1px dashed rgba(255,255,255,0.1);\n        padding: 2px 0; margin: 0;\n        line-height: 1.2;\n        font-size: 0.875em;\n        min-width: 0;\n        gap: 4px;\n    }\n    .prop-label {\n        color: #81d4fa;\n        flex: 0 0 auto;\n        max-width: 100%;\n        margin-right: 4px;\n        margin-bottom: 1px;\n        padding-top: 2px;\n        white-space: nowrap !important;\n        overflow: visible !important;\n        text-overflow: clip !important;\n    }\n    .prop-val-container {\n        flex: 1 1 auto;\n        width: auto;\n        display: flex;\n        justify-content: flex-end;\n        align-items: center;\n        min-width: 0;\n    }\n    .prop-val {\n        font-weight: 400;\n        width: auto;\n        max-width: 100%;\n        min-width: 0;\n        overflow-wrap: break-word;\n        word-break: normal;\n    }\n    .checkbox-display {\n        width: 100%;\n        display: flex;\n        justify-content: flex-start;\n    }\n\n    /* List content fallback (works even where :has is unsupported) */\n    .prop-val ul,\n    .prop-val ol {\n        margin: 0;\n        padding-left: 1.2em;\n        text-align: left;\n        line-height: 1.35;\n        list-style-position: outside;\n        list-style-type: disc;\n    }\n    .prop-val ol { list-style-type: decimal; }\n    .prop-val li { margin-bottom: 4px; }\n    .prop-val li:last-child { margin-bottom: 0; }\n    .hidden { display: none !important; }\n\n    /* Stat Bars */\n    .stat-bar-box,\n    .stat-bar-card {\n        margin-bottom: 4px; padding: 4px;\n        background: rgba(0,0,0,0.2); border-radius: 6px;\n        border: 1px solid rgba(255,255,255,0.05);\n    }\n    .stat-bar-header {\n        display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.9em;\n    }\n    .stat-bar-label { font-weight: bold; color: #fff; }\n    .stat-bar-val { font-family: monospace; color: #ccc; }\n    \n    .stat-bar-track {\n        width: 100%;\n        height: 8px;\n        background: rgba(0,0,0,0.5);\n        border-radius: 4px;\n        overflow: hidden;\n    }\n    .stat-bar-fill {\n        height: 100%;\n        border-radius: 4px;\n        transition: width 0.3s ease;\n    }\n    /* Bar Colors with Gradients */\n    .bar-red { background: linear-gradient(90deg, #ff5252, #ff8a80); box-shadow: 0 0 5px rgba(255,82,82,0.5); }\n    .bar-green { background: linear-gradient(90deg, #50fa7b, #69f0ae); box-shadow: 0 0 5px rgba(80,250,123,0.5); }\n    .bar-darkgreen { background: linear-gradient(90deg, #05870e, #2e7d32); box-shadow: 0 0 5px rgba(5,135,14,0.5); }\n    .bar-blue { background: linear-gradient(90deg, #4272f5, #82b1ff); box-shadow: 0 0 5px rgba(66,114,245,0.5); }\n    .bar-cyan { background: linear-gradient(90deg, #00e5ff, #84ffff); box-shadow: 0 0 5px rgba(0,229,255,0.5); }\n    .bar-orange { background: linear-gradient(90deg, #fab025, #ffe082); box-shadow: 0 0 5px rgba(250,176,37,0.5); }\n    .bar-yellow { background: linear-gradient(90deg, #faf325, #ffffb0); box-shadow: 0 0 5px rgba(250,243,37,0.5); }\n    .bar-purple { background: linear-gradient(90deg, #8a42f5, #b388ff); box-shadow: 0 0 5px rgba(138,66,245,0.5); }\n    .bar-pink { background: linear-gradient(90deg, #fc8bd5, #ff80ab); box-shadow: 0 0 5px rgba(252,139,213,0.5); }\n    .bar-brown { background: linear-gradient(90deg, #a15012, #8d6e63); box-shadow: 0 0 5px rgba(161,80,18,0.5); }\n    .bar-default { background: linear-gradient(90deg, #ff5252, #ff8a80); }\n\n    /* Grid Layout */\n    .list-grid-view {\n        display: grid;\n        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));\n        gap: 8px;\n        width: 100%;\n    }\n    .list-inventory-view {\n        display: grid;\n        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));\n        gap: 8px;\n        width: 100%;\n    }\n    .grid-tile {\n        background: rgba(0, 40, 60, 0.8);\n        border: 1px solid var(--border-color);\n        padding: 6px 10px;\n        border-radius: 4px;\n        display: flex;\n        justify-content: space-between;\n        align-items: center;\n        color: #fff;\n        font-weight: bold;\n        font-size: 0.95em;\n    }\n    .tile-name { \n        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \n    }\n    .tile-qty {\n        color: var(--accent-primary);\n        font-size: 0.85em;\n        margin-left: 8px;\n        flex-shrink: 0;\n    }\n    /* Shared header style — .nested-section-header used in exported HTML; .grid-group-header builder-only */\n    .nested-section-header,\n    .grid-group-header {\n        font-size: 0.9em; font-weight: bold; color: var(--accent-primary);\n        border-bottom: 1px solid rgba(0, 229, 255, 0.3);\n        text-transform: uppercase; letter-spacing: 0.5px;\n    }\n    .nested-section-header { padding-bottom: 2px; margin-bottom: 4px; margin-top: 8px; }\n    /* .grid-group-header has more vertical breathing room */\n    .grid-group-header { padding-bottom: 4px; margin-bottom: 8px; }\n    .simple-list { margin-top: 4px; }\n    .list-entry { padding: 1px 0; border-bottom: 1px dashed rgba(255,255,255,0.1); }\n    .entry-title { color: var(--text-primary); font-weight: bold; font-size: 0.95em; }\n    .entry-desc { font-size: 0.85em; color: #ccc; }\n    \n    /* Checkbox Row */\n    .kin-checkbox-row {\n        font-size: 0.9em;\n        background: rgba(0,0,0,0.2);\n        padding: 4px 8px;\n        border-radius: 4px;\n        width: 100%;\n        gap: 8px;\n        display: flex;\n        align-items: center;\n        justify-content: space-between;\n        flex-wrap: wrap;\n    }\n    .kin-checkbox-label {\n        display: flex; align-items: center; gap: 6px;\n        cursor: pointer; color: var(--text-primary);\n        user-select: none;\n    }\n    .kin-checkbox-text {\n        color: #81d4fa;\n        display: block;\n        flex: 1 1 auto;\n        min-width: 0;\n        white-space: normal;\n        overflow-wrap: anywhere;\n        word-break: break-word;\n    }\n    .kin-checkbox-control {\n        flex: 0 0 auto;\n        width: auto;\n        min-width: 20px;\n        margin-left: auto;\n        justify-content: flex-end;\n    }\n    .kin-checkbox-label input { margin: 0; cursor: pointer; }\n\n    /* On narrow layouts, place checkbox on next line so long labels remain fully visible */\n    @media (max-width: 560px) {\n        .kin-checkbox-text {\n            flex: 1 0 100%;\n        }\n        .kin-checkbox-control {\n            flex: 1 0 100%;\n            width: 100%;\n            margin-left: 0;\n            justify-content: flex-end;\n        }\n    }\n\n    .img-wrapper {\n        position: relative;\n    }\n    .avatar-img {\n        max-width: 100%;\n        height: auto;\n    }\n    \n    .img-popup-overlay {\n        position: fixed;\n        top: 0;\n        left: 0;\n        width: 100%;\n        height: 100%;\n        background: rgba(0,0,0,0.85);\n        z-index: 9999;\n        display: none;\n        align-items: center;\n        justify-content: center;\n        cursor: zoom-out;\n        padding: 12px;\n        box-sizing: border-box;\n    }\n    .img-popup-content {\n        max-width: calc(100vw - 24px);\n        max-height: calc(100vh - 24px);\n        width: auto;\n        height: auto;\n        display: block;\n        border-radius: 4px;\n        box-shadow: 0 0 20px rgba(0,0,0,0.5);\n        object-fit: contain;\n    }\n    .img-edit-btn {\n        position: absolute;\n        bottom: 8px;\n        right: 8px;\n        background: rgba(0,0,0,0.6);\n        color: white;\n        width: 32px;\n        height: 32px;\n        border-radius: 50%;\n        display: flex;\n        align-items: center;\n        justify-content: center;\n        cursor: pointer;\n        font-size: 16px;\n        border: 1px solid rgba(255,255,255,0.3);\n        transition: background 0.2s;\n        z-index: 10;\n    }\n    .img-edit-btn:hover {\n        background: rgba(0,0,0,0.9);\n        border-color: white;\n    }\n\n    .st-checkbox { width: 20px; height: 20px; cursor: pointer; accent-color: #50fa7b; }\n    .ar-checkbox-input {\n        width: 20px;\n        height: 20px;\n        margin: 0;\n        cursor: pointer;\n        accent-color: #50fa7b;\n        appearance: auto;\n        -webkit-appearance: checkbox;\n        position: static;\n        transform: none;\n    }\n    .lorebook-placeholder-img { width: 100%; height: 150px; border: 2px dashed #ff5252; background: rgba(255, 82, 82, 0.1); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #ff5252; font-size: 0.9em; padding: 10px; text-align: center; }\n\n    /* Local Pagination (Small) — CardRenderer inline pager; base flex from shared rule above */\n    .pagination-controls-sm { gap: 10px; margin-top: 8px; padding-top: 4px; border-top: 1px dashed rgba(0, 229, 255, 0.15); }\n    .pager-btn-sm { background: transparent; border: 1px solid rgba(0, 229, 255, 0.5); color: #00e5ff; width: 20px; height: 20px; font-size: 0.8em; border-radius: 3px; cursor: pointer; display: flex; align-items: center; justify-content: center; }\n    .pager-btn-sm:disabled { color: #555; border-color: #555; cursor: not-allowed; }\n    .page-info-sm { font-size: 0.75em; color: #888; }\n\n    /* Grid Container & Groups (Builder-side layout wrapper) */\n    .grid-group-card { border: 1px solid rgba(0, 229, 255, 0.15); border-radius: 4px; padding: 8px; background: rgba(0,0,0,0.2); margin-top: 5px; }\n    .grid-group-content { display: flex; flex-wrap: wrap; margin: 0 -4px; }\n    .grid-item { box-sizing: border-box; padding: 4px; min-width: 80px; flex: 1 0 auto; }\n    .grid-item .prop-row { border-bottom: none; background: rgba(255,255,255,0.03); padding: 4px 8px; border-radius: 3px; }\n\n    /* Image Card Layout Wrapper */\n    .image-card { display: flex; flex-direction: column; align-items: center; gap: 10px; }\n    .p-avatar { width: 100%; border: 1px solid #00e5ff; border-radius: 4px; }\n    .p-name { font-family: serif; font-size: 1.2em; color: #00e5ff; }\n\n    /* Quest List Card — canonical class, used by both Builder preview and exported HTML template (tmpl-quest) */\n    .quest-card { background: rgba(255,255,255,0.05); padding: 10px; border-radius: 4px; margin-bottom: 8px; border-left: 3px solid var(--accent-primary); position: relative; }\n    .quest-card-header { display: flex; justify-content: space-between; margin-bottom: 4px; }\n    .quest-card-title { font-weight: bold; color: var(--text-primary); }\n    .quest-card-actions { display: flex; gap: 8px; align-items: center; }\n    .quest-delete-btn { background: rgba(255,100,100,0.2); border: 1px solid rgba(255,100,100,0.4); color: #ff6b6b; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 0.9em; line-height: 1; }\n    .quest-difficulty { font-size: 0.8em; background: #333; padding: 2px 6px; border-radius: 4px; }\n    .quest-desc { font-size: 0.9em; color: var(--text-secondary); margin-bottom: 4px; }\n    .quest-reward { font-size: 0.8em; color: #ffd700; }\n    .quest-last-updated { font-size: 0.75em; color: #888; margin-top: 4px; }\n\n    /* Inventory / Equipment Action item controls */\n    .item-action-wrap { position: relative; width: 24px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }\n    .item-menu-btn { background: rgba(0,229,255,0.15); border: 1px solid rgba(0,229,255,0.4); color: #00e5ff; border-radius: 4px; font-size: 14px; cursor: pointer; padding: 0 6px; line-height: 18px; z-index: 10; }\n    .item-action-menu { display: none; position: absolute; bottom: 22px; right: 0; min-width: 100px; background: rgba(0,31,63,0.95); border: 1px solid rgba(0,229,255,0.4); border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); z-index: 9999; overflow: hidden; }\n    .action-equip-btn, .action-delete-btn { display: none; width: 100%; text-align: left; background: transparent; border: none; padding: 6px 10px; cursor: pointer; font-size: 0.8em; }\n    .action-equip-btn { display: none; color: #00e5ff; }\n    .action-delete-btn { display: block; color: #ff8a80; }\n    .unequip-btn { background: rgba(255,100,100,0.2); border: 1px solid rgba(255,100,100,0.4); color: #ff6b6b; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 1em; line-height: 1; min-width: 30px; }\n\n    /* Item Detail Modal — ID-based; used only in exported HTML (detail-modal popup for item inspection) */\n    #detail-modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000; justify-content: center; align-items: center; backdrop-filter: blur(2px); }\n    #detail-content { background: #001f3f; border: 1px solid #00e5ff; padding: 20px; border-radius: 8px; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto; color: #e0f7fa; position: relative; box-shadow: 0 0 20px rgba(0, 229, 255, 0.2); }\n    #detail-close-btn { position: absolute; top: 10px; right: 15px; background: none; border: none; color: #81d4fa; font-size: 24px; cursor: pointer; }\n    #detail-close-btn:hover { color: #fff; }\n    #detail-title { margin-top: 0; color: #00e5ff; border-bottom: 1px solid rgba(0,229,255,0.3); padding-bottom: 10px; }\n    .detail-row { display: flex; margin-bottom: 5px; font-size: 0.9em; }\n    .detail-key { font-weight: bold; color: #81d4fa; min-width: 100px; }\n    .detail-val { color: #e0f7fa; white-space: pre-wrap; }\n\n    /* FF + MVU Narrative state */\n    .ffsm-toolbar { display:flex; gap:6px; align-items:center; position:sticky; top:0; z-index:5; padding:4px 0 8px; background:#002b4c; }\n    .ffsm-search { flex:1; min-width:120px; background:rgba(0,0,0,.32); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px; padding:7px 9px; font:inherit; }\n    .ffsm-btn { background:rgba(0,229,255,.1); border:1px solid var(--border-color); color:var(--accent-primary); border-radius:4px; padding:6px 9px; cursor:pointer; white-space:nowrap; }\n    .ffsm-scroll { height:clamp(620px, calc(100vh - 170px), 840px); overflow-y:auto; overflow-x:hidden; padding-right:4px; }\n    .ffsm-stack { display:flex; flex-direction:column; gap:7px; padding-bottom:10px; }\n    .ffsm-top, .ffsm-node { background:rgba(0,20,40,.55); border:1px solid rgba(0,229,255,.22); border-radius:5px; overflow:hidden; }\n    .ffsm-node { margin:4px 0 0 10px; background:rgba(0,0,0,.14); border-color:rgba(129,212,250,.16); }\n    .ffsm-top > summary, .ffsm-node > summary { cursor:pointer; list-style:none; color:var(--accent-primary); font-weight:700; padding:7px 9px; display:flex; align-items:center; gap:6px; overflow-wrap:anywhere; }\n    .ffsm-top > summary::-webkit-details-marker, .ffsm-node > summary::-webkit-details-marker { display:none; }\n    .ffsm-top > summary::before, .ffsm-node > summary::before { content:'▸'; color:var(--text-secondary); transition:transform .15s; }\n    .ffsm-top[open] > summary::before, .ffsm-node[open] > summary::before { transform:rotate(90deg); }\n    .ffsm-body { padding:0 8px 8px; }\n    .ffsm-row { display:grid; grid-template-columns:minmax(100px,32%) minmax(0,1fr); gap:8px; padding:5px 2px; border-top:1px dashed rgba(255,255,255,.08); font-size:.84em; }\n    .ffsm-key { color:var(--text-secondary); overflow-wrap:anywhere; }\n    .ffsm-val { color:var(--text-primary); white-space:pre-wrap; overflow-wrap:anywhere; }\n    .ffsm-empty { color:#90a4ae; padding:10px; text-align:center; }\n    .ffsm-count { margin-left:auto; color:#90a4ae; font-size:.78em; font-weight:400; }\n    .ffsm-relbar { height:4px; background:rgba(0,0,0,.42); border-radius:2px; overflow:hidden; margin-top:3px; }\n    .ffsm-relfill { height:100%; background:linear-gradient(90deg,#00b8d4,#69f0ae); }\n\n\n\n    /* Compact Overview v2.3 */\n    .ff23-overview { display:flex; flex-direction:column; gap:10px; }\n    /* Overview v2.5 — compact Figma-based layout */\n    .ff25-grid {\n        display:grid;\n        grid-template-columns:minmax(245px,29%) minmax(0,1fr);\n        grid-template-areas:\"left right\" \"quests quests\";\n        gap:12px;\n        align-items:stretch;\n    }\n    .ff25-left { grid-area:left; display:grid; grid-template-rows:190px 448px; gap:14px; min-width:0; }\n    .ff25-right { grid-area:right; display:grid; grid-template-rows:228px 412px; gap:12px; min-width:0; }\n    .ff25-lower { display:grid; grid-template-columns:minmax(255px,47.3%) minmax(370px,1fr); gap:12px; min-width:0; }\n    .ff25-lower.ff25-no-hph { grid-template-columns:1fr; }\n    .ff25-card {\n        min-width:0;\n        padding:11px 12px;\n        border:1px solid var(--border-color);\n        border-radius:8px;\n        background:var(--background-card);\n        overflow:hidden;\n    }\n    .ff25-title {\n        color:var(--accent-primary);\n        font-weight:700;\n        line-height:1.25;\n        padding-bottom:7px;\n        margin-bottom:8px;\n        border-bottom:1px solid var(--border-color);\n    }\n    .ff25-stats,.ff25-world,.ff25-avatar,.ff25-character { min-height:0; }\n    .ff25-hph { display:flex; flex-direction:column; min-height:0; }\n    .ff25-quests { grid-area:quests; }\n\n    .ff25-stat-list {\n        display:grid;\n        grid-template-columns:repeat(3,minmax(0,1fr));\n        gap:7px;\n        min-height:106px;\n        align-items:center;\n    }\n    .ff25-stat {\n        display:grid;\n        grid-template-columns:30px minmax(38px,1fr);\n        grid-template-rows:1fr auto;\n        column-gap:7px;\n        justify-content:center;\n        min-width:0;\n    }\n    .ff25-stat-track {\n        grid-row:1;\n        position:relative;\n        width:30px;\n        height:88px;\n        overflow:hidden;\n        border:1px solid rgba(196,239,249,.46);\n        border-radius:17px;\n        background:rgba(127,163,175,.42);\n        box-shadow:inset 0 0 0 1px rgba(0,0,0,.12);\n    }\n    .ff25-stat-fill {\n        position:absolute;\n        inset:auto 0 0;\n        height:0;\n        border-radius:16px;\n        transition:height .3s ease;\n    }\n    .ff25-stat-numbers {\n        align-self:center;\n        min-width:0;\n        color:#eefaff;\n        font:700 .96em/1.15 ui-monospace,SFMono-Regular,Consolas,monospace;\n    }\n    .ff25-stat-current,.ff25-stat-max { display:block; overflow:hidden; text-overflow:ellipsis; }\n    .ff25-stat-max { color:#8fc6d8; margin-top:10px; font-weight:500; }\n    .ff25-stat-name {\n        grid-column:1 / -1;\n        color:var(--text-secondary);\n        font-size:.76em;\n        font-weight:700;\n        text-align:left;\n        padding-left:8px;\n        margin-top:4px;\n    }\n    .ff25-hp { background:linear-gradient(180deg,#ff8d88,#ff5c63); }\n    .ff25-mp { background:linear-gradient(180deg,#75a9ff,#4276ef); }\n    .ff25-sp { background:linear-gradient(180deg,#69e8aa,#2fcf82); }\n\n    .ff25-rows { display:flex; flex-direction:column; }\n    .ff25-row {\n        display:grid;\n        grid-template-columns:minmax(82px,31%) minmax(0,1fr);\n        gap:10px;\n        padding:6px 0;\n        border-bottom:1px dashed rgba(255,255,255,.1);\n        font-size:calc(.875em + .5px);\n        line-height:1.25;\n    }\n    .ff25-row:last-child { border-bottom:0; }\n    .ff25-label { color:var(--text-secondary); white-space:nowrap; }\n    .ff25-value { min-width:0; color:var(--text-primary); text-align:right; overflow-wrap:anywhere; }\n    .ff25-world .ff25-row { padding:7px 0; }\n\n    .ff25-avatar-center { display:flex; justify-content:center; align-items:flex-start; }\n    .ff25-avatar-shell { position:relative; width:min(92%,353px); }\n    .ff25-avatar-image {\n        display:none;\n        width:100%;\n        height:auto;\n        max-height:390px;\n        object-fit:contain;\n        border:1px solid var(--accent-primary);\n        border-radius:5px;\n        cursor:pointer;\n    }\n    .ff25-avatar-placeholder {\n        display:flex;\n        align-items:center;\n        justify-content:center;\n        width:100%;\n        height:390px;\n        border:1px solid rgba(0,229,255,.34);\n        border-radius:5px;\n        background:rgba(255,255,255,.015);\n        color:#719eae;\n        font-weight:700;\n    }\n    .ff25-avatar-shell:has(.ff25-avatar-image[style*=\"display: block\"]) .ff25-avatar-placeholder { display:none; }\n    .ff25-character { display:flex; flex-direction:column; }\n    .ff25-character .ff25-rows { flex:1; justify-content:space-evenly; }\n\n    .ff25-hph-head { display:flex; align-items:center; }\n    .ff25-hph-layout {\n        width:min(100%,357px);\n        margin:0 auto;\n        display:flex;\n        flex-direction:column;\n        justify-content:space-between;\n        min-height:344px;\n        flex:1;\n    }\n    .ff25-reservoirs,.ff25-hph-bottom { position:relative; width:100%; aspect-ratio:357/158; }\n    .ff25-reservoir {\n        position:absolute;\n        top:0;\n        width:44.26%;\n        aspect-ratio:1;\n        overflow:hidden;\n        border:1.5px solid var(--accent-primary);\n        border-radius:50%;\n        background:#052938;\n    }\n    .ff25-reservoir:last-child { left:55.74%; }\n    .ff25-reservoir-fill { position:absolute; inset:auto 0 0; height:0; transition:height .3s ease; opacity:.78; }\n    .ff25-bladder-fill { background:linear-gradient(180deg,#f4d66e,#d9aa31); }\n    .ff25-semen-fill { background:linear-gradient(180deg,#fff,#dce9ed); }\n    .ff25-reservoir-copy { position:absolute; inset:0; z-index:1; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; text-shadow:0 1px 2px #00141d; }\n    .ff25-reservoir-label,.ff25-meter-label,.ff25-dimension-label { color:var(--text-secondary); font-size:.62em; font-weight:700; letter-spacing:.04em; }\n    .ff25-reservoir-value { color:#f3fbff; font:700 1.05em/1.1 ui-monospace,SFMono-Regular,Consolas,monospace; margin-top:7px; }\n    .ff25-reservoir-unit { color:#9ac5d2; font-size:.62em; margin-top:3px; }\n    .ff25-meter {\n        position:absolute;\n        top:0;\n        width:18.21%;\n        height:100%;\n        overflow:hidden;\n        border:1.5px solid var(--accent-primary);\n        border-radius:999px;\n        background:#052938;\n    }\n    .ff25-meter-arousal { left:22.13%; }\n    .ff25-meter-fill { position:absolute; inset:auto 0 0; height:0; transition:height .3s ease; opacity:.9; }\n    .ff25-erection-fill { background:linear-gradient(180deg,#f07179,#c53f50); }\n    .ff25-arousal-fill { background:linear-gradient(180deg,#ee8ac4,#c75399); }\n    .ff25-meter-copy { position:absolute; inset:0; z-index:1; display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:13px 3px; text-align:center; text-shadow:0 1px 2px #00141d; }\n    .ff25-meter-value { color:#f3fbff; font:700 .9em/1 ui-monospace,SFMono-Regular,Consolas,monospace; }\n    .ff25-dimension-box {\n        position:absolute;\n        left:54.62%;\n        top:0;\n        width:44.26%;\n        height:100%;\n        display:grid;\n        grid-template-rows:1fr 1fr;\n        border:1.5px solid var(--accent-primary);\n        border-radius:18px;\n        overflow:hidden;\n        background:#0b3c4d;\n    }\n    .ff25-dimension { display:flex; align-items:center; justify-content:space-between; gap:5px; padding:8px 12px; min-width:0; }\n    .ff25-dimension + .ff25-dimension { border-top:1px solid rgba(0,229,255,.38); }\n    .ff25-dimension-main { text-align:right; white-space:nowrap; }\n    .ff25-dimension-number { color:#f2fbff; font:700 1.05em/1 ui-monospace,SFMono-Regular,Consolas,monospace; }\n    .ff25-dimension-unit { color:#8ab9c8; font-size:.58em; margin-left:2px; }\n\n    .ff25-quests .prop-list { margin:0; }\n    .ff25-quests .prop-row-wrapper { padding:0; }\n    .ff25-quests .list-collapse-wrapper { margin:0; }\n\n    @media (max-width:960px) {\n        .ff25-grid { grid-template-columns:1fr; grid-template-areas:\"left\" \"right\" \"quests\"; }\n        .ff25-left,.ff25-right { grid-template-rows:auto; }\n        .ff25-left { grid-template-columns:minmax(230px,.7fr) minmax(270px,1fr); }\n        .ff25-right { grid-template-rows:auto; }\n        .ff25-lower { grid-template-columns:minmax(255px,.9fr) minmax(370px,1.1fr); }\n    }\n    @media (max-width:720px) {\n        .ff25-grid { gap:8px; }\n        .ff25-left,.ff25-lower { grid-template-columns:1fr; gap:8px; }\n        .ff25-avatar-shell { width:min(84%,310px); }\n        .ff25-hph-layout { min-height:auto; }\n    }\n    @media (max-width:430px) {\n        body { padding:4px; }\n        .tab-content { padding:6px; }\n        .ff25-card { padding:9px; }\n        .ff25-stat-list { gap:2px; }\n        .ff25-stat { grid-template-columns:25px minmax(32px,1fr); column-gap:4px; }\n        .ff25-stat-track { width:25px; height:76px; }\n        .ff25-stat-numbers { font-size:.82em; }\n        .ff25-dimension { padding-inline:7px; }\n        .ff25-reservoir-label,.ff25-meter-label,.ff25-dimension-label { font-size:.55em; }\n    }\n\n    /* Persistent Outfit / Wardrobe */\n    .outfit-tab-btn { color:#f3a6da; }\n    .outfit-tab-btn.active { color:#ff7ac8; border-bottom-color:#ff7ac8; }\n    .outfit-shell { --outfit-accent:#ff7ac8; --outfit-soft:#f3a6da; --outfit-border:rgba(255,122,200,.38); display:flex; flex-direction:column; gap:10px; }\n    .outfit-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:8px; background:rgba(54,8,42,.42); border:1px solid var(--outfit-border); border-radius:7px; }\n    .outfit-toolbar-label { color:var(--outfit-soft); font-size:.82em; font-weight:700; margin-right:2px; }\n    .outfit-owner-tabs { display:flex; flex-wrap:wrap; gap:6px; }\n    .outfit-owner-btn { appearance:none; border:1px solid var(--outfit-border); background:rgba(255,122,200,.08); color:#f7d7ec; border-radius:999px; padding:5px 11px; cursor:pointer; font:inherit; font-size:.8em; }\n    .outfit-owner-btn:hover { background:rgba(255,122,200,.16); }\n    .outfit-owner-btn.active { color:#fff; border-color:var(--outfit-accent); background:rgba(255,122,200,.28); box-shadow:0 0 10px rgba(255,122,200,.12); }\n    .outfit-status { margin-left:auto; color:#cfa9c4; font-size:.74em; }\n    .outfit-columns { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:10px; }\n    .outfit-panel { min-width:0; background:rgba(45,5,34,.48); border:1px solid var(--outfit-border); border-radius:7px; padding:9px; }\n    .outfit-panel-title { color:var(--outfit-accent); font-weight:800; font-size:.92em; padding-bottom:5px; margin-bottom:7px; border-bottom:1px solid var(--outfit-border); display:flex; justify-content:space-between; gap:8px; }\n    .outfit-count { color:#cfa9c4; font-weight:400; }\n    .outfit-list { display:flex; flex-direction:column; gap:6px; }\n    .outfit-empty { color:#a9799a; font-size:.8em; text-align:center; padding:14px 6px; }\n    .outfit-item { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:5px 8px; padding:8px; border:1px solid rgba(255,122,200,.22); border-radius:6px; background:linear-gradient(135deg,rgba(255,122,200,.1),rgba(98,34,90,.1)); }\n    .outfit-item-main { min-width:0; }\n    .outfit-item-name { color:#fff0fa; font-size:.86em; font-weight:700; overflow-wrap:anywhere; }\n    .outfit-badges { display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }\n    .outfit-badge { border:1px solid rgba(255,122,200,.28); border-radius:999px; padding:1px 6px; color:#e9b9d8; font-size:.66em; line-height:1.45; }\n    .outfit-item-detail { grid-column:1 / -1; color:#cdb6c6; font-size:.72em; line-height:1.35; overflow-wrap:anywhere; }\n    .outfit-item-state { color:#f0a9d5; }\n    .outfit-action { align-self:start; appearance:none; border:1px solid var(--outfit-accent); color:#ffd9ef; background:rgba(255,122,200,.13); border-radius:5px; padding:4px 8px; cursor:pointer; font:inherit; font-size:.7em; white-space:nowrap; }\n    .outfit-action:hover { background:rgba(255,122,200,.28); }\n    @media (max-width:680px) { .outfit-columns { grid-template-columns:1fr; } .outfit-status { width:100%; margin-left:0; } }";
export const LEGACY_STATUS_BODY_HTML = "<!-- DB Upgrade Utility Placeholder -->\n    <UpgradeAR_DB_Holder/>\n\n    <!-- Main Container -->\n    <!-- Forced to 100% width for export as requested -->\n    <div class=\"status-container\" style=\"width: 100%\">\n        \n        <!-- Tab Navigation -->\n        <div class=\"tab-nav\">\n            <div class=\"tab-btn active\" onclick=\"selectTab('tab-tab-1', this)\">Overview</div>\n            <div class=\"tab-btn \" onclick=\"selectTab('tab-tab-1770046656361', this)\">Attributes</div>\n            <div class=\"tab-btn \" onclick=\"selectTab('tab-tab-1770138241595', this)\">Familiars</div>\n            <div class=\"tab-btn outfit-tab-btn\" onclick=\"selectTab('tab-outfits', this)\">Wardrobe</div>\n            <div class=\"tab-btn \" onclick=\"selectTab('tab-tab-1770203490813', this)\">Equipments</div>\n            <div class=\"tab-btn \" onclick=\"selectTab('tab-tab-1770205420551', this)\">Items</div>\n            <div class=\"tab-btn \" onclick=\"selectTab('tab-tab-1770205502569', this)\">Others</div>\n            <div class=\"tab-btn \" onclick=\"selectTab('tab-ff-state', this)\">FF State</div>\n        </div>\n\n        <!-- Tab Content -->\n\n    <div id=\"tab-tab-1\" class=\"tab-content active\">\n        <div class=\"ff25-grid\" id=\"ff25-grid\">\n            <div class=\"ff25-left\">\n                <section class=\"ff25-card ff25-stats\">\n                    <div class=\"ff25-title\">Main Stats</div>\n                    <div class=\"ff25-stat-list\">\n                        <div class=\"ff25-stat\" data-ff25-cur=\"Mainchar.Hp_curr\" data-ff25-max=\"Mainchar.Hp_max\"><div class=\"ff25-stat-track\"><div class=\"ff25-stat-fill ff25-hp\"></div></div><div class=\"ff25-stat-numbers\"><span class=\"ff25-stat-current\">—</span><span class=\"ff25-stat-max\">—</span></div><div class=\"ff25-stat-name\">HP</div></div>\n                        <div class=\"ff25-stat\" data-ff25-cur=\"Mainchar.Mp_curr\" data-ff25-max=\"Mainchar.Mp_max\"><div class=\"ff25-stat-track\"><div class=\"ff25-stat-fill ff25-mp\"></div></div><div class=\"ff25-stat-numbers\"><span class=\"ff25-stat-current\">—</span><span class=\"ff25-stat-max\">—</span></div><div class=\"ff25-stat-name\">MP</div></div>\n                        <div class=\"ff25-stat\" data-ff25-cur=\"Mainchar.Sta_curr\" data-ff25-max=\"Mainchar.Sta_max\"><div class=\"ff25-stat-track\"><div class=\"ff25-stat-fill ff25-sp\"></div></div><div class=\"ff25-stat-numbers\"><span class=\"ff25-stat-current\">—</span><span class=\"ff25-stat-max\">—</span></div><div class=\"ff25-stat-name\">ST</div></div>\n                    </div>\n                </section>\n                <section class=\"ff25-card ff25-avatar\">\n                    <div class=\"ff25-title\">Avatar</div>\n                    <div class=\"ff25-avatar-center\"><div class=\"ff25-avatar-shell img-wrapper\" data-bind-fullpath=\"Mainchar.Image\"><img class=\"ff25-avatar-image\" data-bind-img=\"Mainchar.Image\" alt=\"Avatar\" onclick=\"showImagePopup(this.src)\"><div class=\"ff25-avatar-placeholder\">IMAGE</div><div class=\"img-edit-btn\" data-save-root=\"Mainchar\" data-save-leaf=\"Image\" onclick=\"handleEditClick(event,this)\">✎</div></div></div>\n                </section>\n            </div>\n            <div class=\"ff25-right\">\n                <section class=\"ff25-card ff25-world\">\n                    <div class=\"ff25-title\">World Info</div>\n                    <div class=\"ff25-rows\">\n                        <div class=\"ff25-row\"><span class=\"ff25-label\">Date</span><span class=\"ff25-value\" data-bind-val=\"World.Date\">—</span></div>\n                        <div class=\"ff25-row\"><span class=\"ff25-label\">Time</span><span class=\"ff25-value\" data-bind-val=\"World.Time\">—</span></div>\n                        <div class=\"ff25-row\"><span class=\"ff25-label\">Location</span><span class=\"ff25-value\" data-bind-val=\"World.Location\">—</span></div>\n                        <div class=\"ff25-row\"><span class=\"ff25-label\">Weather</span><span class=\"ff25-value\" data-bind-val=\"World.Weather\">—</span></div>\n                    </div>\n                </section>\n                <div class=\"ff25-lower\" id=\"ff25-lower\">\n                    <section class=\"ff25-card ff25-character\">\n                        <div class=\"ff25-title\">Character Status</div>\n                        <div class=\"ff25-rows\">\n                            <div class=\"ff25-row\"><span class=\"ff25-label\">Name</span><span class=\"ff25-value\" data-bind-val=\"Mainchar.Name\">—</span></div>\n                            <div class=\"ff25-row\"><span class=\"ff25-label\">Age</span><span class=\"ff25-value\" data-bind-val=\"Mainchar.Age\">—</span></div>\n                            <div class=\"ff25-row\"><span class=\"ff25-label\">Gender</span><span class=\"ff25-value\" data-bind-val=\"Mainchar.Gender\">—</span></div>\n                            <div class=\"ff25-row\"><span class=\"ff25-label\">Occupation</span><span class=\"ff25-value\" data-bind-val=\"Mainchar.Occupation\">—</span></div>\n                            <div class=\"ff25-row\"><span class=\"ff25-label\">Race</span><span class=\"ff25-value\" data-bind-val=\"Mainchar.Race\">—</span></div>\n                            <div class=\"ff25-row\"><span class=\"ff25-label\">Level / Exp</span><span class=\"ff25-value\"><span data-bind-val=\"Mainchar.Level\">—</span> / <span data-bind-val=\"Mainchar.Exp\">—</span></span></div>\n                            <div class=\"ff25-row\"><span class=\"ff25-label\">Mental State</span><span class=\"ff25-value\" data-bind-val=\"Mainchar.Mental_state\">—</span></div>\n                            <div class=\"ff25-row\"><span class=\"ff25-label\">Core Point</span><span class=\"ff25-value\" data-bind-val=\"Mainchar.Core-points\">—</span></div>\n                        </div>\n                    </section>\n                    <section class=\"ff25-card ff25-hph\" id=\"ff25-hph\">\n                        <div class=\"ff25-title ff25-hph-head\">Genitalia Info</div>\n                        <div class=\"ff25-hph-layout\">\n                            <div class=\"ff25-reservoirs\">\n                                <div class=\"ff25-reservoir\"><div class=\"ff25-reservoir-fill ff25-bladder-fill\" id=\"ff25-bladder-fill\"></div><div class=\"ff25-reservoir-copy\"><div class=\"ff25-reservoir-label\">BLADDER</div><div class=\"ff25-reservoir-value\" id=\"ff25-bladder-value\">—</div><div class=\"ff25-reservoir-unit\">/ 10</div></div></div>\n                                <div class=\"ff25-reservoir\"><div class=\"ff25-reservoir-fill ff25-semen-fill\" id=\"ff25-semen-fill\"></div><div class=\"ff25-reservoir-copy\"><div class=\"ff25-reservoir-label\">SEMEN</div><div class=\"ff25-reservoir-value\" id=\"ff25-semen-value\">—</div><div class=\"ff25-reservoir-unit\">ml</div></div></div>\n                            </div>\n                            <div class=\"ff25-hph-bottom\">\n                                <div class=\"ff25-meter\"><div class=\"ff25-meter-fill ff25-erection-fill\" id=\"ff25-erection-fill\"></div><div class=\"ff25-meter-copy\"><div class=\"ff25-meter-label\">ERECTION</div><div class=\"ff25-meter-value\"><span id=\"ff25-erection-value\">—</span><small>/10</small></div></div></div>\n                                <div class=\"ff25-meter ff25-meter-arousal\"><div class=\"ff25-meter-fill ff25-arousal-fill\" id=\"ff25-arousal-fill\"></div><div class=\"ff25-meter-copy\"><div class=\"ff25-meter-label\">AROUSAL</div><div class=\"ff25-meter-value\"><span id=\"ff25-arousal-value\">—</span><small>/10</small></div></div></div>\n                                <div class=\"ff25-dimension-box\">\n                                    <div class=\"ff25-dimension\"><div class=\"ff25-dimension-label\">LENGTH</div><div class=\"ff25-dimension-main\"><span class=\"ff25-dimension-number\" id=\"ff25-length-value\">—</span><span class=\"ff25-dimension-unit\">cm</span></div></div>\n                                    <div class=\"ff25-dimension\"><div class=\"ff25-dimension-label\">GIRTH</div><div class=\"ff25-dimension-main\"><span class=\"ff25-dimension-number\" id=\"ff25-girth-value\">—</span><span class=\"ff25-dimension-unit\">cm</span></div></div>\n                                </div>\n                            </div>\n                        </div>\n                    </section>\n                </div>\n            </div>\n            <section class=\"ff25-card ff25-quests\">\n                <div class=\"ff25-title\" id=\"lbl_blk_blk_1770135834327\">Current Quests</div>\n                <div id=\"blk-blk-1770135834327\" class=\"prop-list\" data-bind-root=\"Mainchar\" data-template=\"tpl-blk-blk-1770135834327\" data-page-size=\"5\"></div>\n                <template id=\"tpl-blk-blk-1770135834327\"><div class=\"prop-row-wrapper\" style=\"width:100%\"><div class=\"list-collapse-wrapper\"><div class=\"nested-section-header list-collapse-header\" data-target=\"list-crd-1770135842396\" style=\"cursor:pointer;display:flex;justify-content:space-between;align-items:center\"><span></span><span class=\"list-collapse-arrow\" style=\"font-size:.8em;opacity:.6\">▼</span></div><div class=\"list-collapse-body\"><div id=\"list-crd-1770135842396\" class=\"simple-list\" data-bind-list=\"Quests\" data-bind-list-fullpath=\"Mainchar.Quests\" data-list-type=\"quest\" data-allow-delete=\"1\"></div></div></div></div></template>\n            </section>\n        </div>\n    </div>\n\n    <div id=\"tab-tab-1770046656361\" class=\"tab-content \">\n        <div class=\"grid-row\">\n            \n        <div class=\"col-wrapper\" style=\"width:50%\">\n            <div class=\"info-card\" style=\"\">\n                <div class=\"card-header\" id=\"lbl_blk_blk_1770046675226\">Base Attributes</div>\n                \n                <!-- Container for Dynamic Content -->\n                <div id=\"blk-blk-1770046675226\" class=\"prop-list\" data-bind-root=\"Mainchar\" data-template=\"tpl-blk-blk-1770046675226\" data-page-size=\"5\">\n                    <!-- Content will be injected here -->\n                </div>\n\n                <!-- Template -->\n                <template id=\"tpl-blk-blk-1770046675226\">\n                    \n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"prop-row\" data-bind-fullpath=\"Mainchar.Strength\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770136694112\" >Str</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Strength\">???</span>\n                    </div>\n                </div> \n            </div>\n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"prop-row\" data-bind-fullpath=\"Mainchar.Agility\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770136714637\" >Agi</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Agility\">???</span>\n                    </div>\n                </div> \n            </div>\n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"prop-row\" data-bind-fullpath=\"Mainchar.Constitution\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770137031643\" >Con</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Constitution\">???</span>\n                    </div>\n                </div> \n            </div>\n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"prop-row\" data-bind-fullpath=\"Mainchar.Intelligence\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770137041752\" >Int</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Intelligence\">???</span>\n                    </div>\n                </div> \n            </div>\n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"prop-row\" data-bind-fullpath=\"Mainchar.Wisdom\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770137088501\" >Wis</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Wisdom\">???</span>\n                    </div>\n                </div> \n            </div>\n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"prop-row\" data-bind-fullpath=\"Mainchar.Charisma\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770137108059\" >Cha</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Charisma\">???</span>\n                    </div>\n                </div> \n            </div>\n                </template>\n            </div>\n        </div>\n        <div class=\"col-wrapper\" style=\"width:50%\">\n            <div class=\"info-card\" style=\"\">\n                <div class=\"card-header\" id=\"lbl_blk_blk_1770136606429\">Combat Stats</div>\n                \n                <!-- Container for Dynamic Content -->\n                <div id=\"blk-blk-1770136606429\" class=\"prop-list\" data-bind-root=\"Mainchar\" data-template=\"tpl-blk-blk-1770136606429\" data-page-size=\"5\">\n                    <!-- Content will be injected here -->\n                </div>\n\n                <!-- Template -->\n                <template id=\"tpl-blk-blk-1770136606429\">\n                    \n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"prop-row\" data-bind-fullpath=\"Mainchar.Physical_attack\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770137968763\" >P_Atk</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Physical_attack\">???</span>\n                    </div>\n                </div> \n            </div>\n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"prop-row\" data-bind-fullpath=\"Mainchar.Physical_defense\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770138024815\" >P_Def</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Physical_defense\">???</span>\n                    </div>\n                </div> \n            </div>\n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"prop-row\" data-bind-fullpath=\"Mainchar.Magic_attack\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770138039757\" >M_Atk</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Magic_attack\">???</span>\n                    </div>\n                </div> \n            </div>\n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"prop-row\" data-bind-fullpath=\"Mainchar.Magic_defense\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770138066356\" >M_Def</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Magic_defense\">???</span>\n                    </div>\n                </div> \n            </div>\n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"prop-row\" data-bind-fullpath=\"Mainchar.Magic_assist\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770138086951\" >M_Ast</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Magic_assist\">???</span>\n                    </div>\n                </div> \n            </div>\n                </template>\n            </div>\n        </div>\n        <div class=\"col-wrapper\" style=\"width:100%\">\n            <div class=\"info-card\" style=\"\">\n                <div class=\"card-header\" id=\"lbl_blk_blk_1770136622937\">Skill List</div>\n                \n                <!-- Container for Dynamic Content -->\n                <div id=\"blk-blk-1770136622937\" class=\"prop-list\" data-bind-root=\"Mainchar\" data-template=\"tpl-blk-blk-1770136622937\" data-page-size=\"5\">\n                    <!-- Content will be injected here -->\n                </div>\n\n                <!-- Template -->\n                <template id=\"tpl-blk-blk-1770136622937\">\n                    \n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"list-collapse-wrapper\">\n                    <div class=\"nested-section-header list-collapse-header\" data-target=\"list-crd-1770138116086\" style=\"cursor:pointer; display:flex; justify-content:space-between; align-items:center;\">\n                        <span></span><span class=\"list-collapse-arrow\" style=\"font-size:0.8em; opacity:0.6;\">▼</span>\n                    </div>\n                    <div class=\"list-collapse-body\">\n                        <div id=\"list-crd-1770138116086\" class=\"simple-list\" data-bind-list=\"Skills\" data-bind-list-fullpath=\"Mainchar.Skills\" data-list-type=\"simple\" data-allow-edit=\"1\" data-allow-delete=\"1\"></div>\n                    </div>\n                </div> \n            </div>\n                </template>\n            </div>\n        </div>\n        </div>\n    </div>\n\n    <div id=\"tab-tab-1770138241595\" class=\"tab-content \">\n        <div class=\"grid-row\">\n            \n        <div class=\"col-wrapper\" style=\"width:100%\">\n            <div class=\"info-card\" style=\"\">\n                <div class=\"card-header\" id=\"lbl_blk_blk_1770140160072\">Familiar List</div>\n                \n                <!-- Container for Dynamic Content -->\n                <div id=\"blk-blk-1770140160072\" class=\"prop-list\" data-bind-root=\"Familiar\" data-template=\"tpl-blk-blk-1770140160072\" data-page-size=\"5\" data-quick-jump=\"1\">\n                    <!-- Content will be injected here -->\n                </div>\n\n                <!-- Template -->\n                <template id=\"tpl-blk-blk-1770140160072\">\n                    \n            <div class=\"prop-row-wrapper\" style=\"width:25%\">\n                \n                <div class=\"grid-group-card\">\n                    <div class=\"grid-group-header\" id=\"lbl_gc_crd_1774572430588\">&lt;br&gt;</div>\n                    <div class=\"grid-group-content\"><div class=\"prop-row-wrapper\" style=\"width:100%\"><div style=\"text-align:center;\">\n                    <div class=\"img-wrapper\" style=\"text-align:center; position:relative; display:inline-block; width:90%; max-width:100%;\" data-bind-fullpath=\"Familiar.Image\">\n                        <img \n                            src=\"\" \n                            alt=\"Card Title\" \n                            id=\"lbl_img_crd_1774572509680\"\n                            class=\"avatar-img\" \n                            style=\"width:100%; border-radius:4px; border:1px solid var(--accent-primary); cursor:pointer; display:block;\" \n                            data-bind-img=\"Image\" \n                            onclick=\"showImagePopup(this.src)\"\n                        />\n                        <!-- Edit Button -->\n                        <div class=\"img-edit-btn\" \n                            data-save-root=\"Familiar\" \n                            data-save-leaf=\"Image\"\n                            onclick=\"handleEditClick(event, this)\"\n                        >\n                            ✎\n                        </div>\n                    </div></div></div></div>\n                </div> \n            </div>\n            <div class=\"prop-row-wrapper\" style=\"width:75%\">\n                \n                <div class=\"grid-group-card\">\n                    <div class=\"grid-group-header\" id=\"lbl_gc_crd_1770140317759\">Basic Stats</div>\n                    <div class=\"grid-group-content\"><div class=\"prop-row-wrapper\" style=\"width:33%\">\n                <div class=\"stat-bar-box\" data-bind-fullpath=\"Familiar.Hp_curr\">\n                    <div class=\"stat-bar-header\">\n                        <span class=\"stat-bar-label\" id=\"lbl_statbar_crd_1770140617427\" >HP</span>\n                        <span class=\"stat-bar-val\"><span data-bind-curr=\"Hp_curr\">?</span> / <span data-bind-max=\"Hp_max\">?</span></span>\n                    </div>\n                    <div class=\"stat-bar-track\">\n                        <div class=\"stat-bar-fill bar-red\" style=\"width:50%;\" data-bind-bar=\"Hp_curr\" data-bind-bar-max=\"Hp_max\"></div>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:33%\">\n                <div class=\"stat-bar-box\" data-bind-fullpath=\"Familiar.Mp_curr\">\n                    <div class=\"stat-bar-header\">\n                        <span class=\"stat-bar-label\" id=\"lbl_statbar_crd_1770140759187\" >MP</span>\n                        <span class=\"stat-bar-val\"><span data-bind-curr=\"Mp_curr\">?</span> / <span data-bind-max=\"Mp_max\">?</span></span>\n                    </div>\n                    <div class=\"stat-bar-track\">\n                        <div class=\"stat-bar-fill bar-blue\" style=\"width:50%;\" data-bind-bar=\"Mp_curr\" data-bind-bar-max=\"Mp_max\"></div>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:33%\">\n                <div class=\"stat-bar-box\" data-bind-fullpath=\"Familiar.Sta_curr\">\n                    <div class=\"stat-bar-header\">\n                        <span class=\"stat-bar-label\" id=\"lbl_statbar_crd_1770140810258\" >SP</span>\n                        <span class=\"stat-bar-val\"><span data-bind-curr=\"Sta_curr\">?</span> / <span data-bind-max=\"Sta_max\">?</span></span>\n                    </div>\n                    <div class=\"stat-bar-track\">\n                        <div class=\"stat-bar-fill bar-orange\" style=\"width:50%;\" data-bind-bar=\"Sta_curr\" data-bind-bar-max=\"Sta_max\"></div>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:33%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Name\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770140326850\" >Name</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Name\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:33%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Race\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770140342151\" >Race</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Race\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:33%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Occupation\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770140534232\" >Job</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Occupation\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:33%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Level\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770140979467\" >Lv</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Level\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:33%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Exp\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770140991096\" >Exp</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Exp\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:33%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Core-points\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770141013213\" >Core Point</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\" data-dynamic-logic=\"Ly8gJ3N0YXQnIElTIHRoZSBjdXJyZW50IGZhbWlsaWFyIChlLmcuIEVuZ25pKQovLyBTbyB3ZSBqdXN0IGFzayBmb3IgaXRzIHByb3BlcnR5IGRpcmVjdGx5CmxldCB2YWwgPSBnZXRWKHN0YXQsICdDb3JlLXBvaW50cycsIDApOyAKCmlmIChOdW1iZXIodmFsKSA+IDApIHsKICAgIF9vdXRwdXQgPSBgPHNwYW4gc3R5bGU9ImNvbG9yOiByZWQ7IGZvbnQtd2VpZ2h0OiBib2xkOyI+JHt2YWx9PC9zcGFuPmA7Cn0gZWxzZSB7CiAgICBfb3V0cHV0ID0gdmFsOwp9\" data-bind-val=\"Core-points\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:49%\">\n                <div class=\"prop-row kin-checkbox-row\" data-bind-fullpath=\"Familiar.Is_present\">\n                    <span class=\"kin-checkbox-text\" id=\"lbl_checkbox_crd_1770141076983\">Present</span>\n                    <div class=\"prop-val-container kin-checkbox-control\">\n                        <input \n                            type=\"checkbox\"\n                            class=\"ar-checkbox-input\"\n                            style=\"margin:0; flex-shrink:0;\"\n                            data-bind-checked=\"Is_present\" \n                            data-save-root=\"Familiar\" \n                            data-save-leaf=\"Is_present\" \n                        />\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:49%\">\n                <div class=\"prop-row kin-checkbox-row\" data-bind-fullpath=\"Familiar.Is_in_battle_team\">\n                    <span class=\"kin-checkbox-text\" id=\"lbl_checkbox_crd_1770141497406\">BattleTeam</span>\n                    <div class=\"prop-val-container kin-checkbox-control\">\n                        <input \n                            type=\"checkbox\"\n                            class=\"ar-checkbox-input\"\n                            style=\"margin:0; flex-shrink:0;\"\n                            data-bind-checked=\"Is_in_battle_team\" \n                            data-save-root=\"Familiar\" \n                            data-save-leaf=\"Is_in_battle_team\" \n                        />\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:50%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Familiar_Status\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770141545080\" >Familiar</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Familiar_Status\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:100%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Identity\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770141666787\" >ID</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\" data-dynamic-logic=\"bGV0IG91dCA9IGdldFYoc3RhdCwgJ0lkZW50aXR5JywgJycpOwppZiAoIW91dCAmJiByb290ICYmIHJvb3QuTmFycmF0aXZlICYmIHJvb3QuTmFycmF0aXZlLk5QQ3MpIHsKICBjb25zdCBrZXkgPSBTdHJpbmcoc3RhdC4ka2V5IHx8ICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTsKICBjb25zdCBuYW1lID0gU3RyaW5nKGdldFYoc3RhdCwgJ05hbWUnLCAnJykgfHwgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpOwogIGZvciAoY29uc3QgW2lkLCBucGNdIG9mIE9iamVjdC5lbnRyaWVzKHJvb3QuTmFycmF0aXZlLk5QQ3MpKSB7CiAgICBjb25zdCBkaXNwbGF5ID0gU3RyaW5nKG5wYyAmJiAobnBjLkRpc3BsYXlOYW1lIHx8IG5wYy5OYW1lKSB8fCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7CiAgICBjb25zdCBhbGlhc2VzID0gQXJyYXkuaXNBcnJheShucGMgJiYgbnBjLkFsaWFzZXMpID8gbnBjLkFsaWFzZXMubWFwKHYgPT4gU3RyaW5nKHYpLnRyaW0oKS50b0xvd2VyQ2FzZSgpKSA6IFtdOwogICAgaWYgKChrZXkgJiYgKGRpc3BsYXkgPT09IGtleSB8fCBhbGlhc2VzLmluY2x1ZGVzKGtleSkpKSB8fCAobmFtZSAmJiAoZGlzcGxheSA9PT0gbmFtZSB8fCBhbGlhc2VzLmluY2x1ZGVzKG5hbWUpKSkpIHsgb3V0ID0gaWQ7IGJyZWFrOyB9CiAgfQp9Cl9vdXRwdXQgPSBvdXQgfHwgJ+KAlCc7\" data-bind-val=\"Identity\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:100%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Location\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770141679187\" >Loc</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Location\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:100%\"><div class=\"nested-section-header\" id=\"lbl_rt_crd_1770142444444\"  >Combat Stats</div></div><div class=\"prop-row-wrapper\" style=\"width:20%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Strength\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770142523667\" >Str</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Strength\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:19%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Agility\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770142560800\" >Agi</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Agility\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:19%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Constitution\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770142575909\" >Con</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Constitution\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:20%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Intelligence\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770142600383\" >Int</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Intelligence\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:20%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Wisdom\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770142623498\" >Wis</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Wisdom\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:20%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Physical_attack\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770143697349\" >P_Atk</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Physical_attack\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:20%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Physical_defense\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770143741756\" >P_Def</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Physical_defense\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:20%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Magic_attack\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770143782402\" >M_Atk</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Magic_attack\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:19%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Magic_defense\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770143800419\" >M_Def</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Magic_defense\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:19%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Magic_assist\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770143814954\" >M_Ast</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Magic_assist\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:100%\"><div class=\"nested-section-header\" id=\"lbl_rt_crd_1770143850337\"  >Personal Info</div></div><div class=\"prop-row-wrapper\" style=\"width:58%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Age\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1775040487053\" >Age</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Age\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:23%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Affection\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770200742766\" >Affection</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Affection\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:17%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Charisma\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770200711417\" >Cha</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Charisma\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:25%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Gender\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1775040577803\" >Gender</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Gender\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:24%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Height\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770144495122\" >Height</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Height\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:19%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Cup_Size\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770200609456\" >Cup</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Cup_Size\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:30%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Body_Measurements\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770200619133\" >B/W/H</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Body_Measurements\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:19%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.M_level\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770202149384\" >M_Lv</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"M_level\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:19%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Lewdness\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770202108897\" >Lewd</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Lewdness\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:25%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Control_desire\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770202126686\" >Control</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Control_desire\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:25%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Sex_count\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770202172072\" >Sex_count</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Sex_count\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:100%\">\n                <div class=\"grid-group-card\">\n                    <div class=\"grid-group-header\" id=\"lbl_gc_crd_1770202748305\">Equipments</div>\n                    <div class=\"grid-group-content\"><div class=\"prop-row-wrapper\" style=\"width:100%\">\n                <div class=\"list-collapse-wrapper\">\n                    <div class=\"nested-section-header list-collapse-header\" data-target=\"list-crd-1770288152164\" style=\"cursor:pointer; display:flex; justify-content:space-between; align-items:center;\">\n                        <span></span><span class=\"list-collapse-arrow\" style=\"font-size:0.8em; opacity:0.6;\">▼</span>\n                    </div>\n                    <div class=\"list-collapse-body\">\n                        <div id=\"list-crd-1770288152164\" class=\"simple-list\" data-bind-list=\"Equipment\" data-bind-list-fullpath=\"Familiar.Equipment\" data-list-type=\"equipment-action\" data-allow-delete=\"1\"></div>\n                    </div>\n                </div></div></div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:100%\">\n                <div class=\"grid-group-card\">\n                    <div class=\"grid-group-header\">Inventory</div>\n                    <div class=\"grid-group-content\"><div class=\"prop-row-wrapper\" style=\"width:100%\">\n                <div class=\"list-collapse-wrapper\">\n                    <div class=\"nested-section-header list-collapse-header\" data-target=\"list-familiar-inventory\" style=\"cursor:pointer; display:flex; justify-content:space-between; align-items:center;\">\n                        <span></span><span class=\"list-collapse-arrow\" style=\"font-size:0.8em; opacity:0.6;\">▼</span>\n                    </div>\n                    <div class=\"list-collapse-body\">\n                        <div id=\"list-familiar-inventory\" class=\"simple-list\" data-bind-list=\"Inventory\" data-bind-list-fullpath=\"Familiar.Inventory\" data-list-type=\"inventory\" data-allow-delete=\"1\"></div>\n                    </div>\n                </div></div></div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:100%\"><div class=\"nested-section-header\" id=\"lbl_rt_crd_1770203081539\"  >Biography</div></div><div class=\"prop-row-wrapper\" style=\"width:100%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Hair_Style\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770203123194\" >Hair Style</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Hair_Style\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:100%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Personality\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770203143265\" >Personality</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Personality\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:100%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Physical_Features\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770203169089\" >Physical Feature</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Physical_Features\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:100%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.ExSkill\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770203184716\" >Ex_Skill</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"ExSkill\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:100%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Biography\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1770203198356\" >Bio</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\"  data-bind-val=\"Biography\">???</span>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:100%\">\n                <div class=\"prop-row\" data-bind-fullpath=\"Familiar.Secret\">\n                    <span class=\"prop-label\" id=\"lbl_statrow_crd_1774135573596\" >Secret</span>\n                    <div class=\"prop-val-container\">\n                        <span class=\"prop-val\" data-dynamic-logic=\"X291dHB1dCA9IE51bWJlcihnZXRWKHN0YXQsICdBZmZlY3Rpb24nLCAwKSkgPj0gOTAgPyBnZXRWKHN0YXQsICdTZWNyZXQnLCAnJykgOiAnUmVxdWlyZSA5MCUgQWZmZWN0aW9uJzs=\" data-bind-val=\"Secret\">???</span>\n                    </div>\n                </div></div></div>\n                </div> \n            </div>\n                </template>\n            </div>\n        </div>\n        </div>\n    </div>\n\n    <div id=\"tab-outfits\" class=\"tab-content\">\n        <div class=\"outfit-shell\">\n            <div class=\"outfit-toolbar\">\n                <span class=\"outfit-toolbar-label\">Владелец</span>\n                <div class=\"outfit-owner-tabs\" id=\"outfit-owner-tabs\"></div>\n                <span class=\"outfit-status\" id=\"outfit-status\"></span>\n            </div>\n            <div class=\"outfit-columns\">\n                <section class=\"outfit-panel\">\n                    <div class=\"outfit-panel-title\"><span>Надето</span><span class=\"outfit-count\" id=\"outfit-worn-count\">0</span></div>\n                    <div class=\"outfit-list\" id=\"outfit-worn-list\"></div>\n                </section>\n                <section class=\"outfit-panel\">\n                    <div class=\"outfit-panel-title\"><span>Гардероб</span><span class=\"outfit-count\" id=\"outfit-wardrobe-count\">0</span></div>\n                    <div class=\"outfit-list\" id=\"outfit-wardrobe-list\"></div>\n                </section>\n            </div>\n        </div>\n    </div>\n\n    <div id=\"tab-tab-1770203490813\" class=\"tab-content \">\n        <div class=\"grid-row\">\n            \n        <div class=\"col-wrapper\" style=\"width:100%\">\n            <div class=\"info-card\" style=\"\">\n                <div class=\"card-header\" id=\"lbl_blk_blk_1770203491926\">Equipments</div>\n                \n                <!-- Container for Dynamic Content -->\n                <div id=\"blk-blk-1770203491926\" class=\"prop-list\" data-bind-root=\"Mainchar\" data-template=\"tpl-blk-blk-1770203491926\" data-page-size=\"5\">\n                    <!-- Content will be injected here -->\n                </div>\n\n                <!-- Template -->\n                <template id=\"tpl-blk-blk-1770203491926\">\n                    \n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"list-collapse-wrapper\">\n                    <div class=\"nested-section-header list-collapse-header\" data-target=\"list-crd-1770203898894\" style=\"cursor:pointer; display:flex; justify-content:space-between; align-items:center;\">\n                        <span></span><span class=\"list-collapse-arrow\" style=\"font-size:0.8em; opacity:0.6;\">▼</span>\n                    </div>\n                    <div class=\"list-collapse-body\">\n                        <div id=\"list-crd-1770203898894\" class=\"simple-list\" data-bind-list=\"Equipment\" data-bind-list-fullpath=\"Mainchar.Equipment\" data-list-type=\"equipment-action\" data-allow-delete=\"1\"></div>\n                    </div>\n                </div> \n            </div>\n                </template>\n            </div>\n        </div>\n        </div>\n    </div>\n\n    <div id=\"tab-tab-1770205420551\" class=\"tab-content \">\n        <div class=\"grid-row\">\n            \n        <div class=\"col-wrapper\" style=\"width:100%\">\n            <div class=\"info-card\" style=\"\">\n                <div class=\"card-header\" id=\"lbl_blk_blk_1770205452062\">Inventory</div>\n                \n                <!-- Container for Dynamic Content -->\n                <div id=\"blk-blk-1770205452062\" class=\"prop-list\" data-bind-root=\"Mainchar\" data-template=\"tpl-blk-blk-1770205452062\" data-page-size=\"5\">\n                    <!-- Content will be injected here -->\n                </div>\n\n                <!-- Template -->\n                <template id=\"tpl-blk-blk-1770205452062\">\n                    \n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"list-collapse-wrapper\">\n                    <div class=\"nested-section-header list-collapse-header\" data-target=\"list-crd-1770205456788\" style=\"cursor:pointer; display:flex; justify-content:space-between; align-items:center;\">\n                        <span></span><span class=\"list-collapse-arrow\" style=\"font-size:0.8em; opacity:0.6;\">▼</span>\n                    </div>\n                    <div class=\"list-collapse-body\">\n                        <div id=\"list-crd-1770205456788\" class=\"simple-list\" data-bind-list=\"Inventory\" data-bind-list-fullpath=\"Mainchar.Inventory\" data-list-type=\"inventory\" data-allow-delete=\"1\"></div>\n                    </div>\n                </div> \n            </div>\n                </template>\n            </div>\n        </div>\n        </div>\n    </div>\n\n    <div id=\"tab-tab-1770205502569\" class=\"tab-content \">\n        <div class=\"grid-row\">\n            \n        <div class=\"col-wrapper\" style=\"width:50%\">\n            <div class=\"info-card\" style=\"\">\n                <div class=\"card-header\" id=\"lbl_blk_blk_1770205519586\">Talents</div>\n                \n                <!-- Container for Dynamic Content -->\n                <div id=\"blk-blk-1770205519586\" class=\"prop-list\" data-bind-root=\"Mainchar\" data-template=\"tpl-blk-blk-1770205519586\" data-page-size=\"5\">\n                    <!-- Content will be injected here -->\n                </div>\n\n                <!-- Template -->\n                <template id=\"tpl-blk-blk-1770205519586\">\n                    \n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"list-collapse-wrapper\">\n                    <div class=\"nested-section-header list-collapse-header\" data-target=\"list-crd-1770205569992\" style=\"cursor:pointer; display:flex; justify-content:space-between; align-items:center;\">\n                        <span></span><span class=\"list-collapse-arrow\" style=\"font-size:0.8em; opacity:0.6;\">▼</span>\n                    </div>\n                    <div class=\"list-collapse-body\">\n                        <div id=\"list-crd-1770205569992\" class=\"simple-list\" data-bind-list=\"Talents\" data-bind-list-fullpath=\"Mainchar.Talents\" data-list-type=\"simple\" data-allow-edit=\"1\" data-allow-delete=\"1\"></div>\n                    </div>\n                </div> \n            </div>\n                </template>\n            </div>\n        </div>\n        <div class=\"col-wrapper\" style=\"width:50%\">\n            <div class=\"info-card\" style=\"\">\n                <div class=\"card-header\" id=\"lbl_blk_blk_1770205524852\">Estates</div>\n                \n                <!-- Container for Dynamic Content -->\n                <div id=\"blk-blk-1770205524852\" class=\"prop-list\" data-bind-root=\"Mainchar\" data-template=\"tpl-blk-blk-1770205524852\" data-page-size=\"5\">\n                    <!-- Content will be injected here -->\n                </div>\n\n                <!-- Template -->\n                <template id=\"tpl-blk-blk-1770205524852\">\n                    \n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"list-collapse-wrapper\">\n                    <div class=\"nested-section-header list-collapse-header\" data-target=\"list-crd-1770205594899\" style=\"cursor:pointer; display:flex; justify-content:space-between; align-items:center;\">\n                        <span></span><span class=\"list-collapse-arrow\" style=\"font-size:0.8em; opacity:0.6;\">▶</span>\n                    </div>\n                    <div class=\"list-collapse-body\" style=\"display:none;\">\n                        <div id=\"list-crd-1770205594899\" class=\"simple-list\" data-bind-list=\"Real_estate\" data-bind-list-fullpath=\"Mainchar.Real_estate\" data-list-type=\"simple\" data-allow-edit=\"1\" data-allow-delete=\"1\"></div>\n                    </div>\n                </div> \n            </div>\n                </template>\n            </div>\n        </div>\n        <div class=\"col-wrapper\" style=\"width:50%\">\n            <div class=\"info-card\" style=\"\">\n                <div class=\"card-header\" id=\"lbl_blk_blk_1770205528854\">Buff and Ailments</div>\n                \n                <!-- Container for Dynamic Content -->\n                <div id=\"blk-blk-1770205528854\" class=\"prop-list\" data-bind-root=\"Mainchar\" data-template=\"tpl-blk-blk-1770205528854\" data-page-size=\"5\">\n                    <!-- Content will be injected here -->\n                </div>\n\n                <!-- Template -->\n                <template id=\"tpl-blk-blk-1770205528854\">\n                    \n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"list-collapse-wrapper\">\n                    <div class=\"nested-section-header list-collapse-header\" data-target=\"list-crd-1770205662494\" style=\"cursor:pointer; display:flex; justify-content:space-between; align-items:center;\">\n                        <span>Buffs</span><span class=\"list-collapse-arrow\" style=\"font-size:0.8em; opacity:0.6;\">▼</span>\n                    </div>\n                    <div class=\"list-collapse-body\">\n                        <div id=\"list-crd-1770205662494\" class=\"simple-list\" data-bind-list=\"Buffs\" data-bind-list-fullpath=\"Mainchar.Buffs\" data-list-type=\"simple\" data-allow-delete=\"1\"></div>\n                    </div>\n                </div> \n            </div>\n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"list-collapse-wrapper\">\n                    <div class=\"nested-section-header list-collapse-header\" data-target=\"list-crd-1770205677565\" style=\"cursor:pointer; display:flex; justify-content:space-between; align-items:center;\">\n                        <span>Ailments</span><span class=\"list-collapse-arrow\" style=\"font-size:0.8em; opacity:0.6;\">▼</span>\n                    </div>\n                    <div class=\"list-collapse-body\">\n                        <div id=\"list-crd-1770205677565\" class=\"simple-list\" data-bind-list=\"Ailments\" data-bind-list-fullpath=\"Mainchar.Ailments\" data-list-type=\"simple\" data-allow-delete=\"1\"></div>\n                    </div>\n                </div> \n            </div>\n                </template>\n            </div>\n        </div>\n        <div class=\"col-wrapper\" style=\"width:50%\">\n            <div class=\"info-card\" style=\"\">\n                <div class=\"card-header\" id=\"lbl_blk_blk_1770205538619\">Map</div>\n                \n                <!-- Container for Dynamic Content -->\n                <div id=\"blk-blk-1770205538619\" class=\"prop-list\" data-bind-root=\"World\" data-template=\"tpl-blk-blk-1770205538619\" data-page-size=\"5\">\n                    <!-- Content will be injected here -->\n                </div>\n\n                <!-- Template -->\n                <template id=\"tpl-blk-blk-1770205538619\">\n                    \n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                <div style=\"text-align:center;\">\n                    <div class=\"img-wrapper\" style=\"text-align:center; position:relative; display:inline-block; width:100%; max-width:100%;\" data-bind-fullpath=\"World.MapImage\">\n                        <img \n                            src=\"\" \n                            alt=\"Card Title\" \n                            id=\"lbl_img_crd_1770205727421\"\n                            class=\"avatar-img\" \n                            style=\"width:100%; border-radius:4px; border:1px solid var(--accent-primary); cursor:pointer; display:block;\" \n                            data-bind-img=\"MapImage\" \n                            onclick=\"showImagePopup(this.src)\"\n                        />\n                        <!-- Edit Button -->\n                        <div class=\"img-edit-btn\" \n                            data-save-root=\"World\" \n                            data-save-leaf=\"MapImage\"\n                            onclick=\"handleEditClick(event, this)\"\n                        >\n                            ✎\n                        </div>\n                    </div></div> \n            </div>\n                </template>\n            </div>\n        </div>\n        <div class=\"col-wrapper\" style=\"width:100%\">\n            <div class=\"info-card\" style=\"\">\n                <div class=\"card-header\" id=\"lbl_blk_blk_1776467005665\">World Events</div>\n                \n                <!-- Container for Dynamic Content -->\n                <div id=\"blk-blk-1776467005665\" class=\"prop-list\" data-bind-root=\"World_Calc\" data-template=\"tpl-blk-blk-1776467005665\" data-page-size=\"5\">\n                    <!-- Content will be injected here -->\n                </div>\n\n                <!-- Template -->\n                <template id=\"tpl-blk-blk-1776467005665\">\n                    \n            <div class=\"prop-row-wrapper\" style=\"width:100%\">\n                \n                <div class=\"grid-group-card\">\n                    \n                    <div class=\"grid-group-content\"><div class=\"prop-row-wrapper\" style=\"width:100%\">\n                <div class=\"list-collapse-wrapper\">\n                    <div class=\"nested-section-header list-collapse-header\" data-target=\"list-crd-1776467032936\" style=\"cursor:pointer; display:flex; justify-content:space-between; align-items:center;\">\n                        <span>Factions</span><span class=\"list-collapse-arrow\" style=\"font-size:0.8em; opacity:0.6;\">▶</span>\n                    </div>\n                    <div class=\"list-collapse-body\" style=\"display:none;\">\n                        <div id=\"list-crd-1776467032936\" class=\"simple-list\" data-bind-list=\"Factions\" data-bind-list-fullpath=\"World_Calc.Factions\" data-list-type=\"simple\" data-allow-edit=\"1\" data-allow-delete=\"1\"></div>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:100%\">\n                <div class=\"list-collapse-wrapper\">\n                    <div class=\"nested-section-header list-collapse-header\" data-target=\"list-crd-1776467290754\" style=\"cursor:pointer; display:flex; justify-content:space-between; align-items:center;\">\n                        <span>Locations</span><span class=\"list-collapse-arrow\" style=\"font-size:0.8em; opacity:0.6;\">▶</span>\n                    </div>\n                    <div class=\"list-collapse-body\" style=\"display:none;\">\n                        <div id=\"list-crd-1776467290754\" class=\"simple-list\" data-bind-list=\"Locations\" data-bind-list-fullpath=\"World_Calc.Locations\" data-list-type=\"simple\" data-allow-edit=\"1\" data-allow-delete=\"1\"></div>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:100%\">\n                <div class=\"list-collapse-wrapper\">\n                    <div class=\"nested-section-header list-collapse-header\" data-target=\"list-crd-1776467309736\" style=\"cursor:pointer; display:flex; justify-content:space-between; align-items:center;\">\n                        <span>Ruins</span><span class=\"list-collapse-arrow\" style=\"font-size:0.8em; opacity:0.6;\">▶</span>\n                    </div>\n                    <div class=\"list-collapse-body\" style=\"display:none;\">\n                        <div id=\"list-crd-1776467309736\" class=\"simple-list\" data-bind-list=\"Ruins\" data-bind-list-fullpath=\"World_Calc.Ruins\" data-list-type=\"simple\" data-allow-edit=\"1\" data-allow-delete=\"1\"></div>\n                    </div>\n                </div></div><div class=\"prop-row-wrapper\" style=\"width:100%\">\n                <div class=\"list-collapse-wrapper\">\n                    <div class=\"nested-section-header list-collapse-header\" data-target=\"list-crd-1776467328410\" style=\"cursor:pointer; display:flex; justify-content:space-between; align-items:center;\">\n                        <span>Events</span><span class=\"list-collapse-arrow\" style=\"font-size:0.8em; opacity:0.6;\">▶</span>\n                    </div>\n                    <div class=\"list-collapse-body\" style=\"display:none;\">\n                        <div id=\"list-crd-1776467328410\" class=\"simple-list\" data-bind-list=\"Events\" data-bind-list-fullpath=\"World_Calc.Events\" data-list-type=\"simple\" data-allow-edit=\"1\" data-allow-delete=\"1\"></div>\n                    </div>\n                </div></div></div>\n                </div> \n            </div>\n                </template>\n            </div>\n        </div>\n        </div>\n    </div>\n\n    <div id=\"tab-ff-state\" class=\"tab-content\">\n        <div class=\"ffsm-toolbar\">\n            <input id=\"ffsm-search\" class=\"ffsm-search\" type=\"search\" placeholder=\"Search FF state...\" aria-label=\"Search FF state\">\n            <button class=\"ffsm-btn\" type=\"button\" onclick=\"setAllFFSMDetails(true)\">Expand</button>\n            <button class=\"ffsm-btn\" type=\"button\" onclick=\"setAllFFSMDetails(false)\">Collapse</button>\n        </div>\n        <div class=\"ffsm-scroll\">\n            <div id=\"ffsm-root\" class=\"ffsm-stack\"><div class=\"ffsm-empty\">Narrative state is not initialized yet.</div></div>\n        </div>\n    </div>\n\n    </div>\n\n    <!-- Templates -->\n    \n    <!-- Simple List Template -->\n    <template id=\"tmpl-simple\">\n        <div class=\"list-entry\" style=\"display:flex; justify-content:space-between; align-items:center;\">\n            <div>\n                <div class=\"entry-title\" data-slot=\"title\"></div>\n                <div class=\"entry-desc\" data-slot=\"desc\"></div>\n            </div>\n            <button class=\"list-delete-btn\" title=\"Delete\">&times;</button>\n        </div>\n    </template>\n\n    <!-- Grid List Template -->\n    <template id=\"tmpl-grid\">\n        <div class=\"grid-tile\" style=\"position:relative;\">\n            <span class=\"tile-name\" data-slot=\"name\"></span>\n            <span class=\"tile-qty\" data-slot=\"qty\"></span>\n            <button class=\"list-delete-btn\" style=\"position:absolute; top:2px; right:2px;\" title=\"Delete\">&times;</button>\n        </div>\n    </template>\n\n    <!-- Inventory List Template -->\n    <template id=\"tmpl-inventory\">\n        <div class=\"grid-tile\" style=\"cursor:pointer; position:relative; display:flex; flex-direction:row; align-items:center; justify-content:space-between; padding:6px 10px; height:100%; min-height:40px; text-align:left; border: 1px solid rgba(255,255,255,0.1); border-radius:4px; gap: 8px;\">\n            <span class=\"tile-name\" style=\"font-weight:bold; pointer-events:none; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\" data-slot=\"name\" title=\"\"></span>\n            <span class=\"tile-qty\" style=\"pointer-events:none; flex-shrink: 0;\" data-slot=\"qty\"></span>\n            <div class=\"item-action-wrap\">\n                <button class=\"item-menu-btn\" title=\"Actions\">⋮</button>\n                <div class=\"item-action-menu\">\n                    <button class=\"action-equip-btn\">⚔ Equip</button>\n                    <button class=\"action-delete-btn list-delete-btn\">🗑 Delete</button>\n                </div>\n            </div>\n            <div style=\"display:none\" data-slot=\"desc\"></div>\n        </div>\n    </template>\n\n    <!-- Equipment List Template -->\n    <template id=\"tmpl-equipment-action\">\n        <div class=\"list-entry\" style=\"display:flex; justify-content:space-between; align-items:center;\">\n            <div>\n                <div class=\"entry-title\" data-slot=\"title\"></div>\n                <div class=\"entry-desc\" data-slot=\"desc\"></div>\n            </div>\n            <div style=\"display:flex; gap:4px; align-items:center;\">\n                <button class=\"unequip-btn\" title=\"Unequip\">📤</button>\n                <button class=\"list-delete-btn\" title=\"Delete\">&times;</button>\n            </div>\n        </div>\n    </template>\n\n    <!-- Quest List Template -->\n    <template id=\"tmpl-quest\">\n        <div class=\"quest-card\">\n            <div class=\"quest-card-header\">\n                <span class=\"quest-card-title\" data-slot=\"title\"></span>\n                <div class=\"quest-card-actions\">\n                    <span class=\"quest-difficulty\" style=\"display:none\" data-slot=\"difficulty\"></span>\n                    <button class=\"quest-delete-btn list-delete-btn\" data-delete-key=\"\" title=\"Delete Quest\">&times;</button>\n                </div>\n            </div>\n            <div class=\"quest-desc\" style=\"display:none\" data-slot=\"desc\"></div>\n            <div class=\"quest-reward\" data-slot=\"reward\" style=\"display:none\">🏆 <span data-slot=\"reward-text\"></span></div>\n            <div class=\"quest-status\" data-slot=\"status-row\" style=\"display:none\">Status: <span data-slot=\"status\"></span></div>\n            <div class=\"quest-last-updated\" data-slot=\"last-updated-row\" style=\"display:none\">Last Updated: <span data-slot=\"LastUpdated\"></span></div>\n        </div>\n    </template>\n\n    \n\n    <!-- Item Detail Modal -->\n    <div id=\"detail-modal\">\n        <div id=\"detail-content\">\n            <button id=\"detail-close-btn\" onclick=\"document.getElementById('detail-modal').style.display='none'\">&times;</button>\n            <h3 id=\"detail-title\">Item Details</h3>\n            <div id=\"detail-body\"></div>\n        </div>\n    </div>";

// ---- bundled from dist/src/lumi/variables-editor.js ----
export const VARIABLES_EDITOR_CSS = `
  .ve-shell{display:flex;flex-direction:column;gap:8px;height:100%;min-height:0;color:var(--text-primary);}
  .ve-toolbar{display:flex;align-items:center;gap:6px;position:sticky;top:0;z-index:4;padding:4px 0 8px;background:rgba(0,31,63,.96);}
  .ve-search{flex:1;min-width:0;background:rgba(0,0,0,.22);border:1px solid var(--border-color);color:var(--text-primary);padding:7px 9px;border-radius:5px;outline:none;}
  .ve-search:focus{border-color:var(--accent-primary);box-shadow:0 0 0 1px rgba(0,229,255,.16);}
  .ve-hint{font-size:.76em;color:var(--text-secondary);white-space:nowrap;}
  .ve-tree{display:flex;flex-direction:column;gap:4px;padding-bottom:12px;}
  .ve-node,.ve-leaf{border:1px solid rgba(0,229,255,.18);border-radius:5px;background:rgba(0,12,28,.28);}
  .ve-node>summary{display:flex;align-items:center;gap:6px;min-height:34px;padding:5px 7px;cursor:pointer;list-style:none;}
  .ve-node>summary::-webkit-details-marker{display:none;}
  .ve-node>summary::before{content:'▸';color:var(--text-secondary);width:12px;flex:0 0 12px;}
  .ve-node[open]>summary::before{content:'▾';color:var(--accent-primary);}
  .ve-key{font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .ve-meta{font-size:.72em;color:var(--text-secondary);opacity:.8;white-space:nowrap;}
  .ve-count{font-size:.7em;color:var(--text-secondary);border:1px solid rgba(129,212,250,.2);border-radius:10px;padding:1px 6px;}
  .ve-spacer{flex:1;}
  .ve-actions{display:flex;align-items:center;gap:3px;flex:0 0 auto;}
  .ve-btn{border:1px solid rgba(0,229,255,.25);background:rgba(0,229,255,.07);color:var(--text-secondary);border-radius:4px;padding:3px 7px;cursor:pointer;font-size:.74em;line-height:1.25;}
  .ve-btn:hover:not(:disabled){color:var(--accent-primary);border-color:rgba(0,229,255,.55);background:rgba(0,229,255,.12);}
  .ve-btn.danger{color:#ff9a9a;border-color:rgba(255,100,100,.25);background:rgba(255,80,80,.05);}
  .ve-btn.danger:hover:not(:disabled){color:#ff6b6b;border-color:rgba(255,100,100,.55);}
  .ve-btn:disabled{opacity:.35;cursor:not-allowed;}
  .ve-children{display:flex;flex-direction:column;gap:4px;padding:0 6px 6px 18px;}
  .ve-leaf{display:grid;grid-template-columns:minmax(130px,.8fr) minmax(180px,1.4fr) auto;align-items:center;gap:7px;padding:6px 7px;}
  .ve-value{min-width:0;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:pre-wrap;word-break:break-word;max-height:4.8em;overflow-y:auto;}
  .ve-type{font-size:.68em;color:var(--text-secondary);opacity:.72;margin-left:5px;}
  .ve-empty{padding:16px;text-align:center;color:var(--text-secondary);}
  .ve-modal-overlay{position:absolute;inset:0;z-index:60000;background:rgba(0,0,0,.76);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;backdrop-filter:blur(2px);}
  .ve-modal{width:min(520px,calc(100% - 32px));max-height:calc(100% - 32px);overflow:auto;background:#001f3f;border:1px solid var(--accent-primary);border-radius:7px;padding:14px;color:var(--text-primary);box-shadow:0 16px 48px rgba(0,0,0,.48);}
  .ve-modal-title{font-weight:700;color:var(--accent-primary);font-size:1.05em;margin-bottom:10px;padding-bottom:7px;border-bottom:1px solid var(--border-color);}
  .ve-field{display:flex;flex-direction:column;gap:5px;margin:9px 0;}
  .ve-field>label{font-size:.78em;color:var(--text-secondary);}
  .ve-input,.ve-textarea,.ve-select{width:100%;box-sizing:border-box;background:rgba(0,0,0,.25);border:1px solid var(--border-color);border-radius:5px;color:var(--text-primary);padding:8px;outline:none;}
  .ve-textarea{min-height:110px;resize:vertical;}
  .ve-modal-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:12px;}
  .ve-path{font-size:.7em;color:var(--text-secondary);opacity:.7;word-break:break-all;margin-top:2px;}
  @media(max-width:680px){.ve-leaf{grid-template-columns:1fr;}.ve-actions{justify-content:flex-start;}.ve-hint{display:none;}}
`;
const VE_PROTECTED_ROOT = new Set([
    'World_Calc', 'World', 'Mainchar', 'Familiar', 'Narrative',
    'MVUStatMenu_DB_Ver', 'GameStarted',
]);
function veIsTuple(path, value) {
    return isLabeledTupleAtPath(path, value);
}
function veType(value) {
    if (value === null)
        return 'null';
    if (Array.isArray(value))
        return 'array';
    return typeof value;
}
function vePrimitiveText(value) {
    if (value === null)
        return 'null';
    if (typeof value === 'string')
        return value || '""';
    if (typeof value === 'boolean')
        return value ? 'true' : 'false';
    if (typeof value === 'number')
        return String(value);
    return String(value ?? '');
}
function veCloneJson(value) {
    return structuredClone(value);
}
function vePathText(path) {
    return path.join(' › ');
}
function veCanEditValue(path) {
    return !(path.length === 1 && VE_PROTECTED_ROOT.has(path[0])) && !isGuiVariableCoupledDomainPath(path);
}
function veCanManageEntry(path) {
    return isGuiVariableDynamicCollectionPath(path.slice(0, -1));
}
function veMatches(key, value, query, path, depth = 0) {
    if (!query)
        return true;
    if (depth > 20)
        return false;
    if (key.toLocaleLowerCase('ru').includes(query))
        return true;
    if (veIsTuple(path, value))
        return veMatches(key, value[0], query, [...path, '0'], depth + 1) || value[1].toLocaleLowerCase('ru').includes(query);
    if (value === null || typeof value !== 'object')
        return vePrimitiveText(value).toLocaleLowerCase('ru').includes(query);
    if (Array.isArray(value))
        return value.some((child, index) => veMatches(String(index), child, query, [...path, String(index)], depth + 1));
    if (isRecord(value))
        return Object.entries(value).some(([childKey, child]) => veMatches(childKey, child, query, [...path, childKey], depth + 1));
    return false;
}
function veButton(label, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 've-btn' + (className ? ' ' + className : '');
    button.textContent = label;
    return button;
}
function veModalBase(root, title) {
    root.getElementById('ve-modal-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 've-modal-overlay';
    overlay.className = 've-modal-overlay';
    const modal = document.createElement('div');
    modal.className = 've-modal';
    const heading = document.createElement('div');
    heading.className = 've-modal-title';
    heading.textContent = title;
    modal.appendChild(heading);
    overlay.appendChild(modal);
    const close = () => overlay.remove();
    overlay.addEventListener('click', event => { if (event.target === overlay)
        close(); });
    const modalLayer = root.querySelector('.status-body');
    (modalLayer ?? root).appendChild(overlay);
    return { overlay, modal, close };
}
function veModalActions(modal, close, saveLabel, onSave) {
    const actions = document.createElement('div');
    actions.className = 've-modal-actions';
    const cancel = veButton('Cancel');
    const save = veButton(saveLabel);
    save.style.color = 'var(--accent-primary)';
    cancel.addEventListener('click', close);
    save.addEventListener('click', onSave);
    actions.append(cancel, save);
    modal.appendChild(actions);
}
function veShowEdit(root, path, value, options) {
    const dialog = veModalBase(root, 'Edit value');
    const pathLine = document.createElement('div');
    pathLine.className = 've-path';
    pathLine.textContent = vePathText(path);
    dialog.modal.appendChild(pathLine);
    const field = document.createElement('div');
    field.className = 've-field';
    const label = document.createElement('label');
    label.textContent = 'Value';
    field.appendChild(label);
    let read;
    if (typeof value === 'boolean') {
        const select = document.createElement('select');
        select.className = 've-select';
        for (const bool of [true, false]) {
            const option = document.createElement('option');
            option.value = String(bool);
            option.textContent = String(bool);
            option.selected = bool === value;
            select.appendChild(option);
        }
        field.appendChild(select);
        read = () => select.value === 'true';
    }
    else if (typeof value === 'number') {
        const input = document.createElement('input');
        input.className = 've-input';
        input.type = 'number';
        input.step = 'any';
        input.value = String(value);
        field.appendChild(input);
        read = () => {
            const number = Number(input.value);
            if (!Number.isFinite(number))
                throw new Error('Value must be a finite number');
            return number;
        };
    }
    else {
        const input = document.createElement('textarea');
        input.className = 've-textarea';
        input.value = value === null ? '' : String(value ?? '');
        field.appendChild(input);
        read = () => input.value;
    }
    dialog.modal.appendChild(field);
    veModalActions(dialog.modal, dialog.close, 'Save', () => {
        try {
            options.onIntent({ type: 'variable.set', path, value: read() });
            dialog.close();
        }
        catch (error) {
            window.alert(String(error));
        }
    });
}
function veShowRename(root, path, key, options) {
    const dialog = veModalBase(root, 'Rename key');
    const pathLine = document.createElement('div');
    pathLine.className = 've-path';
    pathLine.textContent = vePathText(path.slice(0, -1));
    dialog.modal.appendChild(pathLine);
    const field = document.createElement('div');
    field.className = 've-field';
    const label = document.createElement('label');
    label.textContent = 'New name';
    const input = document.createElement('input');
    input.className = 've-input';
    input.value = key;
    field.append(label, input);
    dialog.modal.appendChild(field);
    veModalActions(dialog.modal, dialog.close, 'Rename', () => {
        const newKey = input.value.trim();
        if (!newKey)
            return;
        options.onIntent({ type: 'variable.rename', path, newKey });
        dialog.close();
    });
    queueMicrotask(() => { input.focus(); input.select(); });
}
function veShowAdd(root, parentPath, parent, options) {
    const dialog = veModalBase(root, 'Add entry');
    const pathLine = document.createElement('div');
    pathLine.className = 've-path';
    pathLine.textContent = vePathText(parentPath) || 'State';
    dialog.modal.appendChild(pathLine);
    const keyField = document.createElement('div');
    keyField.className = 've-field';
    const keyLabel = document.createElement('label');
    keyLabel.textContent = 'Name';
    const keyInput = document.createElement('input');
    keyInput.className = 've-input';
    keyInput.placeholder = 'New entry';
    keyField.append(keyLabel, keyInput);
    const structureField = document.createElement('div');
    structureField.className = 've-field';
    const structureLabel = document.createElement('label');
    structureLabel.textContent = 'Structure';
    const structure = document.createElement('select');
    structure.className = 've-select';
    const basics = [
        ['object', 'Empty object'],
        ['text', 'Text'],
        ['number', 'Number'],
        ['boolean', 'Boolean'],
    ];
    for (const [value, labelText] of basics) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = labelText;
        structure.appendChild(option);
    }
    for (const siblingKey of Object.keys(parent).slice(0, 80)) {
        const option = document.createElement('option');
        option.value = 'copy:' + siblingKey;
        option.textContent = 'Copy structure/value from “' + siblingKey + '”';
        structure.appendChild(option);
    }
    structureField.append(structureLabel, structure);
    dialog.modal.append(keyField, structureField);
    veModalActions(dialog.modal, dialog.close, 'Add', () => {
        const key = keyInput.value.trim();
        if (!key)
            return;
        let value;
        if (structure.value === 'text')
            value = '';
        else if (structure.value === 'number')
            value = 0;
        else if (structure.value === 'boolean')
            value = false;
        else if (structure.value.startsWith('copy:')) {
            const sourceKey = structure.value.slice(5);
            value = veCloneJson(parent[sourceKey]);
        }
        else
            value = {};
        options.onIntent({ type: 'variable.add', parentPath, key, value });
        dialog.close();
    });
    queueMicrotask(() => keyInput.focus());
}
function veActionButtons(root, path, key, value, parentIsArray, options) {
    const actions = document.createElement('div');
    actions.className = 've-actions';
    const editable = veCanEditValue(path);
    const manageable = !parentIsArray && veCanManageEntry(path);
    if (editable && (value === null || typeof value !== 'object' || veIsTuple(path, value))) {
        const edit = veButton('Edit');
        edit.disabled = options.mutationDisabled;
        edit.addEventListener('click', event => {
            event.stopPropagation();
            const editPath = veIsTuple(path, value) ? [...path, '0'] : path;
            const editValue = veIsTuple(path, value) ? value[0] : value;
            veShowEdit(root, editPath, editValue, options);
        });
        actions.appendChild(edit);
    }
    if (manageable) {
        const rename = veButton('Rename');
        rename.disabled = options.mutationDisabled;
        rename.addEventListener('click', event => {
            event.stopPropagation();
            veShowRename(root, path, key, options);
        });
        actions.appendChild(rename);
    }
    if (manageable) {
        const remove = veButton('Delete', 'danger');
        remove.disabled = options.mutationDisabled;
        remove.addEventListener('click', event => {
            event.stopPropagation();
            if (!window.confirm('Delete “' + key + '”?'))
                return;
            options.onIntent({ type: 'variable.delete', path });
        });
        actions.appendChild(remove);
    }
    return actions;
}
function veRenderEntry(root, key, value, path, parentIsArray, depth, query, options) {
    if (!veMatches(key, value, query, path))
        return null;
    const tuple = veIsTuple(path, value);
    const effectiveValue = tuple ? value[0] : value;
    const isContainer = !tuple && effectiveValue !== null && typeof effectiveValue === 'object';
    if (!isContainer) {
        const row = document.createElement('div');
        row.className = 've-leaf';
        const keyBox = document.createElement('div');
        const keyLine = document.createElement('div');
        keyLine.className = 've-key';
        keyLine.textContent = key;
        keyBox.appendChild(keyLine);
        if (tuple) {
            const label = document.createElement('div');
            label.className = 've-meta';
            label.textContent = value[1];
            keyBox.appendChild(label);
        }
        const valueBox = document.createElement('div');
        valueBox.className = 've-value';
        valueBox.textContent = vePrimitiveText(effectiveValue);
        row.append(keyBox, valueBox, veActionButtons(root, path, key, value, parentIsArray, options));
        return row;
    }
    const details = document.createElement('details');
    details.className = 've-node';
    details.open = Boolean(query) || depth < 1;
    const summary = document.createElement('summary');
    const keyElement = document.createElement('span');
    keyElement.className = 've-key';
    keyElement.textContent = key;
    const count = document.createElement('span');
    count.className = 've-count';
    const childCount = Array.isArray(effectiveValue) ? effectiveValue.length : Object.keys(effectiveValue).length;
    count.textContent = String(childCount);
    const spacer = document.createElement('span');
    spacer.className = 've-spacer';
    summary.append(keyElement, count, spacer, veActionButtons(root, path, key, value, parentIsArray, options));
    const children = document.createElement('div');
    children.className = 've-children';
    if (Array.isArray(effectiveValue)) {
        effectiveValue.forEach((child, index) => {
            const rendered = veRenderEntry(root, String(index), child, [...path, String(index)], true, depth + 1, query, options);
            if (rendered)
                children.appendChild(rendered);
        });
    }
    else {
        const object = effectiveValue;
        for (const [childKey, child] of Object.entries(object)) {
            const rendered = veRenderEntry(root, childKey, child, [...path, childKey], false, depth + 1, query, options);
            if (rendered)
                children.appendChild(rendered);
        }
        if (isGuiVariableDynamicCollectionPath(path)) {
            const add = veButton('+ Add entry');
            add.disabled = options.mutationDisabled;
            add.style.alignSelf = 'flex-start';
            add.addEventListener('click', event => {
                event.stopPropagation();
                veShowAdd(root, path, object, options);
            });
            children.appendChild(add);
        }
    }
    if (!children.children.length) {
        const empty = document.createElement('div');
        empty.className = 've-empty';
        empty.textContent = 'No matching entries';
        children.appendChild(empty);
    }
    details.append(summary, children);
    return details;
}
export function renderVariablesEditor(root, options) {
    const shell = document.createElement('div');
    shell.className = 've-shell';
    const toolbar = document.createElement('div');
    toolbar.className = 've-toolbar';
    const search = document.createElement('input');
    search.className = 've-search';
    search.type = 'search';
    search.placeholder = 'Search variables…';
    search.value = options.search;
    const hint = document.createElement('span');
    hint.className = 've-hint';
    hint.textContent = 'Edit values · manage user entries';
    toolbar.append(search, hint);
    const tree = document.createElement('div');
    tree.className = 've-tree';
    const draw = () => {
        tree.replaceChildren();
        const query = search.value.trim().toLocaleLowerCase('ru');
        for (const [key, value] of Object.entries(options.state)) {
            const rendered = veRenderEntry(root, key, value, [key], false, 0, query, options);
            if (rendered)
                tree.appendChild(rendered);
        }
        if (!tree.children.length) {
            const empty = document.createElement('div');
            empty.className = 've-empty';
            empty.textContent = 'Nothing found';
            tree.appendChild(empty);
        }
    };
    search.addEventListener('input', () => {
        options.onSearch(search.value);
        draw();
    });
    shell.append(toolbar, tree);
    draw();
    return shell;
}

// ---- bundled from dist/src/lumi/statusmenu-legacy-view.js ----
const TAB_IDS = {
    overview: 'tab-tab-1',
    attributes: 'tab-tab-1770046656361',
    familiars: 'tab-tab-1770138241595',
    wardrobe: 'tab-outfits',
    equipment: 'tab-tab-1770203490813',
    items: 'tab-tab-1770205420551',
    others: 'tab-tab-1770205502569',
    ffstate: 'tab-ff-state',
    variables: 'tab-variables',
};
const TAB_ORDER = [
    'overview', 'attributes', 'familiars', 'wardrobe',
    'equipment', 'items', 'others', 'ffstate', 'variables',
];
const EMPTY_TEXT = {
    simple: 'None',
    quest: 'No active quests',
    inventory: 'Empty inventory',
    'equipment-action': 'Nothing equipped',
};
const OUTFIT_SLOT_ORDER = { Head: 0, Torso: 1, Legs: 2, Feet: 3, Extra: 4 };
const OUTFIT_LAYER_ORDER = { Underwear: 0, Base: 1, Outerwear: 2 };
const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 200'%3E%3Crect fill='%23e0e0e0' width='300' height='200'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='0.3em' fill='%23999' font-size='16' font-family='sans-serif'%3ENo Image%3C/text%3E%3C/svg%3E";
const LOCAL_IMAGE_PREFIX = 'mzsb_img_';
function record(value) {
    return isRecord(value) ? value : {};
}
function legacyTupleValue(value) {
    return Array.isArray(value) && value.length >= 2 && typeof value[1] === 'string' ? value[0] : value;
}
function getPath(root, path) {
    let value = root;
    for (const part of path.split('.').filter(Boolean)) {
        if (!isRecord(value) && !Array.isArray(value))
            return undefined;
        value = value[part];
    }
    return legacyTupleValue(value);
}
function numberAt(root, path) {
    const raw = getPath(root, path);
    if (raw === null || raw === undefined || raw === '' || raw === '???')
        return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}
function imageStoragePath(target) {
    if (target.kind === 'player-avatar')
        return 'Mainchar.Image';
    if (target.kind === 'world-map')
        return 'World.MapImage';
    return 'Familiar.' + target.id + '.Image';
}
function imageStateValue(state, target) {
    if (target.kind === 'player-avatar')
        return statusText(state.Mainchar.Image, '');
    if (target.kind === 'world-map')
        return statusText(state.World.MapImage, '');
    const familiar = asRecord(state.Familiar)[target.id];
    return isRecord(familiar) ? statusText(familiar.Image, '') : '';
}
function readLocalImage(path) {
    try {
        return window.localStorage.getItem(LOCAL_IMAGE_PREFIX + path) || '';
    }
    catch {
        return '';
    }
}
function writeLocalImage(path, value) {
    try {
        window.localStorage.setItem(LOCAL_IMAGE_PREFIX + path, value);
    }
    catch {
        throw new Error('LOCAL_IMAGE_STORAGE_FAILED');
    }
}
function clearLocalImage(path) {
    try {
        window.localStorage.removeItem(LOCAL_IMAGE_PREFIX + path);
    }
    catch { }
}
function imageTargetForButton(button) {
    const root = button.getAttribute('data-save-root');
    const leaf = button.getAttribute('data-save-leaf');
    if (root === 'Mainchar' && leaf === 'Image')
        return { kind: 'player-avatar' };
    if (root === 'World' && leaf === 'MapImage')
        return { kind: 'world-map' };
    if (root === 'Familiar' && leaf === 'Image') {
        const id = button.dataset.ffmvuFamiliarId;
        if (id)
            return { kind: 'familiar-avatar', id };
    }
    return null;
}
function imageBytes(dataUrl) {
    return Math.ceil((dataUrl.split(',')[1] || '').length * 3 / 4);
}
function compressLocalImage(file) {
    return new Promise((resolve, reject) => {
        if (!file)
            return reject(new Error('no_file'));
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read_failed'));
        reader.onload = () => {
            const image = new Image();
            image.onerror = () => reject(new Error('decode_failed'));
            image.onload = () => {
                const longest = Math.max(image.width, image.height) || 1;
                const scale = Math.min(1, 1920 / longest);
                const width = Math.max(1, Math.round(image.width * scale));
                const height = Math.max(1, Math.round(image.height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext('2d');
                if (!context)
                    return reject(new Error('canvas_failed'));
                context.drawImage(image, 0, 0, width, height);
                let quality = 0.9;
                let out = canvas.toDataURL('image/jpeg', quality);
                while (imageBytes(out) > 1536 * 1024 && quality > 0.6) {
                    quality = Math.max(0.6, quality - 0.1);
                    out = canvas.toDataURL('image/jpeg', quality);
                }
                if (imageBytes(out) > 1536 * 1024)
                    return reject(new Error('compressed_image_too_large'));
                resolve(out);
            };
            image.src = String(reader.result || '');
        };
        reader.readAsDataURL(file);
    });
}
function shownNumber(value) {
    if (value === null)
        return '—';
    return String(Number.isInteger(value) ? value : Math.round(value * 10) / 10);
}
function setSlot(fragment, name, value) {
    const element = fragment.querySelector('[data-slot="' + name + '"]');
    if (!element)
        return;
    element.textContent = value;
    if (value)
        element.style.display = '';
}
function describe(raw) {
    const value = legacyTupleValue(raw);
    if (value === null || value === undefined)
        return '';
    if (!isRecord(value))
        return String(value);
    for (const key of ['Desc', 'description', 'name', 'type']) {
        if (value[key] !== undefined)
            return statusText(value[key], '');
    }
    return '';
}
function ownerRefForId(state, ownerId) {
    return statusOwnerById(state, ownerId).ref;
}
function shadowCss() {
    return LEGACY_STATUS_CSS
        .replace(/:root\s*\{/g, ':host {')
        .replace(/\bbody\s*\{/g, '.status-body {')
        + '\n'
        + ':host{display:block;width:100%;height:100%;min-height:0;color:#e0f7fa;position:relative;overflow:hidden;}'
        + '.status-body{position:absolute;top:0;left:50%;width:100%;height:128.205128%;min-height:0;padding:0!important;color:var(--text-primary)!important;transform:translateX(-50%) scale(.78);transform-origin:top center;}'
        + '.status-container{height:100%;min-height:0!important;color:var(--text-primary)!important;}'
        + '.tab-content{min-height:0;}'
        + '.prop-val,.ff25-value,.entry-title,.detail-val{color:var(--text-primary)!important;}'
        + 'button,input,textarea,select{font-family:inherit;}'
        + VARIABLES_EDITOR_CSS;
}
function bindValues(root, data) {
    root.querySelectorAll('[data-bind-val]').forEach(element => {
        const path = element.getAttribute('data-bind-val');
        if (path === null)
            return;
        element.textContent = statusText(getPath(data, path), '???');
    });
    root.querySelectorAll('[data-bind-curr]').forEach(element => {
        const path = element.getAttribute('data-bind-curr');
        if (path !== null)
            element.textContent = statusText(getPath(data, path), '0');
    });
    root.querySelectorAll('[data-bind-max]').forEach(element => {
        const path = element.getAttribute('data-bind-max');
        if (path !== null)
            element.textContent = statusText(getPath(data, path), '100');
    });
    root.querySelectorAll('[data-bind-bar]').forEach(element => {
        const path = element.getAttribute('data-bind-bar');
        if (!path)
            return;
        const maxPath = element.getAttribute('data-bind-bar-max') || path.replace('_curr', '_max');
        const current = Number(getPath(data, path)) || 0;
        const maximum = Number(getPath(data, maxPath)) || 100;
        const pct = Math.max(0, Math.min(100, maximum > 0 ? current / maximum * 100 : 0));
        element.style.width = pct + '%';
    });
    root.querySelectorAll('[data-bind-checked]').forEach(element => {
        const path = element.getAttribute('data-bind-checked');
        if (path)
            element.checked = Boolean(getPath(data, path));
    });
    root.querySelectorAll('[data-bind-img]').forEach(element => {
        const path = element.getAttribute('data-bind-img');
        if (!path)
            return;
        const value = statusText(getPath(data, path), '');
        if (value && value !== '—' && value !== 'N/A') {
            element.src = value;
            element.style.display = 'block';
        }
        else if (element.classList.contains('ff25-avatar-image')) {
            element.removeAttribute('src');
            element.style.display = 'none';
        }
        else {
            element.src = PLACEHOLDER_IMAGE;
            element.style.display = 'block';
        }
    });
}
function bindOverview(root, state) {
    root.querySelectorAll('[data-ff25-cur]').forEach(row => {
        const current = numberAt(state, row.getAttribute('data-ff25-cur') || '');
        const maximum = numberAt(state, row.getAttribute('data-ff25-max') || '');
        const currentElement = row.querySelector('.ff25-stat-current');
        const maximumElement = row.querySelector('.ff25-stat-max');
        const fill = row.querySelector('.ff25-stat-fill');
        if (currentElement)
            currentElement.textContent = shownNumber(current);
        if (maximumElement)
            maximumElement.textContent = shownNumber(maximum);
        if (fill) {
            const pct = current !== null && maximum !== null && maximum > 0 ? Math.max(0, Math.min(100, current / maximum * 100)) : 0;
            fill.style.height = pct + '%';
        }
    });
    const avatar = root.querySelector('.ff25-avatar-image');
    const placeholder = root.querySelector('.ff25-avatar-placeholder');
    if (placeholder)
        placeholder.style.display = avatar && avatar.style.display === 'block' ? 'none' : 'flex';
    const hph = getPath(state, 'Narrative.Scene.HPH.player');
    const hphElement = root.getElementById('ff25-hph');
    const lower = root.getElementById('ff25-lower');
    const hasHph = isRecord(hph);
    if (hphElement)
        hphElement.style.display = hasHph ? '' : 'none';
    if (lower)
        lower.classList.toggle('ff25-no-hph', !hasHph);
    if (!hasHph)
        return;
    const clamp10 = (value) => value === null ? 0 : Math.max(0, Math.min(10, value));
    const bladder = numberAt(state, 'Narrative.Scene.HPH.player.Physiology.Bladder');
    const arousal = numberAt(state, 'Narrative.Scene.HPH.player.Physiology.Arousal');
    const erection = numberAt(state, 'Narrative.Scene.HPH.player.Physiology.ErectionLevel')
        ?? numberAt(state, 'Narrative.Scene.HPH.player.Physiology.ErectionCapacity');
    const semen = numberAt(state, 'Narrative.Scene.HPH.player.Physiology.SemenMl');
    const semenMax = numberAt(state, 'Narrative.Scene.HPH.player.Physiology.SemenCapacityMl');
    const length = numberAt(state, 'Narrative.Scene.HPH.player.Penis.LengthCm');
    const girth = numberAt(state, 'Narrative.Scene.HPH.player.Penis.GirthCm');
    const write = (id, value) => {
        const element = root.getElementById(id);
        if (element)
            element.textContent = shownNumber(value);
    };
    const setHeight = (id, pct) => {
        const element = root.getElementById(id);
        if (element)
            element.style.height = Math.max(0, Math.min(100, pct)) + '%';
    };
    setHeight('ff25-bladder-fill', clamp10(bladder) * 10);
    setHeight('ff25-arousal-fill', clamp10(arousal) * 10);
    setHeight('ff25-erection-fill', clamp10(erection) * 10);
    setHeight('ff25-semen-fill', semen !== null && semenMax !== null && semenMax > 0 ? semen / semenMax * 100 : 0);
    write('ff25-bladder-value', bladder);
    write('ff25-arousal-value', arousal);
    write('ff25-erection-value', erection);
    write('ff25-semen-value', semen);
    write('ff25-length-value', length);
    write('ff25-girth-value', girth);
}
function showImage(root, src) {
    if (!src || src === PLACEHOLDER_IMAGE)
        return;
    const overlay = document.createElement('div');
    overlay.className = 'img-popup-overlay';
    overlay.style.display = 'flex';
    const image = document.createElement('img');
    image.className = 'img-popup-content';
    image.src = src;
    overlay.appendChild(image);
    overlay.addEventListener('click', () => overlay.remove());
    root.appendChild(overlay);
}
function formatDetail(container, value, depth = 0) {
    const raw = legacyTupleValue(value);
    if (!isRecord(raw) && !Array.isArray(raw)) {
        container.appendChild(document.createTextNode(raw === null || raw === undefined ? 'null' : String(raw)));
        return;
    }
    const entries = Array.isArray(raw) ? raw.map((child, index) => [String(index), child]) : Object.entries(raw);
    for (const [key, child] of entries) {
        if (['$meta', '$key', 'template'].includes(key))
            continue;
        const row = document.createElement('div');
        row.className = 'detail-row';
        row.style.paddingLeft = Math.min(depth * 8, 24) + 'px';
        const keyElement = document.createElement('span');
        keyElement.className = 'detail-key';
        keyElement.textContent = key + ':';
        const valueElement = document.createElement('span');
        valueElement.className = 'detail-val';
        if (isRecord(legacyTupleValue(child)) || Array.isArray(legacyTupleValue(child))) {
            formatDetail(valueElement, child, depth + 1);
        }
        else {
            valueElement.textContent = statusText(child, 'null');
        }
        row.append(keyElement, valueElement);
        container.appendChild(row);
    }
}
const LEGACY_DETAIL_HIDDEN_FIELDS = new Set(['$meta', '$key', 'template', 'name']);
function legacyEditValue(raw) {
    if (raw === 'true')
        return true;
    if (raw === 'false')
        return false;
    if (raw !== '' && raw.trim() !== '' && !Number.isNaN(Number(raw)))
        return Number(raw);
    try {
        const parsed = JSON.parse(raw);
        if (parsed !== null && typeof parsed === 'object')
            return parsed;
        if (parsed === null)
            return null;
    }
    catch { }
    return raw;
}
function showDetail(root, title, value, edit) {
    const modal = root.getElementById('detail-modal');
    const titleElement = root.getElementById('detail-title');
    const body = root.getElementById('detail-body');
    if (!modal || !titleElement || !body)
        return;
    titleElement.textContent = title;
    const editableRecord = isRecord(legacyTupleValue(value)) ? legacyTupleValue(value) : null;
    const renderReadOnly = () => {
        body.replaceChildren();
        formatDetail(body, value);
        if (!edit || !editableRecord)
            return;
        const actions = document.createElement('div');
        actions.style.cssText = 'margin-top:15px;display:flex;justify-content:flex-end;gap:8px;';
        const button = document.createElement('button');
        button.textContent = '✏ Edit';
        button.disabled = edit.mutationDisabled;
        button.style.cssText = 'background:rgba(0,229,255,.15);border:1px solid rgba(0,229,255,.4);color:#00e5ff;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:.9em;';
        button.addEventListener('click', () => {
            body.replaceChildren();
            const form = document.createElement('div');
            form.style.cssText = 'padding-left:10px;border-left:2px solid var(--accent-primary);';
            for (const [key, child] of Object.entries(editableRecord)) {
                if (LEGACY_DETAIL_HIDDEN_FIELDS.has(key))
                    continue;
                const row = document.createElement('div');
                row.style.cssText = 'padding:4px 0;border-bottom:1px dotted rgba(255,255,255,.1);display:flex;align-items:flex-start;gap:8px;';
                const label = document.createElement('span');
                label.textContent = key + ':';
                label.style.cssText = 'color:var(--accent-primary);font-weight:bold;min-width:80px;padding-top:6px;flex-shrink:0;';
                const input = document.createElement('textarea');
                input.dataset.field = key;
                input.style.cssText = 'flex:1;background:rgba(255,255,255,.08);border:1px solid var(--border-color);color:var(--text-primary);padding:4px 8px;border-radius:4px;font-size:.9em;font-family:inherit;resize:vertical;box-sizing:border-box;';
                const shown = child !== null && typeof child === 'object' ? JSON.stringify(child, null, 2) : child === null || child === undefined ? '' : String(child);
                input.value = shown;
                const lineCount = shown.split('\n').length;
                input.rows = Math.min(12, Math.max(2, lineCount, Math.ceil(shown.length / 40)));
                row.append(label, input);
                form.appendChild(row);
            }
            body.appendChild(form);
            const editActions = document.createElement('div');
            editActions.style.cssText = 'margin-top:15px;display:flex;justify-content:flex-end;gap:8px;';
            const cancel = document.createElement('button');
            cancel.textContent = 'Cancel';
            cancel.style.cssText = 'background:rgba(255,100,100,.15);border:1px solid rgba(255,100,100,.4);color:#ff6b6b;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:.9em;';
            cancel.addEventListener('click', renderReadOnly);
            const save = document.createElement('button');
            save.textContent = '💾 Save';
            save.disabled = edit.mutationDisabled;
            save.style.cssText = 'background:rgba(0,200,100,.2);border:1px solid rgba(0,200,100,.5);color:#00c864;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:.9em;';
            save.addEventListener('click', () => {
                const fields = {};
                form.querySelectorAll('textarea[data-field]').forEach(input => {
                    const field = input.dataset.field;
                    if (field)
                        fields[field] = legacyEditValue(input.value);
                });
                edit.onSave(fields);
                modal.style.display = 'none';
            });
            editActions.append(cancel, save);
            body.appendChild(editActions);
        });
        actions.appendChild(button);
        body.appendChild(actions);
    };
    renderReadOnly();
    modal.style.display = 'flex';
}
function showEquipTarget(root, state, sourceOwner, itemKey, onIntent) {
    const existing = root.getElementById('ffmvu-equip-overlay');
    existing?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'ffmvu-equip-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;width:100vw;height:100dvh;background:rgba(0,0,0,.85);z-index:50000;display:flex;justify-content:center;align-items:center;overflow:auto;padding:12px;box-sizing:border-box;backdrop-filter:blur(2px);';
    const content = document.createElement('div');
    content.style.cssText = 'background:#001f3f;border:1px solid #00e5ff;padding:20px;border-radius:8px;width:90%;max-width:min(400px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;color:#e0f7fa;box-shadow:0 0 20px rgba(0,229,255,.2);box-sizing:border-box;';
    const title = document.createElement('h3');
    title.textContent = 'Equip to...';
    title.style.cssText = 'margin-top:0;color:#00e5ff;margin-bottom:15px;border-bottom:1px solid rgba(0,229,255,.3);padding-bottom:10px;';
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;margin-bottom:15px;';
    for (const owner of statusOwners(state)) {
        const button = document.createElement('button');
        button.textContent = owner.ref.kind === 'player' ? 'Main Character' : owner.label + ' (Familiar)';
        button.style.cssText = 'padding:12px;background:rgba(0,229,255,.1);border:1px solid rgba(0,229,255,.3);color:#e0f7fa;border-radius:4px;cursor:pointer;text-align:left;font-size:1em;';
        button.addEventListener('click', () => {
            overlay.remove();
            onIntent({ type: 'equipment.equip', sourceOwner, targetOwner: owner.ref, itemKey });
        });
        list.appendChild(button);
    }
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.style.cssText = 'width:100%;padding:10px;background:rgba(255,100,100,.1);border:1px solid rgba(255,100,100,.4);color:#ff6b6b;border-radius:4px;cursor:pointer;font-weight:bold;';
    cancel.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', event => { if (event.target === overlay)
        overlay.remove(); });
    content.append(title, list, cancel);
    overlay.appendChild(content);
    root.appendChild(overlay);
}
function openImageEditor(root, state, target, onIntent, mutationDisabled) {
    root.getElementById('ffmvu-image-edit-overlay')?.remove();
    const host = root.querySelector('.status-body');
    if (!host)
        return;
    const overlay = document.createElement('div');
    overlay.id = 'ffmvu-image-edit-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;z-index:60000;display:flex;justify-content:center;align-items:center;background:rgba(0,0,0,.85);padding:12px;box-sizing:border-box;backdrop-filter:blur(2px);';
    const content = document.createElement('div');
    content.style.cssText = 'background:#001f3f;border:1px solid #00e5ff;padding:20px;border-radius:8px;width:90%;max-width:400px;max-height:90%;overflow:auto;color:#e0f7fa;box-shadow:0 0 20px rgba(0,0,0,.5);box-sizing:border-box;';
    const title = document.createElement('h3');
    title.textContent = target.kind === 'world-map' ? 'Edit Map Image' : 'Edit Avatar';
    title.style.cssText = 'margin:0 0 14px;color:#00e5ff;';
    const path = imageStoragePath(target);
    const local = readLocalImage(path);
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = local ? '(Local image currently set) Enter URL to replace...' : 'https://...';
    const current = imageStateValue(state, target);
    if (!local && /^https?:\/\//i.test(current))
        urlInput.value = current;
    urlInput.style.cssText = 'width:100%;padding:10px;background:rgba(255,255,255,.1);border:1px solid rgba(0,229,255,.3);color:#e0f7fa;border-radius:4px;box-sizing:border-box;';
    const save = document.createElement('button');
    save.textContent = 'Save URL';
    save.disabled = mutationDisabled;
    save.style.cssText = 'margin-top:8px;width:100%;padding:10px;background:rgba(0,229,255,.2);border:1px solid #00e5ff;color:#00e5ff;border-radius:4px;cursor:pointer;font-weight:bold;';
    const divider = document.createElement('div');
    divider.textContent = '— or —';
    divider.style.cssText = 'text-align:center;color:#81d4fa;margin:14px 0;';
    const browse = document.createElement('button');
    browse.textContent = '📂 Browse Local File';
    browse.style.cssText = 'width:100%;padding:10px;background:rgba(0,229,255,.1);border:1px dashed rgba(0,229,255,.4);color:#81d4fa;border-radius:4px;cursor:pointer;font-weight:bold;';
    const hint = document.createElement('div');
    hint.textContent = 'Local files are compressed and stored only in this browser (max 1920px, ~1.5MB), matching the legacy StatusMenu behavior.';
    hint.style.cssText = 'font-size:.8em;color:rgba(129,212,250,.75);margin-top:6px;';
    const close = document.createElement('button');
    close.textContent = 'Cancel';
    close.style.cssText = 'margin-top:14px;width:100%;padding:9px;background:rgba(255,100,100,.08);border:1px solid rgba(255,100,100,.35);color:#ff9b9b;border-radius:4px;cursor:pointer;';
    const finishUrl = () => {
        const value = urlInput.value.trim();
        if (!value)
            return;
        if (!/^https?:\/\//i.test(value)) {
            window.alert('Image URL must start with http:// or https://');
            return;
        }
        clearLocalImage(path);
        onIntent({ type: 'image.set', target, value });
        overlay.remove();
    };
    save.addEventListener('click', finishUrl);
    urlInput.addEventListener('keydown', event => { if (event.key === 'Enter') {
        event.preventDefault();
        finishUrl();
    } });
    browse.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file)
                return;
            try {
                browse.textContent = 'Processing...';
                browse.setAttribute('disabled', 'true');
                const encoded = await compressLocalImage(file);
                writeLocalImage(path, encoded);
                if (current)
                    onIntent({ type: 'image.set', target, value: '' });
                const editButton = root.querySelector('.img-edit-btn[data-save-root="' + (target.kind === 'world-map' ? 'World' : target.kind === 'player-avatar' ? 'Mainchar' : 'Familiar') + '"]' + (target.kind === 'familiar-avatar' ? '[data-ffmvu-familiar-id="' + CSS.escape(target.id) + '"]' : ''));
                const image = editButton?.closest('.img-wrapper')?.querySelector('img[data-bind-img]') ?? null;
                if (image) {
                    image.src = encoded;
                    image.style.display = 'block';
                    const placeholder = image.closest('.img-wrapper')?.querySelector('.ff25-avatar-placeholder');
                    if (placeholder)
                        placeholder.style.display = 'none';
                }
                overlay.remove();
            }
            catch (error) {
                window.alert('Failed to process image: ' + String(error));
                browse.textContent = '📂 Browse Local File';
                browse.removeAttribute('disabled');
            }
        });
        input.click();
    });
    close.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', event => { if (event.target === overlay)
        overlay.remove(); });
    content.append(title, urlInput, save, divider, browse, hint, close);
    overlay.appendChild(content);
    host.appendChild(overlay);
    urlInput.focus();
}
function wireImages(root, state, onIntent, mutationDisabled, onUnsupported) {
    root.querySelectorAll('img[data-bind-img]').forEach(image => {
        image.removeAttribute('onclick');
        if (image.dataset.ffmvuImageViewBound !== '1') {
            image.dataset.ffmvuImageViewBound = '1';
            image.addEventListener('click', () => showImage(root, image.src));
        }
    });
    root.querySelectorAll('.img-edit-btn').forEach(button => {
        button.removeAttribute('onclick');
        if (button.dataset.ffmvuImageEditBound === '1')
            return;
        button.dataset.ffmvuImageEditBound = '1';
        const target = imageTargetForButton(button);
        if (!target) {
            button.addEventListener('click', event => {
                event.stopPropagation();
                onUnsupported('This legacy image target is not mapped to a typed Lumiverse intent yet.');
            });
            return;
        }
        const local = readLocalImage(imageStoragePath(target));
        if (local) {
            const image = button.closest('.img-wrapper')?.querySelector('img[data-bind-img]');
            if (image) {
                image.src = local;
                image.style.display = 'block';
                const placeholder = image.closest('.img-wrapper')?.querySelector('.ff25-avatar-placeholder');
                if (placeholder)
                    placeholder.style.display = 'none';
            }
        }
        button.toggleAttribute('aria-disabled', mutationDisabled);
        button.addEventListener('click', event => {
            event.stopPropagation();
            if (mutationDisabled)
                return;
            openImageEditor(root, state, target, onIntent, mutationDisabled);
        });
    });
}
function wireCheckboxes(root, onIntent, mutationDisabled) {
    root.querySelectorAll('.ar-checkbox-input').forEach(input => {
        const familiarId = input.dataset.ffmvuFamiliarId;
        const field = input.getAttribute('data-save-leaf');
        if (!familiarId || (field !== 'Is_present' && field !== 'Is_in_battle_team'))
            return;
        input.disabled = mutationDisabled;
        if (input.dataset.ffmvuCheckboxBound === '1')
            return;
        input.dataset.ffmvuCheckboxBound = '1';
        input.addEventListener('change', () => {
            onIntent({ type: 'familiar.flag.set', familiarId, field, value: input.checked });
        });
    });
}
function wireCollapsibles(root) {
    root.querySelectorAll('.list-collapse-header').forEach(header => {
        if (header.dataset.ffmvuBound === '1')
            return;
        header.dataset.ffmvuBound = '1';
        header.addEventListener('click', () => {
            const body = header.nextElementSibling;
            const arrow = header.querySelector('.list-collapse-arrow');
            if (!body)
                return;
            const hidden = body.style.display === 'none';
            body.style.display = hidden ? '' : 'none';
            if (arrow)
                arrow.textContent = hidden ? '▼' : '▶';
        });
    });
}
function renderList(shadow, container, rawData, owner, options) {
    const listType = container.getAttribute('data-list-type') || 'simple';
    const listFullPath = container.getAttribute('data-bind-list-fullpath') || '';
    const editableKind = container.getAttribute('data-allow-edit') === '1' && listFullPath === 'Mainchar.Skills' ? 'skill' :
        container.getAttribute('data-allow-edit') === '1' && listFullPath === 'Mainchar.Talents' ? 'talent' :
            null;
    const worldCalcSection = container.getAttribute('data-allow-edit') === '1' && listFullPath === 'World_Calc.Factions' ? 'Factions' :
        container.getAttribute('data-allow-edit') === '1' && listFullPath === 'World_Calc.Locations' ? 'Locations' :
            container.getAttribute('data-allow-edit') === '1' && listFullPath === 'World_Calc.Ruins' ? 'Ruins' :
                container.getAttribute('data-allow-edit') === '1' && listFullPath === 'World_Calc.Events' ? 'Events' :
                    null;
    const templateId = listType === 'inventory' ? 'tmpl-inventory' :
        listType === 'equipment-action' ? 'tmpl-equipment-action' :
            listType === 'quest' ? 'tmpl-quest' :
                listType === 'grid' ? 'tmpl-grid' :
                    'tmpl-simple';
    const template = shadow.getElementById(templateId);
    if (!template)
        return;
    const data = asRecord(legacyTupleValue(rawData));
    const entries = Object.entries(data).filter(([key]) => !['$meta', '$key', 'template'].includes(key));
    container.replaceChildren();
    container.className = listType === 'inventory' ? 'list-inventory-view' : listType === 'grid' ? 'list-grid-view' : '';
    if (!entries.length) {
        const empty = document.createElement('div');
        empty.textContent = EMPTY_TEXT[listType] || 'None';
        empty.style.cssText = listType === 'inventory' || listType === 'grid'
            ? 'grid-column:1/-1;text-align:center;color:var(--text-secondary);'
            : 'text-align:center;color:var(--text-secondary);padding:10px;';
        container.appendChild(empty);
        return;
    }
    const pageSize = 5;
    const paged = listType !== 'inventory' && listType !== 'grid' && entries.length > pageSize;
    let page = 0;
    const draw = () => {
        container.replaceChildren();
        const visible = paged ? entries.slice(page * pageSize, page * pageSize + pageSize) : entries;
        for (const [key, raw] of visible) {
            const fragment = template.content.cloneNode(true);
            const itemRecord = record(legacyTupleValue(raw));
            const name = statusText(itemRecord.Name ?? itemRecord.name, key);
            const title = listType === 'inventory' || listType === 'grid' ? name : key;
            const desc = describe(raw);
            const qtyValue = itemRecord.Qty ?? itemRecord.qty;
            const qty = qtyValue !== undefined && Number(qtyValue) >= 1 ? 'x' + String(qtyValue) : '';
            setSlot(fragment, 'title', title);
            setSlot(fragment, 'name', title);
            if (listType === 'inventory') {
                const hiddenDesc = fragment.querySelector('[data-slot="desc"]');
                if (hiddenDesc) {
                    hiddenDesc.textContent = desc;
                    hiddenDesc.style.display = 'none';
                }
            }
            else {
                setSlot(fragment, 'desc', desc);
            }
            setSlot(fragment, 'qty', qty);
            setSlot(fragment, 'difficulty', statusText(itemRecord.Difficulty ?? itemRecord.difficulty, ''));
            setSlot(fragment, 'reward-text', statusText(itemRecord.Reward ?? itemRecord.reward, ''));
            setSlot(fragment, 'status', statusText(itemRecord.Status ?? itemRecord.status, ''));
            setSlot(fragment, 'LastUpdated', statusText(itemRecord.LastUpdated, ''));
            const rootElement = fragment.firstElementChild;
            if (rootElement) {
                rootElement.style.cursor = 'pointer';
                rootElement.addEventListener('click', () => {
                    if (editableKind === 'skill') {
                        showDetail(shadow, title, raw, {
                            mutationDisabled: options.mutationDisabled,
                            onSave: fields => options.onIntent({ type: 'skill.update', skillKey: key, fields }),
                        });
                    }
                    else if (editableKind === 'talent') {
                        showDetail(shadow, title, raw, {
                            mutationDisabled: options.mutationDisabled,
                            onSave: fields => options.onIntent({ type: 'talent.update', talentKey: key, fields }),
                        });
                    }
                    else if (worldCalcSection) {
                        showDetail(shadow, title, raw, {
                            mutationDisabled: options.mutationDisabled,
                            onSave: fields => options.onIntent({ type: 'worldcalc.update', section: worldCalcSection, itemKey: key, fields }),
                        });
                    }
                    else {
                        showDetail(shadow, title, raw);
                    }
                });
            }
            const allowDelete = container.getAttribute('data-allow-delete') === '1';
            const deleteButton = fragment.querySelector('.list-delete-btn:not(.action-delete-btn)');
            if (deleteButton) {
                if (!allowDelete)
                    deleteButton.style.display = 'none';
                else
                    deleteButton.addEventListener('click', event => {
                        event.stopPropagation();
                        if (options.mutationDisabled)
                            return;
                        if (editableKind === 'skill') {
                            if (window.confirm('Delete "' + title + '"?'))
                                options.onIntent({ type: 'skill.delete', skillKey: key });
                            return;
                        }
                        if (editableKind === 'talent') {
                            if (window.confirm('Delete "' + title + '"?'))
                                options.onIntent({ type: 'talent.delete', talentKey: key });
                            return;
                        }
                        if (worldCalcSection) {
                            if (window.confirm('Delete "' + title + '"?'))
                                options.onIntent({ type: 'worldcalc.delete', section: worldCalcSection, itemKey: key });
                            return;
                        }
                        if (listType === 'inventory' && owner) {
                            if (window.confirm('Delete "' + title + '"?'))
                                options.onIntent({ type: 'inventory.delete', owner, itemKey: key });
                            return;
                        }
                        const legacyDeletePath = statusLegacyDeletePath(owner, container.getAttribute('data-bind-list') || '', key);
                        if (legacyDeletePath) {
                            if (window.confirm('Delete "' + title + '"?'))
                                options.onIntent({ type: 'variable.delete', path: legacyDeletePath });
                            return;
                        }
                        options.onUnsupported('Delete/edit for ' + listType + ' is still waiting for its typed StateService intent.');
                    });
            }
            const menuButton = fragment.querySelector('.item-menu-btn');
            const actionMenu = fragment.querySelector('.item-action-menu');
            const equipButton = fragment.querySelector('.action-equip-btn');
            const actionDelete = fragment.querySelector('.action-delete-btn');
            if (menuButton && actionMenu && owner) {
                const item = statusItems({ [key]: raw })[0];
                menuButton.textContent = item?.equippable ? '⚔' : '⋮';
                menuButton.title = item?.equippable ? 'Equip / Actions' : 'Actions';
                menuButton.addEventListener('click', event => {
                    event.stopPropagation();
                    const open = actionMenu.style.display !== 'block';
                    shadow.querySelectorAll('.item-action-menu').forEach(menu => { menu.style.display = 'none'; });
                    actionMenu.style.display = open ? 'block' : 'none';
                });
                actionMenu.addEventListener('click', event => event.stopPropagation());
                if (equipButton) {
                    equipButton.style.display = item?.equippable ? 'block' : 'none';
                    equipButton.disabled = options.mutationDisabled;
                    equipButton.addEventListener('click', event => {
                        event.stopPropagation();
                        actionMenu.style.display = 'none';
                        showEquipTarget(shadow, options.state, owner, key, options.onIntent);
                    });
                }
                if (actionDelete) {
                    actionDelete.style.display = allowDelete ? 'block' : 'none';
                    actionDelete.disabled = options.mutationDisabled;
                    actionDelete.addEventListener('click', event => {
                        event.stopPropagation();
                        actionMenu.style.display = 'none';
                        if (allowDelete && window.confirm('Delete "' + title + '"?'))
                            options.onIntent({ type: 'inventory.delete', owner, itemKey: key });
                    });
                }
            }
            const unequip = fragment.querySelector('.unequip-btn');
            if (unequip && owner) {
                unequip.disabled = options.mutationDisabled;
                unequip.addEventListener('click', event => {
                    event.stopPropagation();
                    if (window.confirm('Unequip ' + title + '?'))
                        options.onIntent({ type: 'equipment.unequip', owner, equipmentKey: key });
                });
            }
            fragment.querySelectorAll('[data-slot="reward"]').forEach(element => {
                if (statusText(itemRecord.Reward ?? itemRecord.reward, ''))
                    element.style.display = 'block';
            });
            fragment.querySelectorAll('[data-slot="status-row"]').forEach(element => {
                if (statusText(itemRecord.Status ?? itemRecord.status, ''))
                    element.style.display = 'block';
            });
            fragment.querySelectorAll('[data-slot="last-updated-row"]').forEach(element => {
                if (statusText(itemRecord.LastUpdated, ''))
                    element.style.display = 'block';
            });
            container.appendChild(fragment);
        }
        if (paged) {
            const bar = document.createElement('div');
            bar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 4px;margin-top:8px;border-top:1px solid rgba(255,255,255,.1);';
            const prev = document.createElement('button');
            const next = document.createElement('button');
            const info = document.createElement('span');
            prev.textContent = '<';
            next.textContent = '>';
            info.textContent = String(page + 1) + ' / ' + String(Math.ceil(entries.length / pageSize));
            info.style.cssText = 'color:var(--text-secondary);font-size:.85em;';
            for (const button of [prev, next])
                button.style.cssText = 'background:rgba(0,229,255,.1);border:1px solid rgba(0,229,255,.3);color:#00e5ff;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:1em;min-width:36px;';
            prev.disabled = page === 0;
            next.disabled = page >= Math.ceil(entries.length / pageSize) - 1;
            prev.addEventListener('click', event => { event.stopPropagation(); if (page > 0) {
                page -= 1;
                draw();
            } });
            next.addEventListener('click', event => { event.stopPropagation(); if (!next.disabled) {
                page += 1;
                draw();
            } });
            bar.append(prev, info, next);
            container.appendChild(bar);
        }
    };
    draw();
}
function renderNestedLists(shadow, root, data, owner, options) {
    root.querySelectorAll('[data-bind-list]').forEach(container => {
        const path = container.getAttribute('data-bind-list');
        if (!path)
            return;
        renderList(shadow, container, getPath(data, path), owner, options);
    });
    wireCollapsibles(root);
}
function instantiateRecordBlock(shadow, containerId, data, owner, options) {
    const container = shadow.getElementById(containerId);
    if (!container)
        return;
    const templateId = container.getAttribute('data-template');
    const template = templateId ? shadow.getElementById(templateId) : null;
    if (!template)
        return;
    container.replaceChildren();
    const wrapper = document.createElement('div');
    wrapper.style.display = 'contents';
    wrapper.appendChild(template.content.cloneNode(true));
    container.appendChild(wrapper);
    bindValues(wrapper, data);
    renderNestedLists(shadow, wrapper, data, owner, options);
    wireCheckboxes(wrapper, options.onIntent, options.mutationDisabled);
}
function familiarIdentity(state, id, member) {
    const explicit = statusText(member.Identity, '');
    if (explicit)
        return explicit;
    const key = id.trim().toLowerCase();
    const name = statusText(member.Name, id).trim().toLowerCase();
    for (const [npcId, rawNpc] of Object.entries(asRecord(state.Narrative.NPCs))) {
        if (!isRecord(rawNpc))
            continue;
        const display = statusText(rawNpc.DisplayName ?? rawNpc.Name, '').trim().toLowerCase();
        const aliases = Array.isArray(rawNpc.Aliases) ? rawNpc.Aliases.map(value => String(value).trim().toLowerCase()) : [];
        if ((key && (display === key || aliases.includes(key))) || (name && (display === name || aliases.includes(name))))
            return npcId;
    }
    return '—';
}
function renderFamiliars(shadow, options) {
    const container = shadow.getElementById('blk-blk-1770140160072');
    const template = shadow.getElementById('tpl-blk-blk-1770140160072');
    if (!container || !template)
        return;
    const entries = Object.entries(asRecord(options.state.Familiar)).filter(([, value]) => isRecord(value));
    container.replaceChildren();
    if (!entries.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'width:100%;text-align:center;padding:10px;color:#666;';
        empty.textContent = 'No Data';
        container.appendChild(empty);
        return;
    }
    let page = 0;
    const pageSize = 5;
    const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
    const draw = () => {
        container.replaceChildren();
        const addPager = (position) => {
            const bar = document.createElement('div');
            bar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 4px;width:100%;flex-basis:100%;flex-shrink:0;box-sizing:border-box;'
                + (position === 'top' ? 'margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,.1);' : 'margin-top:8px;border-top:1px solid rgba(255,255,255,.1);');
            const prev = document.createElement('button');
            const next = document.createElement('button');
            const select = document.createElement('select');
            const info = document.createElement('span');
            prev.textContent = '<';
            next.textContent = '>';
            prev.disabled = page === 0;
            next.disabled = page >= pageCount - 1;
            for (const button of [prev, next])
                button.style.cssText = 'background:transparent;border:1px solid rgba(0,229,255,.5);color:#00e5ff;width:30px;height:30px;border-radius:4px;cursor:pointer;font-weight:bold;';
            info.textContent = String(page + 1) + ' / ' + String(pageCount);
            info.style.cssText = 'font-size:.9em;color:#aaa;';
            prev.addEventListener('click', () => { if (page > 0) {
                page -= 1;
                draw();
            } });
            next.addEventListener('click', () => { if (page < pageCount - 1) {
                page += 1;
                draw();
            } });
            bar.appendChild(prev);
            if (position === 'top') {
                for (let index = 0; index < entries.length; index += 1) {
                    const [id, raw] = entries[index];
                    const option = document.createElement('option');
                    option.value = String(index);
                    option.textContent = statusText(raw.Name, id);
                    if (index === page * pageSize)
                        option.selected = true;
                    select.appendChild(option);
                }
                select.addEventListener('change', () => { page = Math.floor(Number(select.value) / pageSize); draw(); });
                bar.appendChild(select);
            }
            bar.append(info, next);
            container.appendChild(bar);
        };
        addPager('top');
        const start = page * pageSize;
        for (const [id, raw] of entries.slice(start, start + pageSize)) {
            const member = raw;
            const anchor = document.createElement('div');
            anchor.style.cssText = 'height:0;margin:0;padding:0;width:100%;flex-basis:100%;flex-shrink:0;';
            container.appendChild(anchor);
            const wrapper = document.createElement('div');
            wrapper.style.display = 'contents';
            wrapper.appendChild(template.content.cloneNode(true));
            container.appendChild(wrapper);
            bindValues(wrapper, member);
            const identity = wrapper.querySelector('[data-bind-val="Identity"]');
            if (identity)
                identity.textContent = familiarIdentity(options.state, id, member);
            const secret = wrapper.querySelector('[data-bind-val="Secret"]');
            if (secret)
                secret.textContent = (statusNumber(member.Affection) ?? 0) >= 90 ? statusText(member.Secret, '') : 'Require 90% Affection';
            const corePoints = wrapper.querySelector('[data-bind-val="Core-points"]');
            if (corePoints && (statusNumber(member['Core-points']) ?? 0) > 0) {
                corePoints.style.color = 'red';
                corePoints.style.fontWeight = 'bold';
            }
            renderNestedLists(shadow, wrapper, member, { kind: 'familiar', id }, options);
            wrapper.querySelectorAll('.img-edit-btn[data-save-root="Familiar"]').forEach(button => { button.dataset.ffmvuFamiliarId = id; });
            wrapper.querySelectorAll('.ar-checkbox-input').forEach(input => { input.dataset.ffmvuFamiliarId = id; });
            wireCheckboxes(wrapper, options.onIntent, options.mutationDisabled);
        }
        if (pageCount > 1)
            addPager('bottom');
    };
    draw();
}
function renderWardrobe(shadow, options) {
    const tabs = shadow.getElementById('outfit-owner-tabs');
    const status = shadow.getElementById('outfit-status');
    const wornList = shadow.getElementById('outfit-worn-list');
    const wardrobeList = shadow.getElementById('outfit-wardrobe-list');
    const wornCount = shadow.getElementById('outfit-worn-count');
    const wardrobeCount = shadow.getElementById('outfit-wardrobe-count');
    if (!tabs || !status || !wornList || !wardrobeList)
        return;
    const owners = statusOwners(options.state);
    let selected = owners.some(owner => owner.id === options.selectedOwnerId) ? options.selectedOwnerId : owners[0]?.id || 'player';
    const draw = () => {
        tabs.replaceChildren();
        for (const owner of owners) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'outfit-owner-btn' + (owner.id === selected ? ' active' : '');
            button.textContent = owner.label;
            button.addEventListener('click', () => {
                selected = owner.id;
                options.onOwner(selected);
                draw();
            });
            tabs.appendChild(button);
        }
        const owner = statusOwnerById(options.state, selected);
        const outfit = record(owner.record.Outfit);
        const worn = record(outfit.Worn);
        const wardrobe = record(outfit.Wardrobe);
        status.textContent = outfit.Initialized ? 'Наряд зафиксирован' : 'Будет создан моделью при следующем RP-ходе';
        if (wornCount)
            wornCount.textContent = String(Object.keys(worn).length);
        if (wardrobeCount)
            wardrobeCount.textContent = String(Object.keys(wardrobe).length);
        const sort = (source) => Object.entries(source).sort((left, right) => {
            const a = record(left[1]);
            const b = record(right[1]);
            return (OUTFIT_SLOT_ORDER[statusText(a.Slot, '')] ?? 99) - (OUTFIT_SLOT_ORDER[statusText(b.Slot, '')] ?? 99)
                || (OUTFIT_LAYER_ORDER[statusText(a.Layer, '')] ?? 99) - (OUTFIT_LAYER_ORDER[statusText(b.Layer, '')] ?? 99)
                || statusText(a.Name, left[0]).localeCompare(statusText(b.Name, right[0]), 'ru');
        });
        const bucket = (container, source, from) => {
            container.replaceChildren();
            const entries = sort(source);
            if (!entries.length) {
                const empty = document.createElement('div');
                empty.className = 'outfit-empty';
                empty.textContent = from === 'Worn' ? 'Одежда ещё не зафиксирована' : 'Нет запасной одежды';
                container.appendChild(empty);
                return;
            }
            for (const [key, raw] of entries) {
                const item = record(raw);
                const card = document.createElement('div');
                card.className = 'outfit-item';
                const main = document.createElement('div');
                main.className = 'outfit-item-main';
                const name = document.createElement('div');
                name.className = 'outfit-item-name';
                name.textContent = statusText(item.Name, key);
                const badges = document.createElement('div');
                badges.className = 'outfit-badges';
                for (const badgeValue of [item.Slot || 'Extra', item.Layer || 'Base', item.Slot === 'Extra' ? item.Placement : null]) {
                    if (!badgeValue)
                        continue;
                    const badge = document.createElement('span');
                    badge.className = 'outfit-badge';
                    badge.textContent = statusText(badgeValue);
                    badges.appendChild(badge);
                }
                main.append(name, badges);
                const action = document.createElement('button');
                action.type = 'button';
                action.className = 'outfit-action';
                action.textContent = from === 'Worn' ? 'Снять' : 'Надеть';
                action.disabled = options.mutationDisabled;
                action.addEventListener('click', event => {
                    event.stopPropagation();
                    options.onIntent({ type: 'outfit.move', owner: owner.ref, from, itemKey: key });
                });
                card.append(main, action);
                const identity = [item.Color, item.Material].filter(Boolean).map(value => statusText(value));
                const descriptions = [];
                if (identity.length)
                    descriptions.push(identity.join(' · '));
                if (item.Appearance)
                    descriptions.push(statusText(item.Appearance));
                if (descriptions.length) {
                    const detail = document.createElement('div');
                    detail.className = 'outfit-item-detail';
                    detail.textContent = descriptions.join(' — ');
                    card.appendChild(detail);
                }
                const stateParts = [item.Condition, item.Arrangement].filter(Boolean).map(value => statusText(value));
                if (stateParts.length) {
                    const detail = document.createElement('div');
                    detail.className = 'outfit-item-detail outfit-item-state';
                    detail.textContent = stateParts.join(' · ');
                    card.appendChild(detail);
                }
                container.appendChild(card);
            }
        };
        bucket(wornList, worn, 'Worn');
        bucket(wardrobeList, wardrobe, 'Wardrobe');
    };
    draw();
}
function renderFfState(shadow, narrative) {
    const root = shadow.getElementById('ffsm-root');
    const search = shadow.getElementById('ffsm-search');
    if (!root || !search)
        return;
    root.replaceChildren();
    const primitive = (value) => value === null || value === undefined || typeof value !== 'object';
    const label = (value) => {
        if (value === null)
            return 'null';
        if (value === undefined)
            return '—';
        if (typeof value === 'boolean')
            return value ? 'true' : 'false';
        if (Array.isArray(value) && value.length === 2 && typeof value[1] === 'string')
            return String(value[0]);
        if (Array.isArray(value))
            return value.every(primitive) ? value.map(label).join(', ') : '[' + value.length + ']';
        if (isRecord(value))
            return '{' + Object.keys(value).length + '}';
        return String(value);
    };
    const count = (value) => Array.isArray(value) ? value.length : isRecord(value) ? Object.keys(value).length : 0;
    const rows = (container, value, depth) => {
        if (primitive(value)) {
            const element = document.createElement('div');
            element.className = 'ffsm-val';
            element.textContent = label(value);
            container.appendChild(element);
            return;
        }
        const entries = Array.isArray(value) ? value.map((child, index) => [String(index), child]) : Object.entries(record(value));
        if (!entries.length) {
            const empty = document.createElement('div');
            empty.className = 'ffsm-empty';
            empty.textContent = 'No data';
            container.appendChild(empty);
            return;
        }
        for (const [key, item] of entries) {
            if (primitive(item) || (Array.isArray(item) && item.every(primitive))) {
                const row = document.createElement('div');
                row.className = 'ffsm-row';
                const keyElement = document.createElement('div');
                keyElement.className = 'ffsm-key';
                keyElement.textContent = key;
                const valueElement = document.createElement('div');
                valueElement.className = 'ffsm-val';
                valueElement.textContent = label(item);
                const lower = key.toLowerCase();
                if (['bond', 'sparks', 'grudge'].includes(lower) && Number.isFinite(Number(item))) {
                    const bar = document.createElement('div');
                    bar.className = 'ffsm-relbar';
                    const fill = document.createElement('div');
                    fill.className = 'ffsm-relfill';
                    const n = Number(item);
                    fill.style.width = Math.max(0, Math.min(100, lower === 'bond' ? (n + 100) / 2 : n)) + '%';
                    bar.appendChild(fill);
                    valueElement.appendChild(bar);
                }
                row.append(keyElement, valueElement);
                container.appendChild(row);
                continue;
            }
            const details = document.createElement('details');
            details.className = 'ffsm-node';
            details.open = depth < 1;
            const summary = document.createElement('summary');
            summary.textContent = key;
            const counter = document.createElement('span');
            counter.className = 'ffsm-count';
            counter.textContent = String(count(item));
            summary.appendChild(counter);
            const body = document.createElement('div');
            body.className = 'ffsm-body';
            rows(body, item, depth + 1);
            details.append(summary, body);
            container.appendChild(details);
        }
    };
    const section = (title, value, open) => {
        const details = document.createElement('details');
        details.className = 'ffsm-top';
        details.open = open;
        const summary = document.createElement('summary');
        summary.textContent = title;
        const counter = document.createElement('span');
        counter.className = 'ffsm-count';
        counter.textContent = String(count(value));
        summary.appendChild(counter);
        const body = document.createElement('div');
        body.className = 'ffsm-body';
        rows(body, value, 0);
        details.append(summary, body);
        root.appendChild(details);
    };
    if (!isRecord(narrative)) {
        const empty = document.createElement('div');
        empty.className = 'ffsm-empty';
        empty.textContent = 'Narrative state is not initialized yet.';
        root.appendChild(empty);
    }
    else {
        section('Scene / Turn', { Version: narrative.Version, Turn: narrative.Turn, NextNpcId: narrative.NextNpcId, Scene: narrative.Scene || {} }, true);
        section('NPC Registry', narrative.NPCs || {}, true);
        section('Relationships', narrative.Relationships || {}, true);
        section('GM Notes', narrative.GM_Notes || {}, false);
        section('Chekhov', narrative.Chekhov || {}, false);
        section('WorldSim', narrative.WorldSim || {}, false);
    }
    const filter = () => {
        const query = search.value.trim().toLocaleLowerCase('ru');
        root.querySelectorAll(':scope > .ffsm-top').forEach(sectionElement => {
            const matches = !query || (sectionElement.textContent || '').toLocaleLowerCase('ru').includes(query);
            sectionElement.hidden = !matches;
            if (query && matches && sectionElement instanceof HTMLDetailsElement)
                sectionElement.open = true;
        });
    };
    search.addEventListener('input', filter);
    const buttons = shadow.querySelectorAll('#tab-ff-state .ffsm-toolbar .ffsm-btn');
    buttons[0]?.removeAttribute('onclick');
    buttons[1]?.removeAttribute('onclick');
    buttons[0]?.addEventListener('click', () => root.querySelectorAll('details').forEach(details => { details.open = true; }));
    buttons[1]?.addEventListener('click', () => root.querySelectorAll('details').forEach(details => { details.open = false; }));
}
function installVariablesTab(shadow, options) {
    const nav = shadow.querySelector('.tab-nav');
    const container = shadow.querySelector('.status-container');
    if (!nav || !container)
        return;
    const button = document.createElement('div');
    button.className = 'tab-btn';
    button.textContent = 'Variables';
    nav.appendChild(button);
    const tab = document.createElement('div');
    tab.id = 'tab-variables';
    tab.className = 'tab-content';
    tab.appendChild(renderVariablesEditor(shadow, {
        state: options.state,
        mutationDisabled: options.mutationDisabled,
        search: options.variablesSearch,
        onSearch: options.onVariablesSearch,
        onIntent: options.onIntent,
    }));
    container.appendChild(tab);
}
function selectInitialTab(shadow, options) {
    const select = (tab, notify) => {
        shadow.querySelectorAll('.tab-content').forEach(element => element.classList.remove('active'));
        shadow.querySelectorAll('.tab-btn').forEach(element => element.classList.remove('active'));
        shadow.getElementById(TAB_IDS[tab])?.classList.add('active');
        const index = TAB_ORDER.indexOf(tab);
        const button = shadow.querySelectorAll('.tab-nav > .tab-btn')[index];
        button?.classList.add('active');
        if (notify)
            options.onTab(tab);
    };
    shadow.querySelectorAll('.tab-nav > .tab-btn').forEach((button, index) => {
        button.removeAttribute('onclick');
        const tab = TAB_ORDER[index];
        if (!tab)
            return;
        button.addEventListener('click', () => select(tab, true));
    });
    select(options.activeTab, false);
}
export function renderLegacyStatusMenu(options) {
    const host = document.createElement('div');
    host.className = 'ffsm-legacy-host';
    host.style.cssText = 'display:block;width:100%;height:100%;min-height:0;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = shadowCss();
    const body = document.createElement('div');
    body.className = 'status-body';
    body.innerHTML = LEGACY_STATUS_BODY_HTML;
    shadow.append(style, body);
    installVariablesTab(shadow, options);
    shadow.querySelectorAll('[onclick]').forEach(element => element.removeAttribute('onclick'));
    bindValues(shadow, options.state);
    const player = { kind: 'player' };
    instantiateRecordBlock(shadow, 'blk-blk-1770135834327', options.state.Mainchar, player, options);
    instantiateRecordBlock(shadow, 'blk-blk-1770046675226', options.state.Mainchar, player, options);
    instantiateRecordBlock(shadow, 'blk-blk-1770136606429', options.state.Mainchar, player, options);
    instantiateRecordBlock(shadow, 'blk-blk-1770136622937', options.state.Mainchar, player, options);
    instantiateRecordBlock(shadow, 'blk-blk-1770203491926', options.state.Mainchar, player, options);
    instantiateRecordBlock(shadow, 'blk-blk-1770205452062', options.state.Mainchar, player, options);
    instantiateRecordBlock(shadow, 'blk-blk-1770205519586', options.state.Mainchar, player, options);
    instantiateRecordBlock(shadow, 'blk-blk-1770205524852', options.state.Mainchar, player, options);
    instantiateRecordBlock(shadow, 'blk-blk-1770205528854', options.state.Mainchar, player, options);
    instantiateRecordBlock(shadow, 'blk-blk-1770205538619', options.state.World, null, options);
    instantiateRecordBlock(shadow, 'blk-blk-1776467005665', options.state.World_Calc, null, options);
    renderFamiliars(shadow, options);
    renderWardrobe(shadow, options);
    renderFfState(shadow, options.state.Narrative);
    bindOverview(shadow, options.state);
    wireImages(shadow, options.state, options.onIntent, options.mutationDisabled, options.onUnsupported);
    wireCollapsibles(shadow);
    selectInitialTab(shadow, options);
    const close = shadow.getElementById('detail-close-btn');
    const modal = shadow.getElementById('detail-modal');
    close?.removeAttribute('onclick');
    close?.addEventListener('click', () => { if (modal)
        modal.style.display = 'none'; });
    modal?.addEventListener('click', event => { if (event.target === modal)
        modal.style.display = 'none'; });
    return host;
}

// ---- bundled from dist/src/lumi/frontend.js ----
const TAB_DEFS = [
    ['overview', 'Overview'],
    ['attributes', 'Attributes'],
    ['familiars', 'Familiars'],
    ['wardrobe', 'Wardrobe'],
    ['equipment', 'Equipments'],
    ['items', 'Items'],
    ['others', 'Others'],
    ['ffstate', 'FF State'],
];
const CORE_STATS = [
    ['Strength', 'STR'], ['Agility', 'AGI'], ['Constitution', 'CON'],
    ['Intelligence', 'INT'], ['Wisdom', 'WIS'], ['Charisma', 'CHA'],
];
const COMBAT_STATS = [
    ['Physical_attack', 'P_ATK'], ['Physical_defense', 'P_DEF'],
    ['Magic_attack', 'M_ATK'], ['Magic_defense', 'M_DEF'], ['Magic_assist', 'M_AST'],
];
function make(tag, className = '', text) {
    const node = document.createElement(tag);
    if (className)
        node.className = className;
    if (text !== undefined)
        node.textContent = text;
    return node;
}
function requestId(prefix) {
    try {
        if (globalThis.crypto?.randomUUID)
            return prefix + '_' + globalThis.crypto.randomUUID();
    }
    catch { }
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2);
}
function ownerLabel(owner) {
    return owner.ref.kind === 'player' ? 'Player · ' + owner.label : owner.label;
}
function percent(current, max) {
    if (current === null || max === null || max <= 0)
        return 0;
    return Math.max(0, Math.min(100, (current / max) * 100));
}
function valueRecord(value) {
    return isRecord(value) ? value : {};
}
function htmlDetails(record) {
    const parts = [];
    for (const key of ['Type', 'Slot', 'Layer', 'Placement', 'Color', 'Material', 'Condition', 'Arrangement', 'Desc']) {
        const value = record[key];
        if (value === undefined || value === null || value === '')
            continue;
        parts.push(key + ': ' + statusText(value));
    }
    return parts.join(' · ');
}
export function setup(ctx) {
    const removeStyle = ctx.dom.addStyle(`
    :root {
      --npc-c_: #F56991;
      --npc-c0: #58DDD0;
      --npc-c1: #45CAC1;
      --npc-c2: #36B5AF;
      --npc-c3: #439E9B;
      --npc-c4: #719493;
      --npc-c5: #FFAD68;
      --npc-c6: #F49A68;
      --npc-c7: #E38869;
      --npc-c8: #CF7C6D;
      --npc-c9: #B87874;
      --npc-c-: #B8A6D9;
    }
    span[style*="--npc-color"],
    span[style*="--npc-color"] * {
      color: var(--npc-color) !important;
    }
    span[style*="--npc-color"] em {
      color: var(--npc-color) !important;
      filter: brightness(.84) saturate(.9);
      opacity: .78;
      font-style: italic;
    }
    font[color] em {
      filter: brightness(.84) saturate(.9);
      opacity: .78;
    }

    .ffsm-app {
      --ffsm-accent:#00e5ff;
      --ffsm-accent-soft:#81d4fa;
      --ffsm-pink:#ff7ac8;
      --ffsm-border:rgba(0,229,255,.28);
      color:var(--lumiverse-text);
      position:absolute;
      left:0;
      right:0;
      bottom:calc(100% + 6px);
      z-index:30;
      width:auto;
      box-sizing:border-box;
      padding:0;
      display:none;
      min-height:0;
      pointer-events:none;
    }
    .ffsm-app.open {
      display:block;
      height:520px;
      min-height:0;
      pointer-events:auto;
    }
    .ffsm-panel-frame {
      width:100%;
      height:100%;
      min-height:0;
      display:flex;
      flex-direction:column;
      box-sizing:border-box;
    }
    .ffsm-resize-grip {
      flex:0 0 10px;
      height:10px;
      cursor:ns-resize;
      touch-action:none;
      display:flex;
      align-items:center;
      justify-content:center;
      user-select:none;
    }
    .ffsm-resize-grip::before {
      content:'';
      display:block;
      width:64px;
      height:3px;
      border-radius:99px;
      background:rgba(0,229,255,.38);
      box-shadow:0 0 8px rgba(0,229,255,.12);
    }
    .ffsm-resize-grip:hover::before,
    .ffsm-resize-grip.dragging::before {
      background:rgba(0,229,255,.72);
    }
    .ffsm-panel-content {
      flex:1 1 auto;
      min-height:0;
      width:100%;
      overflow:hidden;
      box-sizing:border-box;
    }
    .ffsm-shell {
      height:100%;
      box-sizing:border-box;
      border:1px solid var(--ffsm-border);
      border-radius:10px;
      overflow:auto;
      overscroll-behavior:contain;
      background:linear-gradient(150deg,rgba(0,31,63,.88),rgba(0,74,83,.72));
      box-shadow:0 12px 34px rgba(0,0,0,.2);
    }
    .ffsm-head {
      display:flex;align-items:flex-start;justify-content:space-between;gap:10px;
      padding:12px;border-bottom:1px solid var(--ffsm-border);
      background:rgba(0,0,0,.18);
    }
    .ffsm-head-title { color:var(--ffsm-accent);font-weight:800;font-size:15px; }
    .ffsm-head-sub { color:var(--lumiverse-text-muted);font-size:11px;line-height:1.35;margin-top:3px; }
    .ffsm-head-actions { display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end; }
    .ffsm-btn {
      appearance:none;border:1px solid var(--ffsm-border);border-radius:6px;
      background:rgba(0,229,255,.08);color:var(--ffsm-accent);padding:6px 9px;
      cursor:pointer;font:inherit;font-size:11px;
    }
    .ffsm-btn:hover:not(:disabled) { background:rgba(0,229,255,.18); }
    .ffsm-btn:disabled { opacity:.4;cursor:not-allowed; }
    .ffsm-btn-danger { color:#ff9a9a;border-color:rgba(255,100,100,.35);background:rgba(255,90,90,.08); }
    .ffsm-btn-pink { color:#ffd9ef;border-color:rgba(255,122,200,.4);background:rgba(255,122,200,.1); }
    .ffsm-toolbar-btn {
      display:flex;align-items:center;justify-content:center;width:30px;height:26px;
      border:0;border-radius:var(--lcs-radius-xs,6px);background:transparent;
      color:var(--lumiverse-text-dim,rgba(230,230,240,.4));cursor:pointer;padding:0;
      transition:color 120ms ease,background 120ms ease;
    }
    .ffsm-toolbar-btn:hover,.ffsm-toolbar-btn.active {
      color:var(--lumiverse-text,rgba(230,230,240,.92));
      background:var(--lumiverse-fill,rgba(255,255,255,.06));
    }
    .ffsm-toolbar-btn.active {
      color:var(--ffsm-accent);
      background:rgba(0,229,255,.1);
    }
    .ffsm-toolbar-btn svg { width:14px;height:14px;display:block; }
    .ffsm-statusline {
      padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.07);
      color:var(--lumiverse-text-muted);font-size:10px;display:flex;gap:8px;flex-wrap:wrap;
    }
    .ffsm-statusline .ok { color:#69f0ae; }
    .ffsm-statusline .warn { color:#ffd36a; }
    .ffsm-statusline .bad { color:#ff8a80; }
    .ffsm-nav {
      display:flex;overflow-x:auto;background:rgba(0,0,0,.24);border-bottom:1px solid var(--ffsm-border);
      scrollbar-width:thin;
    }
    .ffsm-tab {
      appearance:none;border:0;border-bottom:2px solid transparent;background:transparent;
      color:var(--ffsm-accent-soft);padding:10px 12px;cursor:pointer;white-space:nowrap;font:inherit;font-size:11px;
    }
    .ffsm-tab.active { color:var(--ffsm-accent);border-bottom-color:var(--ffsm-accent); }
    .ffsm-tab[data-tab="wardrobe"] { color:#f3a6da; }
    .ffsm-tab[data-tab="wardrobe"].active { color:var(--ffsm-pink);border-bottom-color:var(--ffsm-pink); }
    .ffsm-content { padding:10px;display:grid;gap:10px; }
    .ffsm-grid2 { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px; }
    .ffsm-grid3 { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px; }
    .ffsm-card {
      min-width:0;background:rgba(0,20,40,.62);border:1px solid var(--ffsm-border);
      border-radius:7px;padding:9px;overflow:hidden;
    }
    .ffsm-card-title {
      color:var(--ffsm-accent);font-weight:800;font-size:12px;
      padding-bottom:5px;margin-bottom:6px;border-bottom:1px solid var(--ffsm-border);
    }
    .ffsm-row {
      display:grid;grid-template-columns:minmax(82px,34%) minmax(0,1fr);gap:8px;
      padding:5px 0;border-bottom:1px dashed rgba(255,255,255,.08);font-size:11px;line-height:1.3;
    }
    .ffsm-row:last-child { border-bottom:0; }
    .ffsm-label { color:var(--ffsm-accent-soft);overflow-wrap:anywhere; }
    .ffsm-value { color:var(--lumiverse-text);text-align:right;overflow-wrap:anywhere;white-space:pre-wrap; }
    .ffsm-statbox { display:grid;gap:4px; }
    .ffsm-stathead { display:flex;justify-content:space-between;font-size:10px;color:var(--ffsm-accent-soft); }
    .ffsm-track { height:7px;border-radius:99px;background:rgba(0,0,0,.48);overflow:hidden; }
    .ffsm-fill { height:100%;border-radius:99px;background:linear-gradient(90deg,#00b8d4,#69f0ae); }
    .ffsm-fill.hp { background:linear-gradient(90deg,#ff5252,#ff8a80); }
    .ffsm-fill.mp { background:linear-gradient(90deg,#4272f5,#82b1ff); }
    .ffsm-fill.st { background:linear-gradient(90deg,#50c878,#69f0ae); }
    .ffsm-ownerbar { display:flex;gap:6px;align-items:center;flex-wrap:wrap; }
    .ffsm-select,.ffsm-input,.ffsm-textarea {
      min-width:0;border:1px solid var(--ffsm-border);border-radius:5px;background:rgba(0,0,0,.28);
      color:var(--lumiverse-text);padding:6px 8px;font:inherit;font-size:11px;
    }
    .ffsm-select { max-width:100%; }
    .ffsm-input { width:100%;box-sizing:border-box; }
    .ffsm-textarea { width:100%;min-height:62px;resize:vertical;box-sizing:border-box; }
    .ffsm-item-list { display:grid;gap:6px; }
    .ffsm-item {
      display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 7px;
      border:1px solid rgba(0,229,255,.18);border-radius:6px;padding:7px;background:rgba(255,255,255,.025);
    }
    .ffsm-item-name { font-weight:700;font-size:11px;color:var(--lumiverse-text);overflow-wrap:anywhere; }
    .ffsm-item-detail { grid-column:1/-1;color:var(--lumiverse-text-muted);font-size:9px;line-height:1.35;overflow-wrap:anywhere; }
    .ffsm-item-actions { display:flex;gap:4px;align-items:start; }
    .ffsm-badges { display:flex;flex-wrap:wrap;gap:3px;margin-top:3px; }
    .ffsm-badge { border:1px solid rgba(129,212,250,.24);border-radius:999px;padding:1px 5px;font-size:8px;color:var(--ffsm-accent-soft); }
    .ffsm-empty { padding:14px;text-align:center;color:var(--lumiverse-text-muted);font-size:11px; }
    .ffsm-familiar { display:grid;gap:5px; }
    .ffsm-familiar-name { color:var(--ffsm-accent);font-weight:800;font-size:13px; }
    .ffsm-kvmini { display:flex;justify-content:space-between;gap:8px;font-size:10px;border-bottom:1px dashed rgba(255,255,255,.06);padding:3px 0; }
    .ffsm-kvmini span:first-child { color:var(--ffsm-accent-soft); }
    .ffsm-avatar { display:block;max-width:100%;max-height:280px;margin:0 auto;border-radius:6px;border:1px solid var(--ffsm-border);object-fit:contain; }
    .ffsm-hph { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px; }
    .ffsm-metric { border:1px solid rgba(0,229,255,.2);border-radius:7px;padding:7px;text-align:center;background:rgba(0,0,0,.18); }
    .ffsm-metric-label { color:var(--ffsm-accent-soft);font-size:8px;font-weight:700; }
    .ffsm-metric-value { color:var(--lumiverse-text);font-size:13px;font-weight:800;margin-top:3px; }
    .ffsm-newgame { display:grid;gap:10px;padding:10px; }
    .ffsm-formgrid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px; }
    .ffsm-field { display:grid;gap:3px;min-width:0; }
    .ffsm-field label { color:var(--ffsm-accent-soft);font-size:9px; }
    .ffsm-budget { font-size:10px;color:var(--ffsm-accent-soft); }
    .ffsm-notice { padding:8px;border-radius:6px;background:rgba(255,211,106,.08);border:1px solid rgba(255,211,106,.25);color:#ffd36a;font-size:10px;line-height:1.4; }
    .ffsm-tree-search { position:sticky;top:0;z-index:2;background:#002b4c;padding-bottom:6px; }
    .ffsm-tree { max-height:70vh;overflow:auto;padding-right:3px; }
    .ffsm-tree details { margin:3px 0 0 6px;border-left:1px solid rgba(129,212,250,.15);padding-left:5px; }
    .ffsm-tree summary { cursor:pointer;color:var(--ffsm-accent-soft);font-size:10px;overflow-wrap:anywhere; }
    .ffsm-tree-leaf { display:grid;grid-template-columns:minmax(80px,32%) minmax(0,1fr);gap:6px;padding:3px 2px;border-top:1px dashed rgba(255,255,255,.06);font-size:9px; }
    .ffsm-tree-key { color:var(--ffsm-accent-soft);overflow-wrap:anywhere; }
    .ffsm-tree-val { color:var(--lumiverse-text);white-space:pre-wrap;overflow-wrap:anywhere; }
    .ffsm-diag { margin:0 10px 10px;border:1px solid rgba(255,255,255,.08);border-radius:6px;background:rgba(0,0,0,.12); }
    .ffsm-diag summary { cursor:pointer;padding:7px;color:var(--lumiverse-text-muted);font-size:9px; }
    .ffsm-diag pre { margin:0;padding:8px;max-height:220px;overflow:auto;font-size:8px;white-space:pre-wrap;word-break:break-word; }
    .ffsm-diagnostic-overlay {
      position:absolute;inset:10px;z-index:60;display:flex;align-items:stretch;justify-content:center;
      background:rgba(0,10,20,.78);backdrop-filter:blur(3px);border:1px solid var(--ffsm-border);
      border-radius:10px;padding:10px;box-sizing:border-box;pointer-events:auto;
    }
    .ffsm-diagnostic-panel {
      width:min(100%,980px);height:100%;min-height:0;display:flex;flex-direction:column;gap:8px;
      background:#001f36;border:1px solid rgba(0,229,255,.32);border-radius:8px;padding:10px;box-sizing:border-box;
      box-shadow:0 14px 40px rgba(0,0,0,.45);
    }
    .ffsm-diagnostic-head { display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap; }
    .ffsm-diagnostic-title { color:var(--ffsm-accent);font-weight:800;font-size:13px; }
    .ffsm-diagnostic-actions { display:flex;gap:6px;flex-wrap:wrap; }
    .ffsm-diagnostic-text {
      flex:1 1 auto;min-height:0;width:100%;box-sizing:border-box;resize:none;
      border:1px solid rgba(129,212,250,.25);border-radius:6px;background:rgba(0,0,0,.32);
      color:var(--lumiverse-text);padding:9px;font:9px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      white-space:pre;overflow:auto;
    }
    .ffsm-diagnostic-note { color:var(--lumiverse-text-muted);font-size:9px;line-height:1.35; }
    @media (max-width:560px) {
      .ffsm-app.open { height:46vh;min-height:280px;max-height:520px; }
      .ffsm-grid2,.ffsm-grid3,.ffsm-formgrid { grid-template-columns:1fr; }
      .ffsm-head { flex-direction:column; }
      .ffsm-head-actions { justify-content:flex-start; }
      .ffsm-hph { grid-template-columns:repeat(2,minmax(0,1fr)); }
    }
  `);
    const actionMount = ctx.ui.mount('chat_actions');
    const panelMount = ctx.ui.mount('chat_composer_above');
    actionMount.style.display = 'contents';
    panelMount.style.display = 'contents';
    const inputArea = actionMount.closest('[data-component="InputArea"]');
    const previousInputOverflow = inputArea?.style.overflow ?? '';
    if (inputArea)
        inputArea.style.overflow = 'visible';
    const toggle = make('button', 'ffsm-toolbar-btn');
    toggle.type = 'button';
    toggle.title = 'FF + MVU StatusMenu';
    toggle.setAttribute('aria-label', 'FF + MVU StatusMenu');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>';
    actionMount.appendChild(toggle);
    const diagnosticsToggle = make('button', 'ffsm-toolbar-btn');
    diagnosticsToggle.type = 'button';
    diagnosticsToggle.title = 'FFMVU Diagnostic Snapshot';
    diagnosticsToggle.setAttribute('aria-label', 'FFMVU Diagnostic Snapshot');
    diagnosticsToggle.setAttribute('aria-pressed', 'false');
    diagnosticsToggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2h8"/><path d="M9 2v3"/><path d="M15 2v3"/><rect x="5" y="5" width="14" height="15" rx="3"/><path d="M9 10h6"/><path d="M9 14h6"/></svg>';
    actionMount.appendChild(diagnosticsToggle);
    const app = make('div', 'ffsm-app');
    panelMount.appendChild(app);
    let activeChatId = null;
    let snapshot = null;
    let runtimeStatus = {};
    let enabled = false;
    let busy = false;
    let activeTab = 'overview';
    let selectedOwnerId = 'player';
    let equipTargetOwnerId = 'player';
    let ffSearch = '';
    let variablesSearch = '';
    let notice = '';
    let panelOpen = false;
    let legacyImportOpen = false;
    let legacyImportText = '';
    let diagnosticsOpen = false;
    let diagnosticsBusy = false;
    let diagnosticReport = null;
    let diagnosticNotice = '';
    const PANEL_HEIGHT_KEY = 'ffmvu.statusmenu.panelHeight.v1';
    const DEFAULT_PANEL_HEIGHT = 520;
    let panelHeight = (() => {
        try {
            const stored = Number(window.localStorage.getItem(PANEL_HEIGHT_KEY));
            return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_PANEL_HEIGHT;
        }
        catch {
            return DEFAULT_PANEL_HEIGHT;
        }
    })();
    function clampPanelHeight(value) {
        const minimum = 280;
        const maximum = Math.max(minimum, window.innerHeight - 110);
        return Math.round(Math.max(minimum, Math.min(maximum, value)));
    }
    function applyPanelHeight() {
        panelHeight = clampPanelHeight(panelHeight);
        app.style.height = panelHeight + 'px';
    }
    function persistPanelHeight() {
        try {
            window.localStorage.setItem(PANEL_HEIGHT_KEY, String(panelHeight));
        }
        catch { }
    }
    function resizeGrip() {
        const grip = make('div', 'ffsm-resize-grip');
        grip.title = 'Drag to resize FFMVU StatusMenu';
        grip.setAttribute('role', 'separator');
        grip.setAttribute('aria-orientation', 'horizontal');
        let dragging = false;
        let startY = 0;
        let startHeight = 0;
        const finish = () => {
            if (!dragging)
                return;
            dragging = false;
            grip.classList.remove('dragging');
            persistPanelHeight();
        };
        grip.addEventListener('pointerdown', event => {
            if (event.button !== 0)
                return;
            event.preventDefault();
            dragging = true;
            startY = event.clientY;
            startHeight = app.getBoundingClientRect().height || panelHeight;
            grip.classList.add('dragging');
            grip.setPointerCapture(event.pointerId);
        });
        grip.addEventListener('pointermove', event => {
            if (!dragging)
                return;
            panelHeight = clampPanelHeight(startHeight + (startY - event.clientY));
            applyPanelHeight();
        });
        grip.addEventListener('pointerup', finish);
        grip.addEventListener('pointercancel', finish);
        return grip;
    }
    const viewportResize = () => {
        if (panelOpen)
            applyPanelHeight();
    };
    window.addEventListener('resize', viewportResize);
    function syncPanelVisibility() {
        app.classList.toggle('open', panelOpen);
        toggle.classList.toggle('active', panelOpen);
        toggle.setAttribute('aria-pressed', String(panelOpen));
        diagnosticsToggle.classList.toggle('active', diagnosticsOpen);
        diagnosticsToggle.setAttribute('aria-pressed', String(diagnosticsOpen));
        if (panelOpen)
            applyPanelHeight();
    }
    toggle.addEventListener('click', () => {
        panelOpen = !panelOpen;
        syncPanelVisibility();
        if (panelOpen) {
            ctx.sendToBackend({ type: 'ffmvu_get_status' });
            requestState();
        }
    });
    function requestDiagnostics() {
        diagnosticsBusy = true;
        diagnosticNotice = 'Collecting read-only runtime snapshot…';
        render();
        ctx.sendToBackend({ type: 'ffmvu_diagnostic_snapshot', chatId: activeChatId ?? '' });
    }
    function clearDiagnosticTrace() {
        diagnosticsBusy = true;
        diagnosticNotice = 'Clearing diagnostic trace…';
        render();
        ctx.sendToBackend({ type: 'ffmvu_diagnostic_clear_trace', chatId: activeChatId ?? '' });
    }
    diagnosticsToggle.addEventListener('click', () => {
        diagnosticsOpen = !diagnosticsOpen;
        if (diagnosticsOpen) {
            panelOpen = true;
            syncPanelVisibility();
            requestDiagnostics();
        }
        else {
            syncPanelVisibility();
            render();
        }
    });
    function activeState() {
        return snapshot?.ok && snapshot.initialized && snapshot.state ? snapshot.state : null;
    }
    function mutationDisabled() {
        return busy || snapshot?.generationPending === true || !snapshot?.headNodeId || !snapshot?.headStateHash || !enabled;
    }
    function requestState() {
        if (!activeChatId) {
            snapshot = null;
            render();
            return;
        }
        ctx.sendToBackend({ type: 'ffmvu_gui_get_state', chatId: activeChatId });
    }
    function sendIntent(intent) {
        if (!activeChatId || !snapshot?.headNodeId || !snapshot.headStateHash || mutationDisabled())
            return;
        busy = true;
        notice = 'Applying ' + intent.type + '…';
        render();
        ctx.sendToBackend({
            type: 'ffmvu_gui_intent',
            chatId: activeChatId,
            expectedHeadNodeId: snapshot.headNodeId,
            expectedHeadStateHash: snapshot.headStateHash,
            requestId: requestId('gui'),
            intent,
        });
    }
    function ownerSelect(state, selected, onChange) {
        const select = make('select', 'ffsm-select');
        for (const owner of statusOwners(state)) {
            const option = document.createElement('option');
            option.value = owner.id;
            option.textContent = ownerLabel(owner);
            option.selected = owner.id === selected;
            select.appendChild(option);
        }
        select.addEventListener('change', () => onChange(select.value));
        return select;
    }
    function card(title) {
        const node = make('div', 'ffsm-card');
        node.appendChild(make('div', 'ffsm-card-title', title));
        return node;
    }
    function addRow(parent, label, value) {
        const row = make('div', 'ffsm-row');
        row.append(make('div', 'ffsm-label', label), make('div', 'ffsm-value', statusText(value)));
        parent.appendChild(row);
    }
    function statBar(label, currentRaw, maxRaw, kind) {
        const current = statusNumber(currentRaw);
        const max = statusNumber(maxRaw);
        const box = make('div', 'ffsm-statbox');
        const head = make('div', 'ffsm-stathead');
        head.append(make('span', '', label), make('span', '', (current ?? '—') + ' / ' + (max ?? '—')));
        const track = make('div', 'ffsm-track');
        const fill = make('div', 'ffsm-fill ' + kind);
        fill.style.width = percent(current, max) + '%';
        track.appendChild(fill);
        box.append(head, track);
        return box;
    }
    function renderHeader(shell) {
        const head = make('div', 'ffsm-head');
        const copy = make('div');
        copy.append(make('div', 'ffsm-head-title', 'FF + MVU · Native StatusMenu'), make('div', 'ffsm-head-sub', activeChatId ? 'Active chat: ' + activeChatId : 'No active chat'));
        const actions = make('div', 'ffsm-head-actions');
        const arm = make('button', 'ffsm-btn', enabled ? 'Disarm' : 'Arm');
        arm.addEventListener('click', () => {
            arm.disabled = true;
            ctx.sendToBackend({ type: 'ffmvu_set_enabled', enabled: !enabled });
        });
        const refresh = make('button', 'ffsm-btn', 'Refresh');
        refresh.disabled = !activeChatId;
        refresh.addEventListener('click', requestState);
        actions.append(arm, refresh);
        head.append(copy, actions);
        shell.appendChild(head);
        const status = make('div', 'ffsm-statusline');
        const bridge = make('span', enabled ? 'ok' : 'warn', enabled ? 'Bridge armed' : 'Bridge disarmed');
        const healthText = snapshot?.ok === false ? (snapshot.headHealth ?? 'unresolved') : snapshot?.initialized ? 'Head ready' : 'State not initialized';
        const health = make('span', snapshot?.ok === false ? 'bad' : snapshot?.initialized ? 'ok' : 'warn', healthText);
        const pending = make('span', snapshot?.generationPending ? 'warn' : '', snapshot?.generationPending ? 'Generation in flight' : 'No generation in flight');
        status.append(bridge, health, pending);
        if (snapshot?.variantId)
            status.appendChild(make('span', '', 'Variant ' + snapshot.variantId));
        shell.appendChild(status);
        if (notice)
            shell.appendChild(make('div', 'ffsm-notice', notice));
    }
    function renderNav(shell) {
        const nav = make('div', 'ffsm-nav');
        for (const [id, title] of TAB_DEFS) {
            const button = make('button', 'ffsm-tab' + (activeTab === id ? ' active' : ''), title);
            button.dataset.tab = id;
            button.addEventListener('click', () => {
                activeTab = id;
                render();
            });
            nav.appendChild(button);
        }
        shell.appendChild(nav);
    }
    function renderOverview(state) {
        const content = make('div', 'ffsm-content');
        const top = make('div', 'ffsm-grid2');
        const stats = card('Main Stats');
        stats.append(statBar('HP', state.Mainchar.Hp_curr, state.Mainchar.Hp_max, 'hp'), statBar('MP', state.Mainchar.Mp_curr, state.Mainchar.Mp_max, 'mp'), statBar('ST', state.Mainchar.Sta_curr, state.Mainchar.Sta_max, 'st'));
        const world = card('World Info');
        addRow(world, 'Date', state.World.Date);
        addRow(world, 'Time', state.World.Time);
        addRow(world, 'Location', state.World.Location);
        addRow(world, 'Weather', state.World.Weather);
        const character = card('Character Status');
        for (const [key, label] of [
            ['Name', 'Name'], ['Age', 'Age'], ['Gender', 'Gender'], ['Occupation', 'Occupation'],
            ['Race', 'Race'], ['Level', 'Level'], ['Exp', 'Exp'], ['Mental_state', 'Mental State'], ['Core-points', 'Core Point'],
        ])
            addRow(character, label, state.Mainchar[key]);
        const avatar = card('Avatar');
        const image = statusText(state.Mainchar.Image, '');
        if (image && image !== '—') {
            const img = make('img', 'ffsm-avatar');
            img.src = image;
            img.alt = 'Avatar';
            img.addEventListener('error', () => {
                img.replaceWith(make('div', 'ffsm-empty', 'Image could not be loaded.'));
            });
            avatar.appendChild(img);
        }
        else
            avatar.appendChild(make('div', 'ffsm-empty', 'No avatar set.'));
        top.append(stats, world, character, avatar);
        content.appendChild(top);
        const hph = statusHphOverview(state);
        if (hph) {
            const hphCard = card('Genitalia Info');
            const metrics = make('div', 'ffsm-hph');
            const values = [
                ['BLADDER', hph.bladder, '/ 10'],
                ['AROUSAL', hph.arousal, '/ 10'],
                ['ERECTION', hph.erection, '/ 10'],
                ['SEMEN', hph.semenMl, hph.semenCapacityMl === null ? 'ml' : '/ ' + hph.semenCapacityMl + ' ml'],
                ['LENGTH', hph.lengthCm, 'cm'],
                ['GIRTH', hph.girthCm, 'cm'],
            ];
            for (const [label, value, suffix] of values) {
                const metric = make('div', 'ffsm-metric');
                metric.append(make('div', 'ffsm-metric-label', label), make('div', 'ffsm-metric-value', (value ?? '—') + ' ' + suffix));
                metrics.appendChild(metric);
            }
            hphCard.appendChild(metrics);
            content.appendChild(hphCard);
        }
        const quests = card('Current Quests');
        const questRows = statusCompactObject(state.Mainchar.Quests, 8);
        if (!questRows.length)
            quests.appendChild(make('div', 'ffsm-empty', 'No active quests.'));
        else
            for (const [key, value] of questRows)
                addRow(quests, key, value);
        content.appendChild(quests);
        return content;
    }
    function renderAttributes(state) {
        const content = make('div', 'ffsm-content');
        const grid = make('div', 'ffsm-grid2');
        const core = card('Base Attributes');
        for (const [key, label] of CORE_STATS)
            addRow(core, label, state.Mainchar[key]);
        const combat = card('Combat Stats');
        for (const [key, label] of COMBAT_STATS)
            addRow(combat, label, state.Mainchar[key]);
        grid.append(core, combat);
        content.appendChild(grid);
        const skills = card('Skill List');
        const rows = statusCompactObject(state.Mainchar.Skills, 100);
        if (!rows.length)
            skills.appendChild(make('div', 'ffsm-empty', 'No skills learned.'));
        else
            for (const [key, value] of rows)
                addRow(skills, key, value);
        content.appendChild(skills);
        return content;
    }
    function renderFamiliars(state) {
        const content = make('div', 'ffsm-content');
        const familiarEntries = statusOwners(state).filter(owner => owner.ref.kind === 'familiar');
        if (!familiarEntries.length) {
            content.appendChild(make('div', 'ffsm-empty', 'No familiars yet.'));
            return content;
        }
        for (const owner of familiarEntries) {
            const box = card(owner.label);
            box.classList.add('ffsm-familiar');
            const raw = owner.record;
            const name = make('div', 'ffsm-familiar-name', owner.label);
            box.appendChild(name);
            for (const [key, label] of [
                ['Race', 'Race'], ['Occupation', 'Job'], ['Level', 'Lv'], ['Exp', 'Exp'],
                ['Location', 'Loc'], ['Affection', 'Affection'], ['Familiar_Status', 'Familiar'],
                ['Gender', 'Gender'], ['Age', 'Age'], ['Height', 'Height'],
            ]) {
                if (raw[key] === undefined)
                    continue;
                const row = make('div', 'ffsm-kvmini');
                row.append(make('span', '', label), make('span', '', statusText(raw[key])));
                box.appendChild(row);
            }
            const counts = make('div', 'ffsm-kvmini');
            counts.append(make('span', '', 'Inventory / Equipment'), make('span', '', Object.keys(asRecord(raw.Inventory)).length + ' / ' + Object.keys(asRecord(raw.Equipment)).length));
            box.appendChild(counts);
            const actions = make('div', 'ffsm-ownerbar');
            const wardrobe = make('button', 'ffsm-btn ffsm-btn-pink', 'Wardrobe');
            wardrobe.addEventListener('click', () => {
                selectedOwnerId = owner.id;
                activeTab = 'wardrobe';
                render();
            });
            const gear = make('button', 'ffsm-btn', 'Equipment');
            gear.addEventListener('click', () => {
                selectedOwnerId = owner.id;
                activeTab = 'equipment';
                render();
            });
            actions.append(wardrobe, gear);
            box.appendChild(actions);
            content.appendChild(box);
        }
        return content;
    }
    function outfitItem(owner, side, key, raw) {
        const record = valueRecord(raw);
        const item = make('div', 'ffsm-item');
        const main = make('div');
        main.appendChild(make('div', 'ffsm-item-name', statusText(record.Name, key)));
        const badges = make('div', 'ffsm-badges');
        for (const badgeKey of ['Slot', 'Layer'])
            if (record[badgeKey])
                badges.appendChild(make('span', 'ffsm-badge', statusText(record[badgeKey])));
        main.appendChild(badges);
        const actions = make('div', 'ffsm-item-actions');
        const action = make('button', 'ffsm-btn ffsm-btn-pink', side === 'Worn' ? 'Remove' : 'Wear');
        action.disabled = mutationDisabled();
        action.addEventListener('click', () => sendIntent({ type: 'outfit.move', owner: owner.ref, from: side, itemKey: key }));
        actions.appendChild(action);
        item.append(main, actions);
        const details = htmlDetails(record);
        if (details)
            item.appendChild(make('div', 'ffsm-item-detail', details));
        return item;
    }
    function renderWardrobe(state) {
        const content = make('div', 'ffsm-content');
        const owners = statusOwners(state);
        if (!owners.some(owner => owner.id === selectedOwnerId))
            selectedOwnerId = 'player';
        const owner = statusOwnerById(state, selectedOwnerId);
        const ownerBar = make('div', 'ffsm-ownerbar');
        ownerBar.append(make('span', 'ffsm-label', 'Owner'), ownerSelect(state, selectedOwnerId, id => {
            selectedOwnerId = id;
            render();
        }));
        content.appendChild(ownerBar);
        const outfit = asRecord(owner.record.Outfit);
        const worn = asRecord(outfit.Worn);
        const wardrobe = asRecord(outfit.Wardrobe);
        const grid = make('div', 'ffsm-grid2');
        const wornCard = card('Worn · ' + Object.keys(worn).length);
        const wornList = make('div', 'ffsm-item-list');
        if (!Object.keys(worn).length)
            wornList.appendChild(make('div', 'ffsm-empty', 'Nothing worn.'));
        else
            for (const [key, raw] of Object.entries(worn))
                wornList.appendChild(outfitItem(owner, 'Worn', key, raw));
        wornCard.appendChild(wornList);
        const wardrobeCard = card('Wardrobe · ' + Object.keys(wardrobe).length);
        const wardrobeList = make('div', 'ffsm-item-list');
        if (!Object.keys(wardrobe).length)
            wardrobeList.appendChild(make('div', 'ffsm-empty', 'Wardrobe is empty.'));
        else
            for (const [key, raw] of Object.entries(wardrobe))
                wardrobeList.appendChild(outfitItem(owner, 'Wardrobe', key, raw));
        wardrobeCard.appendChild(wardrobeList);
        grid.append(wornCard, wardrobeCard);
        content.appendChild(grid);
        return content;
    }
    function itemNode(state, sourceOwner, item, mode) {
        const node = make('div', 'ffsm-item');
        const main = make('div');
        main.appendChild(make('div', 'ffsm-item-name', item.name + (item.qty !== null ? ' ×' + item.qty : '')));
        const badges = make('div', 'ffsm-badges');
        for (const badgeKey of ['Type', 'Slot'])
            if (item.record[badgeKey])
                badges.appendChild(make('span', 'ffsm-badge', statusText(item.record[badgeKey])));
        main.appendChild(badges);
        const actions = make('div', 'ffsm-item-actions');
        if (mode === 'equipment') {
            const unequip = make('button', 'ffsm-btn', 'Unequip');
            unequip.disabled = mutationDisabled();
            unequip.addEventListener('click', () => sendIntent({
                type: 'equipment.unequip',
                owner: sourceOwner.ref,
                equipmentKey: item.key,
            }));
            actions.appendChild(unequip);
        }
        else {
            if (item.equippable) {
                const target = statusOwnerById(state, equipTargetOwnerId);
                const equip = make('button', 'ffsm-btn', 'Equip');
                equip.title = 'Equip to ' + ownerLabel(target);
                equip.disabled = mutationDisabled();
                equip.addEventListener('click', () => sendIntent({
                    type: 'equipment.equip',
                    sourceOwner: sourceOwner.ref,
                    targetOwner: target.ref,
                    itemKey: item.key,
                }));
                actions.appendChild(equip);
            }
            const del = make('button', 'ffsm-btn ffsm-btn-danger', 'Delete');
            del.disabled = mutationDisabled();
            del.addEventListener('click', () => {
                if (!window.confirm('Delete "' + item.name + '"?'))
                    return;
                sendIntent({ type: 'inventory.delete', owner: sourceOwner.ref, itemKey: item.key });
            });
            actions.appendChild(del);
        }
        node.append(main, actions);
        const details = htmlDetails(item.record);
        if (details)
            node.appendChild(make('div', 'ffsm-item-detail', details));
        return node;
    }
    function renderEquipment(state) {
        const content = make('div', 'ffsm-content');
        const owners = statusOwners(state);
        if (!owners.some(owner => owner.id === selectedOwnerId))
            selectedOwnerId = 'player';
        if (!owners.some(owner => owner.id === equipTargetOwnerId))
            equipTargetOwnerId = selectedOwnerId;
        const owner = statusOwnerById(state, selectedOwnerId);
        const bar = make('div', 'ffsm-ownerbar');
        bar.append(make('span', 'ffsm-label', 'Inventory owner'), ownerSelect(state, selectedOwnerId, id => {
            selectedOwnerId = id;
            if (!statusOwners(state).some(candidate => candidate.id === equipTargetOwnerId))
                equipTargetOwnerId = id;
            render();
        }), make('span', 'ffsm-label', 'Equip target'), ownerSelect(state, equipTargetOwnerId, id => {
            equipTargetOwnerId = id;
            render();
        }));
        content.appendChild(bar);
        const grid = make('div', 'ffsm-grid2');
        const equippedCard = card('Equipped');
        const equippedList = make('div', 'ffsm-item-list');
        const equipped = statusItems(owner.record.Equipment);
        if (!equipped.length)
            equippedList.appendChild(make('div', 'ffsm-empty', 'Nothing equipped.'));
        else
            for (const item of equipped)
                equippedList.appendChild(itemNode(state, owner, item, 'equipment'));
        equippedCard.appendChild(equippedList);
        const availableCard = card('Equippable Inventory');
        const availableList = make('div', 'ffsm-item-list');
        const available = statusItems(owner.record.Inventory).filter(item => item.equippable);
        if (!available.length)
            availableList.appendChild(make('div', 'ffsm-empty', 'No equippable items.'));
        else
            for (const item of available)
                availableList.appendChild(itemNode(state, owner, item, 'inventory'));
        availableCard.appendChild(availableList);
        grid.append(equippedCard, availableCard);
        content.appendChild(grid);
        return content;
    }
    function renderItems(state) {
        const content = make('div', 'ffsm-content');
        const owners = statusOwners(state);
        if (!owners.some(owner => owner.id === selectedOwnerId))
            selectedOwnerId = 'player';
        if (!owners.some(owner => owner.id === equipTargetOwnerId))
            equipTargetOwnerId = selectedOwnerId;
        const owner = statusOwnerById(state, selectedOwnerId);
        const bar = make('div', 'ffsm-ownerbar');
        bar.append(make('span', 'ffsm-label', 'Inventory owner'), ownerSelect(state, selectedOwnerId, id => { selectedOwnerId = id; render(); }), make('span', 'ffsm-label', 'Equip target'), ownerSelect(state, equipTargetOwnerId, id => { equipTargetOwnerId = id; render(); }));
        content.appendChild(bar);
        const inventoryCard = card('Inventory · ' + statusItems(owner.record.Inventory).length);
        const list = make('div', 'ffsm-item-list');
        const items = statusItems(owner.record.Inventory);
        if (!items.length)
            list.appendChild(make('div', 'ffsm-empty', 'Empty inventory.'));
        else
            for (const item of items)
                list.appendChild(itemNode(state, owner, item, 'inventory'));
        inventoryCard.appendChild(list);
        content.appendChild(inventoryCard);
        return content;
    }
    function renderCollectionCard(title, value) {
        const box = card(title);
        const rows = statusCompactObject(value, 100);
        if (!rows.length)
            box.appendChild(make('div', 'ffsm-empty', 'None.'));
        else
            for (const [key, shown] of rows)
                addRow(box, key, shown);
        return box;
    }
    function renderOthers(state) {
        const content = make('div', 'ffsm-content');
        const grid = make('div', 'ffsm-grid2');
        grid.append(renderCollectionCard('Talents', state.Mainchar.Talents), renderCollectionCard('Buffs', state.Mainchar.Buffs), renderCollectionCard('Ailments', state.Mainchar.Ailments), renderCollectionCard('Real Estate', state.Mainchar.Real_estate), renderCollectionCard('World · Factions', state.World_Calc.Factions), renderCollectionCard('World · Locations', state.World_Calc.Locations), renderCollectionCard('World · Ruins', state.World_Calc.Ruins), renderCollectionCard('World · Events', state.World_Calc.Events));
        content.appendChild(grid);
        return content;
    }
    function treeContains(value, path, query) {
        if (!query)
            return true;
        if ((path + ' ' + statusText(value, '')).toLowerCase().includes(query))
            return true;
        if (Array.isArray(value))
            return value.some((child, index) => treeContains(child, path + '.' + index, query));
        if (isRecord(value))
            return Object.entries(value).some(([key, child]) => treeContains(child, path ? path + '.' + key : key, query));
        return false;
    }
    function treeNode(key, value, path, depth, query) {
        if (!treeContains(value, path, query))
            return null;
        if (isRecord(value) || Array.isArray(value)) {
            const details = make('details');
            if (depth < 1 || query)
                details.open = true;
            const count = Array.isArray(value) ? value.length : Object.keys(value).length;
            details.appendChild(make('summary', '', key + ' (' + count + ')'));
            const entries = Array.isArray(value) ? value.map((child, index) => [String(index), child]) : Object.entries(value);
            for (const [childKey, child] of entries) {
                const childPath = path ? path + '.' + childKey : childKey;
                const built = treeNode(childKey, child, childPath, depth + 1, query);
                if (built)
                    details.appendChild(built);
            }
            return details;
        }
        const row = make('div', 'ffsm-tree-leaf');
        row.append(make('div', 'ffsm-tree-key', key), make('div', 'ffsm-tree-val', statusText(value, 'null')));
        return row;
    }
    function renderFfState(state) {
        const content = make('div', 'ffsm-content');
        const searchWrap = make('div', 'ffsm-tree-search');
        const search = make('input', 'ffsm-input');
        search.type = 'search';
        search.placeholder = 'Search FF state…';
        search.value = ffSearch;
        search.addEventListener('input', () => {
            ffSearch = search.value.trim().toLowerCase();
            const cursor = search.selectionStart;
            activeTab = 'ffstate';
            render();
            const next = app.querySelector('.ffsm-tree-search input');
            if (next) {
                next.focus();
                if (cursor !== null)
                    next.setSelectionRange(cursor, cursor);
            }
        });
        searchWrap.appendChild(search);
        const tree = make('div', 'ffsm-tree');
        const root = treeNode('stat_data', state, '', 0, ffSearch);
        if (root)
            tree.appendChild(root);
        else
            tree.appendChild(make('div', 'ffsm-empty', 'No matching state paths.'));
        content.append(searchWrap, tree);
        return content;
    }
    function field(label, input) {
        const wrap = make('div', 'ffsm-field');
        wrap.append(make('label', '', label), input);
        return wrap;
    }
    function textInput(value, type = 'text') {
        const input = make('input', 'ffsm-input');
        input.type = type;
        input.value = value;
        return input;
    }
    function renderNewGame() {
        const content = make('div', 'ffsm-newgame');
        const intro = card('New Game · GameStart v1.4');
        intro.appendChild(make('div', 'ffsm-head-sub', 'Core attributes: STR/AGI/CON/INT/WIS start at 5 and share up to 50 distributable points. Charisma is separate: 80–100.'));
        content.appendChild(intro);
        const importCard = card('Continue Existing FF+MVU Save');
        importCard.appendChild(make('div', 'ffsm-head-sub', 'Tier-1 legacy import. Paste the wrapper containing stat_data and, when available, ff_mvu_prompt_view + ff_mvu_snapshot_meta. The current Lumiverse transcript through its last message is treated as already represented by this snapshot.'));
        const importToggle = make('button', 'ffsm-btn', legacyImportOpen ? 'Hide Legacy Import' : 'Import Legacy Save');
        importToggle.type = 'button';
        importToggle.style.marginTop = '8px';
        importToggle.disabled = busy;
        importToggle.addEventListener('click', () => {
            legacyImportOpen = !legacyImportOpen;
            render();
        });
        importCard.appendChild(importToggle);
        if (legacyImportOpen) {
            const legacyText = make('textarea', 'ffsm-textarea');
            legacyText.placeholder = '{ "stat_data": { ... }, "ff_mvu_prompt_view": { ... }, "ff_mvu_snapshot_meta": { ... } }';
            legacyText.value = legacyImportText;
            legacyText.style.minHeight = '150px';
            legacyText.addEventListener('input', () => { legacyImportText = legacyText.value; });
            const importButton = make('button', 'ffsm-btn', 'Import as Legacy Base');
            importButton.type = 'button';
            importButton.style.width = '100%';
            importButton.style.marginTop = '8px';
            importButton.disabled = !enabled || busy;
            importButton.addEventListener('click', () => {
                if (!activeChatId || busy || !enabled)
                    return;
                let legacy;
                try {
                    legacy = JSON.parse(legacyText.value);
                }
                catch (error) {
                    notice = 'Legacy JSON parse failed: ' + String(error);
                    render();
                    return;
                }
                legacyImportText = legacyText.value;
                busy = true;
                notice = 'Importing authoritative legacy state…';
                render();
                ctx.sendToBackend({
                    type: 'ffmvu_import_legacy',
                    chatId: activeChatId,
                    requestId: requestId('legacy'),
                    legacy,
                });
            });
            importCard.append(legacyText, importButton);
        }
        content.appendChild(importCard);
        const form = document.createElement('form');
        form.className = 'ffsm-card';
        const grid = make('div', 'ffsm-formgrid');
        const date = textInput('Day 1');
        const time = textInput('08:00');
        const weather = textInput('Clear');
        const location = textInput('Unspecified');
        const name = textInput('{{user}}');
        const age = textInput('18');
        const gender = textInput('Male');
        const race = textInput('Human');
        const occupation = textInput('Adventurer');
        const mental = textInput('Calm');
        const level = textInput('1', 'number');
        level.min = '1';
        level.max = '140';
        const exp = textInput('0', 'number');
        exp.min = '0';
        const core = textInput('0', 'number');
        core.min = '0';
        const charisma = textInput('85', 'number');
        charisma.min = '80';
        charisma.max = '100';
        grid.append(field('Date', date), field('Time', time), field('Weather', weather), field('Location', location), field('Name', name), field('Age', age), field('Gender', gender), field('Race', race), field('Occupation', occupation), field('Mental state', mental), field('Level', level), field('EXP', exp), field('Core points', core), field('Charisma (80–100)', charisma));
        form.appendChild(grid);
        const statsCard = make('div', 'ffsm-card');
        statsCard.style.marginTop = '9px';
        statsCard.appendChild(make('div', 'ffsm-card-title', 'Core Attributes'));
        const statsGrid = make('div', 'ffsm-formgrid');
        const statInputs = {};
        for (const [key, label] of [['str', 'Strength'], ['agi', 'Agility'], ['con', 'Constitution'], ['int', 'Intelligence'], ['wis', 'Wisdom']]) {
            const input = textInput('5', 'number');
            input.min = '5';
            input.step = '1';
            statInputs[key] = input;
            statsGrid.appendChild(field(label, input));
        }
        const budget = make('div', 'ffsm-budget');
        const refreshBudget = () => {
            const values = {
                str: Number(statInputs.str.value), agi: Number(statInputs.agi.value), con: Number(statInputs.con.value),
                int: Number(statInputs.int.value), wis: Number(statInputs.wis.value),
            };
            const result = statusCoreBudget(values);
            budget.textContent = 'Spent: ' + result.spent + ' / 50 · Remaining: ' + result.remaining;
            budget.style.color = result.valid ? '' : '#ff8a80';
        };
        for (const input of Object.values(statInputs))
            input.addEventListener('input', refreshBudget);
        refreshBudget();
        statsCard.append(statsGrid, budget);
        form.appendChild(statsCard);
        const weapon = make('textarea', 'ffsm-textarea');
        weapon.placeholder = 'Optional starting weapon preference…';
        const weaponField = field('Optional Starting Weapon', weapon);
        weaponField.style.marginTop = '9px';
        form.appendChild(weaponField);
        const submit = make('button', 'ffsm-btn', 'Confirm & Start Journey');
        submit.type = 'submit';
        submit.style.width = '100%';
        submit.style.marginTop = '10px';
        submit.disabled = !enabled || busy;
        form.appendChild(submit);
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (!activeChatId || busy || !enabled)
                return;
            const statValues = {
                str: Number(statInputs.str.value), agi: Number(statInputs.agi.value), con: Number(statInputs.con.value),
                int: Number(statInputs.int.value), wis: Number(statInputs.wis.value),
            };
            const budgetResult = statusCoreBudget(statValues);
            if (!budgetResult.valid) {
                notice = 'Core attribute budget is invalid.';
                render();
                return;
            }
            busy = true;
            notice = 'Creating authoritative GameStart state…';
            render();
            ctx.sendToBackend({
                type: 'ffmvu_start_new_game',
                chatId: activeChatId,
                requestId: requestId('newgame'),
                gameStart: {
                    date: date.value.trim() || 'Day 1',
                    time: time.value.trim() || '08:00',
                    weather: weather.value.trim() || 'Clear',
                    location: location.value.trim() || 'Unspecified',
                    name: name.value.trim() || '{{user}}',
                    age: age.value.trim() || '18',
                    gender: gender.value.trim() || 'Male',
                    race: race.value.trim() || 'Human',
                    occupation: occupation.value.trim() || 'Adventurer',
                    mental: mental.value.trim() || 'Calm',
                    charisma: Number(charisma.value),
                    level: Number(level.value),
                    exp: Number(exp.value),
                    core: Number(core.value),
                    weaponRequest: weapon.value.trim(),
                    stats: statValues,
                },
            });
        });
        content.appendChild(form);
        return content;
    }
    function renderBody(shell) {
        if (!activeChatId) {
            shell.appendChild(make('div', 'ffsm-empty', 'Open a chat to use FFMVU StatusMenu.'));
            return;
        }
        if (!snapshot) {
            shell.appendChild(make('div', 'ffsm-empty', 'Loading branch state…'));
            return;
        }
        if (snapshot.ok === false) {
            const box = make('div', 'ffsm-content');
            const error = card('State unavailable');
            error.appendChild(make('div', 'ffsm-notice', snapshot.reason ?? 'Active semantic head is unresolved.'));
            const retry = make('button', 'ffsm-btn', 'Retry');
            retry.addEventListener('click', requestState);
            error.appendChild(retry);
            box.appendChild(error);
            shell.appendChild(box);
            return;
        }
        if (snapshot.initialized === false) {
            shell.appendChild(renderNewGame());
            return;
        }
        const state = activeState();
        if (!state) {
            shell.appendChild(make('div', 'ffsm-empty', 'State payload missing.'));
            return;
        }
        renderNav(shell);
        const body = activeTab === 'overview' ? renderOverview(state) :
            activeTab === 'attributes' ? renderAttributes(state) :
                activeTab === 'familiars' ? renderFamiliars(state) :
                    activeTab === 'wardrobe' ? renderWardrobe(state) :
                        activeTab === 'equipment' ? renderEquipment(state) :
                            activeTab === 'items' ? renderItems(state) :
                                activeTab === 'others' ? renderOthers(state) :
                                    renderFfState(state);
        shell.appendChild(body);
    }
    function renderDiagnostics(shell) {
        const details = make('details', 'ffsm-diag');
        details.appendChild(make('summary', '', 'Diagnostics · ' + String(runtimeStatus.phase ?? 'idle')));
        const pre = make('pre');
        pre.textContent = JSON.stringify(runtimeStatus, null, 2);
        details.appendChild(pre);
        shell.appendChild(details);
    }
    function renderDiagnosticOverlay() {
        const overlay = make('div', 'ffsm-diagnostic-overlay');
        const panel = make('div', 'ffsm-diagnostic-panel');
        const head = make('div', 'ffsm-diagnostic-head');
        const title = make('div', 'ffsm-diagnostic-title', 'FFMVU · Diagnostic Snapshot');
        const actions = make('div', 'ffsm-diagnostic-actions');
        const refresh = make('button', 'ffsm-btn', diagnosticsBusy ? 'Collecting…' : 'Snapshot');
        refresh.disabled = diagnosticsBusy;
        refresh.addEventListener('click', requestDiagnostics);
        const clear = make('button', 'ffsm-btn', 'Clear Trace');
        clear.disabled = diagnosticsBusy;
        clear.title = 'Clears only the in-memory diagnostic event trace. It does not touch FFMVU state.';
        clear.addEventListener('click', clearDiagnosticTrace);
        const copy = make('button', 'ffsm-btn', 'Copy');
        copy.disabled = diagnosticsBusy || !diagnosticReport;
        const close = make('button', 'ffsm-btn', 'Close');
        close.addEventListener('click', () => {
            diagnosticsOpen = false;
            syncPanelVisibility();
            render();
        });
        const text = make('textarea', 'ffsm-diagnostic-text');
        text.readOnly = true;
        text.spellcheck = false;
        text.value = diagnosticReport
            ? JSON.stringify(diagnosticReport, null, 2)
            : diagnosticsBusy ? 'Collecting diagnostic snapshot…' : 'No snapshot collected yet.';
        copy.addEventListener('click', async () => {
            if (!diagnosticReport)
                return;
            const value = JSON.stringify(diagnosticReport, null, 2);
            try {
                await navigator.clipboard.writeText(value);
                diagnosticNotice = 'Diagnostic report copied to clipboard.';
            }
            catch {
                text.focus();
                text.select();
                try {
                    document.execCommand('copy');
                    diagnosticNotice = 'Diagnostic report copied to clipboard.';
                }
                catch {
                    diagnosticNotice = 'Clipboard API failed. Select the report manually and copy it.';
                }
            }
            render();
        });
        actions.append(refresh, clear, copy, close);
        head.append(title, actions);
        panel.appendChild(head);
        panel.appendChild(make('div', 'ffsm-diagnostic-note', diagnosticNotice || 'Read-only snapshot: lifecycle trace, transcript hashes, semantic/store heads, active variant/attempt lineage, projection binding, and Scene.HPH shape. No state values are edited.'));
        panel.appendChild(text);
        overlay.appendChild(panel);
        return overlay;
    }
    function render() {
        app.replaceChildren();
        const frame = make('div', 'ffsm-panel-frame');
        const content = make('div', 'ffsm-panel-content');
        frame.append(resizeGrip(), content);
        const state = activeState();
        if (state && snapshot?.ok && snapshot.initialized) {
            content.appendChild(renderLegacyStatusMenu({
                state,
                activeTab,
                selectedOwnerId,
                mutationDisabled: mutationDisabled(),
                onTab: tab => { activeTab = tab; },
                onOwner: ownerId => { selectedOwnerId = ownerId; },
                variablesSearch,
                onVariablesSearch: value => { variablesSearch = value; },
                onIntent: sendIntent,
                onUnsupported: message => {
                    notice = message;
                    window.alert(message);
                },
            }));
        }
        else {
            const shell = make('div', 'ffsm-shell');
            renderHeader(shell);
            renderBody(shell);
            renderDiagnostics(shell);
            content.appendChild(shell);
        }
        app.appendChild(frame);
        if (diagnosticsOpen)
            app.appendChild(renderDiagnosticOverlay());
        applyPanelHeight();
        syncPanelVisibility();
    }
    const backendUnsub = ctx.onBackendMessage((payload) => {
        if (payload?.type === 'ffmvu_status') {
            runtimeStatus = payload.status ?? {};
            if (typeof payload.status?.enabled === 'boolean')
                enabled = payload.status.enabled;
            const phase = String(payload.status?.phase ?? '');
            if (payload.status?.chatId === activeChatId && [
                'commit_complete', 'swipe_navigated', 'gui_commit_complete', 'new_game_complete', 'legacy_import_complete',
                'continue_commit_complete', 'no_patch', 'stopped_durable',
            ].includes(phase))
                requestState();
            render();
            return;
        }
        if (payload?.type === 'ffmvu_diagnostic_snapshot_result') {
            if (payload.chatId && payload.chatId !== activeChatId)
                return;
            diagnosticsBusy = false;
            if (payload.ok) {
                diagnosticReport = payload.report ?? {};
                diagnosticNotice = 'Snapshot collected. Reproduce the failure after Clear Trace, then press Snapshot again for the cleanest report.';
            }
            else {
                diagnosticReport = {
                    format: 'FFMVU-Diagnostic-Snapshot-Error',
                    reason: String(payload.reason ?? 'Diagnostic snapshot failed'),
                    detail: payload.detail ?? null,
                };
                diagnosticNotice = 'Diagnostic collection itself failed; the error report is shown below.';
            }
            diagnosticsOpen = true;
            panelOpen = true;
            render();
            return;
        }
        if (payload?.type === 'ffmvu_diagnostic_trace_cleared') {
            if (payload.chatId && payload.chatId !== activeChatId)
                return;
            diagnosticsBusy = false;
            diagnosticReport = null;
            diagnosticNotice = 'Trace cleared. Reproduce the problem now, then press Snapshot.';
            diagnosticsOpen = true;
            panelOpen = true;
            render();
            return;
        }
        if (payload?.type === 'ffmvu_gui_state') {
            if (payload.chatId !== activeChatId)
                return;
            snapshot = payload;
            busy = false;
            if (snapshot.ok && snapshot.initialized)
                notice = '';
            render();
            return;
        }
        if (payload?.type === 'ffmvu_gui_result') {
            if (payload.chatId !== activeChatId)
                return;
            busy = false;
            if (payload.ok) {
                snapshot = {
                    ok: true,
                    initialized: true,
                    chatId: payload.chatId,
                    headNodeId: payload.headNodeId,
                    headStateHash: payload.headStateHash,
                    variantId: payload.variantId ?? null,
                    generationPending: false,
                    state: payload.state,
                };
                notice = '';
                render();
            }
            else {
                notice = String(payload.reason ?? 'GUI mutation failed.');
                render();
                requestState();
            }
            return;
        }
        if (payload?.type === 'ffmvu_new_game_result') {
            if (payload.chatId !== activeChatId)
                return;
            busy = false;
            if (payload.ok) {
                snapshot = {
                    ok: true,
                    initialized: true,
                    chatId: payload.chatId,
                    headNodeId: payload.headNodeId,
                    headStateHash: payload.headStateHash,
                    variantId: null,
                    generationPending: false,
                    state: payload.state,
                };
                notice = '';
                activeTab = 'overview';
                render();
            }
            else {
                const errors = Array.isArray(payload.validationErrors) ? ': ' + payload.validationErrors.join('; ') : '';
                notice = String(payload.reason ?? 'New Game failed') + errors;
                render();
            }
            return;
        }
        if (payload?.type === 'ffmvu_legacy_import_result') {
            if (payload.chatId !== activeChatId)
                return;
            busy = false;
            if (payload.ok) {
                snapshot = {
                    ok: true,
                    initialized: true,
                    chatId: payload.chatId,
                    headNodeId: payload.headNodeId,
                    headStateHash: payload.headStateHash,
                    variantId: null,
                    generationPending: false,
                    state: payload.state,
                };
                legacyImportOpen = false;
                legacyImportText = '';
                notice = 'Legacy FF+MVU state imported.';
                activeTab = 'overview';
                render();
            }
            else {
                notice = String(payload.reason ?? 'Legacy import failed');
                render();
            }
        }
    });
    function applyActiveChat(next) {
        if (next === activeChatId)
            return;
        activeChatId = next;
        snapshot = null;
        busy = false;
        notice = '';
        activeTab = 'overview';
        selectedOwnerId = 'player';
        equipTargetOwnerId = 'player';
        ffSearch = '';
        variablesSearch = '';
        diagnosticsBusy = false;
        diagnosticReport = null;
        diagnosticNotice = diagnosticsOpen ? 'Chat changed. Collect a new snapshot for this chat.' : '';
        render();
        requestState();
    }
    const chatSwitchUnsub = ctx.events.on('CHAT_SWITCHED', (payload) => {
        const next = typeof payload?.chatId === 'string' ? payload.chatId : null;
        applyActiveChat(next);
    });
    const initial = ctx.getActiveChat();
    activeChatId = initial.chatId ?? null;
    syncPanelVisibility();
    render();
    ctx.sendToBackend({ type: 'ffmvu_get_status' });
    requestState();
    return () => {
        backendUnsub();
        chatSwitchUnsub();
        window.removeEventListener('resize', viewportResize);
        toggle.remove();
        diagnosticsToggle.remove();
        app.remove();
        if (inputArea) {
            if (previousInputOverflow)
                inputArea.style.overflow = previousInputOverflow;
            else
                inputArea.style.removeProperty('overflow');
        }
        removeStyle();
        ctx.dom.cleanup();
    };
}
