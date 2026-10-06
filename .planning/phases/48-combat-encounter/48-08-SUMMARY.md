---
phase: 48-combat-encounter
plan: 08
subsystem: client-rails
tags: [vue-client, combat, encounter, rails]
status: complete
requires: ["48-07"]
provides:
  - "EncounterPanel (rail and sheet variants), HostileCard, ThreatBlock under src/combat/"
  - "ContextRail swaps to the Encounter panel while game.combat.active"
affects: [48]
tech-stack:
  added: []
  patterns: ["a computed over game.combat.active in the rail to branch without touching ContextContent", "targeted ring driven only by character.combatTargetEnemyId through the view model"]
key-files:
  created:
    - src/combat/HostileCard.vue
    - src/combat/ThreatBlock.vue
    - src/combat/EncounterPanel.vue
    - src/combat/EncounterPanel.test.ts
  modified:
    - src/frame/ContextRail.vue
    - src/frame/ContextRail.test.ts
key-decisions:
  - "The rail variant of the panel carries no padding of its own, because the 288px aside already supplies the 16px; the sheet variant sets padding 0 explicitly"
  - "The panel header (heading, plus hint on the rail) renders before the enemy binding applies, so the pre-apply state shows the heading only"
  - "Threat target is the targeted living hostile; with no target the block is not mounted"
requirements-completed: [CMB-01, CMB-02, CMB-03]
metrics:
  tasks: 2
  files: 6
  completed: 2026-10-06
---

# Phase 48 Plan 08: Encounter panel and rail swap Summary

While in a fight the desktop right rail is now the Encounter panel: one card per hostile in ascending id (boss tag, difficulty-colored name with a meaning title, level, crosshair on the target, 14px HP bar, wind-up rows), click-to-target through the combat controller, and a threat block at the bottom. The context rail returns the moment the fight ends.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Hostile card, threat block and Encounter panel | 02442784 | src/combat/HostileCard.vue, ThreatBlock.vue, EncounterPanel.vue, EncounterPanel.test.ts |
| 2 | Swap the context rail for the Encounter panel in combat | 95d4f369 | src/frame/ContextRail.vue, ContextRail.test.ts |

## What was built

- **HostileCard.vue**: `button.hostile-card` with `aria-pressed` (from the view's `targeted`), `aria-label` from the view, `aria-disabled` when defeated. Emits `select` only for a living hostile. Name carries the con class and a title of the form 'Rotfang · Hard'; the Boss tag appears only for `isBoss === true`; `PhCrosshairSimple` shows only on the target; HP bar is a progressbar with the centered value; one `PhHourglassMedium` wind-up row per cast. Styles use tokens and color-mix only, no transitions; sheet variant has `min-height: 44px`.
- **ThreatBlock.vue**: `section.threat` with `margin-top: auto`, heading with title, rows in a `64px minmax(0, 1fr) 32px` grid with a 3px bar; the own row uses accent-300 name and an accent bar; `No threat yet.` for an empty visible view.
- **EncounterPanel.vue**: injects GAME_KEY and COMBAT_KEY with inert defaults. Builds views with `hostileViews` (player level from the character, target from `combatTargetEnemyId` only, round from `combat.roundNumber`) and `threatView`. Root `section.encounter-panel` (the Tab scope class), `aria-label="Encounter"`. Cards call `controller.requestTarget`. Before `combat.applied` only the header row renders; applied with no living hostile shows `No hostiles left.` and hides the threat block.
- **ContextRail.vue**: `EncounterPanel` when `game.combat.active.value`, otherwise `ContextContent`, inside the same aside. `ContextContent.vue` is untouched (verified with `git diff --quiet HEAD`).

## Pinned assertions changed deliberately

None. Existing ContextRail and Phase 45/47 assertions are unchanged; only new test cases were added (22 in EncounterPanel.test.ts, 2 in ContextRail.test.ts).

## Verification

- `pnpm exec vitest run src/combat/EncounterPanel.test.ts src/styles`: 5 files, 85 tests passed (design guards, token pin at 23).
- `pnpm exec vitest run src/frame src/combat src/styles`: 35 files, 546 tests passed.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 92 files, 1698 tests passed (1675 before).
- `pnpm exec vue-tsc -b`: exit 0.
- No changes under `spacetimedb/` or `src/module_bindings/`; nothing published, no servers started, no push.

## Deviations from Plan

None - plan executed as written. One interpretation worth noting: the plan lists "no panel padding" for the sheet variant; the rail variant also has no panel padding because the existing 288px aside already provides the 16px (adding it would double it).

## Auth gates

None.

## Known Stubs

None. Enemy effect chips and a cast bar are intentionally not drawn (A9, backlog 999.1).

## Threat Flags

None beyond the register. T-48-27: every name, ability and target is a text interpolation or title attribute; the test renders an `<img onerror>` hostile, ability and character literally with no img element. T-48-28: a defeated card is inert (no emit, aria-disabled); the controller also skips dead enemies. T-48-29 accepted: threat rows come only from the per-sender view.

## Flagged assumptions

- CMB-01/02/03 (edge probe: unclassified): zero living hostiles, the pre-apply state, defeated cards, a missing template and long names are covered by tests. Pre-apply the heading reads 'Encounter · 0 hostiles' until the binding applies; this is the plan's "heading only" state.
- CMB-01 prohibition (no unconfirmed target ring): the ring and `aria-pressed` follow `character.combatTargetEnemyId` only; a click test confirms the ring does not move until the server row changes.
- A8: threat percent is relative to the top row; owner may revise at UAT.
- Backstop (visual): the 8-hostile, 5-threat-row, 3-wind-up panel scrolling inside the 288px rail is not covered by a unit test.

## Deferred owner verification

Start a fight and check:
1. The right rail turns into 'Encounter · n hostiles' with 'Tab to cycle' on the right; Here, Nearby, Tracking and the event card are gone, and come back when the fight ends.
2. Each hostile is a card: name colored by difficulty (hover the name for the meaning), 'Lv n', HP bar with '212/480' centered; a boss shows a small red 'BOSS' tag if one is ever flagged.
3. Click a hostile: after the server echo it gets the purple ring and crosshair; the ring does not appear before the echo.
4. A hostile that is winding up shows an amber hourglass row 'X winds up Y → you · lands in N rounds', and the count falls each round.
5. The threat block sits at the bottom: 'Threat on {target}', 'You' in light purple first, then party members with percent against the top row.
6. With many hostiles (8+) the rail scrolls with the dark scrollbar and the threat block stays at the bottom when everything fits.

## Self-Check: PASSED

- FOUND: src/combat/HostileCard.vue, src/combat/ThreatBlock.vue, src/combat/EncounterPanel.vue, src/combat/EncounterPanel.test.ts, src/frame/ContextRail.vue, src/frame/ContextRail.test.ts
- FOUND commits: 02442784, 95d4f369
