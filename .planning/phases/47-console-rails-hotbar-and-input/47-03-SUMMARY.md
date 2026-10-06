---
phase: 47-console-rails-hotbar-and-input
plan: 03
subsystem: client-rails-hotbar
tags: [rails, hotbar, pure-module, tdd]
requires: []
provides:
  - "effectViews / effectPolarity / effectName / effectTimeText / effectIcon / splitOverflow / EFFECT_CHIP_LIMIT"
  - "xpProgress (progress into level, clamped, Max level)"
  - "partyMembers / partySize / isPartyLeader / healthPercent"
  - "routeLevel / routeLevelLabel / routesFrom"
  - "nearbyRows / nodeStatus / visibleNodes"
  - "trackedQuests"
  - "eventCard / eventSplit / formatTimeLeft"
  - "HOTBAR_SLOT_COUNT, orderedHotbars, activeHotbar, hotbarSlots, slotKey, slotForKey, abilityIcon, cooldownRemainingMicros, cooldownFraction, cooldownLabel, slotTitle, slotAriaLabel, isUnaffordable, nextHotbarIndex, selectorAriaLabel"
affects: [47-08, 47-10, 47-11]
tech-stack:
  added: []
  patterns: ["pure table-tested modules over structural row subsets", "Map lookups for kind tables (no prototype keys)", "Number() only for display math, barFraction for fractions"]
key-files:
  created:
    - src/rails/effects.ts
    - src/rails/effects.test.ts
    - src/rails/xp.ts
    - src/rails/xp.test.ts
    - src/rails/party.ts
    - src/rails/party.test.ts
    - src/rails/levelRange.ts
    - src/rails/levelRange.test.ts
    - src/rails/nearby.ts
    - src/rails/nearby.test.ts
    - src/rails/quests.ts
    - src/rails/quests.test.ts
    - src/rails/worldEvent.ts
    - src/rails/worldEvent.test.ts
    - src/hotbar/hotbar.ts
    - src/hotbar/hotbar.test.ts
  modified: []
key-decisions:
  - "Route levels use the per-location rule (region floor(dangerMultiplier/100) + the destination's levelOffset, min 1; offset 0 exact, otherwise one level either side), not research A5's region-wide min/max. Swapping is a change to routeLevel alone."
  - "Effect time shows only in combat (roundsRemaining is frozen outside combat); the For/Against split is null until a counter moves."
  - "item_cooldown cannot drive a slot sweep: no column links a hotbar slot to an item (research S9). Missing data, not a scope choice; only ability_cooldown is used."
  - "Up-family effect icons are polarity-aware: a negative stat bonus or damage_up shows PhArrowFatLinesDown, not the up arrow."
  - "Slot title omits the cost part for resourceType 'none' ('Rest · 30s') instead of '0 none'; the aria label reads '1 second' for one second."
requirements-completed: [CON-03, CON-04, CON-05]
status: complete
duration: 25min
completed: 2026-10-05
---

# Phase 47 Plan 03: Rails and hotbar derivations Summary

Seven pure rail modules and the hotbar module that turn subscribed rows into chip, card, row and slot views, each table-tested with the cooldown boundary cases (ready at the end, positive one microsecond before, clamped for clock skew, ceil-seconds labels).

## What was built
- `src/rails/effects.ts`: own-character chip views ordered by id; debuff = `*_down`, `damage_taken`, `dot`, `fear`, every `CC_TYPES` entry (via `@game-data/mechanical_vocabulary`) or a negative magnitude; name from `sourceAbility` else the type in words; `'{n} rounds'` only in combat; 8-chip overflow split.
- `src/rails/xp.ts`: progress into the level over that level's need from `@game-data/xp`, clamped; `Max level` with a full track at `MAX_LEVEL`.
- `src/rails/party.ts`: members except the player, leader first then join order then id, unknown members as empty cards, mana or stamina bar, health percent.
- `src/rails/levelRange.ts`: `Safe`, `Lv 6`, `Lv 5–7` (en dash); routes deduped by destination, ordered by name then id.
- `src/rails/nearby.ts`: NPC, object, node, player order; hints `NPC · hail`, `Examine`, `Gather`/`Depleted`/`In use`, `Lv n`; vendor flag; per-character node visibility.
- `src/rails/quests.ts`: active rows named from templates, `Ready`, bar only above one step, description otherwise, ordered by acceptedAt then id.
- `src/rails/worldEvent.ts`: soonest-ending active event of the region (deadline 0 last), objective progress text, split null until a counter moves, contribution, `more`, `formatTimeLeft` (`3d 4h`, `2h 14m`, `14m`, `Under 1m`, `Ending`).
- `src/hotbar/hotbar.ts`: ten slots keyed 1-9 then 0, active hotbar choice, the 27-kind icon table (a test walks `ABILITY_KINDS` and requires a non-fallback icon for each), cooldown math and labels, titles, aria labels, affordability, selector wrap.

## Verification
- `pnpm exec vitest run --dir src --maxWorkers=2`: 51 files, 896 tests pass (includes the `src/styles` design guards and `gameDataAlias`).
- `pnpm exec vue-tsc -b`: clean.
- Plan tests: effects, xp, party, quests, levelRange, nearby, worldEvent, hotbar all green (144 new tests).

## Deviations from Plan
- Process (same as 47-01 and 47-02): implementation and tests were written together and committed once per task, not as separate RED/GREEN commits.
- [Rule 1 - Bug avoided] Effect icon for the up family (`*_bonus`, `armor_up`, `damage_up`) follows polarity: a debuff (negative magnitude) shows the down arrow. The plan's bullet reads `*_bonus -> PhArrowFatLinesUp`; a down-tinted chip with an up arrow would mislead. Positive cases match the plan exactly. Commit 6b7e2901.
- `slotTitle` omits the cost part for `resourceType: 'none'` and `slotAriaLabel` uses `1 second` (singular). The plan's `Firebolt · 12 mana · 6s` and `ready in 5 seconds` cases are unchanged. Commit a88e6c5e.
- `abilityIcon` uses a `Map` (own entries only) instead of an own-property check on an object literal; same behavior, and `constructor` / `__proto__` fall back to `PhSparkle` (tested).

## Commits
- 6b7e2901: feat(47-03): effect chip and XP progress derivations
- 8c8df29f: feat(47-03): party member and tracked quest derivations
- 33cfd118: feat(47-03): route level labels and Nearby row derivations
- a88e6c5e: feat(47-03): world event card and hotbar derivations

## Known Stubs
None. `nearbyRows` takes `objects` as an optional input defaulting to `[]` because no subscribed table lists location objects (research Q3, A7); that is a documented data gap, not a stub.

## Threat Flags
None. T-47-01b: views return plain strings only. T-47-10: `Number()` is used after clamping or for bounded math; every division guards a non-positive max (tests cover max 0, zero duration and 10^30 xp).

## Flagged assumptions
- CON-03 edge probe stays a manual-review flag for the verifier (effect ownership filter, frozen time out of combat, XP clamping and max level are covered by tests).
- Route levels use the per-location rule; the owner's try-out confirms.
- `item_cooldown` is not subscribed and cannot drive a slot sweep (no slot-to-item column, research S9).
- The event card's side names are not produced here: the For/Against split carries only percentages; the component (47-10) labels the sides `For` / `Against` because `world_event` has no per-faction column (UI-SPEC A10).

## Self-Check: PASSED
All 16 files exist; commits 6b7e2901, 8c8df29f, 33cfd118 and a88e6c5e verified in git log.
