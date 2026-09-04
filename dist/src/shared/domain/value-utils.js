export function clone(value) {
    if (typeof structuredClone === 'function')
        return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}
export function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
export function asRecord(value) {
    return isRecord(value) ? value : {};
}
export function asArray(value) {
    return Array.isArray(value) ? value : [];
}
export function text(value) {
    return value === null || value === undefined ? '' : String(value);
}
export function lower(value) {
    return text(value).trim().toLowerCase();
}
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
}
export function tupleValue(value) {
    return Array.isArray(value) ? value[0] : value;
}
export function uniqueStrings(values) {
    const result = [];
    const seen = new Set();
    for (const value of asArray(values)) {
        if (typeof value !== 'string' || !value.trim() || seen.has(value))
            continue;
        seen.add(value);
        result.push(value);
    }
    return result;
}
export function isLabeledTuple(value) {
    return Array.isArray(value) && value.length >= 2 && typeof value[1] === 'string';
}
//# sourceMappingURL=value-utils.js.map