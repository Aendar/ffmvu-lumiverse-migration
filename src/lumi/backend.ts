import { AnchorStore, TranscriptAttemptStore, VariantIndexStore } from '../persistence/anchor-store.js';
import { createId, isoNow } from '../persistence/ids.js';
import { ACTIVE_PREFIX_FINGERPRINT_VERSION, type AnchorRecord, type StateScope, type TranscriptAttempt } from '../persistence/types.js';
import { HeadResolver } from '../head-resolver.js';
import { StateService } from '../service/state-service.js';
import { canonicalHash } from '../shared/hashing.js';
import { LEGACY_PROJECTION_VERSION } from '../shared/state-schema.js';
import { buildModelPatchAuthorizationView } from '../shared/patch-policy.js';
import { extractLastJsonPatch } from '../shared/model-output.js';
import { createProjectionRegistry } from '../shared/projection-registry.js';
import { createReducerRegistry } from '../shared/reducer-registry.js';
import { activePrefixHash } from '../transcript-fingerprint.js';
import { AttemptContextRegistry, EarlyGenerationRegistry } from './attempt-context.js';
import { filterTranscriptForGeneration, swipeObservations, toHostTranscript } from './host-adapter.js';
import { injectFrozenModelState } from './model-state-injector.js';
import type { GenerationEndedPayload, GenerationStartedPayload, GenerationStoppedPayload, LumiChatMessage, SpindleApiLite } from './spindle-lite.js';
import { UserStorageJsonAdapter } from './user-storage-adapter.js';

declare const spindle: SpindleApiLite;

const BRIDGE_VERSION = '0.4.3';
const PROMPT_PROTOCOL_VERSION = 'ffmvu-model-state-v1';
const PRESET_VERSION = 'FF5.2_MAX_MVU_v0.4.7.3 · Loom 69 Parity';
const CONFIG_PATH = 'bridge-config.json';
interface BridgeConfig { enabled: boolean }
interface UserRuntime {
  userId: string;
  state: StateService;
  anchors: AnchorStore;
  attempts: TranscriptAttemptStore;
  variants: VariantIndexStore;
  resolver: HeadResolver;
}

const runtimes = new Map<string, UserRuntime>();
const contexts = new AttemptContextRegistry();
const earlyGenerations = new EarlyGenerationRegistry();
const knownScopeByChat = new Map<string, StateScope>();
const lastStatusByUser = new Map<string, Record<string, unknown>>();
const knownFrontendUsers = new Set<string>();

function runtime(userId: string): UserRuntime {
  let found = runtimes.get(userId);
  if (found) return found;
  const storage = new UserStorageJsonAdapter(spindle.userStorage, userId);
  const state = new StateService(storage, createReducerRegistry(), createProjectionRegistry());
  const anchors = new AnchorStore(storage);
  const attempts = new TranscriptAttemptStore(storage);
  const variants = new VariantIndexStore(storage);
  found = { userId, state, anchors, attempts, variants, resolver: new HeadResolver(state.store, state.materializer, anchors, attempts, variants) };
  runtimes.set(userId, found);
  return found;
}

async function config(userId: string): Promise<BridgeConfig> {
  return spindle.userStorage.getJson<BridgeConfig>(CONFIG_PATH, { fallback: { enabled: false }, userId });
}
async function setConfig(userId: string, value: BridgeConfig): Promise<void> { await spindle.userStorage.setJson(CONFIG_PATH, value, { userId }); }

function registrationSnapshot(): Record<string, unknown> {
  return {
    contract: spindle.contracts?.preAssemblyGenerationContext ?? 0,
    permissions: {
      context_handler: spindle.permissions.has('context_handler'),
      interceptor: spindle.permissions.has('interceptor'),
      generation: spindle.permissions.has('generation'),
      chat_mutation: spindle.permissions.has('chat_mutation'),
    },
    registrations: {
      context: contextRegistered,
      interceptor: interceptorRegistered,
      generation: generationUnsubs.length > 0,
    },
  };
}

