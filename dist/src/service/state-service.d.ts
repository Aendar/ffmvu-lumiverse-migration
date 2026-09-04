import { type JsonPatchOperation } from '../shared/json-patch.js';
import type { ProjectionRegistry } from '../shared/projection-registry.js';
import type { ReducerRegistry } from '../shared/reducer-registry.js';
import { AnchorStore } from '../persistence/anchor-store.js';
import { EventStore } from '../persistence/event-store.js';
import { Materializer } from '../persistence/materializer.js';
import type { JsonStoragePort } from '../persistence/storage-port.js';
import { type CommitAnchor, type MaterializedState, type StateCommitKind, type StateScope, type TranscriptBaseBoundary } from '../persistence/types.js';
export interface CreateGenesisInput {
    state?: unknown;
    transcriptBoundary?: TranscriptBaseBoundary;
    provenance?: Record<string, unknown>;
}
export interface CommitPatchInput {
    parentNodeId: string;
    patch: JsonPatchOperation[];
    kind: StateCommitKind;
    anchor?: CommitAnchor;
    requestId?: string;
    note?: string;
}
export declare class StateService {
    private readonly storage;
    private readonly reducers;
    private readonly projections;
    readonly store: EventStore;
    readonly materializer: Materializer;
    readonly anchors: AnchorStore;
    private readonly mutex;
    constructor(storage: JsonStoragePort, reducers: ReducerRegistry, projections: ProjectionRegistry);
    createGenesis(scope: StateScope, input?: CreateGenesisInput): Promise<MaterializedState>;
    commitPatch(scope: StateScope, input: CommitPatchInput): Promise<MaterializedState>;
    readLatestCommittedTransactionTip(scope: StateScope): Promise<MaterializedState | null>;
    getProjectionForNode(scope: StateScope, nodeId: string): Promise<{
        nodeId: string;
        stateHash: string;
        view: Record<string, unknown>;
        viewHash: string;
    }>;
}
