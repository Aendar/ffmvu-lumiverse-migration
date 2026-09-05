# Lumiverse transcript topology: Regenerate vs Swipe

Observed live on 2026-09-05 with FFMVU bridge v0.5.0/v0.5.1.

## Key distinction

A semantic sibling branch does **not** necessarily mean a sibling inside the same Lumiverse swipe array.

In the observed run, **Regenerate replaced the assistant message object**:

- original Turn 2 message: `4c226806-7527-457f-90ae-f1075326dba4`
- regenerated message: `4381e23b-e6fd-4a1f-9e34-3792c0612da0`

Both branches were generated from the same pre-message semantic state, but they have different host `messageId` values.

After Regenerate, the current UI exposed swipes only inside the replacement message. The original Turn 2 branch remained durable in the semantic DAG, but was not reachable through the replacement message's swipe controls in this live observation.

## Observed topology

```text
Turn 1 / C2
  |
  +-- original Turn 2 message (messageId 4c226...)
  |     +-- variant_34ef... -> node_3cf...
  |
  +-- regenerated replacement message (messageId 4381...)
        +-- swipe 0: variant_d9f...  -> node_96cc...
        +-- swipe 1: variant_dbed... -> node_f2a...
```

The second swipe under `messageId 4381...` was created by swiping right at the edge, which triggered generation. It also received the same pre-message projection hash as the regenerate branch.

## Existing-swipe navigation

v0.5.1 instrumentation then observed navigation without generation:

- swipe 0 -> 1 resolved `variant_dbed...` / `node_f2a...`
- swipe 1 -> 0 resolved `variant_d9f...` / `node_96cc...`
- both events returned `headHealth = ok`
- both returned `noStateTransaction = true`

Therefore swipe navigation is presentation selection over already committed semantic siblings; it must not create a state commit.

## Design consequence

FFMVU must keep these identities separate:

1. **Message identity** — stable host `messageId`.
2. **Variant identity** — stable `VariantId` inside a message's swipe set.
3. **Semantic state node** — immutable commit DAG node.
4. **Swipe index** — mutable UI coordinate only.

Regenerate may replace message identity while still branching from the same semantic parent. Existing swipe navigation changes the active VariantId/head without mutating state.

Do not assume that every semantic sibling is UI-reachable from the current message's swipe arrows, and do not garbage-collect a replaced-message branch merely because it is no longer in the active transcript.
