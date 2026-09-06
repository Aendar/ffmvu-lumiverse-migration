import type { NarrativeTimestamp, RecentChangesEnvelope } from '../shared/recent-changes.js';
import type { LumiLlmMessage } from './spindle-lite.js';
export declare function injectNarrativeHistoryContext(messages: LumiLlmMessage[], timestamps: Record<string, NarrativeTimestamp>, recentChanges: RecentChangesEnvelope | null): LumiLlmMessage[];
