import { AnchorStore, TranscriptAttemptStore, VariantIndexStore } from '../persistence/anchor-store.js';
import { createId, isoNow } from '../persistence/ids.js';
import { ACTIVE_PREFIX_FINGERPRINT_VERSION, type AnchorRecord, type PortableSnapshot, type StateScope, type TranscriptAttempt } from '../persistence/types.js';
import { HeadResolver } from '../head-resolver.js';
import { ModelPatchRejectedError, StateService } from '../service/state-service.js';
import { canonicalHash } from '../shared/hashing.js';
import { buildModelPatchAuthorizationView } from '../shared/patch-policy.js';
import { resolveContinueJsonPatchEvidence, resolveFinalJsonPatchEvidence } from '../shared/model-output.js';
import { createProjectionRegistry } from '../shared/projection-registry.js';
import { createReducerRegistry } from '../shared/reducer-registry.js';
import { CURRENT_REDUCER_VERSION, LEGACY_REDUCER_VERSION } from '../shared/state-schema.js';
import { computeRecentChanges, narrativeTimestampFromState } from '../shared/recent-changes.js';
import { computeRecentStateHistory } from '../shared/state-history.js';
import { assertGuiIntent } from '../shared/domain/gui-intents.js';
import { validateGameStartPayload, type GameStartPayload } from '../shared/domain/gamestart.js';
import { activePrefixHash } from '../transcript-fingerprint.js';
import { AttemptContextRegistry, EarlyGenerationRegistry, type FrozenAttemptContext } from './attempt-context.js';
import { filterTranscriptForGeneration, suppressChatHistoryBySourceIds, swipeObservations, toHostTranscript } from './host-adapter.js';
import { injectFrozenModelState } from './model-state-injector.js';
import { injectNarrativeHistoryContext } from './history-metadata.js';
import type { GenerationEndedPayload, GenerationStartedPayload, GenerationStoppedPayload, LumiChatMessage, MessageEditedPayload, SpindleApiLite, SwipeEventPayload } from './spindle-lite.js';
import { UserStorageJsonAdapter } from './user-storage-adapter.js';
import { DiagnosticTraceStore } from './diagnostic-trace.js';

declare const spindle: SpindleApiLite;

const BRIDGE_VERSION = '0.13.25';
const PRESET_VERSION = 'FF5.2_MAX_MVU_v0.4.12 · State Ownership + Familiar Interior';
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
const noPatchProbeUsers = new Set<string>();
const continueProbeUsers = new Set<string>();
const diagnosticTrace = new DiagnosticTraceStore(160);

function traceInternal(userId: string, event: string, detail: Record<string, unknown> = {}): void {
  diagnosticTrace.append(userId, { at: isoNow(), kind: 'internal', event, ...structuredClone(detail) });
}

function diagnosticError(error: unknown): Record<string, unknown> {
  return {
    error: String(error),
    ...(error instanceof Error && error.stack ? { stack: error.stack.split('\n').slice(0, 8).join('\n') } : {}),
  };
}

interface PatchFailureTelemetry {
  failureClass: string;
  failureMessage: string;
  failurePath?: string;
}

function classifyPatchFailure(error: unknown): PatchFailureTelemetry {
  const failureMessage = String(error);
  const pathMatch = failureMessage.match(/(?:Missing (?:replace|remove) path|path):\s*(\/[^\s]*)/i);
  let failureClass = 'model_patch_rejected';
  if (failureMessage.includes('MALFORMED_JSONPATCH_JSON')) failureClass = 'malformed_json';
  else if (failureMessage.includes('Missing replace path')) failureClass = 'missing_replace_path';
  else if (failureMessage.includes('Missing remove path')) failureClass = 'missing_remove_path';
  else if (failureMessage.includes('Model operation not allowed')) failureClass = 'forbidden_operation';
  else if (failureMessage.includes('MAX_PATCH_') || failureMessage.includes('MAX_POINTER_') || failureMessage.includes('MAX_SINGLE_VALUE_BYTES')) failureClass = 'resource_limit';
  else if (failureMessage.includes('Invalid model commit result')) failureClass = 'schema_validation';
  else if (failureMessage.toLowerCase().includes('authoriz')) failureClass = 'authorization';
  return {
    failureClass,
    failureMessage,
    ...(pathMatch?.[1] ? { failurePath: pathMatch[1] } : {}),
  };
}

function valueShape(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return { type: 'array', length: value.length };
  if (typeof value === 'object') return { type: 'object', keys: Object.keys(value as Record<string, unknown>).sort() };
  return { type: typeof value };
}

function summarizeFrozenAttempt(pending: FrozenAttemptContext | null): Record<string, unknown> | null {
  if (!pending) return null;
  return {
    attemptId: pending.attemptId,
    generationId: pending.generationId ?? null,
    generationType: pending.generationType,
    baseNodeId: pending.baseNodeId,
    baseStateHash: pending.baseStateHash,
    projectionSourceKind: pending.projectionSourceKind,
    projectionSourceNodeId: pending.projectionSourceNodeId ?? null,
    projectionSourceStateHash: pending.projectionSourceStateHash ?? null,
    projectionSourceBaseId: pending.projectionSourceBaseId ?? null,
    projectionVersion: pending.projectionVersion,
    promptProtocolVersion: pending.promptProtocolVersion,
    reducerVersion: pending.reducerVersion,
    promptViewHash: pending.promptViewHash,
    targetMessageId: pending.targetMessageId ?? null,
    targetSwipeId: Number.isInteger(pending.targetSwipeId) ? pending.targetSwipeId : null,
    injectionMode: pending.injectionMode ?? null,
    diagnosticNoPatchProbe: pending.diagnosticNoPatchProbe === true,
    diagnosticContinueProbe: pending.diagnosticContinueProbe === true,
    createdAt: pending.createdAt,
  };
}

async function buildDiagnosticSnapshot(userId: string, chatId: string): Promise<Record<string, unknown>> {
  const cfg = await config(userId);
  const report: Record<string, unknown> = {
    format: 'FFMVU-Diagnostic-Snapshot-v1',
    bridgeVersion: BRIDGE_VERSION,
    createdAt: isoNow(),
    chatId: chatId || null,
    enabled: cfg.enabled,
    registration: registrationSnapshot(),
    lastStatus: structuredClone(lastStatusByUser.get(userId) ?? null),
    trace: diagnosticTrace.list(userId),
    errors: [],
  };
  if (!chatId) return report;

  const errors = report.errors as Array<Record<string, unknown>>;
  const fail = (section: string, error: unknown) => errors.push({ section, ...diagnosticError(error) });
  const scope: StateScope = { userId, chatId };
  knownScopeByChat.set(chatId, scope);
  const rt = runtime(userId);
  const pending = contexts.getForScope(scope);
  report.runtime = {
    knownScope: knownScopeByChat.has(chatId),
    generationPending: Boolean(pending),
    pending: summarizeFrozenAttempt(pending),
    earlyGeneration: earlyGenerations.peek(chatId),
    noPatchProbeArmed: noPatchProbeUsers.has(userId),
    continueProbeArmed: continueProbeUsers.has(userId),
  };

  let messages: LumiChatMessage[] = [];
  try {
    messages = await spindle.chat.getMessages(chatId);
    const summaries: Array<Record<string, unknown>> = [];
    for (const message of messages.slice(-16)) {
      const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
      const text = Array.isArray(message.swipes) && message.swipes[swipeId] !== undefined
        ? String(message.swipes[swipeId])
        : String(message.content ?? '');
      summaries.push({
        id: message.id,
        role: message.role,
        swipeId,
        swipeCount: Array.isArray(message.swipes) ? message.swipes.length : 1,
        activeTextLength: text.length,
        activeTextHash: await canonicalHash(text),
        containsUpdateVariable: text.includes('<UpdateVariable>'),
        containsJsonPatch: text.includes('<JSONPatch>'),
      });
    }
    report.transcript = {
      messageCount: messages.length,
      assistantCount: messages.filter(message => message.role === 'assistant').length,
      userCount: messages.filter(message => message.role === 'user').length,
      lastMessages: summaries,
    };
  } catch (error) {
    fail('transcript', error);
  }

  let root: Awaited<ReturnType<AnchorStore['readRoot']>> = null;
  try {
    root = await rt.anchors.readRoot(scope);
    report.root = root ? {
      baseNodeId: root.baseNodeId,
      tipNodeId: root.tipNodeId,
      updatedAt: root.updatedAt,
    } : null;
  } catch (error) {
    fail('root', error);
  }

  try {
    const physical = await rt.state.store.resolveStoreHead(scope);
    report.storeHead = {
      status: physical.status,
      headHash: physical.headHash ?? null,
      revisionId: physical.head?.revisionId ?? null,
      previousStoreRevisionId: physical.head?.previousStoreRevisionId ?? null,
      semanticTipNodeId: physical.head?.semanticTipNodeId ?? null,
      semanticTipStateHash: physical.head?.semanticTipStateHash ?? null,
      committedArtifacts: physical.head?.committedArtifacts ?? [],
      candidates: physical.candidates ?? [],
      reason: physical.reason ?? null,
    };
  } catch (error) {
    fail('storeHead', error);
  }

  let head: import('../head-resolver.js').HeadResolution | null = null;
  if (root && messages.length) {
    try {
      head = await rt.resolver.resolve(scope, root.baseNodeId, toHostTranscript(messages));
      report.semanticHead = structuredClone(head);
    } catch (error) {
      fail('semanticHead', error);
    }
  } else if (root) {
    try {
      head = await rt.resolver.resolve(scope, root.baseNodeId, []);
      report.semanticHead = structuredClone(head);
    } catch (error) {
      fail('semanticHead', error);
    }
  } else {
    report.semanticHead = null;
  }

  if (head) {
    try {
      const node = await rt.state.store.readNode(scope, head.nodeId);
      report.headArtifact = node.type === 'base' ? {
        type: 'base',
        id: node.value.id,
        kind: node.value.kind,
        reducerVersion: node.value.reducerVersion,
        stateSchemaVersion: node.value.stateSchemaVersion,
        hasTranscriptBoundary: Boolean(node.value.transcriptBoundary),
      } : {
        type: 'commit',
        id: node.value.id,
        kind: node.value.kind,
        reducerVersion: node.value.reducerVersion,
        parentNodeId: node.value.parentNodeId,
        parentStateHash: node.value.parentStateHash,
        resultStateHash: node.value.resultStateHash,
        patchCount: node.value.patch.length,
        lineageAnchorId: node.value.anchor.lineageAnchorId ?? null,
        variantId: node.value.anchor.variantId ?? null,
        attemptId: node.value.anchor.attemptId ?? null,
        note: node.value.note ?? null,
      };
    } catch (error) {
      fail('headArtifact', error);
    }

    try {
      const materialized = await rt.state.materializer.materialize(scope, head.nodeId);
      const scene = materialized.state.Narrative.Scene as unknown as Record<string, unknown>;
      const hasHphRoot = Object.prototype.hasOwnProperty.call(scene, 'HPH');
      const hph = scene.HPH;
      const owners = hph && typeof hph === 'object' && !Array.isArray(hph)
        ? Object.entries(hph as Record<string, unknown>).map(([ownerId, owner]) => {
            const record = owner && typeof owner === 'object' && !Array.isArray(owner) ? owner as Record<string, unknown> : {};
            return {
              ownerId,
              shape: valueShape(owner),
              physiology: valueShape(record.Physiology),
              penis: valueShape(record.Penis),
              scrotum: valueShape(record.Scrotum),
              sex: valueShape(record.Sex),
            };
          })
        : [];
      report.materialized = {
        nodeId: materialized.nodeId,
        stateHash: materialized.stateHash,
        turn: Number(materialized.state.Narrative.Turn) || 0,
        sceneChanged: materialized.state.Narrative.Scene.Changed,
        hph: {
          hasRoot: hasHphRoot,
          rootShape: valueShape(hph),
          ownerCount: owners.length,
          owners,
        },
      };
    } catch (error) {
      fail('materialized', error);
    }

    try {
      const projection = await rt.state.getProjectionForNode(scope, head.nodeId);
      report.projection = {
        sourceKind: projection.sourceKind,
        sourceNodeId: projection.sourceNodeId ?? null,
        sourceStateHash: projection.sourceStateHash ?? null,
        sourceBaseId: projection.sourceBaseId ?? null,
        reducerVersion: projection.reducerVersion,
        projectionVersion: projection.projectionVersion,
        promptProtocolVersion: projection.promptProtocolVersion,
        viewHash: projection.viewHash,
      };
    } catch (error) {
      fail('projection', error);
    }
  }

  const branch: Array<Record<string, unknown>> = [];
  for (const message of messages.filter(message => message.role === 'assistant').slice(-12)) {
    try {
      const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
      const index = await rt.variants.read(scope, message.id);
      if (!index) {
        branch.push({ messageId: message.id, swipeId, variantIndex: null });
        continue;
      }
      const variantId = index.bySwipeIndex[swipeId] ?? null;
      const anchor = variantId ? await rt.anchors.read(scope, variantId) : null;
      const attempt = anchor?.lastAttemptId ? await rt.attempts.read(scope, anchor.lastAttemptId) : null;
      branch.push({
        messageId: message.id,
        swipeId,
        swipeCount: Object.keys(index.bySwipeIndex).length,
        variantId,
        variantFingerprintHash: variantId ? index.swipeFingerprints[variantId]?.storedMessageTextHash ?? null : null,
        indexUpdatedAt: index.updatedAt,
        anchor: anchor ? {
          status: anchor.status,
          observedSwipeIndex: anchor.observedSwipeIndex,
          initialBaseNodeId: anchor.initialBaseNodeId,
          initialBaseStateHash: anchor.initialBaseStateHash,
          attemptCount: anchor.attemptIds.length,
          lastAttemptId: anchor.lastAttemptId ?? null,
          tipNodeId: anchor.tipNodeId,
          storedMessageTextHash: anchor.storedMessageTextHash,
          updatedAt: anchor.updatedAt,
        } : null,
        lastAttempt: attempt ? {
          id: attempt.id,
          generationId: attempt.generationId ?? null,
          generationType: attempt.generationType,
          ordinal: attempt.ordinal,
          status: attempt.status,
          baseNodeId: attempt.baseNodeId,
          baseStateHash: attempt.baseStateHash,
          modelCommitId: attempt.modelCommitId,
          finalNodeId: attempt.finalNodeId ?? null,
          finalStateHash: attempt.finalStateHash ?? null,
          rawGenerationHash: attempt.rawGenerationHash ?? null,
          rawPatchPayloadHash: attempt.rawPatchPayloadHash ?? null,
          canonicalPatchHash: attempt.canonicalPatchHash ?? null,
          failureClass: attempt.failureClass ?? null,
          failureMessage: attempt.failureMessage ?? null,
          failurePath: attempt.failurePath ?? null,
          storedMessageTextHash: attempt.storedMessageTextHash,
          resolvesAttemptId: attempt.resolvesAttemptId ?? null,
        } : null,
      });
    } catch (error) {
      fail('branch:' + message.id, error);
    }
  }
  report.branch = branch;
  try {
    const rejected = (await rt.attempts.listForScope(scope)).filter(attempt => attempt.status === 'failed_patch');
    const byClass: Record<string, number> = {};
    for (const attempt of rejected) {
      const key = attempt.failureClass ?? 'legacy_failed_patch';
      byClass[key] = (byClass[key] ?? 0) + 1;
    }
    report.patchFailures = {
      total: rejected.length,
      byClass,
      recent: rejected.slice(-40).map(attempt => ({
        attemptId: attempt.id,
        messageId: attempt.messageId,
        variantId: attempt.variantId,
        generationId: attempt.generationId ?? null,
        generationType: attempt.generationType,
        baseNodeId: attempt.baseNodeId,
        baseStateHash: attempt.baseStateHash,
        failureClass: attempt.failureClass ?? 'legacy_failed_patch',
        failureMessage: attempt.failureMessage ?? null,
        failurePath: attempt.failurePath ?? null,
        rawGenerationHash: attempt.rawGenerationHash ?? null,
        rawPatchPayloadHash: attempt.rawPatchPayloadHash ?? null,
        createdAt: attempt.createdAt,
      })),
    };
  } catch (error) {
    fail('patchFailures', error);
  }
  report.trace = diagnosticTrace.list(userId);
  return report;
}

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
  diagnosticTrace.append(userId, { at: String(value.at), kind: 'status', ...structuredClone(status) });
  spindle.sendToFrontend({ type: 'ffmvu_status', status: value }, userId);
}

