import { AttemptContextRegistry } from '../../src/lumi/attempt-context.js';
import { injectFrozenModelState } from '../../src/lumi/model-state-injector.js';
import { UserStorageJsonAdapter } from '../../src/lumi/user-storage-adapter.js';
import type { UserStorageApi } from '../../src/lumi/spindle-lite.js';

let passed = 0;
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error('ASSERT: ' + message); passed += 1; }

class MockUserStorage implements UserStorageApi {
  files = new Map<string, unknown>();
  key(userId: string | undefined, path: string) { return `${userId ?? 'owner'}:${path}`; }
  async getJson<T>(path: string, options?: { fallback?: T; userId?: string }): Promise<T> { const key = this.key(options?.userId, path); return (this.files.has(key) ? structuredClone(this.files.get(key)) : structuredClone(options?.fallback)) as T; }
  async setJson(path: string, value: unknown, options?: { indent?: number; userId?: string }): Promise<void> { this.files.set(this.key(options?.userId, path), structuredClone(value)); }
  async list(prefix = '', userId?: string): Promise<string[]> { const head = `${userId ?? 'owner'}:`; return [...this.files.keys()].filter(k => k.startsWith(head + prefix)).map(k => k.slice(head.length)); }
  async exists(path: string, userId?: string): Promise<boolean> { return this.files.has(this.key(userId, path)); }
  async mkdir(): Promise<void> {}
  async delete(path: string, userId?: string): Promise<void> { this.files.delete(this.key(userId, path)); }
}

async function main() {
  const view = { Version: 'FFMVU-1.5.8', Narrative: { Turn: 3 } };
  const sentinel = injectFrozenModelState([{ role: 'system', content: 'x __FFMVU_LIVE_STATE__ y' }], view);
  assert(sentinel.mode === 'sentinel' && String(sentinel.messages[0].content).includes('"Turn":3'), 'sentinel injection');
  const block = injectFrozenModelState([{ role: 'system', content: '<MODEL_STATE>old</MODEL_STATE>' }], view);
  assert(block.mode === 'block' && !String(block.messages[0].content).includes('old'), 'existing MODEL_STATE replacement');
  const fallback = injectFrozenModelState([{ role: 'user', content: 'hello' }], view);
  assert(fallback.mode === 'fallback' && fallback.messages[0].role === 'system', 'fallback injects dedicated system message');

  const contexts = new AttemptContextRegistry();
  const scope = { userId: 'u', chatId: 'c' };
  const pending = contexts.create({ scope, generationType: 'normal', baseNodeId: 'b', baseStateHash: 'h', projectionVersion: 'p', promptProtocolVersion: 'q', projectionView: {}, promptViewHash: 'v' });
  let collision = false; try { contexts.create({ scope, generationType: 'normal', baseNodeId: 'b', baseStateHash: 'h', projectionVersion: 'p', promptProtocolVersion: 'q', projectionView: {}, promptViewHash: 'v' }); } catch { collision = true; }
  assert(collision, 'one pending non-dryRun generation per scope');
  assert(contexts.bindGeneration('c', 'g1')?.attemptId === pending.attemptId, 'generation id binds to frozen context');
  contexts.release(pending); assert(contexts.getByGeneration('g1') === null, 'release clears correlation');

  const raw = new MockUserStorage(); const a = new UserStorageJsonAdapter(raw, 'alice'); const b = new UserStorageJsonAdapter(raw, 'bob');
  await a.setJson('x.json', { n: 1 }); await b.setJson('x.json', { n: 2 });
  assert((await a.getJson<{n:number}>('x.json'))?.n === 1 && (await b.getJson<{n:number}>('x.json'))?.n === 2, 'userStorage adapter remains per-user isolated');
  assert(await a.getJson('missing.json') === null, 'missing JSON maps to null without stat/move dependency');
  console.log(`phase4 bridge tests passed: ${passed}`);
}
main();
