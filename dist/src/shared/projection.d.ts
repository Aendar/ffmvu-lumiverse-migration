import type { FFMVUState, PromptView } from './state-schema.js';
export interface BuildPromptViewOptions {
    consumeAudit?: boolean;
}
export interface PreparedProjection {
    state: FFMVUState;
    view: PromptView;
}
export declare function buildPromptView(input: unknown, options?: BuildPromptViewOptions): PreparedProjection;