async function resolveGuiHead(rt: UserRuntime, scope: StateScope): Promise<{
  root: import('../persistence/types.js').RootAnchorRecord;
  messages: LumiChatMessage[];
  head: import('../head-resolver.js').HeadResolution;
}> {
  const root = await rt.anchors.readRoot(scope);
  if (!root) throw new Error('GUI_STATE_NOT_INITIALIZED');
  const messages = await spindle.chat.getMessages(scope.chatId);
  const head = await rt.resolver.resolve(scope, root.baseNodeId, toHostTranscript(messages));
  return { root, messages, head };
}

function sameGuiHead(
  a: import('../head-resolver.js').HeadResolution,
  b: import('../head-resolver.js').HeadResolution,
): boolean {
  return a.health === 'ok' && b.health === 'ok' &&
    a.nodeId === b.nodeId &&
    a.stateHash === b.stateHash &&
    (a.variantId ?? null) === (b.variantId ?? null);
}

async function bindGuiCommit(
  rt: UserRuntime,
  scope: StateScope,
  prior: import('../head-resolver.js').HeadResolution,
  committedNodeId: string,
): Promise<void> {
  if (prior.variantId) {
    const anchor = await rt.anchors.read(scope, prior.variantId);
    if (!anchor) throw new Error('GUI_LINEAGE_ANCHOR_MISSING');
    if (anchor.tipNodeId !== prior.nodeId) throw new Error('GUI_LINEAGE_TIP_CHANGED');
    anchor.tipNodeId = committedNodeId;
    anchor.updatedAt = isoNow();
    await rt.anchors.put(anchor);
    return;
  }
  const root = await rt.anchors.readRoot(scope);
  if (!root) throw new Error('GUI_ROOT_ANCHOR_MISSING');
  if (root.tipNodeId !== prior.nodeId) throw new Error('GUI_ROOT_TIP_CHANGED');
  root.tipNodeId = committedNodeId;
  root.updatedAt = isoNow();
  await rt.anchors.putRoot(root);
}

/**
 * Legacy heads are upgraded as soon as the extension observes them. This is
 * intentionally backend-owned: the user never has to manufacture a migration
 * draft merely to move to the schema shipped by this extension.
 */
async function bindStagedCheckpointRoot(
  rt: UserRuntime,
  scope: StateScope,
  prior: import('../head-resolver.js').HeadResolution,
  staged: import('../persistence/types.js').MaterializedState,
  boundary: import('../persistence/types.js').TranscriptBaseBoundary | undefined,
): Promise<import('../head-resolver.js').HeadResolution> {
  const currentMessages = await spindle.chat.getMessages(scope.chatId);
  let verificationMessages = currentMessages;

  if (boundary) {
    const boundaryIndex = currentMessages.findIndex(message => String(message.id) === boundary.throughMessageId);
    if (boundaryIndex < 0) throw new Error('CHECKPOINT_BOUNDARY_MESSAGE_MISSING');
    const actualHash = await activePrefixHash(toHostTranscript(currentMessages), boundary.throughMessageId);
    if (actualHash !== boundary.activePrefixHash) throw new Error('CHECKPOINT_TRANSCRIPT_CHANGED');
    verificationMessages = currentMessages.slice(0, boundaryIndex + 1);
  } else if (currentMessages.length) {
    throw new Error('CHECKPOINT_EMPTY_BOUNDARY_CHANGED');
  }

  const root = await rt.anchors.readRoot(scope);
  if (!root) throw new Error('CHECKPOINT_ROOT_ANCHOR_MISSING');
  const stillCurrent = await rt.resolver.resolve(scope, root.baseNodeId, toHostTranscript(verificationMessages));
  if (!sameGuiHead(prior, stillCurrent)) throw new Error('CHECKPOINT_STALE_SEMANTIC_HEAD');

  await rt.anchors.putRoot({
    anchorId: 'root',
    scope,
    baseNodeId: staged.nodeId,
    tipNodeId: staged.nodeId,
    updatedAt: isoNow(),
  });

  const verified = await rt.resolver.resolve(scope, staged.nodeId, toHostTranscript(verificationMessages));
  if (
    verified.health !== 'ok' ||
    verified.nodeId !== staged.nodeId ||
    verified.stateHash !== staged.stateHash
  ) throw new Error('CHECKPOINT_BINDING_VERIFICATION_FAILED');
  return verified;
}

/**
 * Legacy schema upgrades are checkpoint rebases at the exact current transcript
 * prefix. This preserves every message/swipe byte while avoiding dependence on
 * a possibly detached physical tip or stale VariantId anchor.
 */
async function autoMigrateLegacyHead(
  rt: UserRuntime,
  scope: StateScope,
  head: import('../head-resolver.js').HeadResolution,
  messages: LumiChatMessage[],
): Promise<import('../head-resolver.js').HeadResolution> {
  if (head.health !== 'ok') return head;
  const artifact = await rt.state.store.readNode(scope, head.nodeId);
  if (artifact.value.reducerVersion !== LEGACY_REDUCER_VERSION) return head;

  const transcript = toHostTranscript(messages);
  const last = transcript.at(-1);
  const boundary = last ? {
    throughMessageId: last.id,
    activePrefixHash: await activePrefixHash(transcript, last.id),
    fingerprintVersion: ACTIVE_PREFIX_FINGERPRINT_VERSION,
  } : undefined;

  const staged = await rt.state.stageLegacyMigrationCheckpoint(scope, {
    parentNodeId: head.nodeId,
    expectedParentStateHash: head.stateHash,
    ...(boundary ? { transcriptBoundary: boundary } : {}),
    requestId: createId('auto_schema_checkpoint'),
  });
  const verified = await bindStagedCheckpointRoot(rt, scope, head, staged, boundary);
  publish(scope.userId, {
    phase: 'schema_auto_migrated',
    migrationMode: 'transcript-checkpoint',
    chatId: scope.chatId,
    previousNodeId: head.nodeId,
    previousStateHash: head.stateHash,
    finalNodeId: staged.nodeId,
    finalStateHash: staged.stateHash,
    reducerVersion: artifact.value.reducerVersion + '→' + CURRENT_REDUCER_VERSION,
    transcriptMessagesPreserved: true,
  });
  return verified;
}

