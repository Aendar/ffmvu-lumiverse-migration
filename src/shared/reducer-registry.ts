import type { FFMVUState } from './state-schema.js';
import { CURRENT_REDUCER_VERSION, LEGACY_REDUCER_VERSION } from './state-schema.js';
import { normalizeState, normalizeStateV158 } from './state-normalize.js';
import { validateState, validateStateV158 } from './state-validate.js';

export interface ReducerImplementation {
  readonly version: string;
  normalize(input: unknown): FFMVUState;
  validate(state: unknown): string[];
}

export class ReducerRegistry {
  private readonly implementations = new Map<string, ReducerImplementation>();

  register(implementation: ReducerImplementation): void {
    if (this.implementations.has(implementation.version)) throw new Error('Reducer version already registered: ' + implementation.version);
    this.implementations.set(implementation.version, implementation);
  }

  get(version: string): ReducerImplementation {
    const implementation = this.implementations.get(version);
    if (!implementation) throw new Error('Unknown reducer version: ' + version);
    return implementation;
  }
}

export const legacyReducerV158: ReducerImplementation = {
  version: LEGACY_REDUCER_VERSION,
  normalize: input => normalizeStateV158(input) as unknown as FFMVUState,
  validate: validateStateV158,
};

export const currentReducerV160: ReducerImplementation = {
  version: CURRENT_REDUCER_VERSION,
  normalize: normalizeState,
  validate: validateState,
};

export function createReducerRegistry(): ReducerRegistry {
  const registry = new ReducerRegistry();
  registry.register(legacyReducerV158);
  registry.register(currentReducerV160);
  return registry;
}
