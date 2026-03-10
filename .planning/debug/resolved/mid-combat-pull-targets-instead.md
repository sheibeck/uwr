---
status: resolved
trigger: "Mid-combat enemy pulling targets instead of pulling"
created: 2026-03-09T00:00:00Z
updated: 2026-03-10T01:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - Two separate issues block mid-combat pulling from the UI
test: Traced click flow through clickNpcKeyword and EnemyHud
expecting: n/a
next_action: Return diagnosis

## Symptoms

expected: Clicking enemy in narrative HUD during combat starts a pull (adds enemy to fight)
actual: Clicking enemy during combat just targets it (or does nothing)
errors: none
reproduction: Be in combat, click another enemy name in narrative text
started: After Phase 33 Plan 02 added mid-combat pulling

## Eliminated

- hypothesis: Server-side resolve_pull blocks mid-combat pulls
  evidence: Did not need to investigate - the UI never calls startPull during combat at all
  timestamp: 2026-03-09

## Evidence

- timestamp: 2026-03-09
  checked: EnemyHud.vue click handler
  found: EnemyHud only shows enemies already IN combat (combatEnemies prop). Clicking emits target-enemy which calls setCombatTarget. There is no way to see or interact with non-combat zone enemies from this component.
  implication: EnemyHud is for targeting within combat, not for pulling new enemies

- timestamp: 2026-03-09
  checked: clickNpcKeyword in App.vue (line 1341) - the handler for clicking bracketed keywords in narrative text
  found: Enemy name click routing at line 1382 is guarded by `!isInCombat.value`. When in combat, enemy name clicks fall through to lines 1411-1419 which only match against combatEnemiesList (enemies already in fight). Available zone enemies not in the fight are never matched during combat.
  implication: Clicking an available enemy name in narrative text during combat either targets a same-named combat enemy or does nothing

- timestamp: 2026-03-09
  checked: startPull call sites in App.vue
  found: startPull is only called from "Careful Pull" and "Charge In" keyword handlers (lines 1365-1380). The pendingPullTargetId that feeds these is ONLY set at line 1388, inside the !isInCombat.value guard. So the entire pull initiation flow is unreachable during combat.
  implication: The server-side mid-combat pull code (resolve_pull) is completely unreachable from the UI

- timestamp: 2026-03-09
  checked: NarrativeInput.vue template (lines 4-16 vs 19-33)
  found: During combat, only EnemyHud + CombatActionBar are shown (v-if="isInCombat"). The context action bar (which could show pull options) is hidden (v-else-if). useContextActions returns [] during combat (line 43).
  implication: No pull UI exists during combat - no buttons, no context actions, no clickable path

## Resolution

root_cause: |
  The mid-combat pull feature has server-side support (resolve_pull in combat.ts) but NO client-side path to trigger it. Three UI-level blocks prevent mid-combat pulling:

  1. **clickNpcKeyword guard (App.vue:1382-1392)**: Enemy name clicks in narrative text are routed to the attack/pull flow ONLY when `!isInCombat.value`. During combat, enemy name clicks try to match against combatEnemiesList (in-fight enemies) for targeting, not availableEnemies for pulling.

  2. **pendingPullTargetId never set during combat (App.vue:1388)**: The variable that tells "Careful Pull" / "Charge In" handlers which enemy to pull is only set inside the `!isInCombat.value` block. Even if those keywords somehow fired during combat, they would fall back to finding a random available enemy.

  3. **No pull UI during combat (NarrativeInput.vue:4-16)**: During combat, the NarrativeInput shows only EnemyHud (in-fight enemies) + CombatActionBar (abilities/flee). The context action bar is hidden. There are no pull buttons or pull-related context actions available.

fix:
verification:
files_changed: []
