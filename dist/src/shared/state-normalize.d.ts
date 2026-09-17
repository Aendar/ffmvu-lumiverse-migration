import type { FFMVUState, LegacyFFMVUState } from './state-schema.js';
export declare function normalizeStateV158(input: unknown): LegacyFFMVUState;
/** Frozen 1.6 normalization, retained exactly for historic replay. */
export declare function normalizeStateV160(input: unknown): FFMVUState;
/** Current 1.7 normalization: general physiology is persistent; HPH is geometry only. */
export declare function normalizeState(input: unknown): FFMVUState;
