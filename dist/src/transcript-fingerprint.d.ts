export interface HostTranscriptMessage {
    id: string;
    role: 'user' | 'assistant' | 'system' | string;
    content: string;
    swipes?: string[];
    swipeId?: number;
    swipeDates?: string[];
}
export declare function activeMessageContent(message: HostTranscriptMessage): string;
export declare function activePrefixHash(messages: HostTranscriptMessage[], throughMessageId: string): Promise<string>;
