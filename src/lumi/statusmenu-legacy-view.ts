import type { FFMVUState, JsonValue, MutableRecord } from '../shared/state-schema.js';
import type { GuiImageRef, GuiIntent, GuiOwnerRef } from '../shared/domain/gui-intents.js';
import { asRecord, isRecord } from '../shared/domain/value-utils.js';
import { statusItems, statusLegacyDeletePath, statusNumber, statusOwnerById, statusOwners, statusText } from './statusmenu-model.js';
import { LEGACY_STATUS_BODY_HTML, LEGACY_STATUS_CSS } from './statusmenu-legacy-template.js';
import { renderVariablesEditor, VARIABLES_EDITOR_CSS } from './variables-editor.js';

export type LegacyStatusTab =
  | 'overview'
  | 'attributes'
  | 'familiars'
  | 'wardrobe'
  | 'equipment'
  | 'items'
  | 'others'
  | 'ffstate'
  | 'variables';

export interface LegacyStatusViewOptions {
  state: FFMVUState;
  activeTab: LegacyStatusTab;
  selectedOwnerId: string;
  mutationDisabled: boolean;
  onTab(tab: LegacyStatusTab): void;
  onOwner(ownerId: string): void;
  variablesSearch: string;
  onVariablesSearch(value: string): void;
  snapshotExportDisabled: boolean;
  snapshotExportBusy: boolean;
  snapshotExportNotice: string;
  onSnapshotExport(action: 'copy' | 'download'): void;
  onIntent(intent: GuiIntent): void;
  onUnsupported(action: string): void;
}

const TAB_IDS: Record<LegacyStatusTab, string> = {
  overview: 'tab-tab-1',
  attributes: 'tab-tab-1770046656361',
  familiars: 'tab-tab-1770138241595',
  wardrobe: 'tab-outfits',
  equipment: 'tab-tab-1770203490813',
  items: 'tab-tab-1770205420551',
  others: 'tab-tab-1770205502569',
  ffstate: 'tab-ff-state',
  variables: 'tab-variables',
};

const TAB_ORDER: LegacyStatusTab[] = [
  'overview', 'attributes', 'familiars', 'wardrobe',
  'equipment', 'items', 'others', 'ffstate', 'variables',
];

const EMPTY_TEXT: Record<string, string> = {
  simple: 'None',
  quest: 'No active quests',
  inventory: 'Empty inventory',
  'equipment-action': 'Nothing equipped',
};

const OUTFIT_SLOT_ORDER: Record<string, number> = { Head: 0, Torso: 1, Legs: 2, Feet: 3, Extra: 4 };
const OUTFIT_LAYER_ORDER: Record<string, number> = { Underwear: 0, Base: 1, Outerwear: 2 };
const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 200'%3E%3Crect fill='%23e0e0e0' width='300' height='200'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='0.3em' fill='%23999' font-size='16' font-family='sans-serif'%3ENo Image%3C/text%3E%3C/svg%3E";
const LOCAL_IMAGE_PREFIX = 'mzsb_img_';

function record(value: unknown): MutableRecord {
  return isRecord(value) ? value : {};
}

function legacyTupleValue(value: unknown): unknown {
  return Array.isArray(value) && value.length >= 2 && typeof value[1] === 'string' ? value[0] : value;
}