async function buildNarrativeHistoryContext(
  rt: UserRuntime,
  scope: StateScope,
  messages: LumiChatMessage[],
  currentHeadNodeId: string,
): Promise<{
  timestamps: Record<string, import('../shared/recent-changes.js').NarrativeTimestamp>;
  recentChanges: import('../shared/recent-changes.js').RecentChangesEnvelope | null;
  stateHistory: import('../shared/state-history.js').RecentStateHistoryEnvelope | null;
  baselineNodeId: string | null;
}> {
  const timestamps: Record<string, import('../shared/recent-changes.js').NarrativeTimestamp> = {};
  let baselineNodeId: string | null = null;
  const historyNodeIds: string[] = [];

  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    const index = await rt.variants.read(scope, message.id);
    if (!index) continue;
    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
    const variantId = index.bySwipeIndex[swipeId];
    if (!variantId) continue;
    const anchor = await rt.anchors.read(scope, variantId);
    if (!anchor?.lastAttemptId) continue;
    const attempt = await rt.attempts.read(scope, anchor.lastAttemptId);
    if (!attempt) continue;
    if (attempt.narrativeTimestamp) timestamps[message.id] = structuredClone(attempt.narrativeTimestamp);
    if (
      attempt.finalNodeId &&
      (attempt.status === 'committed' || attempt.status === 'no_patch')
    ) {
      baselineNodeId = attempt.finalNodeId;
      if (historyNodeIds.at(-1) !== attempt.finalNodeId) historyNodeIds.push(attempt.finalNodeId);
    }
  }

  let recentChanges: import('../shared/recent-changes.js').RecentChangesEnvelope | null = null;
  if (baselineNodeId && baselineNodeId !== currentHeadNodeId) {
    try {
      if (await rt.state.store.isNodeCommitted(scope, baselineNodeId)) {
        const before = await rt.state.materializer.materialize(scope, baselineNodeId);
        const after = await rt.state.materializer.materialize(scope, currentHeadNodeId);
        recentChanges = computeRecentChanges(before.state, after.state);
      }
    } catch (error) {
      spindle.log.warn('[FFMVU] RecentChanges derivation skipped', error);
    }
  }

  let stateHistory: import('../shared/state-history.js').RecentStateHistoryEnvelope | null = null;
  const activeHistoryNodes = [...historyNodeIds];
  if (activeHistoryNodes.at(-1) !== currentHeadNodeId) activeHistoryNodes.push(currentHeadNodeId);
  const boundedHistoryNodes = activeHistoryNodes.slice(-8);
  if (boundedHistoryNodes.length >= 2) {
    try {
      const materialized = [];
      for (const nodeId of boundedHistoryNodes) {
        if (!await rt.state.store.isNodeCommitted(scope, nodeId)) continue;
        materialized.push(await rt.state.materializer.materialize(scope, nodeId));
      }
      stateHistory = computeRecentStateHistory(
        materialized.map(item => item.state),
        { maxTracks: 12, maxChangesPerPath: 3 },
      );
    } catch (error) {
      spindle.log.warn('[FFMVU] StateTrail derivation skipped', error);
    }
  }

  return { timestamps, recentChanges, stateHistory, baselineNodeId };
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
  const isContinue = context.generationType === 'continue';
  const diagnosticContinueProbe = isContinue && continueProbeUsers.has(context.userId);
  let continueSnapshot: {
    messageId: string;
    swipeId: number;
    variantId: string;
    storedText: string;
    storedTextHash: string;
    swipeCount: number;
    messageCount: number;
    sourceIndex: number;
  } | null = null;

  if (isContinue) {
    for (let i = rawAll.length - 1; i >= 0; i--) {
      const candidate = rawAll[i];
      if (candidate.role !== 'assistant') continue;
      const index = await rt.variants.read(scope, candidate.id);
      if (!index) continue;
      const swipeId = Number.isInteger(candidate.swipe_id) ? candidate.swipe_id : 0;
      const variantId = index.bySwipeIndex[swipeId];
      if (!variantId) continue;
      const anchor = await rt.anchors.read(scope, variantId);
      if (!anchor || anchor.messageId !== candidate.id) continue;
      const refreshed = await refreshKnownVariantContent(rt, scope, candidate, swipeId);
      if (!refreshed || refreshed.variantId !== variantId) continue;
      const storedText = Array.isArray(candidate.swipes) && candidate.swipes[swipeId] !== undefined
        ? String(candidate.swipes[swipeId])
        : String(candidate.content ?? '');
      const storedTextHash = refreshed.storedMessageTextHash;
      continueSnapshot = {
        messageId: candidate.id,
        swipeId,
        variantId,
        storedText,
        storedTextHash,
        swipeCount: Array.isArray(candidate.swipes) ? candidate.swipes.length : 1,
        messageCount: rawAll.length,
        sourceIndex: i,
      };
      break;
    }
    if (!continueSnapshot) return { ok: false, reason: 'continue_source_variant_missing_or_dirty' };
    if (continueSnapshot.sourceIndex !== rawAll.length - 1) return { ok: false, reason: 'continue_target_must_be_last_transcript_message' };
  }

  let raw = isContinue && continueSnapshot
    ? rawAll.slice(0, continueSnapshot.sourceIndex + 1)
    : filterTranscriptForGeneration(rawAll, context.generationType, targetMessageId);

  // Lumiverse may transiently append an empty assistant target before the
  // Context Handler. If target correlation is absent or late, never treat that
  // uncommitted placeholder as historical assistant lineage.
  if (!isContinue && ['normal', 'regenerate', 'swipe'].includes(context.generationType)) {
    const tail = raw.at(-1);
    if (tail?.role === 'assistant') {
      const tailIndex = await rt.variants.read(scope, String(tail.id));
      const tailSwipe = Number.isInteger(tail.swipe_id) ? tail.swipe_id : 0;
      const tailText = Array.isArray(tail.swipes) && tail.swipes[tailSwipe] !== undefined
        ? String(tail.swipes[tailSwipe] ?? '')
        : String(tail.content ?? '');
      if (!tailIndex && tailText.length === 0) {
        traceInternal(context.userId, 'generation_placeholder_filtered', {
          chatId: context.chatId,
          generationType: context.generationType,
          messageId: String(tail.id),
          correlatedTargetMessageId: targetMessageId ?? null,
        });
        raw = raw.slice(0, -1);
      }
    }
  }

  const baseId = await ensureBootstrap(scope, raw);
  let head = await rt.resolver.resolve(scope, baseId, toHostTranscript(raw));
  let continueResolvesAttemptId: string | undefined;

  if (head.health !== 'ok') {
    const recoverableHealth = head.health === 'stopped_uncommitted' || head.health === 'failed_patch';
    if (!isContinue || !continueSnapshot || !recoverableHealth || head.variantId !== continueSnapshot.variantId) {
      return { ok: false, reason: `${head.health}: ${head.reason ?? 'head unresolved'}` };
    }

    const anchor = await rt.anchors.read(scope, continueSnapshot.variantId);
    if (!anchor?.lastAttemptId) return { ok: false, reason: 'continue_recovery_attempt_missing' };
    const lastAttempt = await rt.attempts.read(scope, anchor.lastAttemptId);
    if (!lastAttempt || lastAttempt.variantId !== continueSnapshot.variantId) return { ok: false, reason: 'continue_recovery_attempt_mismatch' };
    const unclosedJsonPatch =
      continueSnapshot.storedText.toLowerCase().lastIndexOf('<jsonpatch>') >
      continueSnapshot.storedText.toLowerCase().lastIndexOf('</jsonpatch>');
    const recoverableStopped = head.health === 'stopped_uncommitted' && lastAttempt.status === 'stopped';
    const recoverableFailed = head.health === 'failed_patch' && lastAttempt.status === 'failed_patch' && unclosedJsonPatch;
    if (!recoverableStopped && !recoverableFailed) {
      return { ok: false, reason: `${head.health}: active failed/stopped attempt is not append-recoverable` };
    }
    if (head.nodeId !== lastAttempt.baseNodeId || head.stateHash !== lastAttempt.baseStateHash) {
      return { ok: false, reason: 'continue_recovery_base_mismatch' };
    }
    continueResolvesAttemptId = lastAttempt.id;
    head = { health: 'ok', nodeId: lastAttempt.baseNodeId, stateHash: lastAttempt.baseStateHash, variantId: continueSnapshot.variantId };
  }

  head = await autoMigrateLegacyHead(rt, scope, head, raw);
  if (head.health !== 'ok') return { ok: false, reason: `${head.health}: ${head.reason ?? 'head unresolved after automatic schema migration'}` };

  let suppressedHistoryMessageIds: string[] = [];
  const baseArtifact = await rt.state.store.readNode(scope, baseId);
  if (
    baseArtifact.type === 'base' &&
    baseArtifact.value.kind === 'fork' &&
    baseArtifact.value.provenance?.source === 'portable-snapshot' &&
    baseArtifact.value.transcriptBoundary
  ) {
    const boundaryMessageId = baseArtifact.value.transcriptBoundary.throughMessageId;
    const boundaryIndex = rawAll.findIndex(message => String(message.id) === boundaryMessageId);
    if (boundaryIndex >= 0) {
      suppressedHistoryMessageIds = rawAll.slice(0, boundaryIndex + 1).map(message => String(message.id));
    }
  }

  const projection = await rt.state.getProjectionForNode(scope, head.nodeId);
  const frozenAuthorization = buildModelPatchAuthorizationView(projection.view);
  const historyContext = await buildNarrativeHistoryContext(rt, scope, raw, head.nodeId);
  const diagnosticNoPatchProbe = !isContinue && noPatchProbeUsers.has(context.userId);
  contexts.create({
    scope,
    generationType: context.generationType,
    baseNodeId: head.nodeId,
    baseStateHash: head.stateHash,
    projectionSourceKind: projection.sourceKind,
    ...(projection.sourceNodeId ? { projectionSourceNodeId: projection.sourceNodeId } : {}),
    ...(projection.sourceStateHash ? { projectionSourceStateHash: projection.sourceStateHash } : {}),
    ...(projection.sourceBaseId ? { projectionSourceBaseId: projection.sourceBaseId } : {}),
    projectionVersion: projection.projectionVersion,
    promptProtocolVersion: projection.promptProtocolVersion,
    reducerVersion: projection.reducerVersion,
    projectionView: projection.view,
    promptViewHash: projection.viewHash,
    frozenAuthorization,
    presetVersion: PRESET_VERSION,
    diagnosticNoPatchProbe,
    diagnosticContinueProbe,
    assistantNarrativeTimestamps: historyContext.timestamps,
    recentChanges: historyContext.recentChanges,
    stateHistory: historyContext.stateHistory,
    ...(suppressedHistoryMessageIds.length ? { suppressedHistoryMessageIds } : {}),
    ...(continueSnapshot ? {
      continuePreMessageId: continueSnapshot.messageId,
      continuePreSwipeId: continueSnapshot.swipeId,
      continuePreVariantId: continueSnapshot.variantId,
      continuePreStoredText: continueSnapshot.storedText,
      continuePreStoredTextHash: continueSnapshot.storedTextHash,
      continuePreSwipeCount: continueSnapshot.swipeCount,
      continuePreMessageCount: continueSnapshot.messageCount,
    } : {}),
    ...(continueResolvesAttemptId ? { continueResolvesAttemptId } : {}),
  });

  if (diagnosticNoPatchProbe) noPatchProbeUsers.delete(context.userId);
  if (diagnosticContinueProbe) continueProbeUsers.delete(context.userId);
  publish(context.userId, {
    phase: 'frozen',
    chatId: context.chatId,
    headNodeId: head.nodeId,
    headStateHash: head.stateHash,
    promptViewHash: projection.viewHash,
    diagnosticNoPatchProbe,
    diagnosticContinueProbe,
    noPatchProbeArmed: noPatchProbeUsers.has(context.userId),
    continueProbeArmed: continueProbeUsers.has(context.userId),
    narrativeHistoryTimestampCount: Object.keys(historyContext.timestamps).length,
    recentChangeDomains: historyContext.recentChanges ? Object.keys(historyContext.recentChanges).filter(key => key !== 'observedAt') : [],
    stateHistoryTrackCount: historyContext.stateHistory?.tracks.length ?? 0,
    suppressedHistoryMessageCount: suppressedHistoryMessageIds.length,
    ...(continueSnapshot ? {
      continuePreMessageId: continueSnapshot.messageId,
      continuePreSwipeId: continueSnapshot.swipeId,
      continuePreVariantId: continueSnapshot.variantId,
      continuePreStoredTextHash: continueSnapshot.storedTextHash,
    } : {}),
    ...(continueResolvesAttemptId ? { continueResolvesAttemptId } : {}),
  });
  return { ok: true };
}

