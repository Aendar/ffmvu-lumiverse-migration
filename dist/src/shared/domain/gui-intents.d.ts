import type { JsonPatchOperation } from '../json-patch.js';
import type { FFMVUState } from '../state-schema.js';
export type GuiOwnerRef = {
    kind: 'player';
} | {
    kind: 'familiar';
    id: string;
};
export type GuiIntent = {
    type: 'outfit.move';
    owner: GuiOwnerRef;
    from: 'Worn' | 'Wardrobe';
    itemKey: string;
} | {
    type: 'inventory.delete';
    owner: GuiOwnerRef;
    itemKey: string;
} | {
    type: 'equipment.equip';
    sourceOwner: GuiOwnerRef;
    targetOwner: GuiOwnerRef;
    itemKey: string;
} | {
    type: 'equipment.unequip';
    owner: GuiOwnerRef;
    equipmentKey: string;
};
export declare function assertGuiIntent(value: unknown): asserts value is GuiIntent;
export declare function applyGuiIntent(input: FFMVUState, intent: GuiIntent): FFMVUState;
export declare function buildGuiIntentPatch(before: FFMVUState, after: FFMVUState): JsonPatchOperation[];
