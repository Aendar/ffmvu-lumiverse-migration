import type { JsonPatchOperation } from './json-patch.js';
import type { FFMVUState, PromptView } from './state-schema.js';
import { asRecord } from './domain/value-utils.js';

export function computeProjectionConsumptionPatch(state: FFMVUState, nextProjection: PromptView): JsonPatchOperation[] {
  const operations: JsonPatchOperation[] = [];
  const meta = asRecord(nextProjection.ProjectionMeta);
  if (meta.ChekhovAuditDue === true && state.Narrative.Chekhov.LastAuditTurn !== state.Narrative.Turn) {
    operations.push({ op: 'replace', path: '/Narrative/Chekhov/LastAuditTurn', value: state.Narrative.Turn });
  }
  if (state.Narrative.Scene.Changed !== false) operations.push({ op: 'replace', path: '/Narrative/Scene/Changed', value: false });
  return operations;
}
