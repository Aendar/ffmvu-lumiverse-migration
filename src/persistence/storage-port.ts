export interface JsonStoragePort {
  exists(path: string): Promise<boolean>;
  getJson<T>(path: string): Promise<T | null>;
  setJson(path: string, value: unknown): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  delete(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

export class MemoryJsonStorage implements JsonStoragePort {
  private readonly files = new Map<string, unknown>();

  async exists(path: string): Promise<boolean> {
    if (this.files.has(path)) return true;
    const prefix = path.endsWith('/') ? path : path + '/';
    return [...this.files.keys()].some(key => key.startsWith(prefix));
  }

  async getJson<T>(path: string): Promise<T | null> {
    const value = this.files.get(path);
    return value === undefined ? null : structuredClone(value) as T;
  }

  async setJson(path: string, value: unknown): Promise<void> {
    this.files.set(path, structuredClone(value));
  }

  async list(prefix = ''): Promise<string[]> {
    return [...this.files.keys()].filter(path => path.startsWith(prefix)).sort();
  }

  async delete(path: string): Promise<void> {
    this.files.delete(path);
  }

  async mkdir(_path: string): Promise<void> {}
}
