import { applyGuiIntent } from '../../src/shared/domain/gui-intents.js';
import { createDefaultState } from '../../src/shared/state-defaults.js';
import { StateService } from '../../src/service/state-service.js';
import { MemoryJsonStorage } from '../../src/persistence/storage-port.js';
import { createProjectionRegistry } from '../../src/shared/projection-registry.js';
import { createReducerRegistry } from '../../src/shared/reducer-registry.js';
import { EventStore } from '../../src/persistence/event-store.js';
import { HeadResolver } from '../../src/head-resolver.js';
import { TranscriptAttemptStore, VariantIndexStore } from '../../src/persistence/anchor-store.js';
import { computeRecentChanges } from '../../src/shared/recent-changes.js';
let passed = 0;
function assert(value, message) {
    if (!value)
        throw new Error('ASSERT: ' + message);
    passed += 1;
}
function clothing(name, slot, layer) {
    return { Name: name, Type: 'Clothing', Slot: slot, Layer: layer, Placement: slot, Color: '', Material: '', Appearance: '', Condition: 'good', Arrangement: 'worn' };
}
async function main() {
    const base = createDefaultState();
    base.Mainchar.Outfit.Initialized = true;
    base.Mainchar.Outfit.Worn.cap = clothing('Шапка', 'Head', 'Base');
    base.Mainchar.Outfit.Wardrobe.hat = clothing('Шляпа', 'Head', 'Base');
    const dressed = applyGuiIntent(base, { type: 'outfit.move', owner: { kind: 'player' }, from: 'Wardrobe', itemKey: 'hat' });
    assert(Boolean(dressed.Mainchar.Outfit.Worn.hat) && !dressed.Mainchar.Outfit.Worn.cap, 'Wardrobe -> Worn replaces same Slot+Layer');
    assert(Boolean(dressed.Mainchar.Outfit.Wardrobe.cap), 'displaced worn item returns to Wardrobe');
    const restored = applyGuiIntent(dressed, { type: 'outfit.move', owner: { kind: 'player' }, from: 'Worn', itemKey: 'hat' });
    assert(Boolean(restored.Mainchar.Outfit.Wardrobe.hat) && !restored.Mainchar.Outfit.Worn.hat, 'Worn -> Wardrobe moves item back atomically');
    const gear = createDefaultState();
    gear.Mainchar.Inventory.sword = { Name: 'Меч', Type: 'Weapon', Slot: 'Hand', Qty: 2, StrBonus: 2, WeaponDamage: 3 };
    const equipped = applyGuiIntent(gear, { type: 'equipment.equip', sourceOwner: { kind: 'player' }, targetOwner: { kind: 'player' }, itemKey: 'sword' });
    assert(Boolean(equipped.Mainchar.Equipment.sword) && equipped.Mainchar.Inventory.sword.Qty === 1, 'equip moves one quantity from inventory to equipment');
    assert(equipped.Mainchar.Strength[0] === 7 && equipped.Mainchar.Physical_attack[0] === 19, 'legacy equipment attribute + derived attack recalculation is preserved');
    const unequipped = applyGuiIntent(equipped, { type: 'equipment.unequip', owner: { kind: 'player' }, equipmentKey: 'sword' });
    assert(!unequipped.Mainchar.Equipment.sword && unequipped.Mainchar.Inventory.sword.Qty === 2, 'manual unequip returns item to owner inventory and stacks Qty');
    assert(unequipped.Mainchar.Strength[0] === 5 && unequipped.Mainchar.Physical_attack[0] === 12, 'manual unequip reverses attribute and derived stat bonuses');
    const handLimit = createDefaultState();
    handLimit.Mainchar.Equipment.old1 = { Name: 'Старый 1', Type: 'Weapon', Slot: 'Hand', StrBonus: 1 };
    handLimit.Mainchar.Equipment.old2 = { Name: 'Старый 2', Type: 'Weapon', Slot: 'Hand', StrBonus: 1 };
    handLimit.Mainchar.Strength[0] = 7;
    handLimit.Mainchar.Inventory.new = { Name: 'Новый', Type: 'Weapon', Slot: 'Hand', Qty: 1, StrBonus: 3 };
    const handNext = applyGuiIntent(handLimit, { type: 'equipment.equip', sourceOwner: { kind: 'player' }, targetOwner: { kind: 'player' }, itemKey: 'new' });
    assert(!handNext.Mainchar.Equipment.old1 && Boolean(handNext.Mainchar.Equipment.old2) && Boolean(handNext.Mainchar.Equipment.new), 'Hand limit=2 auto-unequips oldest item');
    assert(Boolean(handNext.Mainchar.Inventory.old1), 'auto-unequipped hand item returns to supplying inventory');
    const accessory = createDefaultState();
    accessory.Mainchar.Equipment.a = { Name: 'A', Type: 'Accessory', Slot: 'Finger' };
    accessory.Mainchar.Equipment.b = { Name: 'B', Type: 'Accessory', Slot: 'Wrist' };
    accessory.Mainchar.Equipment.c = { Name: 'C', Type: 'Accessory', Slot: 'Neck' };
    accessory.Mainchar.Inventory.d = { Name: 'D', Type: 'Accessory', Slot: 'Ankle', Qty: 1 };
    let accessoryRejected = false;
    try {
        applyGuiIntent(accessory, { type: 'equipment.equip', sourceOwner: { kind: 'player' }, targetOwner: { kind: 'player' }, itemKey: 'd' });
    }
    catch (error) {
        accessoryRejected = String(error).includes('GUI_ACCESSORY_LIMIT_REACHED');
    }
    assert(accessoryRejected, 'legacy global accessory cap of 3 is enforced');
    const cross = createDefaultState();
    cross.Familiar.evelyn = {
        Name: ['Эвелин', 'Name'],
        Equipment: { old: { Name: 'Старый клинок', Type: 'Weapon', Slot: 'Hand' }, old2: { Name: 'Кинжал', Type: 'Weapon', Slot: 'Hand' } },
        Inventory: {},
    };
    cross.Mainchar.Inventory.axe = { Name: 'Топор', Type: 'Weapon', Slot: 'Hand', Qty: 1 };
    const crossNext = applyGuiIntent(cross, { type: 'equipment.equip', sourceOwner: { kind: 'player' }, targetOwner: { kind: 'familiar', id: 'evelyn' }, itemKey: 'axe' });
    assert(Boolean(crossNext.Mainchar.Inventory.old), 'legacy cross-character auto-unequip returns displaced target gear to source inventory');
    const deleted = applyGuiIntent(crossNext, { type: 'inventory.delete', owner: { kind: 'player' }, itemKey: 'old' });
    assert(!deleted.Mainchar.Inventory.old, 'inventory delete removes exact dictionary key');
    const storage = new MemoryJsonStorage();
    const state = new StateService(storage, createReducerRegistry(), createProjectionRegistry());
    const scope = { userId: 'u', chatId: 'gui' };
    const genesis = await state.createGenesis(scope, { state: gear });
    const guiCommit = await state.commitGuiIntent(scope, {
        expectedParentNodeId: genesis.nodeId,
        expectedParentStateHash: genesis.stateHash,
        intent: { type: 'equipment.equip', sourceOwner: { kind: 'player' }, targetOwner: { kind: 'player' }, itemKey: 'sword' },
        anchor: { lineageAnchorId: 'root' },
        requestId: 'gui-1',
    });
    const commit = await new EventStore(storage).readCommit(scope, guiCommit.nodeId);
    assert(commit.kind === 'gui' && commit.anchor.lineageAnchorId === 'root', 'StateService writes GUI mutations as lineage-scoped gui commits');
    const root = await state.anchors.readRoot(scope);
    assert(Boolean(root), 'root anchor exists');
    root.tipNodeId = guiCommit.nodeId;
    await state.anchors.putRoot(root);
    const resolver = new HeadResolver(state.store, state.materializer, state.anchors, new TranscriptAttemptStore(storage), new VariantIndexStore(storage));
    const resolved = await resolver.resolve(scope, genesis.nodeId, []);
    assert(resolved.health === 'ok' && resolved.nodeId === guiCommit.nodeId, 'GUI commit becomes semantic head after lineage anchor binding');
    const offscreen = computeRecentChanges(genesis.state, guiCommit.state);
    assert(Boolean(offscreen?.Inventory?.player) && Boolean(offscreen?.Equipment?.player) && offscreen?.Stats?.Strength?.to === 7, 'GUI commit automatically surfaces as net RecentChanges');
    let staleRejected = false;
    try {
        await state.commitGuiIntent(scope, {
            expectedParentNodeId: genesis.nodeId,
            expectedParentStateHash: 'stale-hash',
            intent: { type: 'inventory.delete', owner: { kind: 'player' }, itemKey: 'sword' },
            anchor: { lineageAnchorId: 'root' },
            requestId: 'gui-stale',
        });
    }
    catch (error) {
        staleRejected = String(error).includes('GUI_COMMIT_CONFLICT');
    }
    assert(staleRejected, 'stale GUI state hash fails closed');
    console.log(`phase8 GUI intent tests passed: ${passed}`);
}
void main();
//# sourceMappingURL=phase8.js.map