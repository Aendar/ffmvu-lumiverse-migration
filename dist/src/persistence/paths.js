function safeSegment(value, label) {
    if (!value || /[\\/]/.test(value) || value === '.' || value === '..')
        throw new Error(`Invalid ${label}`);
    return encodeURIComponent(value);
}
export function scopeRoot(scope) { return `chats/${safeSegment(scope.chatId, 'chatId')}`; }
export const basePath = (scope, id) => `${scopeRoot(scope)}/bases/${safeSegment(id, 'base id')}.json`;
export const commitPath = (scope, id) => `${scopeRoot(scope)}/events/${safeSegment(id, 'commit id')}.json`;
export const revisionPath = (scope, id) => `${scopeRoot(scope)}/store-revisions/${safeSegment(id, 'revision id')}.json`;
export const checkpointPath = (scope, id) => `${scopeRoot(scope)}/checkpoints/${safeSegment(id, 'checkpoint id')}.json`;
export const anchorPath = (scope, variantId) => `${scopeRoot(scope)}/anchors/${safeSegment(variantId, 'variant id')}.json`;
export const rootAnchorPath = (scope) => `${scopeRoot(scope)}/anchors/root.json`;
export const attemptPath = (scope, attemptId) => `${scopeRoot(scope)}/attempts/${safeSegment(attemptId, 'attempt id')}.json`;
export const attemptPrefix = (scope) => `${scopeRoot(scope)}/attempts/`;
export const variantIndexPath = (scope, messageId) => `${scopeRoot(scope)}/indexes/variants/${safeSegment(messageId, 'message id')}.json`;
export const materializedTipPath = (scope) => `${scopeRoot(scope)}/indexes/materialized-tip.json`;
//# sourceMappingURL=paths.js.map