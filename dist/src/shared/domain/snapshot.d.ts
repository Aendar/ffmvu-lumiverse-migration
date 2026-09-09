import type { FFMVUState } from '../state-schema.js';
import { type ProjectionSeed } from '../../persistence/types.js';
export interface LegacyImportExtraction {
    state: FFMVUState;
    projectionSeed?: ProjectionSeed;
    provenance: Record<string, unknown>;
}
export declare function extractLegacyImport(input: unknown): Promise<LegacyImportExtraction>;
