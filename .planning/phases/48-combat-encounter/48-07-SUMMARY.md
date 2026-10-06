---
phase: 48-combat-encounter
plan: 07
subsystem: client-feed
tags: [vue-client, feed, rounds, rendering]
status: complete
requires: ["48-06"]
provides:
  - "wireCombatFeed: round headers, wind-up blocks and narrated rounds from the combat rows into the feed store"
  - "FeedLine: round divider, wind-up warning block, late-narration tag, damage/heal amount emphasis, prop currentRound"
  - "FeedView: current-round accent and compact header spacing"
affects: [48]
tech-stack:
  added: []
  patterns: ["sync watchers over bindings that seed a snapshot, then act on new ids only", "narrative correlation by equal createdAt and equal text, matched keys remembered before the store call"]
key-files:
  created:
    - src/combat/combatFeed.ts
    - src/combat/combatFeed.test.ts
  modified:
    - src/game/gameData.ts
    - src/game/gameData.test.ts
    - src/console/FeedLine.vue
    - src/console/FeedLine.test.ts
    - src/console/FeedView.vue
    - src/console/FeedView.test.ts
key-decisions:
  - "Cast rows are filtered by combatId === current combat id before snapshot and block logic, so a direct fight-to-fight switch never replays the old fight's casts"
  - "When castsApplied drops and returns (re-applied subscription) the snapshot is re-taken but ids already seen stay seen, so a redelivered row never makes a second block"
  - "Matched narration keys are collected first and added to the matched set before setNarratedRound runs, because the call changes the entries the narrative watcher reads"
  - "FeedLine uses three v-if roots (round, wind-up, generic) instead of wrapping the existing template, keeping the existing line markup untouched"
  - "Round rules are gradients written out per state (neutral divider, accent-700) rather than a custom property, so no new token or var name is introduced"
requirements-completed: [CMB-03, CMB-04]
metrics:
  tasks: 2
  files: 8
  completed: 2026-10-06
---

# Phase 48 Plan 07: Round headers, wind-up blocks and combat line rendering Summary

The combat rows now reach the feed: an open round row produces a 'Round N' divider, a cast row that arrives after the subscription applied produces one wind-up warning block, and a combat narration is matched to its narrative row so a late Keeper line shows 'The Keeper · Round M'. FeedLine draws all of it, with neutral combat lines and 500-weight red and green amounts.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Combat feed wiring from rows to the store | 2bed6b0d | src/combat/combatFeed.ts, combatFeed.test.ts, src/game/gameData.ts, gameData.test.ts |
| 2 | Render round headers, wind-up blocks, the late tag and combat amounts | 05456442 | src/console/FeedLine.vue, FeedLine.test.ts, FeedView.vue, FeedView.test.ts |

## What was built

- **combatFeed.ts**: `wireCombatFeed({ combat, feed, clock, selfId })` installs three sync watchers (immediate) and returns a stop function. Rounds: each `action_select` row calls `addRoundHeader` (the store dedupes and ignores startedAt 0). Casts: seeded snapshot per combat id, then one `addWindup` per unseen cast id with text from `enemyAbilityName`, `windupTarget`, `landsInAtAnnouncement` and `windupParts`; placed at round `announcedRound + 1`'s startedAt, else the server-clock now as a bigint. Narratives: an unstamped `combat_narration` entry with the same createdAt microseconds and the same text as a narrative row gets `setNarratedRound`; each key matches at most once.
- **gameData.ts**: one `wireCombatFeed({ combat, feed, clock, selfId: characterKey })` call after the combat block, in the same scope as the bindings.
- **FeedLine.vue**: optional prop `currentRound`. Round line (two aria-hidden rule spans and a label), wind-up block (PhWarning 16, lead, `span.ability`, tail), Keeper label with `span.round-tag` and aria-label 'The Keeper, about round M', damage and heal bodies split by `splitLastInteger` into before text, `span.amount`, after text. Styles: combat kinds inherit Body 14 / 400 neutral-300 (the Phase 47 interim whole-line colors and the 12px combat size are removed), amounts 500 con-red / con-light-green, divider 10px uppercase 0.1em with divider or accent-700 gradient rules, wind-up block on the surface background with a con-orange icon.
- **FeedView.vue**: `openRoundKey` from `game.combat.combatId` and `openRound`; `:current-round` on each FeedLine whose roundKey equals it; compact header variant (gap 8px, margin-top 4px).

## Pinned assertions changed deliberately

None. No Phase 45/47 test pinned the whole-line damage or heal colors (the existing plain-text test uses 'Plain.', which has no integer and still passes). Existing assertions in `gameData.test.ts`, `FeedLine.test.ts` and `FeedView.test.ts` are unchanged; only new cases were added, plus two source-contract cases appended to the existing source describes.

## Verification

- `pnpm exec vitest run src/combat/combatFeed.test.ts src/game/gameData.test.ts src/console/feedStore.test.ts`: 3 files, 105 tests passed.
- `pnpm exec vitest run src/console src/styles`: 15 files, 337 tests passed.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 91 files, 1675 tests passed (1637 before).
- `pnpm exec vue-tsc -b`: exit 0.
- Design-guard grep over the diff (replaceAll, `.at(`, Object.hasOwn, v-html, `<svg`, hex colors, `color(`): no matches.

## Deviations from Plan

None - plan executed as written.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the register. T-48-24: all new strings are interpolated text; tests render an `<img onerror>` enemy, ability and target and a `<b>7</b>` damage line literally (no img or b element). T-48-25: a tag needs equal createdAt and equal text; different text or time and other kinds get no tag (tested). T-48-26 accepted: the narrative watcher exits early with no narrative rows and skips matched or stamped entries.

## Flagged assumptions

- CMB-03 (edge probe: unclassified): snapshot casts skipped, repeats deduped, N fixed at announcement (tested). A re-applied cast subscription keeps ids already seen, so it never produces a second block.
- A wind-up whose round N+1 row is not yet in the client rows is placed at the server-clock now; it sorts after that round's header in practice. For owner review at UAT.
- CMB-04 prohibition (no Keeper voice on the client): headers, wind-up copy and tags are plain system copy; no first person and no pronoun for the Keeper or an enemy.

## Deferred owner verification

Start a fight against a creature and check:
1. 'Round 1' appears as a divider above the first combat lines; the divider of the current round is purple-accent, earlier ones are grey, and when the fight ends all go grey.
2. Damage lines read in neutral grey with only the number in red (heals: green), at normal body size.
3. When an enemy announces a cast, one amber-icon warning block appears ('X winds up Y → you · lands in N rounds') and the ability name is brighter; it does not repeat.
4. After a round resolves, a late Keeper narration for an earlier round shows 'The Keeper · Round M' in muted text.
5. Reload mid-fight: only the current round header shows, and no wind-up block replays for a cast already in progress.
6. On a phone-width window the round dividers sit slightly tighter.

## Self-Check: PASSED

- FOUND: src/combat/combatFeed.ts, src/combat/combatFeed.test.ts, src/game/gameData.ts, src/console/FeedLine.vue, src/console/FeedView.vue
- FOUND commits: 2bed6b0d, 05456442
