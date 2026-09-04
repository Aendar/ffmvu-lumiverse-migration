import type { JsonStoragePort } from './storage-port.js';
import type { AnchorRecord, MessageVariantIndex, RootAnchorRecord, StateScope, TranscriptAttempt, VariantId } from './types.js';
export declare class AnchorStore {
    private readonly storage;
    constructor(storage: JsonStoragePort);
    read(scope: StateScope, variantId: string): Promise<AnchorRecord | null>;
    put(record: AnchorRecord): Promise<void>;
    readRoot(scope: StateScope): Promise<RootAnchorRecord | null>;
    putRoot(record: RootAnchorRecord): Promise<void>;
}
export declare class TranscriptAttemptStore {
    private readonly storage;
    private readonly immutable;
    constructor(storage: JsonStoragePort);
    append(attempt: TranscriptAttempt): Promise<void>;
    read(scope: StateScope, attemptId: string): Promise<TranscriptAttempt | null>;
    listForVariant(scope: StateScope, variantId: VariantId): Promise<TranscriptAttempt[]>;
}
export interface SwipeObservation {
    text: string;
    swipeDate?: string;
}
export interface ReconcileResult {
    status: 'ok' | 'ambiguous';
    index?: MessageVariantIndex;
    reason?: string;
}
export declare class VariantIndexStore {
    private readonly storage;
    constructor(storage: JsonStoragePort);
    read(scope: StateScope, messageId: string): Promise<MessageVariantIndex | null>;
    write(scope: StateScope, index: MessageVariantIndex): Promise<void>;
    create(scope: StateScope, messageId: string, swipes: SwipeObservation[]): Promise<MessageVariantIndex>;
    applyAdded(scope: StateScope, messageId: string, swipeIndex: number, observation: SwipeObservation): Promise<VariantId>;
    applyUpdated(scope: StateScope, messageId: string, swipeIndex: number, observation: SwipeObservation): Promise<VariantId>;
    applyDeleted(scope: StateScope, messageId: string, swipeIndex: number): Promise<VariantId>;
    reconcileWholesale(scope: StateScope, messageId: string, swipes: SwipeObservation[]): Promise<ReconcileResult>;
    private require;
}
