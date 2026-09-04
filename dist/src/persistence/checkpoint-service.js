import { checkpointPath } from './paths.js';
import { EVENT_FORMAT_VERSION } from './types.js';
import { isoNow } from './ids.js';
export class CheckpointService {
    storage;
    constructor(storage) {
        this.storage = storage;
    }
    async write(scope, materialized, reducerVersion) {
        const record = {
            eventFormatVersion: EVENT_FORMAT_VERSION,
            scope,
            reducerVersion,
            nodeId: materialized.nodeId,
            stateHash: materialized.stateHash,
            state: materialized.state,
            createdAt: isoNow(),
        };
        await this.storage.setJson(checkpointPath(scope, materialized.nodeId), record);
    }
    async read(scope, nodeId) {
        return this.storage.getJson(checkpointPath(scope, nodeId));
    }
}
//# sourceMappingURL=checkpoint-service.js.map