function getPath(root: unknown, path: string): unknown {
  let value: unknown = root;
  for (const part of path.split('.').filter(Boolean)) {
    if (!isRecord(value) && !Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return legacyTupleValue(value);
}

function numberAt(root: unknown, path: string): number | null {
  const raw = getPath(root, path);
  if (raw === null || raw === undefined || raw === '' || raw === '???') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function imageStoragePath(target: GuiImageRef): string {
  if (target.kind === 'player-avatar') return 'Mainchar.Image';
  if (target.kind === 'world-map') return 'World.MapImage';
  return 'Familiar.' + target.id + '.Image';
}

function imageStateValue(state: FFMVUState, target: GuiImageRef): string {
  if (target.kind === 'player-avatar') return statusText(state.Mainchar.Image, '');
  if (target.kind === 'world-map') return statusText((state.World as MutableRecord).MapImage, '');
  const familiar = asRecord(state.Familiar)[target.id];
  return isRecord(familiar) ? statusText(familiar.Image, '') : '';
}

function readLocalImage(path: string): string {
  try { return window.localStorage.getItem(LOCAL_IMAGE_PREFIX + path) || ''; }
  catch { return ''; }
}

function writeLocalImage(path: string, value: string): void {
  try { window.localStorage.setItem(LOCAL_IMAGE_PREFIX + path, value); }
  catch { throw new Error('LOCAL_IMAGE_STORAGE_FAILED'); }
}

function clearLocalImage(path: string): void {
  try { window.localStorage.removeItem(LOCAL_IMAGE_PREFIX + path); } catch {}
}

function imageTargetForButton(button: HTMLElement): GuiImageRef | null {
  const root = button.getAttribute('data-save-root');
  const leaf = button.getAttribute('data-save-leaf');
  if (root === 'Mainchar' && leaf === 'Image') return { kind: 'player-avatar' };
  if (root === 'World' && leaf === 'MapImage') return { kind: 'world-map' };
  if (root === 'Familiar' && leaf === 'Image') {
    const id = button.dataset.ffmvuFamiliarId;
    if (id) return { kind: 'familiar-avatar', id };
  }
  return null;
}

function imageBytes(dataUrl: string): number {
  return Math.ceil((dataUrl.split(',')[1] || '').length * 3 / 4);
}

function compressLocalImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('no_file'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_failed'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('decode_failed'));
      image.onload = () => {
        const longest = Math.max(image.width, image.height) || 1;
        const scale = Math.min(1, 1920 / longest);
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return reject(new Error('canvas_failed'));
        context.drawImage(image, 0, 0, width, height);
        let quality = 0.9;
        let out = canvas.toDataURL('image/jpeg', quality);
        while (imageBytes(out) > 1536 * 1024 && quality > 0.6) {
          quality = Math.max(0.6, quality - 0.1);
          out = canvas.toDataURL('image/jpeg', quality);
        }
        if (imageBytes(out) > 1536 * 1024) return reject(new Error('compressed_image_too_large'));
        resolve(out);
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function shownNumber(value: number | null): string {
  if (value === null) return '—';
  return String(Number.isInteger(value) ? value : Math.round(value * 10) / 10);
}

function setSlot(fragment: ParentNode, name: string, value: string): void {
  const element = fragment.querySelector<HTMLElement>('[data-slot="' + name + '"]');
  if (!element) return;
  element.textContent = value;
  if (value) element.style.display = '';
}

function describe(raw: unknown): string {
  const value = legacyTupleValue(raw);
  if (value === null || value === undefined) return '';
  if (!isRecord(value)) return String(value);
  for (const key of ['Desc', 'description', 'name', 'type']) {
    if (value[key] !== undefined) return statusText(value[key], '');
  }
  return '';
}

function ownerRefForId(state: FFMVUState, ownerId: string): GuiOwnerRef {
  return statusOwnerById(state, ownerId).ref;
}

function shadowCss(): string {
  return LEGACY_STATUS_CSS
    .replace(/:root\s*\{/g, ':host {')
    .replace(/\bbody\s*\{/g, '.status-body {')
    + '\n'
    + ':host{display:block;width:100%;height:100%;min-height:0;color:#e0f7fa;position:relative;overflow:hidden;}'
    + '.status-body{position:absolute;top:0;left:50%;width:100%;height:128.205128%;min-height:0;padding:0!important;color:var(--text-primary)!important;transform:translateX(-50%) scale(.78);transform-origin:top center;}'
    + '.status-container{height:100%;min-height:0!important;color:var(--text-primary)!important;}'
    + '.tab-content{min-height:0;}'
    + '.prop-val,.ff25-value,.entry-title,.detail-val{color:var(--text-primary)!important;}'
    + 'button,input,textarea,select{font-family:inherit;}'
    + '.ve-snapshot-layout{display:flex;flex-direction:column;gap:8px;height:100%;min-height:0;}'
    + '.ve-snapshot-tools{display:flex;align-items:center;gap:6px;flex:0 0 auto;padding:2px 0 0;}'
    + '.ve-snapshot-note{flex:1;min-width:0;color:var(--text-secondary);font-size:.76em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '.ve-snapshot-layout>.ve-shell{flex:1 1 auto;height:auto;min-height:0;}'
    + VARIABLES_EDITOR_CSS;
}

function bindValues(root: ParentNode, data: unknown): void {
  root.querySelectorAll<HTMLElement>('[data-bind-val]').forEach(element => {
    const path = element.getAttribute('data-bind-val');
    if (path === null) return;
    element.textContent = statusText(getPath(data, path), '???');
  });
  root.querySelectorAll<HTMLElement>('[data-bind-curr]').forEach(element => {
    const path = element.getAttribute('data-bind-curr');
    if (path !== null) element.textContent = statusText(getPath(data, path), '0');
  });
  root.querySelectorAll<HTMLElement>('[data-bind-max]').forEach(element => {
    const path = element.getAttribute('data-bind-max');
    if (path !== null) element.textContent = statusText(getPath(data, path), '100');
  });
  root.querySelectorAll<HTMLElement>('[data-bind-bar]').forEach(element => {
    const path = element.getAttribute('data-bind-bar');
    if (!path) return;
    const maxPath = element.getAttribute('data-bind-bar-max') || path.replace('_curr', '_max');
    const current = Number(getPath(data, path)) || 0;
    const maximum = Number(getPath(data, maxPath)) || 100;
    const pct = Math.max(0, Math.min(100, maximum > 0 ? current / maximum * 100 : 0));
    element.style.width = pct + '%';
  });
  root.querySelectorAll<HTMLInputElement>('[data-bind-checked]').forEach(element => {
    const path = element.getAttribute('data-bind-checked');
    if (path) element.checked = Boolean(getPath(data, path));
  });
  root.querySelectorAll<HTMLImageElement>('[data-bind-img]').forEach(element => {
    const path = element.getAttribute('data-bind-img');
    if (!path) return;
    const value = statusText(getPath(data, path), '');
    if (value && value !== '—' && value !== 'N/A') {
      element.src = value;
      element.style.display = 'block';
    } else if (element.classList.contains('ff25-avatar-image')) {
      element.removeAttribute('src');
      element.style.display = 'none';
    } else {
      element.src = PLACEHOLDER_IMAGE;
      element.style.display = 'block';
    }
  });
}

function bindOverview(root: ShadowRoot, state: FFMVUState): void {
  root.querySelectorAll<HTMLElement>('[data-ff25-cur]').forEach(row => {
    const current = numberAt(state, row.getAttribute('data-ff25-cur') || '');
    const maximum = numberAt(state, row.getAttribute('data-ff25-max') || '');
    const currentElement = row.querySelector<HTMLElement>('.ff25-stat-current');
    const maximumElement = row.querySelector<HTMLElement>('.ff25-stat-max');
    const fill = row.querySelector<HTMLElement>('.ff25-stat-fill');
    if (currentElement) currentElement.textContent = shownNumber(current);
    if (maximumElement) maximumElement.textContent = shownNumber(maximum);
    if (fill) {
      const pct = current !== null && maximum !== null && maximum > 0 ? Math.max(0, Math.min(100, current / maximum * 100)) : 0;
      fill.style.height = pct + '%';
    }
  });

  const avatar = root.querySelector<HTMLImageElement>('.ff25-avatar-image');
  const placeholder = root.querySelector<HTMLElement>('.ff25-avatar-placeholder');
  if (placeholder) placeholder.style.display = avatar && avatar.style.display === 'block' ? 'none' : 'flex';

  const hph = getPath(state, 'Narrative.Scene.HPH.player');
  const hphElement = root.getElementById('ff25-hph');
  const lower = root.getElementById('ff25-lower');
  const hasHph = isRecord(hph);
  if (hphElement) hphElement.style.display = hasHph ? '' : 'none';
  if (lower) lower.classList.toggle('ff25-no-hph', !hasHph);
  if (!hasHph) return;

  const clamp10 = (value: number | null) => value === null ? 0 : Math.max(0, Math.min(10, value));
  const bladder = numberAt(state, 'Narrative.Scene.HPH.player.Physiology.Bladder');
  const arousal = numberAt(state, 'Narrative.Scene.HPH.player.Physiology.Arousal');
  const erection = numberAt(state, 'Narrative.Scene.HPH.player.Physiology.ErectionLevel')
    ?? numberAt(state, 'Narrative.Scene.HPH.player.Physiology.ErectionCapacity');
  const semen = numberAt(state, 'Narrative.Scene.HPH.player.Physiology.SemenMl');
  const semenMax = numberAt(state, 'Narrative.Scene.HPH.player.Physiology.SemenCapacityMl');
  const length = numberAt(state, 'Narrative.Scene.HPH.player.Penis.LengthCm');
  const girth = numberAt(state, 'Narrative.Scene.HPH.player.Penis.GirthCm');

  const write = (id: string, value: number | null) => {
    const element = root.getElementById(id);
    if (element) element.textContent = shownNumber(value);
  };
  const setHeight = (id: string, pct: number) => {
    const element = root.getElementById(id) as HTMLElement | null;
    if (element) element.style.height = Math.max(0, Math.min(100, pct)) + '%';
  };

  setHeight('ff25-bladder-fill', clamp10(bladder) * 10);
  setHeight('ff25-arousal-fill', clamp10(arousal) * 10);
  setHeight('ff25-erection-fill', clamp10(erection) * 10);
  setHeight('ff25-semen-fill', semen !== null && semenMax !== null && semenMax > 0 ? semen / semenMax * 100 : 0);
  write('ff25-bladder-value', bladder);
  write('ff25-arousal-value', arousal);
  write('ff25-erection-value', erection);
  write('ff25-semen-value', semen);
  write('ff25-length-value', length);
  write('ff25-girth-value', girth);
}

function showImage(root: ShadowRoot, src: string): void {
  if (!src || src === PLACEHOLDER_IMAGE) return;
  const overlay = document.createElement('div');
  overlay.className = 'img-popup-overlay';
  overlay.style.display = 'flex';
  const image = document.createElement('img');
  image.className = 'img-popup-content';
  image.src = src;
  overlay.appendChild(image);
  overlay.addEventListener('click', () => overlay.remove());
  root.appendChild(overlay);
}

function formatDetail(container: HTMLElement, value: unknown, depth = 0): void {
  const raw = legacyTupleValue(value);
  if (!isRecord(raw) && !Array.isArray(raw)) {
    container.appendChild(document.createTextNode(raw === null || raw === undefined ? 'null' : String(raw)));
    return;
  }
  const entries = Array.isArray(raw) ? raw.map((child, index) => [String(index), child] as const) : Object.entries(raw);
  for (const [key, child] of entries) {
    if (['$meta', '$key', 'template'].includes(key)) continue;
    const row = document.createElement('div');
    row.className = 'detail-row';
    row.style.paddingLeft = Math.min(depth * 8, 24) + 'px';
    const keyElement = document.createElement('span');
    keyElement.className = 'detail-key';
    keyElement.textContent = key + ':';
    const valueElement = document.createElement('span');
    valueElement.className = 'detail-val';
    if (isRecord(legacyTupleValue(child)) || Array.isArray(legacyTupleValue(child))) {
      formatDetail(valueElement, child, depth + 1);
    } else {
      valueElement.textContent = statusText(child, 'null');
    }
    row.append(keyElement, valueElement);
    container.appendChild(row);
  }
}

interface EditableDetailOptions {
  mutationDisabled: boolean;
  onSave(fields: Record<string, JsonValue>): void;
}

const LEGACY_DETAIL_HIDDEN_FIELDS = new Set(['$meta', '$key', 'template', 'name']);

function legacyEditValue(raw: string): JsonValue {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw !== '' && raw.trim() !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  try {
    const parsed = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object') return parsed as JsonValue;
    if (parsed === null) return null;
  } catch {}
  return raw;
}

function showDetail(root: ShadowRoot, title: string, value: unknown, edit?: EditableDetailOptions): void {
  const modal = root.getElementById('detail-modal') as HTMLElement | null;
  const titleElement = root.getElementById('detail-title');
  const body = root.getElementById('detail-body') as HTMLElement | null;
  if (!modal || !titleElement || !body) return;
  titleElement.textContent = title;

  const editableRecord = isRecord(legacyTupleValue(value)) ? legacyTupleValue(value) as MutableRecord : null;
  const renderReadOnly = () => {
    body.replaceChildren();
    formatDetail(body, value);
    if (!edit || !editableRecord) return;
    const actions = document.createElement('div');
    actions.style.cssText = 'margin-top:15px;display:flex;justify-content:flex-end;gap:8px;';
    const button = document.createElement('button');
    button.textContent = '✏ Edit';
    button.disabled = edit.mutationDisabled;
    button.style.cssText = 'background:rgba(0,229,255,.15);border:1px solid rgba(0,229,255,.4);color:#00e5ff;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:.9em;';
    button.addEventListener('click', () => {
      body.replaceChildren();
      const form = document.createElement('div');
      form.style.cssText = 'padding-left:10px;border-left:2px solid var(--accent-primary);';
      for (const [key, child] of Object.entries(editableRecord)) {
        if (LEGACY_DETAIL_HIDDEN_FIELDS.has(key)) continue;
        const row = document.createElement('div');
        row.style.cssText = 'padding:4px 0;border-bottom:1px dotted rgba(255,255,255,.1);display:flex;align-items:flex-start;gap:8px;';
        const label = document.createElement('span');
        label.textContent = key + ':';
        label.style.cssText = 'color:var(--accent-primary);font-weight:bold;min-width:80px;padding-top:6px;flex-shrink:0;';
        const input = document.createElement('textarea');
        input.dataset.field = key;
        input.style.cssText = 'flex:1;background:rgba(255,255,255,.08);border:1px solid var(--border-color);color:var(--text-primary);padding:4px 8px;border-radius:4px;font-size:.9em;font-family:inherit;resize:vertical;box-sizing:border-box;';
        const shown = child !== null && typeof child === 'object' ? JSON.stringify(child, null, 2) : child === null || child === undefined ? '' : String(child);
        input.value = shown;
        const lineCount = shown.split('\n').length;
        input.rows = Math.min(12, Math.max(2, lineCount, Math.ceil(shown.length / 40)));
        row.append(label, input);
        form.appendChild(row);
      }
      body.appendChild(form);

      const editActions = document.createElement('div');
      editActions.style.cssText = 'margin-top:15px;display:flex;justify-content:flex-end;gap:8px;';
      const cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      cancel.style.cssText = 'background:rgba(255,100,100,.15);border:1px solid rgba(255,100,100,.4);color:#ff6b6b;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:.9em;';
      cancel.addEventListener('click', renderReadOnly);
      const save = document.createElement('button');
      save.textContent = '💾 Save';
      save.disabled = edit.mutationDisabled;
      save.style.cssText = 'background:rgba(0,200,100,.2);border:1px solid rgba(0,200,100,.5);color:#00c864;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:.9em;';
      save.addEventListener('click', () => {
        const fields: Record<string, JsonValue> = {};
        form.querySelectorAll<HTMLTextAreaElement>('textarea[data-field]').forEach(input => {
          const field = input.dataset.field;
          if (field) fields[field] = legacyEditValue(input.value);
        });
        edit.onSave(fields);
        modal.style.display = 'none';
      });
      editActions.append(cancel, save);
      body.appendChild(editActions);
    });
    actions.appendChild(button);
    body.appendChild(actions);
  };

  renderReadOnly();
  modal.style.display = 'flex';
}

function showEquipTarget(
  root: ShadowRoot,
  state: FFMVUState,
  sourceOwner: GuiOwnerRef,
  itemKey: string,
  onIntent: (intent: GuiIntent) => void,
): void {
  const existing = root.getElementById('ffmvu-equip-overlay');
  existing?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'ffmvu-equip-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;width:100vw;height:100dvh;background:rgba(0,0,0,.85);z-index:50000;display:flex;justify-content:center;align-items:center;overflow:auto;padding:12px;box-sizing:border-box;backdrop-filter:blur(2px);';
  const content = document.createElement('div');
  content.style.cssText = 'background:#001f3f;border:1px solid #00e5ff;padding:20px;border-radius:8px;width:90%;max-width:min(400px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;color:#e0f7fa;box-shadow:0 0 20px rgba(0,229,255,.2);box-sizing:border-box;';
  const title = document.createElement('h3');
  title.textContent = 'Equip to...';
  title.style.cssText = 'margin-top:0;color:#00e5ff;margin-bottom:15px;border-bottom:1px solid rgba(0,229,255,.3);padding-bottom:10px;';
  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;margin-bottom:15px;';
  for (const owner of statusOwners(state)) {
    const button = document.createElement('button');
    button.textContent = owner.ref.kind === 'player' ? 'Main Character' : owner.label + ' (Familiar)';
    button.style.cssText = 'padding:12px;background:rgba(0,229,255,.1);border:1px solid rgba(0,229,255,.3);color:#e0f7fa;border-radius:4px;cursor:pointer;text-align:left;font-size:1em;';
    button.addEventListener('click', () => {
      overlay.remove();
      onIntent({ type: 'equipment.equip', sourceOwner, targetOwner: owner.ref, itemKey });
    });
    list.appendChild(button);
  }
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.style.cssText = 'width:100%;padding:10px;background:rgba(255,100,100,.1);border:1px solid rgba(255,100,100,.4);color:#ff6b6b;border-radius:4px;cursor:pointer;font-weight:bold;';
  cancel.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
  content.append(title, list, cancel);
  overlay.appendChild(content);
  root.appendChild(overlay);
}

function openImageEditor(
  root: ShadowRoot,
  state: FFMVUState,
  target: GuiImageRef,
  onIntent: (intent: GuiIntent) => void,
  mutationDisabled: boolean,
): void {
  root.getElementById('ffmvu-image-edit-overlay')?.remove();
  const host = root.querySelector<HTMLElement>('.status-body');
  if (!host) return;
  const overlay = document.createElement('div');
  overlay.id = 'ffmvu-image-edit-overlay';
  overlay.style.cssText = 'position:absolute;inset:0;z-index:60000;display:flex;justify-content:center;align-items:center;background:rgba(0,0,0,.85);padding:12px;box-sizing:border-box;backdrop-filter:blur(2px);';
  const content = document.createElement('div');
  content.style.cssText = 'background:#001f3f;border:1px solid #00e5ff;padding:20px;border-radius:8px;width:90%;max-width:400px;max-height:90%;overflow:auto;color:#e0f7fa;box-shadow:0 0 20px rgba(0,0,0,.5);box-sizing:border-box;';
  const title = document.createElement('h3');
  title.textContent = target.kind === 'world-map' ? 'Edit Map Image' : 'Edit Avatar';
  title.style.cssText = 'margin:0 0 14px;color:#00e5ff;';
  const path = imageStoragePath(target);
  const local = readLocalImage(path);
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.placeholder = local ? '(Local image currently set) Enter URL to replace...' : 'https://...';
  const current = imageStateValue(state, target);
  if (!local && /^https?:\/\//i.test(current)) urlInput.value = current;
  urlInput.style.cssText = 'width:100%;padding:10px;background:rgba(255,255,255,.1);border:1px solid rgba(0,229,255,.3);color:#e0f7fa;border-radius:4px;box-sizing:border-box;';
  const save = document.createElement('button');
  save.textContent = 'Save URL';
  save.disabled = mutationDisabled;
  save.style.cssText = 'margin-top:8px;width:100%;padding:10px;background:rgba(0,229,255,.2);border:1px solid #00e5ff;color:#00e5ff;border-radius:4px;cursor:pointer;font-weight:bold;';
  const divider = document.createElement('div');
  divider.textContent = '— or —';
  divider.style.cssText = 'text-align:center;color:#81d4fa;margin:14px 0;';
  const browse = document.createElement('button');
  browse.textContent = '📂 Browse Local File';
  browse.style.cssText = 'width:100%;padding:10px;background:rgba(0,229,255,.1);border:1px dashed rgba(0,229,255,.4);color:#81d4fa;border-radius:4px;cursor:pointer;font-weight:bold;';
  const hint = document.createElement('div');
  hint.textContent = 'Local files are compressed and stored only in this browser (max 1920px, ~1.5MB), matching the legacy StatusMenu behavior.';
  hint.style.cssText = 'font-size:.8em;color:rgba(129,212,250,.75);margin-top:6px;';
  const close = document.createElement('button');
  close.textContent = 'Cancel';
  close.style.cssText = 'margin-top:14px;width:100%;padding:9px;background:rgba(255,100,100,.08);border:1px solid rgba(255,100,100,.35);color:#ff9b9b;border-radius:4px;cursor:pointer;';

  const finishUrl = () => {
    const value = urlInput.value.trim();
    if (!value) return;
    if (!/^https?:\/\//i.test(value)) {
      window.alert('Image URL must start with http:// or https://');
      return;
    }
    clearLocalImage(path);
    onIntent({ type: 'image.set', target, value });
    overlay.remove();
  };
  save.addEventListener('click', finishUrl);
  urlInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); finishUrl(); } });
  browse.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        browse.textContent = 'Processing...';
        browse.setAttribute('disabled', 'true');
        const encoded = await compressLocalImage(file);
        writeLocalImage(path, encoded);
        if (current) onIntent({ type: 'image.set', target, value: '' });
        const editButton = root.querySelector<HTMLElement>('.img-edit-btn[data-save-root="' + (target.kind === 'world-map' ? 'World' : target.kind === 'player-avatar' ? 'Mainchar' : 'Familiar') + '"]' + (target.kind === 'familiar-avatar' ? '[data-ffmvu-familiar-id="' + CSS.escape(target.id) + '"]' : ''));
        const image = editButton?.closest('.img-wrapper')?.querySelector<HTMLImageElement>('img[data-bind-img]') ?? null;
        if (image) {
          image.src = encoded;
          image.style.display = 'block';
          const placeholder = image.closest('.img-wrapper')?.querySelector<HTMLElement>('.ff25-avatar-placeholder');
          if (placeholder) placeholder.style.display = 'none';
        }
        overlay.remove();
      } catch (error) {
        window.alert('Failed to process image: ' + String(error));
        browse.textContent = '📂 Browse Local File';
        browse.removeAttribute('disabled');
      }
    });
    input.click();
  });
  close.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
  content.append(title, urlInput, save, divider, browse, hint, close);
  overlay.appendChild(content);
  host.appendChild(overlay);
  urlInput.focus();
}