async function finalizeContinueModelCommit(payload: GenerationEndedPayload, pending: FrozenAttemptContext): Promise<void> {
  const userId = pending.scope.userId;
  const rt = runtime(userId);

  try {
    if (payload.error) {
      publish(userId, { phase: 'generation_error', chatId: payload.chatId, generationId: payload.generationId, error: payload.error });
      return;
    }
    if (
      !pending.continuePreMessageId ||
      !Number.isInteger(pending.continuePreSwipeId) ||
      !pending.continuePreVariantId ||
      pending.continuePreStoredText === undefined ||
      !pending.continuePreStoredTextHash
    ) throw new Error('CONTINUE_CONTEXT_INCOMPLETE');

    const messages = await spindle.chat.getMessages(payload.chatId);
    if (pending.continuePreMessageCount !== undefined && messages.length !== pending.continuePreMessageCount) {
      throw new Error('CONTINUE_TRANSCRIPT_SHAPE_CHANGED: message count changed during generation');
    }

    const saved = messages.find(message => message.id === pending.continuePreMessageId);
    if (!saved) throw new Error('CONTINUE_TARGET_MESSAGE_MISSING');
    if (payload.messageId && payload.messageId !== saved.id) throw new Error('CONTINUE_MESSAGE_ID_CHANGED');

    const swipeId = Number.isInteger(saved.swipe_id) ? saved.swipe_id : 0;
    if (swipeId !== pending.continuePreSwipeId) throw new Error('CONTINUE_ACTIVE_SWIPE_CHANGED');
    const swipeCount = Array.isArray(saved.swipes) ? saved.swipes.length : 1;
    if (pending.continuePreSwipeCount !== undefined && swipeCount !== pending.continuePreSwipeCount) {
      throw new Error('CONTINUE_SWIPE_SET_CHANGED');
    }

    const indexBefore = await rt.variants.read(pending.scope, saved.id);
    if (!indexBefore) throw new Error('CONTINUE_VARIANT_INDEX_MISSING');
    if (indexBefore.bySwipeIndex[swipeId] !== pending.continuePreVariantId) throw new Error('CONTINUE_VARIANT_ID_CHANGED');
    if (indexBefore.swipeFingerprints[pending.continuePreVariantId]?.storedMessageTextHash !== pending.continuePreStoredTextHash) {
      throw new Error('CONTINUE_PRE_FINGERPRINT_CHANGED');
    }
    const oldAnchor = await rt.anchors.read(pending.scope, pending.continuePreVariantId);
    if (!oldAnchor || oldAnchor.messageId !== saved.id || oldAnchor.storedMessageTextHash !== pending.continuePreStoredTextHash) {
      throw new Error('CONTINUE_PRE_ANCHOR_CHANGED');
    }

    const postText = Array.isArray(saved.swipes) && saved.swipes[swipeId] !== undefined
      ? String(saved.swipes[swipeId])
      : String(saved.content ?? '');
    const postStoredTextHash = await canonicalHash(postText);

    const writeContinueEvidence = async (
      status: 'committed' | 'no_patch' | 'failed_patch' | 'unreconciled',
      modelCommitId: string | null,
      tipNodeId: string,
      hashes: { rawGenerationHash?: string; rawPatchPayloadHash?: string; canonicalPatchHash?: string },
      resolvesAttemptId?: string,
      failure?: PatchFailureTelemetry,
    ): Promise<void> => {
      const currentAnchor = await rt.anchors.read(pending.scope, pending.continuePreVariantId!);
      if (!currentAnchor) throw new Error('CONTINUE_ANCHOR_MISSING_AT_EVIDENCE_WRITE');
      const ordinal = currentAnchor.attemptIds.length + 1;
      const finalMaterialized = await rt.state.materializer.materialize(pending.scope, tipNodeId);
      const attempt: TranscriptAttempt = {
        id: pending.attemptId,
        scope: pending.scope,
        variantId: pending.continuePreVariantId!,
        messageId: saved.id,
        generationId: payload.generationId,
        generationType: 'continue',
        ordinal,
        baseNodeId: pending.baseNodeId,
        baseStateHash: pending.baseStateHash,
        projectionSourceKind: pending.projectionSourceKind,
        ...(pending.projectionSourceNodeId ? { projectionSourceNodeId: pending.projectionSourceNodeId } : {}),
        ...(pending.projectionSourceStateHash ? { projectionSourceStateHash: pending.projectionSourceStateHash } : {}),
        ...(pending.projectionSourceBaseId ? { projectionSourceBaseId: pending.projectionSourceBaseId } : {}),
        projectionVersion: pending.projectionVersion,
        promptProtocolVersion: pending.promptProtocolVersion,
        promptViewHash: pending.promptViewHash,
        ...(pending.presetVersion ? { presetVersion: pending.presetVersion } : {}),
        modelCommitId,
        status,
        ...hashes,
        ...(failure ?? {}),
        storedMessageTextHash: postStoredTextHash,
        finalNodeId: tipNodeId,
        finalStateHash: finalMaterialized.stateHash,
        narrativeTimestamp: narrativeTimestampFromState(finalMaterialized.state),
        ...(resolvesAttemptId ? { resolvesAttemptId } : {}),
        createdAt: pending.createdAt,
      };
      await rt.attempts.append(attempt);

      const observation = {
        text: postText,
        ...(saved.swipe_dates?.[swipeId] !== undefined ? { swipeDate: String(saved.swipe_dates[swipeId]) } : {}),
      };
      const preservedVariant = await rt.variants.applyUpdated(pending.scope, saved.id, swipeId, observation);
      if (preservedVariant !== pending.continuePreVariantId) throw new Error('CONTINUE_VARIANT_ID_NOT_PRESERVED');

      currentAnchor.observedSwipeIndex = swipeId;
      currentAnchor.attemptIds = [...currentAnchor.attemptIds, attempt.id];
      currentAnchor.lastAttemptId = attempt.id;
      currentAnchor.storedMessageTextHash = postStoredTextHash;
      currentAnchor.tipNodeId = tipNodeId;
      currentAnchor.status = status;
      currentAnchor.updatedAt = isoNow();
      await rt.anchors.put(currentAnchor);
    };

    let evidence: ReturnType<typeof resolveContinueJsonPatchEvidence>;
    try {
      evidence = resolveContinueJsonPatchEvidence(
        pending.continuePreStoredText,
        payload.content !== undefined ? String(payload.content) : undefined,
        postText,
      );
    } catch (error) {
      const message = String(error);
      const evidenceMismatch =
        message.includes('OUTPUT_PATCH_EVIDENCE_MISMATCH') ||
        message.includes('CONTINUE_PREFIX_MISMATCH') ||
        message.includes('CONTINUE_');
      const failure = evidenceMismatch ? undefined : classifyPatchFailure(error);
      await writeContinueEvidence(evidenceMismatch ? 'unreconciled' : 'failed_patch', null, pending.baseNodeId, {}, undefined, failure);
      publish(userId, {
        phase: evidenceMismatch ? 'output_evidence_mismatch' : 'failed_patch',
        chatId: payload.chatId,
        generationId: payload.generationId,
        messageId: saved.id,
        variantId: pending.continuePreVariantId,
        generationType: 'continue',
        error: message,
      });
      return;
    }

    if (pending.continueResolvesAttemptId) {
      const resolvedAttempt = await rt.attempts.read(pending.scope, pending.continueResolvesAttemptId);
      if (!resolvedAttempt) throw new Error('CONTINUE_RESOLUTION_ATTEMPT_MISSING');
      if (resolvedAttempt.status === 'failed_patch' && (!evidence.selected || !evidence.selectedCrossesBoundary)) {
        await writeContinueEvidence('failed_patch', null, pending.baseNodeId, {
          rawGenerationHash: await canonicalHash(evidence.appendedSegment),
        });
        publish(userId, {
          phase: 'failed_patch',
          chatId: payload.chatId,
          generationId: payload.generationId,
          messageId: saved.id,
          variantId: pending.continuePreVariantId,
          generationType: 'continue',
          error: 'CONTINUE_FAILED_PATCH_NOT_COMPLETED_ACROSS_BOUNDARY',
        });
        return;
      }
    }

    const segmentHash = await canonicalHash(evidence.appendedSegment);
    const rawPatchPayloadHash = evidence.selected ? await canonicalHash(evidence.selected.rawPayload) : undefined;
    const baseEvidenceHashes = {
      rawGenerationHash: segmentHash,
      ...(rawPatchPayloadHash ? { rawPatchPayloadHash } : {}),
    };

    const root = await rt.anchors.readRoot(pending.scope);
    if (!root) throw new Error('ROOT_ANCHOR_MISSING_AT_CONTINUE_FINALIZE');
    const preMessages = structuredClone(messages);
    const preSaved = preMessages.find(message => message.id === pending.continuePreMessageId);
    if (!preSaved) throw new Error('CONTINUE_PRE_TRANSCRIPT_TARGET_MISSING');
    if (Array.isArray(preSaved.swipes) && preSaved.swipes.length) {
      preSaved.swipes[swipeId] = pending.continuePreStoredText;
    } else {
      preSaved.swipes = [pending.continuePreStoredText];
    }
    preSaved.swipe_id = swipeId;
    preSaved.content = pending.continuePreStoredText;

    const compatible = await rt.resolver.resolve(pending.scope, root.baseNodeId, toHostTranscript(preMessages));
    if (pending.continueResolvesAttemptId) {
      const prior = await rt.attempts.read(pending.scope, pending.continueResolvesAttemptId);
      const expectedHealth = prior?.status === 'stopped' ? 'stopped_uncommitted' : prior?.status === 'failed_patch' ? 'failed_patch' : null;
      if (
        !expectedHealth ||
        compatible.health !== expectedHealth ||
        compatible.variantId !== pending.continuePreVariantId ||
        compatible.nodeId !== pending.baseNodeId ||
        compatible.stateHash !== pending.baseStateHash
      ) {
        await writeContinueEvidence('unreconciled', null, pending.baseNodeId, baseEvidenceHashes);
        publish(userId, {
          phase: 'model_commit_conflict',
          chatId: payload.chatId,
          generationId: payload.generationId,
          messageId: saved.id,
          variantId: pending.continuePreVariantId,
          expectedBaseNodeId: pending.baseNodeId,
          currentCompatibleNodeId: compatible.nodeId,
          health: compatible.health,
          generationType: 'continue',
        });
        return;
      }
    } else if (
      compatible.health !== 'ok' ||
      compatible.nodeId !== pending.baseNodeId ||
      compatible.stateHash !== pending.baseStateHash ||
      compatible.variantId !== pending.continuePreVariantId
    ) {
      await writeContinueEvidence('unreconciled', null, pending.baseNodeId, baseEvidenceHashes);
      publish(userId, {
        phase: 'model_commit_conflict',
        chatId: payload.chatId,
        generationId: payload.generationId,
        messageId: saved.id,
        variantId: pending.continuePreVariantId,
        expectedBaseNodeId: pending.baseNodeId,
        currentCompatibleNodeId: compatible.nodeId,
        health: compatible.health,
        generationType: 'continue',
      });
      return;
    }

    let finalized;
    try {
      finalized = await rt.state.finalizeModelAttempt(pending.scope, {
        expectedParentNodeId: pending.baseNodeId,
        expectedParentStateHash: pending.baseStateHash,
        patch: evidence.selected?.operations ?? null,
        authorization: pending.frozenAuthorization,
        projectionVersion: pending.projectionVersion,
        promptProtocolVersion: pending.promptProtocolVersion,
        anchor: {
          messageId: saved.id,
          variantId: pending.continuePreVariantId,
          generationId: payload.generationId,
          attemptId: pending.attemptId,
          messageRole: 'assistant',
          lineageAnchorId: pending.continuePreVariantId,
        },
        requestId: pending.attemptId,
        rawGenerationHash: segmentHash,
        ...(rawPatchPayloadHash ? { rawPatchPayloadHash } : {}),
        storedMessageTextHash: postStoredTextHash,
        ...(pending.presetVersion ? { presetVersion: pending.presetVersion } : {}),
      });
    } catch (error) {
      if (!(error instanceof ModelPatchRejectedError)) throw error;
      const failure = classifyPatchFailure(error);
      await writeContinueEvidence('failed_patch', null, pending.baseNodeId, baseEvidenceHashes, undefined, failure);
      publish(userId, {
        phase: 'failed_patch',
        chatId: payload.chatId,
        generationId: payload.generationId,
        messageId: saved.id,
        variantId: pending.continuePreVariantId,
        generationType: 'continue',
        error: String(error),
        failureClass: failure.failureClass,
        failurePath: failure.failurePath ?? null,
        stateMutationRejected: true,
        nextTurnAllowed: true,
      });
      return;
    }

    await writeContinueEvidence(
      finalized.status,
      finalized.modelCommitId,
      finalized.nodeId,
      {
        ...baseEvidenceHashes,
        ...(finalized.canonicalPatchHash ? { canonicalPatchHash: finalized.canonicalPatchHash } : {}),
      },
      pending.continueResolvesAttemptId,
    );

    publish(userId, {
      phase: 'commit_complete',
      chatId: payload.chatId,
      generationId: payload.generationId,
      messageId: saved.id,
      variantId: pending.continuePreVariantId,
      generationType: 'continue',
      status: finalized.status,
      modelCommitId: finalized.modelCommitId,
      systemCommitId: finalized.systemCommitId,
      transactionId: finalized.transactionId,
      committedNodeIds: finalized.committedNodeIds,
      finalNodeId: finalized.nodeId,
      finalStateHash: finalized.stateHash,
      deliveredPromptViewHash: pending.promptViewHash,
      nextPromptViewHash: finalized.nextPromptViewHash,
      injectionMode: pending.injectionMode ?? 'interceptor_missed',
      continueHostContentMode: evidence.hostContentMode,
      continueAppendedSegmentHash: segmentHash,
      continueAppendedSegmentLength: evidence.appendedSegment.length,
      continuePatchCrossedBoundary: evidence.selectedCrossesBoundary,
      ...(pending.continueResolvesAttemptId ? { resolvedAttemptId: pending.continueResolvesAttemptId } : {}),
    });
  } catch (error) {
    spindle.log.error('[FFMVU] Continue finalization failed', error);
    publish(userId, {
      phase: 'commit_error',
      chatId: payload.chatId,
      generationId: payload.generationId,
      generationType: 'continue',
      error: String(error),
    });
  } finally {
    contexts.release(pending);
  }
}

