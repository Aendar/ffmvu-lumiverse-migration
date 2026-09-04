import type { FFMVUState, PromptView } from './state-schema.js';
import { LEGACY_PROJECTION_VERSION } from './state-schema.js';
import { buildPromptView } from './projection.js';

export interface ProjectionImplementation {
  readonly version: string;
  build(state: FFMVUState): PromptView;
}

export class ProjectionRegistry {
  private readonly implementations = new Map<string, ProjectionImplementation>();

  register(implementation: ProjectionImplementation): void {
    if (this.implementations.has(implementation.version)) throw new Error('Projection version already registered: ' + implementation.version);
    this.implementations.set(implementation.version, implementation);
  }

  get(version: string): ProjectionImplementation {
    const implementation = this.implementations.get(version);
    if (!implementation) throw new Error('Unknown projection version: ' + version);
    return implementation;
  }
}

export const legacyProjectionV158: ProjectionImplementation = {
  version: LEGACY_PROJECTION_VERSION,
  build: state => buildPromptView(state, { consumeAudit: false }).view,
};

export function createProjectionRegistry(): ProjectionRegistry {
  const registry = new ProjectionRegistry();
  registry.register(legacyProjectionV158);
  return registry;
}
