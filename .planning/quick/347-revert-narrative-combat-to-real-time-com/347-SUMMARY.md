---
phase: quick-347
plan: 01
started: "2026-03-08T13:27:21Z"
completed: "2026-03-08T13:31:38Z"
duration: "4min"
tasks_completed: 2
tasks_total: 2
key-files:
  created:
    - src/components/CombatActionBar.vue
    - src/components/EnemyHud.vue
  modified:
    - src/components/NarrativeInput.vue
    - src/components/NarrativeConsole.vue
    - src/App.vue
decisions:
  - "Gold glow + border for targeted enemy (universal highlight, not per-conClass)"
  - "Auto-target first living enemy on combat start via isInCombat watcher"
  - "Removed inline combat_prompt text injection; CombatActionBar replaces it visually"
  - "Narrative text stream (LLM pulling) preserved during combat -- only action input changes"
---

# Quick Task 347: Revert Narrative Combat to Real-Time Combat Action Bar

Combat UI reverted from inline bracket-keyword text to dedicated ability buttons with cast bars, cooldown overlays, enemy HUD with HP bars and target highlighting.

## Commits

| # | Hash | Description |
|---|------|-------------|
| 1 | 70546b2 | Create CombatActionBar and EnemyHud components |
| 2 | 23b8d39 | Wire combat UI into NarrativeInput, NarrativeConsole, App.vue |

## What Changed

### CombatActionBar.vue (new)
- Horizontal button bar: Flee (red-tinted) + one button per character ability
- Cast bar: blue overlay fills left-to-right during casting, label changes to "Casting..."
- Cooldown: dark overlay fills right-to-left with seconds number overlaid
- Disabled states: while casting, on cooldown, or action already submitted
- Round timer on right side with pulse animation at <= 3s
- "Action locked in..." text when action submitted

### EnemyHud.vue (new)
- Compact enemy rows: name + level (con-class colored) + HP bar (green/yellow/red)
- Target highlight: gold border + glow on isTarget enemy (visually obvious)
- Boss tag indicator
- Click to target enemy (emits target-enemy event)

### NarrativeInput.vue (modified)
- Conditionally renders EnemyHud + CombatActionBar when isInCombat is true
- Falls back to existing context action bar when not in combat
- Forwards flee, use-ability, target-enemy events

### NarrativeConsole.vue (modified)
- Passes combat props through to NarrativeInput
- Dynamic scroll padding: 150px during combat (vs 90px normally)
- Forwards new combat events up to App.vue

### App.vue (modified)
- combatAbilitiesForBar computed: maps character abilities with cooldown data
- Event handlers: onCombatFlee, onCombatUseAbility (targets current/first enemy), onCombatTargetEnemy
- Auto-target watcher: when isInCombat becomes true, auto-targets first living enemy
- Removed combat_prompt injection into narrative stream (replaced by visual action bar)
- Kept all other combat event injections (round headers, status bars, summaries)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