async function finalizeModelCommit(payload: GenerationEndedPayload): Promise<void> {
  const pending = contexts.claimFinalization(payload.generationId);
  if (!pending) {
    for (const userId of knownFrontendUsers) {
      traceInternal(userId, 'generation_ended_unclaimed', {
        chatId: payload.chatId,
        generationId: payload.generationId,
        messageId: payload.messageId ?? null,
        hasContent: payload.content !== undefined,
        error: payload.error ?? null,
      });
    }
    return;
  }
  const userId = pending.scope.userId;
  traceInternal(userId, 'generation_ended_claimed', {
    chatId: payload.chatId,
    generationId: payload.generationId,
    messageId: payload.messageId ?? null,
    generationType: pending.generationType,
    attemptId: pending.attemptId,
    hasContent: payload.content !== undefined,
    error: payload.error ?? null,
  });

  if (pending.generationType === 'continue' && !pending.diagnosticContinueProbe) {
    await finalizeContinueModelCommit(payload, pending);
    return;
  }

  if (pending.diagnosticContinueProbe) {
    try {
      const rawGeneration = payload.content !== undefined ? String(payload.content) : null;
      const messages = await spindle.chat.getMessages(payload.chatId);
      const byPayload = payload.messageId ? messages.find(message => message.id === payload.messageId) : undefined;
      const byPre = pending.continuePreMessageId ? messages.find(message => message.id === pending.continuePreMessageId) : undefined;
      const saved = byPayload ?? byPre;
      if (!saved) {
        publish(userId, {
          phase: 'continue_probe_unreconciled',
          chatId: payload.chatId,
          generationId: payload.generationId,
          payloadMessageId: payload.messageId ?? null,
          preMessageId: pending.continuePreMessageId ?? null,
          noStateCommit: true,
          reason: payload.error ?? 'resulting assistant message not found',
        });
        return;
      }

      const postSwipeId = Number.isInteger(saved.swipe_id) ? saved.swipe_id : 0;
      const postText = Array.isArray(saved.swipes) && saved.swipes[postSwipeId] !== undefined
        ? String(saved.swipes[postSwipeId])
        : String(saved.content ?? '');
      const preText = pending.continuePreStoredText ?? '';
      const sameMessageId = saved.id === pending.continuePreMessageId;
      const sameSwipeId = postSwipeId === pending.continuePreSwipeId;
      const prefixPreserved = sameMessageId && sameSwipeId && postText.startsWith(preText);
      const appendedSegment = prefixPreserved ? postText.slice(preText.length) : null;
      const rawGenerationHash = rawGeneration !== null ? await canonicalHash(rawGeneration) : null;
      const postStoredTextHash = await canonicalHash(postText);
      const appendedSegmentHash = appendedSegment !== null ? await canonicalHash(appendedSegment) : null;
      const rawEqualsAppendedSegment = rawGeneration !== null && appendedSegment !== null && rawGeneration === appendedSegment;
      const rawEqualsFullStored = rawGeneration !== null && rawGeneration === postText;
      const segmentProvable = sameMessageId && sameSwipeId && prefixPreserved && rawEqualsAppendedSegment;

      publish(userId, {
        phase: 'continue_probe_complete',
        chatId: payload.chatId,
        generationId: payload.generationId,
        generationType: pending.generationType,
        payloadMessageId: payload.messageId ?? null,
        generationStartTargetMessageId: pending.targetMessageId ?? null,
        generationStartTargetSwipeId: Number.isInteger(pending.targetSwipeId) ? pending.targetSwipeId : null,
        preMessageId: pending.continuePreMessageId ?? null,
        postMessageId: saved.id,
        sameMessageId,
        preSwipeId: Number.isInteger(pending.continuePreSwipeId) ? pending.continuePreSwipeId : null,
        postSwipeId,
        sameSwipeId,
        preVariantId: pending.continuePreVariantId ?? null,
        preSwipeCount: pending.continuePreSwipeCount ?? null,
        postSwipeCount: Array.isArray(saved.swipes) ? saved.swipes.length : 1,
        preMessageCount: pending.continuePreMessageCount ?? null,
        postMessageCount: messages.length,
        prefixPreserved,
        appendedSegmentLength: appendedSegment?.length ?? null,
        rawGenerationLength: rawGeneration?.length ?? null,
        rawGenerationHash,
        preStoredTextHash: pending.continuePreStoredTextHash ?? null,
        postStoredTextHash,
        appendedSegmentHash,
        rawEqualsAppendedSegment,
        rawEqualsFullStored,
        rawContainsUpdateVariable: rawGeneration?.includes('<UpdateVariable>') ?? false,
        rawContainsJsonPatch: rawGeneration?.includes('<JSONPatch>') ?? false,
        segmentProvable,
        deliveredPromptViewHash: pending.promptViewHash,
        baseNodeId: pending.baseNodeId,
        baseStateHash: pending.baseStateHash,
        modelCommitId: null,
        transactionId: null,
        noStateCommit: true,
        transcriptLeftUnreconciled: true,
        note: 'Diagnostic Continue spike only. Host append semantics were observed; no FFMVU state/variant/anchor finalize was performed.',
      });
    } catch (error) {
      spindle.log.error('[FFMVU] Continue probe failed', error);
      publish(userId, {
        phase: 'continue_probe_error',
        chatId: payload.chatId,
        generationId: payload.generationId,
        error: String(error),
        noStateCommit: true,
      });
    } finally {
      contexts.release(pending);
    }
    return;
  }

  const writeEvidence = async (
    saved: LumiChatMessage, variantId: string, swipeId: number, storedMessageTextHash: string,
    status: 'committed' | 'no_patch' | 'failed_patch' | 'unreconciled',
    modelCommitId: string | null, tipNodeId: string,
    hashes: { rawGenerationHash?: string; rawPatchPayloadHash?: string; canonicalPatchHash?: string },
    failure?: PatchFailureTelemetry,
  ) => {
    const rt = runtime(userId);
    const oldAnchor = await rt.anchors.read(pending.scope, variantId);
    const ordinal = (oldAnchor?.attemptIds.length ?? 0) + 1;
    const finalMaterialized = await rt.state.materializer.materialize(pending.scope, tipNodeId);
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
      modelCommitId, status, ...hashes, ...(failure ?? {}), storedMessageTextHash,
      finalNodeId: tipNodeId,
      finalStateHash: finalMaterialized.stateHash,
      narrativeTimestamp: narrativeTimestampFromState(finalMaterialized.state),
      createdAt: pending.createdAt,
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
    const rawGeneration = payload.content !== undefined ? String(payload.content) : undefined;
    const rawGenerationHash = rawGeneration !== undefined ? await canonicalHash(rawGeneration) : undefined;

    let evidence: ReturnType<typeof resolveFinalJsonPatchEvidence>;
    try { evidence = resolveFinalJsonPatchEvidence(rawGeneration, storedText); }
    catch (error) {
      const message = String(error);
      const evidenceMismatch = message.includes('OUTPUT_PATCH_EVIDENCE_MISMATCH');
      const hashes = rawGenerationHash ? { rawGenerationHash } : {};
      const failure = evidenceMismatch ? undefined : classifyPatchFailure(error);
      await writeEvidence(saved, variantId, swipeId, storedMessageTextHash, evidenceMismatch ? 'unreconciled' : 'failed_patch', null, pending.baseNodeId, hashes, failure);
      publish(userId, {
        phase: evidenceMismatch ? 'output_evidence_mismatch' : 'failed_patch',
        chatId: payload.chatId, generationId: payload.generationId, messageId: saved.id, variantId, error: message,
        diagnosticNoPatchProbe: pending.diagnosticNoPatchProbe === true,
        ...(failure ? { failureClass: failure.failureClass, failurePath: failure.failurePath ?? null, stateMutationRejected: true, nextTurnAllowed: true } : {}),
      });
      return;
    }
    const extracted = evidence.selected;
    const rawPatchPayloadHash = evidence.raw ? await canonicalHash(evidence.raw.rawPayload) : undefined;
    const baseEvidenceHashes = {
      ...(rawGenerationHash ? { rawGenerationHash } : {}),
      ...(rawPatchPayloadHash ? { rawPatchPayloadHash } : {}),
    };

    const root = await rt.anchors.readRoot(pending.scope);
    if (!root) throw new Error('ROOT_ANCHOR_MISSING_AT_FINALIZE');
    const compatible = await rt.resolver.resolve(
      pending.scope, root.baseNodeId,
      toHostTranscript(filterTranscriptForGeneration(messages, pending.generationType, saved.id)),
    );
    if (compatible.health !== 'ok' || compatible.nodeId !== pending.baseNodeId || compatible.stateHash !== pending.baseStateHash) {
      await writeEvidence(saved, variantId, swipeId, storedMessageTextHash, 'unreconciled', null, pending.baseNodeId, baseEvidenceHashes);
      publish(userId, { phase: 'model_commit_conflict', chatId: payload.chatId, generationId: payload.generationId, messageId: saved.id, variantId, expectedBaseNodeId: pending.baseNodeId, currentCompatibleNodeId: compatible.nodeId, health: compatible.health, diagnosticNoPatchProbe: pending.diagnosticNoPatchProbe === true });
      return;
    }

    let finalized;
    try {
      finalized = await rt.state.finalizeModelAttempt(pending.scope, {
        expectedParentNodeId: pending.baseNodeId, expectedParentStateHash: pending.baseStateHash,
        patch: extracted?.operations ?? null, authorization: pending.frozenAuthorization,
        projectionVersion: pending.projectionVersion, promptProtocolVersion: pending.promptProtocolVersion,
        anchor: { messageId: saved.id, variantId, generationId: payload.generationId, attemptId: pending.attemptId, messageRole: 'assistant', lineageAnchorId: variantId },
        requestId: pending.attemptId,
        ...(rawGenerationHash ? { rawGenerationHash } : {}),
        ...(rawPatchPayloadHash ? { rawPatchPayloadHash } : {}), storedMessageTextHash,
        ...(pending.presetVersion ? { presetVersion: pending.presetVersion } : {}),
      });
    } catch (error) {
      if (!(error instanceof ModelPatchRejectedError)) throw error;
      const failure = classifyPatchFailure(error);
      await writeEvidence(saved, variantId, swipeId, storedMessageTextHash, 'failed_patch', null, pending.baseNodeId, baseEvidenceHashes, failure);
      publish(userId, {
        phase: 'failed_patch', chatId: payload.chatId, generationId: payload.generationId, messageId: saved.id, variantId,
        error: String(error), diagnosticNoPatchProbe: pending.diagnosticNoPatchProbe === true,
        failureClass: failure.failureClass, failurePath: failure.failurePath ?? null,
        stateMutationRejected: true, nextTurnAllowed: true,
      });
      return;
    }

    await writeEvidence(saved, variantId, swipeId, storedMessageTextHash, finalized.status, finalized.modelCommitId, finalized.nodeId, {
      ...baseEvidenceHashes,
      ...(finalized.canonicalPatchHash ? { canonicalPatchHash: finalized.canonicalPatchHash } : {}),
    });
    publish(userId, {
      phase: 'commit_complete', chatId: payload.chatId, generationId: payload.generationId, messageId: saved.id, variantId,
      status: finalized.status, modelCommitId: finalized.modelCommitId, systemCommitId: finalized.systemCommitId,
      transactionId: finalized.transactionId, committedNodeIds: finalized.committedNodeIds,
      finalNodeId: finalized.nodeId, finalStateHash: finalized.stateHash,
      deliveredPromptViewHash: pending.promptViewHash, nextPromptViewHash: finalized.nextPromptViewHash,
      injectionMode: pending.injectionMode ?? 'interceptor_missed',
      diagnosticNoPatchProbe: pending.diagnosticNoPatchProbe === true,
    });
  } catch (error) {
    spindle.log.error('[FFMVU] model finalization failed', error);
    publish(userId, { phase: 'commit_error', chatId: payload.chatId, generationId: payload.generationId, error: String(error) });
  } finally {
    contexts.release(pending);
  }
}

async function reconcileStoppedGeneration(payload: GenerationStoppedPayload): Promise<void> {
  const pending = contexts.claimFinalization(payload.generationId);
  if (!pending) {
    for (const userId of knownFrontendUsers) {
      traceInternal(userId, 'generation_stopped_unclaimed', {
        chatId: payload.chatId,
        generationId: payload.generationId,
        contentLength: String(payload.content ?? '').length,
      });
    }
    return;
  }
  const userId = pending.scope.userId;
  traceInternal(userId, 'generation_stopped_claimed', {
    chatId: payload.chatId,
    generationId: payload.generationId,
    generationType: pending.generationType,
    attemptId: pending.attemptId,
    contentLength: String(payload.content ?? '').length,
  });

  if (pending.diagnosticContinueProbe) {
    try {
      publish(userId, {
        phase: 'continue_probe_stopped',
        chatId: payload.chatId,
        generationId: payload.generationId,
        rawPartialHash: await canonicalHash(String(payload.content ?? '')),
        noStateCommit: true,
        transcriptLeftUnreconciled: true,
      });
    } finally {
      contexts.release(pending);
    }
    return;
  }

  try {
    const rt = runtime(userId);
    const rawPartial = String(payload.content ?? '');
    const rawGenerationHash = await canonicalHash(rawPartial);
    const messages = await spindle.chat.getMessages(payload.chatId);

    let saved = pending.targetMessageId
      ? messages.find(message => message.id === pending.targetMessageId && message.role === 'assistant')
      : undefined;

    if (!saved && rawPartial) {
      const exactMatches = messages.filter(message => {
        if (message.role !== 'assistant') return false;
        const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
        const storedText = Array.isArray(message.swipes) && message.swipes[swipeId] !== undefined
          ? String(message.swipes[swipeId])
          : String(message.content ?? '');
        return storedText === rawPartial;
      });
      if (exactMatches.length === 1) saved = exactMatches[0];
    }

    if (!saved) {
      publish(userId, {
        phase: 'stopped',
        chatId: payload.chatId,
        generationId: payload.generationId,
        targetMessageId: pending.targetMessageId ?? null,
        targetSwipeId: Number.isInteger(pending.targetSwipeId) ? pending.targetSwipeId : null,
        durableVariant: false,
        rawPartialHash: rawGenerationHash,
        noStateCommit: true,
        note: 'No durable stopped assistant variant was provable at stop reconciliation time; no persistent attempt was invented.',
      });
      return;
    }

    const reconciled = await rt.variants.reconcileWholesale(pending.scope, saved.id, swipeObservations(saved));
    if (reconciled.status !== 'ok' || !reconciled.index) {
      publish(userId, {
        phase: 'stopped_unreconciled',
        chatId: payload.chatId,
        generationId: payload.generationId,
        messageId: saved.id,
        reason: reconciled.reason ?? 'variant reconciliation ambiguous',
        noStateCommit: true,
      });
      return;
    }

    const requestedSwipeId = Number.isInteger(pending.targetSwipeId) ? pending.targetSwipeId! : null;
    const swipeId = requestedSwipeId !== null && reconciled.index.bySwipeIndex[requestedSwipeId]
      ? requestedSwipeId
      : Number.isInteger(saved.swipe_id) ? saved.swipe_id : 0;
    const variantId = reconciled.index.bySwipeIndex[swipeId];
    if (!variantId) throw new Error('STOPPED_VARIANT_ID_MISSING');

    const storedMessageTextHash = reconciled.index.swipeFingerprints[variantId]?.storedMessageTextHash;
    if (!storedMessageTextHash) throw new Error('STOPPED_VARIANT_FINGERPRINT_MISSING');
    const storedText = Array.isArray(saved.swipes) && saved.swipes[swipeId] !== undefined
      ? String(saved.swipes[swipeId])
      : String(saved.content ?? '');

    const oldAnchor = await rt.anchors.read(pending.scope, variantId);
    const ordinal = (oldAnchor?.attemptIds.length ?? 0) + 1;
    const stoppedBase = await rt.state.materializer.materialize(pending.scope, pending.baseNodeId);
    const attempt: TranscriptAttempt = {
      id: pending.attemptId,
      scope: pending.scope,
      variantId,
      messageId: saved.id,
      generationId: payload.generationId,
      generationType: pending.generationType,
      ordinal,
      baseNodeId: pending.baseNodeId,
      baseStateHash: pending.baseStateHash,
      projectionSourceKind: pending.projectionSourceKind,
      ...(pending.projectionSourceNodeId ? { projectionSourceNodeId: pending.projectionSourceNodeId } : {}),
      ...(pending.projectionSourceStateHash ? { projectionSourceStateHash: pending.projectionSourceStateHash } : {}),
      ...(pending.projectionSourceBaseId ? { projectionSourceBaseId: pending.projectionSourceBaseId } : {}),
      projectionVersion: pending.projectionVersion,
      promptProtocolVersion: pending.promptProtocolVersion,
      promptViewHash: pending.promptViewHash,
      ...(pending.presetVersion ? { presetVersion: pending.presetVersion } : {}),
      modelCommitId: null,
      status: 'stopped',
      rawGenerationHash,
      storedMessageTextHash,
      finalNodeId: pending.baseNodeId,
      finalStateHash: stoppedBase.stateHash,
      narrativeTimestamp: narrativeTimestampFromState(stoppedBase.state),
      createdAt: pending.createdAt,
    };
    await rt.attempts.append(attempt);

    const anchor: AnchorRecord = oldAnchor ?? {
      variantId,
      scope: pending.scope,
      messageId: saved.id,
      observedSwipeIndex: swipeId,
      initialBaseNodeId: pending.baseNodeId,
      initialBaseStateHash: pending.baseStateHash,
      attemptIds: [],
      storedMessageTextHash,
      tipNodeId: pending.baseNodeId,
      status: 'stopped',
      createdAt: isoNow(),
      updatedAt: isoNow(),
    };
    anchor.observedSwipeIndex = swipeId;
    anchor.attemptIds = [...anchor.attemptIds, attempt.id];
    anchor.lastAttemptId = attempt.id;
    anchor.storedMessageTextHash = storedMessageTextHash;
    anchor.tipNodeId = pending.baseNodeId;
    anchor.status = 'stopped';
    anchor.updatedAt = isoNow();
    await rt.anchors.put(anchor);

    publish(userId, {
      phase: 'stopped_durable',
      chatId: payload.chatId,
      generationId: payload.generationId,
      messageId: saved.id,
      swipeId,
      variantId,
      status: 'stopped',
      transcriptHealth: 'stopped_uncommitted',
      baseNodeId: pending.baseNodeId,
      baseStateHash: pending.baseStateHash,
      deliveredPromptViewHash: pending.promptViewHash,
      rawPartialHash: rawGenerationHash,
      storedMessageTextHash,
      storedMatchesStoppedPayload: storedText === rawPartial,
      modelCommitId: null,
      transactionId: null,
      noStateCommit: true,
      note: 'Durable partial output recorded as stopped evidence. Stateful continuation is blocked until regenerate/delete/repair.',
    });
  } catch (error) {
    spindle.log.error('[FFMVU] stopped generation reconciliation failed', error);
    publish(userId, {
      phase: 'stopped_reconciliation_error',
      chatId: payload.chatId,
      generationId: payload.generationId,
      error: String(error),
      noStateCommit: true,
    });
  } finally {
    contexts.release(pending);
  }
}

