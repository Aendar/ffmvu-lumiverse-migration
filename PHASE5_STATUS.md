# Phase 5 / Model Commit Pipeline Status — v0.5.0

Status: **LIVE NORMAL-GENERATION CHAIN PROVEN; regenerate/swipe/Continue still require dedicated live parity probes.**

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
- Continue remains blocked until append/fingerprint semantics are proven live.

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

Still open: regenerate/swipe branch independence, no-patch live refresh, stopped durable output recovery, extension reload during AttemptContext, and Continue append semantics.