function publish(userId: string, status: Record<string, unknown>): void {
  const value = { bridgeVersion: BRIDGE_VERSION, at: isoNow(), ...registrationSnapshot(), ...status };
  lastStatusByUser.set(userId, value);
  spindle.sendToFrontend({ type: 'ffmvu_status', status: value }, userId);
}

async function ensureBootstrap(scope: StateScope, messages: LumiChatMessage[]): Promise<string> {
  const rt = runtime(scope.userId);
  const root = await rt.anchors.readRoot(scope);
  if (root) return root.baseNodeId;
  const transcript = toHostTranscript(messages);
  const last = transcript.at(-1);
  const boundary = last ? {
    throughMessageId: last.id,
    activePrefixHash: await activePrefixHash(transcript, last.id),
    fingerprintVersion: ACTIVE_PREFIX_FINGERPRINT_VERSION,
  } : undefined;
  const genesis = await rt.state.createGenesis(scope, {
    ...(boundary ? { transcriptBoundary: boundary } : {}),
    provenance: { source: 'lumiverse-live-probe', bridgeVersion: BRIDGE_VERSION, note: 'Fresh Lumi bootstrap; no legacy stat_data imported.' },
  });
  return genesis.nodeId;
}

async function prepareGeneration(context: { userId: string; chatId: string; generationType: string }, targetMessageId?: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const scope: StateScope = { userId: context.userId, chatId: context.chatId };
  knownScopeByChat.set(context.chatId, scope);
  if (contexts.getForScope(scope)) return { ok: false, reason: 'pending_generation_exists' };
  const rt = runtime(context.userId);
  const rawAll = await spindle.chat.getMessages(context.chatId);
  const raw = filterTranscriptForGeneration(rawAll, context.generationType, targetMessageId);
  const baseId = await ensureBootstrap(scope, raw);
  const head = await rt.resolver.resolve(scope, baseId, toHostTranscript(raw));
  if (head.health !== 'ok') return { ok: false, reason: `${head.health}: ${head.reason ?? 'head unresolved'}` };
  const projection = await rt.state.getProjectionForNode(scope, head.nodeId);
  const frozenAuthorization = buildModelPatchAuthorizationView(projection.view);
  contexts.create({
    scope, generationType: context.generationType, baseNodeId: head.nodeId, baseStateHash: head.stateHash,
    projectionSourceKind: projection.sourceKind,
    ...(projection.sourceNodeId ? { projectionSourceNodeId: projection.sourceNodeId } : {}),
    ...(projection.sourceStateHash ? { projectionSourceStateHash: projection.sourceStateHash } : {}),
    ...(projection.sourceBaseId ? { projectionSourceBaseId: projection.sourceBaseId } : {}),
    projectionVersion: projection.projectionVersion, promptProtocolVersion: projection.promptProtocolVersion,
    reducerVersion: projection.reducerVersion, projectionView: projection.view, promptViewHash: projection.viewHash,
    frozenAuthorization, presetVersion: PRESET_VERSION,
  });
  publish(context.userId, { phase: 'frozen', chatId: context.chatId, headNodeId: head.nodeId, headStateHash: head.stateHash, promptViewHash: projection.viewHash });
  return { ok: true };
}

