# FFMVU → Lumiverse migration status

## Frozen reference set

The five required logical source roles are present and SHA-256 pinned in `legacy-reference-manifest.json`.
The source bytes are copied unchanged under `legacy-reference/` with canonical role-based filenames.

### Audit note

Core is identified by executable source/name as **FFMVU 1.5.8**, while its export metadata contains `data.version = 1.5.6`.
This discrepancy is provenance only. The frozen file is not modified.

## Completed in this package

- exact five-role frozen source set;
- SHA-256/size manifest;
- full preset top-level surface inventory (47 keys);
- full prompt-block inventory (86 blocks + content hashes);
- Phase 1A pure-core scaffold and parity-oriented unit checks;
- no SillyTavern, TavernHelper, MVU bundle, Spindle lifecycle, or GUI dependency in `src/shared`.

## Phase 0 still requires a live target Lumiverse host

The architecture-critical P0 integration spikes (A..V as applicable) are **not claimed complete** by this offline package.
They require the exact installed Lumiverse/Spindle target build, especially generation correlation, attempt-context propagation,
interceptor/context-handler failure semantics, branch/swipe event behavior, userStorage crash/backup behavior, Continue,
stopped generations, extension reload, and native ST-import evidence acquisition.

## Next implementation boundary

Do not add GUI yet. After the pure-core parity tests are stable, proceed to EventStore/BaseStore/Materializer,
then HeadResolver/generation lifecycle, then ContextGuard/interceptor, and only then GameStart/StatusMenu UI.
