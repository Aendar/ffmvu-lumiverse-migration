import { type JsonPatchOperation } from '../shared/json-patch.js';
import { type ModelPatchAuthorizationView } from '../shared/patch-policy.js';
import type { ProjectionRegistry } from '../shared/projection-registry.js';
import type { ReducerRegistry } from '../shared/reducer-registry.js';
import { AnchorStore } from '../persistence/anchor-store.js';
import { EventStore } from '../persistence/event-store.js';
import { Materializer } from '../persistence/materializer.js';
import type { JsonStoragePort } from '../persistence/storage-port.js';
import { type BaseSnapshotKind, type CommitAnchor, type MaterializedState, type PortableSnapshot, type ProjectionSeed, type StateCommitKind, type StateScope, type TranscriptBaseBoundary } from '../persistence/types.js';
import { type GameStartPayload } from '../shared/domain/gamestart.js';
import { type GuiIntent } from '../shared/domain/gui-intents.js';
export declare class ModelPatchRejectedError extends Error {
    constructor(message: string);
}
export interface CreateGenesisInput {
    state?: unknown;
    kind?: BaseSnapshotKind;
    transcriptBoundary?: TranscriptBaseBoundary;
    projectionSeed?: ProjectionSeed;
    provenance?: Record<string, unknown>;
    reducerVersion?: string;
    projectionVersion?: string;
    promptProtocolVersion?: string;
    stateSchemaVersion?: string;
}
export interface CommitPatchInput {
    parentNodeId: string;
    expectedParentStateHash?: string;
    patch: JsonPatchOperation[];
    kind: StateCommitKind;
    anchor?: CommitAnchor;
    requestId?: string;
    note?: string;
    /** A migration deliberately changes reducer/projection ownership at this commit. */
    reducerVersion?: string;
    projectionVersion?: string;
    promptProtocolVersion?: string;
    /** Require that no unrelated durable commit landed while this operation was prepared. */
    requireCurrentPhysicalTip?: boolean;
}
export interface CommitGuiIntentInput {
    expectedParentNodeId: string;
    expectedParentStateHash: string;
    intent: GuiIntent;
    anchor: CommitAnchor;
    requestId: string;
}
/**
 * Deterministic in-place upgrade for a legacy semantic head. Unlike the
 * generic migration draft, it has no user-supplied target state: the current
 * reducer is the sole migration definition.
 */
export interface AutoMigrateLegacyStateInput {
    parentNodeId: string;
    expectedParentStateHash: string;
    anchor: CommitAnchor;
    requestId: string;
}
export interface FinalizeModelAttemptInput {
    expectedParentNodeId: string;
    expectedParentStateHash: string;
    patch: JsonPatchOperation[] | null;
    authorization: ModelPatchAuthorizationView;
    projectionVersion: string;
    promptProtocolVersion: string;
    anchor: CommitAnchor;
    requestId: string;
    rawGenerationHash?: string;
    rawPatchPayloadHash?: string;
    storedMessageTextHash?: string;
    presetVersion?: string;
}
export interface FinalizeModelAttemptResult extends MaterializedState {
    status: 'committed' | 'no_patch';
    modelCommitId: string | null;
    systemCommitId: string | null;
    transactionId: string | null;
    committedNodeIds: string[];
    nextPromptViewHash: string;
    canonicalPatchHash?: string;
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
    private updateMaterializedTipCache;
    createGenesis(scope: StateScope, input?: CreateGenesisInput): Promise<MaterializedState>;
    startNewGame(scope: StateScope, payload: GameStartPayload, transcriptBoundary?: TranscriptBaseBoundary): Promise<MaterializedState>;
    importLegacyState(scope: StateScope, input: unknown, transcriptBoundary?: TranscriptBaseBoundary): Promise<MaterializedState>;
    exportPortableSnapshot(scope: StateScope, nodeId: string): Promise<PortableSnapshot>;
    importPortableSnapshot(scope: StateScope, snapshot: PortableSnapshot, transcriptBoundary?: TranscriptBaseBoundary): Promise<MaterializedState>;
    /**
     * Upgrade one legacy head to the current schema without involving the UI,
     * a copied snapshot, or an LLM. The resulting migration commit preserves
     * the existing transcript/variant lineage just like any other system state
     * transition.
     */
    autoMigrateLegacyState(scope: StateScope, input: AutoMigrateLegacyStateInput): Promise<MaterializedState>;
    commitGuiIntent(scope: StateScope, input: CommitGuiIntentInput): Promise<MaterializedState>;
    commitPatch(scope: StateScope, input: CommitPatchInput): Promise<MaterializedState>;
    finalizeModelAttempt(scope: StateScope, input: FinalizeModelAttemptInput): Promise<FinalizeModelAttemptResult>;
    readLatestCommittedTransactionTip(scope: StateScope): Promise<MaterializedState | null>;
    getProjectionForNode(scope: StateScope, nodeId: string): Promise<{
        nodeId: string;
        stateHash: string;
        reducerVersion: string;
        sourceKind: 'node' | 'base-seed';
        sourceNodeId?: string;
        sourceStateHash?: string;
        sourceBaseId?: string;
        projectionVersion: string;
        promptProtocolVersion: string;
        view: Record<string, unknown>;
        viewHash: string;
    }>;
}
