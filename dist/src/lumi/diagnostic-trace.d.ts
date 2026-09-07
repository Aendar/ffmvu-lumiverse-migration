export interface DiagnosticTraceEntry {
    at: string;
    kind: 'status' | 'internal';
    [key: string]: unknown;
}
export declare class DiagnosticTraceStore {
    private readonly limit;
    private readonly byUser;
    constructor(limit?: number);
    append(userId: string, entry: DiagnosticTraceEntry): void;
    list(userId: string): DiagnosticTraceEntry[];
    clear(userId: string): void;
}
