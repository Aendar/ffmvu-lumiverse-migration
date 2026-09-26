import { canonicalHash } from './shared/hashing.js';
import { ACTIVE_PREFIX_FINGERPRINT_VERSION, LEGACY_ACTIVE_PREFIX_FINGERPRINT_VERSION } from './persistence/types.js';
export function activeMessageContent(message) {
    const index = Number.isInteger(message.swipeId) ? message.swipeId : 0;
    if (Array.isArray(message.swipes) && message.swipes[index] !== undefined)
        return String(message.swipes[index]);
    return String(message.content ?? '');
}
export async function activePrefixHash(messages, throughMessageId, fingerprintVersion = ACTIVE_PREFIX_FINGERPRINT_VERSION) {
    const prefix = [];
    let found = false;
    for (const message of messages) {
        const active = { id: message.id, role: message.role, activeContent: activeMessageContent(message) };
        if (fingerprintVersion === LEGACY_ACTIVE_PREFIX_FINGERPRINT_VERSION) {
            const swipeId = Number.isInteger(message.swipeId) ? message.swipeId : 0;
            prefix.push({ ...active, swipeId });
        }
        else if (fingerprintVersion === ACTIVE_PREFIX_FINGERPRINT_VERSION) {
            prefix.push(active);
        }
        else {
            throw new Error('UNSUPPORTED_TRANSCRIPT_FINGERPRINT_VERSION: ' + fingerprintVersion);
        }
        if (message.id === throughMessageId) {
            found = true;
            break;
        }
    }
    if (!found)
        throw new Error('TRANSCRIPT_BOUNDARY_MESSAGE_MISSING');
    return canonicalHash({ fingerprintVersion, prefix });
}
//# sourceMappingURL=transcript-fingerprint.js.map
