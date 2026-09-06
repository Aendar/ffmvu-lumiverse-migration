import { canonicalHash } from '../hashing.js';
import { normalizeState } from '../state-normalize.js';
import { validateState } from '../state-validate.js';
import { LEGACY_PROJECTION_VERSION } from '../state-schema.js';
import { isRecord } from './value-utils.js';
export async function extractLegacyImport(input) {
    if (!isRecord(input))
        throw new Error('LEGACY_IMPORT_NOT_OBJECT');
    const wrappedState = isRecord(input.stat_data) ? input.stat_data : input;
    const state = normalizeState(wrappedState);
    const errors = validateState(state);
    if (errors.length)
        throw new Error('LEGACY_IMPORT_INVALID_STATE: ' + errors.join('; '));
    let projectionSeed;
    if (isRecord(input.ff_mvu_prompt_view)) {
        const projection = structuredClone(input.ff_mvu_prompt_view);
        projectionSeed = {
            projectionVersion: LEGACY_PROJECTION_VERSION,
            promptProtocolVersion: 'ffmvu-model-state-v1',
            projection,
            promptViewHash: await canonicalHash(projection),
            provenance: 'legacy-exact',
        };
    }
    const provenance = {
        source: 'legacy-mvu-import',
        importedVersion: String(wrappedState.MVUStatMenu_DB_Ver ?? ''),
    };
    if (isRecord(input.ff_mvu_snapshot_meta))
        provenance.legacySnapshotMeta = structuredClone(input.ff_mvu_snapshot_meta);
    if (input.initialized_lorebooks !== undefined)
        provenance.initializedLorebooksPresent = true;
    return { state, ...(projectionSeed ? { projectionSeed } : {}), provenance };
}
//# sourceMappingURL=snapshot.js.map