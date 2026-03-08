---
phase: quick-350
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
  - src/App.vue
  - src/module_bindings/
autonomous: true
---

<objective>
Fix combat_loop PANIC on role.trim() and gate combat UI until intro narration completes.
</objective>

<tasks>
<task type="auto">
  <name>Task 1: Fix PANIC and gate combat UI</name>
  <files>spacetimedb/src/reducers/combat.ts, src/App.vue</files>
  <action>
  - Fix getEnemyAttackSpeed call: pass template.role instead of template object
  - Add combatUiVisible computed in App.vue that requires "The System settles in to watch." event
  - Pass combatUiVisible instead of isInCombat to NarrativeConsole
  - Republish server and regenerate bindings
  </action>
</task>
</tasks>
