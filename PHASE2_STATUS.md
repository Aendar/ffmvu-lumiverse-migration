# FFMVU → Lumiverse migration · Phase 2 status

Version: `0.2.0`

This package implements the second coding stage from `FFMVU_Lumiverse_Migration_Agent_Spec_v2.4.md`.

Implemented:

- backend-agnostic `JsonStoragePort` and in-memory test adapter;
- immutable `BaseSnapshot` / `StateCommit` artifacts;
- hash-linked immutable `ChatStoreRevision` records used strictly as the physical transaction journal, never as the active semantic head;
- StoreRevision head recovery without timestamps or mutable last-write-wins;
- ambiguous sibling StoreRevision detection (fail closed);
- semantic DAG `Materializer` using the recorded reducer version; semantic commits may legally branch from any already-committed parent node;
- checkpoint primitive;
- `AnchorStore` + stable `VariantIndex` primitives;
- per-`userId + chatId` process mutex;
- `StateService` as the only mutation facade implemented so far (`createGenesis`, `commitPatch`);
- cache update only after the physical StoreRevision commit point;
- orphan semantic node test: unreferenced artifacts are not auto-adopted.

Not implemented yet (intentionally):

- Spindle/Lumiverse runtime adapter;
- transcript `HeadResolver` / swipe reconciliation;
- generation correlation / `TranscriptAttempt` lifecycle;
- MODEL_STATE interceptor;
- GameStart or StatusMenu UI.

The spec orders those after Phase 2. The next package should start Phase 3 and only then wire the Lumiverse lifecycle surfaces.