async function finalizeModelCommit(payload: GenerationEndedPayload): Promise<void> {
  const pending = contexts.getByGeneration(payload.generationId);
  if (!pending) return;
  const userId = pending.scope.userId;

  const writeEvidence = async (
    saved: LumiChatMessage, variantId: string, swipeId: number, storedMessageTextHash: string,
    status: 'committed' | 'no_patch' | 'failed_patch' | 'unreconciled',
    modelCommitId: string | null, tipNodeId: string,
    hashes: { rawGenerationHash?: string; rawPatchPayloadHash?: string; canonicalPatchHash?: string },
  ) => {
    const rt = runtime(userId);
    const oldAnchor = await rt.anchors.read(pending.scope, variantId);
    const ordinal = (oldAnchor?.attemptIds.length ?? 0) + 1;
    const attempt: TranscriptAttempt = {
      id: pending.attemptId, scope: pending.scope, variantId, messageId: saved.id,
      generationId: payload.generationId, generationType: pending.generationType, ordinal,
      baseNodeId: pending.baseNodeId, baseStateHash: pending.baseStateHash,
      projectionSourceKind: pending.projectionSourceKind,
      ...(pending.projectionSourceNodeId ? { projectionSourceNodeId: pending.projectionSourceNodeId } : {}),
      ...(pending.projectionSourceStateHash ? { projectionSourceStateHash: pending.projectionSourceStateHash } : {}),
      ...(pending.projectionSourceBaseId ? { projectionSourceBaseId: pending.projectionSourceBaseId } : {}),
      projectionVersion: pending.projectionVersion, promptProtocolVersion: pending.promptProtocolVersion, promptViewHash: pending.promptViewHash,
      ...(pending.presetVersion ? { presetVersion: pending.presetVersion } : {}),
      modelCommitId, status, ...hashes, storedMessageTextHash, createdAt: pending.createdAt,
    };
    await rt.attempts.append(attempt);
    const anchor: AnchorRecord = oldAnchor ?? {
      variantId, scope: pending.scope, messageId: saved.id, observedSwipeIndex: swipeId,
      initialBaseNodeId: pending.baseNodeId, initialBaseStateHash: pending.baseStateHash,
      attemptIds: [], storedMessageTextHash, tipNodeId, status, createdAt: isoNow(), updatedAt: isoNow(),
    };
    anchor.observedSwipeIndex = swipeId;
    anchor.attemptIds = [...anchor.attemptIds, attempt.id];
    anchor.lastAttemptId = attempt.id;
    anchor.storedMessageTextHash = storedMessageTextHash;
    anchor.tipNodeId = tipNodeId;
    anchor.status = status;
    anchor.updatedAt = isoNow();
    await rt.anchors.put(anchor);
  };

  try {
    if (payload.error || !payload.messageId) {
      publish(userId, { phase: 'generation_error', chatId: payload.chatId, generationId: payload.generationId, error: payload.error ?? 'saved message id missing' });
      return;
    }
    const rt = runtime(userId);
    const messages = await spindle.chat.getMessages(payload.chatId);
    const saved = messages.find(message => message.id === payload.messageId);
    if (!saved) {
      publish(userId, { phase: 'unreconciled', chatId: payload.chatId, generationId: payload.generationId, reason: 'GENERATION_ENDED messageId not found in chat' });
      return;
    }
    const reconciled = await rt.variants.reconcileWholesale(pending.scope, saved.id, swipeObservations(saved));
    if (reconciled.status !== 'ok' || !reconciled.index) {
      publish(userId, { phase: 'unreconciled', chatId: payload.chatId, messageId: saved.id, reason: reconciled.reason ?? 'variant reconciliation ambiguous' });
      return;
    }
    const swipeId = Number.isInteger(saved.swipe_id) ? saved.swipe_id : 0;
    const variantId = reconciled.index.bySwipeIndex[swipeId];
    if (!variantId) throw new Error('ACTIVE_VARIANT_ID_MISSING');
    const storedMessageTextHash = reconciled.index.swipeFingerprints[variantId]?.storedMessageTextHash;
    if (!storedMessageTextHash) throw new Error('ACTIVE_VARIANT_FINGERPRINT_MISSING');

    const storedText = Array.isArray(saved.swipes) && saved.swipes[swipeId] !== undefined ? String(saved.swipes[swipeId]) : String(saved.content ?? '');
    const rawGeneration = payload.content !== undefined ? String(payload.content) : storedText;
    const rawGenerationHash = await canonicalHash(rawGeneration);

    let extracted: ReturnType<typeof extractLastJsonPatch>;
    try { extracted = extractLastJsonPatch(rawGeneration); }
    catch (error) {
      await writeEvidence(saved, variantId, swipeId, storedMessageTextHash, 'failed_patch', null, pending.baseNodeId, { rawGenerationHash });
      publish(userId, { phase: 'failed_patch', chatId: payload.chatId, generationId: payload.generationId, messageId: saved.id, variantId, error: String(error) });
      return;
    }
    const rawPatchPayloadHash = extracted ? await canonicalHash(extracted.rawPayload) : undefined;

    const root = await rt.anchors.readRoot(pending.scope);
    if (!root) throw new Error('ROOT_ANCHOR_MISSING_AT_FINALIZE');
    const compatible = await rt.resolver.resolve(
      pending.scope, root.baseNodeId,
      toHostTranscript(filterTranscriptForGeneration(messages, pending.generationType, saved.id)),
    );
    if (compatible.health !== 'ok' || compatible.nodeId !== pending.baseNodeId || compatible.stateHash !== pending.baseStateHash) {
      await writeEvidence(saved, variantId, swipeId, storedMessageTextHash, 'unreconciled', null, pending.baseNodeId, { rawGenerationHash, ...(rawPatchPayloadHash ? { rawPatchPayloadHash } : {}) });
      publish(userId, { phase: 'model_commit_conflict', chatId: payload.chatId, generationId: payload.generationId, messageId: saved.id, variantId, expectedBaseNodeId: pending.baseNodeId, currentCompatibleNodeId: compatible.nodeId, health: compatible.health });
      return;
    }

    let finalized;
    try {
      finalized = await rt.state.finalizeModelAttempt(pending.scope, {
        expectedParentNodeId: pending.baseNodeId, expectedParentStateHash: pending.baseStateHash,
        patch: extracted?.operations ?? null, authorization: pending.frozenAuthorization,
        projectionVersion: pending.projectionVersion, promptProtocolVersion: pending.promptProtocolVersion,
        anchor: { messageId: saved.id, variantId, generationId: payload.generationId, attemptId: pending.attemptId, messageRole: 'assistant', lineageAnchorId: variantId },
        requestId: pending.attemptId, rawGenerationHash,
        ...(rawPatchPayloadHash ? { rawPatchPayloadHash } : {}), storedMessageTextHash,
        ...(pending.presetVersion ? { presetVersion: pending.presetVersion } : {}),
      });
    } catch (error) {
      await writeEvidence(saved, variantId, swipeId, storedMessageTextHash, 'failed_patch', null, pending.baseNodeId, { rawGenerationHash, ...(rawPatchPayloadHash ? { rawPatchPayloadHash } : {}) });
      publish(userId, { phase: 'failed_patch', chatId: payload.chatId, generationId: payload.generationId, messageId: saved.id, variantId, error: String(error) });
      return;
    }

    await writeEvidence(saved, variantId, swipeId, storedMessageTextHash, finalized.status, finalized.modelCommitId, finalized.nodeId, {
      rawGenerationHash,
      ...(rawPatchPayloadHash ? { rawPatchPayloadHash } : {}),
      ...(finalized.canonicalPatchHash ? { canonicalPatchHash: finalized.canonicalPatchHash } : {}),
    });
    publish(userId, {
      phase: 'commit_complete', chatId: payload.chatId, generationId: payload.generationId, messageId: saved.id, variantId,
      status: finalized.status, modelCommitId: finalized.modelCommitId, systemCommitId: finalized.systemCommitId,
      transactionId: finalized.transactionId, committedNodeIds: finalized.committedNodeIds,
      finalNodeId: finalized.nodeId, finalStateHash: finalized.stateHash,
      deliveredPromptViewHash: pending.promptViewHash, nextPromptViewHash: finalized.nextPromptViewHash,
      injectionMode: pending.injectionMode ?? 'interceptor_missed',
    });
  } catch (error) {
    spindle.log.error('[FFMVU] model finalization failed', error);
    publish(userId, { phase: 'commit_error', chatId: payload.chatId, generationId: payload.generationId, error: String(error) });
  } finally {
    contexts.release(pending);
  }
}

