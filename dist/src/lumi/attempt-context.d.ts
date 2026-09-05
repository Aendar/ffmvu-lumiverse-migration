import type { StateScope } from '../persistence/types.js';
import type { ModelPatchAuthorizationView } from '../shared/patch-policy.js';
export interface FrozenAttemptContext {
    attemptId: string;
    scope: StateScope;
    generationType: string;
    baseNodeId: string;
    baseStateHash: string;
    projectionSourceKind: 'node' | 'base-seed';
    projectionSourceNodeId?: string;
    projectionSourceStateHash?: string;
    projectionSourceBaseId?: string;
    projectionVersion: string;
    promptProtocolVersion: string;
    reducerVersion: string;
    projectionView: Record<string, unknown>;
    promptViewHash: string;
    frozenAuthorization: ModelPatchAuthorizationView;
    presetVersion?: string;
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
export interface EarlyGenerationStart {
    generationId: string;
    chatId: string;
    targetMessageId?: string;
    generationType?: string;
}
export declare class EarlyGenerationRegistry {
    private readonly byChat;
    remember(value: EarlyGenerationStart): void;
    peek(chatId: string): EarlyGenerationStart | null;
    take(chatId: string): EarlyGenerationStart | null;
    forgetGeneration(generationId: string): void;
}
