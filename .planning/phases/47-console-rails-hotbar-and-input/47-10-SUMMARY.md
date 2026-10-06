---
phase: 47-console-rails-hotbar-and-input
plan: 10
subsystem: client-context-rail
tags: [vue, context-rail, nearby, quests, world-event]
requires: ["47-03", "47-06", "47-07"]
provides:
  - "HereCard, NearbyList, TrackingList, WorldEventCard and the shared ContextContent (rail now, Map sheet in 47-12)"
  - "ContextRail renders ContextContent"
affects: [47-12]
tech-stack:
  added: []
  patterns: ["no-prop components over GAME_KEY / CONSOLE_KEY / FRAME_KEY with inert defaults", "fragment root so aside > section stays flat", "aria-disabled plus a guarded handler for offline actions"]
key-files:
  created:
    - src/rails/HereCard.vue
    - src/rails/NearbyList.vue
    - src/rails/TrackingList.vue
    - src/rails/WorldEventCard.vue
    - src/rails/WorldEventCard.test.ts
    - src/rails/ContextContent.vue
    - src/rails/ContextContent.test.ts
    - src/frame/ContextRail.test.ts
  modified:
    - src/frame/ContextRail.vue
key-decisions:
  - "ContextContent is a fragment (no wrapper element), so the rail's `aside > section` count stays three without an event and four with one. The Map sheet (47-12) must give it a flex-column parent with a 16px gap."
  - "Unknown place: with a character whose location or region is missing, the kicker reads `Here` and the title `Unknown place` (the region name is not invented)."
  - "The world event split labels the sides `For` and `Against` with percentages only (47-03: world_event has no per-faction column); the bar renders only when a counter is non-zero."
  - "Offline: every rail button carries aria-disabled and its handler returns early, in addition to the console's own ready() guard."
requirements-completed: [CON-04, CON-02]
status: complete
duration: 30min
completed: 2026-10-05
---

# Phase 47 Plan 10: Context rail content Summary

The desktop context rail now shows the Here card with routes out (level range or Safe), Nearby rows with one-click hail, trade, gather, whisper and invite, tracked quests with progress, and the active world event card with objective progress and a For/Against bar only once a counter has moved.

## What was built
- **`WorldEventCard.vue`**: renders nothing unless `eventCard(...)` returns a card for the character's region. Kicker row `World event` with the time left (refreshed every 60 s by an interval cleared on unmount), title at 14/500, one 3px progress bar per objective, the 6px two-segment split bar (accent leading, neutral-700 trailing, 4px gap) with `For n%` / `Against n%` only when `card.split` exists, `Your contribution n` when non-zero, and a ghost `{n} more` button calling `frame.openScreen('events')`. Pinned to the rail bottom with `margin-top: auto`.
- **`HereCard.vue`**: `Here · {Region}` kicker, location title, one `button.route-row` per route (PhArrowRight, name, `.tag-neutral` level or `.tag-accent` Safe), `No known routes.` when empty, click calls `console.travel`. No character: the Phase 45 `Here` heading and `Your location appears here.`
- **`NearbyList.vue`**: rows from `nearbyRows` with `objects: []` (no source table, research Q3 / A7). NPC rows hail, vendors get a `Trade with {name}` icon button (`console.trade()`), available nodes gather, Depleted rows are 45% opacity, Depleted and In use rows have no action, player rows have always-visible `Whisper {name}` and `Invite {name}` buttons. Icon buttons are 28px (44px under 900px).
- **`TrackingList.vue`**: `progress/required` with a 3px bar when required is above 1, the 2-line-clamped description otherwise, PhCheck and `Ready` for completed quests.
- **`ContextContent.vue`**: HereCard, NearbyList, TrackingList, WorldEventCard as sibling sections.
- **`ContextRail.vue`**: `aside.context-rail[aria-label="Context"]` holding `ContextContent`; every Phase 45 style declaration kept (the `h6` and `.empty` styles moved into the rail components).

