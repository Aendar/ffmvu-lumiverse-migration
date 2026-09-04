# Phase 5 / Model Commit Pipeline Status — v0.5.0

Status: **DEV COMMIT PIPELINE — normal/regenerate/swipe finalization enabled; Continue remains fail-closed.**

## Parity order

Frozen authorization -> final JSONPatch -> model P1 -> Vnext from P1 before consumption -> optional system C2 -> one ChatStoreRevision -> immutable TranscriptAttempt -> rebuildable AnchorRecord.

- P1 receives direct self-binding to Vnext.
- Projection consumption creates C2 with a one-shot binding back to P1/Vnext.
- Successful no_patch from a non-direct binding creates an empty-patch direct-self projection-refresh.
- Model path authorization is derived only from the projection delivered to that attempt.
- Cold omitted existing entities are not writable.
- New NPC ids allocate from frozen NextNpcId and must advance NextNpcId atomically.
- Parent compatibility is rechecked against the pre-assistant transcript before commit; no silent rebase.
- Continue remains blocked until append/fingerprint semantics are proven live.

## Live fixture

The exact v0.4.3 P0 JSONPatch bytes are not present in repository history. Tests encode only its verified operation shape (World / World_Calc / Outfit / NPC / NextNpcId / Scene). Exact bytes must be added verbatim later rather than invented.
