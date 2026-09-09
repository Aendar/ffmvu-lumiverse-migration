import type { JsonPatchOperation } from './json-patch.js';
import type { FFMVUState, PromptView } from './state-schema.js';
/** v1.6 has no audit subsystem: only clear the one-turn scene-change cache. */
export declare function computeProjectionConsumptionPatch(state: FFMVUState, _nextProjection: PromptView): JsonPatchOperation[];
/** Frozen 1.5.8 behavior for historic commits. */
export declare function computeProjectionConsumptionPatchV158(state: FFMVUState, nextProjection: PromptView): JsonPatchOperation[];
export declare function computeProjectionConsumptionPatchForReducer(reducerVersion: string, state: FFMVUState, nextProjection: PromptView): JsonPatchOperation[];
