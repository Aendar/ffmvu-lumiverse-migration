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
export type GuiEditableFields = Record<string, JsonValue>;
export type GuiWorldCalcSection = 'Factions' | 'Locations' | 'Ruins' | 'Events';
export type GuiRealEstateSection = 'Estates' | 'Buildings' | 'Assets';
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
    type: 'skill.update';
    skillKey: string;
    fields: GuiEditableFields;
} | {
    type: 'skill.delete';
    skillKey: string;
} | {
    type: 'talent.update';
    talentKey: string;
    fields: GuiEditableFields;
} | {
    type: 'talent.delete';
    talentKey: string;
} | {
    type: 'worldcalc.update';
    section: GuiWorldCalcSection;
    itemKey: string;
    fields: GuiEditableFields;
} | {
    type: 'worldcalc.delete';
    section: GuiWorldCalcSection;
    itemKey: string;
} | {
    type: 'realestate.update';
    section: GuiRealEstateSection;
    fields: GuiEditableFields;
} | {
    type: 'realestate.clear';
    section: GuiRealEstateSection;
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
/** Generic deterministic deep diff used by both GUI intents and migration preflight. */
export declare function buildStatePatch(before: unknown, after: unknown): JsonPatchOperation[];
export declare function buildGuiIntentPatch(before: FFMVUState, after: FFMVUState): JsonPatchOperation[];
