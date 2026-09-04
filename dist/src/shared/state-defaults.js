import { STATE_SCHEMA_VERSION } from './state-schema.js';
import { clone } from './domain/value-utils.js';
export const DEFAULT_STATE = {
    World_Calc: { Factions: {}, Locations: {}, Ruins: {}, Events: {} },
    World: {
        Date: ['Day 1', 'Date'],
        Time: ['08:00', 'Time'],
        Location: ['Unspecified', 'Location'],
        Weather: ['Clear', 'Weather'],
    },
    Mainchar: {
        Name: ['{{user}}', 'Name'], Image: ['', 'Portrait'], Race: ['Human', 'Race'], Age: ['18', 'Age'],
        Gender: ['Unspecified', 'Gender'], Occupation: ['Adventurer', 'Occupation'], Level: [1, 'Level'],
        Exp: [0, 'Experience'], 'Core-points': [0, 'Unassigned Points'], Mental_state: ['Calm', 'Mental State'],
        Strength: [5, 'Strength'], Agility: [5, 'Agility'], Constitution: [5, 'Constitution'],
        Intelligence: [5, 'Intelligence'], Wisdom: [5, 'Wisdom'], Charisma: [5, 'Charisma'],
        Hp_curr: [41, 'Current HP'], Hp_max: [41, 'Max HP'], Mp_curr: [28, 'Current MP'], Mp_max: [28, 'Max MP'],
        Sta_curr: [76, 'Current Stamina'], Sta_max: [76, 'Max Stamina'],
        Physical_attack: [12, 'Physical Attack'], Physical_defense: [5, 'Physical Defense'],
        Magic_attack: [12, 'Magic Attack'], Magic_defense: [5, 'Magic Defense'], Magic_assist: [10, 'Magic Support'],
        Quests: {}, Skills: {}, Equipment: {}, Inventory: {}, Talents: {},
        Outfit: { Initialized: false, Worn: {}, Wardrobe: {} },
        Real_estate: { Estates: {}, Buildings: {}, Assets: {} }, Buffs: {}, Ailments: {},
        Starting_weapon_request: ['', 'One-shot starting weapon preference'],
        Starting_weapon_status: ['none', 'none | pending | fulfilled'],
    },
    Familiar: {},
    Narrative: {
        Version: '1.0', Turn: 0, NextNpcId: 1,
        NPCs: {}, Relationships: {},
        GM_Notes: { Active: {}, Archive: {} },
        Chekhov: { Active: {}, Archive: {}, AuditEvery: 8, LastAuditTurn: 0 },
        WorldSim: { Threads: {}, Pressures: {}, Archive: {}, LastShift: '' },
        Scene: {
            Focus: '', LastBeat: '', OpenLoops: [], PresentNPCs: [], LocationKey: '',
            RelevantWorldKeys: [], Changed: true,
        },
    },
    MVUStatMenu_DB_Ver: STATE_SCHEMA_VERSION,
    GameStarted: false,
};
export function createDefaultState() {
    return clone(DEFAULT_STATE);
}
//# sourceMappingURL=state-defaults.js.map