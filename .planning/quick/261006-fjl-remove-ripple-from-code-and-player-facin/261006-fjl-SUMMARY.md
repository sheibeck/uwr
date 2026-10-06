---
quick_id: 261006-fjl
status: complete
date: 2026-10-06
commits: [a7bdf561, 4269d5a1, 7aa34027]
---

# Quick Task 261006-fjl Summary: no "ripple" in code or player-facing text

"Ripple System" is a copyrighted name; world-growing announcements are always World events.

## Changes

- Server (a7bdf561): `RIPPLE_TEMPLATES` -> `WORLD_EVENT_TEMPLATES`, `pickRippleMessage` -> `pickWorldEventMessage` (`spacetimedb/src/helpers/world_gen.ts`, `llm_apply.ts`).
  - Template: "The edges of reality waver. Something ancient stirs beyond {sourceRegion}."
  - Start line (identical in `STARTER_RETRY_MESSAGES.started`, `helpers/travel.ts`, `reducers/intent.ts`): "The edges of reality shimmer around you. The world pauses, as if remembering something it had forgotten..."
  - `llm_cutover.test.ts` constant `RIPPLE` -> `WORLD_EVENT_START`.
- Client (4269d5a1): feed line kind `'ripple'` -> `'world'` with label "World event" for server kinds `world` and `renown`; CSS `.line-ripple` -> `.line-world`. Kept distinct from `worldEvent` so the waveform icon and pre-wrap body render as before; `keywordEligible: true` unchanged.
- Guard (7aa34027): `spacetimedb/src/data/no_ripple_word.test.ts` fails on "ripple" (any case) in non-test source under `spacetimedb/src` and `src` (bindings excluded). `src/console/lines.test.ts` asserts `world`/`renown` lines carry "World event".

## Verification

- Server vitest (single worker): 3933 passed, 2 failed. Both failures are pre-existing in `measurement.results.test.ts` (looks for archived `.planning/phases/39-*`), unrelated.
- Client vitest `src/console` + `src/frame`: 626/626 passed. `vue-tsc -b`: clean.
- Server `tsc --noEmit`: no new errors (existing errors unchanged).
- No schema change, no publish.
