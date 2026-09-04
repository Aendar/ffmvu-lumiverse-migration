import type { JsonStoragePort } from './storage-port.js';
import type { BaseSnapshot, ChatStoreRevision, StateCommit, StateScope } from './types.js';
export interface StoreHeadResolution {
    status: 'empty' | 'ok' | 'ambiguous' | 'corrupt';
    head?: ChatStoreRevision;
    headHash?: string;
    candidates?: string[];
    reason?: string;
}
export declare class EventStore {
    private readonly storage;
    private readonly immutable;
    constructor(storage: JsonStoragePort);
    writeBase(base: BaseSnapshot): Promise<string>;
    writeCommit(commit: StateCommit): Promise<string>;
    writeRevision(revision: ChatStoreRevision): Promise<string>;
    readBase(scope: StateScope, id: string): Promise<BaseSnapshot>;
    readCommit(scope: StateScope, id: string): Promise<StateCommit>;
    readNode(scope: StateScope, id: string): Promise<{
        type: 'base';
        value: BaseSnapshot;
    } | {
        type: 'commit';
        value: StateCommit;
    }>;
    traceDescendantPath(scope: StateScope, ancestorNodeId: string, descendantNodeId: string): Promise<StateCommit[] | null>;
    isNodeCommitted(scope: StateScope, nodeId: string): Promise<boolean>;
    resolveStoreHead(scope: StateScope): Promise<StoreHeadResolution>;
}
