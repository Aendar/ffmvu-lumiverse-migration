import { canonicalHash } from '../../src/shared/hashing.js';
import { createProjectionRegistry } from '../../src/shared/projection-registry.js';
import { createReducerRegistry } from '../../src/shared/reducer-registry.js';
import { AnchorStore, TranscriptAttemptStore, VariantIndexStore } from '../../src/persistence/anchor-store.js';
import { createId, isoNow } from '../../src/persistence/ids.js';
import { MemoryJsonStorage } from '../../src/persistence/storage-port.js';
import { StateService } from '../../src/service/state-service.js';
import { HeadResolver } from '../../src/head-resolver.js';
let passed = 0;
function assert(condition, message) { if (!condition)
    throw new Error('ASSERT: ' + message); passed += 1; }
const scope = { userId: 'u', chatId: 'c' };
async function committedVariant(service, storage, messageId, swipeIndex, parentNodeId, value, existingVariantId, ordinal = 1) {
    const indexes = new VariantIndexStore(storage);
    let index = await indexes.read(scope, messageId);
    if (!index)
        index = await indexes.create(scope, messageId, [{ text: `assistant-${messageId}-${swipeIndex}` }]);
    let variantId = existingVariantId ?? index.bySwipeIndex[swipeIndex];
    if (!variantId && existingVariantId) {
        index.bySwipeIndex[swipeIndex] = existingVariantId;
        index.swipeFingerprints[existingVariantId] = { storedMessageTextHash: await canonicalHash(`assistant-${messageId}-${swipeIndex}`) };
        await indexes.write(scope, index);
        variantId = existingVariantId;
    }
    if (!variantId)
        throw new Error('variant missing');
    const base = await service.materializer.materialize(scope, parentNodeId);
    const attemptId = createId('attempt');
    const commit = await service.commitPatch(scope, { parentNodeId, kind: 'model', anchor: { messageId, variantId, attemptId, lineageAnchorId: variantId, messageRole: 'assistant' }, patch: [{ op: 'replace', path: '/Mainchar/Strength/0', value }] });
    const projection = await service.getProjectionForNode(scope, parentNodeId);
    const attempt = { id: attemptId, scope, variantId, messageId, generationType: ordinal === 1 ? 'normal' : 'continue', ordinal, baseNodeId: parentNodeId, baseStateHash: base.stateHash, projectionSourceKind: 'node', projectionSourceNodeId: parentNodeId, projectionSourceStateHash: base.stateHash, projectionVersion: 'FFMVU-1.5.8', promptProtocolVersion: 'ffmvu-model-state-v1', promptViewHash: projection.viewHash, modelCommitId: commit.nodeId, status: 'committed', storedMessageTextHash: index.swipeFingerprints[variantId].storedMessageTextHash, createdAt: isoNow() };
    const attempts = new TranscriptAttemptStore(storage);
    await attempts.append(attempt);
    const anchors = new AnchorStore(storage);
    const existing = await anchors.read(scope, variantId);
    const anchor = existing ? { ...existing, attemptIds: [...existing.attemptIds, attemptId], lastAttemptId: attemptId, tipNodeId: commit.nodeId, status: 'committed', updatedAt: isoNow() } : { variantId, scope, messageId, observedSwipeIndex: swipeIndex, initialBaseNodeId: parentNodeId, initialBaseStateHash: base.stateHash, attemptIds: [attemptId], lastAttemptId: attemptId, storedMessageTextHash: index.swipeFingerprints[variantId].storedMessageTextHash, tipNodeId: commit.nodeId, status: 'committed', createdAt: isoNow(), updatedAt: isoNow() };
    await anchors.put(anchor);
    return { variantId, commitId: commit.nodeId, stateHash: commit.stateHash, attemptId };
}
async function main() {
    const storage = new MemoryJsonStorage();
    const service = new StateService(storage, createReducerRegistry(), createProjectionRegistry());
    const genesis = await service.createGenesis(scope);
    const variants = new VariantIndexStore(storage);
    const idx = await variants.create(scope, 'm1', [{ text: 'A' }, { text: 'B' }]);
    const a = idx.bySwipeIndex[0], b = idx.bySwipeIndex[1];
    async function makeSwipe(variantId, swipeIndex, strength) {
        const base = genesis;
        const attemptId = createId('attempt');
        const commit = await service.commitPatch(scope, { parentNodeId: base.nodeId, kind: 'model', anchor: { messageId: 'm1', variantId, attemptId, lineageAnchorId: variantId, messageRole: 'assistant' }, patch: [{ op: 'replace', path: '/Mainchar/Strength/0', value: strength }] });
        const projection = await service.getProjectionForNode(scope, base.nodeId);
        const attempt = { id: attemptId, scope, variantId, messageId: 'm1', generationType: swipeIndex === 0 ? 'normal' : 'swipe', ordinal: 1, baseNodeId: base.nodeId, baseStateHash: base.stateHash, projectionSourceKind: 'node', projectionSourceNodeId: base.nodeId, projectionSourceStateHash: base.stateHash, projectionVersion: 'FFMVU-1.5.8', promptProtocolVersion: 'ffmvu-model-state-v1', promptViewHash: projection.viewHash, modelCommitId: commit.nodeId, status: 'committed', storedMessageTextHash: idx.swipeFingerprints[variantId].storedMessageTextHash, createdAt: isoNow() };
        await new TranscriptAttemptStore(storage).append(attempt);
        await new AnchorStore(storage).put({ variantId, scope, messageId: 'm1', observedSwipeIndex: swipeIndex, initialBaseNodeId: base.nodeId, initialBaseStateHash: base.stateHash, attemptIds: [attemptId], lastAttemptId: attemptId, storedMessageTextHash: idx.swipeFingerprints[variantId].storedMessageTextHash, tipNodeId: commit.nodeId, status: 'committed', createdAt: isoNow(), updatedAt: isoNow() });
        return commit.nodeId;
    }
    const pA = await makeSwipe(a, 0, 11);
    const pB = await makeSwipe(b, 1, 22);
    const resolver = new HeadResolver(service.store, service.materializer, new AnchorStore(storage), new TranscriptAttemptStore(storage), variants);
    let messages = [{ id: 'm1', role: 'assistant', content: 'A', swipes: ['A', 'B'], swipeId: 0 }];
    let resolved = await resolver.resolve(scope, genesis.nodeId, messages);
    assert(resolved.health === 'ok' && resolved.nodeId === pA, 'active swipe0 resolves A lineage');
    messages = [{ ...messages[0], swipeId: 1 }];
    resolved = await resolver.resolve(scope, genesis.nodeId, messages);
    assert(resolved.health === 'ok' && resolved.nodeId === pB, 'navigation alone resolves B lineage without state write');
    // Downstream assistant generated from A becomes divergent when m1 is switched to B and host leaves m2 in place.
    messages = [{ id: 'm1', role: 'assistant', content: 'A', swipes: ['A', 'B'], swipeId: 0 }];
    const idx2 = await variants.create(scope, 'm2', [{ text: 'C' }]);
    const c = idx2.bySwipeIndex[0];
    const attemptC = createId('attempt');
    const stateA = await service.materializer.materialize(scope, pA);
    const commitC = await service.commitPatch(scope, { parentNodeId: pA, kind: 'model', anchor: { messageId: 'm2', variantId: c, attemptId: attemptC, lineageAnchorId: c, messageRole: 'assistant' }, patch: [{ op: 'replace', path: '/Mainchar/Agility/0', value: 13 }] });
    const projA = await service.getProjectionForNode(scope, pA);
    await new TranscriptAttemptStore(storage).append({ id: attemptC, scope, variantId: c, messageId: 'm2', generationType: 'normal', ordinal: 1, baseNodeId: pA, baseStateHash: stateA.stateHash, projectionSourceKind: 'node', projectionSourceNodeId: pA, projectionSourceStateHash: stateA.stateHash, projectionVersion: 'FFMVU-1.5.8', promptProtocolVersion: 'ffmvu-model-state-v1', promptViewHash: projA.viewHash, modelCommitId: commitC.nodeId, status: 'committed', storedMessageTextHash: idx2.swipeFingerprints[c].storedMessageTextHash, createdAt: isoNow() });
    await new AnchorStore(storage).put({ variantId: c, scope, messageId: 'm2', observedSwipeIndex: 0, initialBaseNodeId: pA, initialBaseStateHash: stateA.stateHash, attemptIds: [attemptC], lastAttemptId: attemptC, storedMessageTextHash: idx2.swipeFingerprints[c].storedMessageTextHash, tipNodeId: commitC.nodeId, status: 'committed', createdAt: isoNow(), updatedAt: isoNow() });
    messages = [{ id: 'm1', role: 'assistant', content: 'B', swipes: ['A', 'B'], swipeId: 1 }, { id: 'm2', role: 'assistant', content: 'C', swipes: ['C'], swipeId: 0 }];
    resolved = await resolver.resolve(scope, genesis.nodeId, messages);
    assert(resolved.health === 'diverged_history' && resolved.nodeId === pB, 'downstream assistant from inactive parent fails closed');
    // Wholesale reindex keeps identity when matching is unique.
    const reindexStorage = new MemoryJsonStorage();
    const reindex = new VariantIndexStore(reindexStorage);
    const old = await reindex.create(scope, 'x', [{ text: 'one' }, { text: 'two' }, { text: 'three' }]);
    const oldThree = old.bySwipeIndex[2];
    const afterDelete = await reindex.reconcileWholesale(scope, 'x', [{ text: 'one' }, { text: 'three' }]);
    assert(afterDelete.status === 'ok' && afterDelete.index?.bySwipeIndex[1] === oldThree, 'wholesale reconcile preserves surviving VariantId after reindex');
    // Duplicate old fingerprints with displaced indices are ambiguous.
    const dupStorage = new MemoryJsonStorage();
    const dup = new VariantIndexStore(dupStorage);
    await dup.create(scope, 'd', [{ text: 'same' }, { text: 'same' }, { text: 'z' }]);
    const ambiguity = await dup.reconcileWholesale(scope, 'd', [{ text: 'x' }, { text: 'y' }, { text: 'same' }]);
    assert(ambiguity.status === 'ambiguous', 'duplicate fingerprint reconciliation fails closed');
    // R4 regression: deleting the first of two identical swipes must preserve the surviving VariantId,
    // never prefer the deleted branch just because its old index now matches the survivor's new index.
    const identicalStorage = new MemoryJsonStorage();
    const identical = new VariantIndexStore(identicalStorage);
    const identicalIndex = await identical.create(scope, 'identical', [
        { text: 'same prose', swipeDate: '100' },
        { text: 'same prose', swipeDate: '200' },
    ]);
    const deletedVariantId = identicalIndex.bySwipeIndex[0];
    const survivingVariantId = identicalIndex.bySwipeIndex[1];
    const ambiguousDeleteRecovery = await identical.reconcileWholesale(scope, 'identical', [
        { text: 'same prose', swipeDate: '200' },
    ]);
    assert(ambiguousDeleteRecovery.status === 'ambiguous', 'wholesale recovery rejects same-index duplicate collision instead of selecting the deleted identity');
    const typedDelete = await identical.reconcileTyped(scope, 'identical', 'deleted', 0, [
        { text: 'same prose', swipeDate: '200' },
    ]);
    assert(typedDelete.status === 'ok'
        && typedDelete.index?.bySwipeIndex[0] === survivingVariantId
        && typedDelete.index?.bySwipeIndex[0] !== deletedVariantId, 'typed delete shifts the exact surviving VariantId even when prose hashes collide');
    const duplicateTypedDelete = await identical.reconcileTyped(scope, 'identical', 'deleted', 0, [
        { text: 'same prose', swipeDate: '200' },
    ]);
    assert(duplicateTypedDelete.status === 'ok' && duplicateTypedDelete.index?.bySwipeIndex[0] === survivingVariantId, 'duplicate deleted event is idempotent and cannot delete the survivor');
    const addStorage = new MemoryJsonStorage();
    const addVariants = new VariantIndexStore(addStorage);
    const beforeAdd = await addVariants.create(scope, 'add-identical', [{ text: 'same prose', swipeDate: '100' }]);
    const originalVariantId = beforeAdd.bySwipeIndex[0];
    const typedAdd = await addVariants.reconcileTyped(scope, 'add-identical', 'added', 1, [
        { text: 'same prose', swipeDate: '100' },
        { text: 'same prose', swipeDate: '200' },
    ]);
    const addedVariantId = typedAdd.index?.bySwipeIndex[1];
    assert(typedAdd.status === 'ok'
        && typedAdd.index?.bySwipeIndex[0] === originalVariantId
        && Boolean(addedVariantId)
        && addedVariantId !== originalVariantId, 'typed add creates one new identity without remapping an identical existing swipe');
    const duplicateTypedAdd = await addVariants.reconcileTyped(scope, 'add-identical', 'added', 1, [
        { text: 'same prose', swipeDate: '100' },
        { text: 'same prose', swipeDate: '200' },
    ]);
    assert(duplicateTypedAdd.status === 'ok'
        && duplicateTypedAdd.index?.bySwipeIndex[0] === originalVariantId
        && duplicateTypedAdd.index?.bySwipeIndex[1] === addedVariantId, 'duplicate added event is idempotent and does not allocate a second VariantId');
    const navigationStorage = new MemoryJsonStorage();
    const navigationVariants = new VariantIndexStore(navigationStorage);
    const navigationIndex = await navigationVariants.create(scope, 'navigate-identical', [
        { text: 'same prose', swipeDate: '100' },
        { text: 'same prose', swipeDate: '200' },
    ]);
    const typedNavigation = await navigationVariants.reconcileTyped(scope, 'navigate-identical', 'navigated', 1, [
        { text: 'same prose', swipeDate: '100' },
        { text: 'same prose', swipeDate: '200' },
    ]);
    assert(typedNavigation.status === 'ok'
        && typedNavigation.index?.bySwipeIndex[0] === navigationIndex.bySwipeIndex[0]
        && typedNavigation.index?.bySwipeIndex[1] === navigationIndex.bySwipeIndex[1], 'navigation over identical prose preserves both existing identities without wholesale remapping');
    // Once the assistant variant has committed state provenance, later prose edits are transcript-only.
    // They may even remove the old machine envelope; state reachability stays bound to VariantId/attempt/commit evidence.
    const edited = await resolver.resolve(scope, genesis.nodeId, [{ id: 'm1', role: 'assistant', content: 'edited prose only', swipes: ['edited prose only', 'B'], swipeId: 0 }]);
    assert(edited.health === 'ok' && edited.nodeId === pA, 'content-only transcript edit preserves committed state lineage even with stale text fingerprints');
    const updatedVariantId = await variants.applyUpdated(scope, 'm1', 0, { text: 'edited again with no JSONPatch envelope' });
    assert(updatedVariantId === a, 'explicit swipe content update preserves VariantId identity');
    const editedAgain = await resolver.resolve(scope, genesis.nodeId, [{ id: 'm1', role: 'assistant', content: 'edited again with no JSONPatch envelope', swipes: ['edited again with no JSONPatch envelope', 'B'], swipeId: 0 }]);
    assert(editedAgain.health === 'ok' && editedAgain.nodeId === pA, 'removing generated patch text after commit does not alter authoritative state');
    // Continue may start from a same-lineage GUI descendant, not necessarily previous model commit.
    const contStorage = new MemoryJsonStorage();
    const contService = new StateService(contStorage, createReducerRegistry(), createProjectionRegistry());
    const g = await contService.createGenesis(scope);
    const vi = new VariantIndexStore(contStorage);
    const vix = await vi.create(scope, 'continue', [{ text: 'full-content' }]);
    const v = vix.bySwipeIndex[0];
    const first = await committedVariant(contService, contStorage, 'continue', 0, g.nodeId, 7, v, 1);
    const gui = await contService.commitPatch(scope, { parentNodeId: first.commitId, kind: 'gui', anchor: { lineageAnchorId: v, variantId: v, messageId: 'continue' }, patch: [{ op: 'replace', path: '/Mainchar/Agility/0', value: 8 }] });
    const anchorStore = new AnchorStore(contStorage);
    const anch = await anchorStore.read(scope, v);
    if (!anch)
        throw new Error('anchor missing');
    anch.tipNodeId = gui.nodeId;
    anch.updatedAt = isoNow();
    await anchorStore.put(anch);
    const second = await committedVariant(contService, contStorage, 'continue', 0, gui.nodeId, 9, v, 2);
    const resolver2 = new HeadResolver(contService.store, contService.materializer, anchorStore, new TranscriptAttemptStore(contStorage), vi);
    const rr = await resolver2.resolve(scope, g.nodeId, [{ id: 'continue', role: 'assistant', content: 'full-content', swipes: ['full-content'], swipeId: 0 }]);
    assert(rr.health === 'ok' && rr.nodeId === second.commitId, 'Continue accepts same-lineage GUI descendant base');
    // A rejected model patch is forensic evidence only; it must not poison semantic head reachability.
    const rejectStorage = new MemoryJsonStorage();
    const rejectService = new StateService(rejectStorage, createReducerRegistry(), createProjectionRegistry());
    const rejectBase = await rejectService.createGenesis(scope);
    const rejectVariants = new VariantIndexStore(rejectStorage);
    const rejectIndex = await rejectVariants.create(scope, 'rejected', [{ text: 'bad patch prose' }]);
    const rejectVariant = rejectIndex.bySwipeIndex[0];
    const rejectAttemptId = createId('attempt');
    const rejectProjection = await rejectService.getProjectionForNode(scope, rejectBase.nodeId);
    const rejectAttempts = new TranscriptAttemptStore(rejectStorage);
    await rejectAttempts.append({
        id: rejectAttemptId, scope, variantId: rejectVariant, messageId: 'rejected', generationType: 'normal', ordinal: 1,
        baseNodeId: rejectBase.nodeId, baseStateHash: rejectBase.stateHash,
        projectionSourceKind: 'node', projectionSourceNodeId: rejectBase.nodeId, projectionSourceStateHash: rejectBase.stateHash,
        projectionVersion: rejectProjection.projectionVersion, promptProtocolVersion: rejectProjection.promptProtocolVersion, promptViewHash: rejectProjection.viewHash,
        modelCommitId: null, status: 'failed_patch', failureClass: 'missing_replace_path',
        failureMessage: 'Error: Missing replace path: /Narrative/Turn/0', failurePath: '/Narrative/Turn/0',
        storedMessageTextHash: rejectIndex.swipeFingerprints[rejectVariant].storedMessageTextHash, createdAt: isoNow(),
    });
    await new AnchorStore(rejectStorage).put({
        variantId: rejectVariant, scope, messageId: 'rejected', observedSwipeIndex: 0,
        initialBaseNodeId: rejectBase.nodeId, initialBaseStateHash: rejectBase.stateHash,
        attemptIds: [rejectAttemptId], lastAttemptId: rejectAttemptId,
        storedMessageTextHash: rejectIndex.swipeFingerprints[rejectVariant].storedMessageTextHash,
        tipNodeId: rejectBase.nodeId, status: 'failed_patch', createdAt: isoNow(), updatedAt: isoNow(),
    });
    const rejectResolver = new HeadResolver(rejectService.store, rejectService.materializer, new AnchorStore(rejectStorage), rejectAttempts, rejectVariants);
    const rejectResolved = await rejectResolver.resolve(scope, rejectBase.nodeId, [{ id: 'rejected', role: 'assistant', content: 'bad patch prose', swipes: ['bad patch prose'], swipeId: 0 }]);
    assert(rejectResolved.health === 'ok' && rejectResolved.nodeId === rejectBase.nodeId && rejectResolved.stateHash === rejectBase.stateHash, 'failed model patch remains forensic but semantic head continues from last good state');
    const accumulated = await rejectAttempts.listForScope(scope);
    assert(accumulated.length === 1 && accumulated[0].failureClass === 'missing_replace_path' && accumulated[0].failurePath === '/Narrative/Turn/0', 'rejected patch telemetry persists in immutable attempt history');
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
    const stoppedAttempt = {
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
    const continueAttempt = {
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
    // A durable model transaction that was committed but never appended to Anchor/Attempt evidence
    // must fail closed after restart instead of silently resolving the previous good state as health=ok.
    const unboundStorage = new MemoryJsonStorage();
    const unboundService = new StateService(unboundStorage, createReducerRegistry(), createProjectionRegistry());
    const unboundBase = await unboundService.createGenesis(scope);
    const unboundVariants = new VariantIndexStore(unboundStorage);
    const unboundIndex = await unboundVariants.create(scope, 'unbound', [{ text: 'continue-result' }]);
    const unboundVariant = unboundIndex.bySwipeIndex[0];
    const firstAttemptId = createId('attempt');
    const unboundProjection = await unboundService.getProjectionForNode(scope, unboundBase.nodeId);
    const unboundAttempts = new TranscriptAttemptStore(unboundStorage);
    await unboundAttempts.append({
        id: firstAttemptId, scope, variantId: unboundVariant, messageId: 'unbound', generationType: 'normal', ordinal: 1,
        baseNodeId: unboundBase.nodeId, baseStateHash: unboundBase.stateHash,
        projectionSourceKind: 'node', projectionSourceNodeId: unboundBase.nodeId, projectionSourceStateHash: unboundBase.stateHash,
        projectionVersion: unboundProjection.projectionVersion, promptProtocolVersion: unboundProjection.promptProtocolVersion, promptViewHash: unboundProjection.viewHash,
        modelCommitId: null, status: 'no_patch', storedMessageTextHash: unboundIndex.swipeFingerprints[unboundVariant].storedMessageTextHash,
        createdAt: isoNow(),
    });
    const unboundAnchors = new AnchorStore(unboundStorage);
    await unboundAnchors.put({
        variantId: unboundVariant, scope, messageId: 'unbound', observedSwipeIndex: 0,
        initialBaseNodeId: unboundBase.nodeId, initialBaseStateHash: unboundBase.stateHash,
        attemptIds: [firstAttemptId], lastAttemptId: firstAttemptId,
        storedMessageTextHash: unboundIndex.swipeFingerprints[unboundVariant].storedMessageTextHash,
        tipNodeId: unboundBase.nodeId, status: 'no_patch', createdAt: isoNow(), updatedAt: isoNow(),
    });
    const unboundAttemptId = createId('attempt');
    const durablyCommitted = await unboundService.commitPatch(scope, {
        parentNodeId: unboundBase.nodeId,
        kind: 'model',
        anchor: { messageId: 'unbound', variantId: unboundVariant, attemptId: unboundAttemptId, lineageAnchorId: unboundVariant, messageRole: 'assistant' },
        patch: [{ op: 'replace', path: '/Narrative/Turn', value: 1 }],
    });
    const restartedService = new StateService(unboundStorage, createReducerRegistry(), createProjectionRegistry());
    const restartedResolver = new HeadResolver(restartedService.store, restartedService.materializer, new AnchorStore(unboundStorage), new TranscriptAttemptStore(unboundStorage), new VariantIndexStore(unboundStorage));
    const afterRestart = await restartedResolver.resolve(scope, unboundBase.nodeId, [{ id: 'unbound', role: 'assistant', content: 'continue-result', swipes: ['continue-result'], swipeId: 0 }]);
    assert(afterRestart.health === 'unreconciled' && afterRestart.nodeId === unboundBase.nodeId && String(afterRestart.reason).includes(unboundAttemptId), 'committed-but-unbound attempt is explicit fail-closed after restart instead of stale health=ok');
    // If later valid evidence deliberately advances a sibling branch from the same old base,
    // the historical orphan is not auto-selected and does not poison the now-bound active tip.
    const reboundAttemptId = createId('attempt');
    const reboundCommit = await unboundService.commitPatch(scope, {
        parentNodeId: unboundBase.nodeId,
        kind: 'model',
        anchor: { messageId: 'unbound', variantId: unboundVariant, attemptId: reboundAttemptId, lineageAnchorId: unboundVariant, messageRole: 'assistant' },
        patch: [{ op: 'replace', path: '/Narrative/Turn', value: 2 }],
    });
    await unboundAttempts.append({
        id: reboundAttemptId, scope, variantId: unboundVariant, messageId: 'unbound', generationType: 'continue', ordinal: 2,
        baseNodeId: unboundBase.nodeId, baseStateHash: unboundBase.stateHash,
        projectionSourceKind: 'node', projectionSourceNodeId: unboundBase.nodeId, projectionSourceStateHash: unboundBase.stateHash,
        projectionVersion: unboundProjection.projectionVersion, promptProtocolVersion: unboundProjection.promptProtocolVersion, promptViewHash: unboundProjection.viewHash,
        modelCommitId: reboundCommit.nodeId, status: 'committed', storedMessageTextHash: unboundIndex.swipeFingerprints[unboundVariant].storedMessageTextHash,
        createdAt: isoNow(),
    });
    const reboundAnchor = await unboundAnchors.read(scope, unboundVariant);
    if (!reboundAnchor)
        throw new Error('rebound anchor missing');
    reboundAnchor.attemptIds = [...reboundAnchor.attemptIds, reboundAttemptId];
    reboundAnchor.lastAttemptId = reboundAttemptId;
    reboundAnchor.tipNodeId = reboundCommit.nodeId;
    reboundAnchor.status = 'committed';
    reboundAnchor.updatedAt = isoNow();
    await unboundAnchors.put(reboundAnchor);
    const reboundResolved = await restartedResolver.resolve(scope, unboundBase.nodeId, [{ id: 'unbound', role: 'assistant', content: 'continue-result', swipes: ['continue-result'], swipeId: 0 }]);
    assert(reboundResolved.health === 'ok' && reboundResolved.nodeId === reboundCommit.nodeId && reboundResolved.nodeId !== durablyCommitted.nodeId, 'superseded sibling orphan is not silently rebound or selected');
    console.log(`phase3 tests passed: ${passed}`);
}
void main();
//# sourceMappingURL=phase3.js.map