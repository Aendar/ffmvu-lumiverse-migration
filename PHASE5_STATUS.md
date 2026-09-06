# Phase 5 / Model Commit Pipeline Status — v0.8.0

Status: **LIVE NORMAL-GENERATION, REGENERATE REPLACEMENT-BRANCH, RIGHT-EDGE SWIPE GENERATION, AND EXISTING-SWIPE NAVIGATION PARITY PROVEN.**

## Parity order

Frozen authorization -> final JSONPatch -> model P1 -> Vnext from P1 before consumption -> optional system C2 -> one ChatStoreRevision -> immutable TranscriptAttempt -> rebuildable AnchorRecord.

- P1 receives direct self-binding to Vnext.
- Projection consumption creates C2 with a one-shot binding back to P1/Vnext.
- Successful no_patch from a non-direct binding creates an empty-patch direct-self projection-refresh.
- Model path authorization is derived only from the projection delivered to that attempt.
- Cold omitted existing entities are not writable.
- New NPC ids allocate from frozen NextNpcId and must advance NextNpcId atomically.
- Parent compatibility is rechecked against the pre-assistant transcript before commit; no silent rebase.
- MODEL_STATE transport uses the same canonical serializer that defines promptViewHash.
- When GENERATION_ENDED.content is available, its JSONPatch must be semantically identical to the canonical host-stored JSONPatch; mismatch becomes unreconciled/output_evidence_mismatch.
- GENERATION_ENDED finalization is claim-once/idempotent per generationId.
- Materialized-tip cache failure after a durable ChatStoreRevision is non-fatal; the journal remains authoritative.
- Continue append semantics are live-proven and implemented statefully in v0.6.0.

## Live parity evidence

### Turn 1
- `commit_complete`
- P1 + C2 committed in one transaction.
- `finalNodeId === systemCommitId`.
- Exact 17-operation patch is stored under `fixtures/live-v0.5-golden/`.

### Turn 2
- Same chat, ordinary next generation.
- `deliveredPromptViewHash = cc9940ef37cd95226607a00b1ff7578c69b1ed3075591d20f99156a2f023c253`.
- Turn 1 `nextPromptViewHash` is exactly the same hash.
- Therefore the C2 one-shot projection binding survived head resolution/restart and delivered the exact pre-consumption P1/Vnext projection to the next generation.
- Turn 2 committed one direct model node with `systemCommitId = null`, as expected because no backend consumption patch was required.

This closes live parity for the basic normal-generation chain:
`generation -> P1 -> optional C2 -> next-generation projection restore -> next model commit`.

### Regenerate sibling branch
- Regenerate of the second assistant turn produced a new `variantId`, `messageId`, and model commit.
- Its `deliveredPromptViewHash` was exactly `cc9940ef37cd95226607a00b1ff7578c69b1ed3075591d20f99156a2f023c253`, the Turn 1 / C2 Vnext hash.
- It did **not** receive the original P2 projection `de5fe2007e433f7e0cf149ff314aafda24473887c4bbf2c157a953f1bf81e179`.
- Therefore regenerate is live-proven to create a sibling semantic branch from the state before the regenerated assistant message, not a child of the discarded P2.

The first manual "swipe right" at the end of the swipe list triggered a new model generation, producing another sibling commit from the same pre-message projection. That is branch-generation evidence, not navigation-only evidence.

v0.6.0 now publishes `phase: swipe_navigated` for a true existing-swipe navigation event, including `variantId`, `headNodeId`, `headStateHash`, `headHealth`, and `noStateTransaction: true`. This makes navigation-only head changes directly observable without requiring another generation.

### Existing-swipe navigation
- v0.6.0 live navigation from swipe 0 -> 1 selected `variant_dbed...` / `node_f2a...` with `headHealth = ok` and `noStateTransaction = true`.
- Navigation back 1 -> 0 selected `variant_d9f...` / `node_96cc...` with the same guarantees.
- No generation/commit identifiers were created by navigation.

### Regenerate vs swipe topology
- Live evidence shows Regenerate replaced the assistant host message: original P2 used `messageId 4c226...`; regenerated P2b used `messageId 4381...`.
- Later swipes live inside the regenerated replacement message `4381...`.
- Therefore semantic siblings can span different host message identities. A semantic sibling is not necessarily a UI swipe sibling.
- The replaced original P2 branch remains durable in the semantic DAG even though the current Lumi swipe UI does not expose a route back to it in this observation.
- See `docs/LUMIVERSE_TRANSCRIPT_TOPOLOGY.md`.

### Durable stopped-output probe
- v0.5.1 live probe proved that Lumiverse preserves a partial assistant output after `GENERATION_STOPPED`.
- The captured partial contained an unterminated `<JSONPatch>` and therefore demonstrates why partial stream output must never be state-committed.
- v0.6.0 records a durable stopped variant as immutable `TranscriptAttempt.status="stopped"` + `AnchorRecord.status="stopped"`, with `modelCommitId=null` and no `ChatStoreRevision`.
- Exact target `messageId` and `targetSwipeId` are carried from `GENERATION_STARTED`; if identity cannot be proven, no stopped/no_patch evidence is fabricated.
- An active stopped variant resolves as `stopped_uncommitted` and blocks normal stateful continuation until regenerate/delete/repair.

