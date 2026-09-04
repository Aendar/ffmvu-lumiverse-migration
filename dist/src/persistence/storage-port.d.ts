export interface JsonStoragePort {
    exists(path: string): Promise<boolean>;
    getJson<T>(path: string): Promise<T | null>;
    setJson(path: string, value: unknown): Promise<void>;
    list(prefix?: string): Promise<string[]>;
    delete(path: string): Promise<void>;
    mkdir(path: string): Promise<void>;
}
export declare class MemoryJsonStorage implements JsonStoragePort {
    private readonly files;
    exists(path: string): Promise<boolean>;
    getJson<T>(path: string): Promise<T | null>;
    setJson(path: string, value: unknown): Promise<void>;
    list(prefix?: string): Promise<string[]>;
    delete(path: string): Promise<void>;
    mkdir(_path: string): Promise<void>;
}
