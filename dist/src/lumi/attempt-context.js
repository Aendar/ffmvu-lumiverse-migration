import { createId, isoNow } from '../persistence/ids.js';
export class AttemptContextRegistry {
    byScope = new Map();
    byGeneration = new Map();
    finalizing = new Set();
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
    claimFinalization(generationId) {
        const value = this.byGeneration.get(generationId);
        if (!value || this.finalizing.has(generationId))
            return null;
        this.finalizing.add(generationId);
        return value;
    }
    isFinalizing(generationId) { return this.finalizing.has(generationId); }
    release(value) {
        this.byScope.delete(this.key(value.scope));
        if (value.generationId) {
            this.byGeneration.delete(value.generationId);
            this.finalizing.delete(value.generationId);
        }
    }
    list() { return [...this.byScope.values()].map(item => structuredClone(item)); }
}
export class EarlyGenerationRegistry {
    byChat = new Map();
    remember(value) {
        this.byChat.set(String(value.chatId), structuredClone(value));
    }
    peek(chatId) {
        const value = this.byChat.get(String(chatId));
        return value ? structuredClone(value) : null;
    }
    take(chatId) {
        const key = String(chatId);
        const value = this.byChat.get(key);
        if (!value)
            return null;
        this.byChat.delete(key);
        return structuredClone(value);
    }
    forgetGeneration(generationId) {
        for (const [chatId, value] of this.byChat) {
            if (value.generationId === generationId)
                this.byChat.delete(chatId);
        }
    }
}
//# sourceMappingURL=attempt-context.js.map