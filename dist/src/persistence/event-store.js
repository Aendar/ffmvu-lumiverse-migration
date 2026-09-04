import { canonicalHash } from '../shared/hashing.js';
import { basePath, commitPath, revisionPath, scopeRoot } from './paths.js';
import { ImmutableStore } from './immutable-store.js';
export class EventStore {
    storage;
    immutable;
    constructor(storage) {
        this.storage = storage;
        this.immutable = new ImmutableStore(storage);
    }
    writeBase(base) {
        return this.immutable.put(basePath(base.scope, base.id), base);
    }
    writeCommit(commit) {
        return this.immutable.put(commitPath(commit.scope, commit.id), commit);
    }
    writeRevision(revision) {
        return this.immutable.put(revisionPath(revision.scope, revision.revisionId), revision);
    }
    readBase(scope, id) {
        return this.immutable.require(basePath(scope, id));
    }
    readCommit(scope, id) {
        return this.immutable.require(commitPath(scope, id));
    }
    async readNode(scope, id) {
        const bp = basePath(scope, id);
        if (await this.storage.exists(bp))
            return { type: 'base', value: await this.immutable.require(bp) };
        const cp = commitPath(scope, id);
        if (await this.storage.exists(cp))
            return { type: 'commit', value: await this.immutable.require(cp) };
        throw new Error('Missing semantic node: ' + id);
    }
    async traceDescendantPath(scope, ancestorNodeId, descendantNodeId) {
        if (ancestorNodeId === descendantNodeId)
            return [];
        const reverse = [];
        let cursor = descendantNodeId;
        const seen = new Set();
        while (cursor !== ancestorNodeId) {
            if (seen.has(cursor))
                throw new Error('Semantic DAG cycle while tracing ' + descendantNodeId);
            seen.add(cursor);
            const node = await this.readNode(scope, cursor);
            if (node.type === 'base')
                return null;
            reverse.push(node.value);
            cursor = node.value.parentNodeId;
        }
        return reverse.reverse();
    }
    async isNodeCommitted(scope, nodeId) {
        const prefix = `${scopeRoot(scope)}/store-revisions/`;
        const paths = (await this.storage.list(prefix)).filter(path => path.endsWith('.json'));
        for (const path of paths) {
            const revision = await this.storage.getJson(path);
            if (!revision || revision.scope.chatId !== scope.chatId || revision.scope.userId !== scope.userId)
                continue;
            if (revision.committedArtifacts.some(item => item.id === nodeId && (item.type === 'base' || item.type === 'commit')))
                return true;
        }
        return false;
    }
    async resolveStoreHead(scope) {
        const prefix = `${scopeRoot(scope)}/store-revisions/`;
        const paths = (await this.storage.list(prefix)).filter(path => path.endsWith('.json'));
        if (!paths.length)
            return { status: 'empty' };
        const revisions = new Map();
        for (const path of paths) {
            const value = await this.storage.getJson(path);
            if (!value || value.scope.chatId !== scope.chatId || value.scope.userId !== scope.userId) {
                return { status: 'corrupt', reason: 'Revision scope mismatch or unreadable: ' + path };
            }
            const hash = await canonicalHash(value);
            if (revisions.has(value.revisionId))
                return { status: 'corrupt', reason: 'Duplicate revisionId: ' + value.revisionId };
            revisions.set(value.revisionId, { value, hash });
        }
        const referenced = new Set();
        for (const { value } of revisions.values()) {
            if (!value.previousStoreRevisionId) {
                if (value.previousStoreRevisionHash !== null)
                    return { status: 'corrupt', reason: 'Root revision has predecessor hash' };
                continue;
            }
            const previous = revisions.get(value.previousStoreRevisionId);
            if (!previous)
                return { status: 'corrupt', reason: 'Missing predecessor revision: ' + value.previousStoreRevisionId };
            if (value.previousStoreRevisionHash !== previous.hash)
                return { status: 'corrupt', reason: 'Predecessor hash mismatch: ' + value.revisionId };
            referenced.add(value.previousStoreRevisionId);
        }
        const heads = [...revisions.values()].filter(item => !referenced.has(item.value.revisionId));
        if (heads.length !== 1) {
            return { status: 'ambiguous', candidates: heads.map(item => item.value.revisionId).sort() };
        }
        return { status: 'ok', head: heads[0].value, headHash: heads[0].hash };
    }
}
//# sourceMappingURL=event-store.js.map