export class MemoryJsonStorage {
    files = new Map();
    async exists(path) {
        if (this.files.has(path))
            return true;
        const prefix = path.endsWith('/') ? path : path + '/';
        return [...this.files.keys()].some(key => key.startsWith(prefix));
    }
    async getJson(path) {
        const value = this.files.get(path);
        return value === undefined ? null : structuredClone(value);
    }
    async setJson(path, value) {
        this.files.set(path, structuredClone(value));
    }
    async list(prefix = '') {
        return [...this.files.keys()].filter(path => path.startsWith(prefix)).sort();
    }
    async delete(path) {
        this.files.delete(path);
    }
    async mkdir(_path) { }
}
//# sourceMappingURL=storage-port.js.map