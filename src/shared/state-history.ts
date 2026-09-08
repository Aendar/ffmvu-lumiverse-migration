import type { FFMVUState } from './state-schema.js';
import { asRecord, isRecord, text, tupleValue } from './domain/value-utils.js';
import type { NarrativeTimestamp } from './recent-changes.js';

export type StateHistoryScalar = string | number | boolean | null;

export interface StateHistoryChange {
  turn: number;
  from: StateHistoryScalar;
  to: StateHistoryScalar;
}

export interface StateHistoryTrack {
  path: string;
  label?: string;
  current: StateHistoryScalar;
  changes: StateHistoryChange[];
}

export interface RecentStateHistoryEnvelope {
  observedAt: NarrativeTimestamp;
  currentTurn: number;
  tracks: StateHistoryTrack[];
}

interface StateSignal {
  path: string;
  label?: string;
  value: StateHistoryScalar;
  priority: number;
  presence?: boolean;
}

export interface StateHistoryOptions {
  maxTracks?: number;
  maxChangesPerPath?: number;
}

const MAINCHAR_STAT_KEYS = [
  'Level', 'Exp', 'Core-points',
  'Strength', 'Agility', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma',
  'Hp_curr', 'Hp_max', 'Mp_curr', 'Mp_max', 'Sta_curr', 'Sta_max',
  'Physical_attack', 'Physical_defense', 'Magic_attack', 'Magic_defense', 'Magic_assist',
] as const;

function scalar(value: unknown): StateHistoryScalar | undefined {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length <= 80) return value;
  return undefined;
}

function itemName(id: string, raw: unknown): string {
  const record = asRecord(raw);
  return text(record.Name).trim() || text(record.DisplayName).trim() || id;
}

function addSignal(
  out: Map<string, StateSignal>,
  path: string,
  value: unknown,
  priority: number,
  label?: string,
  presence = false,
): void {
  const normalized = scalar(value);
  if (normalized === undefined) return;
  out.set(path, {
    path,
    value: normalized,
    priority,
    ...(label ? { label } : {}),
    ...(presence ? { presence: true } : {}),
  });
}

function addCollectionSignals(
  out: Map<string, StateSignal>,
  domain: 'Inventory' | 'Equipment' | 'Outfit' | 'Buffs' | 'Ailments',
  actorId: string,
  raw: unknown,
): void {
  for (const [id, value] of Object.entries(asRecord(raw))) {
    const record = asRecord(value);
    const label = itemName(id, value);
    const base = `${domain}.${actorId}.${id}`;
    const presencePriority = domain === 'Inventory' ? 8 : domain === 'Equipment' || domain === 'Outfit' ? 7 : 6;
    addSignal(out, `${base}.present`, true, presencePriority, label, true);
    if (domain === 'Inventory' || domain === 'Equipment') {
      if (record.Qty !== undefined) addSignal(out, `${base}.Qty`, record.Qty, 10, label);
    }
  }
}

function actorSignals(state: FFMVUState): Map<string, StateSignal> {
  const out = new Map<string, StateSignal>();
  const actors: Record<string, Record<string, unknown>> = {
    player: state.Mainchar as unknown as Record<string, unknown>,
  };
  for (const [id, raw] of Object.entries(asRecord(state.Familiar))) {
    if (isRecord(raw)) actors[id] = raw;
  }

  for (const [actorId, actor] of Object.entries(actors)) {
    addCollectionSignals(out, 'Inventory', actorId, actor.Inventory);
    addCollectionSignals(out, 'Equipment', actorId, actor.Equipment);
    addCollectionSignals(out, 'Outfit', actorId, asRecord(actor.Outfit).Worn);
    addCollectionSignals(out, 'Buffs', actorId, actor.Buffs);
    addCollectionSignals(out, 'Ailments', actorId, actor.Ailments);
  }

  for (const key of MAINCHAR_STAT_KEYS) {
    addSignal(out, `Stats.player.${key}`, tupleValue((state.Mainchar as unknown as Record<string, unknown>)[key]), 7, key);
  }

  addSignal(out, 'World.Location', tupleValue(state.World.Location), 8, 'Location');

  for (const [id, raw] of Object.entries(asRecord(state.Narrative.Relationships))) {
    const relation = asRecord(raw);
    for (const field of ['Bond', 'Sparks', 'Grudge', 'Dynamic']) {
      if (relation[field] !== undefined) addSignal(out, `Relationships.${id}.${field}`, relation[field], field === 'Dynamic' ? 4 : 6, id);
    }
  }

  return out;
}

function sameScalar(a: StateHistoryScalar, b: StateHistoryScalar): boolean {
  return a === b;
}

export function computeRecentStateHistory(
  states: readonly FFMVUState[],
  options: StateHistoryOptions = {},
): RecentStateHistoryEnvelope | null {
  if (states.length < 2) return null;
  const maxTracks = Math.max(1, Math.min(24, options.maxTracks ?? 12));
  const maxChangesPerPath = Math.max(1, Math.min(5, options.maxChangesPerPath ?? 3));
  const signals = states.map(actorSignals);
  const changes = new Map<string, { signal: StateSignal; changes: StateHistoryChange[]; latestTurn: number }>();

  for (let index = 1; index < states.length; index++) {
    const before = signals[index - 1];
    const after = signals[index];
    const turn = Number(states[index].Narrative.Turn) || 0;
    const paths = new Set([...before.keys(), ...after.keys()]);

    for (const path of paths) {
      const a = before.get(path);
      const b = after.get(path);
      const presence = a?.presence === true || b?.presence === true;
      if (presence) {
        const from = Boolean(a);
        const to = Boolean(b);
        if (from === to) continue;
        const signal = b ?? a;
        if (!signal) continue;
        const current = changes.get(path) ?? { signal, changes: [], latestTurn: turn };
        current.signal = b ?? current.signal;
        current.latestTurn = turn;
        current.changes.push({ turn, from, to });
        changes.set(path, current);
        continue;
      }

      if (!a || !b || sameScalar(a.value, b.value)) continue;
      const current = changes.get(path) ?? { signal: b, changes: [], latestTurn: turn };
      current.signal = b;
      current.latestTurn = turn;
      current.changes.push({ turn, from: a.value, to: b.value });
      changes.set(path, current);
    }
  }

  if (!changes.size) return null;
  const latestSignals = signals.at(-1)!;
  const tracks = [...changes.values()]
    .map(entry => {
      const latest = latestSignals.get(entry.signal.path);
      const current = entry.signal.presence ? Boolean(latest) : latest?.value;
      if (current === undefined) return null;
      return {
        path: entry.signal.path,
        ...(entry.signal.label ? { label: entry.signal.label } : {}),
        current,
        changes: entry.changes.slice(-maxChangesPerPath).reverse(),
        priority: entry.signal.priority,
        latestTurn: entry.latestTurn,
      };
    })
    .filter((entry): entry is StateHistoryTrack & { priority: number; latestTurn: number } => Boolean(entry))
    .sort((a, b) => b.latestTurn - a.latestTurn || b.priority - a.priority || a.path.localeCompare(b.path))
    .slice(0, maxTracks)
    .map(({ priority: _priority, latestTurn: _latestTurn, ...track }) => track);

  if (!tracks.length) return null;
  const current = states.at(-1)!;
  return {
    observedAt: {
      date: String(current.World.Date?.[0] ?? ''),
      time: String(current.World.Time?.[0] ?? ''),
    },
    currentTurn: Number(current.Narrative.Turn) || 0,
    tracks,
  };
}
