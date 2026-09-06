const VARIABLE_DYNAMIC_COLLECTION_PATTERNS: readonly (readonly string[])[] = [
  ['World_Calc', 'Factions'],
  ['World_Calc', 'Locations'],
  ['World_Calc', 'Ruins'],
  ['World_Calc', 'Events'],
  ['Mainchar', 'Inventory'],
  ['Mainchar', 'Equipment'],
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
  ['Familiar', '*', 'Equipment'],
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

export function isGuiVariableDynamicCollectionPath(path: readonly string[]): boolean {
  return VARIABLE_DYNAMIC_COLLECTION_PATTERNS.some(pattern =>
    pattern.length === path.length &&
    pattern.every((segment, index) => segment === '*' || segment === path[index])
  );
}
