import { clone, isLabeledTuple, isRecord, lower } from './domain/value-utils.js';
import { pointerAdd, pointerGet, pointerRemove, pointerReplace } from './json-pointer.js';

export type JsonPatchOperation =
  | { op: 'add' | 'replace' | 'test'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'copy' | 'move'; path: string; from: string };

export interface PatchResourceLimits {
  maxPatchBytes: number;
  maxPatchOperations: number;
  maxPointerLength: number;
  maxPointerDepth: number;
  maxSingleValueBytes: number;
}

// DESIGN defaults: the spec requires explicit hard limits but does not prescribe numeric values.
// Tune these from real fixtures before production.
export const DEFAULT_PATCH_RESOURCE_LIMITS: PatchResourceLimits = {
  maxPatchBytes: 256 * 1024,
  maxPatchOperations: 256,
  maxPointerLength: 1024,
  maxPointerDepth: 48,
  maxSingleValueBytes: 128 * 1024,
};

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function assertPatchResourceLimits(operations: readonly JsonPatchOperation[], limits = DEFAULT_PATCH_RESOURCE_LIMITS): void {
  if (operations.length > limits.maxPatchOperations) throw new Error('MAX_PATCH_OPERATIONS exceeded');
  if (byteLength(operations) > limits.maxPatchBytes) throw new Error('MAX_PATCH_BYTES exceeded');
  for (const operation of operations) {
    if (operation.path.length > limits.maxPointerLength) throw new Error('MAX_POINTER_LENGTH exceeded');
    if (operation.path.split('/').length - 1 > limits.maxPointerDepth) throw new Error('MAX_POINTER_DEPTH exceeded');
    if ('value' in operation && byteLength(operation.value) > limits.maxSingleValueBytes) throw new Error('MAX_SINGLE_VALUE_BYTES exceeded');
  }
}

export function assertModelOperationPolicy(operations: readonly JsonPatchOperation[]): void {
  for (const operation of operations) {
    if (!['add', 'replace', 'remove'].includes(operation.op)) throw new Error('Model operation not allowed: ' + operation.op);
  }
}

export function canonicalizeTupleOperation(state: unknown, operation: JsonPatchOperation): JsonPatchOperation {
  const op = lower(operation.op);
  if (!['add', 'replace', 'test'].includes(op) || !('value' in operation)) return operation;
  let current: unknown;
  try { current = pointerGet(state, operation.path); } catch { return operation; }
  if (!isLabeledTuple(current) || isLabeledTuple(operation.value)) return operation;
  return { ...operation, path: operation.path.replace(/\/$/, '') + '/0' } as JsonPatchOperation;
}

export function repairLabeledTuples(current: unknown, baseline: unknown): unknown {
  if (isLabeledTuple(baseline)) {
    if (current === undefined) return clone(baseline);
    const value = isLabeledTuple(current) ? current[0] : current;
    return [clone(value), baseline[1]];
  }
  if (!isRecord(baseline)) return current;
  const output = isRecord(current) ? clone(current) : {};
  for (const [key, value] of Object.entries(baseline)) output[key] = repairLabeledTuples(output[key], value);
  return output;
}

export function applyJsonPatch<T>(input: T, operations: readonly JsonPatchOperation[]): T {
  let state = clone(input);
  for (const rawOperation of operations) {
    const operation = canonicalizeTupleOperation(state, rawOperation);
    if (operation.op === 'add') state = pointerAdd(state, operation.path, operation.value);
    else if (operation.op === 'remove') state = pointerRemove(state, operation.path);
    else if (operation.op === 'replace') state = pointerReplace(state, operation.path, operation.value);
    else if (operation.op === 'copy') state = pointerAdd(state, operation.path, pointerGet(state, operation.from));
    else if (operation.op === 'move') {
      const value = clone(pointerGet(state, operation.from));
      state = pointerRemove(state, operation.from);
      state = pointerAdd(state, operation.path, value);
    } else if (operation.op === 'test') {
      if (JSON.stringify(pointerGet(state, operation.path)) !== JSON.stringify(operation.value)) throw new Error('JSONPatch test failed: ' + operation.path);
    }
  }
  return state;
}
