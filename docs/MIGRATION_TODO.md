# Migration TODO / gameplay readiness

## Product decisions locked

See `docs/PRODUCT_DECISIONS.md`.

- [x] Preserve original FF+MVU UI/interaction language during cutover; redesign later.
- [x] Assistant-only in-world narrative timestamps; never wall-clock timestamps and never user-message timestamps.
- [x] NET off-screen Outfit/GUI changes for the next model turn; reverted intermediate changes collapse to no change.
- [x] Portable snapshot backend preserves authoritative state + exact next projection.
- [ ] Add Save Snapshot action to initialized StatusMenu.
- [ ] Add Import Snapshot choice to uninitialized GameStart surface.
- [ ] Live-test fresh-chat snapshot import as the anti-context-degradation workflow.


## DONE — core correctness

- [x] Pure state normalization/validation and legacy tuple semantics.
- [x] EventStore / Materializer / StateService journal.
- [x] Transcript-derived semantic head, VariantId/Anchor/Attempt evidence.
- [x] Normal generation P1 + optional C2 transaction.
- [x] One-shot pre-consumption projection continuity across the next turn.
- [x] Regenerate sibling-branch behavior.
- [x] Existing-swipe navigation without state transaction.
- [x] No-patch projection-refresh behavior.
- [x] Durable stopped-output evidence and fail-closed unresolved continuation.
- [x] Stateful Continue append semantics.
- [x] Raw/stored JSONPatch evidence lock.
- [x] Portable snapshot export/import core and exact projection seed (UI exposure still pending).
- [x] Legacy stat_data import.
- [x] GameStart v1.4 backend formulas.
- [x] Assistant-only in-world narrative timestamps (World.Date/World.Time; no user/wall-clock timestamps).
- [x] Net RecentChanges for off-screen state mutations, including Outfit revert-collapse semantics.
- [x] Branch-safe typed GUI intents for Outfit / Inventory / Equipment.
- [x] Explicit stale-head and committed-unbound diagnostics.

## DONE in v0.10 — playable UI foundation

- [x] Native StatusMenu UI (v0.10 Drawer foundation; v0.11 composer-mounted toggle/panel).
- [x] Active-chat / active-semantic-branch state loading.
- [x] Overview: HP/MP/ST, World, character, avatar, quests.
- [x] HPH overview from Narrative.Scene.HPH.player.
- [x] Attributes and combat stats.
- [x] Familiar overview.
- [x] Native persistent Wardrobe for player + Familiars.
- [x] Equipment equip/unequip for player + Familiars.
- [x] Inventory delete and equip target selection.
- [x] Others read view (Talents, Buffs, Ailments, Real Estate, World_Calc).
- [x] Searchable recursive FF State view.
- [x] Native New Game form.
- [x] Canonical GameStart budget: five core stats + separate Charisma.
- [x] Colorize palette moved from ST Custom CSS into extension-owned host CSS.
- [x] Diagnostics collapsed instead of occupying the gameplay panel.

## REGEX cutover

- [x] Portability of all supplied legacy regexes reviewed.
- [x] Colorize CSS dependency absorbed by v0.10.
- [x] Import SFX · Warm Accent.
- [x] Import HideCombatCalc.
- [x] Import HideStoryAnalysis.
- [x] Import Hide Location.
- [x] Import HideUpdateVar.
- [x] Import Colorize.
- [x] Patch MinimizeCombatLog `$0 -> - [x] Patch MinimizeCombatLog `$0 -> - [x] Patch MinimizeCombatLog $0 -> - [x] Patch MinimizeCombatLog $0 -> - [ ] Patch MinimizeCombatLog $0 -> $& and import. and import. and import.` and import.` and import.
- [x] Do NOT import legacy GameStartMenu.
- [x] Do NOT import legacy StatusMenu.
- [ ] Smoke-test rendering/order on real Lumiverse messages.

## DONE in v0.11 — composer UI + Tier-1 legacy import plumbing

- [x] StatusMenu entry moved from Drawer to the native chat action row.
- [x] Same StatusMenu design mounted above the composer with a fixed-height scroll container.
- [x] Tier-1 legacy import RPC wired to StateService.importLegacyState.
- [x] Legacy import UI accepts stat_data + exact ff_mvu_prompt_view + snapshot metadata wrapper.
- [x] Live-test composer mount on the user's current Lumiverse build.
- [x] Import the user's real Turn 109 legacy save into Lumiverse.
- [ ] Verify first post-import MODEL_STATE continuity on a real generation.

## DONE in v0.12 — canonical StatusMenu parity pass

