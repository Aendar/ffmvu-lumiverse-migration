import type { LumiLlmMessage } from './spindle-lite.js';
export interface InjectionResult {
    messages: LumiLlmMessage[];
    mode: 'sentinel' | 'block' | 'fallback';
    messageIndex: number;
}
export declare function injectFrozenModelState(input: LumiLlmMessage[], view: unknown): InjectionResult;