async function refreshKnownVariantContent(
  rt: UserRuntime,
  scope: StateScope,
  message: LumiChatMessage,
  swipeId: number,
): Promise<{ variantId: string; storedMessageTextHash: string } | null> {
  if (message.role !== 'assistant') return null;
  const messageId = String(message.id);
  const index = await rt.variants.read(scope, messageId);
  if (!index) return null;
  const variantId = index.bySwipeIndex[swipeId];
  if (!variantId) return null;
  const observation = swipeObservations(message)[swipeId];
  if (!observation) return null;

  const preservedVariantId = await rt.variants.applyUpdated(scope, messageId, swipeId, observation);
  if (preservedVariantId !== variantId) throw new Error('VARIANT_ID_CHANGED_DURING_CONTENT_REFRESH');
  const refreshedIndex = await rt.variants.read(scope, messageId);
  const storedMessageTextHash = refreshedIndex?.swipeFingerprints[variantId]?.storedMessageTextHash;
  if (!storedMessageTextHash) throw new Error('REFRESHED_VARIANT_FINGERPRINT_MISSING');

  const anchor = await rt.anchors.read(scope, variantId);
  if (anchor) {
    if (anchor.messageId !== messageId) throw new Error('EDITED_VARIANT_ANCHOR_MESSAGE_MISMATCH');
    anchor.observedSwipeIndex = swipeId;
    anchor.storedMessageTextHash = storedMessageTextHash;
    anchor.updatedAt = isoNow();
    await rt.anchors.put(anchor);
  }
  return { variantId, storedMessageTextHash };
}

async function reconcileMessageEditPayload(payload: MessageEditedPayload, callbackUserId?: string): Promise<void> {
  const scope = callbackUserId ? { userId: callbackUserId, chatId: String(payload.chatId) } : knownScopeByChat.get(String(payload.chatId));
  if (!scope || !payload?.message || payload.message.role !== 'assistant') return;
  traceInternal(scope.userId, 'message_edited_received', {
    chatId: scope.chatId,
    messageId: payload.message.id,
    swipeId: Number.isInteger(payload.message.swipe_id) ? payload.message.swipe_id : 0,
  });
  try {
    const swipeId = Number.isInteger(payload.message.swipe_id) ? payload.message.swipe_id : 0;
    const refreshed = await refreshKnownVariantContent(runtime(scope.userId), scope, payload.message, swipeId);
    if (!refreshed) return;
    publish(scope.userId, {
      phase: 'assistant_content_edited',
      chatId: scope.chatId,
      messageId: payload.message.id,
      swipeId,
      variantId: refreshed.variantId,
      storedMessageTextHash: refreshed.storedMessageTextHash,
      noStateTransaction: true,
      stateEvidenceImmutable: true,
    });
  } catch (error) {
    spindle.log.warn('[FFMVU] assistant content edit reconciliation failed', error);
    publish(scope.userId, {
      phase: 'assistant_content_edit_error',
      chatId: scope.chatId,
      messageId: payload.message.id,
      error: String(error),
      noStateTransaction: true,
    });
  }
}

async function reconcileSwipePayload(payload: SwipeEventPayload, callbackUserId?: string): Promise<void> {
  const scope = callbackUserId ? { userId: callbackUserId, chatId: String(payload.chatId) } : knownScopeByChat.get(String(payload.chatId));
  if (!scope || !payload?.message) return;
  traceInternal(scope.userId, 'swipe_event_received', {
    chatId: scope.chatId,
    messageId: payload.message.id,
    action: payload.action ?? null,
    swipeId: Number.isInteger(payload.swipeId) ? payload.swipeId : null,
    previousSwipeId: Number.isInteger(payload.previousSwipeId) ? payload.previousSwipeId : null,
  });
  try {
    const rt = runtime(scope.userId);
    const messageId = String(payload.message.id);
    const observations = swipeObservations(payload.message);
    const typedAction = ['added', 'updated', 'deleted', 'navigated'].includes(String(payload.action))
      ? payload.action as 'added' | 'updated' | 'deleted' | 'navigated'
      : null;
    const result = typedAction && Number.isInteger(payload.swipeId)
      ? await rt.variants.reconcileTyped(scope, messageId, typedAction, Number(payload.swipeId), observations)
      : await rt.variants.reconcileWholesale(scope, messageId, observations);

    if (result.status === 'ok' && result.index && typedAction === 'updated' && Number.isInteger(payload.swipeId)) {
      const swipeId = Number(payload.swipeId);
      const variantId = result.index.bySwipeIndex[swipeId];
      const storedMessageTextHash = variantId ? result.index.swipeFingerprints[variantId]?.storedMessageTextHash : null;
      if (variantId && storedMessageTextHash) {
        const anchor = await rt.anchors.read(scope, variantId);
        if (anchor) {
          if (anchor.messageId !== messageId) throw new Error('EDITED_VARIANT_ANCHOR_MESSAGE_MISMATCH');
          anchor.observedSwipeIndex = swipeId;
          anchor.storedMessageTextHash = storedMessageTextHash;
          anchor.updatedAt = isoNow();
          await rt.anchors.put(anchor);
        }
      }
    }
    if (result.status === 'ambiguous') {
      publish(scope.userId, { phase: 'variant_ambiguous', chatId: scope.chatId, messageId: payload.message.id, reason: result.reason });
      return;
    }
    if (payload.action !== 'navigated' || !result.index) return;

    const swipeId = Number.isInteger(payload.swipeId) ? Number(payload.swipeId) :
      Number.isInteger(payload.message.swipe_id) ? payload.message.swipe_id : 0;
    const variantId = result.index.bySwipeIndex[swipeId] ?? null;
    const root = await rt.anchors.readRoot(scope);
    if (!root) {
      publish(scope.userId, {
        phase: 'swipe_navigation_unreconciled',
        chatId: scope.chatId,
        messageId: payload.message.id,
        swipeId,
        previousSwipeId: Number.isInteger(payload.previousSwipeId) ? payload.previousSwipeId : null,
        variantId,
        reason: 'root anchor missing',
        noStateTransaction: true,
      });
      return;
    }

    const messages = await spindle.chat.getMessages(scope.chatId);
    const head = await rt.resolver.resolve(scope, root.baseNodeId, toHostTranscript(messages));
    publish(scope.userId, {
      phase: 'swipe_navigated',
      chatId: scope.chatId,
      messageId: payload.message.id,
      swipeId,
      previousSwipeId: Number.isInteger(payload.previousSwipeId) ? payload.previousSwipeId : null,
      variantId,
      headHealth: head.health,
      headNodeId: head.nodeId,
      headStateHash: head.stateHash,
      ...(head.reason ? { reason: head.reason } : {}),
      noStateTransaction: true,
    });
  } catch (error) {
    spindle.log.warn('[FFMVU] swipe reconciliation failed', error);
    publish(scope.userId, { phase: 'swipe_navigation_error', chatId: scope.chatId, messageId: payload.message.id, error: String(error), noStateTransaction: true });
  }
}

