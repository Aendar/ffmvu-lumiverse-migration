import { canonicalHash } from './shared/hashing.js';
import { ACTIVE_PREFIX_FINGERPRINT_VERSION } from './persistence/types.js';

export interface HostTranscriptMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | string;
  content: string;
  swipes?: string[];
  swipeId?: number;
  swipeDates?: string[];
}

export function activeMessageContent(message: HostTranscriptMessage): string {
  const index = Number.isInteger(message.swipeId) ? message.swipeId! : 0;
  if (Array.isArray(message.swipes) && message.swipes[index] !== undefined) return String(message.swipes[index]);
  return String(message.content ?? '');
}

export async function activePrefixHash(messages: HostTranscriptMessage[], throughMessageId: string): Promise<string> {
  const prefix: unknown[] = [];
  let found = false;
  for (const message of messages) {
    const swipeId = Number.isInteger(message.swipeId) ? message.swipeId! : 0;
    prefix.push({ id: message.id, role: message.role, activeContent: activeMessageContent(message), swipeId });
    if (message.id === throughMessageId) { found = true; break; }
  }
  if (!found) throw new Error('TRANSCRIPT_BOUNDARY_MESSAGE_MISSING');
  return canonicalHash({ fingerprintVersion: ACTIVE_PREFIX_FINGERPRINT_VERSION, prefix });
}
