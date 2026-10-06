---
quick_id: 261006-fjl
type: quick
autonomous: true
---

# Quick Task 261006-fjl: Remove "ripple" from code and player-facing text; always "World event"

"Ripple System" is a copyrighted name. World-growing announcements are always called World events.

## Task 1: Server identifiers and prose

- `spacetimedb/src/helpers/world_gen.ts`: `RIPPLE_TEMPLATES` -> `WORLD_EVENT_TEMPLATES`, `pickRippleMessage` -> `pickWorldEventMessage` (and its doc comment); reword the template "The edges of reality ripple..." and `STARTER_RETRY_MESSAGES.started`.
- `spacetimedb/src/helpers/llm_apply.ts`: import/call/comment follow the rename.
- `spacetimedb/src/helpers/travel.ts`, `spacetimedb/src/reducers/intent.ts`: same reworded prose line, kept identical to `STARTER_RETRY_MESSAGES.started`.
- `spacetimedb/src/reducers/llm_cutover.test.ts`: constant and test names follow.

## Task 2: Client feed line kind

- `src/console/lines.ts`: line kind `'ripple'` -> `'world'`; `world`/`renown` server kinds get label `'World event'`; label comment updated. Kept distinct from `worldEvent` so the waveform icon and pre-wrap body stay as they were.
- `src/console/FeedLine.vue`: `line.kind === 'world'`, CSS `.line-world`.
- `src/console/lines.test.ts`, `src/console/FeedLine.test.ts`, `src/frame/AppFrame.populated.test.ts` follow.

## Task 3: Guard test

- `spacetimedb/src/data/no_ripple_word.test.ts`: fails if "ripple" (any case) appears in non-test source under `spacetimedb/src` and `src` (excluding `src/module_bindings`).
- `src/console/lines.test.ts`: `world`/`renown` lines carry label "World event".

No schema change. No publish.
