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
    list(prefix) { return this.api.list(prefix, this.userId); }
    delete(path) { return this.api.delete(path, this.userId); }
    mkdir(path) { return this.api.mkdir(path, this.userId); }
}
//# sourceMappingURL=user-storage-adapter.js.map