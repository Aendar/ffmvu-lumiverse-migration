export interface DiagnosticTraceEntry {
  at: string;
  kind: 'status' | 'internal';
  [key: string]: unknown;
}

export class DiagnosticTraceStore {
  private readonly byUser = new Map<string, DiagnosticTraceEntry[]>();

  constructor(private readonly limit = 160) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('DIAGNOSTIC_TRACE_LIMIT_INVALID');
  }

  append(userId: string, entry: DiagnosticTraceEntry): void {
    const key = String(userId);
    const list = this.byUser.get(key) ?? [];
    list.push(structuredClone(entry));
    if (list.length > this.limit) list.splice(0, list.length - this.limit);
    this.byUser.set(key, list);
  }

  list(userId: string): DiagnosticTraceEntry[] {
    return structuredClone(this.byUser.get(String(userId)) ?? []);
  }

  clear(userId: string): void {
    this.byUser.delete(String(userId));
  }
}
