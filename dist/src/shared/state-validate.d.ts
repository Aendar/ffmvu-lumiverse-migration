import type { FFMVUState } from './state-schema.js';
export declare function validateState(state: unknown): string[];
export declare function assertValidState(state: unknown): asserts state is FFMVUState;
