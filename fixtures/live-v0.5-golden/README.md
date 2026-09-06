# Live v0.5 golden fixture

Captured from the first two successful state-writing Lumiverse v0.5 turns on 2026-09-05.

Turn 1 proves:
- `commit_complete`
- model P1 + system C2 in one ChatStoreRevision
- 17 exact JSONPatch operations
- final semantic head is C2

Turn 2 proves restart/head/projection continuity from that C2:
- `turn2.deliveredPromptViewHash === turn1.nextPromptViewHash`
- the one-shot C2 binding correctly reproduces P1/Vnext for the next generation
- the second model patch commits as a direct P2 with no additional C3 when no consumption is required

Files:
- `jsonpatch.json` — exact Turn 1 operation array
- `raw-update-variable.txt` — exact Turn 1 wrapper/payload
- `runtime-status.json` — Turn 1 live commit evidence
- `turn-2-jsonpatch.json` — exact Turn 2 operation array
- `turn-2-raw-update-variable.txt` — exact Turn 2 wrapper/payload
- `turn-2-runtime-status.json` — Turn 2 live commit evidence
- `chain-proof.json` — explicit cross-turn projection continuity assertion

Do not rewrite fixture values for readability; changes should be treated as fixture versioning.

## Regenerate / swipe topology evidence

Additional live files:
- `swipe-generated-jsonpatch.json`
- `swipe-generated-runtime-status.json`
- `swipe-navigation-0-to-1.json`
- `swipe-navigation-1-to-0.json`
- `regenerate-vs-swipe-topology.json`

These prove that Regenerate replaced the host assistant message, while later swipes were variants inside that replacement message. Existing-swipe navigation switched resolved semantic heads without creating a transaction.

## Durable stopped-output discovery

The v0.5.1 live STOP probe is stored as:
- `stopped-v0.5.1-partial.txt`
- `stopped-v0.5.1-runtime-status.json`

Lumiverse preserved the partial assistant output after `GENERATION_STOPPED`. The captured machine envelope contains an unterminated JSONPatch/string. This fixture must never be fed into the state reducer as a completed model patch.

v0.5.2 live proof is stored as:
- `stopped-v0.5.2-durable-status.json`
- `stopped-v0.5.2-blocked-next-generation.json`

Together they prove `stopped_durable -> stopped_uncommitted`: the stopped partial is persisted as evidence without a state transaction, and a subsequent normal stateful generation is blocked until explicit resolution.

## v0.5.3 no-patch / projection-refresh proof

Files:
- `no-patch-turn1-runtime-status.json`
- `no-patch-probe-runtime-status.json`
- `no-patch-projection-refresh-proof.json`

The proof starts from a live C2 one-shot projection. The next turn intentionally emits no machine patch and finalizes as `no_patch`. No model commit is created, state hash remains unchanged, and exactly one empty system projection-refresh node converts the next binding to direct-self.

## P0-U extension reload fail-closed proof

Files:
- `reload-next-generation-blocked-status.json`
- `reload-fail-closed-proof.json`

The extension was reloaded during generation. Lumi kept the assistant output, but the bridge lost its in-memory AttemptContext. The next stateful generation was blocked before provider dispatch because the durable assistant had no proven VariantIndex/Anchor finalize evidence. This is the required v2.4 fail-closed behavior.

## P0-C Continue host-semantics proof

File:
- `continue-v0.5.4-probe-status.json`

The live probe proved that Lumi appends Continue output to the same message and swipe while `GENERATION_ENDED.content` contains the full post-Continue message. The pre-Continue stored message is an exact prefix, so the generated suffix is deterministically derived from the frozen prefix boundary. v0.6.0 uses this rule for stateful Continue and supports JSONPatch envelopes that cross the append boundary.
