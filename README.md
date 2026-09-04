# FFMVU Migration Bridge

Experimental migration bridge for moving the FF+MVU state engine from SillyTavern/TavernHelper to Lumiverse/Spindle.

> **Unofficial community extension.** This project is independent and is not affiliated with, endorsed by, or supported by the Lumiverse project or its authors.

## Current status

**v0.4.0 — live diagnostic probe only.** Model-authored JSONPatch commits are intentionally disabled. The bridge currently proves state freeze, MODEL_STATE injection, generation correlation, saved-message identity, stable VariantId evidence, and fail-closed behavior.

Requires **Lumiverse 1.1.6+**. Runtime additionally requires `spindle.contracts.preAssemblyGenerationContext >= 1`.

## Install

1. In Lumiverse, open **Extensions**.
2. Install:
   `https://github.com/Aendar/ffmvu-lumiverse-migration`
3. Grant:
   - `context_handler`
   - `interceptor`
   - `generation`
   - `chat_mutation`
4. Open the **FFMVU** drawer tab.
5. Click **Arm bridge**.
6. Use a disposable test chat and send exactly one normal RP generation.
7. Success for v0.4 is `probe_complete`.

See [README_LUMIVERSE.md](./README_LUMIVERSE.md) and [PHASE4_STATUS.md](./PHASE4_STATUS.md) for the full diagnostic procedure.

## Development

```bash
npm install
npm test
```

The repository intentionally keeps `dist/` committed because Lumiverse can execute the checked-in build directly.

The project pins `lumiverse-spindle-types@0.6.16` to match the Lumiverse 1.1.6 development baseline. The current probe still retains a deliberately narrow local host DTO shim while live parity evidence is being collected; migration to the full official type surface is a follow-up refactor, not a runtime dependency.

## Safety boundary

Do not use v0.4 as the authoritative state engine for an ongoing campaign. A successful diagnostic assistant response is deliberately marked `unreconciled`, and the next stateful generation should fail closed.
