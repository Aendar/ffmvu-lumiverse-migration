export class ScopeMutex {
    tails = new Map();
    async run(scope, job) {
        const key = `${scope.userId}\u0000${scope.chatId}`;
        const previous = this.tails.get(key) ?? Promise.resolve();
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const tail = previous.then(() => gate);
        this.tails.set(key, tail);
        await previous;
        try {
            return await job();
        }
        finally {
            release();
            if (this.tails.get(key) === tail)
                this.tails.delete(key);
        }
    }
}
//# sourceMappingURL=scope-mutex.js.map