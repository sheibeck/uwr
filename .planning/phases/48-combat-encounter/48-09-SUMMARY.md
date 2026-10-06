---
phase: 48-combat-encounter
plan: 09
subsystem: client-composer
tags: [vue-client, combat, rounds, hotbar]
status: complete
requires: ["48-08"]
provides:
  - "RoundRow: choice chip, round timer bar with Resolving state, Ready and Flee, above the hotbar slots in combat"
  - "Combat composer placeholder 'Choose your action…'"
affects: [48]
tech-stack:
  added: []
  patterns: ["two-row stacking decided by a feature-detected ResizeObserver on a watched template ref (container queries are pinned to HeaderBar)", "aria-disabled buttons that stay focusable; states derive from the combat_action row only"]
key-files:
  created:
    - src/combat/RoundRow.vue
    - src/combat/RoundRow.test.ts
  modified:
    - src/frame/FeedShell.vue
    - src/input/Composer.vue
    - src/input/Composer.test.ts
key-decisions:
  - "ROUND_ROW_STACK_PX = 520 is a component constant; the observer is created from a post-flush watch on the row ref, so a row that mounts after combat starts is observed too"
  - "Resolving shows when either the controller's resolving flag or the timer state says so; the bar is empty and aria-valuenow 0 then"
  - "Ready and Flee keep separate pending flags (double-click guards only); no state is drawn from them"
  - "Combat placeholder wins over the conversation text but not over Reconnecting"
requirements-completed: [CMB-05, CMB-06]
metrics:
  tasks: 2
  files: 5
  completed: 2026-10-06
---

# Phase 48 Plan 09: Round row, Ready and Flee, combat placeholder Summary

In combat a round row sits directly above the hotbar slots: choice chip, round timer bar with seconds (or a 'Resolving…' status with a spinner), Ready (auto-attack now) and Flee. The composer input reads 'Choose your action…'. Client only: nothing under `spacetimedb/` or `src/module_bindings/` changed.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | The round row component | 044ce416 | src/combat/RoundRow.vue, RoundRow.test.ts |
| 2 | Mount the round row and the combat placeholder | 38c8eb68 | src/frame/FeedShell.vue, src/input/Composer.vue, Composer.test.ts, RoundRow.test.ts |

Each task was committed once with its tests (task-level `tdd`; plan type is `execute`, so no RED/GREEN commit gate).

## What was built

- **RoundRow.vue**: renders only while `game.combat.active`. Chip from `choiceChip` (neutral and accent use `tag-neutral` / `tag-accent`, Fleeing uses the health tint; sword, check, runner or the ability kind icon at 12px; `title` is the full text). Timer: progressbar `aria-label="Round timer"`, `aria-valuenow` seconds left, `aria-valuemax` round length, fill width from the controller fraction with a 250ms linear transition; `6s` cell (aria-hidden) or a `role="status"` 'Resolving…' with `PhCircleNotch` and an empty bar. Ready calls `submitCombatAction({ characterId, targetEnemyId? })`, adding the target only when `livingTargetId` returns one. Flee calls `fleeCombat({ characterId })`; with the flee row it reads 'Flee chosen' (check icon, `aria-pressed`, health tint) and ignores clicks; an ability row reverts it. Both use `aria-disabled` (45% opacity) from `roundControls` (resolving, down, offline, or a choice exists for Ready). Failures are caught and logged with `console.warn`.
- **Stacking**: `stacked` = not desktop or measured content width below 520; `mobile` = not desktop (44px buttons). Stacked form is a grid (`minmax(0, 1fr) auto auto`, areas `chip ready flee` / `timer timer timer`) with DOM order unchanged. No `@container` and no width media query; without `ResizeObserver` the row stacks only on mobile. One observer, disconnected on unmount or when the row goes away.
- **Reduced motion**: a `prefers-reduced-motion` block removes the bar transition and the spinner rotation.
- **FeedShell.vue**: RoundRow is the first child of `section.composer`, before HotbarRow. **Composer.vue**: after the offline branch, `game.combat.active` returns 'Choose your action…'.

