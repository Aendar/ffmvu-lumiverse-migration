import type { JsonStoragePort } from './storage-port.js';
import { checkpointPath } from './paths.js';
import { EVENT_FORMAT_VERSION, type CheckpointRecord, type MaterializedState, type StateScope } from './types.js';
import { isoNow } from './ids.js';

export class CheckpointService {
  constructor(private readonly storage: JsonStoragePort) {}

  async write(scope: StateScope, materialized: MaterializedState, reducerVersion: string): Promise<void> {
    const record: CheckpointRecord = {
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

  async read(scope: StateScope, nodeId: string): Promise<CheckpointRecord | null> {
    return this.storage.getJson(checkpointPath(scope, nodeId));
  }
}
