import type { FFMVUState, MutableRecord, PromptView } from './state-schema.js';
import { normalizeState } from './state-normalize.js';
import { asArray, asRecord, clone, isRecord, lower, text, tupleValue } from './domain/value-utils.js';

function recordTurn(record: unknown): number {
  if (!isRecord(record)) return 0;
  return Number(record.ResolvedTurn ?? record.LastTouchedTurn ?? record.LastShiftTurn ?? record.Turn ?? 0) || 0;
}

function priority(record: MutableRecord): number {
  const raw = record.Priority;
  if (typeof raw === 'number') return raw;
  const value = lower(raw);
  if (value === 'critical') return 5;
  if (value === 'high' || value === 'hot') return 4;
  if (value === 'medium' || value === 'warm') return 2;
  if (value === 'low' || value === 'cold') return 1;
  return 0;
}

function intersects(left: unknown, right: unknown): boolean {
  const target = new Set(asArray(right).map(text));
  return asArray(left).some(value => target.has(text(value)));
}

interface CandidateContext { actorIds: string[]; location: string; turn: number }

function candidateScore(record: unknown, context: CandidateContext): number {
  if (!isRecord(record)) return -1;
  let score = priority(record);
  const actors = asArray(record.Actors ?? record.NPCs ?? record.Participants);
  const locations = asArray(record.Locations ?? record.LocationKeys ?? (record.Location ? [record.Location] : []));
  if (intersects(actors, context.actorIds)) score += 4;
  if (locations.some(value => lower(value) === context.location)) score += 4;
  const earliest = Number(record.EarliestTurn ?? record.DeadlineTurn ?? 0) || 0;
  if (earliest && earliest <= context.turn) score += 3;
  if (['ready', 'active', 'triggered', 'urgent', 'hot'].includes(lower(record.Status))) score += 2;
  const nextPressure = text(record.next_pressure ?? record.NextPressure ?? record.NextAction ?? record.NextBeat).trim();
  if (nextPressure) score += 2;
  const touched = recordTurn(record);
  if (touched > 0 && context.turn >= touched && context.turn - touched <= 4) score += 1;
  return score;
}

function pickCandidates(record: unknown, context: CandidateContext, limit: number, minimum: number): MutableRecord {
  return Object.fromEntries(
    Object.entries(asRecord(record))
      .map(([id, value]) => [id, value, candidateScore(value, context)] as const)
      .filter(item => item[2] >= minimum)
      .sort((a, b) => b[2] - a[2] || recordTurn(b[1]) - recordTurn(a[1]))
      .slice(0, limit)
      .map(([id, value]) => [id, clone(value)]),
  );
}

function compactNpcIndex(record: unknown, limit: number): MutableRecord[] {
  return Object.values(asRecord(record)).slice(0, limit).map(npcRaw => {
    const npc = asRecord(npcRaw);
    return { ID: npc.ID || '', DisplayName: npc.DisplayName || npc.Name || '', Location: npc.Location || '', Status: npc.Status || '' };
  });
}

function pickWorldCalc(state: FFMVUState, relevantKeys: unknown): MutableRecord {
  const source = asRecord(state.World_Calc);
  const result: MutableRecord = { Factions: {}, Locations: {}, Ruins: {}, Events: {} };
  const keys = new Set(asArray(relevantKeys).map(lower));
  const currentLocation = lower(tupleValue(state.World.Location));
  for (const section of Object.keys(result)) {
    const entries = Object.entries(asRecord(source[section]));
    const selected = entries.filter(([key, valueRaw]) => {
      const value = asRecord(valueRaw);
      if (keys.has(lower(key))) return true;
      if (section === 'Locations' && currentLocation && (lower(key) === currentLocation || currentLocation.includes(lower(key)))) return true;
      return ['active', 'urgent', 'hot'].includes(lower(value.Status));
    });
    const fallback = entries.length <= 6 ? entries : [];
    result[section] = Object.fromEntries((selected.length ? selected : fallback).slice(0, 8).map(([key, value]) => [key, clone(value)]));
  }
  return result;
}

export interface BuildPromptViewOptions { consumeAudit?: boolean }
export interface PreparedProjection { state: FFMVUState; view: PromptView }