## Pinned assertions changed deliberately

None. Phase 45/47 assertions are unchanged. `Composer.test.ts` gained a `combat` option and three new placeholder cases through a new `combatActive` ref in its setup helper (existing cases unchanged). No new GameData or COMBAT_KEY fields, so no new inert defaults.

## Verification

- `pnpm exec vitest run src/combat/RoundRow.test.ts src/styles src/frame/frameContract.test.ts`: 6 files, 109 passed (design guards and the 23-token pin hold).
- `pnpm exec vitest run src/input src/frame src/combat src/hotbar`: 42 files, 870 passed.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 93 files, 1732 tests passed (92 files, 1698 before). No new failures.
- `pnpm exec vue-tsc -b`: exit 0.
- `grep -c "@container" src/combat/RoundRow.vue`: 0. Acceptance greps hold (`submitCombatAction(`, `fleeCombat(`, `Round timer`, `Resolving…`, `Flee chosen`, `ResizeObserver`, `prefers-reduced-motion`; FeedShell has RoundRow before HotbarRow; Composer has `Choose your action…`).

## Deviations from Plan

None - plan executed as written. One addition beyond the listed tests: a FeedShell mount test in `RoundRow.test.ts` asserting the order (round row, then hotbar row) and that the inert game renders no round row.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the register. T-48-30: chip text is interpolation only; the img-onerror test finds no img and the chip text equals the literal string. T-48-32: chip, Ready and Flee derive from the `ownAction` row; a test confirms a click does not change the chip or enable/disable Ready until the row changes. T-48-33: one feature-detected observer, disconnect tested.

## Flagged assumptions (carried for the verifier)

- CMB-05 (edge probe: unclassified): flee chosen, replaced by an ability row, refused (reducer rejection recovers) and while resolving are covered by tests.
- CMB-06 prohibition (no state the server has not recorded): holds by construction; pending flags only block double clicks.
- The two-row rule is implemented with a ResizeObserver because `frameContract.test.ts` allows only HeaderBar's container query and the 900px media pair. jsdom/happy-dom do not lay out, so the observer path is tested with a fake observer; the real width behavior needs the visual check below.
- Labels stay 'Ready' and 'Flee'; the owner can ask for verb-noun labels at UAT.

## Deferred owner verification

A1 deviation (owner sees it at UAT): Ready and Flee sit in the round row above the hotbar slots, not at the end of the slot strip.

In a fight (desktop, then a 390px viewport):
1. A row appears directly above the hotbar: chip 'Auto-attack → {target}' with a sword, a thin accent bar counting down, '10s' to '1s' (never '0s'), then a spinner with 'Resolving…' and an empty bar. Outside combat the row is gone.
2. Click Ready: the chip turns accent with a check and Ready dims; solo play resolves almost at once. Click a slot ability: chip reads '{Ability} → {target}' (accent).
3. Click Flee: chip reads 'Fleeing' (red tint), the button reads 'Flee chosen' with a check; clicking it again does nothing; choosing an ability turns it back into 'Flee'.
4. Kill the connection mid-fight: Ready and Flee dim to 45% and ignore clicks while the bar keeps counting; the input shows 'Reconnecting…'. Back online, the input shows 'Choose your action…'.
5. At about 900px width (composer 296px) and on mobile the row is two lines: chip, Ready, Flee, then bar and seconds. With a long ability and enemy name nothing overflows the composer. On mobile the buttons are 44px high.
6. With reduced motion on: the bar steps without sliding and the spinner does not rotate.

## Self-Check: PASSED

- FOUND: src/combat/RoundRow.vue, src/combat/RoundRow.test.ts, src/frame/FeedShell.vue, src/input/Composer.vue, src/input/Composer.test.ts
- FOUND commits: 044ce416, 38c8eb68