### Live v0.6.0 stopped reconciliation proof
- `stopped_durable` recorded the saved assistant partial as `TranscriptAttempt.status="stopped"`.
- `rawPartialHash === storedMessageTextHash` and `storedMatchesStoppedPayload = true`.
- `modelCommitId = null`, `transactionId = null`, and `noStateCommit = true`.
- A subsequent normal stateful generation in the same chat was blocked with `stopped_uncommitted: durable stopped attempt is unresolved`.
- Therefore STOP persistence + fail-closed continuation blocking are live-proven.

### v0.6.0 no-patch live probe
- Adds a one-shot diagnostic control that freezes `diagnosticNoPatchProbe=true` into the next AttemptContext.
- The interceptor appends a same-priority system override asking the model to emit ordinary prose but no `UpdateVariable/JSONPatch`.
- The output is **not** stripped or rewritten after generation; raw/stored evidence and the ordinary finalization path remain unchanged.
- Final runtime status echoes `diagnosticNoPatchProbe=true` so the live result is attributable to the probe.
- Intended live target: run from a non-direct/one-shot projection binding and verify `status=no_patch` plus backend `projection-refresh`.

### Live v0.6.0 no-patch projection-refresh proof
- Turn 1 ended on consumption node `node_44465...` with `nextPromptViewHash = edb68edf...`.
- The diagnostic no-patch turn received exactly that hash: `deliveredPromptViewHash = edb68edf...`.
- It finalized as `status = no_patch`, `modelCommitId = null`.
- Exactly one system node `node_879c...` was committed and became `finalNodeId`; this is the empty `projection-refresh`.
- `finalStateHash` stayed exactly `2306d9...`, proving no semantic state mutation.
- `nextPromptViewHash` changed to `a8c7e478...`, proving the projection binding was refreshed from one-shot/pre-consumption delivery to direct-self/post-consumption projection.
- `diagnosticNoPatchProbe = true` confirms the intended live probe was active.
- Therefore no-patch + projection-refresh semantics are live-proven.

### Live P0-U in-flight extension reload proof
- Extension backend was reloaded while a stateful generation was in flight.
- Lumi durably preserved the resulting assistant output, while the reloaded bridge returned to `phase=idle` with no in-memory AttemptContext.
- A subsequent user message was saved to transcript, but Context Handler blocked the provider call with `unreconciled: variant index missing for b144d52e...`.
- This proves the v2.4 safe rule: lost AttemptContext is not reconstructed from current head/cache; saved assistant output without proven finalize evidence is not synthesized as `no_patch`.
- Persistent PendingAttempt remains an optional future optimization, not a v1 correctness requirement.

### v0.6.0 P0-C Continue spike
- Stateful Continue remains blocked by default.
- A one-shot `Arm Continue probe` control allows exactly one native Continue through while still writing **no FFMVU state transaction**.
- The probe freezes the current lawful semantic tip/projection and the active assistant message/swipe/VariantId/full stored text before provider dispatch.
- On completion it reports whether Lumi kept the same `messageId`, same swipe, preserved the old full text as a prefix, and whether `GENERATION_ENDED.content` equals the exact appended suffix.
- It also reports pre/post message counts and swipe counts, target IDs from generation lifecycle, hashes, and whether the raw segment contains UpdateVariable/JSONPatch.
- The probed transcript is intentionally left unreconciled after observation; use a disposable chat.

### Live P0-C Continue result
- Lumi kept the same host `messageId`, same active swipe, same message count, and same swipe count.
- The post-Continue stored text preserved the entire pre-Continue text as an exact prefix.
- `GENERATION_ENDED.content` equaled the **full post-Continue stored message**, not the appended suffix.
- Therefore the generated segment is derived deterministically as `postStoredText.slice(preStoredText.length)`; raw/full equality plus frozen-prefix equality proves the boundary even though the old diagnostic `segmentProvable` flag was false.
- Exact live status is stored in `fixtures/live-v0.5-golden/continue-v0.5.4-probe-status.json`.

### v0.6.0 stateful Continue
- Native Continue no longer requires a diagnostic arm.
- Continue preserves the existing `messageId`, swipe coordinate, and stable `VariantId`; each append creates a new immutable `TranscriptAttempt`.
- Patch extraction ignores machine blocks completed before the frozen append boundary and selects only a JSONPatch that became complete after that boundary.
- A JSONPatch may begin before the append boundary and finish inside the Continue suffix; this is covered by unit tests and supports recovery of a truncated machine block.
- `rawGenerationHash` for Continue records the derived appended segment, while `storedMessageTextHash` records the full post-Continue variant.
- Continue from a durable stopped attempt is explicitly linked with `resolvesAttemptId`; a failed_patch is append-recoverable only when its stored text ends with an unclosed JSONPatch envelope.
- Same StateService transaction path is reused for committed/no_patch/P1/C2/projection-refresh semantics.
- Continue is rejected if message identity, swipe identity, prefix, transcript shape, VariantIndex, Anchor, or frozen base evidence changes.

