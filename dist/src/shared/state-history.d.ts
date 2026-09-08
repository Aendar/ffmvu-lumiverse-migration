import type { FFMVUState } from './state-schema.js';
import type { NarrativeTimestamp } from './recent-changes.js';
export type StateHistoryScalar = string | number | boolean | null;
export interface StateHistoryChange {
    turn: number;
    from: StateHistoryScalar;
    to: StateHistoryScalar;
}
export interface StateHistoryTrack {
    path: string;
    label?: string;
    current: StateHistoryScalar;
    changes: StateHistoryChange[];
}
export interface RecentStateHistoryEnvelope {
    observedAt: NarrativeTimestamp;
    currentTurn: number;
    tracks: StateHistoryTrack[];
}
export interface StateHistoryOptions {
    maxTracks?: number;
    maxChangesPerPath?: number;
}
export declare function computeRecentStateHistory(states: readonly FFMVUState[], options?: StateHistoryOptions): RecentStateHistoryEnvelope | null;
