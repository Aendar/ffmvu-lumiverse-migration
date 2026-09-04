import { canonicalHash } from '../shared/hashing.js';
export class ImmutableStore {
    storage;
    constructor(storage) {
        this.storage = storage;
    }
    async put(path, value) {
        const hash = await canonicalHash(value);
        if (await this.storage.exists(path)) {
            const existing = await this.storage.getJson(path);
            if (existing === null)
                throw new Error('Immutable artifact exists but cannot be read: ' + path);
            const existingHash = await canonicalHash(existing);
            if (existingHash !== hash)
                throw new Error('IMMUTABLE_COLLISION: ' + path);
            return hash;
        }
        await this.storage.setJson(path, value);
        return hash;
    }
    async require(path) {
        const value = await this.storage.getJson(path);
        if (value === null)
            throw new Error('Missing immutable artifact: ' + path);
        return value;
    }
}
//# sourceMappingURL=immutable-store.js.map