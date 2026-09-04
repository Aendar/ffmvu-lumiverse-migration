import type { LumiLlmMessage } from './spindle-lite.js';

const SENTINEL = '__FFMVU_LIVE_STATE__';
const MODEL_STATE_RE = /<MODEL_STATE>[\s\S]*?<\/MODEL_STATE>/i;

export interface InjectionResult { messages: LumiLlmMessage[]; mode: 'sentinel' | 'block' | 'fallback'; messageIndex: number }

export function injectFrozenModelState(input: LumiLlmMessage[], view: unknown): InjectionResult {
  const messages = structuredClone(input);
  const serialized = JSON.stringify(view);
  for (let i = 0; i < messages.length; i++) {
    const content = messages[i].content;
    if (typeof content !== 'string') continue;
    if (content.includes(SENTINEL)) {
      messages[i].content = content.replace(SENTINEL, serialized);
      return { messages, mode: 'sentinel', messageIndex: i };
    }
  }
  for (let i = 0; i < messages.length; i++) {
    const content = messages[i].content;
    if (typeof content !== 'string' || !MODEL_STATE_RE.test(content)) continue;
    messages[i].content = content.replace(MODEL_STATE_RE, `<MODEL_STATE>\n${serialized}\n</MODEL_STATE>`);
    return { messages, mode: 'block', messageIndex: i };
  }
  const fallback: LumiLlmMessage = { role: 'system', content: `<MODEL_STATE>\n${serialized}\n</MODEL_STATE>` };
  messages.unshift(fallback);
  return { messages, mode: 'fallback', messageIndex: 0 };
}
