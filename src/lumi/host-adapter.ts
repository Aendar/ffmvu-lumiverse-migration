import type { HostTranscriptMessage } from '../transcript-fingerprint.js';
import type { LumiChatMessage } from './spindle-lite.js';

export function toHostTranscript(messages: LumiChatMessage[]): HostTranscriptMessage[] {
  return messages.map(message => ({
    id: String(message.id),
    role: message.role,
    content: String(message.content ?? ''),
    swipes: Array.isArray(message.swipes) && message.swipes.length ? message.swipes.map(String) : [String(message.content ?? '')],
    swipeId: Number.isInteger(message.swipe_id) ? message.swipe_id : 0,
    swipeDates: Array.isArray(message.swipe_dates) ? message.swipe_dates.map(value => String(value)) : [],
  }));
}

export function swipeObservations(message: LumiChatMessage): Array<{ text: string; swipeDate?: string }> {
  const values = Array.isArray(message.swipes) && message.swipes.length ? message.swipes : [message.content];
  return values.map((text, index) => ({ text: String(text ?? ''), ...(message.swipe_dates?.[index] !== undefined ? { swipeDate: String(message.swipe_dates[index]) } : {}) }));
}
