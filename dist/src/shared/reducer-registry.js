import { LEGACY_REDUCER_VERSION } from './state-schema.js';
import { normalizeState } from './state-normalize.js';
import { validateState } from './state-validate.js';
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
    normalize: normalizeState,
    validate: validateState,
};
export function createReducerRegistry() {
    const registry = new ReducerRegistry();
    registry.register(legacyReducerV158);
    return registry;
}
//# sourceMappingURL=reducer-registry.js.map