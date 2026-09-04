import type { FFMVUState } from './state-schema.js';
export interface ReducerImplementation {
    readonly version: string;
    normalize(input: unknown): FFMVUState;
    validate(state: unknown): string[];
}
export declare class ReducerRegistry {
    private readonly implementations;
    register(implementation: ReducerImplementation): void;
    get(version: string): ReducerImplementation;
}
export declare const legacyReducerV158: ReducerImplementation;
export declare function createReducerRegistry(): ReducerRegistry;
