---
phase: 48-combat-encounter
plan: 10
subsystem: client-hotbar
tags: [vue-client, hotbar, combat, rounds]
status: complete
requires: ["48-09"]
provides:
  - "HotbarRow in combat: cooldowns counted in rounds ('{n} rounds'), chosen slot from the own combat_action row, inert while the round resolves or the player is down, ally target argument for single-ally abilities"
affects: [48]
tech-stack:
  added: []
  patterns: ["combat state read from game.combat.active; every new behavior is gated on it so the 47 DOM and reducer calls are unchanged out of combat", "optional reducer key added by conditional spread so the absent case has no key at all"]
key-files:
  created: []
  modified:
    - src/hotbar/HotbarRow.vue
    - src/hotbar/HotbarRow.test.ts
key-decisions:
  - "inert = inCombat && (controller.resolving || controller.down): the inert controller default has resolving true, so the combat gate keeps out-of-combat slots usable"
  - "In combat remaining = Number(roundsRemaining), so the existing ready-flash watch fires when rounds reach 0 without a second watcher"
  - "anyCooling is false in combat, so the shared ticker never runs for round-only cooldowns"
  - "useAbility keeps the literal 'useAbility({' (a pinned source marker) and adds targetCharacterId by conditional spread"
requirements-completed: [CMB-04, CMB-05, CMB-06]
metrics:
  tasks: 2
  files: 2
  completed: 2026-10-06
---

# Phase 48 Plan 10: Hotbar rounds, chosen slot, ally target Summary

In combat the hotbar counts cooldowns in rounds, marks the slot the server recorded as this round's choice, goes inert while the round resolves or the player is down, and sends the selected ally for single-ally abilities. Out of combat the Phase 47 hotbar is unchanged. Client only: nothing under `spacetimedb/` or `src/module_bindings/` changed.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 + 2 | Rounds cooldowns, inert slots, chosen slot, ally argument | 23ae544c | src/hotbar/HotbarRow.vue, src/hotbar/HotbarRow.test.ts |

Both tasks edit the same two files and share one SlotState computation, so they landed in a single commit (task-level `tdd`; plan type is `execute`, so no RED/GREEN gate).

## What was built

- **Rounds cooldowns (CMB-04)**: when `game.combat.active`, a slot takes `roundCooldownView(row, ability)`. Cooling comes from `roundsRemaining` only (wall-clock fields ignored). A cooling slot shows `span.slot-rounds` ('2 rounds', '1 round') absolutely centered (10px, 500, `--color-neutral-200`, tabular-nums) instead of `.slot-seconds`; the sweep is roundsRemaining over the total from `ability.cooldownSeconds` (12 s ability, 2 left: `66.7%`); icon and name dim; `aria-disabled`; label ends ', ready in {n} rounds'. Clicks and number keys do nothing.
- **Ticker**: `anyCooling` is false in combat, so no interval runs for round-only cooldowns.
- **Ready flash**: in combat `remaining` is the rounds count, so the existing watch flashes once when rounds reach 0; reduced motion still suppresses it.
- **Chosen slot (CMB-06)**: `chosen` is true only when `game.combat.ownAction` is an `ability` row for the slot's ability. Class `chosen` (inset 1px accent ring, 12px accent 35% glow, 16% accent tint, hover state composes), `aria-pressed="true"` only on that slot (attribute absent elsewhere), label ends ', chosen'. No optimistic state: a click only shows the 47 `pressed` class. Auto-attack, flee, no row and out of combat mark nothing.
- **Inert (A25, A21)**: `inert` = in combat and (`controller.resolving` or `controller.down`). Class `inert` (opacity 0.45), `aria-disabled`; `useSlot` returns early, so clicks and number keys are ignored.
- **Ally target (CMB-05)**: in combat `useSlot` asks `controller.allyArgFor(ability)` and adds `targetCharacterId` by conditional spread only when it returns an id; otherwise the call is exactly `{ characterId, abilityTemplateId }`. Out of combat `allyArgFor` is never consulted.

## Pinned assertions changed deliberately

None. Every Phase 45/47 assertion in `HotbarRow.test.ts` passes unchanged (including the `'useAbility({'` source marker). The test setup gained a `combat` option (active, ownAction, resolving, down, allyArg) and always provides a fake controller under `COMBAT_KEY`; the existing cases leave combat inactive. No new GameData or COMBAT_KEY fields, so no new inert defaults.

## Verification

- `pnpm exec vitest run src/hotbar src/styles`: 8 files, 170 passed (design guards and the 23-token pin hold). 16 new cases in `HotbarRow.test.ts` (rounds, boundary 0/1/2, wall clock ignored, no ticker, flash once and not under reduced motion, inert for resolving and down, never inert out of combat, connection lost mid-fight, chosen mark and clearing, auto_attack/flee rows, no optimistic chosen, ally argument with and without an id, number key path, img-onerror ability name rendered as text).
- `pnpm exec vitest run --dir src --maxWorkers=2`: 93 files, 1748 tests passed (1732 before). No new failures.
- `pnpm exec vue-tsc -b`: exit 0.
- Acceptance greps: `HotbarRow.vue` contains `roundCooldownView`, `slot-rounds`, `inert`, `COMBAT_KEY`, `allyArgFor`, `chosen`, `, chosen`.

## Deviations from Plan

None - plan executed as written. One test adjustment: the plan's example (12 s ability, 66.7%) needs a 12 s ability, but the test fixtures use 6 s abilities (2 rounds, which would sweep 100%), so that case passes `cooldownSeconds: 12n` explicitly.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the register. T-48-34: inert guard in `useSlot` and `blocked()`, covered by the resolving, down and number-key tests. T-48-35 (accepted): the id comes only from `allyArgFor`. T-48-36: the call shape with `allyArgFor` returning undefined (dead or departed ally) is exactly `{ characterId, abilityTemplateId }`.

## Flagged assumptions (carried for the verifier)

- CMB-06 prohibition (no chosen mark before the server row): holds by construction and is tested (a click yields `pressed`, never `chosen` or `aria-pressed`).
- `ownAction` is trusted to be the open-round row only (its documented contract); the hotbar does not re-check the round number.
- The chosen glow is a box-shadow on the slot; the slot strip has `overflow-y: hidden`, so the 12px outer glow may be clipped at the strip edge. Verify visually.
- Item-bound slots keep no special case (CONTEXT: no item-bound hotbar slots exist).

## Deferred owner verification

In a fight (desktop):
1. Use a cooldown ability: the slot dims, shows '2 rounds' (or '1 round') centered, with a clockwise sweep that shrinks each round; it becomes usable the moment the count reaches 0 with one brief ring flash. Clicking or pressing its number while cooling does nothing.
2. Click an ability: the slot shows the pressed look for a moment, then the chosen look (accent ring, soft glow, tint) once the round row says it is chosen. Choose a different ability: the mark moves. When the next round opens the mark clears.
3. While 'Resolving…' shows in the round row, all slots are dimmed and ignore clicks and number keys; at 0 HP the same.
4. In a group, select an ally and use a single-ally heal: it lands on the selected ally. With that ally down or gone it targets the default.
5. Outside combat the hotbar looks and behaves as before (seconds at the top right).
6. The chosen glow is not clipped awkwardly at the edges of the slot strip.

## Self-Check: PASSED

- FOUND: src/hotbar/HotbarRow.vue, src/hotbar/HotbarRow.test.ts
- FOUND commit: 23ae544c
