import { CURRENT_REDUCER_VERSION, LEGACY_REDUCER_VERSION, V160_REDUCER_VERSION } from './state-schema.js';
import { normalizeState, normalizeStateV158, normalizeStateV160 } from './state-normalize.js';
import { validateState, validateStateV158, validateStateV160 } from './state-validate.js';
export class ReducerRegistry {
    implementations = new Map();
    register(implementation) {
        if (this.implementations.has(implementation.version))
            throw new Error('Reducer version already registered: ' + implementation.version);
        this.implementations.set(implementation.version, implementation);
    }
    get(version) {
        const implementation = this.implementations.get(version);
        if (!implementation)
            throw new Error('Unknown reducer version: ' + version);
        return implementation;
    }
}
export const legacyReducerV158 = {
    version: LEGACY_REDUCER_VERSION,
    normalize: input => normalizeStateV158(input),
    validate: validateStateV158,
};
/** Frozen 1.6 implementation for existing journal nodes. */
export const reducerV160 = {
    version: V160_REDUCER_VERSION,
    normalize: normalizeStateV160,
    validate: validateStateV160,
};
export const currentReducerV170 = {
    version: CURRENT_REDUCER_VERSION,
    normalize: normalizeState,
    validate: validateState,
};
export function createReducerRegistry() {
    const registry = new ReducerRegistry();
    registry.register(legacyReducerV158);
    registry.register(reducerV160);
    registry.register(currentReducerV170);
    return registry;
}
//# sourceMappingURL=reducer-registry.js.map