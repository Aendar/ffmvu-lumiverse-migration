import { createProjectionRegistry } from '../../src/shared/projection-registry.js';
import { createReducerRegistry } from '../../src/shared/reducer-registry.js';
import { canonicalHash } from '../../src/shared/hashing.js';
import { EventStore } from '../../src/persistence/event-store.js';
import { MemoryJsonStorage } from '../../src/persistence/storage-port.js';
import { revisionPath } from '../../src/persistence/paths.js';
import { EVENT_FORMAT_VERSION, type ChatStoreRevision, type StateScope } from '../../src/persistence/types.js';
import { StateService } from '../../src/service/state-service.js';

const scope: StateScope = { userId: 'user-a', chatId: 'chat-a' };

let passed = 0;
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('ASSERT: ' + message);
  passed += 1;
}
async function rejects(job: () => Promise<unknown>, fragment: string): Promise<void> {
  let hit = false;
  try { await job(); } catch (error) { hit = String(error).includes(fragment); }
  assert(hit, 'expected rejection containing ' + fragment);
}

async function main(): Promise<void> {
  const storage = new MemoryJsonStorage();
  const service = new StateService(storage, createReducerRegistry(), createProjectionRegistry());

  const genesis = await service.createGenesis(scope);
  assert(genesis.state.Mainchar.Strength[0] === 5, 'genesis Strength=5');
  assert((await service.store.resolveStoreHead(scope)).status === 'ok', 'genesis store head resolves');

  const commit = await service.commitPatch(scope, {
    parentNodeId: genesis.nodeId,
    kind: 'gui',
    patch: [{ op: 'replace', path: '/Mainchar/Strength/0', value: 9 }],
  });
  assert(commit.state.Mainchar.Strength[0] === 9, 'commit applied');
  assert((await service.readLatestCommittedTransactionTip(scope))?.nodeId === commit.nodeId, 'physical transaction tip points to latest committed transaction');

  // Semantic DAG branching is legal: physical StoreRevision order is not active-state order.
  const branchCommit = await service.commitPatch(scope, {
    parentNodeId: genesis.nodeId,
    kind: 'gui',
    patch: [{ op: 'replace', path: '/Mainchar/Agility/0', value: 10 }],
  });
  assert(branchCommit.state.Mainchar.Strength[0] === 5 && branchCommit.state.Mainchar.Agility[0] === 10, 'branch commit materializes from semantic parent, not physical revision tip');

  const projection = await service.getProjectionForNode(scope, commit.nodeId);
  assert(Boolean(projection.view.Mainchar) && typeof projection.view.Mainchar === 'object', 'projection contains Mainchar');

  // Unreferenced semantic artifacts must not become committed state.
  const orphanStorage = new MemoryJsonStorage();
  const orphanService = new StateService(orphanStorage, createReducerRegistry(), createProjectionRegistry());
  const orphanGenesis = await orphanService.createGenesis(scope);
  const currentHead = await orphanService.store.resolveStoreHead(scope);
  assert(currentHead.status === 'ok', 'orphan fixture store head ok');
  const orphanCommit = {
    eventFormatVersion: EVENT_FORMAT_VERSION,
    id: 'node_orphan', scope, kind: 'gui' as const, anchor: {},
    parentNodeId: orphanGenesis.nodeId,
    parentStateHash: orphanGenesis.stateHash,
    patch: [{ op: 'replace' as const, path: '/Mainchar/Strength/0', value: 99 }],
    patchHash: 'untrusted', reducerVersion: 'FFMVU-1.5.8', resultStateHash: 'untrusted', projectionBinding: { sourceKind: 'node' as const, sourceNodeId: 'node_orphan', sourceStateHash: 'untrusted', projectionVersion: 'FFMVU-1.5.8', promptProtocolVersion: 'ffmvu-model-state-v1', promptViewHash: 'untrusted' }, transactionId: 'tx_orphan', previousStoreRevisionId: null, previousStoreRevisionHash: null, createdAt: new Date().toISOString(),
  };
  await orphanService.store.writeCommit(orphanCommit);
  assert((await orphanService.readLatestCommittedTransactionTip(scope))?.state.Mainchar.Strength[0] === 5, 'orphan semantic artifact ignored');

  // Competing committed StoreRevision siblings must freeze writes as ambiguous.
  const store = new EventStore(storage);
  const resolved = await store.resolveStoreHead(scope);
  assert(resolved.status === 'ok' && Boolean(resolved.head) && Boolean(resolved.headHash), 'resolved head available');
  const resolvedHead = resolved.head!;
  const resolvedHeadHash = resolved.headHash!;
  const sibling: ChatStoreRevision = {
    eventFormatVersion: EVENT_FORMAT_VERSION,
    revisionId: 'rev_competing_sibling',
    scope,
    previousStoreRevisionId: resolvedHead.previousStoreRevisionId,
    previousStoreRevisionHash: resolvedHead.previousStoreRevisionHash,
    transactionId: 'tx_competing',
    committedArtifacts: [],
    semanticTipNodeId: resolvedHead.semanticTipNodeId,
    semanticTipStateHash: resolvedHead.semanticTipStateHash,
    createdAt: new Date().toISOString(),
  };
  await storage.setJson(revisionPath(scope, sibling.revisionId), sibling);
  const ambiguity = await store.resolveStoreHead(scope);
  assert(ambiguity.status === 'ambiguous', 'competing revisions become ambiguous');
  await rejects(() => service.commitPatch(scope, {
    parentNodeId: branchCommit.nodeId,
    kind: 'gui',
    patch: [{ op: 'replace', path: '/Mainchar/Agility/0', value: 8 }],
  }), 'STORE_NOT_WRITABLE: ambiguous');

  // Immutable artifact collisions are rejected.
  const originalRevision = resolvedHead;
  const originalPath = revisionPath(scope, originalRevision.revisionId);
  const originalValue = await storage.getJson<ChatStoreRevision>(originalPath);
  assert(Boolean(originalValue), 'original revision readable');
  const originalHash = await canonicalHash(originalValue);
  assert(originalHash === resolvedHeadHash, 'resolved head hash verified');
  await rejects(() => store.writeRevision({ ...originalValue!, transactionId: 'changed' }), 'IMMUTABLE_COLLISION');

  console.log(`phase2 tests passed: ${passed}`);
}

void main();
