import type { JsonStoragePort } from '../persistence/storage-port.js';
import type { UserStorageApi } from './spindle-lite.js';

export class UserStorageJsonAdapter implements JsonStoragePort {
  constructor(private readonly api: UserStorageApi, private readonly userId: string) {}
  exists(path: string): Promise<boolean> { return this.api.exists(path, this.userId); }
  getJson<T>(path: string): Promise<T | null> { return this.api.getJson<T | null>(path, { fallback: null, userId: this.userId }); }
  setJson(path: string, value: unknown): Promise<void> { return this.api.setJson(path, value, { userId: this.userId }); }
  list(prefix?: string): Promise<string[]> { return this.api.list(prefix, this.userId); }
  delete(path: string): Promise<void> { return this.api.delete(path, this.userId); }
  mkdir(path: string): Promise<void> { return this.api.mkdir(path, this.userId); }
}
