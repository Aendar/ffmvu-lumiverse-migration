import { canonicalHash } from '../shared/hashing.js';
import { basePath, commitPath, revisionPath, scopeRoot } from './paths.js';
import type { JsonStoragePort } from './storage-port.js';
import { ImmutableStore } from './immutable-store.js';
import type { BaseSnapshot, ChatStoreRevision, StateCommit, StateScope } from './types.js';

export interface StoreHeadResolution {
  status: 'empty' | 'ok' | 'ambiguous' | 'corrupt';
  head?: ChatStoreRevision;
  headHash?: string;
  candidates?: string[];
  reason?: string;
}

export interface CommittedAttemptTip {
  revisionId: string;
  transactionId: string;
  nodeId: string;
  stateHash: string;
  variantId: string;
  attemptId: string;
}

export class EventStore {
  private readonly immutable: ImmutableStore;

  constructor(private readonly storage: JsonStoragePort) {
    this.immutable = new ImmutableStore(storage);
  }

  writeBase(base: BaseSnapshot): Promise<string> {
    return this.immutable.put(basePath(base.scope, base.id), base);
  }

  writeCommit(commit: StateCommit): Promise<string> {
    return this.immutable.put(commitPath(commit.scope, commit.id), commit);
  }

  writeRevision(revision: ChatStoreRevision): Promise<string> {
    return this.immutable.put(revisionPath(revision.scope, revision.revisionId), revision);
  }

  readBase(scope: StateScope, id: string): Promise<BaseSnapshot> {
    return this.immutable.require(basePath(scope, id));
  }

  readCommit(scope: StateScope, id: string): Promise<StateCommit> {
    return this.immutable.require(commitPath(scope, id));
  }

  async readNode(scope: StateScope, id: string): Promise<{ type: 'base'; value: BaseSnapshot } | { type: 'commit'; value: StateCommit }> {
    const bp = basePath(scope, id);
    if (await this.storage.exists(bp)) return { type: 'base', value: await this.immutable.require(bp) };
    const cp = commitPath(scope, id);
    if (await this.storage.exists(cp)) return { type: 'commit', value: await this.immutable.require(cp) };
    throw new Error('Missing semantic node: ' + id);
  }

  async traceDescendantPath(scope: StateScope, ancestorNodeId: string, descendantNodeId: string): Promise<StateCommit[] | null> {
    if (ancestorNodeId === descendantNodeId) return [];
    const reverse: StateCommit[] = [];
    let cursor = descendantNodeId;
    const seen = new Set<string>();
    while (cursor !== ancestorNodeId) {
      if (seen.has(cursor)) throw new Error('Semantic DAG cycle while tracing ' + descendantNodeId);
      seen.add(cursor);
      const node = await this.readNode(scope, cursor);
      if (node.type === 'base') return null;
      reverse.push(node.value);
      cursor = node.value.parentNodeId;
    }
    return reverse.reverse();
  }

  async resolveCommittedAttemptTip(scope: StateScope): Promise<CommittedAttemptTip | null> {
    const physical = await this.resolveStoreHead(scope);
    if (physical.status === 'empty') return null;
    if (physical.status !== 'ok' || !physical.head) {
      throw new Error('STORE_HEAD_' + physical.status.toUpperCase() + (physical.reason ? ': ' + physical.reason : ''));
    }

    const revision = physical.head;
    const tip = await this.readNode(scope, revision.semanticTipNodeId);
    if (tip.type !== 'commit') return null;
    const attemptId = tip.value.anchor.attemptId;
    const variantId = tip.value.anchor.variantId;
    if (!attemptId || !variantId) return null;
    if (tip.value.transactionId !== revision.transactionId) throw new Error('REVISION_TIP_TRANSACTION_MISMATCH: ' + revision.revisionId);
    if (tip.value.resultStateHash !== revision.semanticTipStateHash) throw new Error('REVISION_TIP_STATE_HASH_MISMATCH: ' + revision.revisionId);
    const ref = revision.committedArtifacts.find(item => item.type === 'commit' && item.id === tip.value.id);
    if (!ref) throw new Error('REVISION_TIP_NOT_COMMITTED: ' + revision.revisionId);
    if (ref.hash !== await canonicalHash(tip.value)) throw new Error('REVISION_TIP_ARTIFACT_HASH_MISMATCH: ' + revision.revisionId);
    return {
      revisionId: revision.revisionId,
      transactionId: revision.transactionId,
      nodeId: tip.value.id,
      stateHash: revision.semanticTipStateHash,
      variantId,
      attemptId,
    };
  }

  async listCommittedNodeIds(scope: StateScope): Promise<Set<string>> {
    const prefix = `${scopeRoot(scope)}/store-revisions/`;
    const paths = (await this.storage.list(prefix)).filter(path => path.endsWith('.json'));
    const nodeIds = new Set<string>();
    for (const path of paths) {
      const revision = await this.storage.getJson<ChatStoreRevision>(path);
      if (!revision || revision.scope.chatId !== scope.chatId || revision.scope.userId !== scope.userId) continue;
      for (const artifact of revision.committedArtifacts) {
        if (artifact.type === 'base' || artifact.type === 'commit') nodeIds.add(artifact.id);
      }
    }
    return nodeIds;
  }

  async isNodeCommitted(scope: StateScope, nodeId: string): Promise<boolean> {
    return (await this.listCommittedNodeIds(scope)).has(nodeId);
  }

  async resolveStoreHead(scope: StateScope): Promise<StoreHeadResolution> {
    const prefix = `${scopeRoot(scope)}/store-revisions/`;
    const paths = (await this.storage.list(prefix)).filter(path => path.endsWith('.json'));
    if (!paths.length) return { status: 'empty' };

    const revisions = new Map<string, { value: ChatStoreRevision; hash: string }>();
    for (const path of paths) {
      const value = await this.storage.getJson<ChatStoreRevision>(path);
      if (!value || value.scope.chatId !== scope.chatId || value.scope.userId !== scope.userId) {
        return { status: 'corrupt', reason: 'Revision scope mismatch or unreadable: ' + path };
      }
      const hash = await canonicalHash(value);
      if (revisions.has(value.revisionId)) return { status: 'corrupt', reason: 'Duplicate revisionId: ' + value.revisionId };
      revisions.set(value.revisionId, { value, hash });
    }

    const referenced = new Set<string>();
    for (const { value } of revisions.values()) {
      if (!value.previousStoreRevisionId) {
        if (value.previousStoreRevisionHash !== null) return { status: 'corrupt', reason: 'Root revision has predecessor hash' };
        continue;
      }
      const previous = revisions.get(value.previousStoreRevisionId);
      if (!previous) return { status: 'corrupt', reason: 'Missing predecessor revision: ' + value.previousStoreRevisionId };
      if (value.previousStoreRevisionHash !== previous.hash) return { status: 'corrupt', reason: 'Predecessor hash mismatch: ' + value.revisionId };
      referenced.add(value.previousStoreRevisionId);
    }

    const heads = [...revisions.values()].filter(item => !referenced.has(item.value.revisionId));
    if (heads.length !== 1) {
      return { status: 'ambiguous', candidates: heads.map(item => item.value.revisionId).sort() };
    }
    return { status: 'ok', head: heads[0].value, headHash: heads[0].hash };
  }
}
