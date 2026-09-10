import { AnchorStore, TranscriptAttemptStore, VariantIndexStore } from '../../src/persistence/anchor-store.js';
import { MemoryJsonStorage } from '../../src/persistence/storage-port.js';
import { ResolutionSession } from '../../src/persistence/resolution-session.js';
import { StateService } from '../../src/service/state-service.js';
import { createProjectionRegistry } from '../../src/shared/projection-registry.js';
import { createReducerRegistry } from '../../src/shared/reducer-registry.js';
import { HeadResolver } from '../../src/head-resolver.js';
import type { HostTranscriptMessage } from '../../src/transcript-fingerprint.js';
import type { TranscriptAttempt } from '../../src/persistence/types.js';

let passed = 0;
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error('ASSERT: ' + message);
  passed += 1;
}

class CountingStorage extends MemoryJsonStorage {
  listCalls = 0;
  getCalls = 0;
  existsCalls = 0;

  resetCounts(): void {
    this.listCalls = 0;
    this.getCalls = 0;
    this.existsCalls = 0;
  }

  override async list(prefix = ''): Promise<string[]> {
    this.listCalls += 1;
    return super.list(prefix);
  }

  override async getJson<T>(path: string): Promise<T | null> {
    this.getCalls += 1;
    return super.getJson<T>(path);
  }

  override async exists(path: string): Promise<boolean> {
    this.existsCalls += 1;
    return super.exists(path);
  }
}

async function main() {
  const storage = new CountingStorage();
  const state = new StateService(storage, createReducerRegistry(), createProjectionRegistry());
  const scope = { userId: 'u', chatId: 'resolution-cache' };
  const genesis = await state.createGenesis(scope);
  const anchors = new AnchorStore(storage);
  const attempts = new TranscriptAttemptStore(storage);
  const variants = new VariantIndexStore(storage);
  const resolver = new HeadResolver(state.store, state.materializer, anchors, attempts, variants);
  const messages: HostTranscriptMessage[] = [];

  let current = genesis;
  for (let i = 1; i <= 8; i++) {
    const messageId = `m${i}`;
    const variantId = `v${i}`;
    const attemptId = `a${i}`;
    const before = current;
    current = await state.commitPatch(scope, {
      parentNodeId: before.nodeId,
      expectedParentStateHash: before.stateHash,
      patch: [{ op: 'replace', path: '/Narrative/Turn', value: i }],
      kind: 'model',
      anchor: {
        messageId,
        variantId,
        attemptId,
        generationId: `g${i}`,
        messageRole: 'assistant',
        lineageAnchorId: variantId,
      },
      requestId: attemptId,
    });

    const attempt: TranscriptAttempt = {
      id: attemptId,
      scope,
      variantId,
      messageId,
      generationId: `g${i}`,
      generationType: 'normal',
      ordinal: 1,
      baseNodeId: before.nodeId,
      baseStateHash: before.stateHash,
      projectionSourceKind: 'node',
      projectionSourceNodeId: before.nodeId,
      projectionSourceStateHash: before.stateHash,
      projectionVersion: 'FFMVU-1.6.0',
      promptProtocolVersion: 'ffmvu-model-state-v1',
      promptViewHash: `view-${i}`,
      modelCommitId: current.nodeId,
      status: 'committed',
      storedMessageTextHash: `text-${i}`,
      finalNodeId: current.nodeId,
      finalStateHash: current.stateHash,
      createdAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
    };
    await attempts.append(attempt);
    await variants.write(scope, {
      messageId,
      bySwipeIndex: { 0: variantId },
      swipeFingerprints: { [variantId]: { storedMessageTextHash: `text-${i}` } },
      updatedAt: attempt.createdAt,
    });
    await anchors.put({
      variantId,
      scope,
      messageId,
      observedSwipeIndex: 0,
      initialBaseNodeId: before.nodeId,
      initialBaseStateHash: before.stateHash,
      attemptIds: [attemptId],
      lastAttemptId: attemptId,
      storedMessageTextHash: `text-${i}`,
      tipNodeId: current.nodeId,
      status: 'committed',
      createdAt: attempt.createdAt,
      updatedAt: attempt.createdAt,
    });
    messages.push({ id: messageId, role: 'assistant', content: `assistant ${i}`, swipeId: 0 });
  }

  storage.resetCounts();
  const resolved = await resolver.resolve(scope, genesis.nodeId, messages);
  assert(resolved.health === 'ok', 'cached resolver preserves healthy semantic lineage');
  assert(resolved.nodeId === current.nodeId && resolved.stateHash === current.stateHash, 'cached resolver returns exact semantic tip');
  const resolverListCalls = storage.listCalls;
  assert(resolverListCalls === 2, 'one attempt-scope scan plus one physical revision scan serve the entire head resolution');

  const session = new ResolutionSession(scope, state.store, state.materializer, attempts);
  storage.resetCounts();
  const first = await session.materialize(current.nodeId);
  const readsAfterFirstMaterialization = storage.getCalls + storage.existsCalls;
  const second = await session.materialize(current.nodeId);
  assert(first.stateHash === second.stateHash, 'request cache returns identical materialized state');
  assert(storage.getCalls + storage.existsCalls === readsAfterFirstMaterialization, 'repeated materialization in one request performs no storage reads');

  storage.resetCounts();
  assert(await session.isNodeCommitted(genesis.nodeId), 'session sees committed genesis');
  assert(await session.isNodeCommitted(current.nodeId), 'session sees committed tip');
  const committedMembershipListCalls = storage.listCalls;
  assert(committedMembershipListCalls === 1, 'committed-node membership is indexed once per request session');

  storage.resetCounts();
  assert((await session.listAttemptsForVariant('v1')).length === 1, 'attempt index returns first variant');
  assert((await session.listAttemptsForVariant('v8')).length === 1, 'attempt index returns later variant');
  const attemptIndexListCalls = storage.listCalls;
  assert(attemptIndexListCalls === 1, 'attempt artifacts are scanned once for multiple variants');

  console.log(`FFMVU Phase 10 resolution-cache checks passed: ${passed}`);
}

void main();
