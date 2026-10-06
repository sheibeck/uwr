---
phase: 48-combat-encounter
plan: 03
subsystem: combat
tags: [vue-client, pure, combat, rounds, tdd]
status: complete
requires: ["48-02"]
provides:
  - "roundTimer, timerText, inCombatLabel, sheetMeta: ceil-seconds countdown and the header/sheet copy"
  - "choiceChip, autoAttackTarget, livingTargetId, roundControls: chip and Ready/Flee state from the combat_action row only"
  - "splitLastInteger: last standalone integer split for damage and heal lines"
  - "roundCooldownView, cooldownTotalRounds, roundsText: rounds cooldown from the ability's own cooldownSeconds"
  - "useDamageFlash: HP drop flash composable (color state, ghost chunk, summed delta, reduced flag)"
affects: [48]
tech-stack:
  added: []
  patterns: ["pure derivation modules beside unit tests; components later render text nodes only", "server constants imported through @game-data, never copied", "TargetRule-typed constants so a server rename breaks vue-tsc"]
key-files:
  created:
    - src/combat/roundClock.ts
    - src/combat/roundClock.test.ts
    - src/combat/choice.ts
    - src/combat/choice.test.ts
    - src/combat/emphasis.ts
    - src/combat/emphasis.test.ts
    - src/combat/roundCooldown.ts
    - src/combat/roundCooldown.test.ts
    - src/combat/useDamageFlash.ts
    - src/combat/useDamageFlash.test.ts
  modified: []
key-decisions:
  - "A single_enemy ability chip falls back to the current target only while it is alive; a stored targetEnemyId is shown as stored. A dead current target gives the bare ability name"
  - "An auto_attack row's stored target is used only while that enemy lives; otherwise the chip follows autoAttackTarget"
  - "single_ally with no targetCharacterId reads 'you' (the engine defaults the ally to the caster)"
  - "useDamageFlash drops a pending flash (timers, ghost, delta) on a character switch, since it belonged to the previous character; key and hp are expected to come from the same row so a switch updates both together"
  - "The ghost percentages use the same two-decimal rounding as hostileViews (68.46%)"
requirements-completed: [CMB-04, CMB-05, CMB-06]
metrics:
  tasks: 3
  files: 10
  completed: 2026-10-06
---

# Phase 48 Plan 03: Round clock, choice chip, cooldowns and flash Summary

Five pure modules under `src/combat/` now derive the round UI (timer and copy, choice chip and Ready/Flee state, amount emphasis, rounds cooldown view, damage flash), each with a unit test. No Vue component, no server or bindings change.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Round clock and choice chip | 828db9d5 | src/combat/roundClock.ts, roundClock.test.ts, choice.ts, choice.test.ts |
| 2 | Emphasis split and rounds cooldown view | d4eae653 | src/combat/emphasis.ts, emphasis.test.ts, roundCooldown.ts, roundCooldown.test.ts |
| 3 | Damage flash composable | 686bf385 | src/combat/useDamageFlash.ts, useDamageFlash.test.ts |

Each task was written test and implementation together and committed once (task-level `tdd` flag; the plan type is `execute`, so no plan-level RED/GREEN commit gate applies).

## What was built

- `roundClock.ts`: `roundTimer` computes remaining as `Number(timerExpiresAtMicros) - nowMicros`; resolving at null round or remaining <= 0; seconds `Math.ceil(remaining / 1e6)` (10s at 10_000_000, 10s at 9_000_001, 9s at 9_000_000, 1s at 1 µs); fraction clamped 0..1 over the round length; a non-positive length uses `ROUND_TIMER_MICROS` from `@game-data/combat_constants`. `timerText` gives `6s` or `Resolving…`; `inCombatLabel` and `sheetMeta` give the header tag, aria label and sheet meta copy.
- `choice.ts`: `choiceChip` is derived only from the combat_action row, the enemy rows, the ability list and the name map (no stored state). `down` wins over every row. `roundControls` makes slots, Ready and Flee inert while resolving, down or disconnected; Ready is also disabled while any row exists; `fleeChosen` mirrors the flee row.
- `emphasis.ts`: `splitLastInteger` returns three plain substrings around the last `\b\d+\b` match (null when none); markup stays literal text.
- `roundCooldown.ts`: `cooldownTotalRounds` is bigint ceil division over `EFFECT_ROUND_CONVERSION_MICROS`, floored at `MIN_EFFECT_ROUNDS` (12 s -> 3, 9 -> 3, 8 -> 2, 4 -> 1, 0 -> 1); the view total is `max(roundsRemaining, that)`. The row's wall-clock field is not read or named in the module.
- `useDamageFlash.ts`: `FLASH_COLOR_MS = 600`, `DELTA_MS = 1500`. A watch (flush sync) on key and hp; drops of the same key set ghost, active, reduced (read at the drop via `prefersReducedMotion`) and a summed delta, and restart both timers (never stack). `onScopeDispose` clears them.

