import type { StateScope } from './types.js';

function safeSegment(value: string, label: string): string {
  if (!value || /[\\/]/.test(value) || value === '.' || value === '..') throw new Error(`Invalid ${label}`);
  return encodeURIComponent(value);
}
export function scopeRoot(scope: StateScope): string { return `chats/${safeSegment(scope.chatId, 'chatId')}`; }
export const basePath = (scope: StateScope, id: string) => `${scopeRoot(scope)}/bases/${safeSegment(id, 'base id')}.json`;
export const commitPath = (scope: StateScope, id: string) => `${scopeRoot(scope)}/events/${safeSegment(id, 'commit id')}.json`;
export const revisionPath = (scope: StateScope, id: string) => `${scopeRoot(scope)}/store-revisions/${safeSegment(id, 'revision id')}.json`;
export const checkpointPath = (scope: StateScope, id: string) => `${scopeRoot(scope)}/checkpoints/${safeSegment(id, 'checkpoint id')}.json`;
export const anchorPath = (scope: StateScope, variantId: string) => `${scopeRoot(scope)}/anchors/${safeSegment(variantId, 'variant id')}.json`;
export const rootAnchorPath = (scope: StateScope) => `${scopeRoot(scope)}/anchors/root.json`;
export const attemptPath = (scope: StateScope, attemptId: string) => `${scopeRoot(scope)}/attempts/${safeSegment(attemptId, 'attempt id')}.json`;
export const attemptPrefix = (scope: StateScope) => `${scopeRoot(scope)}/attempts/`;
export const variantIndexPath = (scope: StateScope, messageId: string) => `${scopeRoot(scope)}/indexes/variants/${safeSegment(messageId, 'message id')}.json`;
export const materializedTipPath = (scope: StateScope) => `${scopeRoot(scope)}/indexes/materialized-tip.json`;
