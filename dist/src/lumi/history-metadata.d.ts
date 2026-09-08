import type { NarrativeTimestamp, RecentChangesEnvelope } from '../shared/recent-changes.js';
import type { RecentStateHistoryEnvelope } from '../shared/state-history.js';
import type { LumiLlmMessage } from './spindle-lite.js';
export declare function injectNarrativeHistoryContext(messages: LumiLlmMessage[], timestamps: Record<string, NarrativeTimestamp>, recentChanges: RecentChangesEnvelope | null, stateHistory?: RecentStateHistoryEnvelope | null): LumiLlmMessage[];
