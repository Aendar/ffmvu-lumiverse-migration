import type { HostTranscriptMessage } from '../transcript-fingerprint.js';
import type { LumiChatMessage } from './spindle-lite.js';
export declare function toHostTranscript(messages: LumiChatMessage[]): HostTranscriptMessage[];
export declare function swipeObservations(message: LumiChatMessage): Array<{
    text: string;
    swipeDate?: string;
}>;
export declare function filterTranscriptForGeneration(messages: LumiChatMessage[], generationType: string, targetMessageId?: string): LumiChatMessage[];
