export type JsonPatchOperation = {
    op: 'add' | 'replace' | 'test';
    path: string;
    value: unknown;
} | {
    op: 'remove';
    path: string;
} | {
    op: 'copy' | 'move';
    path: string;
    from: string;
};
export interface PatchResourceLimits {
    maxPatchBytes: number;
    maxPatchOperations: number;
    maxPointerLength: number;
    maxPointerDepth: number;
    maxSingleValueBytes: number;
}
export declare const DEFAULT_PATCH_RESOURCE_LIMITS: PatchResourceLimits;
export declare function assertPatchResourceLimits(operations: readonly JsonPatchOperation[], limits?: PatchResourceLimits): void;
export declare function assertModelOperationPolicy(operations: readonly JsonPatchOperation[]): void;
export declare function canonicalizeTupleOperation(state: unknown, operation: JsonPatchOperation): JsonPatchOperation;
export declare function repairLabeledTuples(current: unknown, baseline: unknown): unknown;
export declare function applyJsonPatch<T>(input: T, operations: readonly JsonPatchOperation[]): T;
