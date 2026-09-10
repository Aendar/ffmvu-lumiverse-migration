import type { FFMVUState } from '../../state-schema.js';
import type { GuiIntent } from '../gui-intents.js';
type EquipmentIntent = Extract<GuiIntent, {
    type: 'equipment.equip' | 'equipment.unequip';
}>;
export declare function applyEquipmentIntent(inputState: FFMVUState, intent: EquipmentIntent): FFMVUState;
export {};
