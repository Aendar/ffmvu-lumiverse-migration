import type { StateScope } from '../persistence/types.js';
export interface FrozenAttemptContext {
    attemptId: string;
    scope: StateScope;
    generationType: string;
    baseNodeId: string;
    baseStateHash: string;
    projectionVersion: string;
    promptProtocolVersion: string;
    projectionView: Record<string, unknown>;
    promptViewHash: string;
    createdAt: string;
    generationId?: string;
    targetMessageId?: string;
    injectionMode?: 'sentinel' | 'block' | 'fallback';
}
export declare class AttemptContextRegistry {
    private readonly byScope;
    private readonly byGeneration;
    private key;
    create(input: Omit<FrozenAttemptContext, 'attemptId' | 'createdAt'>): FrozenAttemptContext;
    getForChat(chatId: string): FrozenAttemptContext | null;
    getForScope(scope: StateScope): FrozenAttemptContext | null;
    bindGeneration(chatId: string, generationId: string, targetMessageId?: string): FrozenAttemptContext | null;
    getByGeneration(generationId: string): FrozenAttemptContext | null;
    release(value: FrozenAttemptContext): void;
    list(): FrozenAttemptContext[];
}
