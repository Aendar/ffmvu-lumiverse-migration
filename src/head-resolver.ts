import { activeMessageContent, activePrefixHash, type HostTranscriptMessage } from './transcript-fingerprint.js';
import { canonicalHash } from './shared/hashing.js';
import { AnchorStore, TranscriptAttemptStore, VariantIndexStore } from './persistence/anchor-store.js';
import type { EventStore } from './persistence/event-store.js';
import type { Materializer } from './persistence/materializer.js';
import { ACTIVE_PREFIX_FINGERPRINT_VERSION, type BaseSnapshot, type StateCommit, type StateScope, type VariantId } from './persistence/types.js';

export type HeadHealth = 'ok' | 'unreconciled' | 'diverged_history' | 'base_boundary_dirty' | 'stopped_uncommitted' | 'failed_patch' | 'store_error';
export interface HeadResolution { health: HeadHealth; nodeId: string; stateHash: string; variantId?: VariantId; reason?: string }

export class HeadResolver {
  constructor(private readonly eventStore: EventStore, private readonly materializer: Materializer, private readonly anchors: AnchorStore, private readonly attempts: TranscriptAttemptStore, private readonly variants: VariantIndexStore) {}

  async resolve(scope: StateScope, baseId: string, messages: HostTranscriptMessage[]): Promise<HeadResolution> {
    try {
      const baseNode = await this.eventStore.readNode(scope, baseId); if (baseNode.type !== 'base') throw new Error('LINEAGE_BASE_NOT_BASESNAPSHOT');
      const base = baseNode.value;
      let startIndex = 0;
      if (base.transcriptBoundary) {
        if (base.transcriptBoundary.fingerprintVersion !== ACTIVE_PREFIX_FINGERPRINT_VERSION) return this.bad('base_boundary_dirty', base, 'unsupported boundary fingerprint version');
        let actual: string;
        try { actual = await activePrefixHash(messages, base.transcriptBoundary.throughMessageId); } catch (error) { return this.bad('base_boundary_dirty', base, String(error)); }
        if (actual !== base.transcriptBoundary.activePrefixHash) return this.bad('base_boundary_dirty', base, 'active prefix hash mismatch');
        const boundaryIndex = messages.findIndex(item => item.id === base.transcriptBoundary!.throughMessageId); if (boundaryIndex < 0) return this.bad('base_boundary_dirty', base, 'boundary message missing'); startIndex = boundaryIndex + 1;
      }

      const root = await this.anchors.readRoot(scope); if (!root || root.baseNodeId !== base.id) return this.bad('unreconciled', base, 'root anchor missing or mismatched');
      let current = await this.materializer.materialize(scope, base.id);
      if (root.tipNodeId !== base.id) {
        const path = await this.eventStore.traceDescendantPath(scope, base.id, root.tipNodeId); if (!path || !path.every(c => isAllowedLineageCommit(c, 'root'))) return this.bad('diverged_history', base, 'invalid root non-message lineage');
        current = await this.materializer.materialize(scope, root.tipNodeId);
      }
      let terminalVariant: VariantId | undefined;

      for (const message of messages.slice(startIndex)) {
        if (message.role !== 'assistant') continue;
        const index = await this.variants.read(scope, message.id); if (!index) return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, reason: `variant index missing for ${message.id}` };
        const swipe = Number.isInteger(message.swipeId) ? message.swipeId! : 0; const variantId = index.bySwipeIndex[swipe];
        if (!variantId) return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, reason: `active swipe has no VariantId for ${message.id}` };
        const anchor = await this.anchors.read(scope, variantId); if (!anchor) return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: `AnchorRecord missing for ${variantId}` };
        if (anchor.messageId !== message.id) return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'anchor message mismatch' };
        if (anchor.initialBaseNodeId !== current.nodeId || anchor.initialBaseStateHash !== current.stateHash) return { health: 'diverged_history', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: `assistant ${message.id} was generated from another lineage` };
        const listed = await this.attempts.listForVariant(scope, variantId); const byId = new Map(listed.map(item => [item.id, item]));
        const ordered = anchor.attemptIds.map(id => byId.get(id)).filter(Boolean);
        if (!ordered.length || ordered.length !== anchor.attemptIds.length) return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'attempt evidence missing' };

        for (let n = 0; n < ordered.length; n++) {
          const attempt = ordered[n]!;
          if (attempt.ordinal !== n + 1) return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'attempt ordinal mismatch' };
          if (current.nodeId !== attempt.baseNodeId) {
            const path = await this.eventStore.traceDescendantPath(scope, current.nodeId, attempt.baseNodeId);
            if (!path || !path.every(c => isAllowedLineageCommit(c, variantId))) return { health: 'diverged_history', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'illegal inter-attempt descendant path' };
            current = await this.materializer.materialize(scope, attempt.baseNodeId);
          }
          if (current.stateHash !== attempt.baseStateHash) return { health: 'diverged_history', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'attempt base state hash mismatch' };
          if (attempt.status === 'committed') {
            if (!attempt.modelCommitId) return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'committed attempt missing modelCommitId' };
            const model = await this.eventStore.readCommit(scope, attempt.modelCommitId);
            if (model.kind !== 'model' || model.parentNodeId !== attempt.baseNodeId || model.anchor.variantId !== variantId || model.anchor.attemptId !== attempt.id) return { health: 'diverged_history', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'model commit provenance mismatch' };
            current = await this.materializer.materialize(scope, model.id);
          } else if (attempt.status === 'no_patch') {
            // state remains on frozen attempt base
          } else if (attempt.status === 'stopped') return { health: 'stopped_uncommitted', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'durable stopped attempt is unresolved' };
          else if (attempt.status === 'failed_patch') return { health: 'failed_patch', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'active attempt has failed patch' };
          else return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: `attempt status ${attempt.status} requires explicit resolution` };
        }

        if (anchor.tipNodeId !== current.nodeId) {
          const path = await this.eventStore.traceDescendantPath(scope, current.nodeId, anchor.tipNodeId);
          if (!path || !path.every(c => isAllowedLineageCommit(c, variantId))) return { health: 'diverged_history', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'invalid post-attempt lineage' };
          current = await this.materializer.materialize(scope, anchor.tipNodeId);
        }
        const activeHash = index.swipeFingerprints[variantId]?.storedMessageTextHash;
        const actualHash = await canonicalHash(activeMessageContent(message));
        if (!activeHash || activeHash !== actualHash) return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'active transcript content differs from VariantIndex' };
        if (activeHash !== anchor.storedMessageTextHash) return { health: 'unreconciled', nodeId: current.nodeId, stateHash: current.stateHash, variantId, reason: 'stored message fingerprint differs from anchor' };
        terminalVariant = variantId;
      }
      return { health: 'ok', nodeId: current.nodeId, stateHash: current.stateHash, ...(terminalVariant ? { variantId: terminalVariant } : {}) };
    } catch (error) {
      const fallback = await this.materializer.materialize(scope, baseId);
      return { health: 'store_error', nodeId: fallback.nodeId, stateHash: fallback.stateHash, reason: String(error) };
    }
  }

  private async bad(health: HeadHealth, base: BaseSnapshot, reason: string): Promise<HeadResolution> { const state = await this.materializer.materialize(base.scope, base.id); return { health, nodeId: state.nodeId, stateHash: state.stateHash, reason }; }
}

function isAllowedLineageCommit(commit: StateCommit, lineage: 'root' | VariantId): boolean { return (commit.kind === 'gui' || commit.kind === 'system' || commit.kind === 'repair') && commit.anchor.lineageAnchorId === lineage; }
