import type { JsonStoragePort } from './storage-port.js';
import { type CheckpointRecord, type MaterializedState, type StateScope } from './types.js';
export declare class CheckpointService {
    private readonly storage;
    constructor(storage: JsonStoragePort);
    write(scope: StateScope, materialized: MaterializedState, reducerVersion: string): Promise<void>;
    read(scope: StateScope, nodeId: string): Promise<CheckpointRecord | null>;
}
