---
phase: 47-console-rails-hotbar-and-input
plan: 11
subsystem: client-hotbar
tags: [vue, hotbar, cooldowns, keyboard]
requires: ["47-03", "47-06", "47-09"]
provides:
  - "useCooldownTicker, TICK_MS, TICK_MS_REDUCED: one shared cooldown ticker"
  - "HotbarSelector: desktop carets and mobile cycle button over existing hotbars"
  - "HotbarRow: ten iconed slots, cooldown sweeps, number keys, selector; mounted at the top of the composer"
affects: [47-12]
tech-stack:
  added: []
  patterns: ["shared interval gated by a computed 'anything cooling' flag", "document keydown listener with explicit guards", "inline gradient background for a dynamic sweep"]
key-files:
  created:
    - src/hotbar/useCooldownTicker.ts
    - src/hotbar/useCooldownTicker.test.ts
    - src/hotbar/HotbarSelector.vue
    - src/hotbar/HotbarSelector.test.ts
    - src/hotbar/HotbarRow.vue
    - src/hotbar/HotbarRow.test.ts
  modified:
    - src/frame/FeedShell.vue
key-decisions:
  - "Slots call use_ability({ characterId, abilityTemplateId }) in every state (research Q1); no combat-only reducer."
  - "The sweep sets its conic-gradient as an inline background, not through a --cd custom property: the shared tokens guard (tokens.client.test.ts) only accepts var() names defined by Nocturne or the client tokens, and changing that guard was out of scope. The remaining share is also exposed as data-percent on the sweep."
  - "The hotbar row uses min-height 52px with top alignment (not a fixed height) so a thin horizontal scrollbar under the strip never clips the slots; the selector and the empty 'No hotbar yet.' line stay exactly 52px."
  - "Cooldown rows are filtered to the active character and the later-ending row per ability wins."
  - "A slot with a call in flight ignores repeat clicks and keys until the promise settles."
requirements-completed: [CON-05]
status: complete
duration: 30min
completed: 2026-10-05
---

# Phase 47 Plan 11: Hotbar Summary

The player now sees ten iconed ability slots above the input, uses them by click, tap or number key, watches cooldown sweeps tick, and switches between existing hotbars; one shared interval runs only while something is cooling.

## What was built
- **`useCooldownTicker`**: `nowMicros` ref seeded from the clock; a `watch(active, ..., { immediate: true })` starts one `setInterval` (250 ms, 1000 ms under reduced motion), catches up at once on start, clears it when inactive and on `onScopeDispose`.
- **`HotbarSelector`**: desktop `.btn.btn-secondary.btn-icon.caret` carets (28x52, `Previous hotbar` / `Next hotbar`) around a 44px label cell (name 10px uppercase accent with `title`, `{i}/{n}` 10px neutral-500 tabular); mobile one 52x52 `.btn.btn-secondary.selector-mobile` with `Hotbar {name}, {i} of {n}. Switch to next hotbar.`. Wraps both ways; disabled with one hotbar or when `disabled`.
- **`HotbarRow`**: injects GAME_KEY / FRAME_KEY (inert defaults). Ten `button.slot` (52x52) for the active hotbar: key number, Phosphor icon by kind (accent-300), name, title and aria-label from 47-03 helpers; empty slots show the key only (`aria-disabled`, `Empty slot {n}`); cooling slots add the conic sweep, seconds (`12`, `2m`, `1h`), dimmed icon and name, `, ready in {n} seconds`; unaffordable abilities dim the icon but still fire; pressed class while the call is in flight; one 240 ms `ready-flash` ring when remaining goes from above 0 to 0 (not added under reduced motion, and the CSS removes the animation too); offline: `disconnected` row at 45% opacity and every slot `aria-disabled`; no hotbar rows: `No hotbar yet.` in a 52px row. Number keys: document `keydown` added on mount and removed before unmount, ignored for repeats, ctrl/meta/alt, composing, offline, any open screen (`activeScreen !== null`, which covers drawers and sheets), a focused input/textarea/select/contenteditable (checked on both `activeElement` and the event target), cooling or empty slots. `1`-`9` map to slots 1-9, `0` to slot 10, no other key maps.
- **`FeedShell`**: `<HotbarRow />` is the first child of `section.composer`, above the Composer.

