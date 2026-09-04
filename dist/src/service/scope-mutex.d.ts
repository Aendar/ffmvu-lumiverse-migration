import type { StateScope } from '../persistence/types.js';
export declare class ScopeMutex {
    private readonly tails;
    run<T>(scope: StateScope, job: () => Promise<T>): Promise<T>;
}