function wireImages(root: ShadowRoot, state: FFMVUState, onIntent: (intent: GuiIntent) => void, mutationDisabled: boolean, onUnsupported: (action: string) => void): void {
  root.querySelectorAll<HTMLImageElement>('img[data-bind-img]').forEach(image => {
    image.removeAttribute('onclick');
    if (image.dataset.ffmvuImageViewBound !== '1') {
      image.dataset.ffmvuImageViewBound = '1';
      image.addEventListener('click', () => showImage(root, image.src));
    }
  });
  root.querySelectorAll<HTMLElement>('.img-edit-btn').forEach(button => {
    button.removeAttribute('onclick');
    if (button.dataset.ffmvuImageEditBound === '1') return;
    button.dataset.ffmvuImageEditBound = '1';
    const target = imageTargetForButton(button);
    if (!target) {
      button.addEventListener('click', event => {
        event.stopPropagation();
        onUnsupported('This legacy image target is not mapped to a typed Lumiverse intent yet.');
      });
      return;
    }
    const local = readLocalImage(imageStoragePath(target));
    if (local) {
      const image = button.closest('.img-wrapper')?.querySelector<HTMLImageElement>('img[data-bind-img]');
      if (image) {
        image.src = local;
        image.style.display = 'block';
        const placeholder = image.closest('.img-wrapper')?.querySelector<HTMLElement>('.ff25-avatar-placeholder');
        if (placeholder) placeholder.style.display = 'none';
      }
    }
    button.toggleAttribute('aria-disabled', mutationDisabled);
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (mutationDisabled) return;
      openImageEditor(root, state, target, onIntent, mutationDisabled);
    });
  });
}

