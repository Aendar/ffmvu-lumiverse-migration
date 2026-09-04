# FFMVU -> Lumiverse Migration Bridge v0.4.0

This is the **first real Lumiverse/Spindle extension scaffold** for the migration. It is a live diagnostic bridge, not yet the production replacement for the SillyTavern Core.

## Before installing

`spindle.json` contains a placeholder repository URL:

```text
https://github.com/CHANGE-ME/ffmvu-lumiverse-migration
```

Replace both `github` and `homepage` after you create your repository.

## Build / verify locally

Requirements: Node.js for the migration test suite. Lumiverse itself uses Bun to run/build extensions.

```bash
npm install
npm test
```

The checked-in `dist/` is already generated, so Lumiverse does not need to compile TypeScript just to run this snapshot.

## Install in Lumiverse

Lumiverse's documented extension flow is GitHub-based.

1. Put this directory in a GitHub repository.
2. Make sure `spindle.json` is at the repository root.
3. In Lumiverse open **Extensions** and install the repository.
4. Grant these four permissions:
   - `context_handler`
   - `interceptor`
   - `generation`
   - `chat_mutation`
5. Open the new **FFMVU** drawer tab.
6. Press **Arm bridge**.
7. Use a disposable/fresh test chat with the FF+MVU preset containing `__FFMVU_LIVE_STATE__` or a `<MODEL_STATE>` block.
8. Send one ordinary RP message.

## Expected diagnostic sequence

The FFMVU tab should progress approximately through:

```text
armed
 -> frozen
 -> injected
 -> generation_started
 -> probe_complete
```

`probe_complete` is success for v0.4. It proves that the pre-assembly state freeze, late prompt injection, generation correlation, saved message identity, and VariantId evidence all reached the bridge.

The model JSONPatch is **not committed in v0.4**. The resulting assistant variant is marked `unreconciled`, so another stateful generation on that same branch is supposed to be blocked. Do not treat that as a bug.

## What to send back for the next migration step

Copy the JSON shown in the FFMVU drawer after `probe_complete` (or after a `blocked` / `probe_error` state). That gives the live-host evidence needed for P0-F/P0-Q without exposing API keys or private reasoning.

## Important boundaries

- `spindle.userStorage` is authoritative persistence for the extension.
- Lumi message metadata/chat variables are not used as authoritative FFMVU state.
- Numeric `swipe_id` is treated only as an observed array index; stable identity is internal `VariantId`.
- Direct `spindle.generate.raw/quiet/batch` calls are outside this bridge's normal Context Handler / Interceptor path and are not stateful FFMVU generations.
