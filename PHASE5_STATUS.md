# Phase 5 / Model Commit Pipeline Status — v0.5.1

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

### Regenerate sibling branch
- Regenerate of the second assistant turn produced a new `variantId`, `messageId`, and model commit.
- Its `deliveredPromptViewHash` was exactly `cc9940ef37cd95226607a00b1ff7578c69b1ed3075591d20f99156a2f023c253`, the Turn 1 / C2 Vnext hash.
- It did **not** receive the original P2 projection `de5fe2007e433f7e0cf149ff314aafda24473887c4bbf2c157a953f1bf81e179`.
- Therefore regenerate is live-proven to create a sibling semantic branch from the state before the regenerated assistant message, not a child of the discarded P2.

The first manual "swipe right" at the end of the swipe list triggered a new model generation, producing another sibling commit from the same pre-message projection. That is branch-generation evidence, not navigation-only evidence.

v0.5.1 now publishes `phase: swipe_navigated` for a true existing-swipe navigation event, including `variantId`, `headNodeId`, `headStateHash`, `headHealth`, and `noStateTransaction: true`. This makes navigation-only head changes directly observable without requiring another generation.

### Existing-swipe navigation
- v0.5.1 live navigation from swipe 0 -> 1 selected `variant_dbed...` / `node_f2a...` with `headHealth = ok` and `noStateTransaction = true`.
- Navigation back 1 -> 0 selected `variant_d9f...` / `node_96cc...` with the same guarantees.
- No generation/commit identifiers were created by navigation.

### Regenerate vs swipe topology
- Live evidence shows Regenerate replaced the assistant host message: original P2 used `messageId 4c226...`; regenerated P2b used `messageId 4381...`.
- Later swipes live inside the regenerated replacement message `4381...`.
- Therefore semantic siblings can span different host message identities. A semantic sibling is not necessarily a UI swipe sibling.
- The replaced original P2 branch remains durable in the semantic DAG even though the current Lumi swipe UI does not expose a route back to it in this observation.
- See `docs/LUMIVERSE_TRANSCRIPT_TOPOLOGY.md`.

Still open: no-patch live refresh, stopped durable output recovery, extension reload during AttemptContext, and Continue append semantics.
