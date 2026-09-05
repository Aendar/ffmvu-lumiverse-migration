export class UserStorageJsonAdapter {
    api;
    userId;
    constructor(api, userId) {
        this.api = api;
        this.userId = userId;
    }
    exists(path) { return this.api.exists(path, this.userId); }
    getJson(path) { return this.api.getJson(path, { fallback: null, userId: this.userId }); }
    setJson(path, value) { return this.api.setJson(path, value, { userId: this.userId }); }
    async list(prefix = '') {
        const entries = await this.api.list(prefix || undefined, this.userId);
        if (!prefix)
            return entries;
        const normalizedPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
        return entries.map(entry => {
            const clean = String(entry).replace(/^\/+/, '');
            return clean.startsWith(normalizedPrefix) ? clean : normalizedPrefix + clean;
        });
    }
    delete(path) { return this.api.delete(path, this.userId); }
    mkdir(path) { return this.api.mkdir(path, this.userId); }
}
//# sourceMappingURL=user-storage-adapter.js.map