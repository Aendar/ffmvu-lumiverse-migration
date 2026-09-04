export function createId(prefix) {
    const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
    if (!randomUUID)
        throw new Error('crypto.randomUUID() is required');
    return `${prefix}_${randomUUID()}`;
}
export function isoNow() {
    return new Date().toISOString();
}
//# sourceMappingURL=ids.js.map