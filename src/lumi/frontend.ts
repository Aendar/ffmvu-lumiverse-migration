import type { FFMVUState, MutableRecord } from '../shared/state-schema.js';
import type { GuiIntent, GuiOwnerRef } from '../shared/domain/gui-intents.js';
import { asRecord, isRecord } from '../shared/domain/value-utils.js';
import type { SpindleFrontendContextLite } from './spindle-lite.js';
import {
  statusCompactObject,
  statusCoreBudget,
  statusHphOverview,
  statusItems,
  statusNumber,
  statusOwnerById,
  statusOwners,
  statusPath,
  statusText,
  type StatusOwner,
} from './statusmenu-model.js';
import { renderLegacyStatusMenu, type LegacyStatusTab } from './statusmenu-legacy-view.js';

interface GuiSnapshot {
  ok: boolean;
  initialized?: boolean;
  chatId?: string;
  headNodeId?: string;
  headStateHash?: string;
  variantId?: string | null;
  generationPending?: boolean;
  state?: FFMVUState;
  reason?: string;
  headHealth?: string;
}

type TabId = LegacyStatusTab;

const TAB_DEFS: Array<[TabId, string]> = [
  ['overview', 'Overview'],
  ['attributes', 'Attributes'],
  ['familiars', 'Familiars'],
  ['wardrobe', 'Wardrobe'],
  ['equipment', 'Equipments'],
  ['items', 'Items'],
  ['others', 'Others'],
  ['ffstate', 'FF State'],
];

const CORE_STATS: Array<[string, string]> = [
  ['Strength', 'STR'], ['Agility', 'AGI'], ['Constitution', 'CON'],
  ['Intelligence', 'INT'], ['Wisdom', 'WIS'], ['Charisma', 'CHA'],
];

const COMBAT_STATS: Array<[string, string]> = [
  ['Physical_attack', 'P_ATK'], ['Physical_defense', 'P_DEF'],
  ['Magic_attack', 'M_ATK'], ['Magic_defense', 'M_DEF'], ['Magic_assist', 'M_AST'],
];

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function requestId(prefix: string): string {
  try {
    if (globalThis.crypto?.randomUUID) return prefix + '_' + globalThis.crypto.randomUUID();
  } catch {}
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2);
}

function ownerLabel(owner: StatusOwner): string {
  return owner.ref.kind === 'player' ? 'Player · ' + owner.label : owner.label;
}

function percent(current: number | null, max: number | null): number {
  if (current === null || max === null || max <= 0) return 0;
  return Math.max(0, Math.min(100, (current / max) * 100));
}

function valueRecord(value: unknown): MutableRecord {
  return isRecord(value) ? value : {};
}

function htmlDetails(record: MutableRecord): string {
  const parts: string[] = [];
  for (const key of ['Type', 'Slot', 'Layer', 'Placement', 'Color', 'Material', 'Condition', 'Arrangement', 'Desc']) {
    const value = record[key];
    if (value === undefined || value === null || value === '') continue;
    parts.push(key + ': ' + statusText(value));
  }
  return parts.join(' · ');
}

