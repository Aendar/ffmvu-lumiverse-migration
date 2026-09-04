import type { JsonStoragePort } from '../persistence/storage-port.js';
import type { UserStorageApi } from './spindle-lite.js';

export class UserStorageJsonAdapter implements JsonStoragePort {
  constructor(private readonly api: UserStorageApi, private readonly userId: string) {}
  exists(path: string): Promise<boolean> { return this.api.exists(path, this.userId); }
  getJson<T>(path: string): Promise<T | null> { return this.api.getJson<T | null>(path, { fallback: null, userId: this.userId }); }
  setJson(path: string, value: unknown): Promise<void> { return this.api.setJson(path, value, { userId: this.userId }); }
  async list(prefix = ''): Promise<string[]> {
    const entries = await this.api.list(prefix || undefined, this.userId);
    if (!prefix) return entries;
    const normalizedPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
    return entries.map(entry => {
      const clean = String(entry).replace(/^\/+/, '');
      return clean.startsWith(normalizedPrefix) ? clean : normalizedPrefix + clean;
    });
  }
  delete(path: string): Promise<void> { return this.api.delete(path, this.userId); }
  mkdir(path: string): Promise<void> { return this.api.mkdir(path, this.userId); }
}
