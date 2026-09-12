import type { FFMVUState, PromptView } from './state-schema.js';
export interface BuildPromptViewOptions {
    consumeAudit?: boolean;
}
export interface PreparedProjection {
    state: FFMVUState;
    view: PromptView;
}
/** Frozen 1.6 projection for existing journal nodes. */
export declare function buildPromptViewV160(input: unknown, options?: BuildPromptViewOptions): PreparedProjection;
/** Current 1.7 projection. */
export declare function buildPromptView(input: unknown, options?: BuildPromptViewOptions): PreparedProjection;
/** Frozen v1.5.8 projection, retained so historic commits replay byte-for-byte. */
export declare function buildPromptViewV158(input: unknown, options?: BuildPromptViewOptions): PreparedProjection;