const contextHandler = async (context: import('./spindle-lite.js').ContextHandlerContext): Promise<import('./spindle-lite.js').ContextHandlerContext> => {
  traceInternal(context.userId, 'context_handler_enter', {
    chatId: context.chatId,
    generationType: context.generationType,
    dryRun: context.dryRun,
  });
  const cfg = await config(context.userId);
  if (!cfg.enabled || context.dryRun || context.generationType === 'impersonate') {
    traceInternal(context.userId, 'context_handler_skipped', {
      chatId: context.chatId,
      generationType: context.generationType,
      enabled: cfg.enabled,
      dryRun: context.dryRun,
      impersonate: context.generationType === 'impersonate',
    });
    return context;
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
      const pending = contexts.bindGeneration(context.chatId, early.generationId, early.targetMessageId, early.targetSwipeId);
      if (pending) {
        earlyGenerations.take(context.chatId);
        publish(context.userId, {
          phase: 'generation_started',
          chatId: context.chatId,
          generationId: early.generationId,
          targetMessageId: early.targetMessageId ?? null,
          targetSwipeId: Number.isInteger(early.targetSwipeId) ? early.targetSwipeId : null,
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

const NO_PATCH_PROBE_INSTRUCTION = [
  '<FFMVU_DIAGNOSTIC_NO_PATCH_PROBE>',
  'ONE-ATTEMPT DIAGNOSTIC OVERRIDE.',
  'For this response only, produce ordinary roleplay prose but DO NOT emit <UpdateVariable>, <UpdateAnalysis>, <JSONPatch>, or any other machine/state-update block.',
  'This diagnostic override takes precedence over any lower-priority instruction that requires a state update block.',
  '</FFMVU_DIAGNOSTIC_NO_PATCH_PROBE>',
].join('\n');

function injectNoPatchProbe(messages: import('./spindle-lite.js').LumiLlmMessage[]): import('./spindle-lite.js').LumiLlmMessage[] {
  const out = structuredClone(messages);
  const index = out.findIndex(message => message.role === 'system' && typeof message.content === 'string');
  if (index >= 0) {
    out[index] = { ...out[index], content: String(out[index].content) + '\n\n' + NO_PATCH_PROBE_INSTRUCTION };
    return out;
  }
  return [{ role: 'system', content: NO_PATCH_PROBE_INSTRUCTION }, ...out];
}

const interceptorHandler = async (messages: import('./spindle-lite.js').LumiLlmMessage[], context: import('./spindle-lite.js').InterceptorContext) => {
  const pending = contexts.getForChat(context.chatId);
  if (!pending) {
    const scope = knownScopeByChat.get(context.chatId);
    if (scope) traceInternal(scope.userId, 'interceptor_without_pending_context', {
      chatId: context.chatId,
      generationType: context.generationType,
      messageCount: messages.length,
    });
    return messages;
  }
  traceInternal(pending.scope.userId, 'interceptor_enter', {
    chatId: context.chatId,
    attemptId: pending.attemptId,
    generationId: pending.generationId ?? null,
    generationType: pending.generationType,
    messageCount: messages.length,
  });
  const promptMessages = suppressChatHistoryBySourceIds(messages, pending.suppressedHistoryMessageIds ?? []);
  const injected = injectFrozenModelState(promptMessages, pending.projectionView);
  pending.injectionMode = injected.mode;
  const historyMessages = injectNarrativeHistoryContext(
    injected.messages,
    pending.assistantNarrativeTimestamps ?? {},
    pending.recentChanges ?? null,
    pending.stateHistory ?? null,
  );
  const finalMessages = pending.diagnosticNoPatchProbe ? injectNoPatchProbe(historyMessages) : historyMessages;
  publish(pending.scope.userId, {
    phase: 'injected', chatId: context.chatId, attemptId: pending.attemptId, mode: injected.mode,
    promptViewHash: pending.promptViewHash,
    diagnosticNoPatchProbe: pending.diagnosticNoPatchProbe === true,
    diagnosticContinueProbe: pending.diagnosticContinueProbe === true,
    narrativeHistoryTimestampCount: Object.keys(pending.assistantNarrativeTimestamps ?? {}).length,
    recentChangeDomains: pending.recentChanges ? Object.keys(pending.recentChanges).filter(key => key !== 'observedAt') : [],
    stateHistoryTrackCount: pending.stateHistory?.tracks.length ?? 0,
    suppressedHistoryMessageCount: pending.suppressedHistoryMessageIds?.length ?? 0,
  });
  if (injected.mode !== 'fallback') return finalMessages;
  return { messages: finalMessages, breakdown: [{ messageIndex: injected.messageIndex, name: 'FFMVU MODEL_STATE (frozen fallback)' }] };
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
    const pending = contexts.bindGeneration(payload.chatId, payload.generationId, payload.targetMessageId, payload.targetSwipeId);
    if (!pending) {
      earlyGenerations.remember({
        generationId: payload.generationId,
        chatId: payload.chatId,
        ...(payload.targetMessageId ? { targetMessageId: payload.targetMessageId } : {}),
        ...(Number.isInteger(payload.targetSwipeId) ? { targetSwipeId: payload.targetSwipeId } : {}),
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
    publish(pending.scope.userId, { phase: 'generation_started', chatId: payload.chatId, generationId: payload.generationId, targetMessageId: payload.targetMessageId ?? null, targetSwipeId: Number.isInteger(payload.targetSwipeId) ? payload.targetSwipeId : null, injectionMode: pending.injectionMode ?? 'not_observed' });
  }));
  add(spindle.on('GENERATION_ENDED', async (payload: GenerationEndedPayload) => {
    earlyGenerations.forgetGeneration(payload.generationId);
    await finalizeModelCommit(payload);
  }));
  add(spindle.on('GENERATION_STOPPED', async (payload: GenerationStoppedPayload) => {
    earlyGenerations.forgetGeneration(payload.generationId);
    await reconcileStoppedGeneration(payload);
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

spindle.on('MESSAGE_EDITED', (payload, userId) => reconcileMessageEditPayload(payload, userId));
spindle.on('MESSAGE_SWIPED', (payload, userId) => reconcileSwipePayload(payload, userId));
spindle.on('SWIPE_EDITED', (payload, userId) => reconcileSwipePayload(payload, userId));

spindle.onFrontendMessage(async (payload: any, userId) => {
  knownFrontendUsers.add(userId);
  ensureRegistrations();
  if (payload?.type === 'ffmvu_get_status') {
    const cfg = await config(userId);
    spindle.sendToFrontend({ type: 'ffmvu_status', status: { bridgeVersion: BRIDGE_VERSION, ...registrationSnapshot(), ...(lastStatusByUser.get(userId) ?? { phase: 'idle' }), enabled: cfg.enabled, noPatchProbeArmed: noPatchProbeUsers.has(userId), continueProbeArmed: continueProbeUsers.has(userId) } }, userId);
    return;
  }
  if (payload?.type === 'ffmvu_diagnostic_clear_trace') {
    diagnosticTrace.clear(userId);
    traceInternal(userId, 'diagnostic_trace_cleared', { chatId: String(payload.chatId ?? '') || null });
    spindle.sendToFrontend({
      type: 'ffmvu_diagnostic_trace_cleared',
      ok: true,
      chatId: String(payload.chatId ?? '') || null,
    }, userId);
    return;
  }
  if (payload?.type === 'ffmvu_diagnostic_snapshot') {
    const chatId = String(payload.chatId ?? '');
    traceInternal(userId, 'diagnostic_snapshot_requested', { chatId: chatId || null });
    try {
      const report = await buildDiagnosticSnapshot(userId, chatId);
      spindle.sendToFrontend({ type: 'ffmvu_diagnostic_snapshot_result', ok: true, chatId: chatId || null, report }, userId);
    } catch (error) {
      const detail = diagnosticError(error);
      traceInternal(userId, 'diagnostic_snapshot_error', { chatId: chatId || null, ...detail });
      spindle.sendToFrontend({
        type: 'ffmvu_diagnostic_snapshot_result',
        ok: false,
        chatId: chatId || null,
        reason: String(error),
        detail,
      }, userId);
    }
    return;
  }
  if (payload?.type === 'ffmvu_export_snapshot') {
    const chatId = String(payload.chatId ?? '');
    const expectedHeadNodeId = String(payload.expectedHeadNodeId ?? '');
    const expectedHeadStateHash = String(payload.expectedHeadStateHash ?? '');
    const requestId = String(payload.requestId ?? createId('snapshot'));
    if (!chatId || !expectedHeadNodeId || !expectedHeadStateHash) {
      spindle.sendToFrontend({
        type: 'ffmvu_snapshot_export_result', ok: false, requestId, chatId: chatId || null,
        reason: 'SNAPSHOT_EXPECTED_HEAD_REQUIRED',
      }, userId);
      return;
    }
    const scope: StateScope = { userId, chatId };
    knownScopeByChat.set(chatId, scope);
    if (contexts.getForScope(scope)) {
      spindle.sendToFrontend({
        type: 'ffmvu_snapshot_export_result', ok: false, requestId, chatId,
        reason: 'SNAPSHOT_BLOCKED_DURING_GENERATION',
      }, userId);
      return;
    }
    try {
      const rt = runtime(userId);
      const before = await resolveGuiHead(rt, scope);
      if (
        before.head.health !== 'ok' ||
        before.head.nodeId !== expectedHeadNodeId ||
        before.head.stateHash !== expectedHeadStateHash
      ) {
        spindle.sendToFrontend({
          type: 'ffmvu_snapshot_export_result', ok: false, requestId, chatId,
          reason: 'SNAPSHOT_STALE_HEAD',
          currentHeadHealth: before.head.health,
          currentHeadNodeId: before.head.nodeId,
          currentHeadStateHash: before.head.stateHash,
          currentVariantId: before.head.variantId ?? null,
        }, userId);
        return;
      }

      const snapshot = await rt.state.exportPortableSnapshot(scope, before.head.nodeId);
      const after = await resolveGuiHead(rt, scope);
      if (!sameGuiHead(before.head, after.head)) {
        spindle.sendToFrontend({
          type: 'ffmvu_snapshot_export_result', ok: false, requestId, chatId,
          reason: 'SNAPSHOT_STALE_HEAD',
          currentHeadHealth: after.head.health,
          currentHeadNodeId: after.head.nodeId,
          currentHeadStateHash: after.head.stateHash,
          currentVariantId: after.head.variantId ?? null,
        }, userId);
        return;
      }

      publish(userId, {
        phase: 'snapshot_export_complete', chatId, requestId,
        headNodeId: before.head.nodeId,
        headStateHash: before.head.stateHash,
        snapshotHash: snapshot.snapshotHash,
        turn: snapshot.source.turn,
      });
      spindle.sendToFrontend({
        type: 'ffmvu_snapshot_export_result', ok: true, requestId, chatId,
        headNodeId: before.head.nodeId,
        headStateHash: before.head.stateHash,
        variantId: before.head.variantId ?? null,
        snapshot,
      }, userId);
    } catch (error) {
      publish(userId, { phase: 'snapshot_export_error', chatId, requestId, error: String(error) });
      spindle.sendToFrontend({
        type: 'ffmvu_snapshot_export_result', ok: false, requestId, chatId,
        reason: String(error),
      }, userId);
    }
    return;
  }

    if (payload?.type === 'ffmvu_import_snapshot') {
    const chatId = String(payload.chatId ?? '');
    const requestId = String(payload.requestId ?? createId('snapshot_import'));
    if (!chatId) {
      spindle.sendToFrontend({ type: 'ffmvu_snapshot_import_result', ok: false, requestId, reason: 'SNAPSHOT_IMPORT_CHAT_ID_REQUIRED' }, userId);
      return;
    }
    const scope: StateScope = { userId, chatId };
    knownScopeByChat.set(chatId, scope);
    if (contexts.getForScope(scope)) {
      spindle.sendToFrontend({ type: 'ffmvu_snapshot_import_result', ok: false, requestId, chatId, reason: 'SNAPSHOT_IMPORT_BLOCKED_DURING_GENERATION' }, userId);
      return;
    }

    try {
      const rt = runtime(userId);
      const existingRoot = await rt.anchors.readRoot(scope);
      const portable = payload.snapshot as PortableSnapshot;

      if (existingRoot) {
        if (payload.mode !== 'replace-current') {
          spindle.sendToFrontend({ type: 'ffmvu_snapshot_import_result', ok: false, requestId, chatId, reason: 'SNAPSHOT_IMPORT_ALREADY_INITIALIZED' }, userId);
          return;
        }
        const expectedHeadNodeId = String(payload.expectedHeadNodeId ?? '');
        const expectedHeadStateHash = String(payload.expectedHeadStateHash ?? '');
        if (!expectedHeadNodeId || !expectedHeadStateHash) {
          spindle.sendToFrontend({ type: 'ffmvu_snapshot_import_result', ok: false, requestId, chatId, reason: 'SNAPSHOT_IMPORT_EXPECTED_HEAD_REQUIRED' }, userId);
          return;
        }

        const before = await resolveGuiHead(rt, scope);
        if (
          before.head.health !== 'ok' ||
          before.head.nodeId !== expectedHeadNodeId ||
          before.head.stateHash !== expectedHeadStateHash
        ) {
          spindle.sendToFrontend({
            type: 'ffmvu_snapshot_import_result', ok: false, requestId, chatId,
            reason: 'SNAPSHOT_IMPORT_STALE_HEAD',
            currentHeadHealth: before.head.health,
            currentHeadNodeId: before.head.nodeId,
            currentHeadStateHash: before.head.stateHash,
            currentVariantId: before.head.variantId ?? null,
          }, userId);
          return;
        }

        const transcript = toHostTranscript(before.messages);
        const last = transcript.at(-1);
        const boundary = last ? {
          throughMessageId: last.id,
          activePrefixHash: await activePrefixHash(transcript, last.id),
          fingerprintVersion: ACTIVE_PREFIX_FINGERPRINT_VERSION,
        } : undefined;

        const staged = await rt.state.stagePortableSnapshotCheckpoint(scope, portable, boundary, requestId);
        await bindStagedCheckpointRoot(rt, scope, before.head, staged, boundary);
        const projection = await rt.state.getProjectionForNode(scope, staged.nodeId);
        publish(userId, {
          phase: 'snapshot_restore_complete',
          chatId,
          requestId,
          previousNodeId: before.head.nodeId,
          previousStateHash: before.head.stateHash,
          finalNodeId: staged.nodeId,
          finalStateHash: staged.stateHash,
          promptViewHash: projection.viewHash,
          sourceSnapshotHash: portable?.snapshotHash ?? null,
          sourceReducerVersion: portable?.reducerVersion ?? null,
          finalReducerVersion: projection.reducerVersion,
          turn: Number(staged.state.Narrative.Turn) || 0,
          transcriptMessagesPreserved: true,
        });
        spindle.sendToFrontend({
          type: 'ffmvu_snapshot_import_result',
          ok: true,
          mode: 'replace-current',
          requestId,
          chatId,
          headNodeId: staged.nodeId,
          headStateHash: staged.stateHash,
          promptViewHash: projection.viewHash,
          variantId: null,
          generationPending: false,
          state: staged.state,
          sourceSnapshotHash: portable?.snapshotHash ?? null,
          sourceReducerVersion: portable?.reducerVersion ?? null,
          finalReducerVersion: projection.reducerVersion,
        }, userId);
        return;
      }

      const cfg = await config(userId);
      if (!cfg.enabled) {
        spindle.sendToFrontend({ type: 'ffmvu_snapshot_import_result', ok: false, requestId, chatId, reason: 'SNAPSHOT_IMPORT_BRIDGE_DISABLED' }, userId);
        return;
      }

      const messages = await spindle.chat.getMessages(chatId);
      const transcript = toHostTranscript(messages);
      const last = transcript.at(-1);
      const boundary = last ? {
        throughMessageId: last.id,
        activePrefixHash: await activePrefixHash(transcript, last.id),
        fingerprintVersion: ACTIVE_PREFIX_FINGERPRINT_VERSION,
      } : undefined;

      const created = await rt.state.importPortableSnapshot(scope, portable, boundary);
      const projection = await rt.state.getProjectionForNode(scope, created.nodeId);
      publish(userId, {
        phase: 'snapshot_import_complete', chatId, requestId,
        finalNodeId: created.nodeId, finalStateHash: created.stateHash,
        promptViewHash: projection.viewHash,
        sourceSnapshotHash: portable?.snapshotHash ?? null,
        turn: Number(created.state.Narrative.Turn) || 0,
        gameStarted: created.state.GameStarted === true,
        suppressedPreImportMessageCount: boundary ? transcript.length : 0,
      });
      spindle.sendToFrontend({
        type: 'ffmvu_snapshot_import_result', ok: true, requestId, chatId,
        headNodeId: created.nodeId, headStateHash: created.stateHash,
        promptViewHash: projection.viewHash,
        variantId: null, generationPending: false, state: created.state,
        sourceSnapshotHash: portable?.snapshotHash ?? null,
      }, userId);
    } catch (error) {
      publish(userId, { phase: 'snapshot_import_error', chatId, requestId, error: String(error) });
      spindle.sendToFrontend({ type: 'ffmvu_snapshot_import_result', ok: false, requestId, chatId, reason: String(error) }, userId);
    }
    return;
  }

  if (payload?.type === 'ffmvu_import_legacy') {
    const chatId = String(payload.chatId ?? '');
    const requestId = String(payload.requestId ?? createId('legacy'));
    if (!chatId) {
      spindle.sendToFrontend({ type: 'ffmvu_legacy_import_result', ok: false, requestId, reason: 'LEGACY_IMPORT_CHAT_ID_REQUIRED' }, userId);
      return;
    }
    const cfg = await config(userId);
    if (!cfg.enabled) {
      spindle.sendToFrontend({ type: 'ffmvu_legacy_import_result', ok: false, requestId, chatId, reason: 'LEGACY_IMPORT_BRIDGE_DISABLED' }, userId);
      return;
    }
    const scope: StateScope = { userId, chatId };
    knownScopeByChat.set(chatId, scope);
    if (contexts.getForScope(scope)) {
      spindle.sendToFrontend({ type: 'ffmvu_legacy_import_result', ok: false, requestId, chatId, reason: 'LEGACY_IMPORT_BLOCKED_DURING_GENERATION' }, userId);
      return;
    }
    try {
      const rt = runtime(userId);
      const existingRoot = await rt.anchors.readRoot(scope);
      if (existingRoot) {
        spindle.sendToFrontend({ type: 'ffmvu_legacy_import_result', ok: false, requestId, chatId, reason: 'LEGACY_IMPORT_ALREADY_INITIALIZED' }, userId);
        return;
      }
      const messages = await spindle.chat.getMessages(chatId);
      const transcript = toHostTranscript(messages);
      const last = transcript.at(-1);
      const boundary = last ? {
        throughMessageId: last.id,
        activePrefixHash: await activePrefixHash(transcript, last.id),
        fingerprintVersion: ACTIVE_PREFIX_FINGERPRINT_VERSION,
      } : undefined;
      const created = await rt.state.importLegacyState(scope, payload.legacy, boundary);
      publish(userId, {
        phase: 'legacy_import_complete', chatId, requestId,
        finalNodeId: created.nodeId, finalStateHash: created.stateHash,
        turn: Number(created.state.Narrative.Turn) || 0,
        gameStarted: created.state.GameStarted === true,
      });
      spindle.sendToFrontend({
        type: 'ffmvu_legacy_import_result', ok: true, requestId, chatId,
        headNodeId: created.nodeId, headStateHash: created.stateHash,
        variantId: null, generationPending: false, state: created.state,
      }, userId);
    } catch (error) {
      publish(userId, { phase: 'legacy_import_error', chatId, requestId, error: String(error) });
      spindle.sendToFrontend({ type: 'ffmvu_legacy_import_result', ok: false, requestId, chatId, reason: String(error) }, userId);
    }
    return;
  }
  if (payload?.type === 'ffmvu_start_new_game') {
    const chatId = String(payload.chatId ?? '');
    const requestId = String(payload.requestId ?? createId('newgame'));
    if (!chatId) {
      spindle.sendToFrontend({ type: 'ffmvu_new_game_result', ok: false, requestId, reason: 'NEW_GAME_CHAT_ID_REQUIRED' }, userId);
      return;
    }
    const cfg = await config(userId);
    if (!cfg.enabled) {
      spindle.sendToFrontend({ type: 'ffmvu_new_game_result', ok: false, requestId, chatId, reason: 'NEW_GAME_BRIDGE_DISABLED' }, userId);
      return;
    }
    const scope: StateScope = { userId, chatId };
    knownScopeByChat.set(chatId, scope);
    if (contexts.getForScope(scope)) {
      spindle.sendToFrontend({ type: 'ffmvu_new_game_result', ok: false, requestId, chatId, reason: 'NEW_GAME_BLOCKED_DURING_GENERATION' }, userId);
      return;
    }
    try {
      const rt = runtime(userId);
      const existingRoot = await rt.anchors.readRoot(scope);
      if (existingRoot) {
        spindle.sendToFrontend({ type: 'ffmvu_new_game_result', ok: false, requestId, chatId, reason: 'NEW_GAME_ALREADY_INITIALIZED' }, userId);
        return;
      }
      const gameStart = payload.gameStart as GameStartPayload;
      const validationErrors = validateGameStartPayload(gameStart);
      if (validationErrors.length) {
        spindle.sendToFrontend({
          type: 'ffmvu_new_game_result', ok: false, requestId, chatId,
          reason: 'NEW_GAME_INVALID_PAYLOAD', validationErrors,
        }, userId);
        return;
      }

      const messages = await spindle.chat.getMessages(chatId);
      const transcript = toHostTranscript(messages);
      const last = transcript.at(-1);
      const boundary = last ? {
        throughMessageId: last.id,
        activePrefixHash: await activePrefixHash(transcript, last.id),
        fingerprintVersion: ACTIVE_PREFIX_FINGERPRINT_VERSION,
      } : undefined;
      const created = await rt.state.startNewGame(scope, gameStart, boundary);
      publish(userId, {
        phase: 'new_game_complete', chatId, requestId,
        finalNodeId: created.nodeId, finalStateHash: created.stateHash,
        gameStarted: true,
      });
      spindle.sendToFrontend({
        type: 'ffmvu_new_game_result', ok: true, requestId, chatId,
        headNodeId: created.nodeId, headStateHash: created.stateHash,
        variantId: null, generationPending: false, state: created.state,
      }, userId);
    } catch (error) {
      publish(userId, { phase: 'new_game_error', chatId, requestId, error: String(error) });
      spindle.sendToFrontend({ type: 'ffmvu_new_game_result', ok: false, requestId, chatId, reason: String(error) }, userId);
    }
    return;
  }
  if (payload?.type === 'ffmvu_gui_get_state') {
    const chatId = String(payload.chatId ?? '');
    if (!chatId) {
      spindle.sendToFrontend({ type: 'ffmvu_gui_state', ok: false, reason: 'GUI_CHAT_ID_REQUIRED' }, userId);
      return;
    }
    const scope: StateScope = { userId, chatId };
    knownScopeByChat.set(chatId, scope);
    try {
      const rt = runtime(userId);
      const root = await rt.anchors.readRoot(scope);
      if (!root) {
        spindle.sendToFrontend({ type: 'ffmvu_gui_state', ok: true, initialized: false, chatId }, userId);
        return;
      }
      let resolved = await resolveGuiHead(rt, scope);
      if (resolved.head.health !== 'ok') {
        spindle.sendToFrontend({
          type: 'ffmvu_gui_state', ok: false, initialized: true, chatId,
          headHealth: resolved.head.health, headNodeId: resolved.head.nodeId,
          headStateHash: resolved.head.stateHash, reason: resolved.head.reason ?? 'head unresolved',
        }, userId);
        return;
      }
      const migratedHead = await autoMigrateLegacyHead(rt, scope, resolved.head, resolved.messages);
      if (migratedHead.health !== 'ok') {
        spindle.sendToFrontend({
          type: 'ffmvu_gui_state', ok: false, initialized: true, chatId,
          headHealth: migratedHead.health, headNodeId: migratedHead.nodeId,
          headStateHash: migratedHead.stateHash, reason: migratedHead.reason ?? 'head unresolved after automatic schema migration',
        }, userId);
        return;
      }
      if (!sameGuiHead(resolved.head, migratedHead)) resolved = await resolveGuiHead(rt, scope);
      const materialized = await rt.state.materializer.materialize(scope, resolved.head.nodeId);
      spindle.sendToFrontend({
        type: 'ffmvu_gui_state', ok: true, initialized: true, chatId,
        headNodeId: materialized.nodeId, headStateHash: materialized.stateHash,
        variantId: resolved.head.variantId ?? null,
        generationPending: Boolean(contexts.getForScope(scope)),
        state: materialized.state,
      }, userId);
    } catch (error) {
      spindle.sendToFrontend({ type: 'ffmvu_gui_state', ok: false, chatId, reason: String(error) }, userId);
    }
    return;
  }
  if (payload?.type === 'ffmvu_gui_intent') {
    const chatId = String(payload.chatId ?? '');
    const expectedHeadNodeId = String(payload.expectedHeadNodeId ?? '');
    const expectedHeadStateHash = String(payload.expectedHeadStateHash ?? '');
    const requestId = String(payload.requestId ?? createId('gui'));
    if (!chatId || !expectedHeadNodeId || !expectedHeadStateHash) {
      spindle.sendToFrontend({ type: 'ffmvu_gui_result', ok: false, requestId, reason: 'GUI_EXPECTED_HEAD_REQUIRED' }, userId);
      return;
    }
    const cfg = await config(userId);
    if (!cfg.enabled) {
      spindle.sendToFrontend({ type: 'ffmvu_gui_result', ok: false, requestId, chatId, reason: 'GUI_BRIDGE_DISABLED' }, userId);
      return;
    }
    const scope: StateScope = { userId, chatId };
    knownScopeByChat.set(chatId, scope);
    if (contexts.getForScope(scope)) {
      spindle.sendToFrontend({ type: 'ffmvu_gui_result', ok: false, requestId, chatId, reason: 'GUI_BLOCKED_DURING_GENERATION' }, userId);
      return;
    }
    try {
      assertGuiIntent(payload.intent);
      const rt = runtime(userId);
      const before = await resolveGuiHead(rt, scope);
      if (
        before.head.health !== 'ok' ||
        before.head.nodeId !== expectedHeadNodeId ||
        before.head.stateHash !== expectedHeadStateHash
      ) {
        spindle.sendToFrontend({
          type: 'ffmvu_gui_result', ok: false, requestId, chatId,
          reason: 'GUI_STALE_HEAD',
          currentHeadHealth: before.head.health,
          currentHeadNodeId: before.head.nodeId,
          currentHeadStateHash: before.head.stateHash,
          currentVariantId: before.head.variantId ?? null,
        }, userId);
        return;
      }

      const lineageAnchorId = before.head.variantId ?? 'root';
      const lineageAnchor = before.head.variantId ? await rt.anchors.read(scope, before.head.variantId) : null;
      if (before.head.variantId && !lineageAnchor) throw new Error('GUI_LINEAGE_ANCHOR_MISSING');

      const committed = await rt.state.commitGuiIntent(scope, {
        expectedParentNodeId: before.head.nodeId,
        expectedParentStateHash: before.head.stateHash,
        intent: payload.intent,
        anchor: {
          lineageAnchorId,
          ...(before.head.variantId ? { variantId: before.head.variantId } : {}),
          ...(lineageAnchor?.messageId ? { messageId: lineageAnchor.messageId, messageRole: 'assistant' as const } : {}),
        },
        requestId,
      });

      // State is durable now, but it is intentionally not visible in semantic replay
      // until the same transcript branch is proven still active.
      const afterPhysical = await resolveGuiHead(rt, scope);
      if (!sameGuiHead(before.head, afterPhysical.head)) {
        publish(userId, {
          phase: 'gui_committed_unbound', chatId, requestId,
          committedNodeId: committed.nodeId, committedStateHash: committed.stateHash,
          reason: 'active transcript branch changed before GUI lineage binding',
        });
        spindle.sendToFrontend({
          type: 'ffmvu_gui_result', ok: false, requestId, chatId,
          reason: 'GUI_COMMITTED_UNBOUND_BRANCH_CHANGED',
          committedNodeId: committed.nodeId,
          committedStateHash: committed.stateHash,
        }, userId);
        return;
      }

      await bindGuiCommit(rt, scope, before.head, committed.nodeId);
      const verified = await resolveGuiHead(rt, scope);
      if (verified.head.health !== 'ok' || verified.head.nodeId !== committed.nodeId || verified.head.stateHash !== committed.stateHash) {
        publish(userId, {
          phase: 'gui_binding_error', chatId, requestId,
          committedNodeId: committed.nodeId, committedStateHash: committed.stateHash,
          resolvedHeadHealth: verified.head.health,
          resolvedHeadNodeId: verified.head.nodeId,
          reason: verified.head.reason ?? 'GUI lineage binding did not become active head',
        });
        spindle.sendToFrontend({
          type: 'ffmvu_gui_result', ok: false, requestId, chatId,
          reason: 'GUI_BINDING_VERIFICATION_FAILED',
          committedNodeId: committed.nodeId,
          committedStateHash: committed.stateHash,
        }, userId);
        return;
      }

      publish(userId, {
        phase: 'gui_commit_complete', chatId, requestId,
        intentType: payload.intent.type,
        lineageAnchorId,
        variantId: before.head.variantId ?? null,
        previousNodeId: before.head.nodeId,
        finalNodeId: committed.nodeId,
        finalStateHash: committed.stateHash,
      });
      spindle.sendToFrontend({
        type: 'ffmvu_gui_result', ok: true, requestId, chatId,
        intentType: payload.intent.type,
        headNodeId: committed.nodeId,
        headStateHash: committed.stateHash,
        variantId: before.head.variantId ?? null,
        state: committed.state,
      }, userId);
    } catch (error) {
      publish(userId, { phase: 'gui_commit_error', chatId, requestId, error: String(error) });
      spindle.sendToFrontend({ type: 'ffmvu_gui_result', ok: false, requestId, chatId, reason: String(error) }, userId);
    }
    return;
  }
  if (payload?.type === 'ffmvu_set_enabled') {
    const enabled = payload.enabled === true;
    await setConfig(userId, { enabled });
    if (!enabled) {
      noPatchProbeUsers.delete(userId);
      continueProbeUsers.delete(userId);
    }
    ensureRegistrations();
    publish(userId, { phase: enabled ? 'armed' : 'disabled', enabled, noPatchProbeArmed: noPatchProbeUsers.has(userId), continueProbeArmed: continueProbeUsers.has(userId), note: enabled ? 'v0.13.21 bridge armed. State ownership, current-chat migration, familiar interior state, and existing GUI safety are active.' : 'Bridge will not touch generations.' });
    return;
  }
  if (payload?.type === 'ffmvu_arm_no_patch_probe') {
    const cfg = await config(userId);
    if (!cfg.enabled) {
      publish(userId, { phase: 'blocked', enabled: false, noPatchProbeArmed: false, reason: 'Arm commits before arming the no-patch probe.' });
      return;
    }
    continueProbeUsers.delete(userId);
    noPatchProbeUsers.add(userId);
    publish(userId, {
      phase: 'no_patch_probe_armed',
      enabled: true,
      noPatchProbeArmed: true,
      continueProbeArmed: false,
      note: 'One-shot diagnostic: the next stateful generation will be instructed to emit prose only and no UpdateVariable/JSONPatch block.',
    });
    return;
  }
  if (payload?.type === 'ffmvu_arm_continue_probe') {
    const cfg = await config(userId);
    if (!cfg.enabled) {
      publish(userId, { phase: 'blocked', enabled: false, continueProbeArmed: false, reason: 'Arm commits before arming the Continue probe.' });
      return;
    }
    noPatchProbeUsers.delete(userId);
    continueProbeUsers.add(userId);
    publish(userId, {
      phase: 'continue_probe_armed',
      enabled: true,
      noPatchProbeArmed: false,
      continueProbeArmed: true,
      note: 'One-shot diagnostic: the next native Continue is allowed through for host append/segment observation only. No FFMVU state commit will be written.',
    });
    return;
  }
});

spindle.permissions.onDenied?.(({ permission, operation }) => spindle.log.warn(`[FFMVU] permission denied: ${permission} for ${operation}`));
spindle.log.info(`[FFMVU] Lumiverse migration bridge v${BRIDGE_VERSION} loaded (state ownership, current-chat migration, familiar interior state, and branch-safe GUI intents).`);
