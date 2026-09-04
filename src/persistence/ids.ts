export function createId(prefix: string): string {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (!randomUUID) throw new Error('crypto.randomUUID() is required');
  return `${prefix}_${randomUUID()}`;
}

export function isoNow(): string {
  return new Date().toISOString();
}
