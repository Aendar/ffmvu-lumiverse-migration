import { canonicalHash } from '../../src/shared/hashing.js';
import { createProjectionRegistry } from '../../src/shared/projection-registry.js';
import { createReducerRegistry } from '../../src/shared/reducer-registry.js';
import { AnchorStore, TranscriptAttemptStore, VariantIndexStore } from '../../src/persistence/anchor-store.js';
import { createId, isoNow } from '../../src/persistence/ids.js';
import { MemoryJsonStorage } from '../../src/persistence/storage-port.js';
import type { AnchorRecord, StateScope, TranscriptAttempt } from '../../src/persistence/types.js';
import { StateService } from '../../src/service/state-service.js';
import { HeadResolver } from '../../src/head-resolver.js';
import type { HostTranscriptMessage } from '../../src/transcript-fingerprint.js';

let passed = 0;
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error('ASSERT: ' + message); passed += 1; }
const scope: StateScope = { userId: 'u', chatId: 'c' };

async function committedVariant(service: StateService, storage: MemoryJsonStorage, messageId: string, swipeIndex: number, parentNodeId: string, value: number, existingVariantId?: string, ordinal = 1): Promise<{ variantId: string; commitId: string; stateHash: string; attemptId: string }> {
  const indexes = new VariantIndexStore(storage); let index = await indexes.read(scope, messageId);
  if (!index) index = await indexes.create(scope, messageId, [{ text: `assistant-${messageId}-${swipeIndex}` }]);
  let variantId = existingVariantId ?? index.bySwipeIndex[swipeIndex];
  if (!variantId && existingVariantId) { index.bySwipeIndex[swipeIndex] = existingVariantId; index.swipeFingerprints[existingVariantId] = { storedMessageTextHash: await canonicalHash(`assistant-${messageId}-${swipeIndex}`) }; await indexes.write(scope, index); variantId = existingVariantId; }
  if (!variantId) throw new Error('variant missing');
  const base = await service.materializer.materialize(scope, parentNodeId); const attemptId = createId('attempt');
  const commit = await service.commitPatch(scope, { parentNodeId, kind: 'model', anchor: { messageId, variantId, attemptId, lineageAnchorId: variantId, messageRole: 'assistant' }, patch: [{ op: 'replace', path: '/Mainchar/Strength/0', value }] });
  const projection = await service.getProjectionForNode(scope, parentNodeId);
  const attempt: TranscriptAttempt = { id: attemptId, scope, variantId, messageId, generationType: ordinal === 1 ? 'normal' : 'continue', ordinal, baseNodeId: parentNodeId, baseStateHash: base.stateHash, projectionSourceKind: 'node', projectionSourceNodeId: parentNodeId, projectionSourceStateHash: base.stateHash, projectionVersion: 'FFMVU-1.5.8', promptProtocolVersion: 'ffmvu-model-state-v1', promptViewHash: projection.viewHash, modelCommitId: commit.nodeId, status: 'committed', storedMessageTextHash: index.swipeFingerprints[variantId].storedMessageTextHash, createdAt: isoNow() };
  const attempts = new TranscriptAttemptStore(storage); await attempts.append(attempt);
  const anchors = new AnchorStore(storage); const existing = await anchors.read(scope, variantId);
  const anchor: AnchorRecord = existing ? { ...existing, attemptIds: [...existing.attemptIds, attemptId], lastAttemptId: attemptId, tipNodeId: commit.nodeId, status: 'committed', updatedAt: isoNow() } : { variantId, scope, messageId, observedSwipeIndex: swipeIndex, initialBaseNodeId: parentNodeId, initialBaseStateHash: base.stateHash, attemptIds: [attemptId], lastAttemptId: attemptId, storedMessageTextHash: index.swipeFingerprints[variantId].storedMessageTextHash, tipNodeId: commit.nodeId, status: 'committed', createdAt: isoNow(), updatedAt: isoNow() };
  await anchors.put(anchor); return { variantId, commitId: commit.nodeId, stateHash: commit.stateHash, attemptId };
}

