import fs from 'node:fs';
import path from 'node:path';

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, text) { fs.writeFileSync(file, text); }
function count(haystack, needle) { return haystack.split(needle).length - 1; }
function replaceExact(file, from, to, expected = 1) {
  const text = read(file);
  const found = count(text, from);
  if (found !== expected) throw new Error(`${file}: expected ${expected} exact matches, found ${found}: ${from.slice(0, 120)}`);
  write(file, text.split(from).join(to));
}
function replaceBetween(file, startMarker, endMarker, replacement) {
  const text = read(file);
  const start = text.indexOf(startMarker);
  if (start < 0) throw new Error(`${file}: missing start marker ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`${file}: missing end marker ${endMarker}`);
  write(file, text.slice(0, start) + replacement + text.slice(end));
}
function listTs(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTs(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

// 1) StateService: remove the unused full-state materialized-tip write and allow
// request-scoped verified reads to be reused by projection construction.
{
  const file = 'src/service/state-service.ts';
  replaceExact(file,
    "import { Materializer } from '../persistence/materializer.js';\n",
    "import { Materializer } from '../persistence/materializer.js';\nimport type { ResolutionSession } from '../persistence/resolution-session.js';\n");
  replaceExact(file, "import { materializedTipPath } from '../persistence/paths.js';\n", '');
  replaceExact(file,
    "  private async updateMaterializedTipCache(scope: StateScope, value: MaterializedState): Promise<void> {\n    try { await this.storage.setJson(materializedTipPath(scope), value); }\n    catch { /* cache is acceleration only; committed StoreRevision remains authoritative */ }\n  }\n\n",
    '');

  let text = read(file);
  const sameResultCall = ' await this.updateMaterializedTipCache(scope, result);';
  const sameResultCount = count(text, sameResultCall);
  if (sameResultCount < 2) throw new Error(`${file}: expected materialized result cache calls, found ${sameResultCount}`);
  text = text.split(sameResultCall).join('');
  const finalCall = "        await this.updateMaterializedTipCache(scope, { nodeId: finalNodeId, stateHash: finalStateHash, state: finalState });\n";
  const finalCount = count(text, finalCall);
  if (finalCount !== 1) throw new Error(`${file}: expected one finalize materialized cache call, found ${finalCount}`);
  text = text.replace(finalCall, '');
  write(file, text);

  const projectionMethod = `  async getProjectionForNode(
    scope: StateScope,
    nodeId: string,
    session?: ResolutionSession,
  ): Promise<{ nodeId: string; stateHash: string; reducerVersion: string; sourceKind: 'node' | 'base-seed'; sourceNodeId?: string; sourceStateHash?: string; sourceBaseId?: string; projectionVersion: string; promptProtocolVersion: string; view: Record<string, unknown>; viewHash: string }> {
    if (session && (session.scope.userId !== scope.userId || session.scope.chatId !== scope.chatId)) {
      throw new Error('RESOLUTION_SESSION_SCOPE_MISMATCH');
    }
    const isCommitted = (id: string) => session ? session.isNodeCommitted(id) : this.store.isNodeCommitted(scope, id);
    const materialize = (id: string) => session ? session.materialize(id) : this.materializer.materialize(scope, id);
    const readNode = (id: string) => session ? session.readNode(id) : this.store.readNode(scope, id);

    if (!await isCommitted(nodeId)) throw new Error('NODE_NOT_COMMITTED');
    const target = await materialize(nodeId);
    const artifact = await readNode(nodeId);
    const binding = artifact.value.projectionBinding;
    if (binding.sourceKind === 'base-seed') {
      if (artifact.type !== 'base' || !artifact.value.projectionSeed) throw new Error('BASE_SEED_BINDING_WITHOUT_SEED');
      const seed = artifact.value.projectionSeed;
      if (binding.sourceBaseId !== artifact.value.id || seed.projectionVersion !== binding.projectionVersion || seed.promptProtocolVersion !== binding.promptProtocolVersion) throw new Error('BASE_SEED_BINDING_MISMATCH');
      const viewHash = await canonicalHash(seed.projection);
      if (viewHash !== binding.promptViewHash || viewHash !== seed.promptViewHash) throw new Error('BASE_SEED_PROJECTION_HASH_MISMATCH');
      return { nodeId: target.nodeId, stateHash: target.stateHash, reducerVersion: artifact.value.reducerVersion, sourceKind: 'base-seed', sourceBaseId: artifact.value.id, projectionVersion: binding.projectionVersion, promptProtocolVersion: binding.promptProtocolVersion, view: structuredClone(seed.projection) as Record<string, unknown>, viewHash };
    }
    if (!binding.sourceNodeId || !binding.sourceStateHash) throw new Error('NODE_PROJECTION_BINDING_INCOMPLETE');
    if (!await isCommitted(binding.sourceNodeId)) throw new Error('PROJECTION_SOURCE_NOT_COMMITTED');
    const source = await materialize(binding.sourceNodeId);
    if (source.stateHash !== binding.sourceStateHash) throw new Error('PROJECTION_SOURCE_STATE_HASH_MISMATCH');
    const view = this.projections.get(binding.projectionVersion).build(source.state) as Record<string, unknown>;
    const viewHash = await canonicalHash(view);
    if (viewHash !== binding.promptViewHash) throw new Error('PROJECTION_BINDING_HASH_MISMATCH');
    return { nodeId: target.nodeId, stateHash: target.stateHash, reducerVersion: artifact.value.reducerVersion, sourceKind: 'node', sourceNodeId: source.nodeId, sourceStateHash: source.stateHash, projectionVersion: binding.projectionVersion, promptProtocolVersion: binding.promptProtocolVersion, view, viewHash };
  }
`;
  const current = read(file);
  const methodStart = current.indexOf('  async getProjectionForNode(scope: StateScope, nodeId: string): Promise<');
  const classEnd = current.lastIndexOf('\n}');
  if (methodStart < 0 || classEnd <= methodStart) throw new Error(`${file}: could not isolate getProjectionForNode`);
  write(file, current.slice(0, methodStart) + projectionMethod + current.slice(classEnd));
}

// 2) Backend: keep a single ResolutionSession through head -> projection ->
// recent changes/state trail whenever no migration mutates the read boundary.
{
  const file = 'src/lumi/backend.ts';
  replaceExact(file,
    "import { HeadResolver } from '../head-resolver.js';\n",
    "import { HeadResolver } from '../head-resolver.js';\nimport type { ResolutionSession } from '../persistence/resolution-session.js';\n");

  const resolveGui = `async function resolveGuiHead(rt: UserRuntime, scope: StateScope): Promise<{
  root: import('../persistence/types.js').RootAnchorRecord;
  messages: LumiChatMessage[];
  head: import('../head-resolver.js').HeadResolution;
  session: ResolutionSession;
}> {
  const root = await rt.anchors.readRoot(scope);
  if (!root) throw new Error('GUI_STATE_NOT_INITIALIZED');
  const messages = await spindle.chat.getMessages(scope.chatId);
  const session = rt.resolver.createResolutionSession(scope);
  const head = await rt.resolver.resolve(scope, root.baseNodeId, toHostTranscript(messages), session);
  return { root, messages, head, session };
}

`;
  replaceBetween(file, 'async function resolveGuiHead(', 'function sameGuiHead(', resolveGui);

  const history = `async function buildNarrativeHistoryContext(
  rt: UserRuntime,
  scope: StateScope,
  messages: LumiChatMessage[],
  currentHeadNodeId: string,
  session: ResolutionSession,
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
    const attempt = await session.readAttempt(anchor.lastAttemptId);
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
      if (await session.isNodeCommitted(baselineNodeId)) {
        const before = await session.materialize(baselineNodeId);
        const after = await session.materialize(currentHeadNodeId);
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
        if (!await session.isNodeCommitted(nodeId)) continue;
        materialized.push(await session.materialize(nodeId));
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

`;
  replaceBetween(file, 'async function buildNarrativeHistoryContext(', 'async function ensureBootstrap(', history);

  replaceExact(file,
    "  const baseId = await ensureBootstrap(scope, raw);\n  let head = await rt.resolver.resolve(scope, baseId, toHostTranscript(raw));\n",
    "  const baseId = await ensureBootstrap(scope, raw);\n  const resolutionSession = rt.resolver.createResolutionSession(scope);\n  let head = await rt.resolver.resolve(scope, baseId, toHostTranscript(raw), resolutionSession);\n");
  replaceExact(file,
    "  head = await autoMigrateLegacyHead(rt, scope, head, raw);\n  if (head.health !== 'ok') return { ok: false, reason: `${head.health}: ${head.reason ?? 'head unresolved after automatic schema migration'}` };\n",
    "  const preMigrationNodeId = head.nodeId;\n  head = await autoMigrateLegacyHead(rt, scope, head, raw);\n  if (head.health !== 'ok') return { ok: false, reason: `${head.health}: ${head.reason ?? 'head unresolved after automatic schema migration'}` };\n  const readSession = head.nodeId === preMigrationNodeId\n    ? resolutionSession\n    : rt.resolver.createResolutionSession(scope);\n");
  replaceExact(file,
    "  const projection = await rt.state.getProjectionForNode(scope, head.nodeId);\n  const frozenAuthorization = buildModelPatchAuthorizationView(projection.view);\n  const historyContext = await buildNarrativeHistoryContext(rt, scope, lineageMessages, head.nodeId);\n",
    "  const projection = await rt.state.getProjectionForNode(scope, head.nodeId, readSession);\n  const frozenAuthorization = buildModelPatchAuthorizationView(projection.view);\n  const historyContext = await buildNarrativeHistoryContext(rt, scope, lineageMessages, head.nodeId, readSession);\n");

  replaceExact(file,
    "      const materialized = await rt.state.materializer.materialize(scope, resolved.head.nodeId);\n",
    "      const materialized = await resolved.session.materialize(resolved.head.nodeId);\n");
}

// 3) Frontend technical fixes only: lazy/coalesced state reads, initialized-mode
// mutation feedback, and removal of the GameStart input that is intentionally not persisted.
{
  const file = 'src/lumi/frontend.ts';
  replaceExact(file, "  let panelOpen = false;\n", "  let panelOpen = false;\n  let stateRequestInFlight = false;\n");

  replaceExact(file,
    "  function requestState(): void {\n    if (!activeChatId) {\n      snapshot = null;\n      render();\n      return;\n    }\n    ctx.sendToBackend({ type: 'ffmvu_gui_get_state', chatId: activeChatId });\n  }\n",
    "  function requestState(): void {\n    if (!activeChatId) {\n      snapshot = null;\n      stateRequestInFlight = false;\n      render();\n      return;\n    }\n    if (!panelOpen || stateRequestInFlight) return;\n    stateRequestInFlight = true;\n    ctx.sendToBackend({ type: 'ffmvu_gui_get_state', chatId: activeChatId });\n  }\n");

  replaceExact(file,
    "    if (state && snapshot?.ok && snapshot.initialized) {\n      content.appendChild(renderLegacyStatusMenu({\n",
    "    if (state && snapshot?.ok && snapshot.initialized) {\n      if (notice) content.appendChild(make('div', 'ffsm-notice', notice));\n      content.appendChild(renderLegacyStatusMenu({\n");

  replaceExact(file,
    "        if (payload?.type === 'ffmvu_gui_state') {\n      if (payload.chatId !== activeChatId) return;\n      snapshot = payload as GuiSnapshot;\n      busy = false;\n      if (snapshot.ok && snapshot.initialized) notice = '';\n      render();\n      return;\n    }\n",
    "        if (payload?.type === 'ffmvu_gui_state') {\n      if (payload.chatId !== activeChatId) return;\n      stateRequestInFlight = false;\n      snapshot = payload as GuiSnapshot;\n      busy = false;\n      render();\n      return;\n    }\n");

  replaceExact(file,
    "    snapshot = null;\n    busy = false;\n",
    "    snapshot = null;\n    stateRequestInFlight = false;\n    busy = false;\n",
    1);

  replaceExact(file,
    "      panelOpen = true;\n      syncPanelVisibility();\n      requestDiagnostics();\n",
    "      panelOpen = true;\n      syncPanelVisibility();\n      requestState();\n      requestDiagnostics();\n");

  replaceExact(file, "    const mental = textInput('Calm');\n", '');
  replaceExact(file,
    "      field('Occupation', occupation), field('Mental state', mental), field('Level', level), field('EXP', exp),\n",
    "      field('Occupation', occupation), field('Level', level), field('EXP', exp),\n");
  replaceExact(file, "          mental: mental.value.trim() || 'Calm',\n", '');
}

// 4) Equipment: route existing GUI semantics through the extracted domain module.
// This is intentionally only an extraction. It does NOT choose the unresolved
// stamina formula or enable future model/system reconciliation.
{
  const file = 'src/shared/domain/gui-intents.ts';
  replaceExact(file,
    "import { asRecord, clone, isRecord, text, tupleValue } from './value-utils.js';\n",
    "import { asRecord, clone, isRecord, text } from './value-utils.js';\nimport { applyEquipmentIntent } from './gui-intents/equipment.js';\n");

  replaceBetween(file, 'const EQUIP_STAT_MAP:', 'function same(', 'function same(');
  replaceBetween(file, 'function numericValue(', 'function uniqueKey(', 'function uniqueKey(');
  replaceBetween(file, 'function equippedInSlot(', 'function mergeExistingEditableFields(', 'function mergeExistingEditableFields(');

  replaceExact(file,
    "export function applyGuiIntent(input: FFMVUState, intent: GuiIntent): FFMVUState {\n  const state = clone(input);\n  if (intent.type === 'outfit.move') moveOutfit(state, intent);\n  else if (intent.type === 'inventory.delete') inventoryDelete(state, intent);\n  else if (intent.type === 'equipment.equip') equipmentEquip(state, intent);\n  else if (intent.type === 'equipment.unequip') equipmentUnequip(state, intent);\n",
    "export function applyGuiIntent(input: FFMVUState, intent: GuiIntent): FFMVUState {\n  if (intent.type === 'equipment.equip' || intent.type === 'equipment.unequip') return applyEquipmentIntent(input, intent);\n  const state = clone(input);\n  if (intent.type === 'outfit.move') moveOutfit(state, intent);\n  else if (intent.type === 'inventory.delete') inventoryDelete(state, intent);\n");
}

// Remove the now-unused materialized-tip path only after all source edits are applied.
{
  const uses = listTs('src').filter(file => file !== 'src/persistence/paths.ts').filter(file => read(file).includes('materializedTipPath'));
  if (uses.length) throw new Error('materializedTipPath still used by: ' + uses.join(', '));
  replaceExact('src/persistence/paths.ts', "export const materializedTipPath = (scope: StateScope) => `${scopeRoot(scope)}/indexes/materialized-tip.json`;\n", '');
}

// Remove the historical CheckpointService only if a full checkout scan proves there
// are no consumers outside its own definition plus path/type declarations.
{
  const excluded = new Set(['src/persistence/checkpoint-service.ts', 'src/persistence/paths.ts', 'src/persistence/types.ts']);
  const files = [...listTs('src'), ...listTs('tests')].filter(file => !excluded.has(file));
  const externalRefs = files.filter(file => /CheckpointService|checkpointPath|CheckpointRecord/.test(read(file)));
  if (externalRefs.length) throw new Error('Checkpoint infrastructure still has consumers: ' + externalRefs.join(', '));
  if (!fs.existsSync('src/persistence/checkpoint-service.ts')) throw new Error('checkpoint-service.ts unexpectedly missing');
  fs.unlinkSync('src/persistence/checkpoint-service.ts');
  replaceExact('src/persistence/paths.ts', "export const checkpointPath = (scope: StateScope, id: string) => `${scopeRoot(scope)}/checkpoints/${safeSegment(id, 'checkpoint id')}.json`;\n", '');
  replaceExact('src/persistence/types.ts', "export interface CheckpointRecord extends MaterializedState { eventFormatVersion: number; scope: StateScope; reducerVersion: string; createdAt: string }\n", '');
}

// Extend the cache regression with projection reuse and absence of the removed full-state write.
{
  const file = 'tests/unit/phase10.ts';
  replaceExact(file,
    "  storage.resetCounts();\n  const resolved = await resolver.resolve(scope, genesis.nodeId, messages);\n",
    "  const indexPaths = await storage.list('chats/resolution-cache/indexes/');\n  assert(!indexPaths.some(path => path.endsWith('/materialized-tip.json')), 'state commits do not write the unused materialized-tip full-state cache');\n\n  storage.resetCounts();\n  const resolved = await resolver.resolve(scope, genesis.nodeId, messages);\n");
  replaceExact(file,
    "  storage.resetCounts();\n  assert((await session.listAttemptsForVariant('v1')).length === 1, 'attempt index returns first variant');\n",
    "  storage.resetCounts();\n  const projection1 = await state.getProjectionForNode(scope, current.nodeId, session);\n  const projectionReads = storage.getCalls + storage.existsCalls;\n  const projectionLists = storage.listCalls;\n  const projection2 = await state.getProjectionForNode(scope, current.nodeId, session);\n  assert(projection1.viewHash === projection2.viewHash, 'projection stays identical when reusing a resolution session');\n  assert(storage.getCalls + storage.existsCalls === projectionReads && storage.listCalls === projectionLists, 'repeated projection in one resolution session performs no additional storage reads');\n\n  storage.resetCounts();\n  assert((await session.listAttemptsForVariant('v1')).length === 1, 'attempt index returns first variant');\n");
}

console.log('Applied guarded backend/frontend safe optimization slices.');
