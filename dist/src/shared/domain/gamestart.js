import { clone } from './value-utils.js';
export function normalizeClock(value) {
    const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(value ?? ''));
    if (!match)
        return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59)
        return null;
    return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
}
export function validateGameStartPayload(payload) {
    const errors = [];
    if (!normalizeClock(payload.time))
        errors.push('Time must use a valid 24-hour H:MM or HH:MM value');
    if (!Number.isInteger(payload.charisma) || payload.charisma < 80 || payload.charisma > 100)
        errors.push('Charisma must be an integer from 80 to 100');
    if (!Number.isInteger(payload.level) || payload.level < 1 || payload.level > 140)
        errors.push('Level must be an integer from 1 to 140');
    if (!Number.isInteger(payload.exp) || payload.exp < 0)
        errors.push('EXP must be a non-negative integer');
    if (!Number.isInteger(payload.core) || payload.core < 0)
        errors.push('Core points must be a non-negative integer');
    const values = [payload.stats.str, payload.stats.agi, payload.stats.con, payload.stats.int, payload.stats.wis];
    if (values.some(value => !Number.isInteger(value) || value < 5))
        errors.push('Core attributes must be integers >= 5');
    const spent = values.reduce((sum, value) => sum + (value - 5), 0);
    if (spent > 50)
        errors.push('Core attribute budget exceeded');
    return errors;
}
function tupleSet(object, key, value, label) {
    const current = object[key];
    if (!Array.isArray(current) || current.length < 2)
        object[key] = [value, label];
    else
        current[0] = value;
}
export function applyGameStartPayload(inputState, payloadInput) {
    const errors = validateGameStartPayload(payloadInput);
    if (errors.length)
        throw new Error(errors.join('; '));
    const payload = { ...payloadInput, time: normalizeClock(payloadInput.time) ?? payloadInput.time };
    const state = clone(inputState);
    const world = state.World;
    const mc = state.Mainchar;
    tupleSet(world, 'Date', payload.date, 'Date');
    tupleSet(world, 'Time', payload.time, 'Time');
    tupleSet(world, 'Weather', payload.weather, 'Weather');
    tupleSet(world, 'Location', payload.location, 'Location');
    tupleSet(mc, 'Name', payload.name, 'Name');
    tupleSet(mc, 'Age', payload.age, 'Age');
    tupleSet(mc, 'Gender', payload.gender, 'Gender');
    tupleSet(mc, 'Race', payload.race, 'Race');
    tupleSet(mc, 'Occupation', payload.occupation, 'Occupation');
    tupleSet(mc, 'Mental_state', payload.mental, 'Mental State');
    const level = Math.max(1, Math.min(140, Number(payload.level) || 1));
    const str = Math.max(5, Number(payload.stats.str) || 5);
    const agi = Math.max(5, Number(payload.stats.agi) || 5);
    const con = Math.max(5, Number(payload.stats.con) || 5);
    const intel = Math.max(5, Number(payload.stats.int) || 5);
    const wis = Math.max(5, Number(payload.stats.wis) || 5);
    const cha = Math.max(80, Math.min(100, Number(payload.charisma) || 80));
    tupleSet(mc, 'Level', level, 'Level');
    tupleSet(mc, 'Exp', Math.max(0, Number(payload.exp) || 0), 'Experience');
    tupleSet(mc, 'Core-points', Math.max(0, Number(payload.core) || 0), 'Unassigned Points');
    tupleSet(mc, 'Strength', str, 'Strength');
    tupleSet(mc, 'Agility', agi, 'Agility');
    tupleSet(mc, 'Constitution', con, 'Constitution');
    tupleSet(mc, 'Intelligence', intel, 'Intelligence');
    tupleSet(mc, 'Wisdom', wis, 'Wisdom');
    tupleSet(mc, 'Charisma', cha, 'Charisma');
    const hp = Math.floor(20 + con * 3 + level * 6);
    const stamina = Math.floor(50 + con * 3 + agi * 2 + Math.floor(level * 5 / 3));
    const mp = Math.floor((50 + intel * 4 + wis * 2 + level * 5) / 3);
    tupleSet(mc, 'Hp_max', hp, 'Max HP');
    tupleSet(mc, 'Hp_curr', hp, 'Current HP');
    tupleSet(mc, 'Sta_max', stamina, 'Max Stamina');
    tupleSet(mc, 'Sta_curr', stamina, 'Current Stamina');
    tupleSet(mc, 'Mp_max', mp, 'Max MP');
    tupleSet(mc, 'Mp_curr', mp, 'Current MP');
    tupleSet(mc, 'Physical_attack', Math.floor(str * 2 + level * 2), 'Physical Attack');
    tupleSet(mc, 'Magic_attack', Math.floor(intel * 2 + level * 2), 'Magic Attack');
    tupleSet(mc, 'Physical_defense', Math.floor(con / 2 + level * 3), 'Physical Defense');
    tupleSet(mc, 'Magic_defense', Math.floor(wis / 2 + level * 3), 'Magic Defense');
    tupleSet(mc, 'Magic_assist', Math.floor(wis * 1.5 + intel * 0.5 + level * 1.5), 'Magic Support');
    delete state.Mainchar.Inventory['Beginner Sword'];
    delete state.Mainchar.Inventory['Beginner Staff'];
    delete state.Mainchar.Equipment['Beginner Sword'];
    delete state.Mainchar.Equipment['Beginner Staff'];
    const request = String(payload.weaponRequest || '').trim();
    tupleSet(mc, 'Starting_weapon_request', request, 'One-shot starting weapon preference');
    tupleSet(mc, 'Starting_weapon_status', request ? 'pending' : 'none', 'none | pending | fulfilled');
    state.Narrative.Scene.LocationKey = payload.location;
    state.Narrative.Scene.Changed = true;
    state.GameStarted = true;
    return state;
}
//# sourceMappingURL=gamestart.js.map