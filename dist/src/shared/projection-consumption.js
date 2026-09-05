import { asRecord } from './domain/value-utils.js';
export function computeProjectionConsumptionPatch(state, nextProjection) {
    const operations = [];
    const meta = asRecord(nextProjection.ProjectionMeta);
    if (meta.ChekhovAuditDue === true && state.Narrative.Chekhov.LastAuditTurn !== state.Narrative.Turn) {
        operations.push({ op: 'replace', path: '/Narrative/Chekhov/LastAuditTurn', value: state.Narrative.Turn });
    }
    if (state.Narrative.Scene.Changed !== false)
        operations.push({ op: 'replace', path: '/Narrative/Scene/Changed', value: false });
    return operations;
}
//# sourceMappingURL=projection-consumption.js.map