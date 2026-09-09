import { LEGACY_REDUCER_VERSION } from './state-schema.js';
import { asRecord } from './domain/value-utils.js';
/** v1.6 has no audit subsystem: only clear the one-turn scene-change cache. */
export function computeProjectionConsumptionPatch(state, _nextProjection) {
    if (state.Narrative.Scene.Changed === false)
        return [];
    return [{ op: 'replace', path: '/Narrative/Scene/Changed', value: false }];
}
/** Frozen 1.5.8 behavior for historic commits. */
export function computeProjectionConsumptionPatchV158(state, nextProjection) {
    const operations = [];
    const meta = asRecord(nextProjection.ProjectionMeta);
    const narrative = state.Narrative;
    const chekhov = asRecord(narrative.Chekhov);
    if (meta.ChekhovAuditDue === true && Number(chekhov.LastAuditTurn) !== state.Narrative.Turn) {
        operations.push({ op: 'replace', path: '/Narrative/Chekhov/LastAuditTurn', value: state.Narrative.Turn });
    }
    if (state.Narrative.Scene.Changed !== false)
        operations.push({ op: 'replace', path: '/Narrative/Scene/Changed', value: false });
    return operations;
}
export function computeProjectionConsumptionPatchForReducer(reducerVersion, state, nextProjection) {
    return reducerVersion === LEGACY_REDUCER_VERSION
        ? computeProjectionConsumptionPatchV158(state, nextProjection)
        : computeProjectionConsumptionPatch(state, nextProjection);
}
//# sourceMappingURL=projection-consumption.js.map