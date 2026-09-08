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

export function isKnownLabeledTuplePath(path: readonly string[]): boolean {
  if (path.length === 2 && path[0] === 'World') return WORLD_LABELED_FIELDS.has(path[1]);
  if (path.length === 2 && path[0] === 'Mainchar') return CHARACTER_LABELED_FIELDS.has(path[1]);
  if (path.length === 3 && path[0] === 'Familiar') return FAMILIAR_LABELED_FIELDS.has(path[2]);
  return false;
}

export function isLabeledTupleAtPath(path: readonly string[], value: unknown): value is [unknown, string] {
  return isKnownLabeledTuplePath(path) && Array.isArray(value) && value.length >= 2 && typeof value[1] === 'string';
}

export function isKnownOrdinaryArrayPath(path: readonly string[]): boolean {
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
