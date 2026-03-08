# Quick Task 350: Fix combat_loop PANIC and gate combat UI

## Changes

### Server: Fix combat_loop PANIC (spacetimedb/src/reducers/combat.ts)
- `getEnemyAttackSpeed(template)` was passing the whole template object instead of `template.role` string
- Fixed to `getEnemyAttackSpeed(template.role ?? 'damage')` with fallback

### Client: Gate combat UI until intro narration (src/App.vue)
- Added `combatIntroSeen` ref that watches private events for "The System settles in to watch."
- `combatUiVisible` computed requires both `isInCombat` AND `combatIntroSeen`
- NarrativeConsole receives `combatUiVisible` instead of `isInCombat` for `:is-in-combat` prop
- Auto-target first enemy now triggers on `combatUiVisible` instead of `isInCombat`

### Bindings
- Server republished with combat_loop fix
- Client bindings regenerated (includes `useAbilityRealtime` reducer)

## Commits
- e576182: fix(quick-350): fix combat_loop PANIC and gate combat UI until intro narration
