import type { MutableRecord } from '../state-schema.js';

export function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isRecord(value: unknown): value is MutableRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function asRecord(value: unknown): MutableRecord {
  return isRecord(value) ? value : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

export function lower(value: unknown): string {
  return text(value).trim().toLowerCase();
}

export function clamp(value: unknown, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

export function tupleValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

export function uniqueStrings(values: unknown): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of asArray(values)) {
    if (typeof value !== 'string' || !value.trim() || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function isLabeledTuple(value: unknown): value is [unknown, string] {
  return Array.isArray(value) && value.length >= 2 && typeof value[1] === 'string';
}
