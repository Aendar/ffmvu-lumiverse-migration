import type { StateScope } from '../persistence/types.js';
import type { ModelPatchAuthorizationView } from '../shared/patch-policy.js';
import { createId, isoNow } from '../persistence/ids.js';

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

export class AttemptContextRegistry {
  private readonly byScope = new Map<string, FrozenAttemptContext>();
  private readonly byGeneration = new Map<string, FrozenAttemptContext>();
  private readonly finalizing = new Set<string>();
  private key(scope: StateScope): string { return `${scope.userId}\u0000${scope.chatId}`; }
  create(input: Omit<FrozenAttemptContext, 'attemptId' | 'createdAt'>): FrozenAttemptContext {
    const key = this.key(input.scope);
    if (this.byScope.has(key)) throw new Error('PENDING_GENERATION_EXISTS');
    const value: FrozenAttemptContext = { ...structuredClone(input), attemptId: createId('attempt'), createdAt: isoNow() };
    this.byScope.set(key, value); return value;
  }
  getForChat(chatId: string): FrozenAttemptContext | null {
    const matches = [...this.byScope.values()].filter(item => item.scope.chatId === chatId);
    return matches.length === 1 ? matches[0] : null;
  }
  getForScope(scope: StateScope): FrozenAttemptContext | null { return this.byScope.get(this.key(scope)) ?? null; }
  bindGeneration(chatId: string, generationId: string, targetMessageId?: string): FrozenAttemptContext | null {
    const value = this.getForChat(chatId); if (!value) return null;
    value.generationId = generationId; if (targetMessageId) value.targetMessageId = targetMessageId;
    this.byGeneration.set(generationId, value); return value;
  }
  getByGeneration(generationId: string): FrozenAttemptContext | null { return this.byGeneration.get(generationId) ?? null; }
  claimFinalization(generationId: string): FrozenAttemptContext | null {
    const value = this.byGeneration.get(generationId);
    if (!value || this.finalizing.has(generationId)) return null;
    this.finalizing.add(generationId);
    return value;
  }
  isFinalizing(generationId: string): boolean { return this.finalizing.has(generationId); }
  release(value: FrozenAttemptContext): void {
    this.byScope.delete(this.key(value.scope));
    if (value.generationId) {
      this.byGeneration.delete(value.generationId);
      this.finalizing.delete(value.generationId);
    }
  }
  list(): FrozenAttemptContext[] { return [...this.byScope.values()].map(item => structuredClone(item)); }
}


export interface EarlyGenerationStart {
  generationId: string;
  chatId: string;
  targetMessageId?: string;
  generationType?: string;
}

export class EarlyGenerationRegistry {
  private readonly byChat = new Map<string, EarlyGenerationStart>();

  remember(value: EarlyGenerationStart): void {
    this.byChat.set(String(value.chatId), structuredClone(value));
  }

  peek(chatId: string): EarlyGenerationStart | null {
    const value = this.byChat.get(String(chatId));
    return value ? structuredClone(value) : null;
  }

  take(chatId: string): EarlyGenerationStart | null {
    const key = String(chatId);
    const value = this.byChat.get(key);
    if (!value) return null;
    this.byChat.delete(key);
    return structuredClone(value);
  }

  forgetGeneration(generationId: string): void {
    for (const [chatId, value] of this.byChat) {
      if (value.generationId === generationId) this.byChat.delete(chatId);
    }
  }
}
