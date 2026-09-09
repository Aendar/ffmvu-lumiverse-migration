import type { FFMVUState, LegacyFFMVUState } from './state-schema.js';
/** Exact legacy structural validation used when replaying 1.5.8 commits. */
export declare function validateStateV158(state: unknown): string[];
/** Current state validation. Normalization removes resolved and empty entries first. */
export declare function validateState(state: unknown): string[];
export declare function assertValidState(state: unknown): asserts state is FFMVUState;
export declare function assertValidStateV158(state: unknown): asserts state is LegacyFFMVUState;