async function reconcileSwipePayload(payload: any, callbackUserId?: string): Promise<void> {
  const scope = callbackUserId ? { userId: callbackUserId, chatId: String(payload.chatId) } : knownScopeByChat.get(String(payload.chatId));
  if (!scope || !payload?.message) return;
  try {
    const result = await runtime(scope.userId).variants.reconcileWholesale(scope, String(payload.message.id), swipeObservations(payload.message));
    if (result.status === 'ambiguous') publish(scope.userId, { phase: 'variant_ambiguous', chatId: scope.chatId, messageId: payload.message.id, reason: result.reason });
  } catch (error) { spindle.log.warn('[FFMVU] swipe reconciliation failed', error); }
}

const contextHandler = async (context: import('./spindle-lite.js').ContextHandlerContext): Promise<import('./spindle-lite.js').ContextHandlerContext> => {
  const cfg = await config(context.userId);
  if (!cfg.enabled || context.dryRun || context.generationType === 'impersonate') return context;
  if (context.generationType === 'continue') {
    publish(context.userId, { phase: 'blocked', chatId: context.chatId, reason: 'continue state commits are gated in v0.5 pending append/fingerprint parity' });
    return { ...context, cancelGeneration: true };
  }
  if (!spindle.permissions.has('chat_mutation')) {
    publish(context.userId, { phase: 'blocked', chatId: context.chatId, reason: 'chat_mutation permission missing' });
    return { ...context, cancelGeneration: true };
  }
  try {
    const early = earlyGenerations.peek(context.chatId);
    const prepared = await prepareGeneration(context, early?.targetMessageId);
    if (!prepared.ok) {
      publish(context.userId, { phase: 'blocked', chatId: context.chatId, generationId: early?.generationId ?? null, reason: prepared.reason });
      return { ...context, cancelGeneration: true };
    }
    if (early) {
      const pending = contexts.bindGeneration(context.chatId, early.generationId, early.targetMessageId);
      if (pending) {
        earlyGenerations.take(context.chatId);
        publish(context.userId, {
          phase: 'generation_started',
          chatId: context.chatId,
          generationId: early.generationId,
          targetMessageId: early.targetMessageId ?? null,
          lifecycleOrder: 'generation_started_before_context_handler',
          injectionMode: pending.injectionMode ?? 'not_observed',
        });
      }
    }
    return { ...context, ffmvuFrozenAttempt: true };
  } catch (error) {
    spindle.log.error('[FFMVU] context freeze failed', error);
    publish(context.userId, { phase: 'blocked', chatId: context.chatId, reason: String(error) });
    return { ...context, cancelGeneration: true };
  }
};

