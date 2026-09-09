import type { FFMVUState, LegacyFFMVUState } from './state-schema.js';
import { REQUIRED_MAINCHAR_TUPLES, REQUIRED_WORLD_TUPLES } from './state-schema.js';
import { asArray, asRecord, isLabeledTuple, isRecord, lower, text } from './domain/value-utils.js';

const SEVERITIES = new Set(['low', 'moderate', 'high']);

function validateCommonState(state: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(state)) return ['stat_data is not an object'];

  const world = asRecord(state.World);
  for (const key of REQUIRED_WORLD_TUPLES) {
    if (!isLabeledTuple(world[key])) errors.push('World.' + key + ' is not a labeled tuple');
  }
  const mc = asRecord(state.Mainchar);
  for (const key of REQUIRED_MAINCHAR_TUPLES) {
    if (!isLabeledTuple(mc[key])) errors.push('Mainchar.' + key + ' is not a labeled tuple');
  }

  const narrative = state.Narrative;
  if (!isRecord(narrative)) return [...new Set([...errors, 'Narrative is missing'])];
  const npcs = asRecord(narrative.NPCs);
  const familiarIds = new Set(Object.keys(asRecord(state.Familiar)));
  let highest = 0;
  for (const id of Object.keys(npcs)) {
    if (!/^npc_\d{4,}$/.test(id)) errors.push('Invalid NPC ID: ' + id);
    const number = Number(id.slice(4));
    if (Number.isFinite(number)) highest = Math.max(highest, number);
    if (isRecord(npcs[id]) && npcs[id].ID !== id) errors.push('NPC ID mismatch: ' + id);
  }
  if (!Number.isInteger(narrative.NextNpcId) || Number(narrative.NextNpcId) <= highest) {
    errors.push('NextNpcId was not advanced atomically');
  }
  for (const idRaw of asArray(asRecord(narrative.Scene).PresentNPCs)) {
    const id = text(idRaw);
    if (!npcs[id] && !familiarIds.has(id)) errors.push('PresentNPCs references a missing actor: ' + id);
  }
  for (const [id, relation] of Object.entries(asRecord(narrative.Relationships))) {
    if (!isRecord(relation)) {
      errors.push('Relationship is not an object: ' + id);
      continue;
    }
    for (const side of ['A', 'B']) {
      if (!text(relation[side])) errors.push('Relationship ' + id + ' has an empty ' + side);
    }
  }
  return errors;
}

function validateConditionCollection(value: unknown, path: string, limit: number, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(path + ' is not an object');
    return;
  }
  const entries = Object.entries(value);
  if (entries.length > limit) errors.push(path + ' exceeds its active-entry limit of ' + limit);
  for (const [id, raw] of entries) {
    if (!isRecord(raw)) {
      errors.push(path + '.' + id + ' is not an object');
      continue;
    }
    if (!text(raw.State).trim()) errors.push(path + '.' + id + '.State is empty');
    if (!SEVERITIES.has(lower(raw.Severity))) errors.push(path + '.' + id + '.Severity is invalid');
    if (lower(raw.Status) !== 'active') errors.push(path + '.' + id + '.Status must be active');
  }
}

function validateInnerThreadCollection(value: unknown, path: string, limit: number, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(path + ' is not an object');
    return;
  }
  const entries = Object.entries(value);
  if (entries.length > limit) errors.push(path + ' exceeds its active-entry limit of ' + limit);
  for (const [id, raw] of entries) {
    if (!isRecord(raw)) {
      errors.push(path + '.' + id + ' is not an object');
      continue;
    }
    if (!text(raw.Subject).trim() && !text(raw.Tension).trim()) errors.push(path + '.' + id + ' has no subject or tension');
    if (lower(raw.Status) !== 'active') errors.push(path + '.' + id + '.Status must be active');
  }
}

function validateAgenda(value: unknown, path: string, errors: string[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push(path + ' is not an object');
    return;
  }
  if (lower(value.Status) !== 'active') errors.push(path + '.Status must be active');
  if (!['CurrentGoal', 'NextAction', 'Deadline', 'Location', 'Pressure'].some(key => text(value[key]).trim())) {
    errors.push(path + ' has no actionable field');
  }
}

/** Exact legacy structural validation used when replaying 1.5.8 commits. */
export function validateStateV158(state: unknown): string[] {
  return [...new Set(validateCommonState(state))];
}

/** Current state validation. Normalization removes resolved and empty entries first. */
export function validateState(state: unknown): string[] {
  const errors = validateCommonState(state);
  if (!isRecord(state)) return [...new Set(errors)];

  const mainchar = asRecord(state.Mainchar);
  if (mainchar.Mental_state !== undefined) errors.push('Mainchar.Mental_state is deprecated; use Mainchar.Conditions');
  validateConditionCollection(mainchar.Conditions, 'Mainchar.Conditions', 8, errors);

  const narrative = asRecord(state.Narrative);
  if (narrative.Chekhov !== undefined) errors.push('Narrative.Chekhov is retired');
  const npcs = asRecord(narrative.NPCs);
  for (const [id, raw] of Object.entries(npcs)) {
    if (!isRecord(raw)) continue;
    for (const field of ['CurrentThought', 'Mental_state', 'InternalThoughts', 'Thoughts']) {
      if (raw[field] !== undefined) errors.push('Narrative.NPCs.' + id + '.' + field + ' is not a supported persistent field');
    }
    validateAgenda(raw.Agenda, 'Narrative.NPCs.' + id + '.Agenda', errors);
  }

  for (const [id, raw] of Object.entries(asRecord(state.Familiar))) {
    if (!isRecord(raw)) {
      errors.push('Familiar.' + id + ' is not an object');
      continue;
    }
    for (const field of ['CurrentThought', 'Mental_state', 'InternalThoughts', 'Thoughts']) {
      if (raw[field] !== undefined) errors.push('Familiar.' + id + '.' + field + ' is not a supported persistent field');
    }
    validateConditionCollection(raw.Conditions, 'Familiar.' + id + '.Conditions', 8, errors);
    validateConditionCollection(raw.MentalStates, 'Familiar.' + id + '.MentalStates', 2, errors);
    validateInnerThreadCollection(raw.InnerThreads, 'Familiar.' + id + '.InnerThreads', 2, errors);
    validateAgenda(raw.Agenda, 'Familiar.' + id + '.Agenda', errors);
  }

  return [...new Set(errors)];
}

export function assertValidState(state: unknown): asserts state is FFMVUState {
  const errors = validateState(state);
  if (errors.length) throw new Error(errors.join('; '));
}

export function assertValidStateV158(state: unknown): asserts state is LegacyFFMVUState {
  const errors = validateStateV158(state);
  if (errors.length) throw new Error(errors.join('; '));
}
