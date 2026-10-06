---
phase: 48-combat-encounter
plan: 05
subsystem: client-combat-controller
tags: [vue-client, combat, keyboard, screens]
status: complete
requires: ["48-04"]
provides:
  - "createCombatController: one per frame, shared targets, Tab and Esc keys, ally selection, round clock"
  - "CombatController contract, COMBAT_KEY and createInertCombat in src/game/context.ts"
  - "'encounter' ActiveScreen value and the combat screen lock in useScreens"
  - "AppFrame provides COMBAT_KEY and renders the hidden 'Target: {name}' status line"
affects: [48]
tech-stack:
  added: []
  patterns: ["per-frame controller with an inert injection default", "document keydown guarded to a narrow scope, preventDefault only when acting", "effectScope owned by the controller so dispose() stops the ticker and watchers"]
key-files:
  created:
    - src/combat/useCombatController.ts
    - src/combat/useCombatController.test.ts
  modified:
    - src/game/context.ts
    - src/frame/useScreens.ts
    - src/frame/useScreens.test.ts
    - src/frame/tabs.ts
    - src/frame/AppFrame.vue
    - src/frame/AppFrame.screens.test.ts
    - src/frame/AppFrame.populated.test.ts
key-decisions:
  - "Tab scope also bails when any [role=menu] is in the DOM (the open account menu), so the account menu keeps native Tab"
  - "The hidden status line is set when a target is requested (plan text), not from the server echo, so rapid presses do not flicker the announcement"
  - "The ally watcher uses flush 'sync' so allyTargetId and allyArgFor never lag a participant or party change"
  - "The controller owns a child effectScope; dispose() removes the keydown listener and stops the ticker and watchers together"
requirements-completed: [CMB-01, CMB-05]
metrics:
  tasks: 2
  files: 9
  completed: 2026-10-06
---

# Phase 48 Plan 05: Combat controller, encounter screen value and combat lock Summary

One per-frame combat controller now holds the targeting, Tab and Esc keyboard handling, ally selection and the shared round clock; the frame provides it, closes open screens at combat start and knows an 'encounter' screen value. No visible UI changes beyond one visually hidden status line.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Combat controller with targets, Tab and Esc keys, ally selection, round clock | 1c2cecb5 | src/game/context.ts, src/combat/useCombatController.ts, src/combat/useCombatController.test.ts |
| 2 | 'encounter' screen value, combat lock, AppFrame wiring | b2a96b1a | src/frame/useScreens.ts, useScreens.test.ts, tabs.ts, AppFrame.vue, AppFrame.screens.test.ts, AppFrame.populated.test.ts |

## What was built

- **context.ts**: `CombatController` interface, `COMBAT_KEY`, `createInertCombat()` (allyTargetId null, resolving true, down false, empty status, no-op methods, cycle false, allyArgFor undefined). `FrameControls.openScreen` accepts `'encounter'`.
- **useCombatController.ts**: `requestTarget` (living hostile only, last requested id, 'Target: {displayName}', reducer error caught and logged); `cycle(dir)` over living hostile ids in ascending order via `nextTargetId`; document keydown with the Tab branch (every guard: repeat, composition, Ctrl/Meta/Alt, combat active, connected, reducers present, no screen open, no menu in the DOM, not a text field, focus on body or inside `.encounter-panel` / `.feed-region`; `preventDefault` only when `cycle` acted) and the Esc branch (blurs a non-text focused element inside the panel or feed, no screen open); ally selection with `allyResetNeeded` (fight end, row gone, left the party; dead ally keeps selection) and `allyArgFor` via `allyTargetFor`; one `useCooldownTicker` active only in combat with an open round; `down` at 0 HP; `dispose()`.
- **useScreens.ts**: `ActiveScreen` and `open` accept `'encounter'`; `useScreens({ locked })` gates `open`, `toggle` and `openFromMore` to encounter and More while locked, closes other screens when locked turns true, closes an open encounter when it turns false; `syncLayout(true)` clears encounter as well as More. `SCREENS` and `src/screens/screens.ts` untouched.
- **tabs.ts**: `tabForScreen(ActiveScreen)`; 'encounter' falls to More.
- **AppFrame.vue**: reads `game` once, `locked = combat.active`, `openScreen` widened, `activeId` excludes 'encounter', `provide(COMBAT_KEY, combatController)` with dispose on unmount, and a visually hidden `div.target-status[role=status]` (text interpolation only).

