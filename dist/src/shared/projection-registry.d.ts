import type { FFMVUState, PromptView } from './state-schema.js';
export interface ProjectionImplementation {
    readonly version: string;
    build(state: FFMVUState): PromptView;
}
export declare class ProjectionRegistry {
    private readonly implementations;
    register(implementation: ProjectionImplementation): void;
    get(version: string): ProjectionImplementation;
}
export declare const legacyProjectionV158: ProjectionImplementation;
export declare function createProjectionRegistry(): ProjectionRegistry;
