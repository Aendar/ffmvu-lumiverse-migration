# Product / UX Decisions

This file records user-level product decisions that must survive later implementation/refactor work.

Architecture and correctness remain governed by `docs/FFMVU_Lumiverse_Migration_Agent_Spec_v2.4.md`. This document is authoritative for the UX/product choices below unless the user explicitly changes them later.

## D1 — Preserve the original FF+MVU UI first

**Decision:** during migration/cutover, preserve the original StatusMenu/GameStart visual language, information layout, terminology, and interaction model as much as practical.

- Make only changes required by Lumiverse/Spindle platform integration, correctness, or basic usability.
- Do not redesign cards/tabs/FF State simply because a cleaner design is possible.
- The v0.11 composer placement and fixed-height internally scrolling panel are accepted platform/usability changes.
- A uniform host-level compact scale (currently 0.78) is also an accepted usability adjustment because it preserves the canonical internal DOM/CSS instead of redesigning individual elements.
- A broader UI redesign is intentionally deferred until migration correctness, import/export, and long-session testing are stable.
- FF State in particular is known to be useful but visually/ergonomically awkward; redesign it later as a separate task.

## D2 — Portable Save Snapshot is a first-class anti-degradation workflow

**Goal:** allow a long RP to move cleanly into a fresh chat when context quality begins to degrade.

The user must be able to:

1. export a portable snapshot from the current authoritative active branch;
2. open a fresh chat;
3. import that snapshot before normal stateful generation;
4. continue from the same authoritative FF+MVU state and exact next projection.

### UX placement

- **Export / Save Snapshot:** accessible from the initialized StatusMenu.
- **Import Snapshot:** belongs on the uninitialized GameStart surface, next to the existing New Game / Legacy Import choices.
- Importing a portable snapshot is not the same workflow as importing an old SillyTavern legacy save.

### Semantics

- The snapshot is state/projection continuity, not a copy of the old transcript.
- It must preserve the exact next MODEL_STATE through the existing `ProjectionSeed` portable snapshot mechanism.
- A fresh-chat snapshot import creates a self-contained fork base and must not depend on the source chat remaining available.
- If the user wants narrative continuity without old-chat context bloat, a separate handoff/summary can be placed in the fresh chat.

**Current implementation status:** export is available from the initialized StatusMenu; import is available on the uninitialized GameStart surface. Import remains explicit because it creates a new chat fork.

## D6 — Schema upgrades are automatic

An initialized legacy FFMVU head is upgraded in place when the enabled bridge first observes it, and again defensively before generation if needed.

- The extension constructs the current-schema state itself; the user does not copy a template, edit JSON, run a preflight, or press a migration button.
- The upgrade is one durable `migration` commit bound to the existing semantic lineage, preserving transcript and branch history.
- This upgrade removes retired legacy fields and creates the current schema-owned collections through the current reducer.
- Portable Snapshot import remains a separate explicit action because it loads state from another chat rather than upgrading the chat already open.

## D3 — Outfit/GUI changes must be visible to the model as NET off-screen changes

A state change performed through StatusMenu/GUI may occur without corresponding prose in chat history. The next model turn must therefore be told what changed between the last assistant-represented state and the current state.

For Outfit specifically:

- if the last assistant-represented state had **Hat A** and the user changes to **Hat B**, the next model turn receives the net transition A -> B;
- if the user performs **Hat A -> Hat B -> Hat A** before the next model turn, the model receives **no Outfit change**, because from its narrative perspective Hat A was continuously the represented state;
- intermediate reversible GUI activity is not narrative history and must not be surfaced just because it happened physically in the UI;
- the current MODEL_STATE remains authoritative; the change envelope exists only to explain off-screen transition.

The same net-diff principle can cover other tracked GUI/system domains where useful.

### Narrative timestamp for off-screen changes

`RECENT_CHANGES.observedAt` uses **in-world** `World.Date` + `World.Time`, never wall-clock time.

**Current implementation status:** implemented in `computeRecentChanges()`, including player/Familiar Outfit diff, Inventory, Equipment, Location, Stats and Relationships.

## D4 — Assistant history gets IN-WORLD narrative timestamps; user history does not

The model should be able to place its own prior responses on the narrative timeline.

**Required semantics:**

- every successfully reconciled/committed assistant generation attempt stores a narrative timestamp derived from `World.Date` and `World.Time`;
- prior assistant history is re-injected with an internal `<narrative_time date="..." time="..."/>` marker;
- these timestamps are **fictional/in-world chronology**, not the real date/time when the user or model sent the message;
- user messages receive no narrative timestamp;
- the model must not infer in-world elapsed time from real user-message timing;
- timestamp markers are model-context metadata and do not need to be rendered as visible chat decoration.

### Evidence rule

Do not fabricate timestamps for legacy/historical assistant messages when the migration has no trustworthy state/attempt evidence for them.

**Current implementation status:** implemented for FFMVU-managed assistant attempts in `TranscriptAttempt.narrativeTimestamp` + `injectNarrativeHistoryContext()`.

## D5 — Later redesign remains explicitly deferred

After migration/cutover stability, revisit as separate work:

- StatusMenu/FF State ergonomics;
- systems that are currently read-only or awkward;
- prompt cleanup/rewrite;
- removal of obsolete prompt/state blocks;
- any broader visual redesign.

These later changes must not weaken D2/D3/D4 continuity semantics.


## D6 — Editable Variables tree is a first-class maintenance tool

A separate **Variables** tab should expose the authoritative FFMVU state as a human-friendly editable tree.

Primary UX:
- click a primitive value to edit it;
- rename an object key without manually writing JSON paths;
- delete an entry with confirmation;
- add a child entry with a simple form;
- when possible, offer an existing sibling as a structure/template for a new entry;
- search/filter the tree;
- keep raw JSON/path details secondary rather than making them the normal workflow.

Typical intended uses include renaming currency/item keys, correcting descriptions or quantities, editing plot/GM-note records, and adding small state entries without waiting for the model.

Architecture:
- no direct browser-side `stat_data` replacement;
- mutations must go through StateService with exact expected semantic head + state hash;
- implement path-level GUI intents (set / rename / delete / add) and derive ordinary JSONPatch commits;
- normalize + validate the whole resulting state before commit;
- protect root/internal structural keys from destructive rename/delete;
- schema-required fields may be edited only when the resulting state still validates;
- every successful Variables edit is an ordinary `kind=gui` semantic ancestor and therefore participates in RecentChanges / branch behavior normally.

This tab is intentionally a practical maintenance editor, not a developer/debug JSON editor.
