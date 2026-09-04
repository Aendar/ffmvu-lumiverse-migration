export interface LumiChatMessage {
    id: string;
    role: 'system' | 'user' | 'assistant';
    content: string;
    extra?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    swipe_id: number;
    swipes: string[];
    swipe_dates: number[];
}
export interface LumiLlmMessage {
    role: 'system' | 'user' | 'assistant';
    content: string | Array<Record<string, unknown>>;
    name?: string;
    __isChatHistory?: boolean;
    sourceMessageId?: string;
    sourceIndexInChat?: number;
}
export interface ContextHandlerContext {
    chatId: string;
    generationType: 'normal' | 'continue' | 'regenerate' | 'swipe' | 'impersonate' | string;
    dryRun: boolean;
    userId: string;
    cancelGeneration?: boolean;
    [key: string]: unknown;
}
export interface InterceptorContext {
    chatId: string;
    connectionId: string;
    personaId: string;
    generationType: string;
    activatedWorldInfo: unknown[];
}
export interface GenerationStartedPayload {
    generationId: string;
    chatId: string;
    model: string;
    targetMessageId?: string;
    characterId?: string;
    characterName?: string;
}
export interface GenerationEndedPayload {
    generationId: string;
    chatId: string;
    messageId?: string;
    content?: string;
    error?: string;
}
export interface GenerationStoppedPayload {
    generationId: string;
    chatId: string;
    content: string;
}
export interface UserStorageApi {
    getJson<T>(path: string, options?: {
        fallback?: T;
        userId?: string;
    }): Promise<T>;
    setJson(path: string, value: unknown, options?: {
        indent?: number;
        userId?: string;
    }): Promise<void>;
    list(prefix?: string, userId?: string): Promise<string[]>;
    exists(path: string, userId?: string): Promise<boolean>;
    mkdir(path: string, userId?: string): Promise<void>;
    delete(path: string, userId?: string): Promise<void>;
}
export interface SpindleApiLite {
    contracts?: {
        preAssemblyGenerationContext?: number;
    };
    userStorage: UserStorageApi;
    chat: {
        getMessages(chatId: string): Promise<LumiChatMessage[]>;
    };
    permissions: {
        has(permission: string): boolean;
        onChanged(handler: (detail: {
            permission: string;
            granted: boolean;
            allGranted: string[];
            extensionId?: string;
        }) => void): (() => void) | void;
        onDenied?(handler: (detail: {
            permission: string;
            operation: string;
        }) => void): (() => void) | void;
    };
    log: {
        info(message: string, ...args: unknown[]): void;
        warn(message: string, ...args: unknown[]): void;
        error(message: string, ...args: unknown[]): void;
    };
    registerContextHandler(handler: (context: ContextHandlerContext) => Promise<ContextHandlerContext>, priority?: number, options?: {
        timeoutMs?: number;
    }): void;
    registerInterceptor(handler: (messages: LumiLlmMessage[], context: InterceptorContext) => Promise<LumiLlmMessage[] | {
        messages: LumiLlmMessage[];
        breakdown?: Array<{
            messageIndex: number;
            name?: string;
        }>;
    }>, priority?: number): void;
    on(event: 'GENERATION_STARTED', handler: (payload: GenerationStartedPayload, userId?: string) => void | Promise<void>): (() => void) | void;
    on(event: 'GENERATION_ENDED', handler: (payload: GenerationEndedPayload, userId?: string) => void | Promise<void>): (() => void) | void;
    on(event: 'GENERATION_STOPPED', handler: (payload: GenerationStoppedPayload, userId?: string) => void | Promise<void>): (() => void) | void;
    on(event: string, handler: (payload: any, userId?: string) => void | Promise<void>): (() => void) | void;
    onFrontendMessage(handler: (payload: any, userId: string) => void | Promise<void>): void;
    sendToFrontend(payload: unknown, userId?: string): void;
}
export interface FrontendDrawerTab {
    root: HTMLElement;
    setBadge(text: string | null): void;
    destroy(): void;
    onActivate(handler: () => void): () => void;
}
export interface SpindleFrontendContextLite {
    ui: {
        registerDrawerTab(options: {
            id: string;
            title: string;
            shortName?: string;
            description?: string;
            keywords?: string[];
            headerTitle?: string;
            iconSvg?: string;
        }): FrontendDrawerTab;
    };
    dom: {
        addStyle(css: string): () => void;
        cleanup(): void;
    };
    sendToBackend(payload: unknown): void;
    onBackendMessage(handler: (payload: any) => void): () => void;
}