const interceptorHandler = async (messages: import('./spindle-lite.js').LumiLlmMessage[], context: import('./spindle-lite.js').InterceptorContext) => {
  const pending = contexts.getForChat(context.chatId);
  if (!pending) return messages;
  const injected = injectFrozenModelState(messages, pending.projectionView);
  pending.injectionMode = injected.mode;
  publish(pending.scope.userId, { phase: 'injected', chatId: context.chatId, attemptId: pending.attemptId, mode: injected.mode, promptViewHash: pending.promptViewHash });
  if (injected.mode !== 'fallback') return injected.messages;
  return { messages: injected.messages, breakdown: [{ messageIndex: injected.messageIndex, name: 'FFMVU MODEL_STATE (frozen fallback)' }] };
};

let contextRegistered = false;
let interceptorRegistered = false;
let generationUnsubs: Array<() => void> = [];

function tryRegisterContext(): void {
  if (contextRegistered || !spindle.permissions.has('context_handler')) return;
  if ((spindle.contracts?.preAssemblyGenerationContext ?? 0) < 1) {
    spindle.log.error('[FFMVU] preAssemblyGenerationContext contract >=1 is required; context bridge stays inert.');
    return;
  }
  spindle.registerContextHandler(contextHandler, 20, { timeoutMs: 10_000 });
  contextRegistered = true;
  spindle.log.info('[FFMVU] Context Handler registered.');
}

function tryRegisterInterceptor(): void {
  if (interceptorRegistered || !spindle.permissions.has('interceptor')) return;
  spindle.registerInterceptor(interceptorHandler, 90);
  interceptorRegistered = true;
  spindle.log.info('[FFMVU] Prompt interceptor registered.');
}

function stopGenerationEvents(): void {
  for (const unsub of generationUnsubs.splice(0)) { try { unsub(); } catch {} }
}