Lifecycle parity work is now sufficient for migration implementation. Remaining work is legacy import/GameStart, gameplay/GUI intents, native StatusMenu, and production cutover hardening.


# Phase 6 — User-facing migration foundation (v0.7.0)

- Portable snapshot format: `FFMVU-Portable-Snapshot-v1`.
- Export is taken from a committed semantic node, not physical StoreRevision chronology.
- Snapshot stores full authoritative state plus the exact projection currently bound to that node.
- Import into a fresh chat creates a new `BaseSnapshot(kind=fork)` with a `base-seed` projection, preserving exact next-turn MODEL_STATE continuity without copying old event history.
- Legacy import accepts either a wrapper containing `stat_data` or direct stat_data. Only stat_data becomes authoritative state.
- Existing `ff_mvu_prompt_view`, when present, is retained only as `legacy-exact` first-turn projection seed.
- `ff_mvu_snapshot_meta` is provenance only.
- New Game uses existing GameStart v1.4 formulas and creates a normal genesis. Loading/import never reruns GameStart formulas.


# Phase 7 — Narrative history context (v0.8.0)

- Assistant transcript timestamps are **in-world only**: `World.Date[0] + World.Time[0]`. Real-world/browser time is never shown to the model.
- User messages are not timestamped.
- Successful/no-patch assistant attempts persist `finalNodeId`, `finalStateHash`, and the narrative timestamp from their final semantic state.
- STOP/failed evidence uses the frozen/base state's narrative time because no later state was authoritatively committed.
- The interceptor adds `<narrative_time date="..." time="..."/>` only to assistant history messages with proven `sourceMessageId` metadata; missing identity is skipped rather than guessed.
- `RecentChanges` is computed as a **net semantic diff** from the latest state already represented by an assistant response to the current head. Intermediate GUI clicks that revert before the next generation disappear naturally.
- Initial domains: Outfit (player + Familiar), Inventory, Equipment, World.Location, core/current combat stats, and Relationships.
- `RecentChanges` is prompt-only context; it is not written into authoritative state and does not alter MODEL_STATE hashes or patch authorization.
- Current MODEL_STATE remains authoritative; RecentChanges only explains off-screen transitions.


# Phase 8 — Branch-safe GUI intents (v0.9.0)

- StatusMenu writes no longer need to replace an entire `stat_data` snapshot.
- Initial typed intents: `outfit.move`, `inventory.delete`, `equipment.equip`, `equipment.unequip`.
- Outfit parity preserves the legacy atomic Wardrobe behavior: Wardrobe -> Worn replaces matching non-Extra `Slot + Layer`, returning displaced items to Wardrobe with collision-safe keys.
- Equipment parity preserves legacy slot limits, global accessory cap=3, Qty semantics, attribute bonuses, derived-stat recalculation, and automatic unequip ordering.
- Cross-character equip intentionally preserves the old StatusMenu rule where an automatic displaced item returns to the inventory that supplied the newly equipped item.
- `StateService.commitGuiIntent` requires the exact expected semantic parent node + state hash and writes a `kind=gui` commit with direct-self projection binding.
- Backend `ffmvu_gui_intent` re-resolves the active transcript branch before commit, blocks while a model generation is pending, and refuses stale UI state.
- After the journal commit, the backend re-resolves the transcript again before moving the root/Variant anchor tip. If the user changed swipe/branch in the meantime, the durable commit is left unbound and reported explicitly instead of silently rebasing.
- A successful bind is resolved once more and must reproduce the committed node/state hash.
- GUI changes therefore become ordinary semantic ancestors and automatically appear in `RecentChanges` on the next model turn.


# Phase 9 — Native StatusMenu / New Game (v0.10.0)

- Replaces the old message-injected `<StatusPlaceHolderImpl/>` iframe implementation with one persistent Spindle Drawer tab.
- The frontend follows Lumiverse's free `chat.active` state selector and fetches the exact active semantic head through `ffmvu_gui_get_state`.
- Native tabs: Overview, Attributes, Familiars, Wardrobe, Equipments, Items, Others, FF State.
- Overview includes legacy HP/MP/ST, World, character status, quests, avatar, and HPH player paths under `Narrative.Scene.HPH.player`.
- Wardrobe, Inventory and Equipment controls call typed v0.9 intents and are disabled while generation is in flight or the bridge/head is unavailable.
- Equip can target the player or a Familiar while retaining the legacy cross-character equipment semantics implemented in StateService.
- FF State is a recursive searchable view of the authoritative state rather than a copy of message variables.
- New Game is native and calls `StateService.startNewGame`; it follows GameStart v1.4 source-of-truth: STR/AGI/CON/INT/WIS base 5 + up to 50 distributed points, Charisma separately constrained to 80–100.
- The old Colorize palette is now extension-owned host CSS. The regex can keep emitting `--npc-color`; SillyTavern-only `#chat .mes_text` selectors are no longer required.
- Diagnostics remain available in a collapsed section instead of occupying the whole extension tab.
