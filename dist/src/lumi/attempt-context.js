import { createId, isoNow } from '../persistence/ids.js';
export class AttemptContextRegistry {
    byScope = new Map();
    byGeneration = new Map();
    key(scope) { return `${scope.userId}\u0000${scope.chatId}`; }
    create(input) {
        const key = this.key(input.scope);
        if (this.byScope.has(key))
            throw new Error('PENDING_GENERATION_EXISTS');
        const value = { ...structuredClone(input), attemptId: createId('attempt'), createdAt: isoNow() };
        this.byScope.set(key, value);
        return value;
    }
    getForChat(chatId) {
        const matches = [...this.byScope.values()].filter(item => item.scope.chatId === chatId);
        return matches.length === 1 ? matches[0] : null;
    }
    getForScope(scope) { return this.byScope.get(this.key(scope)) ?? null; }
    bindGeneration(chatId, generationId, targetMessageId) {
        const value = this.getForChat(chatId);
        if (!value)
            return null;
        value.generationId = generationId;
        if (targetMessageId)
            value.targetMessageId = targetMessageId;
        this.byGeneration.set(generationId, value);
        return value;
    }
    getByGeneration(generationId) { return this.byGeneration.get(generationId) ?? null; }
    release(value) {
        this.byScope.delete(this.key(value.scope));
        if (value.generationId)
            this.byGeneration.delete(value.generationId);
    }
    list() { return [...this.byScope.values()].map(item => structuredClone(item)); }
}
//# sourceMappingURL=attempt-context.js.map