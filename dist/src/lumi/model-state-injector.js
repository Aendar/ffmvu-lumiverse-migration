const SENTINEL = '__FFMVU_LIVE_STATE__';
const MODEL_STATE_RE = /<MODEL_STATE>[\s\S]*?<\/MODEL_STATE>/i;
export function injectFrozenModelState(input, view) {
    const messages = structuredClone(input);
    const serialized = JSON.stringify(view);
    for (let i = 0; i < messages.length; i++) {
        const content = messages[i].content;
        if (typeof content !== 'string')
            continue;
        if (content.includes(SENTINEL)) {
            messages[i].content = content.replace(SENTINEL, serialized);
            return { messages, mode: 'sentinel', messageIndex: i };
        }
    }
    for (let i = 0; i < messages.length; i++) {
        const content = messages[i].content;
        if (typeof content !== 'string' || !MODEL_STATE_RE.test(content))
            continue;
        messages[i].content = content.replace(MODEL_STATE_RE, `<MODEL_STATE>\n${serialized}\n</MODEL_STATE>`);
        return { messages, mode: 'block', messageIndex: i };
    }
    const fallback = { role: 'system', content: `<MODEL_STATE>\n${serialized}\n</MODEL_STATE>` };
    messages.unshift(fallback);
    return { messages, mode: 'fallback', messageIndex: 0 };
}
//# sourceMappingURL=model-state-injector.js.map