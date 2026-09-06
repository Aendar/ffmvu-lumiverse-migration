import type { FFMVUState } from './state-schema.js';
export interface NarrativeTimestamp {
    date: string;
    time: string;
}
export interface RecentChangesEnvelope {
    observedAt: NarrativeTimestamp;
    Outfit?: Record<string, unknown>;
    Inventory?: Record<string, unknown>;
    Equipment?: Record<string, unknown>;
    Location?: {
        from: string;
        to: string;
    };
    Stats?: Record<string, {
        from: unknown;
        to: unknown;
    }>;
    Relationships?: Record<string, unknown>;
}
export declare function narrativeTimestampFromState(state: FFMVUState): NarrativeTimestamp;
export declare function computeRecentChanges(before: FFMVUState, after: FFMVUState): RecentChangesEnvelope | null;
