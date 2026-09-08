import { canonicalStringify } from '../shared/hashing.js';
function xmlAttr(value) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function injectNarrativeHistoryContext(messages, timestamps, recentChanges, stateHistory = null) {
    const out = structuredClone(messages);
    let tagged = 0;
    for (let i = 0; i < out.length; i++) {
        const message = out[i];
        if (message.role !== 'assistant' || typeof message.content !== 'string' || !message.sourceMessageId)
            continue;
        const stamp = timestamps[message.sourceMessageId];
        if (!stamp)
            continue;
        const marker = `<narrative_time date="${xmlAttr(stamp.date)}" time="${xmlAttr(stamp.time)}"/>`;
        if (!message.content.startsWith('<narrative_time '))
            message.content = marker + '\n' + message.content;
        tagged += 1;
    }
    if (!tagged && !recentChanges && !stateHistory)
        return out;
    const rules = [
        '<FFMVU_HISTORY_CONTEXT>',
        'The <narrative_time .../> markers attached to prior assistant messages are IN-WORLD narrative timestamps from World.Date and World.Time. They are metadata, not dialogue and not real-world clock time.',
        'Use them to preserve chronology across the conversation. Do not infer elapsed in-world time from user message timing.',
        recentChanges
            ? 'RECENT_CHANGES is a net diff between the last state already represented by an assistant response and the state being delivered now. It may include GUI/system changes that never appeared in prose. Treat the current MODEL_STATE as authoritative; use RECENT_CHANGES only to understand what changed off-screen.\n<RECENT_CHANGES>' + canonicalStringify(recentChanges) + '</RECENT_CHANGES>'
            : '',
        stateHistory
            ? 'STATE_TRAIL is a bounded read-only history of structured values along the active semantic lineage. Each change.turn is Narrative.Turn in the post-change state. current MODEL_STATE is authoritative; older values are historical context only and must never override it.\n<STATE_TRAIL>' + canonicalStringify(stateHistory) + '</STATE_TRAIL>'
            : '',
        '</FFMVU_HISTORY_CONTEXT>',
    ].filter(Boolean).join('\n');
    const systemIndex = out.findIndex(message => message.role === 'system' && typeof message.content === 'string');
    if (systemIndex >= 0)
        out[systemIndex] = { ...out[systemIndex], content: String(out[systemIndex].content) + '\n\n' + rules };
    else
        out.unshift({ role: 'system', content: rules });
    return out;
}
//# sourceMappingURL=history-metadata.js.map