## Verification
- `pnpm exec vitest run --dir src --maxWorkers=2`: 75 files, 1315 tests pass (was 1270; 45 new: ticker 7, selector 9, row 29).
- `pnpm exec vue-tsc -b`: exits 0. `pnpm build`: passes, "bundle clean: 4 files scanned".
- `git status --porcelain spacetimedb src/module_bindings`: empty. Nothing published, no server touched, no push, no LLM calls.
- Design guards (`src/styles`) pass over the new `.vue` files (no literal colors, scale sizes, weights 400/500, spacing scale, no `v-html`, no `<svg`).
- Reducer argument names checked against `src/module_bindings` (`use_ability`: characterId, abilityTemplateId, optional targetCharacterId; `switch_hotbar`: characterId, hotbarName).

## Existing Phase 45 assertions changed
None. The FeedShell and rails shell tests pass unchanged (the hotbar mounts with inert defaults and shows `No hotbar yet.`).

## Deviations from Plan
**1. [Rule 3 - Blocking] Sweep percentage not set through `--cd`.**
- **Found during:** Task 2 (the `src/styles` var() guard failed with `src/hotbar/HotbarRow.vue: --cd`).
- **Issue:** the plan sets a `--cd` custom property inline and reads it in the stylesheet; the existing guard rejects any `var(--name)` not defined in Nocturne or `tokens.client.css`.
- **Fix:** the template binds `background: conic-gradient(color-mix(in srgb, var(--color-bg) 80%, transparent) {percent}, transparent 0)` inline (same visual result as the UI-SPEC). Because happy-dom cannot parse that value, the share is also exposed as `data-percent` and the test asserts it. The plan's wording "sweep has a `--cd` style percentage" is therefore met by `data-percent` plus the inline gradient.
- **Files modified:** src/hotbar/HotbarRow.vue, src/hotbar/HotbarRow.test.ts. **Commit:** be639525.

**2. Layout:** row `min-height: 52px` and top alignment instead of `height: 52px`, so the thin scrollbar of the sideways-scrolling strip cannot clip the slots. The empty-state line and selector are exactly 52px.

**3. Process:** as in earlier 47 plans, implementation and tests were committed together per task (no separate RED/GREEN commits). Plan type is `execute`; no TDD gate section applies.

## Threat model
- T-47-18 mitigated: each key guard (field focus for input/textarea/select/contenteditable, ctrl/meta/alt, repeat, open screen, offline, empty, cooling) has a test; the listener is removed on unmount (tested).
- T-47-01b mitigated: names render as text nodes and title attributes; an `<img src=x onerror=alert(1)>` name is tested to produce no element, in the slot name, title and aria-label, and in the selector.
- T-47-05 accepted (server checks ownership, template, cost, cooldown).
- T-47-14 mitigated: one shared interval, only while something is cooling, cleared on scope dispose (tests count timers).
- CON-05 prohibition (no ability from a number key while typing or while a drawer or sheet covers the hotbar): covered by tests for focused fields and `activeScreen`.

## Known Stubs
None. `item_cooldown` is not used (no slot-to-item mapping, research S9); only `ability_cooldown` drives sweeps.

## Threat Flags
None.

## Flagged assumptions
- Shift is not treated as a blocking modifier (the plan lists ctrl, meta, alt); `event.key` must still be exactly a digit, so Shift+1 on a US layout (`!`) does nothing, and AZERTY digits (typed with Shift) work.
- Hotbar switching and ability use are not exercised against a live server (owner constraint).

## Deferred owner verification
No checkpoint tasks in this plan. For the owner try-out (not covered by happy-dom layout or a live server):
- Desktop 1280px: the hotbar sits between the feed and the input, aligned with the input width; carets and the `NAME 1/3` label are 28 / 44 / 28 wide at 52px height.
- Between 900px and 1100px and on mobile: the slot strip scrolls sideways (snap on mobile, no visible scrollbar) while the selector and the input never scroll or wrap.
- Use a ready ability by click and by number key (`0` = slot 10): the reply appears in the feed; the slot shows the pressed ring until the server answers.
- While cooling: the dark sweep shrinks clockwise, seconds count down (`12`, `2m`, `1h` formats), clicks and keys do nothing; at 0 one 240 ms accent ring flashes (none with OS reduced motion on).
- Type in the input and press digits: nothing fires. Open a drawer (Character, Inventory) or the Map/More sheet and press digits: nothing fires.
- Switch hotbars with the carets (wraps) and on mobile with the single button; with one hotbar the selector is dimmed.
- Drop the connection: slots dim to 45% and ignore taps and keys.

## Commits
- 69a08229 feat(47-11): shared cooldown ticker and hotbar selector
- be639525 feat(47-11): hotbar row with cooldown sweeps and number keys in the composer

## Self-Check: PASSED
All 6 created files and the modified FeedShell exist; commits 69a08229 and be639525 verified in git log.
