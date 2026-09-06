import type { JsonPatchOperation } from './json-patch.js';
export interface ExtractedModelPatch {
    rawPayload: string;
    operations: JsonPatchOperation[];
    canonicalPayload: string;
}
export declare function extractLastJsonPatch(output: string): ExtractedModelPatch | null;
export interface FinalJsonPatchEvidence {
    raw: ExtractedModelPatch | null;
    stored: ExtractedModelPatch | null;
    selected: ExtractedModelPatch | null;
}
export declare function resolveFinalJsonPatchEvidence(rawOutput: string | undefined, storedOutput: string): FinalJsonPatchEvidence;
export interface ContinueJsonPatchEvidence {
    appendedSegment: string;
    hostContentMode: 'full' | 'segment' | 'unavailable';
    selected: ExtractedModelPatch | null;
    selectedCrossesBoundary: boolean;
}
export declare function resolveContinueJsonPatchEvidence(preStoredOutput: string, generationEndedContent: string | undefined, storedOutput: string): ContinueJsonPatchEvidence;
