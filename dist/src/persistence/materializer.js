import { applyJsonPatch } from '../shared/json-patch.js';
import { canonicalHash } from '../shared/hashing.js';
export class Materializer {
    store;
    reducers;
    constructor(store, reducers) {
        this.store = store;
        this.reducers = reducers;
    }
    async materialize(scope, nodeId, cache) {
        const visiting = new Set();
        return this.materializeInner(scope, nodeId, visiting, cache);
    }
    async materializeInner(scope, nodeId, visiting, cache) {
        const cached = cache?.get(nodeId);
        if (cached)
            return cached;
        if (visiting.has(nodeId))
            throw new Error('Semantic DAG cycle detected at ' + nodeId);
        visiting.add(nodeId);
        try {
            const node = await this.store.readNode(scope, nodeId);
            if (node.type === 'base') {
                const reducer = this.reducers.get(node.value.reducerVersion);
                const state = reducer.normalize(node.value.state);
                const errors = reducer.validate(state);
                if (errors.length)
                    throw new Error('Invalid BaseSnapshot: ' + errors.join('; '));
                const hash = await canonicalHash(state);
                if (hash !== node.value.stateHash)
                    throw new Error('BaseSnapshot state hash mismatch: ' + nodeId);
                const result = { nodeId, stateHash: hash, state };
                cache?.set(nodeId, result);
                return result;
            }
            const parent = await this.materializeInner(scope, node.value.parentNodeId, visiting, cache);
            if (parent.stateHash !== node.value.parentStateHash)
                throw new Error('Commit parent hash mismatch: ' + nodeId);
            const reducer = this.reducers.get(node.value.reducerVersion);
            const state = reducer.normalize(applyJsonPatch(parent.state, node.value.patch));
            const errors = reducer.validate(state);
            if (errors.length)
                throw new Error('Invalid StateCommit result: ' + errors.join('; '));
            const hash = await canonicalHash(state);
            if (hash !== node.value.resultStateHash)
                throw new Error('Commit result hash mismatch: ' + nodeId);
            const result = { nodeId, stateHash: hash, state };
            cache?.set(nodeId, result);
            return result;
        }
        finally {
            visiting.delete(nodeId);
        }
    }
}
//# sourceMappingURL=materializer.js.map