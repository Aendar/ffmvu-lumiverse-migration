import type { FFMVUState, MutableRecord } from '../shared/state-schema.js';
import type { GuiOwnerRef } from '../shared/domain/gui-intents.js';
export interface StatusOwner {
    id: string;
    label: string;
    ref: GuiOwnerRef;
    record: MutableRecord;
}
export interface StatusItem {
    key: string;
    name: string;
    qty: number | null;
    record: MutableRecord;
    equippable: boolean;
}
export interface HphOverview {
    bladder: number | null;
    arousal: number | null;
    erection: number | null;
    semenMl: number | null;
    semenCapacityMl: number | null;
    lengthCm: number | null;
    girthCm: number | null;
}
export declare function statusTupleValue(value: unknown): unknown;
export declare function statusText(value: unknown, fallback?: string): string;
export declare function statusNumber(value: unknown): number | null;
export declare function statusPath(root: unknown, path: string): unknown;
export declare function statusOwners(state: FFMVUState): StatusOwner[];
export declare function statusOwnerById(state: FFMVUState, id: string): StatusOwner;
export declare function statusItems(record: unknown): StatusItem[];
export declare function statusHphOverview(state: FFMVUState): HphOverview | null;
export declare function statusCoreBudget(values: {
    str: number;
    agi: number;
    con: number;
    int: number;
    wis: number;
}): {
    spent: number;
    remaining: number;
    valid: boolean;
};
export declare function statusCompactObject(value: unknown, maxEntries?: number): Array<[string, string]>;