async function main(): Promise<void> {
  const storage = new MemoryJsonStorage(); const service = new StateService(storage, createReducerRegistry(), createProjectionRegistry()); const genesis = await service.createGenesis(scope);
  const variants = new VariantIndexStore(storage); const idx = await variants.create(scope, 'm1', [{ text: 'A' }, { text: 'B' }]);
  const a = idx.bySwipeIndex[0], b = idx.bySwipeIndex[1];
  async function makeSwipe(variantId: string, swipeIndex: number, strength: number): Promise<string> {
    const base = genesis; const attemptId = createId('attempt'); const commit = await service.commitPatch(scope, { parentNodeId: base.nodeId, kind: 'model', anchor: { messageId: 'm1', variantId, attemptId, lineageAnchorId: variantId, messageRole: 'assistant' }, patch: [{ op: 'replace', path: '/Mainchar/Strength/0', value: strength }] });
    const projection = await service.getProjectionForNode(scope, base.nodeId); const attempt: TranscriptAttempt = { id: attemptId, scope, variantId, messageId: 'm1', generationType: swipeIndex === 0 ? 'normal' : 'swipe', ordinal: 1, baseNodeId: base.nodeId, baseStateHash: base.stateHash, projectionSourceKind: 'node', projectionSourceNodeId: base.nodeId, projectionSourceStateHash: base.stateHash, projectionVersion: 'FFMVU-1.5.8', promptProtocolVersion: 'ffmvu-model-state-v1', promptViewHash: projection.viewHash, modelCommitId: commit.nodeId, status: 'committed', storedMessageTextHash: idx.swipeFingerprints[variantId].storedMessageTextHash, createdAt: isoNow() }; await new TranscriptAttemptStore(storage).append(attempt);
    await new AnchorStore(storage).put({ variantId, scope, messageId: 'm1', observedSwipeIndex: swipeIndex, initialBaseNodeId: base.nodeId, initialBaseStateHash: base.stateHash, attemptIds: [attemptId], lastAttemptId: attemptId, storedMessageTextHash: idx.swipeFingerprints[variantId].storedMessageTextHash, tipNodeId: commit.nodeId, status: 'committed', createdAt: isoNow(), updatedAt: isoNow() }); return commit.nodeId;
  }
  const pA = await makeSwipe(a, 0, 11); const pB = await makeSwipe(b, 1, 22);
  const resolver = new HeadResolver(service.store, service.materializer, new AnchorStore(storage), new TranscriptAttemptStore(storage), variants);
  let messages: HostTranscriptMessage[] = [{ id: 'm1', role: 'assistant', content: 'A', swipes: ['A', 'B'], swipeId: 0 }];
  let resolved = await resolver.resolve(scope, genesis.nodeId, messages); assert(resolved.health === 'ok' && resolved.nodeId === pA, 'active swipe0 resolves A lineage');
  messages = [{ ...messages[0], swipeId: 1 }]; resolved = await resolver.resolve(scope, genesis.nodeId, messages); assert(resolved.health === 'ok' && resolved.nodeId === pB, 'navigation alone resolves B lineage without state write');

  // Downstream assistant generated from A becomes divergent when m1 is switched to B and host leaves m2 in place.
  messages = [{ id: 'm1', role: 'assistant', content: 'A', swipes: ['A', 'B'], swipeId: 0 }];
  const idx2 = await variants.create(scope, 'm2', [{ text: 'C' }]); const c = idx2.bySwipeIndex[0]; const attemptC = createId('attempt'); const stateA = await service.materializer.materialize(scope, pA); const commitC = await service.commitPatch(scope, { parentNodeId: pA, kind: 'model', anchor: { messageId: 'm2', variantId: c, attemptId: attemptC, lineageAnchorId: c, messageRole: 'assistant' }, patch: [{ op: 'replace', path: '/Mainchar/Agility/0', value: 13 }] }); const projA = await service.getProjectionForNode(scope, pA);
  await new TranscriptAttemptStore(storage).append({ id: attemptC, scope, variantId: c, messageId: 'm2', generationType: 'normal', ordinal: 1, baseNodeId: pA, baseStateHash: stateA.stateHash, projectionSourceKind: 'node', projectionSourceNodeId: pA, projectionSourceStateHash: stateA.stateHash, projectionVersion: 'FFMVU-1.5.8', promptProtocolVersion: 'ffmvu-model-state-v1', promptViewHash: projA.viewHash, modelCommitId: commitC.nodeId, status: 'committed', storedMessageTextHash: idx2.swipeFingerprints[c].storedMessageTextHash, createdAt: isoNow() });
  await new AnchorStore(storage).put({ variantId: c, scope, messageId: 'm2', observedSwipeIndex: 0, initialBaseNodeId: pA, initialBaseStateHash: stateA.stateHash, attemptIds: [attemptC], lastAttemptId: attemptC, storedMessageTextHash: idx2.swipeFingerprints[c].storedMessageTextHash, tipNodeId: commitC.nodeId, status: 'committed', createdAt: isoNow(), updatedAt: isoNow() });
  messages = [{ id: 'm1', role: 'assistant', content: 'B', swipes: ['A', 'B'], swipeId: 1 }, { id: 'm2', role: 'assistant', content: 'C', swipes: ['C'], swipeId: 0 }];
  resolved = await resolver.resolve(scope, genesis.nodeId, messages); assert(resolved.health === 'diverged_history' && resolved.nodeId === pB, 'downstream assistant from inactive parent fails closed');

  // Wholesale reindex keeps identity when matching is unique.
  const reindexStorage = new MemoryJsonStorage(); const reindex = new VariantIndexStore(reindexStorage); const old = await reindex.create(scope, 'x', [{ text: 'one' }, { text: 'two' }, { text: 'three' }]); const oldThree = old.bySwipeIndex[2]; const afterDelete = await reindex.reconcileWholesale(scope, 'x', [{ text: 'one' }, { text: 'three' }]); assert(afterDelete.status === 'ok' && afterDelete.index?.bySwipeIndex[1] === oldThree, 'wholesale reconcile preserves surviving VariantId after reindex');

  // Duplicate old fingerprints with displaced indices are ambiguous.
  const dupStorage = new MemoryJsonStorage(); const dup = new VariantIndexStore(dupStorage); await dup.create(scope, 'd', [{ text: 'same' }, { text: 'same' }, { text: 'z' }]); const ambiguity = await dup.reconcileWholesale(scope, 'd', [{ text: 'x' }, { text: 'y' }, { text: 'same' }]); assert(ambiguity.status === 'ambiguous', 'duplicate fingerprint reconciliation fails closed');

  // Once the assistant variant has committed state provenance, later prose edits are transcript-only.
  // They may even remove the old machine envelope; state reachability stays bound to VariantId/attempt/commit evidence.
  const edited = await resolver.resolve(scope, genesis.nodeId, [{ id: 'm1', role: 'assistant', content: 'edited prose only', swipes: ['edited prose only', 'B'], swipeId: 0 }]);
  assert(edited.health === 'ok' && edited.nodeId === pA, 'content-only transcript edit preserves committed state lineage even with stale text fingerprints');
  const updatedVariantId = await variants.applyUpdated(scope, 'm1', 0, { text: 'edited again with no JSONPatch envelope' });
  assert(updatedVariantId === a, 'explicit swipe content update preserves VariantId identity');
  const editedAgain = await resolver.resolve(scope, genesis.nodeId, [{ id: 'm1', role: 'assistant', content: 'edited again with no JSONPatch envelope', swipes: ['edited again with no JSONPatch envelope', 'B'], swipeId: 0 }]);
  assert(editedAgain.health === 'ok' && editedAgain.nodeId === pA, 'removing generated patch text after commit does not alter authoritative state');

  // Continue may start from a same-lineage GUI descendant, not necessarily previous model commit.
  const contStorage = new MemoryJsonStorage(); const contService = new StateService(contStorage, createReducerRegistry(), createProjectionRegistry()); const g = await contService.createGenesis(scope); const vi = new VariantIndexStore(contStorage); const vix = await vi.create(scope, 'continue', [{ text: 'full-content' }]); const v = vix.bySwipeIndex[0]; const first = await committedVariant(contService, contStorage, 'continue', 0, g.nodeId, 7, v, 1);
  const gui = await contService.commitPatch(scope, { parentNodeId: first.commitId, kind: 'gui', anchor: { lineageAnchorId: v, variantId: v, messageId: 'continue' }, patch: [{ op: 'replace', path: '/Mainchar/Agility/0', value: 8 }] }); const anchorStore = new AnchorStore(contStorage); const anch = await anchorStore.read(scope, v); if (!anch) throw new Error('anchor missing'); anch.tipNodeId = gui.nodeId; anch.updatedAt = isoNow(); await anchorStore.put(anch);
  const second = await committedVariant(contService, contStorage, 'continue', 0, gui.nodeId, 9, v, 2); const resolver2 = new HeadResolver(contService.store, contService.materializer, anchorStore, new TranscriptAttemptStore(contStorage), vi); const rr = await resolver2.resolve(scope, g.nodeId, [{ id: 'continue', role: 'assistant', content: 'full-content', swipes: ['full-content'], swipeId: 0 }]); assert(rr.health === 'ok' && rr.nodeId === second.commitId, 'Continue accepts same-lineage GUI descendant base');

  // A stopped partial may be explicitly resolved by a later Continue attempt on the same VariantId.
  const recoverStorage = new MemoryJsonStorage();
  const recoverService = new StateService(recoverStorage, createReducerRegistry(), createProjectionRegistry());
  const recoverBase = await recoverService.createGenesis(scope);
  const recoverVariants = new VariantIndexStore(recoverStorage);
  const finalText = 'prose <JSONPatch>[{"op":"replace","path":"/Narrative/Turn","value":1}]</JSONPatch>';
  const recoverIndex = await recoverVariants.create(scope, 'recover', [{ text: finalText }]);
  const recoverVariant = recoverIndex.bySwipeIndex[0];
  const partialText = 'prose <JSONPatch>[{"op":"replace","path":"/Narrative/Turn","value":';
  const stoppedAttemptId = createId('attempt');
  const projection0 = await recoverService.getProjectionForNode(scope, recoverBase.nodeId);
  const stoppedAttempt: TranscriptAttempt = {
    id: stoppedAttemptId, scope, variantId: recoverVariant, messageId: 'recover', generationType: 'normal', ordinal: 1,
    baseNodeId: recoverBase.nodeId, baseStateHash: recoverBase.stateHash,
    projectionSourceKind: 'node', projectionSourceNodeId: recoverBase.nodeId, projectionSourceStateHash: recoverBase.stateHash,
    projectionVersion: projection0.projectionVersion, promptProtocolVersion: projection0.promptProtocolVersion, promptViewHash: projection0.viewHash,
    modelCommitId: null, status: 'stopped', storedMessageTextHash: await canonicalHash(partialText), createdAt: isoNow(),
  };
  const recoverAttempts = new TranscriptAttemptStore(recoverStorage);
  await recoverAttempts.append(stoppedAttempt);
  const continueAttemptId = createId('attempt');
  const recoveredCommit = await recoverService.commitPatch(scope, {
    parentNodeId: recoverBase.nodeId, kind: 'model',
    anchor: { messageId: 'recover', variantId: recoverVariant, attemptId: continueAttemptId, lineageAnchorId: recoverVariant, messageRole: 'assistant' },
    patch: [{ op: 'replace', path: '/Narrative/Turn', value: 1 }],
  });
  const continueAttempt: TranscriptAttempt = {
    id: continueAttemptId, scope, variantId: recoverVariant, messageId: 'recover', generationType: 'continue', ordinal: 2,
    baseNodeId: recoverBase.nodeId, baseStateHash: recoverBase.stateHash,
    projectionSourceKind: 'node', projectionSourceNodeId: recoverBase.nodeId, projectionSourceStateHash: recoverBase.stateHash,
    projectionVersion: projection0.projectionVersion, promptProtocolVersion: projection0.promptProtocolVersion, promptViewHash: projection0.viewHash,
    modelCommitId: recoveredCommit.nodeId, status: 'committed', storedMessageTextHash: await canonicalHash(finalText),
    resolvesAttemptId: stoppedAttemptId, createdAt: isoNow(),
  };
  await recoverAttempts.append(continueAttempt);
  await new AnchorStore(recoverStorage).put({
    variantId: recoverVariant, scope, messageId: 'recover', observedSwipeIndex: 0,
    initialBaseNodeId: recoverBase.nodeId, initialBaseStateHash: recoverBase.stateHash,
    attemptIds: [stoppedAttemptId, continueAttemptId], lastAttemptId: continueAttemptId,
    storedMessageTextHash: await canonicalHash(finalText), tipNodeId: recoveredCommit.nodeId,
    status: 'committed', createdAt: isoNow(), updatedAt: isoNow(),
  });
  const recoverResolver = new HeadResolver(recoverService.store, recoverService.materializer, new AnchorStore(recoverStorage), recoverAttempts, recoverVariants);
  const recovered = await recoverResolver.resolve(scope, recoverBase.nodeId, [{ id: 'recover', role: 'assistant', content: finalText, swipes: [finalText], swipeId: 0 }]);
  assert(recovered.health === 'ok' && recovered.nodeId === recoveredCommit.nodeId, 'linked Continue attempt resolves a stopped predecessor without rewriting its forensic evidence');

  console.log(`phase3 tests passed: ${passed}`);
}
void main();
