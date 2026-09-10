import type { JsonPatchOperation } from '../json-patch.js';
import type { FFMVUState } from '../state-schema.js';
/**
 * Future-only deterministic reconciliation for current-schema model writes.
 * Callers persist the returned diff as an explicit system commit; replay never
 * reruns these formulas against historical nodes.
 */
export declare function reconcileModelEquipmentState(before: FFMVUState, afterModel: FFMVUState, canonicalPatch: readonly JsonPatchOperation[]): FFMVUState;
