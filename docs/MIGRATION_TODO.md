# Migration TODO / gameplay readiness

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
- [x] Portable snapshot export/import and exact projection seed.
- [x] Legacy stat_data import.
- [x] GameStart v1.4 backend formulas.
- [x] Assistant-only in-world narrative timestamps.
- [x] Net RecentChanges for off-screen state mutations.
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
- [x] Patch MinimizeCombatLog $0 -> - [ ] Patch MinimizeCombatLog $0 -> $& and import. and import.
- [x] Do NOT import legacy GameStartMenu.
- [x] Do NOT import legacy StatusMenu.
- [ ] Smoke-test rendering/order on real Lumiverse messages.

## DONE in v0.11 — composer UI + Tier-1 legacy import plumbing

- [x] StatusMenu entry moved from Drawer to the native chat action row.
- [x] Same StatusMenu design mounted above the composer with a fixed-height scroll container.
- [x] Tier-1 legacy import RPC wired to StateService.importLegacyState.
- [x] Legacy import UI accepts stat_data + exact ff_mvu_prompt_view + snapshot metadata wrapper.
- [ ] Live-test composer mount on the user's current Lumiverse build.
- [ ] Import the user's real Turn 109 save and verify first post-import MODEL_STATE continuity.

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

- [ ] Live-test v0.11 composer-mounted StatusMenu against a real migrated state.
- [ ] Add typed writes for currently read-only legacy controls if still wanted:
  - Skills / Talents;
  - Quests;
  - Buffs / Ailments;
  - Familiar presence / battle-team toggles;
  - image/map edits;
  - selected World_Calc edits.
- [ ] Decide which old StatusMenu editing features are intentionally dropped rather than ported.
- [ ] Real legacy-save import test from the user's current FF+MVU campaign.
- [ ] Portable snapshot export -> fresh-chat import -> next-generation hash continuity live test.
- [ ] Multi-turn soak test mixing model commits, GUI commits, regenerate, swipe, and Continue.
- [ ] Recovery UX for gui_committed_unbound / unreconciled cases.
- [ ] Final preset/profile cutover and disable legacy FF+MVU scripts.
- [ ] Backup/export checklist before retiring the SillyTavern stack.

## Readiness rule

Short gameplay testing: YES.

Permanent campaign cutover: after native UI + regex smoke tests + real legacy import/snapshot roundtrip + mixed-branch soak test are green.
