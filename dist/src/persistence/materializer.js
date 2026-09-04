import { applyJsonPatch } from '../shared/json-patch.js';
import { canonicalHash } from '../shared/hashing.js';
export class Materializer {
    store;
    reducers;
    constructor(store, reducers) {
        this.store = store;
        this.reducers = reducers;
    }
    async materialize(scope, nodeId) {
        const visiting = new Set();
        const result = await this.materializeInner(scope, nodeId, visiting);
        return result;
    }
    async materializeInner(scope, nodeId, visiting) {
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
                return { nodeId, stateHash: hash, state };
            }
            const parent = await this.materializeInner(scope, node.value.parentNodeId, visiting);
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
            return { nodeId, stateHash: hash, state };
        }
        finally {
            visiting.delete(nodeId);
        }
    }
}
//# sourceMappingURL=materializer.js.map