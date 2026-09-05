import type { JsonPatchOperation } from './json-patch.js';
export interface ExtractedModelPatch {
    rawPayload: string;
    operations: JsonPatchOperation[];
    canonicalPayload: string;
}
export declare function extractLastJsonPatch(output: string): ExtractedModelPatch | null;
