---
phase: quick-326
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useCombat.ts
  - src/components/LocationGrid.vue
  - src/components/CombatPanel.vue
  - src/App.vue
  - spacetimedb/src/helpers/location.ts
autonomous: true
requirements: [GOLD-STAR, TRACK-EXCLUDE]
must_haves:
  truths:
    - "Named/boss enemies display a gold star next to their name in the location grid"
    - "Named/boss enemies display a gold star next to their name in combat"
    - "Named enemies in the NAMED ENEMIES section of LocationGrid also show a gold star"
    - "Ranger Track ability does not list boss/named enemies as trackable options"
    - "Server rejects Track attempts on boss templates as defense-in-depth"
  artifacts:
    - path: "src/composables/useCombat.ts"
      provides: "isBoss field on EnemySummary and combatEnemiesList entries"
    - path: "src/components/LocationGrid.vue"
      provides: "Gold star rendering for boss enemies in spawn list"
    - path: "src/components/CombatPanel.vue"
      provides: "Gold star rendering for boss enemies in combat roster"
    - path: "src/App.vue"
      provides: "Boss filter on trackOptions computed"
    - path: "spacetimedb/src/helpers/location.ts"
      provides: "Server-side boss rejection in spawnEnemyWithTemplate"
  key_links:
    - from: "src/composables/useCombat.ts"
      to: "src/components/LocationGrid.vue"
      via: "isBoss field on EnemySummary"
    - from: "src/composables/useCombat.ts"
      to: "src/components/CombatPanel.vue"
      via: "isBoss field on combatEnemiesList entry"
---

<objective>
Add a gold star indicator next to named/boss enemy names across the UI, and exclude boss enemies from the Ranger Track ability.

Purpose: Players need a visual indicator to distinguish named/boss enemies from regular ones, and Rangers should not be able to summon boss encounters via Track.
Output: Modified client components showing gold stars, filtered Track options, and server-side guard.
</objective>

<context>
@spacetimedb/src/schema/tables.ts (EnemyTemplate has isBoss field)
@src/composables/useCombat.ts (EnemySummary type, availableEnemies, combatEnemiesList)
@src/components/LocationGrid.vue (enemy spawn display, named enemy display)
@src/components/CombatPanel.vue (combat enemy roster display)
@src/App.vue (trackOptions computed at line 939)
@spacetimedb/src/helpers/location.ts (spawnEnemyWithTemplate at line 506)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add gold star to named/boss enemies across UI</name>
  <files>
    src/composables/useCombat.ts
    src/components/LocationGrid.vue
    src/components/CombatPanel.vue
  </files>
  <action>
1. In `src/composables/useCombat.ts`:
   - Add `isBoss: boolean` to the `EnemySummary` type (around line 30).
   - In the `availableEnemies` computed (line 376), after looking up `template` (line 385), set `isBoss: !!(template?.isBoss)` on the returned object (line 457).
   - In the `combatEnemiesList` computed (line 472), after looking up `template` (line 479), add `isBoss: !!(template?.isBoss)` to the returned object (around line 560).

2. In `src/components/LocationGrid.vue`:
   - For regular enemy spawns (line 35 where `{{ enemy.name }}` is rendered), prepend a gold star for boss enemies:
     Change `{{ enemy.name }}` to include a conditional gold star: if `enemy.isBoss`, show a gold `★` before the name. Use inline style `color: '#fbbf24'` (amber/gold) for the star span.
   - For the NAMED ENEMIES section (line 157 where `{{ ne.name }}` is rendered), prepend the same gold star unconditionally (all named enemies shown here are bosses by definition).
   - Add `isBoss?: boolean` to the `EnemySummary` type in the props (the `enemySpawns` prop type at line 285).

3. In `src/components/CombatPanel.vue`:
   - At line 39 where `{{ enemy.name }} (L{{ enemy.level }})` is rendered, prepend a conditional gold star if `enemy.isBoss`: `<span v-if="enemy.isBoss" style="color: #fbbf24">★ </span>`.
   - The `combatEnemies` prop already uses the object from `combatEnemiesList`, so no prop type change needed (it uses inline typing).
  </action>
  <verify>
    Run `npx vue-tsc --noEmit` from the project root to confirm no TypeScript errors. Visually confirm by searching for the gold star character in the modified files.
  </verify>
  <done>
    Boss enemies show a gold ★ before their name in the location grid spawn list, the named enemies section, and the combat enemy roster. Non-boss enemies show no star.
  </done>
</task>

<task type="auto">
  <name>Task 2: Exclude boss enemies from Ranger Track and add server guard</name>
  <files>
    src/App.vue
    spacetimedb/src/helpers/location.ts
  </files>
  <action>
1. In `src/App.vue`, in the `trackOptions` computed (line 939):
   - Add a filter to exclude boss templates. After the existing `.filter()` chains (after line 956, before `.sort()`), add:
     `.filter((template) => !template.isBoss)`
   - This prevents boss enemy templates from appearing in the Track selection UI.

2. In `spacetimedb/src/helpers/location.ts`, in `spawnEnemyWithTemplate` (line 506):
   - After the template lookup and existence check (after line 515 `if (!template) throw ...`), add a server-side guard:
     `if (template.isBoss) throw new SenderError('Named enemies cannot be tracked');`
   - This is defense-in-depth: even if a client bypasses the UI filter, the server rejects the spawn. Import `SenderError` if not already imported (it should already be imported in this file).
  </action>
  <verify>
    Run `npx vue-tsc --noEmit` from the project root to confirm no client TypeScript errors. Grep for `isBoss` in the modified files to confirm the filter and guard are present.
  </verify>
  <done>
    Boss enemy templates no longer appear in the Ranger Track selection panel. Server rejects any attempt to spawn a boss via spawnEnemyWithTemplate with a clear error message.
  </done>
</task>

</tasks>

<verification>
- `npx vue-tsc --noEmit` passes with no errors
- Gold star character (★) appears in LocationGrid.vue, CombatPanel.vue
- `trackOptions` in App.vue includes `.filter((template) => !template.isBoss)`
- `spawnEnemyWithTemplate` in location.ts includes `if (template.isBoss) throw new SenderError(...)`
</verification>

<success_criteria>
- Named/boss enemies are visually distinguished with a gold ★ in all enemy display contexts (location grid spawns, named enemy section, combat roster)
- Ranger Track panel does not show boss enemies as options
- Server prevents spawning boss enemies via the tracked combat path
- No TypeScript compilation errors
</success_criteria>

<output>
After completion, create `.planning/quick/326-gold-star-for-named-enemies-and-exclude-/326-SUMMARY.md`
</output>
