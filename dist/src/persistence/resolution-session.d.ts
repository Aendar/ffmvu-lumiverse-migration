import type { EventStore, CommittedAttemptTip } from './event-store.js';
import type { Materializer } from './materializer.js';
import type { TranscriptAttemptStore } from './anchor-store.js';
import type { MaterializedState, StateCommit, StateScope, TranscriptAttempt, VariantId } from './types.js';
type SemanticNode = Awaited<ReturnType<EventStore['readNode']>>;
/**
 * Request-scoped read acceleration for semantic head/projection/history work.
 *
 * Only immutable semantic artifacts and derived materializations are cached.
 * Mutable transcript-facing records (anchors and variant indexes) deliberately
 * remain outside this class so existing race checks keep observing live values.
 * Reuse across head/projection/history is valid only while no mutation boundary
 * is crossed; callers must create a fresh session after a committed mutation.
 * A ResolutionSession must never outlive one logical read operation.
 */
export declare class ResolutionSession {
    readonly scope: StateScope;
    private readonly eventStore;
    private readonly materializer;
    private readonly attempts;
    private readonly nodeCache;
    private readonly materializedCache;
    private attemptIndexPromise;
    private committedNodeIdsPromise;
    private committedAttemptTipPromise;
    constructor(scope: StateScope, eventStore: EventStore, materializer: Materializer, attempts: TranscriptAttemptStore);
    readNode(nodeId: string): Promise<SemanticNode>;
    readCommit(nodeId: string): Promise<StateCommit>;
    materialize(nodeId: string): Promise<MaterializedState>;
    traceDescendantPath(ancestorNodeId: string, descendantNodeId: string): Promise<StateCommit[] | null>;
    listAttemptsForVariant(variantId: VariantId): Promise<TranscriptAttempt[]>;
    readAttempt(attemptId: string): Promise<TranscriptAttempt | null>;
    isNodeCommitted(nodeId: string): Promise<boolean>;
    resolveCommittedAttemptTip(): Promise<CommittedAttemptTip | null>;
    private attemptIndex;
    private buildAttemptIndex;
}
export {};
