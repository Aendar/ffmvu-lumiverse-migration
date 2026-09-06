import type { JsonPatchOperation } from '../json-patch.js';
import type { FFMVUState, JsonValue } from '../state-schema.js';
export type GuiOwnerRef = {
    kind: 'player';
} | {
    kind: 'familiar';
    id: string;
};
export type GuiPath = string[];
export type GuiImageRef = {
    kind: 'player-avatar';
} | {
    kind: 'familiar-avatar';
    id: string;
} | {
    kind: 'world-map';
};
export type GuiFamiliarFlag = 'Is_present' | 'Is_in_battle_team';
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
} | {
    type: 'image.set';
    target: GuiImageRef;
    value: string;
} | {
    type: 'familiar.flag.set';
    familiarId: string;
    field: GuiFamiliarFlag;
    value: boolean;
} | {
    type: 'variable.set';
    path: GuiPath;
    value: JsonValue;
} | {
    type: 'variable.rename';
    path: GuiPath;
    newKey: string;
} | {
    type: 'variable.delete';
    path: GuiPath;
} | {
    type: 'variable.add';
    parentPath: GuiPath;
    key: string;
    value: JsonValue;
};
export declare function assertGuiIntent(value: unknown): asserts value is GuiIntent;
export declare function applyGuiIntent(input: FFMVUState, intent: GuiIntent): FFMVUState;
export declare function buildGuiIntentPatch(before: FFMVUState, after: FFMVUState): JsonPatchOperation[];
