export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type MutableRecord = Record<string, unknown>;

export type LabeledValue<T = unknown> = [T, string];
export type StateSeverity = 'low' | 'moderate' | 'high';
export type StateStatus = 'active' | 'resolved';

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

export interface ConditionEntry extends MutableRecord {
  State: string;
  Severity: StateSeverity;
  Cause?: string;
  ClearWhen?: string;
  Status: StateStatus;
  LastTouchedTurn?: number;
}

export interface InnerThreadEntry extends MutableRecord {
  Subject: string;
  Stance: string;
  Tension: string;
  Status: StateStatus;
  LastTouchedTurn?: number;
}

export interface AgendaState extends MutableRecord {
  CurrentGoal?: string;
  NextAction?: string;
  Deadline?: string;
  Location?: string;
  Pressure?: string;
  Status: StateStatus;
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
  Conditions: Record<string, ConditionEntry>;
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

export interface FamiliarMemberState extends MutableRecord {
  /** Legacy fixtures may omit these; the v1.6 normalizer always supplies them. */
  Outfit?: OutfitState;
  Conditions?: Record<string, ConditionEntry>;
  MentalStates?: Record<string, ConditionEntry>;
  InnerThreads?: Record<string, InnerThreadEntry>;
  Agenda?: AgendaState;
}

export interface SceneState extends MutableRecord {
  Focus: string;
  LastBeat: string;
  OpenLoops: string[];
  PresentNPCs: string[];
  LocationKey: string;
  RelevantWorldKeys: string[];
  Changed: boolean;
  HPH?: MutableRecord;
}

export interface NarrativeState extends MutableRecord {
  Version: string;
  Turn: number;
  NextNpcId: number;
  NPCs: MutableRecord;
  Relationships: MutableRecord;
  GM_Notes: { Active: MutableRecord; Archive: MutableRecord } & MutableRecord;
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
  Familiar: Record<string, FamiliarMemberState>;
  Narrative: NarrativeState;
  MVUStatMenu_DB_Ver: string;
  GameStarted: boolean;
}

export interface LegacyMainCharacterState extends Omit<MainCharacterState, 'Conditions'> {
  Mental_state: LabeledValue<string>;
}

export interface LegacyNarrativeState extends MutableRecord {
  Version: string;
  Turn: number;
  NextNpcId: number;
  NPCs: MutableRecord;
  Relationships: MutableRecord;
  GM_Notes: { Active: MutableRecord; Archive: MutableRecord } & MutableRecord;
  Chekhov: { Active: MutableRecord; Archive: MutableRecord; AuditEvery: number; LastAuditTurn: number } & MutableRecord;
  WorldSim: NarrativeState['WorldSim'];
  Scene: SceneState;
}

export interface LegacyFFMVUState extends Omit<FFMVUState, 'Mainchar' | 'Familiar' | 'Narrative'> {
  Mainchar: LegacyMainCharacterState;
  Familiar: MutableRecord;
  Narrative: LegacyNarrativeState;
}

export type PromptView = MutableRecord;

export const STATE_SCHEMA_VERSION = 'FFMVU-1.6.0';
export const LEGACY_REDUCER_VERSION = 'FFMVU-1.5.8';
export const LEGACY_PROJECTION_VERSION = 'FFMVU-1.5.8';
export const CURRENT_REDUCER_VERSION = 'FFMVU-1.6.0';
export const CURRENT_PROJECTION_VERSION = 'FFMVU-1.6.0';

export const REQUIRED_WORLD_TUPLES = ['Date', 'Time', 'Location', 'Weather'] as const;
export const REQUIRED_MAINCHAR_TUPLES = [
  'Name', 'Age', 'Gender', 'Race', 'Occupation', 'Level',
  'Strength', 'Agility', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma',
] as const;