function wireCheckboxes(root: ParentNode, onIntent: (intent: GuiIntent) => void, mutationDisabled: boolean): void {
  root.querySelectorAll<HTMLInputElement>('.ar-checkbox-input').forEach(input => {
    const familiarId = input.dataset.ffmvuFamiliarId;
    const field = input.getAttribute('data-save-leaf');
    if (!familiarId || (field !== 'Is_present' && field !== 'Is_in_battle_team')) return;
    input.disabled = mutationDisabled;
    if (input.dataset.ffmvuCheckboxBound === '1') return;
    input.dataset.ffmvuCheckboxBound = '1';
    input.addEventListener('change', () => {
      onIntent({ type: 'familiar.flag.set', familiarId, field, value: input.checked });
    });
  });
}

function wireCollapsibles(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.list-collapse-header').forEach(header => {
    if (header.dataset.ffmvuBound === '1') return;
    header.dataset.ffmvuBound = '1';
    header.addEventListener('click', () => {
      const body = header.nextElementSibling as HTMLElement | null;
      const arrow = header.querySelector<HTMLElement>('.list-collapse-arrow');
      if (!body) return;
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      if (arrow) arrow.textContent = hidden ? '▼' : '▶';
    });
  });
}

function renderList(
  shadow: ShadowRoot,
  container: HTMLElement,
  rawData: unknown,
  owner: GuiOwnerRef | null,
  options: LegacyStatusViewOptions,
): void {
  const listType = container.getAttribute('data-list-type') || 'simple';
  const listFullPath = container.getAttribute('data-bind-list-fullpath') || '';
  const editableKind =
    container.getAttribute('data-allow-edit') === '1' && listFullPath === 'Mainchar.Skills' ? 'skill' :
    container.getAttribute('data-allow-edit') === '1' && listFullPath === 'Mainchar.Talents' ? 'talent' :
    null;
  const worldCalcSection =
    container.getAttribute('data-allow-edit') === '1' && listFullPath === 'World_Calc.Factions' ? 'Factions' :
    container.getAttribute('data-allow-edit') === '1' && listFullPath === 'World_Calc.Locations' ? 'Locations' :
    container.getAttribute('data-allow-edit') === '1' && listFullPath === 'World_Calc.Ruins' ? 'Ruins' :
    container.getAttribute('data-allow-edit') === '1' && listFullPath === 'World_Calc.Events' ? 'Events' :
    null;
  const realEstateContainer = container.getAttribute('data-allow-edit') === '1' && listFullPath === 'Mainchar.Real_estate';
  const templateId =
    listType === 'inventory' ? 'tmpl-inventory' :
    listType === 'equipment-action' ? 'tmpl-equipment-action' :
    listType === 'quest' ? 'tmpl-quest' :
    listType === 'grid' ? 'tmpl-grid' :
    'tmpl-simple';
  const template = shadow.getElementById(templateId) as HTMLTemplateElement | null;
  if (!template) return;

  const data = asRecord(legacyTupleValue(rawData));
  const entries = Object.entries(data).filter(([key]) => !['$meta', '$key', 'template'].includes(key));
  container.replaceChildren();
  container.className = listType === 'inventory' ? 'list-inventory-view' : listType === 'grid' ? 'list-grid-view' : '';

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.textContent = EMPTY_TEXT[listType] || 'None';
    empty.style.cssText = listType === 'inventory' || listType === 'grid'
      ? 'grid-column:1/-1;text-align:center;color:var(--text-secondary);'
      : 'text-align:center;color:var(--text-secondary);padding:10px;';
    container.appendChild(empty);
    return;
  }

  const pageSize = 5;
  const paged = listType !== 'inventory' && listType !== 'grid' && entries.length > pageSize;
  let page = 0;

  const draw = () => {
    container.replaceChildren();
    const visible = paged ? entries.slice(page * pageSize, page * pageSize + pageSize) : entries;
    for (const [key, raw] of visible) {
      const realEstateSection = realEstateContainer && ['Estates', 'Buildings', 'Assets'].includes(key)
        ? key as 'Estates' | 'Buildings' | 'Assets'
        : null;
      const fragment = template.content.cloneNode(true) as DocumentFragment;
      const itemRecord = record(legacyTupleValue(raw));
      const name = statusText(itemRecord.Name ?? itemRecord.name, key);
      const title = listType === 'inventory' || listType === 'grid' ? name : key;
      const desc = describe(raw);
      const qtyValue = itemRecord.Qty ?? itemRecord.qty;
      const qty = qtyValue !== undefined && Number(qtyValue) >= 1 ? 'x' + String(qtyValue) : '';

      setSlot(fragment, 'title', title);
      setSlot(fragment, 'name', title);
      if (listType === 'inventory') {
        const hiddenDesc = fragment.querySelector<HTMLElement>('[data-slot="desc"]');
        if (hiddenDesc) {
          hiddenDesc.textContent = desc;
          hiddenDesc.style.display = 'none';
        }
      } else {
        setSlot(fragment, 'desc', desc);
      }
      setSlot(fragment, 'qty', qty);
      setSlot(fragment, 'difficulty', statusText(itemRecord.Difficulty ?? itemRecord.difficulty, ''));
      setSlot(fragment, 'reward-text', statusText(itemRecord.Reward ?? itemRecord.reward, ''));
      setSlot(fragment, 'status', statusText(itemRecord.Status ?? itemRecord.status, ''));
      setSlot(fragment, 'LastUpdated', statusText(itemRecord.LastUpdated, ''));

      const rootElement = fragment.firstElementChild as HTMLElement | null;
      if (rootElement) {
        rootElement.style.cursor = 'pointer';
        rootElement.addEventListener('click', () => {
          if (editableKind === 'skill') {
            showDetail(shadow, title, raw, {
              mutationDisabled: options.mutationDisabled,
              onSave: fields => options.onIntent({ type: 'skill.update', skillKey: key, fields }),
            });
          } else if (editableKind === 'talent') {
            showDetail(shadow, title, raw, {
              mutationDisabled: options.mutationDisabled,
              onSave: fields => options.onIntent({ type: 'talent.update', talentKey: key, fields }),
            });
          } else if (worldCalcSection) {
            showDetail(shadow, title, raw, {
              mutationDisabled: options.mutationDisabled,
              onSave: fields => options.onIntent({ type: 'worldcalc.update', section: worldCalcSection, itemKey: key, fields }),
            });
          } else if (realEstateSection) {
            showDetail(shadow, title, raw, {
              mutationDisabled: options.mutationDisabled,
              onSave: fields => options.onIntent({ type: 'realestate.update', section: realEstateSection, fields }),
            });
          } else {
            showDetail(shadow, title, raw);
          }
        });
      }

      const allowDelete = container.getAttribute('data-allow-delete') === '1';
      const deleteButton = fragment.querySelector<HTMLButtonElement>('.list-delete-btn:not(.action-delete-btn)');
      if (deleteButton) {
        if (!allowDelete) deleteButton.style.display = 'none';
        else deleteButton.addEventListener('click', event => {
          event.stopPropagation();
          if (options.mutationDisabled) return;
          if (editableKind === 'skill') {
            if (window.confirm('Delete "' + title + '"?')) options.onIntent({ type: 'skill.delete', skillKey: key });
            return;
          }
          if (editableKind === 'talent') {
            if (window.confirm('Delete "' + title + '"?')) options.onIntent({ type: 'talent.delete', talentKey: key });
            return;
          }
          if (worldCalcSection) {
            if (window.confirm('Delete "' + title + '"?')) options.onIntent({ type: 'worldcalc.delete', section: worldCalcSection, itemKey: key });
            return;
          }
          if (realEstateSection) {
            if (window.confirm('Delete "' + title + '"?')) options.onIntent({ type: 'realestate.clear', section: realEstateSection });
            return;
          }
          if (listType === 'inventory' && owner) {
            if (window.confirm('Delete "' + title + '"?')) options.onIntent({ type: 'inventory.delete', owner, itemKey: key });
            return;
          }
          const legacyDeletePath = statusLegacyDeletePath(owner, container.getAttribute('data-bind-list') || '', key);
          if (legacyDeletePath) {
            if (window.confirm('Delete "' + title + '"?')) options.onIntent({ type: 'variable.delete', path: legacyDeletePath });
            return;
          }
          options.onUnsupported('Delete/edit for ' + listType + ' is still waiting for its typed StateService intent.');
        });
      }

      const menuButton = fragment.querySelector<HTMLButtonElement>('.item-menu-btn');
      const actionMenu = fragment.querySelector<HTMLElement>('.item-action-menu');
      const equipButton = fragment.querySelector<HTMLButtonElement>('.action-equip-btn');
      const actionDelete = fragment.querySelector<HTMLButtonElement>('.action-delete-btn');
      if (menuButton && actionMenu && owner) {
        const item = statusItems({ [key]: raw })[0];
        menuButton.textContent = item?.equippable ? '⚔' : '⋮';
        menuButton.title = item?.equippable ? 'Equip / Actions' : 'Actions';
        menuButton.addEventListener('click', event => {
          event.stopPropagation();
          const open = actionMenu.style.display !== 'block';
          shadow.querySelectorAll<HTMLElement>('.item-action-menu').forEach(menu => { menu.style.display = 'none'; });
          actionMenu.style.display = open ? 'block' : 'none';
        });
        actionMenu.addEventListener('click', event => event.stopPropagation());
        if (equipButton) {
          equipButton.style.display = item?.equippable ? 'block' : 'none';
          equipButton.disabled = options.mutationDisabled;
          equipButton.addEventListener('click', event => {
            event.stopPropagation();
            actionMenu.style.display = 'none';
            showEquipTarget(shadow, options.state, owner, key, options.onIntent);
          });
        }
        if (actionDelete) {
          actionDelete.style.display = allowDelete ? 'block' : 'none';
          actionDelete.disabled = options.mutationDisabled;
          actionDelete.addEventListener('click', event => {
            event.stopPropagation();
            actionMenu.style.display = 'none';
            if (allowDelete && window.confirm('Delete "' + title + '"?')) options.onIntent({ type: 'inventory.delete', owner, itemKey: key });
          });
        }
      }

      const unequip = fragment.querySelector<HTMLButtonElement>('.unequip-btn');
      if (unequip && owner) {
        unequip.disabled = options.mutationDisabled;
        unequip.addEventListener('click', event => {
          event.stopPropagation();
          if (window.confirm('Unequip ' + title + '?')) options.onIntent({ type: 'equipment.unequip', owner, equipmentKey: key });
        });
      }

      fragment.querySelectorAll<HTMLElement>('[data-slot="reward"]').forEach(element => {
        if (statusText(itemRecord.Reward ?? itemRecord.reward, '')) element.style.display = 'block';
      });
      fragment.querySelectorAll<HTMLElement>('[data-slot="status-row"]').forEach(element => {
        if (statusText(itemRecord.Status ?? itemRecord.status, '')) element.style.display = 'block';
      });
      fragment.querySelectorAll<HTMLElement>('[data-slot="last-updated-row"]').forEach(element => {
        if (statusText(itemRecord.LastUpdated, '')) element.style.display = 'block';
      });

      container.appendChild(fragment);
    }

    if (paged) {
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 4px;margin-top:8px;border-top:1px solid rgba(255,255,255,.1);';
      const prev = document.createElement('button');
      const next = document.createElement('button');
      const info = document.createElement('span');
      prev.textContent = '<';
      next.textContent = '>';
      info.textContent = String(page + 1) + ' / ' + String(Math.ceil(entries.length / pageSize));
      info.style.cssText = 'color:var(--text-secondary);font-size:.85em;';
      for (const button of [prev, next]) button.style.cssText = 'background:rgba(0,229,255,.1);border:1px solid rgba(0,229,255,.3);color:#00e5ff;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:1em;min-width:36px;';
      prev.disabled = page === 0;
      next.disabled = page >= Math.ceil(entries.length / pageSize) - 1;
      prev.addEventListener('click', event => { event.stopPropagation(); if (page > 0) { page -= 1; draw(); } });
      next.addEventListener('click', event => { event.stopPropagation(); if (!next.disabled) { page += 1; draw(); } });
      bar.append(prev, info, next);
      container.appendChild(bar);
    }
  };
  draw();
}

