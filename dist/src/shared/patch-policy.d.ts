import type { JsonPatchOperation } from './json-patch.js';
import type { FFMVUState, PromptView } from './state-schema.js';
export declare const MODEL_PATCH_AUTHORIZATION_VERSION = "ffmvu-model-auth-v1";
export interface ModelPatchAuthorizationView {
    version: typeof MODEL_PATCH_AUTHORIZATION_VERSION;
    worldCalc: Record<'Factions' | 'Locations' | 'Ruins' | 'Events', string[]>;
    familiarIds: string[];
    npcIds: string[];
    relationshipIds: string[];
    gmNoteIds: string[];
    chekhovIds: string[];
    worldSimThreadIds: string[];
    worldSimPressureIds: string[];
    nextNpcId: number;
}
export declare function buildModelPatchAuthorizationView(view: PromptView): ModelPatchAuthorizationView;
export declare function assertModelPatchAuthorization(baseState: FFMVUState, operations: readonly JsonPatchOperation[], authorization: ModelPatchAuthorizationView): void;
