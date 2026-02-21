---
phase: quick-242
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useCombat.ts
  - src/components/LocationGrid.vue
autonomous: true
requirements: [QUICK-242]

must_haves:
  truths:
    - "Enemy nameplate shows full name e.g. 'Night Rat Scrapper' (template + role), not just template name"
    - "Level indicator (L5) is visually smaller and muted, not competing with enemy name"
    - "Right-click context menu on enemy has no 'Members' item"
  artifacts:
    - path: "src/composables/useCombat.ts"
      provides: "EnemySummary with full name derived from template + role displayName"
    - path: "src/components/LocationGrid.vue"
      provides: "Nameplate rendering with smaller level badge, context menu without members"
  key_links:
    - from: "src/composables/useCombat.ts"
      to: "src/components/LocationGrid.vue"
      via: "EnemySummary.name prop"
      pattern: "name:.*role.*displayName|name:.*template.*name"
---

<objective>
Polish the enemy nameplate in LocationGrid:
1. Show full enemy name (template name + role displayName, e.g. "Night Rat Scrapper")
2. Make the level indicator visually subordinate (smaller font, muted opacity)
3. Remove the "Members" item from the right-click context menu

Purpose: After quick-238 enemies are individual spawns (groupCount always 1). The members submenu
is meaningless. The nameplate should show the enemy's full identity including role.

Output: Cleaner enemy tiles with full names and no dead UI affordances.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/242-enemy-nameplate-shows-full-name-smaller-/242-PLAN.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Derive full enemy name in useCombat.ts availableEnemies</name>
  <files>src/composables/useCombat.ts</files>
  <action>
In the `availableEnemies` computed (around line 373), the map block builds each EnemySummary.
Currently `name: spawn.name` uses just the template name stored on the spawn row.

Update the name derivation to include the role displayName when a role exists:
- A spawn has at most one EnemySpawnMember (groupCount is always 1 post-quick-238)
- The member's roleTemplateId maps to an EnemyRoleTemplate with a `displayName` field
- The `members` array is already computed in the same block (lines 385-395)

Replace:
```
name: spawn.name,
```
With logic that builds the full name:
```typescript
const roleTemplate = members.length > 0
  ? enemyRoleTemplates.value.find(
      (r) => r.id.toString() === members[0].roleTemplateId.toString()
    )
  : undefined;
const fullName = roleTemplate?.displayName
  ? `${template?.name ?? spawn.name} ${roleTemplate.displayName}`
  : (template?.name ?? spawn.name);
```
Then use `name: fullName` in the returned object.

Note: `template` variable is already defined just above (line 382-384). `members` is already computed
(lines 385-394). `enemyRoleTemplates` is already in scope via the useCombat args.
Do not change the EnemySummary type — `name: string` stays.
  </action>
  <verify>TypeScript compiles: `npm run type-check` or `npx vue-tsc --noEmit` passes with no new errors.</verify>
  <done>availableEnemies returns names like "Night Rat Scrapper" for enemies that have a role template, and just the template name for enemies without a role.</done>
</task>

<task type="auto">
  <name>Task 2: Nameplate visual polish and remove Members from context menu in LocationGrid.vue</name>
  <files>src/components/LocationGrid.vue</files>
  <action>
Three changes in LocationGrid.vue:

**A. Nameplate: split name and level into separate elements**

Current (line ~34-37):
```html
<div :style="{ display: 'flex', alignItems: 'center', gap: '0.3rem' }">
  <span :style="styles[enemy.conClass] ?? {}">
    {{ enemy.name }} (L{{ enemy.level }})
  </span>
</div>
```

Replace with two sibling spans — name prominent, level small and muted:
```html
<div :style="{ display: 'flex', alignItems: 'center', gap: '0.3rem' }">
  <span :style="styles[enemy.conClass] ?? {}">{{ enemy.name }}</span>
  <span :style="{ fontSize: '0.65rem', opacity: 0.55, fontWeight: 'normal' }">L{{ enemy.level }}</span>
</div>
```

**B. Context menu: remove Members item**

Current (lines ~448-453):
```typescript
if (enemy.memberNames && enemy.memberNames.length > 0) {
  items.push({
    label: `Members: ${enemy.memberNames.join(', ')}`,
    disabled: true,
    action: () => {},
  });
}
```

Delete this entire block. With groupCount always 1, memberNames is always empty anyway,
but removing the code makes the intent explicit and prevents future confusion.
  </action>
  <verify>
1. Run dev server (`npm run dev`) and navigate to a location with enemies.
2. Confirm enemy tiles show name and level as separate elements — name in con color, level indicator smaller/muted to the right.
3. Right-click an enemy — confirm no "Members:" item in the context menu.
  </verify>
  <done>
- Enemy nameplate displays full name (e.g. "Night Rat Scrapper") in con color, with a small muted "L5" suffix
- Right-click context menu shows only "Careful Pull" and "Aggressive Pull" (no Members item)
  </done>
</task>

</tasks>

<verification>
After both tasks:
- `npm run type-check` (or `npx vue-tsc --noEmit`) passes with no new errors
- Enemy tiles in-game show the full role-qualified name
- Level indicator is visually subordinate to the name
- No "Members" entry in the right-click context menu
</verification>

<success_criteria>
Enemy nameplate shows "Night Rat Scrapper" style names (template + role), the level badge is small and muted, and the right-click menu is clean with only pull options.
</success_criteria>

<output>
After completion, create `.planning/quick/242-enemy-nameplate-shows-full-name-smaller-/242-SUMMARY.md`
</output>
