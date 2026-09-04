import { type HostTranscriptMessage } from './transcript-fingerprint.js';
import { AnchorStore, TranscriptAttemptStore, VariantIndexStore } from './persistence/anchor-store.js';
import type { EventStore } from './persistence/event-store.js';
import type { Materializer } from './persistence/materializer.js';
import { type StateScope, type VariantId } from './persistence/types.js';
export type HeadHealth = 'ok' | 'unreconciled' | 'diverged_history' | 'base_boundary_dirty' | 'stopped_uncommitted' | 'failed_patch' | 'store_error';
export interface HeadResolution {
    health: HeadHealth;
    nodeId: string;
    stateHash: string;
    variantId?: VariantId;
    reason?: string;
}
export declare class HeadResolver {
    private readonly eventStore;
    private readonly materializer;
    private readonly anchors;
    private readonly attempts;
    private readonly variants;
    constructor(eventStore: EventStore, materializer: Materializer, anchors: AnchorStore, attempts: TranscriptAttemptStore, variants: VariantIndexStore);
    resolve(scope: StateScope, baseId: string, messages: HostTranscriptMessage[]): Promise<HeadResolution>;
    private bad;
}
