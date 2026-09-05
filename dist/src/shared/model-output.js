import { isRecord } from './domain/value-utils.js';
import { canonicalStringify } from './hashing.js';
export function extractLastJsonPatch(output) {
    const source = String(output ?? '');
    const openMatches = [...source.matchAll(/<JSONPatch>/gi)];
    const matches = [...source.matchAll(/<JSONPatch>\s*([\s\S]*?)\s*<\/JSONPatch>/gi)];
    if (!openMatches.length)
        return null;
    const lastOpen = source.toLowerCase().lastIndexOf('<jsonpatch>');
    const lastClose = source.toLowerCase().lastIndexOf('</jsonpatch>');
    if (!matches.length || lastOpen > lastClose)
        throw new Error('MALFORMED_JSONPATCH_ENVELOPE');
    const rawPayload = matches.at(-1)[1].trim();
    let parsed;
    try {
        parsed = JSON.parse(rawPayload);
    }
    catch (error) {
        throw new Error('MALFORMED_JSONPATCH_JSON: ' + String(error));
    }
    if (!Array.isArray(parsed))
        throw new Error('JSONPatch must contain an array');
    const operations = parsed.map((value, index) => {
        if (!isRecord(value) || typeof value.op !== 'string' || typeof value.path !== 'string')
            throw new Error('Invalid JSONPatch operation at index ' + index);
        return structuredClone(value);
    });
    return { rawPayload, operations, canonicalPayload: canonicalStringify(operations) };
}
export function resolveFinalJsonPatchEvidence(rawOutput, storedOutput) {
    const stored = extractLastJsonPatch(storedOutput);
    if (rawOutput === undefined)
        return { raw: null, stored, selected: stored };
    const raw = extractLastJsonPatch(rawOutput);
    const rawCanonical = raw?.canonicalPayload ?? null;
    const storedCanonical = stored?.canonicalPayload ?? null;
    if (rawCanonical !== storedCanonical) {
        throw new Error('OUTPUT_PATCH_EVIDENCE_MISMATCH: GENERATION_ENDED and canonical stored JSONPatch differ');
    }
    return { raw, stored, selected: stored ?? raw };
}
//# sourceMappingURL=model-output.js.map