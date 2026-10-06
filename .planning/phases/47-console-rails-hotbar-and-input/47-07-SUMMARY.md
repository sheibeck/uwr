---
phase: 47-console-rails-hotbar-and-input
plan: 07
subsystem: client-console
tags: [vue, feed, keywords, tokens]
requires: ["47-02", "47-03", "47-04", "47-06"]
provides:
  - "--color-line-npc, --color-line-whisper, --color-line-quest tokens (23 pinned)"
  - "keywordActionLabel"
  - "FeedLine: one labelled line per kind with keyword buttons"
  - "isPinned / PIN_THRESHOLD_PX / prefersReducedMotion"
  - "KeeperProgress and FeedView (scrolling log, pinning, New lines pill, progress line)"
  - "FeedShell renders FeedView"
affects: [47-09, 47-11, 47-12]
tech-stack:
  added: []
  patterns: ["text-interpolation-only rendering", "margin-top:auto bottom anchoring", "pin hold window during smooth scroll"]
key-files:
  created:
    - src/console/keywordLabel.ts
    - src/console/FeedLine.vue
    - src/console/FeedLine.test.ts
    - src/console/pinning.ts
    - src/console/pinning.test.ts
    - src/console/KeeperProgress.vue
    - src/console/FeedView.vue
    - src/console/FeedView.test.ts
  modified:
    - src/styles/tokens.client.css
    - src/styles/tokens.client.test.ts
    - src/frame/FeedShell.vue
    - src/frame/railsShell.test.ts
    - src/frame/frameContract.test.ts
key-decisions:
  - "Smooth scroll to the bottom (pill click) holds the pinned flag for 600ms so scroll events on the way do not unpin and re-show the pill."
  - "FeedView scrolls instantly while pinned (smooth only for the pill) so a mid-animation scroll event never reads as unpinned."
  - "An unparsed whisper and a speakerless NPC line read whole in their hue (class line-plain)."
  - "The empty line sits inside the role=log container so a short feed keeps the bottom anchor."
requirements-completed: [CON-01, CON-02, CON-06]
status: complete
duration: 40min
completed: 2026-10-05
---

# Phase 47 Plan 07: Feed rendering Summary

The center column now shows the live story: each feed entry renders as a labelled line by kind, NPC, place, node and player names are soft accent keyword buttons that call the console's `actOnKeyword`, the log stays pinned to the bottom with a "New lines" pill, and the Keeper progress line rotates the route's pool while a job runs.

## What was built
- **Tokens:** `--color-line-npc`, `--color-line-whisper`, `--color-line-quest` appended after `--color-stamina`; `tokens.client.test.ts` pins 23.
- **`keywordLabel.ts`:** `Hail X`, `Travel to X`, `Examine X`, `Whisper X`.
- **`FeedLine.vue`:** one root per kind (`line line-{kind}`): Keeper (Micro label over italic accent-200), NPC (`Name says, “text”`, speaker keyword when the NPC is still here), whisper sent/received/unparsed, party chat with `PhUsersThree` and hidden "Party", system, warning, quest/reward/faction inline label, ripple and world event blocks (`PhWaveform`, `PhGlobeHemisphereWest`), scene title and text, echo (`› `), queued echo (`PhHourglassMedium` + "Queued"), error, say and interim combat kinds. Keyword buttons are `button.keyword[type=button]` with title and aria-label; `aria-disabled="true"` and inert while `disabled`. `text-underline-offset: 4px` per the checker note.
- **`pinning.ts`:** `isPinned` (48px), `prefersReducedMotion` (false without matchMedia).
- **`KeeperProgress.vue`:** `role=status` row with the global `spin` class, italic neutral-400 text.
- **`FeedView.vue`:** injects `GAME_KEY`/`CONSOLE_KEY` (inert defaults); vocabulary from `npcsHere`, connected locations (names via `locations`), `visibleNodes`, `playersHere`, own name excluded; `buildFeedLines`; `role=log` container with the empty line; progress line after the log via `selectLlmIndicator(llmJobs, 'game', rotation)` with one `setInterval` (`LLM_PROGRESS_ROTATE_MS`) only while active, cleared on inactive and unmount; pinning, pill (`aria-label="New lines, jump to latest"`), `sendTick` re-pin; `margin-top: auto` bottom anchoring, `overflow-anchor: auto`, compact padding variant.
- **`FeedShell.vue`:** keeps `main.feed` and `compact`, renders `FeedView`.

