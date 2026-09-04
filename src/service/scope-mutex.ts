import type { StateScope } from '../persistence/types.js';

export class ScopeMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(scope: StateScope, job: () => Promise<T>): Promise<T> {
    const key = `${scope.userId}\u0000${scope.chatId}`;
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.then(() => gate);
    this.tails.set(key, tail);
    await previous;
    try {
      return await job();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}
