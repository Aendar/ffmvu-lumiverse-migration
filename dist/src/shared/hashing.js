import { isRecord } from './domain/value-utils.js';
export function canonicalStringify(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            throw new Error('Non-finite number is not canonical JSON');
        return JSON.stringify(value);
    }
    if (Array.isArray(value))
        return '[' + value.map(canonicalStringify).join(',') + ']';
    if (isRecord(value)) {
        const keys = Object.keys(value).sort();
        return '{' + keys.map(key => JSON.stringify(key) + ':' + canonicalStringify(value[key])).join(',') + '}';
    }
    throw new Error('Non-JSON value cannot be canonicalized');
}
export async function sha256Hex(value) {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function canonicalHash(value) {
    return sha256Hex(canonicalStringify(value));
}
//# sourceMappingURL=hashing.js.map