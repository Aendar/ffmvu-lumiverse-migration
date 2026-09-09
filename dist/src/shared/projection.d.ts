import type { FFMVUState, PromptView } from './state-schema.js';
export interface BuildPromptViewOptions {
    consumeAudit?: boolean;
}
export interface PreparedProjection {
    state: FFMVUState;
    view: PromptView;
}
/** Current v1.6 projection: no Chekhov or generic NPC thought store. */
export declare function buildPromptView(input: unknown, options?: BuildPromptViewOptions): PreparedProjection;
/** Frozen v1.5.8 projection, retained so historic commits replay byte-for-byte. */
export declare function buildPromptViewV158(input: unknown, options?: BuildPromptViewOptions): PreparedProjection;
