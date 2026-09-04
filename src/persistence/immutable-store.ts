import { canonicalHash } from '../shared/hashing.js';
import type { JsonStoragePort } from './storage-port.js';

export class ImmutableStore {
  constructor(private readonly storage: JsonStoragePort) {}

  async put(path: string, value: unknown): Promise<string> {
    const hash = await canonicalHash(value);
    if (await this.storage.exists(path)) {
      const existing = await this.storage.getJson<unknown>(path);
      if (existing === null) throw new Error('Immutable artifact exists but cannot be read: ' + path);
      const existingHash = await canonicalHash(existing);
      if (existingHash !== hash) throw new Error('IMMUTABLE_COLLISION: ' + path);
      return hash;
    }
    await this.storage.setJson(path, value);
    return hash;
  }

  async require<T>(path: string): Promise<T> {
    const value = await this.storage.getJson<T>(path);
    if (value === null) throw new Error('Missing immutable artifact: ' + path);
    return value;
  }
}
