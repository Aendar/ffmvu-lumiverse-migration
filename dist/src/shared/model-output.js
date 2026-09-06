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
function extractJsonPatchSpans(output) {
    const source = String(output ?? '');
    const openMatches = [...source.matchAll(/<JSONPatch>/gi)];
    if (!openMatches.length)
        return [];
    const lastOpen = source.toLowerCase().lastIndexOf('<jsonpatch>');
    const lastClose = source.toLowerCase().lastIndexOf('</jsonpatch>');
    if (lastClose < lastOpen)
        throw new Error('MALFORMED_JSONPATCH_ENVELOPE');
    const result = [];
    for (const match of source.matchAll(/<JSONPatch>\s*([\s\S]*?)\s*<\/JSONPatch>/gi)) {
        const start = match.index ?? -1;
        if (start < 0)
            continue;
        const rawPayload = match[1].trim();
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
        result.push({
            rawPayload,
            operations,
            canonicalPayload: canonicalStringify(operations),
            start,
            end: start + match[0].length,
        });
    }
    if (!result.length)
        throw new Error('MALFORMED_JSONPATCH_ENVELOPE');
    return result;
}
export function resolveContinueJsonPatchEvidence(preStoredOutput, generationEndedContent, storedOutput) {
    const pre = String(preStoredOutput ?? '');
    const stored = String(storedOutput ?? '');
    if (!stored.startsWith(pre))
        throw new Error('CONTINUE_PREFIX_MISMATCH: stored message no longer extends the frozen pre-Continue text');
    const appendedSegment = stored.slice(pre.length);
    let hostContentMode = 'unavailable';
    if (generationEndedContent !== undefined) {
        const raw = String(generationEndedContent);
        if (raw === stored)
            hostContentMode = 'full';
        else if (raw === appendedSegment)
            hostContentMode = 'segment';
        else
            throw new Error('OUTPUT_PATCH_EVIDENCE_MISMATCH: Continue lifecycle content matches neither full stored message nor exact appended segment');
    }
    const spans = extractJsonPatchSpans(stored);
    const newlyCompleted = spans.filter(item => item.end > pre.length);
    const selectedSpan = newlyCompleted.at(-1) ?? null;
    return {
        appendedSegment,
        hostContentMode,
        selected: selectedSpan ? {
            rawPayload: selectedSpan.rawPayload,
            operations: structuredClone(selectedSpan.operations),
            canonicalPayload: selectedSpan.canonicalPayload,
        } : null,
        selectedCrossesBoundary: selectedSpan ? selectedSpan.start < pre.length : false,
    };
}
//# sourceMappingURL=model-output.js.map