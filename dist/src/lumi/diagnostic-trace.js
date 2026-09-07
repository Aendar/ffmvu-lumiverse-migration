export class DiagnosticTraceStore {
    limit;
    byUser = new Map();
    constructor(limit = 160) {
        this.limit = limit;
        if (!Number.isInteger(limit) || limit < 1)
            throw new Error('DIAGNOSTIC_TRACE_LIMIT_INVALID');
    }
    append(userId, entry) {
        const key = String(userId);
        const list = this.byUser.get(key) ?? [];
        list.push(structuredClone(entry));
        if (list.length > this.limit)
            list.splice(0, list.length - this.limit);
        this.byUser.set(key, list);
    }
    list(userId) {
        return structuredClone(this.byUser.get(String(userId)) ?? []);
    }
    clear(userId) {
        this.byUser.delete(String(userId));
    }
}
//# sourceMappingURL=diagnostic-trace.js.map