function renderNestedLists(
  shadow: ShadowRoot,
  root: ParentNode,
  data: unknown,
  owner: GuiOwnerRef | null,
  options: LegacyStatusViewOptions,
): void {
  root.querySelectorAll<HTMLElement>('[data-bind-list]').forEach(container => {
    const path = container.getAttribute('data-bind-list');
    if (!path) return;
    renderList(shadow, container, getPath(data, path), owner, options);
  });
  wireCollapsibles(root);
}

function instantiateRecordBlock(
  shadow: ShadowRoot,
  containerId: string,
  data: unknown,
  owner: GuiOwnerRef | null,
  options: LegacyStatusViewOptions,
): void {
  const container = shadow.getElementById(containerId) as HTMLElement | null;
  if (!container) return;
  const templateId = container.getAttribute('data-template');
  const template = templateId ? shadow.getElementById(templateId) as HTMLTemplateElement | null : null;
  if (!template) return;
  container.replaceChildren();
  const wrapper = document.createElement('div');
  wrapper.style.display = 'contents';
  wrapper.appendChild(template.content.cloneNode(true));
  container.appendChild(wrapper);
  bindValues(wrapper, data);
  renderNestedLists(shadow, wrapper, data, owner, options);
  wireCheckboxes(wrapper, options.onIntent, options.mutationDisabled);
}

