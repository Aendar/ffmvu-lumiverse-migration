# FFMVU → Lumiverse migration · Phase 3 status

Version: `0.3.0`

Implemented as backend-agnostic transcript integrity primitives:

- spec-shaped `TranscriptAttempt`, `AnchorRecord`, `RootAnchorRecord`, `MessageVariantIndex`;
- immutable attempt store and rebuildable anchor/index stores;
- stable UUID VariantIds independent of host swipe indexes;
- add/update/delete and wholesale swipe reconciliation;
- fail-closed ambiguous duplicate-fingerprint reconciliation;
- versioned active transcript prefix hash primitive for BaseSnapshot boundaries;
- semantic descendant tracing independent of physical StoreRevision order;
- `HeadResolver` that follows active stable variants, validates attempt parents/state hashes, detects missing evidence, and permits same-lineage GUI/system descendants between Continue attempts;
- divergence fixture: downstream response generated from swipe A is rejected after active upstream swipe changes to B;
- swipe navigation fixture: active head changes without writing a state transaction.

Still intentionally absent:

- Lumiverse/Spindle runtime adapter and live `getMessages()` integration;
- live P0-F generation correlation proof;
- canonical stored-message transform boundary proof;
- generation finalization / model JSONPatch commit pipeline;
- GameStart/StatusMenu frontend.

Those require the actual Lumiverse host and are the next integration stage, not assumptions to encode into the pure resolver.
