import { canonicalHash } from '../shared/hashing.js';
import type { JsonStoragePort } from './storage-port.js';
import { anchorPath, attemptPath, attemptPrefix, rootAnchorPath, variantIndexPath } from './paths.js';
import { createId, isoNow } from './ids.js';
import { ImmutableStore } from './immutable-store.js';
import type { AnchorRecord, MessageVariantIndex, RootAnchorRecord, StateScope, TranscriptAttempt, VariantId } from './types.js';

export class AnchorStore {
  constructor(private readonly storage: JsonStoragePort) {}
  read(scope: StateScope, variantId: string): Promise<AnchorRecord | null> { return this.storage.getJson(anchorPath(scope, variantId)); }
  put(record: AnchorRecord): Promise<void> { return this.storage.setJson(anchorPath(record.scope, record.variantId), record); }
  readRoot(scope: StateScope): Promise<RootAnchorRecord | null> { return this.storage.getJson(rootAnchorPath(scope)); }
  putRoot(record: RootAnchorRecord): Promise<void> { return this.storage.setJson(rootAnchorPath(record.scope), record); }
}

export class TranscriptAttemptStore {
  private readonly immutable: ImmutableStore;
  constructor(private readonly storage: JsonStoragePort) { this.immutable = new ImmutableStore(storage); }
  async append(attempt: TranscriptAttempt): Promise<void> { await this.immutable.put(attemptPath(attempt.scope, attempt.id), attempt); }
  read(scope: StateScope, attemptId: string): Promise<TranscriptAttempt | null> { return this.storage.getJson(attemptPath(scope, attemptId)); }
  async listForVariant(scope: StateScope, variantId: VariantId): Promise<TranscriptAttempt[]> {
    const paths = await this.storage.list(attemptPrefix(scope));
    const result: TranscriptAttempt[] = [];
    for (const path of paths) {
      const attempt = await this.storage.getJson<TranscriptAttempt>(path);
      if (attempt?.variantId === variantId && attempt.scope.userId === scope.userId && attempt.scope.chatId === scope.chatId) result.push(attempt);
    }
    result.sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id));
    for (let i = 1; i < result.length; i++) if (result[i - 1].ordinal === result[i].ordinal) throw new Error('ATTEMPT_ORDINAL_AMBIGUOUS');
    return result;
  }
}

export interface SwipeObservation { text: string; swipeDate?: string }
export interface ReconcileResult { status: 'ok' | 'ambiguous'; index?: MessageVariantIndex; reason?: string }

export class VariantIndexStore {
  constructor(private readonly storage: JsonStoragePort) {}
  read(scope: StateScope, messageId: string): Promise<MessageVariantIndex | null> { return this.storage.getJson(variantIndexPath(scope, messageId)); }
  write(scope: StateScope, index: MessageVariantIndex): Promise<void> { return this.storage.setJson(variantIndexPath(scope, index.messageId), index); }

  async create(scope: StateScope, messageId: string, swipes: SwipeObservation[]): Promise<MessageVariantIndex> {
    const bySwipeIndex: Record<number, VariantId> = {};
    const swipeFingerprints: MessageVariantIndex['swipeFingerprints'] = {};
    for (let i = 0; i < swipes.length; i++) {
      const variantId = createId('variant');
      const storedMessageTextHash = await canonicalHash(swipes[i].text);
      bySwipeIndex[i] = variantId;
      swipeFingerprints[variantId] = { storedMessageTextHash, ...(swipes[i].swipeDate ? { swipeDate: swipes[i].swipeDate } : {}) };
    }
    const index = { messageId, bySwipeIndex, swipeFingerprints, updatedAt: isoNow() };
    await this.write(scope, index);
    return index;
  }

  async applyAdded(scope: StateScope, messageId: string, swipeIndex: number, observation: SwipeObservation): Promise<VariantId> {
    const index = await this.require(scope, messageId);
    if (index.bySwipeIndex[swipeIndex]) throw new Error('SWIPE_INDEX_ALREADY_BOUND');
    const variantId = createId('variant');
    index.bySwipeIndex[swipeIndex] = variantId;
    index.swipeFingerprints[variantId] = { storedMessageTextHash: await canonicalHash(observation.text), ...(observation.swipeDate ? { swipeDate: observation.swipeDate } : {}) };
    index.updatedAt = isoNow(); await this.write(scope, index); return variantId;
  }

  async applyUpdated(scope: StateScope, messageId: string, swipeIndex: number, observation: SwipeObservation): Promise<VariantId> {
    const index = await this.require(scope, messageId); const variantId = index.bySwipeIndex[swipeIndex];
    if (!variantId) throw new Error('SWIPE_INDEX_UNBOUND');
    index.swipeFingerprints[variantId] = { storedMessageTextHash: await canonicalHash(observation.text), ...(observation.swipeDate ? { swipeDate: observation.swipeDate } : {}) };
    index.updatedAt = isoNow(); await this.write(scope, index); return variantId;
  }

  async applyDeleted(scope: StateScope, messageId: string, swipeIndex: number): Promise<VariantId> {
    const index = await this.require(scope, messageId); const deleted = index.bySwipeIndex[swipeIndex];
    if (!deleted) throw new Error('SWIPE_INDEX_UNBOUND');
    const next: Record<number, VariantId> = {};
    for (const [raw, variantId] of Object.entries(index.bySwipeIndex)) {
      const n = Number(raw); if (n < swipeIndex) next[n] = variantId; else if (n > swipeIndex) next[n - 1] = variantId;
    }
    index.bySwipeIndex = next; delete index.swipeFingerprints[deleted]; index.updatedAt = isoNow(); await this.write(scope, index); return deleted;
  }

  async reconcileWholesale(scope: StateScope, messageId: string, swipes: SwipeObservation[]): Promise<ReconcileResult> {
    const previous = await this.read(scope, messageId);
    if (!previous) return { status: 'ok', index: await this.create(scope, messageId, swipes) };
    const hashes = await Promise.all(swipes.map(item => canonicalHash(item.text)));
    const unused = new Set(Object.values(previous.bySwipeIndex));
    const bySwipeIndex: Record<number, VariantId> = {};
    const nextFingerprints: MessageVariantIndex['swipeFingerprints'] = {};

    for (let i = 0; i < swipes.length; i++) {
      const hash = hashes[i];
      const sameIndex = previous.bySwipeIndex[i];
      if (sameIndex && unused.has(sameIndex) && previous.swipeFingerprints[sameIndex]?.storedMessageTextHash === hash) {
        bySwipeIndex[i] = sameIndex; unused.delete(sameIndex);
      } else {
        const candidates = [...unused].filter(id => previous.swipeFingerprints[id]?.storedMessageTextHash === hash);
        if (candidates.length > 1) return { status: 'ambiguous', reason: `multiple old variants match swipe ${i}` };
        if (candidates.length === 1) { bySwipeIndex[i] = candidates[0]; unused.delete(candidates[0]); }
        else bySwipeIndex[i] = createId('variant');
      }
      const id = bySwipeIndex[i];
      nextFingerprints[id] = { storedMessageTextHash: hash, ...(swipes[i].swipeDate ? { swipeDate: swipes[i].swipeDate } : {}) };
    }
    const index = { messageId, bySwipeIndex, swipeFingerprints: nextFingerprints, updatedAt: isoNow() };
    await this.write(scope, index); return { status: 'ok', index };
  }

  private async require(scope: StateScope, messageId: string): Promise<MessageVariantIndex> {
    const value = await this.read(scope, messageId); if (!value) throw new Error('VARIANT_INDEX_MISSING'); return value;
  }
}
