# FFMVU -> Lumiverse Migration Bridge v0.5.0

This is the first **state-writing** Lumiverse/Spindle development bridge for FF+MVU. P0 lifecycle correlation was proven on Lumiverse with v0.4.3; v0.5 enables model commit finalization for normal/regenerate/swipe generations.

## Current pipeline

```text
frozen semantic parent + exact MODEL_STATE
        ↓
frozen patch authorization
        ↓
final GENERATION_ENDED output
        ↓
last <JSONPatch>
        ↓
re-check exact compatible parent
        ↓
P1 model commit
        ↓
Vnext built from P1 BEFORE consumption
        ↓
optional C2 projection-consumption
(or no-patch projection-refresh when needed)
        ↓
ONE ChatStoreRevision
        ↓
immutable TranscriptAttempt + AnchorRecord
```

The model never patches against a newly rebuilt/current projection. Authorization is frozen from the projection actually delivered to that attempt.

## Safety gates

- No silent rebase. A changed compatible parent produces `model_commit_conflict`.
- Malformed, unauthorized or invalid patches become `failed_patch`; no semantic state write is adopted.
- Cold existing entities omitted from MODEL_STATE are not writable by that attempt.
- New NPC ids must allocate from frozen `Narrative.NextNpcId` and advance it atomically.
- `ProjectionMeta`, routing labels, audit fields and archives remain backend-owned.
- Model ops are limited to `add`, `replace`, and `remove`.
- Continue is intentionally blocked in v0.5 until append/fingerprint semantics are proven live.
- Stopped/error generations do not bind or commit next state.

## Build / verify

```bash
npm install
npm test
```

The repository keeps a compiled `dist/`. Lumiverse runs:

- backend: `dist/src/lumi/backend.js`
- frontend: `dist/src/lumi/frontend.js`

## Live v0.5 test

Use a disposable/fresh chat first.

1. Update/reload the extension so the drawer reports `bridgeVersion: "0.5.0"`.
2. Arm commits in the FFMVU drawer.
3. Send one ordinary stateful turn that produces a valid final `<JSONPatch>`.
4. Expected terminal phase: `commit_complete`.
5. Inspect:
   - `modelCommitId`
   - optional `systemCommitId`
   - `transactionId`
   - `committedNodeIds`
   - `finalNodeId` / `finalStateHash`
   - `deliveredPromptViewHash`
   - `nextPromptViewHash`
6. Send a second ordinary turn only after the first returns `commit_complete`; this validates restart/head resolution from P1/C2.

## Golden live fixture

The successful v0.4.3 live output is known to contain a patch spanning World, World_Calc, Outfit, NPC creation, NextNpcId, and Scene. Its exact JSONPatch bytes were not present in repository history when v0.5 was implemented, so they are **not fabricated**. A fixture slot exists at `fixtures/live-p0-golden/`; exact captured bytes can be added verbatim later.

See `PHASE5_STATUS.md` for the implementation contract.
