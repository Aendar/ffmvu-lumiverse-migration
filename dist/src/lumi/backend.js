import { AnchorStore, TranscriptAttemptStore, VariantIndexStore } from '../persistence/anchor-store.js';
import { isoNow } from '../persistence/ids.js';
import { ACTIVE_PREFIX_FINGERPRINT_VERSION } from '../persistence/types.js';
import { HeadResolver } from '../head-resolver.js';
import { StateService } from '../service/state-service.js';
import { canonicalHash } from '../shared/hashing.js';
import { LEGACY_PROJECTION_VERSION } from '../shared/state-schema.js';
import { createProjectionRegistry } from '../shared/projection-registry.js';
import { createReducerRegistry } from '../shared/reducer-registry.js';
import { activePrefixHash } from '../transcript-fingerprint.js';
import { AttemptContextRegistry } from './attempt-context.js';
import { swipeObservations, toHostTranscript } from './host-adapter.js';
import { injectFrozenModelState } from './model-state-injector.js';
import { UserStorageJsonAdapter } from './user-storage-adapter.js';
const BRIDGE_VERSION = '0.4.1';
const PROMPT_PROTOCOL_VERSION = 'ffmvu-model-state-v1';
const CONFIG_PATH = 'bridge-config.json';
const runtimes = new Map();
const contexts = new AttemptContextRegistry();
const knownScopeByChat = new Map();
const lastStatusByUser = new Map();
const knownFrontendUsers = new Set();
function runtime(userId) {
    let found = runtimes.get(userId);
    if (found)
        return found;
    const storage = new UserStorageJsonAdapter(spindle.userStorage, userId);
    const state = new StateService(storage, createReducerRegistry(), createProjectionRegistry());
    const anchors = new AnchorStore(storage);
    const attempts = new TranscriptAttemptStore(storage);
    const variants = new VariantIndexStore(storage);
    found = { userId, state, anchors, attempts, variants, resolver: new HeadResolver(state.store, state.materializer, anchors, attempts, variants) };
    runtimes.set(userId, found);
    return found;
}
async function config(userId) {
    return spindle.userStorage.getJson(CONFIG_PATH, { fallback: { enabled: false }, userId });
}
async function setConfig(userId, value) { await spindle.userStorage.setJson(CONFIG_PATH, value, { userId }); }
function registrationSnapshot() {
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
function publish(userId, status) {
    const value = { bridgeVersion: BRIDGE_VERSION, at: isoNow(), ...registrationSnapshot(), ...status };
    lastStatusByUser.set(userId, value);
    spindle.sendToFrontend({ type: 'ffmvu_status', status: value }, userId);
}
async function ensureBootstrap(scope, messages) {
    const rt = runtime(scope.userId);
    const root = await rt.anchors.readRoot(scope);
    if (root)
        return root.baseNodeId;
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
async function prepareGeneration(context) {
    const scope = { userId: context.userId, chatId: context.chatId };
    knownScopeByChat.set(context.chatId, scope);
    if (contexts.getForScope(scope))
        return { ok: false, reason: 'pending_generation_exists' };
    const rt = runtime(context.userId);
    const raw = await spindle.chat.getMessages(context.chatId);
    const baseId = await ensureBootstrap(scope, raw);
    const head = await rt.resolver.resolve(scope, baseId, toHostTranscript(raw));
    if (head.health !== 'ok')
        return { ok: false, reason: `${head.health}: ${head.reason ?? 'head unresolved'}` };
    const projection = await rt.state.getProjectionForNode(scope, head.nodeId);
    contexts.create({
        scope,
        generationType: context.generationType,
        baseNodeId: head.nodeId,
        baseStateHash: head.stateHash,
        projectionVersion: LEGACY_PROJECTION_VERSION,
        promptProtocolVersion: PROMPT_PROTOCOL_VERSION,
        projectionView: projection.view,
        promptViewHash: projection.viewHash,
    });
    publish(context.userId, { phase: 'frozen', chatId: context.chatId, headNodeId: head.nodeId, headStateHash: head.stateHash, promptViewHash: projection.viewHash });
    return { ok: true };
}
async function finalizeProbe(payload) {
    const pending = contexts.getByGeneration(payload.generationId);
    if (!pending)
        return;
    const userId = pending.scope.userId;
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
        if (!variantId)
            throw new Error('ACTIVE_VARIANT_ID_MISSING');
        const storedMessageTextHash = reconciled.index.swipeFingerprints[variantId]?.storedMessageTextHash;
        if (!storedMessageTextHash)
            throw new Error('ACTIVE_VARIANT_FINGERPRINT_MISSING');
        const oldAnchor = await rt.anchors.read(pending.scope, variantId);
        const ordinal = (oldAnchor?.attemptIds.length ?? 0) + 1;
        const attempt = {
            id: pending.attemptId,
            scope: pending.scope,
            variantId,
            messageId: saved.id,
            generationId: payload.generationId,
            generationType: pending.generationType,
            ordinal,
            baseNodeId: pending.baseNodeId,
            baseStateHash: pending.baseStateHash,
            projectionSourceKind: 'node',
            projectionSourceNodeId: pending.baseNodeId,
            projectionSourceStateHash: pending.baseStateHash,
            projectionVersion: pending.projectionVersion,
            promptProtocolVersion: pending.promptProtocolVersion,
            promptViewHash: pending.promptViewHash,
            modelCommitId: null,
            status: 'unreconciled',
            ...(payload.content !== undefined ? { rawGenerationHash: await canonicalHash(payload.content) } : {}),
            storedMessageTextHash,
            createdAt: pending.createdAt,
        };
        await rt.attempts.append(attempt);
        const anchor = oldAnchor ?? {
            variantId,
            scope: pending.scope,
            messageId: saved.id,
            observedSwipeIndex: swipeId,
            initialBaseNodeId: pending.baseNodeId,
            initialBaseStateHash: pending.baseStateHash,
            attemptIds: [],
            storedMessageTextHash,
            tipNodeId: pending.baseNodeId,
            status: 'unreconciled',
            createdAt: isoNow(),
            updatedAt: isoNow(),
        };
        anchor.observedSwipeIndex = swipeId;
        anchor.attemptIds = [...anchor.attemptIds, attempt.id];
        anchor.lastAttemptId = attempt.id;
        anchor.storedMessageTextHash = storedMessageTextHash;
        anchor.status = 'unreconciled';
        anchor.updatedAt = isoNow();
        await rt.anchors.put(anchor);
        publish(userId, {
            phase: 'probe_complete',
            chatId: payload.chatId,
            generationId: payload.generationId,
            messageId: saved.id,
            variantId,
            injectionMode: pending.injectionMode ?? 'interceptor_missed',
            note: 'Lifecycle correlation captured. Model state commit is intentionally disabled in v0.4; next stateful generation fails closed.',
        });
    }
    catch (error) {
        spindle.log.error('[FFMVU] probe finalization failed', error);
        publish(userId, { phase: 'probe_error', chatId: payload.chatId, generationId: payload.generationId, error: String(error) });
    }
    finally {
        contexts.release(pending);
    }
}
async function reconcileSwipePayload(payload, callbackUserId) {
    const scope = callbackUserId ? { userId: callbackUserId, chatId: String(payload.chatId) } : knownScopeByChat.get(String(payload.chatId));
    if (!scope || !payload?.message)
        return;
    try {
        const result = await runtime(scope.userId).variants.reconcileWholesale(scope, String(payload.message.id), swipeObservations(payload.message));
        if (result.status === 'ambiguous')
            publish(scope.userId, { phase: 'variant_ambiguous', chatId: scope.chatId, messageId: payload.message.id, reason: result.reason });
    }
    catch (error) {
        spindle.log.warn('[FFMVU] swipe reconciliation failed', error);
    }
}
const contextHandler = async (context) => {
    const cfg = await config(context.userId);
    if (!cfg.enabled || context.dryRun || context.generationType === 'impersonate')
        return context;
    if (!spindle.permissions.has('chat_mutation')) {
        publish(context.userId, { phase: 'blocked', chatId: context.chatId, reason: 'chat_mutation permission missing' });
        return { ...context, cancelGeneration: true };
    }
    try {
        const prepared = await prepareGeneration(context);
        if (!prepared.ok) {
            publish(context.userId, { phase: 'blocked', chatId: context.chatId, reason: prepared.reason });
            return { ...context, cancelGeneration: true };
        }
        return { ...context, ffmvuFrozenAttempt: true };
    }
    catch (error) {
        spindle.log.error('[FFMVU] context freeze failed', error);
        publish(context.userId, { phase: 'blocked', chatId: context.chatId, reason: String(error) });
        return { ...context, cancelGeneration: true };
    }
};
const interceptorHandler = async (messages, context) => {
    const pending = contexts.getForChat(context.chatId);
    if (!pending)
        return messages;
    const injected = injectFrozenModelState(messages, pending.projectionView);
    pending.injectionMode = injected.mode;
    publish(pending.scope.userId, { phase: 'injected', chatId: context.chatId, attemptId: pending.attemptId, mode: injected.mode, promptViewHash: pending.promptViewHash });
    if (injected.mode !== 'fallback')
        return injected.messages;
    return { messages: injected.messages, breakdown: [{ messageIndex: injected.messageIndex, name: 'FFMVU MODEL_STATE (frozen fallback)' }] };
};
let contextRegistered = false;
let interceptorRegistered = false;
let generationUnsubs = [];
function tryRegisterContext() {
    if (contextRegistered || !spindle.permissions.has('context_handler'))
        return;
    if ((spindle.contracts?.preAssemblyGenerationContext ?? 0) < 1) {
        spindle.log.error('[FFMVU] preAssemblyGenerationContext contract >=1 is required; context bridge stays inert.');
        return;
    }
    spindle.registerContextHandler(contextHandler, 20, { timeoutMs: 10_000 });
    contextRegistered = true;
    spindle.log.info('[FFMVU] Context Handler registered.');
}
function tryRegisterInterceptor() {
    if (interceptorRegistered || !spindle.permissions.has('interceptor'))
        return;
    spindle.registerInterceptor(interceptorHandler, 90);
    interceptorRegistered = true;
    spindle.log.info('[FFMVU] Prompt interceptor registered.');
}
function stopGenerationEvents() {
    for (const unsub of generationUnsubs.splice(0)) {
        try {
            unsub();
        }
        catch { }
    }
}
function tryRegisterGenerationEvents() {
    if (generationUnsubs.length || !spindle.permissions.has('generation'))
        return;
    const add = (value) => { if (typeof value === 'function')
        generationUnsubs.push(value); };
    add(spindle.on('GENERATION_STARTED', (payload) => {
        const pending = contexts.bindGeneration(payload.chatId, payload.generationId, payload.targetMessageId);
        if (!pending) {
            for (const userId of knownFrontendUsers) {
                publish(userId, { phase: 'generation_started_unmatched', chatId: payload.chatId, generationId: payload.generationId, targetMessageId: payload.targetMessageId ?? null, reason: 'GENERATION_STARTED observed but no frozen AttemptContext exists' });
            }
            return;
        }
        publish(pending.scope.userId, { phase: 'generation_started', chatId: payload.chatId, generationId: payload.generationId, targetMessageId: payload.targetMessageId ?? null, injectionMode: pending.injectionMode ?? 'not_observed' });
    }));
    add(spindle.on('GENERATION_ENDED', (payload) => finalizeProbe(payload)));
    add(spindle.on('GENERATION_STOPPED', (payload) => {
        const pending = contexts.getByGeneration(payload.generationId);
        if (!pending)
            return;
        publish(pending.scope.userId, { phase: 'stopped', chatId: payload.chatId, generationId: payload.generationId, partialContentHashPending: true, note: 'No state commit. Durable stopped output, if saved by host, will fail closed as unreconciled.' });
        contexts.release(pending);
    }));
    spindle.log.info('[FFMVU] Generation lifecycle subscriptions registered.');
}
function ensureRegistrations() {
    tryRegisterContext();
    tryRegisterInterceptor();
    tryRegisterGenerationEvents();
}
ensureRegistrations();
spindle.permissions.onChanged(({ permission, granted }) => {
    if (permission === 'context_handler' && granted)
        tryRegisterContext();
    if (permission === 'interceptor' && granted)
        tryRegisterInterceptor();
    if (permission === 'generation') {
        if (granted)
            tryRegisterGenerationEvents();
        else
            stopGenerationEvents();
    }
});
spindle.on('MESSAGE_SWIPED', (payload, userId) => reconcileSwipePayload(payload, userId));
spindle.on('SWIPE_EDITED', (payload, userId) => reconcileSwipePayload(payload, userId));
spindle.onFrontendMessage(async (payload, userId) => {
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
        publish(userId, { phase: enabled ? 'armed' : 'disabled', enabled, note: enabled ? 'Live P0 probe armed. Writes from model output remain disabled.' : 'Bridge will not touch generations.' });
    }
});
spindle.permissions.onDenied?.(({ permission, operation }) => spindle.log.warn(`[FFMVU] permission denied: ${permission} for ${operation}`));
spindle.log.info(`[FFMVU] Lumiverse migration bridge v${BRIDGE_VERSION} loaded (P0 live probe; model commits disabled).`);