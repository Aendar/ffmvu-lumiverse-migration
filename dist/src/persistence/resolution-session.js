/**
 * Request-scoped read acceleration for semantic head/projection/history work.
 *
 * Only immutable semantic artifacts and derived materializations are cached.
 * Mutable transcript-facing records (anchors and variant indexes) deliberately
 * remain outside this class so existing race checks keep observing live values.
 * A ResolutionSession must never outlive one logical read operation.
 */
export class ResolutionSession {
    scope;
    eventStore;
    materializer;
    attempts;
    nodeCache = new Map();
    materializedCache = new Map();
    attemptIndexPromise = null;
    committedNodeIdsPromise = null;
    committedAttemptTipPromise = null;
    constructor(scope, eventStore, materializer, attempts) {
        this.scope = scope;
        this.eventStore = eventStore;
        this.materializer = materializer;
        this.attempts = attempts;
    }
    async readNode(nodeId) {
        const cached = this.nodeCache.get(nodeId);
        if (cached)
            return cached;
        const node = await this.eventStore.readNode(this.scope, nodeId);
        this.nodeCache.set(nodeId, node);
        return node;
    }
    async readCommit(nodeId) {
        const node = await this.readNode(nodeId);
        if (node.type !== 'commit')
            throw new Error('Expected StateCommit: ' + nodeId);
        return node.value;
    }
    materialize(nodeId) {
        return this.materializer.materialize(this.scope, nodeId, this.materializedCache);
    }
    async traceDescendantPath(ancestorNodeId, descendantNodeId) {
        if (ancestorNodeId === descendantNodeId)
            return [];
        const reverse = [];
        let cursor = descendantNodeId;
        const seen = new Set();
        while (cursor !== ancestorNodeId) {
            if (seen.has(cursor))
                throw new Error('Semantic DAG cycle while tracing ' + descendantNodeId);
            seen.add(cursor);
            const node = await this.readNode(cursor);
            if (node.type === 'base')
                return null;
            reverse.push(node.value);
            cursor = node.value.parentNodeId;
        }
        return reverse.reverse();
    }
    async listAttemptsForVariant(variantId) {
        return (await this.attemptIndex()).byVariant.get(variantId) ?? [];
    }
    async readAttempt(attemptId) {
        return (await this.attemptIndex()).byId.get(attemptId) ?? null;
    }
    async isNodeCommitted(nodeId) {
        if (!this.committedNodeIdsPromise) {
            this.committedNodeIdsPromise = this.eventStore.listCommittedNodeIds(this.scope);
        }
        return (await this.committedNodeIdsPromise).has(nodeId);
    }
    resolveCommittedAttemptTip() {
        if (!this.committedAttemptTipPromise) {
            this.committedAttemptTipPromise = this.eventStore.resolveCommittedAttemptTip(this.scope);
        }
        return this.committedAttemptTipPromise;
    }
    attemptIndex() {
        if (!this.attemptIndexPromise)
            this.attemptIndexPromise = this.buildAttemptIndex();
        return this.attemptIndexPromise;
    }
    async buildAttemptIndex() {
        const byVariant = new Map();
        const byId = new Map();
        for (const attempt of await this.attempts.listForScope(this.scope)) {
            byId.set(attempt.id, attempt);
            const list = byVariant.get(attempt.variantId) ?? [];
            list.push(attempt);
            byVariant.set(attempt.variantId, list);
        }
        for (const list of byVariant.values()) {
            list.sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id));
            for (let i = 1; i < list.length; i++) {
                if (list[i - 1].ordinal === list[i].ordinal)
                    throw new Error('ATTEMPT_ORDINAL_AMBIGUOUS');
            }
        }
        return { byVariant, byId };
    }
}
//# sourceMappingURL=resolution-session.js.map