function tryRegisterGenerationEvents(): void {
  if (generationUnsubs.length || !spindle.permissions.has('generation')) return;
  const add = (value: (() => void) | void) => { if (typeof value === 'function') generationUnsubs.push(value); };
  add(spindle.on('GENERATION_STARTED', (payload: GenerationStartedPayload) => {
    const pending = contexts.bindGeneration(payload.chatId, payload.generationId, payload.targetMessageId);
    if (!pending) {
      earlyGenerations.remember({
        generationId: payload.generationId,
        chatId: payload.chatId,
        ...(payload.targetMessageId ? { targetMessageId: payload.targetMessageId } : {}),
        ...(payload.generationType ? { generationType: payload.generationType } : {}),
      });
      for (const userId of knownFrontendUsers) {
        publish(userId, {
          phase: 'generation_waiting_context',
          chatId: payload.chatId,
          generationId: payload.generationId,
          targetMessageId: payload.targetMessageId ?? null,
          note: 'Lumiverse emitted GENERATION_STARTED before the Context Handler; cached for exact later correlation.',
        });
      }
      return;
    }
    publish(pending.scope.userId, { phase: 'generation_started', chatId: payload.chatId, generationId: payload.generationId, targetMessageId: payload.targetMessageId ?? null, injectionMode: pending.injectionMode ?? 'not_observed' });
  }));
  add(spindle.on('GENERATION_ENDED', async (payload: GenerationEndedPayload) => {
    earlyGenerations.forgetGeneration(payload.generationId);
    await finalizeModelCommit(payload);
  }));
  add(spindle.on('GENERATION_STOPPED', (payload: GenerationStoppedPayload) => {
    earlyGenerations.forgetGeneration(payload.generationId);
    const pending = contexts.getByGeneration(payload.generationId);
    if (!pending) return;
    publish(pending.scope.userId, { phase: 'stopped', chatId: payload.chatId, generationId: payload.generationId, partialContentHashPending: true, note: 'No state commit. Durable stopped output, if saved by host, will fail closed as unreconciled.' });
    contexts.release(pending);
  }));
  spindle.log.info('[FFMVU] Generation lifecycle subscriptions registered.');
}

function ensureRegistrations(): void {
  tryRegisterContext();
  tryRegisterInterceptor();
  tryRegisterGenerationEvents();
}

ensureRegistrations();
spindle.permissions.onChanged(({ permission, granted }) => {
  if (permission === 'context_handler' && granted) tryRegisterContext();
  if (permission === 'interceptor' && granted) tryRegisterInterceptor();
  if (permission === 'generation') {
    if (granted) tryRegisterGenerationEvents();
    else stopGenerationEvents();
  }
});

spindle.on('MESSAGE_SWIPED', (payload, userId) => reconcileSwipePayload(payload, userId));
spindle.on('SWIPE_EDITED', (payload, userId) => reconcileSwipePayload(payload, userId));

spindle.onFrontendMessage(async (payload: any, userId) => {
  knownFrontendUsers.add(userId);
  ensureRegistrations();
  if (payload?.type === 'ffmvu_get_status') {
    const cfg = await config(userId);
    spindle.sendToFrontend({ type: 'ffmvu_status', status: { bridgeVersion: BRIDGE_VERSION, enabled: cfg.enabled, ...registrationSnapshot(), ...(lastStatusByUser.get(userId) ?? { phase: 'idle' }) } }, userId);
    return;
  }
  if (payload?.type === 'ffmvu_set_enabled') {
    const enabled = payload.enabled === true;
    await setConfig(userId, { enabled });
    ensureRegistrations();
    publish(userId, { phase: enabled ? 'armed' : 'disabled', enabled, note: enabled ? 'v0.5 model commit pipeline armed. Invalid/conflicting patches fail closed.' : 'Bridge will not touch generations.' });
  }
});

spindle.permissions.onDenied?.(({ permission, operation }) => spindle.log.warn(`[FFMVU] permission denied: ${permission} for ${operation}`));
spindle.log.info(`[FFMVU] Lumiverse migration bridge v${BRIDGE_VERSION} loaded (v0.5 model commit pipeline).`);
