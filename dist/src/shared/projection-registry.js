import { CURRENT_PROJECTION_VERSION, LEGACY_PROJECTION_VERSION } from './state-schema.js';
import { buildPromptView, buildPromptViewV158 } from './projection.js';
export class ProjectionRegistry {
    implementations = new Map();
    register(implementation) {
        if (this.implementations.has(implementation.version))
            throw new Error('Projection version already registered: ' + implementation.version);
        this.implementations.set(implementation.version, implementation);
    }
    get(version) {
        const implementation = this.implementations.get(version);
        if (!implementation)
            throw new Error('Unknown projection version: ' + version);
        return implementation;
    }
}
export const legacyProjectionV158 = {
    version: LEGACY_PROJECTION_VERSION,
    build: state => buildPromptViewV158(state, { consumeAudit: false }).view,
};
export const currentProjectionV160 = {
    version: CURRENT_PROJECTION_VERSION,
    build: state => buildPromptView(state, { consumeAudit: false }).view,
};
export function createProjectionRegistry() {
    const registry = new ProjectionRegistry();
    registry.register(legacyProjectionV158);
    registry.register(currentProjectionV160);
    return registry;
}
//# sourceMappingURL=projection-registry.js.map