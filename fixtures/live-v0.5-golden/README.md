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
