import { activePrefixHash } from './transcript-fingerprint.js';
import { ResolutionSession } from './persistence/resolution-session.js';
import { ACTIVE_PREFIX_FINGERPRINT_VERSION } from './persistence/types.js';
export class HeadResolver {
    eventStore;
    materializer;
    anchors;
    attempts;
    variants;
    constructor(eventStore, materializer, anchors, attempts, variants) {
        this.eventStore = eventStore;
        this.materializer = materializer;
        this.anchors = anchors;
        this.attempts = attempts;
        this.variants = variants;
    }
    createResolutionSession(scope) {
        return new ResolutionSession(scope, this.eventStore, this.materializer, this.attempts);
    }
    async resolve(scope, baseId, messages, providedSession) {
        const session = providedSession ?? this.createResolutionSession(scope);
        if (session.scope.userId !== scope.userId || session.scope.chatId !== scope.chatId) {
            throw new Error('RESOLUTION_SESSION_SCOPE_MISMATCH');
        }
        try {
            const baseNode = await session.readNode(baseId);
            if (baseNode.type !== 'base')
                throw new Error('LINEAGE_BASE_NOT_BASESNAPSHOT');
            const base = baseNode.value;
            let startIndex = 0;
            if (base.transcriptBoundary) {
                if (base.transcriptBoundary.fingerprintVersion !== ACTIVE_PREFIX_FINGERPRINT_VERSION)
                    return this.bad('base_boundary_dirty', base, 'unsupported boundary fingerprint version', session);
                let actual;
                try {
                    actual = await activePrefixHash(messages, base.transcriptBoundary.throughMessageId);
                }
                catch (error) {
                    return this.bad('base_boundary_dirty', base, String(error), session);
                }
                if (actual !== base.transcriptBoundary.activePrefixHash)
                    return this.bad('base_boundary_dirty', base, 'active prefix hash mismatch', session);
                const boundaryIndex = messages.findIndex(item => item.id === base.transcriptBoundary.throughMessageId);
                if (boundaryIndex < 0)
                    return this.bad('base_boundary_dirty', base, 'boundary message missing', session);
                startIndex = boundaryIndex + 1;
            }
            const root = await this.anchors.readRoot(scope);
            if (!root || root.baseNodeId !== base.id)
                return this.bad('unreconciled', base, 'root anchor missing or mismatched', session);
            let current = await session.materialize(base.id);
            if (root.tipNodeId !== base.id) {
                const path = await session.traceDescendantPath(base.id, root.tipNodeId);
                if (!path || !path.every(c => isAllowedLineageCommit(c, 'root')))
                    return this.bad('diverged_history', base, 'invalid root non-message lineage', session);
                current = await session.materialize(root.tipNodeId);
            }
            const committedAttemptTip = await session.resolveCommittedAttemptTip();
            let terminalVariant;
            for (const message of messages.slice(startIndex)) {
                if (message.role !== 'assistant')
                    continue;
                const index = await this.variants.read(scope, message.id);
                if (!index)
                    return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, reason: `variant index missing for ${message.id}` };
                const swipe = Number.isInteger(message.swipeId) ? message.swipeId : 0;
                const variantId = index.bySwipeIndex[swipe];
                if (!variantId)
                    return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, reason: `active swipe has no VariantId for ${message.id}` };
                const anchor = await this.anchors.read(scope, variantId);
                if (!anchor)
                    return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: `AnchorRecord missing for ${variantId}` };
                if (anchor.messageId !== message.id)
                    return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'anchor message mismatch' };
                if (anchor.initialBaseNodeId !== current.nodeId || anchor.initialBaseStateHash !== current.stateHash)
                    return { health: 'diverged_history', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: `assistant ${message.id} was generated from another lineage` };
                const listed = await session.listAttemptsForVariant(variantId);
                const byId = new Map(listed.map(item => [item.id, item]));
                const ordered = anchor.attemptIds.map(id => byId.get(id)).filter(Boolean);
                if (!ordered.length || ordered.length !== anchor.attemptIds.length)
                    return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'attempt evidence missing' };
                for (let n = 0; n < ordered.length; n++) {
                    const attempt = ordered[n];
                    if (attempt.ordinal !== n + 1)
                        return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'attempt ordinal mismatch' };
                    if (current.nodeId !== attempt.baseNodeId) {
                        const path = await session.traceDescendantPath(current.nodeId, attempt.baseNodeId);
                        if (!path || !path.every(c => isAllowedLineageCommit(c, variantId)))
                            return { health: 'diverged_history', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'illegal inter-attempt descendant path' };
                        current = await session.materialize(attempt.baseNodeId);
                    }
                    if (current.stateHash !== attempt.baseStateHash)
                        return { health: 'diverged_history', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'attempt base state hash mismatch' };
                    if (attempt.status === 'committed') {
                        if (!attempt.modelCommitId)
                            return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'committed attempt missing modelCommitId' };
                        const model = await session.readCommit(attempt.modelCommitId);
                        if (model.kind !== 'model' || model.parentNodeId !== attempt.baseNodeId || model.anchor.variantId !== variantId || model.anchor.attemptId !== attempt.id)
                            return { health: 'diverged_history', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'model commit provenance mismatch' };
                        current = await session.materialize(model.id);
                    }
                    else if (attempt.status === 'no_patch') {
                        // state remains on frozen attempt base
                    }
                    else if (attempt.status === 'stopped') {
                        const next = ordered[n + 1];
                        if (!next || next.generationType !== 'continue' || next.resolvesAttemptId !== attempt.id) {
                            return { health: 'stopped_uncommitted', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'durable stopped attempt is unresolved' };
                        }
                        // Explicit same-variant Continue recovery may resolve a stopped segment without inventing a state mutation.
                    }
                    else if (attempt.status === 'failed_patch') {
                        // Invalid model output is durable forensic evidence, not authoritative state.
                        // The whole model transaction was rejected, so lineage remains on the frozen base and RP may continue.
                    }
                    else
                        return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: `attempt status ${attempt.status} requires explicit resolution` };
                }
                if (anchor.tipNodeId !== current.nodeId) {
                    const path = await session.traceDescendantPath(current.nodeId, anchor.tipNodeId);
                    if (!path || !path.every(c => isAllowedLineageCommit(c, variantId)))
                        return { health: 'diverged_history', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'invalid post-attempt lineage' };
                    current = await session.materialize(anchor.tipNodeId);
                }
                const boundAttemptIds = new Set(anchor.attemptIds);
                if (committedAttemptTip &&
                    committedAttemptTip.variantId === variantId &&
                    !boundAttemptIds.has(committedAttemptTip.attemptId)) {
                    const path = await session.traceDescendantPath(current.nodeId, committedAttemptTip.nodeId);
                    if (path !== null) {
                        return {
                            health: 'unreconciled',
                            nodeId: current.nodeId,
                            stateHash: current.stateHash,
                            variantId,
                            reason: `durable committed attempt ${committedAttemptTip.attemptId} is not bound to active transcript lineage`,
                        };
                    }
                }
                // Once a VariantId has immutable attempt/commit provenance, current assistant prose is mutable transcript
                // presentation. Text fingerprints remain rebuildable diagnostics and must not gate state reachability.
                terminalVariant = variantId;
            }
            return { health: 'ok', nodeId: current.nodeId, stateHash: current.stateHash, ...(terminalVariant ? { variantId: terminalVariant } : {}) };
        }
        catch (error) {
            const fallback = await session.materialize(baseId);
            return { health: 'store_error', nodeId: fallback.nodeId, stateHash: fallback.stateHash, reason: String(error) };
        }
    }
    async bad(health, base, reason, session) { const state = await session.materialize(base.id); return { health, nodeId: state.nodeId, stateHash: state.stateHash, reason }; }
}
function isAllowedLineageCommit(commit, lineage) {
    return (commit.kind === 'gui' || commit.kind === 'system' || commit.kind === 'migration' || commit.kind === 'repair')
        && commit.anchor.lineageAnchorId === lineage;
}
//# sourceMappingURL=head-resolver.js.map