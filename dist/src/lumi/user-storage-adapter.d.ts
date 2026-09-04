import type { JsonStoragePort } from '../persistence/storage-port.js';
import type { UserStorageApi } from './spindle-lite.js';
export declare class UserStorageJsonAdapter implements JsonStoragePort {
    private readonly api;
    private readonly userId;
    constructor(api: UserStorageApi, userId: string);
    exists(path: string): Promise<boolean>;
    getJson<T>(path: string): Promise<T | null>;
    setJson(path: string, value: unknown): Promise<void>;
    list(prefix?: string): Promise<string[]>;
    delete(path: string): Promise<void>;
    mkdir(path: string): Promise<void>;
}
