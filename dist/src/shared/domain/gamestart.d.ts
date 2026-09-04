import type { FFMVUState } from '../state-schema.js';
export interface GameStartStats {
    str: number;
    agi: number;
    con: number;
    int: number;
    wis: number;
}
export interface GameStartPayload {
    date: string;
    time: string;
    weather: string;
    location: string;
    name: string;
    age: string;
    gender: string;
    race: string;
    occupation: string;
    mental: string;
    charisma: number;
    level: number;
    exp: number;
    core: number;
    weaponRequest: string;
    stats: GameStartStats;
}
export declare function normalizeClock(value: unknown): string | null;
export declare function validateGameStartPayload(payload: GameStartPayload): string[];
export declare function applyGameStartPayload(inputState: FFMVUState, payloadInput: GameStartPayload): FFMVUState;
