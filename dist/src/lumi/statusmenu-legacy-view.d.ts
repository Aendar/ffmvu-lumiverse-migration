import type { FFMVUState } from '../shared/state-schema.js';
import type { GuiIntent } from '../shared/domain/gui-intents.js';
export type LegacyStatusTab = 'overview' | 'attributes' | 'familiars' | 'wardrobe' | 'equipment' | 'items' | 'others' | 'ffstate' | 'variables';
export interface LegacyStatusViewOptions {
    state: FFMVUState;
    activeTab: LegacyStatusTab;
    selectedOwnerId: string;
    mutationDisabled: boolean;
    onTab(tab: LegacyStatusTab): void;
    onOwner(ownerId: string): void;
    variablesSearch: string;
    onVariablesSearch(value: string): void;
    onIntent(intent: GuiIntent): void;
    onUnsupported(action: string): void;
}
export declare function renderLegacyStatusMenu(options: LegacyStatusViewOptions): HTMLElement;
