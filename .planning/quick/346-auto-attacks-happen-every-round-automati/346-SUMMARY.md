---
phase: quick-346
plan: 01
started: "2026-03-08T04:39:48Z"
completed: "2026-03-08T04:42:15Z"
duration: "2min"
tasks_completed: 2
tasks_total: 2
key-files:
  modified:
    - spacetimedb/src/reducers/combat.ts
    - src/composables/useCombat.ts
    - src/App.vue
decisions:
  - "Removed redundant auto-attack fallback calls in cooldown/ability-fail paths to prevent double auto-attacking"
  - "Removed auto_attack branches from narration event builder (buildRoundEvents) alongside summary builder"
---

# Quick 346: Auto-attacks Happen Every Round Automatically

Every player auto-attacks every round unconditionally; abilities and flee are bonus actions layered on top.

## What Changed

### Server (combat.ts)
- Removed `auto_attack` from valid submitted action types (only `ability` and `flee` accepted)
- Removed default `auto_attack` action insertion for non-submitters (they just get the unconditional auto-attack)
- Added unconditional auto-attack loop after player action processing: every active non-fled player calls `processPlayerAutoAttackForRound`
- Successfully fled players skip auto-attack; failed flee attempts still auto-attack
- Removed redundant fallback auto-attack calls in cooldown and ability-fail catch blocks (prevents double auto-attacking)
- Updated action confirmation message to show "(+ auto-attack)" for ability submissions
- Removed `auto_attack` branches from compact summary builder and narration event builder

### Client (useCombat.ts, App.vue)
- Removed `submitAutoAttack` function and its export
- Removed `[Auto-attack]` from action prompt options
- Updated prompt header: "Choose your action (auto-attack is automatic):"
- Removed auto-attack keyword click handler in App.vue
- Removed `auto_attack` case from action feedback text

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 5644cfd | Server: unconditional auto-attack every round |
| 2 | e2069b7 | Client: remove auto-attack option from UI |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prevented double auto-attack on cooldown/ability-fail**
- **Found during:** Task 1
- **Issue:** The cooldown fallback and ability-fail catch blocks called `processPlayerAutoAttackForRound` directly, which would cause double auto-attacks since the new unconditional loop also calls it
- **Fix:** Removed the explicit auto-attack calls from those fallback paths; the unconditional loop handles them
- **Files modified:** spacetimedb/src/reducers/combat.ts
- **Commit:** 5644cfd

**2. [Rule 2 - Missing functionality] Cleaned narration event builder**
- **Found during:** Task 1
- **Issue:** The `buildRoundEvents` function (narration summary) also had an `auto_attack` else branch that would become dead code
- **Fix:** Removed the auto_attack branch from `buildRoundEvents` alongside the compact summary builder
- **Files modified:** spacetimedb/src/reducers/combat.ts
- **Commit:** 5644cfd

## Verification

- Server TypeScript compiles without new errors (pre-existing errors in unrelated files only)
- Client TypeScript compiles without new errors (pre-existing error in LogWindow.vue only)

## Self-Check: PASSED