## Verification
- `pnpm exec vitest run --dir src --maxWorkers=2`: 64 files, 1111 tests pass (was 61 files, 1055 tests; 56 new: FeedLine 23, FeedView 24, pinning 8, plus 1 in the shell tests).
- `pnpm exec vue-tsc -b`: exits 0.
- `pnpm build`: passes, "bundle clean: 4 files scanned".
- `git status --porcelain spacetimedb src/module_bindings`: empty. Nothing published, no server touched, no push.

## Existing assertions changed (Phase 45 shell tests)
- `src/frame/railsShell.test.ts`, FeedShell block:
  1. Empty story test: `toBe('Your story will appear here.')` became `toContain(...)` (later plans add the composer below the feed).
  2. Source test "bottom-anchors with a 760px line width..." replaced: now reads `FeedShell.vue` for `FeedView` and reads `src/console/FeedView.vue` for `max-width: 760px`, `margin-top: auto` (was `justify-content: flex-end`), `padding: 16px 32px`, `padding: 4px 16px 8px`.
  3. Added: compact is passed down to FeedView (`.feed-scroll` has the compact class).
- `src/frame/frameContract.test.ts`: the 760px check reads `src/console/FeedView.vue` selector `.feed-lines` (was `FeedShell.vue` `.feed-line`).
- `src/styles/tokens.client.test.ts`: pin list grows from 20 to 23 tokens, test renamed to "declares exactly the 23 pinned tokens in order".
- All other Phase 45 frame tests pass unchanged.

## Deviations from Plan
**1. [Rule 1 - Bug] Scroll events during the smooth pill jump could unpin and re-show the pill.**
- **Found during:** Task 2 design.
- **Fix:** `holdPinUntil` window (600ms) after a smooth jump; scroll events inside it keep the feed pinned; pinned auto-follow scrolls instantly. Tested with fake timers.
- **Files:** src/console/FeedView.vue, FeedView.test.ts. **Commit:** 45217d14.

**2. [Rule 1 - Type] `.exists()` on a `get()` wrapper** in FeedLine.test.ts failed `vue-tsc`; changed to `find()`. **Commit:** 7ea8b9ec.

**3. Process:** tests and implementation committed together per task (no separate RED/GREEN commits), as in 47-01 to 47-06. Plan type is `execute`; no TDD gate section applies.

Minor, no behavior change: the plan's FeedLine comment "no v-html" tripped the static `v-html` scan (it matches comments too), so the comment was reworded.

## Threat model
- T-47-01 mitigated: text interpolation only; the design guard scans the new `.vue` files; FeedLine.test.ts renders `<img src=x onerror=alert(1)>` for every text-bearing kind, in a speaker name and a scene title, plus a `{{color:#fff}}` token, all as literal text; FeedView.test.ts and KeeperProgress repeat it.
- T-47-06 mitigated: buttons come only from `parts`/`speakerKeyword`; tests assert say, whisper and party lines that name a place render no button (FeedLine and FeedView).
- T-47-14 mitigated: one interval only while a job is active, cleared when inactive and on unmount (timer count asserted with fake timers).

## Known Stubs
None. `FeedView` takes everything from the injected hub; with the inert defaults it shows only the empty line, which is the intended bare-mount behavior. Keywords stay inert (`actOnKeyword` is a no-op) until 47-09 provides the real `ConsoleApi`.

## Threat Flags
None.

## Deferred owner verification
No checkpoint tasks in this plan. Not exercised against a live server (owner constraint). Visual backstops the UI-SPEC lists for the owner's later check:
- At 900px (360px feed column), long keywords wrap with the text and never overflow the column.
- Scroll up in a long feed, wait for a new line: the "New lines" pill appears; clicking it scrolls down smoothly (instantly with reduced motion).
- While an NPC reply or world generation is pending: the italic progress line with the spinner shows after the last line and rotates every 5 seconds for routes with several lines.

## Commits
- 84678b23 feat(47-07): line-hue tokens, keyword labels and the labelled feed line
- 45217d14 feat(47-07): feed view with pinning, New lines pill and Keeper progress line
- 7ea8b9ec feat(47-07): FeedShell renders FeedView; shell tests follow

## Self-Check: PASSED