## Verification

- `pnpm exec vitest run src/combat`: 11 files, 160 tests passed; `src/styles` (design guards) passed alongside the Task 2 modules.
- `pnpm exec vue-tsc -b`: exit 0.
- Full client suite `pnpm exec vitest run --dir src --maxWorkers=2`: 89 files, 1532 tests passed (48-02 baseline was 84 files, 1463 tests; the difference is the five new test files). No new failures.
- `pnpm build` was not required by this plan (no component or entry change) and was not run.
- Acceptance greps hold: roundClock.ts contains `@game-data/combat_constants`, `Math.ceil`, `Resolving…`; choice.ts contains `You are down`, `Fleeing`, `Auto-attack`; roundCooldown.ts contains `EFFECT_ROUND_CONVERSION_MICROS`, `MIN_EFFECT_ROUNDS` and 0 occurrences of `durationMicros`; useDamageFlash.ts contains `onScopeDispose`, `prefersReducedMotion`, `FLASH_COLOR_MS = 600`, `DELTA_MS = 1500`.

## Pinned assertions in earlier phases

None changed. This plan only adds new files; no Phase 45/47 test or GameData / COMBAT_KEY field was touched, so no inert defaults were needed.

## Deviations from Plan

None. The plan executed as written. One test expectation was corrected during Task 1 after the first run exposed a code choice: the single_enemy chip first fell back to the current target even when dead; it now falls back only while the target is alive (listed under key-decisions).

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-48-10 is covered by the `<b>7</b>` and `<img onerror>` emphasis tests (parts rejoin to the input and stay plain strings). T-48-11 is covered by the chip being a pure function of the row (no stored state; img-onerror enemy and ally names come back as plain text). T-48-12 is covered by the timer-count assertions (two timers at most, restarted not stacked, zero after scope stop).

## Flagged assumptions (carried for the verifier)

- CMB-05 (edge probe: unclassified): reviewed by hand and pinned by tests (first value, character switch, heal, drop-then-heal keeps the delta, summed drops with a restarted timer, reduced motion, scope stop).
- CMB-06 prohibition (no optimistic chip) holds by construction: `choiceChip` and `roundControls` take only row-derived inputs. CMB-05 prohibition (no animation under reduced motion) is delivered as the `reduced` flag; the components in plans 11 and 13 must bind the static class and declare no animation.
- UI-SPEC's `round(durationMicros / 10s)` sweep total is superseded by CONTEXT "Engine-driven fixes" (cooldownSeconds); the item-slot clause is dropped by the same decision.
- `useDamageFlash` expects `key` and `hp` to derive from the same character row. If a component feeds them from two separately-updated refs in one tick, a switch to a lower-HP character could read as a drop; bind both from one computed row.

## Deferred owner verification

No hands-on check is needed for this plan (pure modules only). At UAT, once the components land: confirm in a real fight that the seconds read `10s` down to `1s` then `Resolving…` (never `0s`), that the chip follows the target and flips to the accent check after Ready, that a damage hit flashes red with a `-n` delta that sums across hits, and that with reduced motion on the flash is a timed color with no fade.

## Self-Check: PASSED

- FOUND: src/combat/{roundClock,choice,emphasis,roundCooldown,useDamageFlash}.ts and the five matching .test.ts files
- FOUND commits: 828db9d5, d4eae653, 686bf385
