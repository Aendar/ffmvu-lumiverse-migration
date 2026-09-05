# Live v0.5 golden fixture

Captured from the first successful state-writing Lumiverse v0.5 run on 2026-09-05.

This fixture is exact user-provided evidence from the live run:
- bridge phase: `commit_complete`
- model P1 + system C2
- one transaction
- 17 JSONPatch operations
- canonical tuple update, outfit initialization, 5 worn items, 6 inventory items, and scene updates

Files:
- `jsonpatch.json` — exact operation array
- `raw-update-variable.txt` — exact wrapper/payload form supplied after the run
- `runtime-status.json` — live commit identifiers and hashes

Do not rewrite values for readability; changes to this fixture should be treated as fixture versioning.
