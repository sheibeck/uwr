---
phase: quick-351
plan: 01
type: execute
wave: 1
files_modified:
  - spacetimedb/src/reducers/combat.ts
  - src/components/LogWindow.vue
autonomous: true
---

<objective>
Fix ability uses not showing in narrative window during real-time combat.
</objective>

<tasks>
<task type="auto">
  <name>Fix actorType in use_ability_realtime reducer</name>
  <action>Change actorType from 'player' to 'character' and fix args shape</action>
</task>
</tasks>