## Pinned assertions changed deliberately

1. `src/frame/AppFrame.populated.test.ts` "shows the Phase 45 empty lines and the empty feed line with no spinner": `expect(w.find('[role="status"]').exists()).toBe(false)` became `expect(w.find('[role="status"]:not(.target-status)').exists()).toBe(false)`. The plan requires a hidden `role="status"` at the frame root; the assertion's intent (no loading status) is kept.

Nothing else in a Phase 45/47 test changed. `screens.test.ts` (7 ids) and the existing `useScreens.test.ts` and `TabBar.test.ts` cases pass unchanged.

## Verification

- `pnpm exec vitest run src/combat/useCombatController.test.ts src/game/gameData.test.ts`: 93 passed.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 90 files, 1613 tests passed (1554 before).
- `pnpm exec vue-tsc -b`: exit 0.
- `git diff --quiet HEAD -- src/screens/screens.ts`: clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Phase 45 "no status element" assertion collided with the required hidden status line**
- **Found during:** Task 2
- **Issue:** The plan-mandated `role="status"` element broke `AppFrame.populated.test.ts`.
- **Fix:** Gave the element class `target-status` and narrowed the pinned selector (listed above).
- **Commit:** b2a96b1a

**2. [Rule 2 - Missing critical] Account menu guard on Tab**
- **Found during:** Task 1 (threat T-48-17: scope guards, "account menu open" in the truth list)
- **Issue:** The controller has no handle on the account menu state; with the menu open and focus on the body Tab would be taken.
- **Fix:** Tab bails when a `[role="menu"]` exists in the document (tested).
- **Commit:** 1c2cecb5

Otherwise the plan executed as written.

## Auth gates

None.

## Known Stubs

None. Nothing opens the 'encounter' sheet yet: a later plan adds the sheet body. Until then, 'encounter' as the active screen on mobile would hide the feed with no sheet drawn; no code path sets it in this plan.

## Threat Flags

None beyond the plan's register. T-48-17 and T-48-18: each guard (text field, composition, repeat, modifiers, open screen, menu, focus scope, offline, no combat) has a test, plus the Esc way out. T-48-20: one ticker only in combat with an open round (timer-count tests), cleared by `dispose()` along with the listener (tested).

## Flagged assumptions

- Unchanged from the plan: with one living hostile already targeted, Tab stays native (no preventDefault), as in RESEARCH Q6, against the UI-SPEC wording "keeps native behavior off". The Esc way out is a planner addition for A4. Both are for owner UAT.
- The Tab scope treats a focused composer input (focused on mount on desktop) as a text field, so the owner must press Esc (or click away) before Tab cycles. This follows the spec's "text field keeps native Tab" rule.
- `targetStatus` reflects the last request, not the server echo; a refused request leaves the hidden line stale until the next request or the fight end.

## Deferred owner verification

Optional, in a fight (nothing visible changes yet except focus behavior):
1. With two or more enemies, click the page body or a feed line, then press Tab and Shift+Tab: the target should cycle (visible once the rail from a later plan lands; for now check the server log or the character's target).
2. Press Tab with the cursor in the input: focus should move natively and the target must not change.
3. Focus a feed keyword button or an encounter control, press Esc: focus returns to the page, so Enter can focus the input.
4. Start a fight with the Map drawer open: the drawer closes and header buttons stay inert until the fight ends.

## Self-Check: PASSED

- FOUND: src/combat/useCombatController.ts, src/combat/useCombatController.test.ts, src/game/context.ts, src/frame/useScreens.ts, src/frame/tabs.ts, src/frame/AppFrame.vue
- FOUND commits: 1c2cecb5, b2a96b1a