## Verification
- `pnpm exec vitest run --dir src --maxWorkers=2`: 72 files, 1270 tests pass (was 1228; 42 new: WorldEventCard 15, ContextContent 26, ContextRail 1).
- `pnpm exec vue-tsc -b`: exits 0. `pnpm build`: passes, "bundle clean: 4 files scanned".
- `git status --porcelain spacetimedb src/module_bindings`: empty. Nothing published, no server touched, no push.
- Design guards (`src/styles`: colors, scale, svg, v-html, icon library, media queries) pass over every new `.vue` file.

## Existing Phase 45 assertions changed
None. `src/frame/railsShell.test.ts` and `src/frame/frameContract.test.ts` pass unmodified (the inert game renders the three Phase 45 lines; the rail is still 288px wide).

## Deviations from Plan
**1. Process:** tests and implementation were committed together per task (no separate RED/GREEN), as in earlier 47 plans. The plan type is `execute`, so no TDD gate section applies.

**2. Added beyond the plan:** `src/frame/ContextRail.test.ts` covers the "with a provided game the rail shows the content" bullet of Task 3 without editing `railsShell.test.ts` (which the plan forbids editing).

**3. [Rule 1 - Layout bug avoided] Split segment `min-width: 0`.** The two flex segments plus the 4px gap can exceed 100% at 62% + 38%; segments shrink with `min-width: 0` so the bar never overflows the card.

**4. `.card-meta` override.** Nocturne's `.card-meta` is 11px, off the 10/12/14/20 scale, so the split meta row sets 12px in the scoped styles.

## Threat model
- T-47-01b mitigated: every name (location, region, NPC, node, player, quest, description, event, objective) is a text interpolation; img-onerror tests in ContextContent.test.ts and WorldEventCard.test.ts; the designContract no-`v-html` guard passes.
- CON-04 prohibition (no For/Against or faction bar while both counters are zero): tested (no `.split` element and no `For` / `Against` text with both at 0, and with an event but no movement).
- T-47-07 and T-47-17 accepted as planned (server re-validates names, connectivity, node state and combat).

## Known Stubs
None. Nearby objects: `objects` is passed as an empty list because no subscribed table lists examinable objects (research Q3, UI-SPEC A7); a documented data gap, the Object row type is implemented and tested in 47-03.

## Threat Flags
None.

## Flagged assumptions
- Nearby objects (UI-SPEC A7) stay unresolved until the owner decides on a server table; no client change will be needed.
- Split bar gap is 4px, not the UI-SPEC's 2px (the spacing-scale guard allows 0/4/8/16/24/32/48/64 only).
- Kicker for an unknown place is `Here` with the `Unknown place` title (the UI-SPEC only says `Unknown place`).
- `ContextContent` is a fragment: 47-12 must mount it in a column flex container with `gap: 16px`.

## Deferred owner verification
No checkpoint tasks in this plan. Not exercised against a live server or real layout (owner constraint; happy-dom has no layout):
- Desktop 1280x800: the Here card is the focal point; the event card sits at the rail bottom (`margin-top: auto`) when the content is short and the rail scrolls inside itself when long.
- Click a route: the feed shows `› go to {name}` and the character moves. Click an NPC: hail starts a conversation. Click a vendor's storefront button: the Vendor screen opens. Click an available node: `› gather {name}` and the gather starts.
- Nearby players: Whisper pre-fills `whisper {name} ` in the input; Invite sends and echoes `› invite {name}`.
- Disconnect: rail buttons dim to 45% and do nothing.
- In a region with an active world event: objective bars move, `For`/`Against` bar appears only after a counter moves, the time left drops each minute, `{n} more` opens Events with several events.
- Route level ranges (`Lv 7–9`) match the owner's expectation of the old client's rule (47-03 flag).

## Commits
- 9933627a feat(47-10): world event card with objective progress and conditional split bar
- 494d5023 feat(47-10): Here card, Nearby list, Tracking list and shared ContextContent
- 8f854b9c feat(47-10): context rail renders ContextContent

## Self-Check: PASSED
All 9 files exist; commits 9933627a, 494d5023 and 8f854b9c verified in git log.