function familiarIdentity(state: FFMVUState, id: string, member: MutableRecord): string {
  const explicit = statusText(member.Identity, '');
  if (explicit) return explicit;
  const key = id.trim().toLowerCase();
  const name = statusText(member.Name, id).trim().toLowerCase();
  for (const [npcId, rawNpc] of Object.entries(asRecord(state.Narrative.NPCs))) {
    if (!isRecord(rawNpc)) continue;
    const display = statusText(rawNpc.DisplayName ?? rawNpc.Name, '').trim().toLowerCase();
    const aliases = Array.isArray(rawNpc.Aliases) ? rawNpc.Aliases.map(value => String(value).trim().toLowerCase()) : [];
    if ((key && (display === key || aliases.includes(key))) || (name && (display === name || aliases.includes(name)))) return npcId;
  }
  return '—';
}

function renderFamiliars(shadow: ShadowRoot, options: LegacyStatusViewOptions): void {
  const container = shadow.getElementById('blk-blk-1770140160072') as HTMLElement | null;
  const template = shadow.getElementById('tpl-blk-blk-1770140160072') as HTMLTemplateElement | null;
  if (!container || !template) return;
  const entries = Object.entries(asRecord(options.state.Familiar)).filter(([, value]) => isRecord(value));
  container.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'width:100%;text-align:center;padding:10px;color:#666;';
    empty.textContent = 'No Data';
    container.appendChild(empty);
    return;
  }

  let page = 0;
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));

  const draw = () => {
    container.replaceChildren();
    const addPager = (position: 'top' | 'bottom') => {
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 4px;width:100%;flex-basis:100%;flex-shrink:0;box-sizing:border-box;'
        + (position === 'top' ? 'margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,.1);' : 'margin-top:8px;border-top:1px solid rgba(255,255,255,.1);');
      const prev = document.createElement('button');
      const next = document.createElement('button');
      const select = document.createElement('select');
      const info = document.createElement('span');
      prev.textContent = '<'; next.textContent = '>';
      prev.disabled = page === 0; next.disabled = page >= pageCount - 1;
      for (const button of [prev, next]) button.style.cssText = 'background:transparent;border:1px solid rgba(0,229,255,.5);color:#00e5ff;width:30px;height:30px;border-radius:4px;cursor:pointer;font-weight:bold;';
      info.textContent = String(page + 1) + ' / ' + String(pageCount);
      info.style.cssText = 'font-size:.9em;color:#aaa;';
      prev.addEventListener('click', () => { if (page > 0) { page -= 1; draw(); } });
      next.addEventListener('click', () => { if (page < pageCount - 1) { page += 1; draw(); } });
      bar.appendChild(prev);
      if (position === 'top') {
        for (let index = 0; index < entries.length; index += 1) {
          const [id, raw] = entries[index];
          const option = document.createElement('option');
          option.value = String(index);
          option.textContent = statusText((raw as MutableRecord).Name, id);
          if (index === page * pageSize) option.selected = true;
          select.appendChild(option);
        }
        select.addEventListener('change', () => { page = Math.floor(Number(select.value) / pageSize); draw(); });
        bar.appendChild(select);
      }
      bar.append(info, next);
      container.appendChild(bar);
    };

    addPager('top');
    const start = page * pageSize;
    for (const [id, raw] of entries.slice(start, start + pageSize)) {
      const member = raw as MutableRecord;
      const anchor = document.createElement('div');
      anchor.style.cssText = 'height:0;margin:0;padding:0;width:100%;flex-basis:100%;flex-shrink:0;';
      container.appendChild(anchor);
      const wrapper = document.createElement('div');
      wrapper.style.display = 'contents';
      wrapper.appendChild(template.content.cloneNode(true));
      container.appendChild(wrapper);
      bindValues(wrapper, member);
      const identity = wrapper.querySelector<HTMLElement>('[data-bind-val="Identity"]');
      if (identity) identity.textContent = familiarIdentity(options.state, id, member);
      const secret = wrapper.querySelector<HTMLElement>('[data-bind-val="Secret"]');
      if (secret) secret.textContent = (statusNumber(member.Affection) ?? 0) >= 90 ? statusText(member.Secret, '') : 'Require 90% Affection';
      const corePoints = wrapper.querySelector<HTMLElement>('[data-bind-val="Core-points"]');
      if (corePoints && (statusNumber(member['Core-points']) ?? 0) > 0) {
        corePoints.style.color = 'red';
        corePoints.style.fontWeight = 'bold';
      }
      renderNestedLists(shadow, wrapper, member, { kind: 'familiar', id }, options);
      wrapper.querySelectorAll<HTMLElement>('.img-edit-btn[data-save-root="Familiar"]').forEach(button => { button.dataset.ffmvuFamiliarId = id; });
      wrapper.querySelectorAll<HTMLInputElement>('.ar-checkbox-input').forEach(input => { input.dataset.ffmvuFamiliarId = id; });
      wireCheckboxes(wrapper, options.onIntent, options.mutationDisabled);
    }
    if (pageCount > 1) addPager('bottom');
  };
  draw();
}

