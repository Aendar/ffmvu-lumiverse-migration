import type { FFMVUState, MutableRecord } from '../shared/state-schema.js';
import type { GuiOwnerRef } from '../shared/domain/gui-intents.js';
import { asRecord, isRecord, text, tupleValue } from '../shared/domain/value-utils.js';

export interface StatusOwner {
  id: string;
  label: string;
  ref: GuiOwnerRef;
  record: MutableRecord;
}

export interface StatusItem {
  key: string;
  name: string;
  qty: number | null;
  record: MutableRecord;
  equippable: boolean;
}

export interface HphOverview {
  bladder: number | null;
  arousal: number | null;
  erection: number | null;
  semenMl: number | null;
  semenCapacityMl: number | null;
  lengthCm: number | null;
  girthCm: number | null;
}

export function statusTupleValue(value: unknown): unknown {
  return tupleValue(value);
}

export function statusText(value: unknown, fallback = '—'): string {
  const raw = tupleValue(value);
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw === 'object') return JSON.stringify(raw);
  return String(raw);
}

export function statusNumber(value: unknown): number | null {
  const number = Number(tupleValue(value));
  return Number.isFinite(number) ? number : null;
}

export function statusPath(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const segment of path.split('.').filter(Boolean)) {
    if (!isRecord(current) && !Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function statusOwners(state: FFMVUState): StatusOwner[] {
  const owners: StatusOwner[] = [{
    id: 'player',
    label: statusText(state.Mainchar.Name, 'Main Character'),
    ref: { kind: 'player' },
    record: state.Mainchar as unknown as MutableRecord,
  }];
  for (const [id, raw] of Object.entries(asRecord(state.Familiar))) {
    if (!isRecord(raw)) continue;
    owners.push({
      id: 'familiar:' + id,
      label: statusText(raw.Name, id),
      ref: { kind: 'familiar', id },
      record: raw,
    });
  }
  return owners;
}

export function statusOwnerById(state: FFMVUState, id: string): StatusOwner {
  return statusOwners(state).find(owner => owner.id === id) ?? statusOwners(state)[0];
}

export function statusItems(record: unknown): StatusItem[] {
  const result: StatusItem[] = [];
  for (const [key, raw] of Object.entries(asRecord(record))) {
    if (!isRecord(raw)) {
      result.push({ key, name: key, qty: null, record: { Value: raw }, equippable: false });
      continue;
    }
    const qtyRaw = raw.Qty ?? raw.qty;
    const qtyNumber = qtyRaw === undefined ? null : Number(qtyRaw);
    const slot = text(raw.Slot ?? raw.slot).trim();
    const type = text(raw.Type ?? raw.type).toLowerCase();
    result.push({
      key,
      name: text(raw.Name ?? raw.name).trim() || key,
      qty: qtyNumber !== null && Number.isFinite(qtyNumber) ? qtyNumber : null,
      record: raw,
      equippable: Boolean(slot) || ['equipment', 'weapon', 'armor', 'accessory'].includes(type),
    });
  }
  return result;
}

export function statusHphOverview(state: FFMVUState): HphOverview | null {
  const hph = statusPath(state, 'Narrative.Scene.HPH.player');
  if (!isRecord(hph)) return null;
  const read = (path: string): number | null => statusNumber(statusPath(hph, path));
  return {
    bladder: read('Physiology.Bladder'),
    arousal: read('Physiology.Arousal'),
    erection: read('Physiology.ErectionLevel') ?? read('Physiology.ErectionCapacity'),
    semenMl: read('Physiology.SemenMl'),
    semenCapacityMl: read('Physiology.SemenCapacityMl'),
    lengthCm: read('Penis.LengthCm'),
    girthCm: read('Penis.GirthCm'),
  };
}

export function statusCoreBudget(values: { str: number; agi: number; con: number; int: number; wis: number }): {
  spent: number;
  remaining: number;
  valid: boolean;
} {
  const list = [values.str, values.agi, values.con, values.int, values.wis];
  const integer = list.every(value => Number.isInteger(value) && value >= 5);
  const spent = list.reduce((sum, value) => sum + (value - 5), 0);
  return { spent, remaining: 50 - spent, valid: integer && spent <= 50 };
}

export function statusCompactObject(value: unknown, maxEntries = 8): Array<[string, string]> {
  return Object.entries(asRecord(value)).slice(0, maxEntries).map(([key, raw]) => {
    if (isRecord(raw)) {
      const shown = raw.Name ?? raw.name ?? raw.Desc ?? raw.description ?? raw.Status ?? raw.status;
      return [key, shown === undefined ? JSON.stringify(raw) : statusText(shown)];
    }
    return [key, statusText(raw)];
  });
}