export function setup(ctx: SpindleFrontendContextLite) {
  const removeStyle = ctx.dom.addStyle(`
    :root {
      --npc-c_: #F56991;
      --npc-c0: #58DDD0;
      --npc-c1: #45CAC1;
      --npc-c2: #36B5AF;
      --npc-c3: #439E9B;
      --npc-c4: #719493;
      --npc-c5: #FFAD68;
      --npc-c6: #F49A68;
      --npc-c7: #E38869;
      --npc-c8: #CF7C6D;
      --npc-c9: #B87874;
      --npc-c-: #B8A6D9;
    }
    span[style*="--npc-color"],
    span[style*="--npc-color"] * {
      color: var(--npc-color) !important;
    }
    span[style*="--npc-color"] em {
      color: var(--npc-color) !important;
      filter: brightness(.84) saturate(.9);
      opacity: .78;
      font-style: italic;
    }
    font[color] em {
      filter: brightness(.84) saturate(.9);
      opacity: .78;
    }

    .ffsm-app {
      --ffsm-accent:#00e5ff;
      --ffsm-accent-soft:#81d4fa;
      --ffsm-pink:#ff7ac8;
      --ffsm-border:rgba(0,229,255,.28);
      color:var(--lumiverse-text);
      position:absolute;
      left:0;
      right:0;
      bottom:calc(100% + 6px);
      z-index:30;
      width:auto;
      box-sizing:border-box;
      padding:0;
      display:none;
      min-height:0;
      pointer-events:none;
    }
    .ffsm-app.open {
      display:block;
      height:520px;
      min-height:0;
      pointer-events:auto;
    }
    .ffsm-panel-frame {
      width:100%;
      height:100%;
      min-height:0;
      display:flex;
      flex-direction:column;
      box-sizing:border-box;
    }
    .ffsm-resize-grip {
      flex:0 0 10px;
      height:10px;
      cursor:ns-resize;
      touch-action:none;
      display:flex;
      align-items:center;
      justify-content:center;
      user-select:none;
    }
    .ffsm-resize-grip::before {
      content:'';
      display:block;
      width:64px;
      height:3px;
      border-radius:99px;
      background:rgba(0,229,255,.38);
      box-shadow:0 0 8px rgba(0,229,255,.12);
    }
    .ffsm-resize-grip:hover::before,
    .ffsm-resize-grip.dragging::before {
      background:rgba(0,229,255,.72);
    }
    .ffsm-panel-content {
      flex:1 1 auto;
      min-height:0;
      width:100%;
      overflow:hidden;
      box-sizing:border-box;
    }
    .ffsm-shell {
      height:100%;
      box-sizing:border-box;
      border:1px solid var(--ffsm-border);
      border-radius:10px;
      overflow:auto;
      overscroll-behavior:contain;
      background:linear-gradient(150deg,rgba(0,31,63,.88),rgba(0,74,83,.72));
      box-shadow:0 12px 34px rgba(0,0,0,.2);
    }
    .ffsm-head {
      display:flex;align-items:flex-start;justify-content:space-between;gap:10px;
      padding:12px;border-bottom:1px solid var(--ffsm-border);
      background:rgba(0,0,0,.18);
    }
    .ffsm-head-title { color:var(--ffsm-accent);font-weight:800;font-size:15px; }
    .ffsm-head-sub { color:var(--lumiverse-text-muted);font-size:11px;line-height:1.35;margin-top:3px; }
    .ffsm-head-actions { display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end; }
    .ffsm-btn {
      appearance:none;border:1px solid var(--ffsm-border);border-radius:6px;
      background:rgba(0,229,255,.08);color:var(--ffsm-accent);padding:6px 9px;
      cursor:pointer;font:inherit;font-size:11px;
    }
    .ffsm-btn:hover:not(:disabled) { background:rgba(0,229,255,.18); }
    .ffsm-btn:disabled { opacity:.4;cursor:not-allowed; }
    .ffsm-btn-danger { color:#ff9a9a;border-color:rgba(255,100,100,.35);background:rgba(255,90,90,.08); }
    .ffsm-btn-pink { color:#ffd9ef;border-color:rgba(255,122,200,.4);background:rgba(255,122,200,.1); }
    .ffsm-toolbar-btn {
      display:flex;align-items:center;justify-content:center;width:30px;height:26px;
      border:0;border-radius:var(--lcs-radius-xs,6px);background:transparent;
      color:var(--lumiverse-text-dim,rgba(230,230,240,.4));cursor:pointer;padding:0;
      transition:color 120ms ease,background 120ms ease;
    }
    .ffsm-toolbar-btn:hover,.ffsm-toolbar-btn.active {
      color:var(--lumiverse-text,rgba(230,230,240,.92));
      background:var(--lumiverse-fill,rgba(255,255,255,.06));
    }
    .ffsm-toolbar-btn.active {
      color:var(--ffsm-accent);
      background:rgba(0,229,255,.1);
    }
    .ffsm-toolbar-btn svg { width:14px;height:14px;display:block; }
    .ffsm-statusline {
      padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.07);
      color:var(--lumiverse-text-muted);font-size:10px;display:flex;gap:8px;flex-wrap:wrap;
    }
    .ffsm-statusline .ok { color:#69f0ae; }
    .ffsm-statusline .warn { color:#ffd36a; }
    .ffsm-statusline .bad { color:#ff8a80; }
    .ffsm-nav {
      display:flex;overflow-x:auto;background:rgba(0,0,0,.24);border-bottom:1px solid var(--ffsm-border);
      scrollbar-width:thin;
    }
    .ffsm-tab {
      appearance:none;border:0;border-bottom:2px solid transparent;background:transparent;
      color:var(--ffsm-accent-soft);padding:10px 12px;cursor:pointer;white-space:nowrap;font:inherit;font-size:11px;
    }
    .ffsm-tab.active { color:var(--ffsm-accent);border-bottom-color:var(--ffsm-accent); }
    .ffsm-tab[data-tab="wardrobe"] { color:#f3a6da; }
    .ffsm-tab[data-tab="wardrobe"].active { color:var(--ffsm-pink);border-bottom-color:var(--ffsm-pink); }
    .ffsm-content { padding:10px;display:grid;gap:10px; }
    .ffsm-grid2 { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px; }
    .ffsm-grid3 { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px; }
    .ffsm-card {
      min-width:0;background:rgba(0,20,40,.62);border:1px solid var(--ffsm-border);
      border-radius:7px;padding:9px;overflow:hidden;
    }
    .ffsm-card-title {
      color:var(--ffsm-accent);font-weight:800;font-size:12px;
      padding-bottom:5px;margin-bottom:6px;border-bottom:1px solid var(--ffsm-border);
    }
    .ffsm-row {
      display:grid;grid-template-columns:minmax(82px,34%) minmax(0,1fr);gap:8px;
      padding:5px 0;border-bottom:1px dashed rgba(255,255,255,.08);font-size:11px;line-height:1.3;
    }
    .ffsm-row:last-child { border-bottom:0; }
    .ffsm-label { color:var(--ffsm-accent-soft);overflow-wrap:anywhere; }
    .ffsm-value { color:var(--lumiverse-text);text-align:right;overflow-wrap:anywhere;white-space:pre-wrap; }
    .ffsm-statbox { display:grid;gap:4px; }
    .ffsm-stathead { display:flex;justify-content:space-between;font-size:10px;color:var(--ffsm-accent-soft); }
    .ffsm-track { height:7px;border-radius:99px;background:rgba(0,0,0,.48);overflow:hidden; }
    .ffsm-fill { height:100%;border-radius:99px;background:linear-gradient(90deg,#00b8d4,#69f0ae); }
    .ffsm-fill.hp { background:linear-gradient(90deg,#ff5252,#ff8a80); }
    .ffsm-fill.mp { background:linear-gradient(90deg,#4272f5,#82b1ff); }
    .ffsm-fill.st { background:linear-gradient(90deg,#50c878,#69f0ae); }
    .ffsm-ownerbar { display:flex;gap:6px;align-items:center;flex-wrap:wrap; }
    .ffsm-select,.ffsm-input,.ffsm-textarea {
      min-width:0;border:1px solid var(--ffsm-border);border-radius:5px;background:rgba(0,0,0,.28);
      color:var(--lumiverse-text);padding:6px 8px;font:inherit;font-size:11px;
    }
    .ffsm-select { max-width:100%; }
    .ffsm-input { width:100%;box-sizing:border-box; }
    .ffsm-textarea { width:100%;min-height:62px;resize:vertical;box-sizing:border-box; }
    .ffsm-item-list { display:grid;gap:6px; }
    .ffsm-item {
      display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 7px;
      border:1px solid rgba(0,229,255,.18);border-radius:6px;padding:7px;background:rgba(255,255,255,.025);
    }
    .ffsm-item-name { font-weight:700;font-size:11px;color:var(--lumiverse-text);overflow-wrap:anywhere; }
    .ffsm-item-detail { grid-column:1/-1;color:var(--lumiverse-text-muted);font-size:9px;line-height:1.35;overflow-wrap:anywhere; }
    .ffsm-item-actions { display:flex;gap:4px;align-items:start; }
    .ffsm-badges { display:flex;flex-wrap:wrap;gap:3px;margin-top:3px; }
    .ffsm-badge { border:1px solid rgba(129,212,250,.24);border-radius:999px;padding:1px 5px;font-size:8px;color:var(--ffsm-accent-soft); }
    .ffsm-empty { padding:14px;text-align:center;color:var(--lumiverse-text-muted);font-size:11px; }
    .ffsm-familiar { display:grid;gap:5px; }
    .ffsm-familiar-name { color:var(--ffsm-accent);font-weight:800;font-size:13px; }
    .ffsm-kvmini { display:flex;justify-content:space-between;gap:8px;font-size:10px;border-bottom:1px dashed rgba(255,255,255,.06);padding:3px 0; }
    .ffsm-kvmini span:first-child { color:var(--ffsm-accent-soft); }
    .ffsm-avatar { display:block;max-width:100%;max-height:280px;margin:0 auto;border-radius:6px;border:1px solid var(--ffsm-border);object-fit:contain; }
    .ffsm-hph { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px; }
    .ffsm-metric { border:1px solid rgba(0,229,255,.2);border-radius:7px;padding:7px;text-align:center;background:rgba(0,0,0,.18); }
    .ffsm-metric-label { color:var(--ffsm-accent-soft);font-size:8px;font-weight:700; }
    .ffsm-metric-value { color:var(--lumiverse-text);font-size:13px;font-weight:800;margin-top:3px; }
    .ffsm-newgame { display:grid;gap:10px;padding:10px; }
    .ffsm-formgrid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px; }
    .ffsm-field { display:grid;gap:3px;min-width:0; }
    .ffsm-field label { color:var(--ffsm-accent-soft);font-size:9px; }
    .ffsm-budget { font-size:10px;color:var(--ffsm-accent-soft); }
    .ffsm-notice { padding:8px;border-radius:6px;background:rgba(255,211,106,.08);border:1px solid rgba(255,211,106,.25);color:#ffd36a;font-size:10px;line-height:1.4; }
    .ffsm-tree-search { position:sticky;top:0;z-index:2;background:#002b4c;padding-bottom:6px; }
    .ffsm-tree { max-height:70vh;overflow:auto;padding-right:3px; }
    .ffsm-tree details { margin:3px 0 0 6px;border-left:1px solid rgba(129,212,250,.15);padding-left:5px; }
    .ffsm-tree summary { cursor:pointer;color:var(--ffsm-accent-soft);font-size:10px;overflow-wrap:anywhere; }
    .ffsm-tree-leaf { display:grid;grid-template-columns:minmax(80px,32%) minmax(0,1fr);gap:6px;padding:3px 2px;border-top:1px dashed rgba(255,255,255,.06);font-size:9px; }
    .ffsm-tree-key { color:var(--ffsm-accent-soft);overflow-wrap:anywhere; }
    .ffsm-tree-val { color:var(--lumiverse-text);white-space:pre-wrap;overflow-wrap:anywhere; }
    .ffsm-diag { margin:0 10px 10px;border:1px solid rgba(255,255,255,.08);border-radius:6px;background:rgba(0,0,0,.12); }
    .ffsm-diag summary { cursor:pointer;padding:7px;color:var(--lumiverse-text-muted);font-size:9px; }
    .ffsm-diag pre { margin:0;padding:8px;max-height:220px;overflow:auto;font-size:8px;white-space:pre-wrap;word-break:break-word; }
    @media (max-width:560px) {
      .ffsm-app.open { height:46vh;min-height:280px;max-height:520px; }
      .ffsm-grid2,.ffsm-grid3,.ffsm-formgrid { grid-template-columns:1fr; }
      .ffsm-head { flex-direction:column; }
      .ffsm-head-actions { justify-content:flex-start; }
      .ffsm-hph { grid-template-columns:repeat(2,minmax(0,1fr)); }
    }
  `);

  const actionMount = ctx.ui.mount('chat_actions') as HTMLElement;
  const panelMount = ctx.ui.mount('chat_composer_above') as HTMLElement;
  actionMount.style.display = 'contents';
  panelMount.style.display = 'contents';

  const inputArea = actionMount.closest('[data-component="InputArea"]') as HTMLElement | null;
  const previousInputOverflow = inputArea?.style.overflow ?? '';
  if (inputArea) inputArea.style.overflow = 'visible';

  const toggle = make('button', 'ffsm-toolbar-btn') as HTMLButtonElement;
  toggle.type = 'button';
  toggle.title = 'FF + MVU StatusMenu';
  toggle.setAttribute('aria-label', 'FF + MVU StatusMenu');
  toggle.setAttribute('aria-pressed', 'false');
  toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>';
  actionMount.appendChild(toggle);

  const app = make('div', 'ffsm-app');
  panelMount.appendChild(app);

  let activeChatId: string | null = null;
  let snapshot: GuiSnapshot | null = null;
  let runtimeStatus: Record<string, unknown> = {};
  let enabled = false;
  let busy = false;
  let activeTab: TabId = 'overview';
  let selectedOwnerId = 'player';
  let equipTargetOwnerId = 'player';
  let ffSearch = '';
  let variablesSearch = '';
  let notice = '';
  let panelOpen = false;
  let legacyImportOpen = false;
  let legacyImportText = '';

  const PANEL_HEIGHT_KEY = 'ffmvu.statusmenu.panelHeight.v1';
  const DEFAULT_PANEL_HEIGHT = 520;
  let panelHeight = (() => {
    try {
      const stored = Number(window.localStorage.getItem(PANEL_HEIGHT_KEY));
      return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_PANEL_HEIGHT;
    } catch {
      return DEFAULT_PANEL_HEIGHT;
    }
  })();

  function clampPanelHeight(value: number): number {
    const minimum = 280;
    const maximum = Math.max(minimum, window.innerHeight - 110);
    return Math.round(Math.max(minimum, Math.min(maximum, value)));
  }

  function applyPanelHeight(): void {
    panelHeight = clampPanelHeight(panelHeight);
    app.style.height = panelHeight + 'px';
  }

  function persistPanelHeight(): void {
    try {
      window.localStorage.setItem(PANEL_HEIGHT_KEY, String(panelHeight));
    } catch {}
  }

  function resizeGrip(): HTMLElement {
    const grip = make('div', 'ffsm-resize-grip');
    grip.title = 'Drag to resize FFMVU StatusMenu';
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-orientation', 'horizontal');
    let dragging = false;
    let startY = 0;
    let startHeight = 0;

    const finish = () => {
      if (!dragging) return;
      dragging = false;
      grip.classList.remove('dragging');
      persistPanelHeight();
    };

    grip.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      dragging = true;
      startY = event.clientY;
      startHeight = app.getBoundingClientRect().height || panelHeight;
      grip.classList.add('dragging');
      grip.setPointerCapture(event.pointerId);
    });
    grip.addEventListener('pointermove', event => {
      if (!dragging) return;
      panelHeight = clampPanelHeight(startHeight + (startY - event.clientY));
      applyPanelHeight();
    });
    grip.addEventListener('pointerup', finish);
    grip.addEventListener('pointercancel', finish);
    return grip;
  }

  const viewportResize = () => {
    if (panelOpen) applyPanelHeight();
  };
  window.addEventListener('resize', viewportResize);

  function syncPanelVisibility(): void {
    app.classList.toggle('open', panelOpen);
    toggle.classList.toggle('active', panelOpen);
    toggle.setAttribute('aria-pressed', String(panelOpen));
    if (panelOpen) applyPanelHeight();
  }

  toggle.addEventListener('click', () => {
    panelOpen = !panelOpen;
    syncPanelVisibility();
    if (panelOpen) {
      ctx.sendToBackend({ type: 'ffmvu_get_status' });
      requestState();
    }
  });

  function activeState(): FFMVUState | null {
    return snapshot?.ok && snapshot.initialized && snapshot.state ? snapshot.state : null;
  }

  function mutationDisabled(): boolean {
    return busy || snapshot?.generationPending === true || !snapshot?.headNodeId || !snapshot?.headStateHash || !enabled;
  }

  function requestState(): void {
    if (!activeChatId) {
      snapshot = null;
      render();
      return;
    }
    ctx.sendToBackend({ type: 'ffmvu_gui_get_state', chatId: activeChatId });
  }

  function sendIntent(intent: GuiIntent): void {
    if (!activeChatId || !snapshot?.headNodeId || !snapshot.headStateHash || mutationDisabled()) return;
    busy = true;
    notice = 'Applying ' + intent.type + '…';
    render();
    ctx.sendToBackend({
      type: 'ffmvu_gui_intent',
      chatId: activeChatId,
      expectedHeadNodeId: snapshot.headNodeId,
      expectedHeadStateHash: snapshot.headStateHash,
      requestId: requestId('gui'),
      intent,
    });
  }

  function ownerSelect(state: FFMVUState, selected: string, onChange: (id: string) => void): HTMLSelectElement {
    const select = make('select', 'ffsm-select');
    for (const owner of statusOwners(state)) {
      const option = document.createElement('option');
      option.value = owner.id;
      option.textContent = ownerLabel(owner);
      option.selected = owner.id === selected;
      select.appendChild(option);
    }
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  function card(title: string): HTMLDivElement {
    const node = make('div', 'ffsm-card');
    node.appendChild(make('div', 'ffsm-card-title', title));
    return node;
  }

  function addRow(parent: HTMLElement, label: string, value: unknown): void {
    const row = make('div', 'ffsm-row');
    row.append(make('div', 'ffsm-label', label), make('div', 'ffsm-value', statusText(value)));
    parent.appendChild(row);
  }

  function statBar(label: string, currentRaw: unknown, maxRaw: unknown, kind: 'hp' | 'mp' | 'st'): HTMLElement {
    const current = statusNumber(currentRaw);
    const max = statusNumber(maxRaw);
    const box = make('div', 'ffsm-statbox');
    const head = make('div', 'ffsm-stathead');
    head.append(make('span', '', label), make('span', '', (current ?? '—') + ' / ' + (max ?? '—')));
    const track = make('div', 'ffsm-track');
    const fill = make('div', 'ffsm-fill ' + kind);
    fill.style.width = percent(current, max) + '%';
    track.appendChild(fill);
    box.append(head, track);
    return box;
  }

  function renderHeader(shell: HTMLElement): void {
    const head = make('div', 'ffsm-head');
    const copy = make('div');
    copy.append(
      make('div', 'ffsm-head-title', 'FF + MVU · Native StatusMenu'),
      make('div', 'ffsm-head-sub', activeChatId ? 'Active chat: ' + activeChatId : 'No active chat'),
    );
    const actions = make('div', 'ffsm-head-actions');
    const arm = make('button', 'ffsm-btn', enabled ? 'Disarm' : 'Arm');
    arm.addEventListener('click', () => {
      arm.disabled = true;
      ctx.sendToBackend({ type: 'ffmvu_set_enabled', enabled: !enabled });
    });
    const refresh = make('button', 'ffsm-btn', 'Refresh');
    refresh.disabled = !activeChatId;
    refresh.addEventListener('click', requestState);
    actions.append(arm, refresh);
    head.append(copy, actions);
    shell.appendChild(head);

    const status = make('div', 'ffsm-statusline');
    const bridge = make('span', enabled ? 'ok' : 'warn', enabled ? 'Bridge armed' : 'Bridge disarmed');
    const healthText = snapshot?.ok === false ? (snapshot.headHealth ?? 'unresolved') : snapshot?.initialized ? 'Head ready' : 'State not initialized';
    const health = make('span', snapshot?.ok === false ? 'bad' : snapshot?.initialized ? 'ok' : 'warn', healthText);
    const pending = make('span', snapshot?.generationPending ? 'warn' : '', snapshot?.generationPending ? 'Generation in flight' : 'No generation in flight');
    status.append(bridge, health, pending);
    if (snapshot?.variantId) status.appendChild(make('span', '', 'Variant ' + snapshot.variantId));
    shell.appendChild(status);

    if (notice) shell.appendChild(make('div', 'ffsm-notice', notice));
  }

  function renderNav(shell: HTMLElement): void {
    const nav = make('div', 'ffsm-nav');
    for (const [id, title] of TAB_DEFS) {
      const button = make('button', 'ffsm-tab' + (activeTab === id ? ' active' : ''), title);
      button.dataset.tab = id;
      button.addEventListener('click', () => {
        activeTab = id;
        render();
      });
      nav.appendChild(button);
    }
    shell.appendChild(nav);
  }

  function renderOverview(state: FFMVUState): HTMLElement {
    const content = make('div', 'ffsm-content');
    const top = make('div', 'ffsm-grid2');

    const stats = card('Main Stats');
    stats.append(
      statBar('HP', state.Mainchar.Hp_curr, state.Mainchar.Hp_max, 'hp'),
      statBar('MP', state.Mainchar.Mp_curr, state.Mainchar.Mp_max, 'mp'),
      statBar('ST', state.Mainchar.Sta_curr, state.Mainchar.Sta_max, 'st'),
    );

    const world = card('World Info');
    addRow(world, 'Date', state.World.Date);
    addRow(world, 'Time', state.World.Time);
    addRow(world, 'Location', state.World.Location);
    addRow(world, 'Weather', state.World.Weather);

    const character = card('Character Status');
    for (const [key, label] of [
      ['Name', 'Name'], ['Age', 'Age'], ['Gender', 'Gender'], ['Occupation', 'Occupation'],
      ['Race', 'Race'], ['Level', 'Level'], ['Exp', 'Exp'], ['Mental_state', 'Mental State'], ['Core-points', 'Core Point'],
    ] as Array<[keyof typeof state.Mainchar, string]>) addRow(character, label, state.Mainchar[key]);

    const avatar = card('Avatar');
    const image = statusText(state.Mainchar.Image, '');
    if (image && image !== '—') {
      const img = make('img', 'ffsm-avatar');
      img.src = image;
      img.alt = 'Avatar';
      img.addEventListener('error', () => {
        img.replaceWith(make('div', 'ffsm-empty', 'Image could not be loaded.'));
      });
      avatar.appendChild(img);
    } else avatar.appendChild(make('div', 'ffsm-empty', 'No avatar set.'));

    top.append(stats, world, character, avatar);
    content.appendChild(top);

    const hph = statusHphOverview(state);
    if (hph) {
      const hphCard = card('Genitalia Info');
      const metrics = make('div', 'ffsm-hph');
      const values: Array<[string, unknown, string]> = [
        ['BLADDER', hph.bladder, '/ 10'],
        ['AROUSAL', hph.arousal, '/ 10'],
        ['ERECTION', hph.erection, '/ 10'],
        ['SEMEN', hph.semenMl, hph.semenCapacityMl === null ? 'ml' : '/ ' + hph.semenCapacityMl + ' ml'],
        ['LENGTH', hph.lengthCm, 'cm'],
        ['GIRTH', hph.girthCm, 'cm'],
      ];
      for (const [label, value, suffix] of values) {
        const metric = make('div', 'ffsm-metric');
        metric.append(make('div', 'ffsm-metric-label', label), make('div', 'ffsm-metric-value', (value ?? '—') + ' ' + suffix));
        metrics.appendChild(metric);
      }
      hphCard.appendChild(metrics);
      content.appendChild(hphCard);
    }

    const quests = card('Current Quests');
    const questRows = statusCompactObject(state.Mainchar.Quests, 8);
    if (!questRows.length) quests.appendChild(make('div', 'ffsm-empty', 'No active quests.'));
    else for (const [key, value] of questRows) addRow(quests, key, value);
    content.appendChild(quests);
    return content;
  }

  function renderAttributes(state: FFMVUState): HTMLElement {
    const content = make('div', 'ffsm-content');
    const grid = make('div', 'ffsm-grid2');
    const core = card('Base Attributes');
    for (const [key, label] of CORE_STATS) addRow(core, label, (state.Mainchar as unknown as MutableRecord)[key]);
    const combat = card('Combat Stats');
    for (const [key, label] of COMBAT_STATS) addRow(combat, label, (state.Mainchar as unknown as MutableRecord)[key]);
    grid.append(core, combat);
    content.appendChild(grid);
    const skills = card('Skill List');
    const rows = statusCompactObject(state.Mainchar.Skills, 100);
    if (!rows.length) skills.appendChild(make('div', 'ffsm-empty', 'No skills learned.'));
    else for (const [key, value] of rows) addRow(skills, key, value);
    content.appendChild(skills);
    return content;
  }

  function renderFamiliars(state: FFMVUState): HTMLElement {
    const content = make('div', 'ffsm-content');
    const familiarEntries = statusOwners(state).filter(owner => owner.ref.kind === 'familiar');
    if (!familiarEntries.length) {
      content.appendChild(make('div', 'ffsm-empty', 'No familiars yet.'));
      return content;
    }
    for (const owner of familiarEntries) {
      const box = card(owner.label);
      box.classList.add('ffsm-familiar');
      const raw = owner.record;
      const name = make('div', 'ffsm-familiar-name', owner.label);
      box.appendChild(name);
      for (const [key, label] of [
        ['Race', 'Race'], ['Occupation', 'Job'], ['Level', 'Lv'], ['Exp', 'Exp'],
        ['Location', 'Loc'], ['Affection', 'Affection'], ['Familiar_Status', 'Familiar'],
        ['Gender', 'Gender'], ['Age', 'Age'], ['Height', 'Height'],
      ]) {
        if (raw[key] === undefined) continue;
        const row = make('div', 'ffsm-kvmini');
        row.append(make('span', '', label), make('span', '', statusText(raw[key])));
        box.appendChild(row);
      }
      const counts = make('div', 'ffsm-kvmini');
      counts.append(
        make('span', '', 'Inventory / Equipment'),
        make('span', '', Object.keys(asRecord(raw.Inventory)).length + ' / ' + Object.keys(asRecord(raw.Equipment)).length),
      );
      box.appendChild(counts);
      const actions = make('div', 'ffsm-ownerbar');
      const wardrobe = make('button', 'ffsm-btn ffsm-btn-pink', 'Wardrobe');
      wardrobe.addEventListener('click', () => {
        selectedOwnerId = owner.id;
        activeTab = 'wardrobe';
        render();
      });
      const gear = make('button', 'ffsm-btn', 'Equipment');
      gear.addEventListener('click', () => {
        selectedOwnerId = owner.id;
        activeTab = 'equipment';
        render();
      });
      actions.append(wardrobe, gear);
      box.appendChild(actions);
      content.appendChild(box);
    }
    return content;
  }

  function outfitItem(
    owner: StatusOwner,
    side: 'Worn' | 'Wardrobe',
    key: string,
    raw: unknown,
  ): HTMLElement {
    const record = valueRecord(raw);
    const item = make('div', 'ffsm-item');
    const main = make('div');
    main.appendChild(make('div', 'ffsm-item-name', statusText(record.Name, key)));
    const badges = make('div', 'ffsm-badges');
    for (const badgeKey of ['Slot', 'Layer']) if (record[badgeKey]) badges.appendChild(make('span', 'ffsm-badge', statusText(record[badgeKey])));
    main.appendChild(badges);
    const actions = make('div', 'ffsm-item-actions');
    const action = make('button', 'ffsm-btn ffsm-btn-pink', side === 'Worn' ? 'Remove' : 'Wear');
    action.disabled = mutationDisabled();
    action.addEventListener('click', () => sendIntent({ type: 'outfit.move', owner: owner.ref, from: side, itemKey: key }));
    actions.appendChild(action);
    item.append(main, actions);
    const details = htmlDetails(record);
    if (details) item.appendChild(make('div', 'ffsm-item-detail', details));
    return item;
  }

  function renderWardrobe(state: FFMVUState): HTMLElement {
    const content = make('div', 'ffsm-content');
    const owners = statusOwners(state);
    if (!owners.some(owner => owner.id === selectedOwnerId)) selectedOwnerId = 'player';
    const owner = statusOwnerById(state, selectedOwnerId);
    const ownerBar = make('div', 'ffsm-ownerbar');
    ownerBar.append(make('span', 'ffsm-label', 'Owner'), ownerSelect(state, selectedOwnerId, id => {
      selectedOwnerId = id;
      render();
    }));
    content.appendChild(ownerBar);

    const outfit = asRecord(owner.record.Outfit);
    const worn = asRecord(outfit.Worn);
    const wardrobe = asRecord(outfit.Wardrobe);
    const grid = make('div', 'ffsm-grid2');
    const wornCard = card('Worn · ' + Object.keys(worn).length);
    const wornList = make('div', 'ffsm-item-list');
    if (!Object.keys(worn).length) wornList.appendChild(make('div', 'ffsm-empty', 'Nothing worn.'));
    else for (const [key, raw] of Object.entries(worn)) wornList.appendChild(outfitItem(owner, 'Worn', key, raw));
    wornCard.appendChild(wornList);

    const wardrobeCard = card('Wardrobe · ' + Object.keys(wardrobe).length);
    const wardrobeList = make('div', 'ffsm-item-list');
    if (!Object.keys(wardrobe).length) wardrobeList.appendChild(make('div', 'ffsm-empty', 'Wardrobe is empty.'));
    else for (const [key, raw] of Object.entries(wardrobe)) wardrobeList.appendChild(outfitItem(owner, 'Wardrobe', key, raw));
    wardrobeCard.appendChild(wardrobeList);
    grid.append(wornCard, wardrobeCard);
    content.appendChild(grid);
    return content;
  }

  function itemNode(
    state: FFMVUState,
    sourceOwner: StatusOwner,
    item: ReturnType<typeof statusItems>[number],
    mode: 'inventory' | 'equipment',
  ): HTMLElement {
    const node = make('div', 'ffsm-item');
    const main = make('div');
    main.appendChild(make('div', 'ffsm-item-name', item.name + (item.qty !== null ? ' ×' + item.qty : '')));
    const badges = make('div', 'ffsm-badges');
    for (const badgeKey of ['Type', 'Slot']) if (item.record[badgeKey]) badges.appendChild(make('span', 'ffsm-badge', statusText(item.record[badgeKey])));
    main.appendChild(badges);
    const actions = make('div', 'ffsm-item-actions');

    if (mode === 'equipment') {
      const unequip = make('button', 'ffsm-btn', 'Unequip');
      unequip.disabled = mutationDisabled();
      unequip.addEventListener('click', () => sendIntent({
        type: 'equipment.unequip',
        owner: sourceOwner.ref,
        equipmentKey: item.key,
      }));
      actions.appendChild(unequip);
    } else {
      if (item.equippable) {
        const target = statusOwnerById(state, equipTargetOwnerId);
        const equip = make('button', 'ffsm-btn', 'Equip');
        equip.title = 'Equip to ' + ownerLabel(target);
        equip.disabled = mutationDisabled();
        equip.addEventListener('click', () => sendIntent({
          type: 'equipment.equip',
          sourceOwner: sourceOwner.ref,
          targetOwner: target.ref,
          itemKey: item.key,
        }));
        actions.appendChild(equip);
      }
      const del = make('button', 'ffsm-btn ffsm-btn-danger', 'Delete');
      del.disabled = mutationDisabled();
      del.addEventListener('click', () => {
        if (!window.confirm('Delete "' + item.name + '"?')) return;
        sendIntent({ type: 'inventory.delete', owner: sourceOwner.ref, itemKey: item.key });
      });
      actions.appendChild(del);
    }
    node.append(main, actions);
    const details = htmlDetails(item.record);
    if (details) node.appendChild(make('div', 'ffsm-item-detail', details));
    return node;
  }

  function renderEquipment(state: FFMVUState): HTMLElement {
    const content = make('div', 'ffsm-content');
    const owners = statusOwners(state);
    if (!owners.some(owner => owner.id === selectedOwnerId)) selectedOwnerId = 'player';
    if (!owners.some(owner => owner.id === equipTargetOwnerId)) equipTargetOwnerId = selectedOwnerId;
    const owner = statusOwnerById(state, selectedOwnerId);

    const bar = make('div', 'ffsm-ownerbar');
    bar.append(
      make('span', 'ffsm-label', 'Inventory owner'),
      ownerSelect(state, selectedOwnerId, id => {
        selectedOwnerId = id;
        if (!statusOwners(state).some(candidate => candidate.id === equipTargetOwnerId)) equipTargetOwnerId = id;
        render();
      }),
      make('span', 'ffsm-label', 'Equip target'),
      ownerSelect(state, equipTargetOwnerId, id => {
        equipTargetOwnerId = id;
        render();
      }),
    );
    content.appendChild(bar);

    const grid = make('div', 'ffsm-grid2');
    const equippedCard = card('Equipped');
    const equippedList = make('div', 'ffsm-item-list');
    const equipped = statusItems(owner.record.Equipment);
    if (!equipped.length) equippedList.appendChild(make('div', 'ffsm-empty', 'Nothing equipped.'));
    else for (const item of equipped) equippedList.appendChild(itemNode(state, owner, item, 'equipment'));
    equippedCard.appendChild(equippedList);

    const availableCard = card('Equippable Inventory');
    const availableList = make('div', 'ffsm-item-list');
    const available = statusItems(owner.record.Inventory).filter(item => item.equippable);
    if (!available.length) availableList.appendChild(make('div', 'ffsm-empty', 'No equippable items.'));
    else for (const item of available) availableList.appendChild(itemNode(state, owner, item, 'inventory'));
    availableCard.appendChild(availableList);
    grid.append(equippedCard, availableCard);
    content.appendChild(grid);
    return content;
  }

  function renderItems(state: FFMVUState): HTMLElement {
    const content = make('div', 'ffsm-content');
    const owners = statusOwners(state);
    if (!owners.some(owner => owner.id === selectedOwnerId)) selectedOwnerId = 'player';
    if (!owners.some(owner => owner.id === equipTargetOwnerId)) equipTargetOwnerId = selectedOwnerId;
    const owner = statusOwnerById(state, selectedOwnerId);
    const bar = make('div', 'ffsm-ownerbar');
    bar.append(
      make('span', 'ffsm-label', 'Inventory owner'),
      ownerSelect(state, selectedOwnerId, id => { selectedOwnerId = id; render(); }),
      make('span', 'ffsm-label', 'Equip target'),
      ownerSelect(state, equipTargetOwnerId, id => { equipTargetOwnerId = id; render(); }),
    );
    content.appendChild(bar);
    const inventoryCard = card('Inventory · ' + statusItems(owner.record.Inventory).length);
    const list = make('div', 'ffsm-item-list');
    const items = statusItems(owner.record.Inventory);
    if (!items.length) list.appendChild(make('div', 'ffsm-empty', 'Empty inventory.'));
    else for (const item of items) list.appendChild(itemNode(state, owner, item, 'inventory'));
    inventoryCard.appendChild(list);
    content.appendChild(inventoryCard);
    return content;
  }

  function renderCollectionCard(title: string, value: unknown): HTMLElement {
    const box = card(title);
    const rows = statusCompactObject(value, 100);
    if (!rows.length) box.appendChild(make('div', 'ffsm-empty', 'None.'));
    else for (const [key, shown] of rows) addRow(box, key, shown);
    return box;
  }

  function renderOthers(state: FFMVUState): HTMLElement {
    const content = make('div', 'ffsm-content');
    const grid = make('div', 'ffsm-grid2');
    grid.append(
      renderCollectionCard('Talents', state.Mainchar.Talents),
      renderCollectionCard('Buffs', state.Mainchar.Buffs),
      renderCollectionCard('Ailments', state.Mainchar.Ailments),
      renderCollectionCard('Real Estate', state.Mainchar.Real_estate),
      renderCollectionCard('World · Factions', state.World_Calc.Factions),
      renderCollectionCard('World · Locations', state.World_Calc.Locations),
      renderCollectionCard('World · Ruins', state.World_Calc.Ruins),
      renderCollectionCard('World · Events', state.World_Calc.Events),
    );
    content.appendChild(grid);
    return content;
  }

  function treeContains(value: unknown, path: string, query: string): boolean {
    if (!query) return true;
    if ((path + ' ' + statusText(value, '')).toLowerCase().includes(query)) return true;
    if (Array.isArray(value)) return value.some((child, index) => treeContains(child, path + '.' + index, query));
    if (isRecord(value)) return Object.entries(value).some(([key, child]) => treeContains(child, path ? path + '.' + key : key, query));
    return false;
  }

  function treeNode(key: string, value: unknown, path: string, depth: number, query: string): HTMLElement | null {
    if (!treeContains(value, path, query)) return null;
    if (isRecord(value) || Array.isArray(value)) {
      const details = make('details');
      if (depth < 1 || query) details.open = true;
      const count = Array.isArray(value) ? value.length : Object.keys(value).length;
      details.appendChild(make('summary', '', key + ' (' + count + ')'));
      const entries = Array.isArray(value) ? value.map((child, index) => [String(index), child] as const) : Object.entries(value);
      for (const [childKey, child] of entries) {
        const childPath = path ? path + '.' + childKey : childKey;
        const built = treeNode(childKey, child, childPath, depth + 1, query);
        if (built) details.appendChild(built);
      }
      return details;
    }
    const row = make('div', 'ffsm-tree-leaf');
    row.append(make('div', 'ffsm-tree-key', key), make('div', 'ffsm-tree-val', statusText(value, 'null')));
    return row;
  }

  function renderFfState(state: FFMVUState): HTMLElement {
    const content = make('div', 'ffsm-content');
    const searchWrap = make('div', 'ffsm-tree-search');
    const search = make('input', 'ffsm-input') as HTMLInputElement;
    search.type = 'search';
    search.placeholder = 'Search FF state…';
    search.value = ffSearch;
    search.addEventListener('input', () => {
      ffSearch = search.value.trim().toLowerCase();
      const cursor = search.selectionStart;
      activeTab = 'ffstate';
      render();
      const next = app.querySelector<HTMLInputElement>('.ffsm-tree-search input');
      if (next) {
        next.focus();
        if (cursor !== null) next.setSelectionRange(cursor, cursor);
      }
    });
    searchWrap.appendChild(search);
    const tree = make('div', 'ffsm-tree');
    const root = treeNode('stat_data', state, '', 0, ffSearch);
    if (root) tree.appendChild(root);
    else tree.appendChild(make('div', 'ffsm-empty', 'No matching state paths.'));
    content.append(searchWrap, tree);
    return content;
  }

  function field(label: string, input: HTMLInputElement | HTMLTextAreaElement): HTMLElement {
    const wrap = make('div', 'ffsm-field');
    wrap.append(make('label', '', label), input);
    return wrap;
  }

  function textInput(value: string, type = 'text'): HTMLInputElement {
    const input = make('input', 'ffsm-input') as HTMLInputElement;
    input.type = type;
    input.value = value;
    return input;
  }

  function renderNewGame(): HTMLElement {
    const content = make('div', 'ffsm-newgame');
    const intro = card('New Game · GameStart v1.4');
    intro.appendChild(make('div', 'ffsm-head-sub', 'Core attributes: STR/AGI/CON/INT/WIS start at 5 and share up to 50 distributable points. Charisma is separate: 80–100.'));
    content.appendChild(intro);

    const importCard = card('Continue Existing FF+MVU Save');
    importCard.appendChild(make('div', 'ffsm-head-sub', 'Tier-1 legacy import. Paste the wrapper containing stat_data and, when available, ff_mvu_prompt_view + ff_mvu_snapshot_meta. The current Lumiverse transcript through its last message is treated as already represented by this snapshot.'));
    const importToggle = make('button', 'ffsm-btn', legacyImportOpen ? 'Hide Legacy Import' : 'Import Legacy Save') as HTMLButtonElement;
    importToggle.type = 'button';
    importToggle.style.marginTop = '8px';
    importToggle.disabled = busy;
    importToggle.addEventListener('click', () => {
      legacyImportOpen = !legacyImportOpen;
      render();
    });
    importCard.appendChild(importToggle);
    if (legacyImportOpen) {
      const legacyText = make('textarea', 'ffsm-textarea') as HTMLTextAreaElement;
      legacyText.placeholder = '{ "stat_data": { ... }, "ff_mvu_prompt_view": { ... }, "ff_mvu_snapshot_meta": { ... } }';
      legacyText.value = legacyImportText;
      legacyText.style.minHeight = '150px';
      legacyText.addEventListener('input', () => { legacyImportText = legacyText.value; });
      const importButton = make('button', 'ffsm-btn', 'Import as Legacy Base') as HTMLButtonElement;
      importButton.type = 'button';
      importButton.style.width = '100%';
      importButton.style.marginTop = '8px';
      importButton.disabled = !enabled || busy;
      importButton.addEventListener('click', () => {
        if (!activeChatId || busy || !enabled) return;
        let legacy: unknown;
        try {
          legacy = JSON.parse(legacyText.value);
        } catch (error) {
          notice = 'Legacy JSON parse failed: ' + String(error);
          render();
          return;
        }
        legacyImportText = legacyText.value;
        busy = true;
        notice = 'Importing authoritative legacy state…';
        render();
        ctx.sendToBackend({
          type: 'ffmvu_import_legacy',
          chatId: activeChatId,
          requestId: requestId('legacy'),
          legacy,
        });
      });
      importCard.append(legacyText, importButton);
    }
    content.appendChild(importCard);

    const form = document.createElement('form');
    form.className = 'ffsm-card';
    const grid = make('div', 'ffsm-formgrid');

    const date = textInput('Day 1');
    const time = textInput('08:00');
    const weather = textInput('Clear');
    const location = textInput('Unspecified');
    const name = textInput('{{user}}');
    const age = textInput('18');
    const gender = textInput('Male');
    const race = textInput('Human');
    const occupation = textInput('Adventurer');
    const mental = textInput('Calm');
    const level = textInput('1', 'number'); level.min = '1'; level.max = '140';
    const exp = textInput('0', 'number'); exp.min = '0';
    const core = textInput('0', 'number'); core.min = '0';
    const charisma = textInput('85', 'number'); charisma.min = '80'; charisma.max = '100';

    grid.append(
      field('Date', date), field('Time', time), field('Weather', weather), field('Location', location),
      field('Name', name), field('Age', age), field('Gender', gender), field('Race', race),
      field('Occupation', occupation), field('Mental state', mental), field('Level', level), field('EXP', exp),
      field('Core points', core), field('Charisma (80–100)', charisma),
    );
    form.appendChild(grid);

    const statsCard = make('div', 'ffsm-card');
    statsCard.style.marginTop = '9px';
    statsCard.appendChild(make('div', 'ffsm-card-title', 'Core Attributes'));
    const statsGrid = make('div', 'ffsm-formgrid');
    const statInputs: Record<string, HTMLInputElement> = {};
    for (const [key, label] of [['str','Strength'],['agi','Agility'],['con','Constitution'],['int','Intelligence'],['wis','Wisdom']]) {
      const input = textInput('5', 'number');
      input.min = '5';
      input.step = '1';
      statInputs[key] = input;
      statsGrid.appendChild(field(label, input));
    }
    const budget = make('div', 'ffsm-budget');
    const refreshBudget = () => {
      const values = {
        str: Number(statInputs.str.value), agi: Number(statInputs.agi.value), con: Number(statInputs.con.value),
        int: Number(statInputs.int.value), wis: Number(statInputs.wis.value),
      };
      const result = statusCoreBudget(values);
      budget.textContent = 'Spent: ' + result.spent + ' / 50 · Remaining: ' + result.remaining;
      budget.style.color = result.valid ? '' : '#ff8a80';
    };
    for (const input of Object.values(statInputs)) input.addEventListener('input', refreshBudget);
    refreshBudget();
    statsCard.append(statsGrid, budget);
    form.appendChild(statsCard);

    const weapon = make('textarea', 'ffsm-textarea') as HTMLTextAreaElement;
    weapon.placeholder = 'Optional starting weapon preference…';
    const weaponField = field('Optional Starting Weapon', weapon);
    weaponField.style.marginTop = '9px';
    form.appendChild(weaponField);

    const submit = make('button', 'ffsm-btn', 'Confirm & Start Journey') as HTMLButtonElement;
    submit.type = 'submit';
    submit.style.width = '100%';
    submit.style.marginTop = '10px';
    submit.disabled = !enabled || busy;
    form.appendChild(submit);

    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!activeChatId || busy || !enabled) return;
      const statValues = {
        str: Number(statInputs.str.value), agi: Number(statInputs.agi.value), con: Number(statInputs.con.value),
        int: Number(statInputs.int.value), wis: Number(statInputs.wis.value),
      };
      const budgetResult = statusCoreBudget(statValues);
      if (!budgetResult.valid) {
        notice = 'Core attribute budget is invalid.';
        render();
        return;
      }
      busy = true;
      notice = 'Creating authoritative GameStart state…';
      render();
      ctx.sendToBackend({
        type: 'ffmvu_start_new_game',
        chatId: activeChatId,
        requestId: requestId('newgame'),
        gameStart: {
          date: date.value.trim() || 'Day 1',
          time: time.value.trim() || '08:00',
          weather: weather.value.trim() || 'Clear',
          location: location.value.trim() || 'Unspecified',
          name: name.value.trim() || '{{user}}',
          age: age.value.trim() || '18',
          gender: gender.value.trim() || 'Male',
          race: race.value.trim() || 'Human',
          occupation: occupation.value.trim() || 'Adventurer',
          mental: mental.value.trim() || 'Calm',
          charisma: Number(charisma.value),
          level: Number(level.value),
          exp: Number(exp.value),
          core: Number(core.value),
          weaponRequest: weapon.value.trim(),
          stats: statValues,
        },
      });
    });
    content.appendChild(form);
    return content;
  }

  function renderBody(shell: HTMLElement): void {
    if (!activeChatId) {
      shell.appendChild(make('div', 'ffsm-empty', 'Open a chat to use FFMVU StatusMenu.'));
      return;
    }
    if (!snapshot) {
      shell.appendChild(make('div', 'ffsm-empty', 'Loading branch state…'));
      return;
    }
    if (snapshot.ok === false) {
      const box = make('div', 'ffsm-content');
      const error = card('State unavailable');
      error.appendChild(make('div', 'ffsm-notice', snapshot.reason ?? 'Active semantic head is unresolved.'));
      const retry = make('button', 'ffsm-btn', 'Retry');
      retry.addEventListener('click', requestState);
      error.appendChild(retry);
      box.appendChild(error);
      shell.appendChild(box);
      return;
    }
    if (snapshot.initialized === false) {
      shell.appendChild(renderNewGame());
      return;
    }
    const state = activeState();
    if (!state) {
      shell.appendChild(make('div', 'ffsm-empty', 'State payload missing.'));
      return;
    }
    renderNav(shell);
    const body =
      activeTab === 'overview' ? renderOverview(state) :
      activeTab === 'attributes' ? renderAttributes(state) :
      activeTab === 'familiars' ? renderFamiliars(state) :
      activeTab === 'wardrobe' ? renderWardrobe(state) :
      activeTab === 'equipment' ? renderEquipment(state) :
      activeTab === 'items' ? renderItems(state) :
      activeTab === 'others' ? renderOthers(state) :
      renderFfState(state);
    shell.appendChild(body);
  }

  function renderDiagnostics(shell: HTMLElement): void {
    const details = make('details', 'ffsm-diag');
    details.appendChild(make('summary', '', 'Diagnostics · ' + String(runtimeStatus.phase ?? 'idle')));
    const pre = make('pre');
    pre.textContent = JSON.stringify(runtimeStatus, null, 2);
    details.appendChild(pre);
    shell.appendChild(details);
  }

  function render(): void {
    app.replaceChildren();
    const frame = make('div', 'ffsm-panel-frame');
    const content = make('div', 'ffsm-panel-content');
    frame.append(resizeGrip(), content);

    const state = activeState();
    if (state && snapshot?.ok && snapshot.initialized) {
      content.appendChild(renderLegacyStatusMenu({
        state,
        activeTab,
        selectedOwnerId,
        mutationDisabled: mutationDisabled(),
        onTab: tab => { activeTab = tab; },
        onOwner: ownerId => { selectedOwnerId = ownerId; },
        variablesSearch,
        onVariablesSearch: value => { variablesSearch = value; },
        onIntent: sendIntent,
        onUnsupported: message => {
          notice = message;
          window.alert(message);
        },
      }));
    } else {
      const shell = make('div', 'ffsm-shell');
      renderHeader(shell);
      renderBody(shell);
      renderDiagnostics(shell);
      content.appendChild(shell);
    }

    app.appendChild(frame);
    applyPanelHeight();
  }

  const backendUnsub = ctx.onBackendMessage((payload: any) => {
    if (payload?.type === 'ffmvu_status') {
      runtimeStatus = payload.status ?? {};
      if (typeof payload.status?.enabled === 'boolean') enabled = payload.status.enabled;
      const phase = String(payload.status?.phase ?? '');
      if (payload.status?.chatId === activeChatId && [
        'commit_complete', 'swipe_navigated', 'gui_commit_complete', 'new_game_complete', 'legacy_import_complete',
        'continue_commit_complete', 'no_patch', 'stopped_durable',
      ].includes(phase)) requestState();
      render();
      return;
    }
    if (payload?.type === 'ffmvu_gui_state') {
      if (payload.chatId !== activeChatId) return;
      snapshot = payload as GuiSnapshot;
      busy = false;
      if (snapshot.ok && snapshot.initialized) notice = '';
      render();
      return;
    }
    if (payload?.type === 'ffmvu_gui_result') {
      if (payload.chatId !== activeChatId) return;
      busy = false;
      if (payload.ok) {
        snapshot = {
          ok: true,
          initialized: true,
          chatId: payload.chatId,
          headNodeId: payload.headNodeId,
          headStateHash: payload.headStateHash,
          variantId: payload.variantId ?? null,
          generationPending: false,
          state: payload.state,
        };
        notice = '';
        render();
      } else {
        notice = String(payload.reason ?? 'GUI mutation failed.');
        render();
        requestState();
      }
      return;
    }
    if (payload?.type === 'ffmvu_new_game_result') {
      if (payload.chatId !== activeChatId) return;
      busy = false;
      if (payload.ok) {
        snapshot = {
          ok: true,
          initialized: true,
          chatId: payload.chatId,
          headNodeId: payload.headNodeId,
          headStateHash: payload.headStateHash,
          variantId: null,
          generationPending: false,
          state: payload.state,
        };
        notice = '';
        activeTab = 'overview';
        render();
      } else {
        const errors = Array.isArray(payload.validationErrors) ? ': ' + payload.validationErrors.join('; ') : '';
        notice = String(payload.reason ?? 'New Game failed') + errors;
        render();
      }
      return;
    }
    if (payload?.type === 'ffmvu_legacy_import_result') {
      if (payload.chatId !== activeChatId) return;
      busy = false;
      if (payload.ok) {
        snapshot = {
          ok: true,
          initialized: true,
          chatId: payload.chatId,
          headNodeId: payload.headNodeId,
          headStateHash: payload.headStateHash,
          variantId: null,
          generationPending: false,
          state: payload.state,
        };
        legacyImportOpen = false;
        legacyImportText = '';
        notice = 'Legacy FF+MVU state imported.';
        activeTab = 'overview';
        render();
      } else {
        notice = String(payload.reason ?? 'Legacy import failed');
        render();
      }
    }
  });

  function applyActiveChat(next: string | null): void {
    if (next === activeChatId) return;
    activeChatId = next;
    snapshot = null;
    busy = false;
    notice = '';
    activeTab = 'overview';
    selectedOwnerId = 'player';
    equipTargetOwnerId = 'player';
    ffSearch = '';
    variablesSearch = '';
    render();
    requestState();
  }

  const chatSwitchUnsub = ctx.events.on('CHAT_SWITCHED', (payload: { chatId?: string | null }) => {
    const next = typeof payload?.chatId === 'string' ? payload.chatId : null;
    applyActiveChat(next);
  });

  const initial = ctx.getActiveChat();
  activeChatId = initial.chatId ?? null;
  syncPanelVisibility();
  render();
  ctx.sendToBackend({ type: 'ffmvu_get_status' });
  requestState();

  return () => {
    backendUnsub();
    chatSwitchUnsub();
    window.removeEventListener('resize', viewportResize);
    toggle.remove();
    app.remove();
    if (inputArea) {
      if (previousInputOverflow) inputArea.style.overflow = previousInputOverflow;
      else inputArea.style.removeProperty('overflow');
    }
    removeStyle();
    ctx.dom.cleanup();
  };
}
