import type { ReducerRegistry } from '../shared/reducer-registry.js';
import type { EventStore } from './event-store.js';
import type { MaterializedState, StateScope } from './types.js';
export declare class Materializer {
    private readonly store;
    private readonly reducers;
    constructor(store: EventStore, reducers: ReducerRegistry);
    materialize(scope: StateScope, nodeId: string): Promise<MaterializedState>;
    private materializeInner;
}
