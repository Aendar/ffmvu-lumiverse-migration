export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type MutableRecord = Record<string, unknown>;

export type LabeledValue<T = unknown> = [T, string];

export interface WorldState extends MutableRecord {
  Date: LabeledValue<string>;
  Time: LabeledValue<string>;
  Location: LabeledValue<string>;
  Weather: LabeledValue<string>;
}

export interface OutfitState extends MutableRecord {
  Initialized: boolean;
  Worn: MutableRecord;
  Wardrobe: MutableRecord;
}

export interface MainCharacterState extends MutableRecord {
  Name: LabeledValue<string>;
  Image: LabeledValue<string>;
  Race: LabeledValue<string>;
  Age: LabeledValue<string>;
  Gender: LabeledValue<string>;
  Occupation: LabeledValue<string>;
  Level: LabeledValue<number>;
  Exp: LabeledValue<number>;
  'Core-points': LabeledValue<number>;
  Mental_state: LabeledValue<string>;
  Strength: LabeledValue<number>;
  Agility: LabeledValue<number>;
  Constitution: LabeledValue<number>;
  Intelligence: LabeledValue<number>;
  Wisdom: LabeledValue<number>;
  Charisma: LabeledValue<number>;
  Hp_curr: LabeledValue<number>;
  Hp_max: LabeledValue<number>;
  Mp_curr: LabeledValue<number>;
  Mp_max: LabeledValue<number>;
  Sta_curr: LabeledValue<number>;
  Sta_max: LabeledValue<number>;
  Physical_attack: LabeledValue<number>;
  Physical_defense: LabeledValue<number>;
  Magic_attack: LabeledValue<number>;
  Magic_defense: LabeledValue<number>;
  Magic_assist: LabeledValue<number>;
  Quests: MutableRecord;
  Skills: MutableRecord;
  Equipment: MutableRecord;
  Inventory: MutableRecord;
  Talents: MutableRecord;
  Outfit: OutfitState;
  Real_estate: MutableRecord;
  Buffs: MutableRecord;
  Ailments: MutableRecord;
  Starting_weapon_request: LabeledValue<string>;
  Starting_weapon_status: LabeledValue<string>;
}

export interface SceneState extends MutableRecord {
  Focus: string;
  LastBeat: string;
  OpenLoops: string[];
  PresentNPCs: string[];
  LocationKey: string;
  RelevantWorldKeys: string[];
  Changed: boolean;
}

export interface NarrativeState extends MutableRecord {
  Version: string;
  Turn: number;
  NextNpcId: number;
  NPCs: MutableRecord;
  Relationships: MutableRecord;
  GM_Notes: { Active: MutableRecord; Archive: MutableRecord } & MutableRecord;
  Chekhov: { Active: MutableRecord; Archive: MutableRecord; AuditEvery: number; LastAuditTurn: number } & MutableRecord;
  WorldSim: { Threads: MutableRecord; Pressures: MutableRecord; Archive: MutableRecord; LastShift: string } & MutableRecord;
  Scene: SceneState;
}

export interface FFMVUState extends MutableRecord {
  World_Calc: {
    Factions: MutableRecord;
    Locations: MutableRecord;
    Ruins: MutableRecord;
    Events: MutableRecord;
  } & MutableRecord;
  World: WorldState;
  Mainchar: MainCharacterState;
  Familiar: MutableRecord;
  Narrative: NarrativeState;
  MVUStatMenu_DB_Ver: string;
  GameStarted: boolean;
}

export type PromptView = MutableRecord;

export const STATE_SCHEMA_VERSION = 'FFMVU-1.5.8';
export const LEGACY_REDUCER_VERSION = 'FFMVU-1.5.8';
export const LEGACY_PROJECTION_VERSION = 'FFMVU-1.5.8';

export const REQUIRED_WORLD_TUPLES = ['Date', 'Time', 'Location', 'Weather'] as const;
export const REQUIRED_MAINCHAR_TUPLES = [
  'Name', 'Age', 'Gender', 'Race', 'Occupation', 'Level',
  'Strength', 'Agility', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma',
] as const;