- [x] Frozen StatusMenu v2.8.1 DOM/CSS is the canonical initialized-game UI source.
- [x] Original palette/text colors are isolated from Lumiverse host theme through Shadow DOM.
- [x] Original tabs/layout/cards/templates are retained instead of approximate native replacements.
- [x] Supported Wardrobe / Inventory / Equipment controls are rebound to typed StateService intents.
- [x] Top-edge drag resize with one persisted height across tabs, hide/show, and reload.
- [x] Unsupported legacy write controls remain visible but fail visibly instead of bypassing StateService.
- [ ] Live visual smoke-test all canonical tabs in Lumiverse:
  - [x] Overview on migrated Turn 109 state.
  - [ ] Attributes.
  - [ ] Familiars.
  - [ ] Wardrobe.
  - [ ] Equipments.
  - [ ] Items.
  - [ ] Others.
  - [ ] FF State.
- [ ] Add typed intents for preserved legacy controls still marked unsupported.

## DONE in v0.12.3 — overlay composer geometry

- [x] StatusMenu no longer participates in Lumiverse InputArea layout.
- [x] Composer stays at normal size while StatusMenu floats centered above it and may cover transcript content.
- [x] Compact 0.78 scale and persisted drag height are retained.
- [ ] Live visual confirmation of overlay geometry on the user's build.

## DONE in v0.12.2 — compact composer scale

- [x] Compact 0.78 host-scale for the canonical StatusMenu without redesigning its internal DOM/CSS.
- [x] Compensated virtual width/height keeps the scaled StatusMenu filling the composer viewport.
- [ ] Live visual check of text readability and pointer/scroll behavior at 0.78 scale.

## DONE in v0.13 — Variables editor

- [x] Product semantics locked: human-friendly editable tree, not raw stat_data replacement.
- [x] Add path-level typed GUI intents: variable.set / variable.rename / variable.delete / variable.add.
- [x] Protect root structural keys; every resulting state still passes reducer normalize/validate before commit.
- [x] Add canonical StatusMenu `Variables` tab with recursive search, primitive editing, rename/delete/add.
- [x] Labeled tuples edit their value slot without destroying the label.
- [x] Add sibling/template-assisted creation for object records plus simple empty object/text/number/boolean presets.
- [x] Variables edits use the same exact-head/hash branch-safe GUI commit path as Wardrobe/Inventory/Equipment.
- [ ] Live-test rename currency key, edit GM Note text, delete/add a disposable record, and verify next-turn state continuity.

## DONE in v0.13.1 — Variables UX/safety hotfix

- [x] Variables edit/rename modals are centered inside the StatusMenu overlay instead of viewport-positioned/clipped.
- [x] Fixed schema fields expose value editing only.
- [x] Rename/Delete/Add are restricted to known dynamic collections.
- [x] State-layer rejects structural key mutation even if a raw GUI intent is sent manually.
- [ ] Live visual confirmation of modal centering and simplified controls on the user's build.

## Safe to start now — short gameplay tests

Use disposable/short chats first:
- [ ] New Game -> first normal turn.
- [ ] 5–10 normal turns with state updates.
- [ ] Regenerate and swipe between variants.
- [ ] Continue on a normal response.
- [ ] Wardrobe change between model turns -> verify RecentChanges on next turn.
- [ ] Inventory/equipment mutation -> verify model sees net change.
- [ ] Familiar equipment/wardrobe interaction.
- [ ] HPH state appears correctly when present.
- [ ] Colorize + SFX visual pass.
- [ ] No visible UpdateVariable / StoryAnalysis / combat calculation blocks after regex import.

## Remaining before a permanent long campaign / production cutover

- [x] Live-test canonical StatusMenu shell + Overview against the migrated Turn 109 state.
- [ ] Add typed writes for currently read-only legacy controls if still wanted:
  - Skills / Talents;
  - Quests;
  - Buffs / Ailments;
  - Familiar presence / battle-team toggles;
  - image/map edits;
  - selected World_Calc edits.
- [ ] Decide which old StatusMenu editing features are intentionally dropped rather than ported.
- [x] Real legacy-save import test from the user's current FF+MVU Turn 109 campaign.
- [ ] Portable snapshot export -> fresh-chat import -> next-generation hash continuity live test.
- [ ] Multi-turn soak test mixing model commits, GUI commits, regenerate, swipe, and Continue.
- [ ] Recovery UX for gui_committed_unbound / unreconciled cases.
- [ ] Final preset/profile cutover and disable legacy FF+MVU scripts.
- [ ] Backup/export checklist before retiring the SillyTavern stack.

## Readiness rule

Short gameplay testing: YES.

Permanent campaign cutover: after native UI + regex smoke tests + real legacy import/snapshot roundtrip + mixed-branch soak test are green.
