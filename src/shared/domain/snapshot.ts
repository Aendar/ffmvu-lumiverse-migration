import { canonicalHash } from '../hashing.js';
import { normalizeState } from '../state-normalize.js';
import { validateState } from '../state-validate.js';
import { LEGACY_PROJECTION_VERSION } from '../state-schema.js';
import type { FFMVUState, PromptView } from '../state-schema.js';
import { isRecord } from './value-utils.js';
import { PORTABLE_SNAPSHOT_FORMAT, type ProjectionSeed } from '../../persistence/types.js';

export interface LegacyImportExtraction {
  state: FFMVUState;
  projectionSeed?: ProjectionSeed;
  provenance: Record<string, unknown>;
}

export async function extractLegacyImport(input: unknown): Promise<LegacyImportExtraction> {
  if (!isRecord(input)) throw new Error('LEGACY_IMPORT_NOT_OBJECT');
  if (input.format === PORTABLE_SNAPSHOT_FORMAT) throw new Error('LEGACY_IMPORT_PORTABLE_SNAPSHOT_USE_NATIVE_IMPORT');
  const wrappedState = isRecord(input.stat_data) ? input.stat_data : input;
  const state = normalizeState(wrappedState);
  const errors = validateState(state);
  if (errors.length) throw new Error('LEGACY_IMPORT_INVALID_STATE: ' + errors.join('; '));

  let projectionSeed: ProjectionSeed | undefined;
  if (isRecord(input.ff_mvu_prompt_view)) {
    const projection = structuredClone(input.ff_mvu_prompt_view) as PromptView;
    projectionSeed = {
      projectionVersion: LEGACY_PROJECTION_VERSION,
      promptProtocolVersion: 'ffmvu-model-state-v1',
      projection,
      promptViewHash: await canonicalHash(projection),
      provenance: 'legacy-exact',
    };
  }

  const provenance: Record<string, unknown> = {
    source: 'legacy-mvu-import',
    importedVersion: String((wrappedState as Record<string, unknown>).MVUStatMenu_DB_Ver ?? ''),
  };
  if (isRecord(input.ff_mvu_snapshot_meta)) provenance.legacySnapshotMeta = structuredClone(input.ff_mvu_snapshot_meta);
  if (input.initialized_lorebooks !== undefined) provenance.initializedLorebooksPresent = true;

  return { state, ...(projectionSeed ? { projectionSeed } : {}), provenance };
}
