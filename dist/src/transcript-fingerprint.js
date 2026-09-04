import { canonicalHash } from './shared/hashing.js';
import { ACTIVE_PREFIX_FINGERPRINT_VERSION } from './persistence/types.js';
export function activeMessageContent(message) {
    const index = Number.isInteger(message.swipeId) ? message.swipeId : 0;
    if (Array.isArray(message.swipes) && message.swipes[index] !== undefined)
        return String(message.swipes[index]);
    return String(message.content ?? '');
}
export async function activePrefixHash(messages, throughMessageId) {
    const prefix = [];
    let found = false;
    for (const message of messages) {
        const swipeId = Number.isInteger(message.swipeId) ? message.swipeId : 0;
        prefix.push({ id: message.id, role: message.role, activeContent: activeMessageContent(message), swipeId });
        if (message.id === throughMessageId) {
            found = true;
            break;
        }
    }
    if (!found)
        throw new Error('TRANSCRIPT_BOUNDARY_MESSAGE_MISSING');
    return canonicalHash({ fingerprintVersion: ACTIVE_PREFIX_FINGERPRINT_VERSION, prefix });
}
//# sourceMappingURL=transcript-fingerprint.js.map