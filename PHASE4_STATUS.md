# Phase 4 / P0 Live Lumiverse Bridge Status — v0.4.0

Status: **DEV PROBE — installable extension scaffold, model-state writes intentionally disabled.**

## What is implemented

- Pure Core / EventStore / HeadResolver from v0.1-v0.3.
- Lumiverse `spindle.userStorage` adapter with explicit per-user scoping.
- Pre-assembly Context Handler:
  - skips dry runs and impersonation;
  - resolves the active semantic head;
  - freezes base node/hash + exact MODEL_STATE projection;
  - enforces at most one pending non-dryRun generation per state scope;
  - cancels generation when the state head is unhealthy.
- Post-assembly Interceptor:
  - injects the frozen projection into `__FFMVU_LIVE_STATE__`;
  - falls back to replacing an existing `<MODEL_STATE>` block;
  - final fallback inserts a dedicated system MODEL_STATE block.
- Generation lifecycle probe:
  - correlates Context Handler -> Interceptor -> GENERATION_STARTED -> GENERATION_ENDED;
  - binds generationId and saved messageId;
  - creates stable VariantId / TranscriptAttempt / AnchorRecord evidence;
  - deliberately records the completed model attempt as `unreconciled` because model JSONPatch commit is not enabled yet.
- Swipe reconciliation listens to both fine-grained and wholesale swipe events. Navigation itself does not create state commits.
- Native Lumiverse drawer tab for arming/disarming the P0 bridge and viewing runtime diagnostics.
- Permission registration supports permissions granted after extension startup.

## Intentional production gate

v0.4 **must not be used as the authoritative state engine for a real campaign yet**.

A successful diagnostic generation is intentionally left `unreconciled`. The next stateful generation therefore fails closed. This is deliberate: P0-F/P0-Q correlation and exact saved-message/raw-output evidence must be proven in a real Lumiverse host before enabling model-authored JSONPatch commits.

## Tests

- Phase 1A: 23
- Phase 2: 14
- Phase 3: 7
- Phase 4 bridge: 8
- Total: 52

Run:

```bash
npm test
```
