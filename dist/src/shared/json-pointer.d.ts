export declare function pointerParts(pathValue: string): string[];
export declare function pointerGet(root: unknown, pathValue: string): unknown;
export declare function pointerAdd<T>(root: T, pathValue: string, value: unknown): T;
export declare function pointerRemove<T>(root: T, pathValue: string): T;
export declare function pointerReplace<T>(root: T, pathValue: string, value: unknown): T;