function renderWardrobe(shadow: ShadowRoot, options: LegacyStatusViewOptions): void {
  const tabs = shadow.getElementById('outfit-owner-tabs');
  const status = shadow.getElementById('outfit-status');
  const wornList = shadow.getElementById('outfit-worn-list');
  const wardrobeList = shadow.getElementById('outfit-wardrobe-list');
  const wornCount = shadow.getElementById('outfit-worn-count');
  const wardrobeCount = shadow.getElementById('outfit-wardrobe-count');
  if (!tabs || !status || !wornList || !wardrobeList) return;

  const owners = statusOwners(options.state);
  let selected = owners.some(owner => owner.id === options.selectedOwnerId) ? options.selectedOwnerId : owners[0]?.id || 'player';

  const draw = () => {
    tabs.replaceChildren();
    for (const owner of owners) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'outfit-owner-btn' + (owner.id === selected ? ' active' : '');
      button.textContent = owner.label;
      button.addEventListener('click', () => {
        selected = owner.id;
        options.onOwner(selected);
        draw();
      });
      tabs.appendChild(button);
    }

    const owner = statusOwnerById(options.state, selected);
    const outfit = record(owner.record.Outfit);
    const worn = record(outfit.Worn);
    const wardrobe = record(outfit.Wardrobe);
    status.textContent = outfit.Initialized ? 'Наряд зафиксирован' : 'Будет создан моделью при следующем RP-ходе';
    if (wornCount) wornCount.textContent = String(Object.keys(worn).length);
    if (wardrobeCount) wardrobeCount.textContent = String(Object.keys(wardrobe).length);

    const sort = (source: MutableRecord) => Object.entries(source).sort((left, right) => {
      const a = record(left[1]); const b = record(right[1]);
      return (OUTFIT_SLOT_ORDER[statusText(a.Slot, '')] ?? 99) - (OUTFIT_SLOT_ORDER[statusText(b.Slot, '')] ?? 99)
        || (OUTFIT_LAYER_ORDER[statusText(a.Layer, '')] ?? 99) - (OUTFIT_LAYER_ORDER[statusText(b.Layer, '')] ?? 99)
        || statusText(a.Name, left[0]).localeCompare(statusText(b.Name, right[0]), 'ru');
    });

    const bucket = (container: HTMLElement, source: MutableRecord, from: 'Worn' | 'Wardrobe') => {
      container.replaceChildren();
      const entries = sort(source);
      if (!entries.length) {
        const empty = document.createElement('div');
        empty.className = 'outfit-empty';
        empty.textContent = from === 'Worn' ? 'Одежда ещё не зафиксирована' : 'Нет запасной одежды';
        container.appendChild(empty);
        return;
      }
      for (const [key, raw] of entries) {
        const item = record(raw);
        const card = document.createElement('div');
        card.className = 'outfit-item';
        const main = document.createElement('div');
        main.className = 'outfit-item-main';
        const name = document.createElement('div');
        name.className = 'outfit-item-name';
        name.textContent = statusText(item.Name, key);
        const badges = document.createElement('div');
        badges.className = 'outfit-badges';
        for (const badgeValue of [item.Slot || 'Extra', item.Layer || 'Base', item.Slot === 'Extra' ? item.Placement : null]) {
          if (!badgeValue) continue;
          const badge = document.createElement('span');
          badge.className = 'outfit-badge';
          badge.textContent = statusText(badgeValue);
          badges.appendChild(badge);
        }
        main.append(name, badges);
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'outfit-action';
        action.textContent = from === 'Worn' ? 'Снять' : 'Надеть';
        action.disabled = options.mutationDisabled;
        action.addEventListener('click', event => {
          event.stopPropagation();
          options.onIntent({ type: 'outfit.move', owner: owner.ref, from, itemKey: key });
        });
        card.append(main, action);

        const identity = [item.Color, item.Material].filter(Boolean).map(value => statusText(value));
        const descriptions: string[] = [];
        if (identity.length) descriptions.push(identity.join(' · '));
        if (item.Appearance) descriptions.push(statusText(item.Appearance));
        if (descriptions.length) {
          const detail = document.createElement('div');
          detail.className = 'outfit-item-detail';
          detail.textContent = descriptions.join(' — ');
          card.appendChild(detail);
        }
        const stateParts = [item.Condition, item.Arrangement].filter(Boolean).map(value => statusText(value));
        if (stateParts.length) {
          const detail = document.createElement('div');
          detail.className = 'outfit-item-detail outfit-item-state';
          detail.textContent = stateParts.join(' · ');
          card.appendChild(detail);
        }
        container.appendChild(card);
      }
    };
    bucket(wornList as HTMLElement, worn, 'Worn');
    bucket(wardrobeList as HTMLElement, wardrobe, 'Wardrobe');
  };
  draw();
}

function renderFfState(shadow: ShadowRoot, narrative: unknown): void {
  const root = shadow.getElementById('ffsm-root');
  const search = shadow.getElementById('ffsm-search') as HTMLInputElement | null;
  if (!root || !search) return;
  root.replaceChildren();

  const primitive = (value: unknown) => value === null || value === undefined || typeof value !== 'object';
  const label = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (Array.isArray(value) && value.length === 2 && typeof value[1] === 'string') return String(value[0]);
    if (Array.isArray(value)) return value.every(primitive) ? value.map(label).join(', ') : '[' + value.length + ']';
    if (isRecord(value)) return '{' + Object.keys(value).length + '}';
    return String(value);
  };
  const count = (value: unknown) => Array.isArray(value) ? value.length : isRecord(value) ? Object.keys(value).length : 0;

  const rows = (container: HTMLElement, value: unknown, depth: number) => {
    if (primitive(value)) {
      const element = document.createElement('div'); element.className = 'ffsm-val'; element.textContent = label(value); container.appendChild(element); return;
    }
    const entries = Array.isArray(value) ? value.map((child, index) => [String(index), child] as const) : Object.entries(record(value));
    if (!entries.length) {
      const empty = document.createElement('div'); empty.className = 'ffsm-empty'; empty.textContent = 'No data'; container.appendChild(empty); return;
    }
    for (const [key, item] of entries) {
      if (primitive(item) || (Array.isArray(item) && item.every(primitive))) {
        const row = document.createElement('div'); row.className = 'ffsm-row';
        const keyElement = document.createElement('div'); keyElement.className = 'ffsm-key'; keyElement.textContent = key;
        const valueElement = document.createElement('div'); valueElement.className = 'ffsm-val'; valueElement.textContent = label(item);
        const lower = key.toLowerCase();
        if (['bond', 'sparks', 'grudge'].includes(lower) && Number.isFinite(Number(item))) {
          const bar = document.createElement('div'); bar.className = 'ffsm-relbar';
          const fill = document.createElement('div'); fill.className = 'ffsm-relfill';
          const n = Number(item); fill.style.width = Math.max(0, Math.min(100, lower === 'bond' ? (n + 100) / 2 : n)) + '%';
          bar.appendChild(fill); valueElement.appendChild(bar);
        }
        row.append(keyElement, valueElement); container.appendChild(row); continue;
      }
      const details = document.createElement('details'); details.className = 'ffsm-node'; details.open = depth < 1;
      const summary = document.createElement('summary'); summary.textContent = key;
      const counter = document.createElement('span'); counter.className = 'ffsm-count'; counter.textContent = String(count(item)); summary.appendChild(counter);
      const body = document.createElement('div'); body.className = 'ffsm-body'; rows(body, item, depth + 1);
      details.append(summary, body); container.appendChild(details);
    }
  };

  const section = (title: string, value: unknown, open: boolean) => {
    const details = document.createElement('details'); details.className = 'ffsm-top'; details.open = open;
    const summary = document.createElement('summary'); summary.textContent = title;
    const counter = document.createElement('span'); counter.className = 'ffsm-count'; counter.textContent = String(count(value)); summary.appendChild(counter);
    const body = document.createElement('div'); body.className = 'ffsm-body'; rows(body, value, 0);
    details.append(summary, body); root.appendChild(details);
  };

  if (!isRecord(narrative)) {
    const empty = document.createElement('div'); empty.className = 'ffsm-empty'; empty.textContent = 'Narrative state is not initialized yet.'; root.appendChild(empty);
  } else {
    section('Scene / Turn', { Version: narrative.Version, Turn: narrative.Turn, NextNpcId: narrative.NextNpcId, Scene: narrative.Scene || {} }, true);
    section('NPC Registry', narrative.NPCs || {}, true);
    section('Relationships', narrative.Relationships || {}, true);
    section('GM Notes', narrative.GM_Notes || {}, false);
    section('Chekhov', narrative.Chekhov || {}, false);
    section('WorldSim', narrative.WorldSim || {}, false);
  }

  const filter = () => {
    const query = search.value.trim().toLocaleLowerCase('ru');
    root.querySelectorAll<HTMLElement>(':scope > .ffsm-top').forEach(sectionElement => {
      const matches = !query || (sectionElement.textContent || '').toLocaleLowerCase('ru').includes(query);
      sectionElement.hidden = !matches;
      if (query && matches && sectionElement instanceof HTMLDetailsElement) sectionElement.open = true;
    });
  };
  search.addEventListener('input', filter);
  const buttons = shadow.querySelectorAll<HTMLButtonElement>('#tab-ff-state .ffsm-toolbar .ffsm-btn');
  buttons[0]?.removeAttribute('onclick'); buttons[1]?.removeAttribute('onclick');
  buttons[0]?.addEventListener('click', () => root.querySelectorAll<HTMLDetailsElement>('details').forEach(details => { details.open = true; }));
  buttons[1]?.addEventListener('click', () => root.querySelectorAll<HTMLDetailsElement>('details').forEach(details => { details.open = false; }));
}

