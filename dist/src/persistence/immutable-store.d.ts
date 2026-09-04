import type { JsonStoragePort } from './storage-port.js';
export declare class ImmutableStore {
    private readonly storage;
    constructor(storage: JsonStoragePort);
    put(path: string, value: unknown): Promise<string>;
    require<T>(path: string): Promise<T>;
}
