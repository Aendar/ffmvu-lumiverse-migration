export function toHostTranscript(messages) {
    return messages.map(message => ({
        id: String(message.id),
        role: message.role,
        content: String(message.content ?? ''),
        swipes: Array.isArray(message.swipes) && message.swipes.length ? message.swipes.map(String) : [String(message.content ?? '')],
        swipeId: Number.isInteger(message.swipe_id) ? message.swipe_id : 0,
        swipeDates: Array.isArray(message.swipe_dates) ? message.swipe_dates.map(value => String(value)) : [],
    }));
}
export function swipeObservations(message) {
    const values = Array.isArray(message.swipes) && message.swipes.length ? message.swipes : [message.content];
    return values.map((text, index) => ({ text: String(text ?? ''), ...(message.swipe_dates?.[index] !== undefined ? { swipeDate: String(message.swipe_dates[index]) } : {}) }));
}
export function filterTranscriptForGeneration(messages, generationType, targetMessageId) {
    if (!targetMessageId)
        return messages;
    if (!['normal', 'regenerate', 'swipe'].includes(generationType))
        return messages;
    return messages.filter(message => String(message.id) !== String(targetMessageId));
}
//# sourceMappingURL=host-adapter.js.map