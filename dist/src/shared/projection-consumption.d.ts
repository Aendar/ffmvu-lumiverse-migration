import type { JsonPatchOperation } from './json-patch.js';
import type { FFMVUState, PromptView } from './state-schema.js';
export declare function computeProjectionConsumptionPatch(state: FFMVUState, nextProjection: PromptView): JsonPatchOperation[];
