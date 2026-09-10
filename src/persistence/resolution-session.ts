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
 * A ResolutionSession must never outlive one logical read operation.
 */
export class ResolutionSession {
  private readonly nodeCache = new Map<string, SemanticNode>();
  private readonly materializedCache = new Map<string, MaterializedState>();
  private attemptsByVariantPromise: Promise<Map<VariantId, TranscriptAttempt[]>> | null = null;
  private committedNodeIdsPromise: Promise<Set<string>> | null = null;
  private committedAttemptTipPromise: Promise<CommittedAttemptTip | null> | null = null;

  constructor(
    readonly scope: StateScope,
    private readonly eventStore: EventStore,
    private readonly materializer: Materializer,
    private readonly attempts: TranscriptAttemptStore,
  ) {}

  async readNode(nodeId: string): Promise<SemanticNode> {
    const cached = this.nodeCache.get(nodeId);
    if (cached) return cached;
    const node = await this.eventStore.readNode(this.scope, nodeId);
    this.nodeCache.set(nodeId, node);
    return node;
  }

  async readCommit(nodeId: string): Promise<StateCommit> {
    const node = await this.readNode(nodeId);
    if (node.type !== 'commit') throw new Error('Expected StateCommit: ' + nodeId);
    return node.value;
  }

  materialize(nodeId: string): Promise<MaterializedState> {
    return this.materializer.materialize(this.scope, nodeId, this.materializedCache);
  }

  async traceDescendantPath(ancestorNodeId: string, descendantNodeId: string): Promise<StateCommit[] | null> {
    if (ancestorNodeId === descendantNodeId) return [];
    const reverse: StateCommit[] = [];
    let cursor = descendantNodeId;
    const seen = new Set<string>();
    while (cursor !== ancestorNodeId) {
      if (seen.has(cursor)) throw new Error('Semantic DAG cycle while tracing ' + descendantNodeId);
      seen.add(cursor);
      const node = await this.readNode(cursor);
      if (node.type === 'base') return null;
      reverse.push(node.value);
      cursor = node.value.parentNodeId;
    }
    return reverse.reverse();
  }

  async listAttemptsForVariant(variantId: VariantId): Promise<TranscriptAttempt[]> {
    if (!this.attemptsByVariantPromise) {
      this.attemptsByVariantPromise = this.buildAttemptsByVariant();
    }
    return (await this.attemptsByVariantPromise).get(variantId) ?? [];
  }

  async isNodeCommitted(nodeId: string): Promise<boolean> {
    if (!this.committedNodeIdsPromise) {
      this.committedNodeIdsPromise = this.eventStore.listCommittedNodeIds(this.scope);
    }
    return (await this.committedNodeIdsPromise).has(nodeId);
  }

  resolveCommittedAttemptTip(): Promise<CommittedAttemptTip | null> {
    if (!this.committedAttemptTipPromise) {
      this.committedAttemptTipPromise = this.eventStore.resolveCommittedAttemptTip(this.scope);
    }
    return this.committedAttemptTipPromise;
  }

  private async buildAttemptsByVariant(): Promise<Map<VariantId, TranscriptAttempt[]>> {
    const byVariant = new Map<VariantId, TranscriptAttempt[]>();
    for (const attempt of await this.attempts.listForScope(this.scope)) {
      const list = byVariant.get(attempt.variantId) ?? [];
      list.push(attempt);
      byVariant.set(attempt.variantId, list);
    }
    for (const list of byVariant.values()) {
      list.sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id));
      for (let i = 1; i < list.length; i++) {
        if (list[i - 1].ordinal === list[i].ordinal) throw new Error('ATTEMPT_ORDINAL_AMBIGUOUS');
      }
    }
    return byVariant;
  }
}
