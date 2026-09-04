import { applyJsonPatch } from '../shared/json-patch.js';
import type { ReducerRegistry } from '../shared/reducer-registry.js';
import { canonicalHash } from '../shared/hashing.js';
import type { EventStore } from './event-store.js';
import type { MaterializedState, StateScope } from './types.js';

export class Materializer {
  constructor(
    private readonly store: EventStore,
    private readonly reducers: ReducerRegistry,
  ) {}

  async materialize(scope: StateScope, nodeId: string): Promise<MaterializedState> {
    const visiting = new Set<string>();
    const result = await this.materializeInner(scope, nodeId, visiting);
    return result;
  }

  private async materializeInner(scope: StateScope, nodeId: string, visiting: Set<string>): Promise<MaterializedState> {
    if (visiting.has(nodeId)) throw new Error('Semantic DAG cycle detected at ' + nodeId);
    visiting.add(nodeId);
    try {
      const node = await this.store.readNode(scope, nodeId);
      if (node.type === 'base') {
        const reducer = this.reducers.get(node.value.reducerVersion);
        const state = reducer.normalize(node.value.state);
        const errors = reducer.validate(state);
        if (errors.length) throw new Error('Invalid BaseSnapshot: ' + errors.join('; '));
        const hash = await canonicalHash(state);
        if (hash !== node.value.stateHash) throw new Error('BaseSnapshot state hash mismatch: ' + nodeId);
        return { nodeId, stateHash: hash, state };
      }

      const parent = await this.materializeInner(scope, node.value.parentNodeId, visiting);
      if (parent.stateHash !== node.value.parentStateHash) throw new Error('Commit parent hash mismatch: ' + nodeId);
      const reducer = this.reducers.get(node.value.reducerVersion);
      const state = reducer.normalize(applyJsonPatch(parent.state, node.value.patch));
      const errors = reducer.validate(state);
      if (errors.length) throw new Error('Invalid StateCommit result: ' + errors.join('; '));
      const hash = await canonicalHash(state);
      if (hash !== node.value.resultStateHash) throw new Error('Commit result hash mismatch: ' + nodeId);
      return { nodeId, stateHash: hash, state };
    } finally {
      visiting.delete(nodeId);
    }
  }
}