export function buildPromptView(input: unknown, options: BuildPromptViewOptions = {}): PreparedProjection {
  const state = normalizeState(input);
  const narrative = state.Narrative;
  const scene = narrative.Scene;
  const turn = narrative.Turn;
  const location = lower(scene.LocationKey || tupleValue(state.World.Location));
  const explicitHot = new Set(asArray(scene.PresentNPCs).map(text));

  for (const [id, npcRaw] of Object.entries(asRecord(narrative.NPCs))) {
    const npc = asRecord(npcRaw);
    if (npc.IsPresent === true || lower(npc.Temperature) === 'hot') explicitHot.add(id);
  }

  const familiarHot: MutableRecord = {};
  const familiarCold: MutableRecord[] = [];
  for (const [id, memberRaw] of Object.entries(asRecord(state.Familiar))) {
    const member = asRecord(memberRaw);
    if (tupleValue(member.Is_present) === true || tupleValue(member.Is_in_battle_team) === true || explicitHot.has(id)) familiarHot[id] = clone(member);
    else familiarCold.push({ ID: id, Name: tupleValue(member.Name) || id, Location: tupleValue(member.Location) || '' });
  }

  const hot: MutableRecord = {};
  const warmPool: MutableRecord = {};
  for (const [id, npc] of Object.entries(asRecord(narrative.NPCs))) {
    if (explicitHot.has(id)) hot[id] = clone(npc);
    else warmPool[id] = npc;
  }

  const context: CandidateContext = { actorIds: [...explicitHot, 'player'], location, turn };
  const warm = pickCandidates(warmPool, context, 6, 2);
  const relevantIds = new Set([...Object.keys(hot), ...Object.keys(warm), ...Object.keys(familiarHot), 'player']);
  const relationships = Object.fromEntries(Object.entries(asRecord(narrative.Relationships)).filter(([, valueRaw]) => {
    const value = asRecord(valueRaw);
    return relevantIds.has(text(value.A)) || relevantIds.has(text(value.B));
  }).map(([key, value]) => [key, clone(value)]));

  const auditEvery = narrative.Chekhov.AuditEvery;
  const auditDue = turn - narrative.Chekhov.LastAuditTurn >= auditEvery;
  const sceneChanged = Boolean(scene.Changed);
  const chekhovCandidates = pickCandidates(narrative.Chekhov.Active, context, 8, 2);
  const noteCandidates = pickCandidates(narrative.GM_Notes.Active, context, 6, 1);
  const threadCandidates = pickCandidates(narrative.WorldSim.Threads, context, 6, 1);
  const pressureCandidates = pickCandidates(narrative.WorldSim.Pressures, context, 6, 1);

  const view: PromptView = {
    Version: state.MVUStatMenu_DB_Ver,
    World: clone(state.World),
    World_Calc: pickWorldCalc(state, scene.RelevantWorldKeys),
    Mainchar: clone(state.Mainchar),
    Familiar: familiarHot,
    Narrative: {
      Turn: turn,
      NextNpcId: narrative.NextNpcId,
      Scene: clone(scene),
      NPCs: { ...hot, ...warm },
      Relationships: relationships,
      GM_Notes: { Active: noteCandidates },
      Chekhov: { Active: chekhovCandidates, AuditEvery: narrative.Chekhov.AuditEvery, LastAuditTurn: narrative.Chekhov.LastAuditTurn },
      WorldSim: { Threads: threadCandidates, Pressures: pressureCandidates, LastShift: narrative.WorldSim.LastShift || '' },
    },
    ProjectionMeta: {
      ReadOnly: true,
      WorldCounts: Object.fromEntries(['Factions', 'Locations', 'Ruins', 'Events'].map(key => [key, Object.keys(asRecord(state.World_Calc[key])).length])),
      FamiliarCount: Object.keys(asRecord(state.Familiar)).length,
      FamiliarColdCount: familiarCold.length,
      NPCColdCount: Math.max(0, Object.keys(narrative.NPCs).length - Object.keys(hot).length - Object.keys(warm).length),
      GMNotesActiveCount: Object.keys(narrative.GM_Notes.Active).length,
      RelationshipCount: Object.keys(narrative.Relationships).length,
      RelationshipProjectedCount: Object.keys(relationships).length,
      WorldSimThreadProjectedCount: Object.keys(threadCandidates).length,
      WorldSimPressureProjectedCount: Object.keys(pressureCandidates).length,
      ChekhovAuditDue: auditDue,
      ChekhovActiveCount: Object.keys(narrative.Chekhov.Active).length,
      ChekhovArchiveCount: Object.keys(narrative.Chekhov.Archive).length,
      WorldSimColdCount: Math.max(0, Object.keys(narrative.WorldSim.Threads).length + Object.keys(narrative.WorldSim.Pressures).length - Object.keys(threadCandidates).length - Object.keys(pressureCandidates).length),
    },
  };

  if (auditDue || sceneChanged) {
    const meta = asRecord(view.ProjectionMeta);
    meta.NPCIndex = compactNpcIndex(narrative.NPCs, 24);
    meta.FamiliarIndex = familiarCold.slice(0, 16);
    meta.ChekhovIndex = Object.entries(asRecord(narrative.Chekhov.Active)).slice(0, 30).map(([id, valueRaw]) => {
      const value = asRecord(valueRaw);
      return { ID: id, Hint: value.IndexHint || value.Setup || '', Status: value.Status || '', Priority: value.Priority || '' };
    });
    meta.GMNotesIndex = Object.entries(asRecord(narrative.GM_Notes.Active)).slice(0, 20).map(([id, valueRaw]) => {
      const value = asRecord(valueRaw);
      return { ID: id, Subject: value.Subject || value.Title || '', Status: value.Status || '', Priority: value.Priority || '' };
    });
  }

  if (options.consumeAudit) {
    if (auditDue) narrative.Chekhov.LastAuditTurn = turn;
    narrative.Scene.Changed = false;
  }
  return { state, view };
}