function installVariablesTab(shadow: ShadowRoot, options: LegacyStatusViewOptions): void {
  const nav = shadow.querySelector<HTMLElement>('.tab-nav');
  const container = shadow.querySelector<HTMLElement>('.status-container');
  if (!nav || !container) return;

  const button = document.createElement('div');
  button.className = 'tab-btn';
  button.textContent = 'Variables';
  nav.appendChild(button);

  const tab = document.createElement('div');
  tab.id = 'tab-variables';
  tab.className = 'tab-content';

  const layout = document.createElement('div');
  layout.className = 've-snapshot-layout';
  const tools = document.createElement('div');
  tools.className = 've-snapshot-tools';
  const note = document.createElement('div');
  note.className = 've-snapshot-note';
  note.textContent = options.snapshotExportNotice || 'Portable Snapshot · current semantic head · read-only';

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 've-btn';
  copy.textContent = options.snapshotExportBusy ? 'Working…' : 'Copy Snapshot';
  copy.disabled = options.snapshotExportDisabled;
  copy.title = 'Copy a full portable snapshot of the current authoritative semantic head.';
  copy.addEventListener('click', () => options.onSnapshotExport('copy'));

  const download = document.createElement('button');
  download.type = 'button';
  download.className = 've-btn';
  download.textContent = 'Download JSON';
  download.disabled = options.snapshotExportDisabled;
  download.title = 'Download the same portable snapshot as JSON.';
  download.addEventListener('click', () => options.onSnapshotExport('download'));

  tools.append(note, copy, download);
  layout.appendChild(tools);
  layout.appendChild(renderVariablesEditor(shadow, {
    state: options.state,
    mutationDisabled: options.mutationDisabled,
    search: options.variablesSearch,
    onSearch: options.onVariablesSearch,
    onIntent: options.onIntent,
  }));
  tab.appendChild(layout);
  container.appendChild(tab);
}

function selectInitialTab(shadow: ShadowRoot, options: LegacyStatusViewOptions): void {
  const select = (tab: LegacyStatusTab, notify: boolean) => {
    shadow.querySelectorAll<HTMLElement>('.tab-content').forEach(element => element.classList.remove('active'));
    shadow.querySelectorAll<HTMLElement>('.tab-btn').forEach(element => element.classList.remove('active'));
    shadow.getElementById(TAB_IDS[tab])?.classList.add('active');
    const index = TAB_ORDER.indexOf(tab);
    const button = shadow.querySelectorAll<HTMLElement>('.tab-nav > .tab-btn')[index];
    button?.classList.add('active');
    if (notify) options.onTab(tab);
  };
  shadow.querySelectorAll<HTMLElement>('.tab-nav > .tab-btn').forEach((button, index) => {
    button.removeAttribute('onclick');
    const tab = TAB_ORDER[index];
    if (!tab) return;
    button.addEventListener('click', () => select(tab, true));
  });
  select(options.activeTab, false);
}

export function renderLegacyStatusMenu(options: LegacyStatusViewOptions): HTMLElement {
  const host = document.createElement('div');
  host.className = 'ffsm-legacy-host';
  host.style.cssText = 'display:block;width:100%;height:100%;min-height:0;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = shadowCss();
  const body = document.createElement('div');
  body.className = 'status-body';
  body.innerHTML = LEGACY_STATUS_BODY_HTML;
  shadow.append(style, body);
  installVariablesTab(shadow, options);

  shadow.querySelectorAll<HTMLElement>('[onclick]').forEach(element => element.removeAttribute('onclick'));
  bindValues(shadow, options.state);

  const player: GuiOwnerRef = { kind: 'player' };
  instantiateRecordBlock(shadow, 'blk-blk-1770135834327', options.state.Mainchar, player, options);
  instantiateRecordBlock(shadow, 'blk-blk-1770046675226', options.state.Mainchar, player, options);
  instantiateRecordBlock(shadow, 'blk-blk-1770136606429', options.state.Mainchar, player, options);
  instantiateRecordBlock(shadow, 'blk-blk-1770136622937', options.state.Mainchar, player, options);
  instantiateRecordBlock(shadow, 'blk-blk-1770203491926', options.state.Mainchar, player, options);
  instantiateRecordBlock(shadow, 'blk-blk-1770205452062', options.state.Mainchar, player, options);
  instantiateRecordBlock(shadow, 'blk-blk-1770205519586', options.state.Mainchar, player, options);
  instantiateRecordBlock(shadow, 'blk-blk-1770205524852', options.state.Mainchar, player, options);
  instantiateRecordBlock(shadow, 'blk-blk-1770205528854', options.state.Mainchar, player, options);
  instantiateRecordBlock(shadow, 'blk-blk-1770205538619', options.state.World, null, options);
  instantiateRecordBlock(shadow, 'blk-blk-1776467005665', options.state.World_Calc, null, options);

  renderFamiliars(shadow, options);
  renderWardrobe(shadow, options);
  renderFfState(shadow, options.state.Narrative);
  bindOverview(shadow, options.state);
  wireImages(shadow, options.state, options.onIntent, options.mutationDisabled, options.onUnsupported);
  wireCollapsibles(shadow);
  selectInitialTab(shadow, options);

  const close = shadow.getElementById('detail-close-btn');
  const modal = shadow.getElementById('detail-modal') as HTMLElement | null;
  close?.removeAttribute('onclick');
  close?.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });
  modal?.addEventListener('click', event => { if (event.target === modal) modal.style.display = 'none'; });

  return host;
}
