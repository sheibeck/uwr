---
phase: 11-add-enemy-popover-tooltip
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useCombat.ts
  - src/components/CombatPanel.vue
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "Hovering an enemy spawn row shows a styled popover tooltip matching equipment tooltip appearance"
    - "Tooltip displays each individual enemy name in the group"
    - "Tooltip displays the faction affiliation of the enemy group"
    - "Moving mouse away from the enemy row hides the tooltip"
  artifacts:
    - path: "src/composables/useCombat.ts"
      provides: "EnemySummary with factionName field"
      contains: "factionName"
    - path: "src/components/CombatPanel.vue"
      provides: "show-tooltip/move-tooltip/hide-tooltip events on enemy spawn rows"
      contains: "show-tooltip"
    - path: "src/App.vue"
      provides: "Tooltip rendering for enemy-type items (memberNames, factionName)"
      contains: "memberNames"
  key_links:
    - from: "src/composables/useCombat.ts"
      to: "faction table"
      via: "enemyTemplate.factionId -> factions lookup"
      pattern: "factionId"
    - from: "src/components/CombatPanel.vue"
      to: "src/App.vue"
      via: "show-tooltip event emission"
      pattern: "show-tooltip"
---

<objective>
Add a popover tooltip to enemy spawn rows in the Enemies panel that shows individual enemy member names and faction affiliation, reusing the existing tooltip system already used for equipment items.

Purpose: Provide richer enemy information on hover, consistent with the established tooltip pattern.
Output: Enhanced enemy hover tooltips in the CombatPanel Enemies section.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/useCombat.ts
@src/components/CombatPanel.vue
@src/App.vue
@src/ui/styles.ts
@src/module_bindings/enemy_template_type.ts
@src/module_bindings/faction_type.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add factionName to EnemySummary and pass factions to useCombat</name>
  <files>src/composables/useCombat.ts, src/App.vue</files>
  <action>
1. In `src/composables/useCombat.ts`:
   - Add `factions` to the `UseCombatArgs` type as `factions: Ref<FactionRow[]>` (import `FactionRow` from module_bindings).
   - Add `factionName: string` field to the `EnemySummary` type (existing type near line 27).
   - In the `availableEnemies` computed (line ~347), after looking up the `template`, resolve the faction name:
     ```
     const factionName = template?.factionId
       ? factions.value.find(f => f.id.toString() === template.factionId!.toString())?.name ?? ''
       : '';
     ```
   - Include `factionName` in the returned EnemySummary object alongside existing fields.

2. In `src/App.vue`:
   - Find where `useCombat` is called (around line ~870) and add `factions` to the arguments object. The `factions` ref is already available from `useGameData` (line ~660).
  </action>
  <verify>Run `npx tsc --noEmit` — no type errors. Verify `factionName` appears in the EnemySummary type and is populated in `availableEnemies` computed.</verify>
  <done>EnemySummary type includes factionName, resolved from enemyTemplate.factionId via faction table lookup. useCombat receives factions ref from App.vue.</done>
</task>

<task type="auto">
  <name>Task 2: Add tooltip events to enemy spawn rows and render enemy tooltip content</name>
  <files>src/components/CombatPanel.vue, src/App.vue</files>
  <action>
1. In `src/components/CombatPanel.vue`:
   - Update the `EnemySummary` local type (line ~338) to include `factionName: string`.
   - On the enemy spawn `<div>` element (the one with `v-for="enemy in enemySpawns"`, around line 167), add tooltip event handlers following the exact same pattern as loot items (lines 29-37):
     ```
     @mouseenter="$emit('show-tooltip', {
       item: {
         name: enemy.name,
         enemyMembers: enemy.memberNames,
         factionName: enemy.factionName,
         level: enemy.level,
         groupCount: enemy.groupCount,
       },
       x: $event.clientX,
       y: $event.clientY,
     })"
     @mousemove="$emit('move-tooltip', { x: $event.clientX, y: $event.clientY })"
     @mouseleave="$emit('hide-tooltip')"
     ```
   - Remove the existing native `:title` attribute on the `<span>` element (line 173) since the popover replaces it.

2. In `src/App.vue`:
   - In the tooltip rendering block (lines ~536-558), add enemy-specific content AFTER the existing armor line and BEFORE the closing `</div>`:
     ```
     <div v-if="tooltip.item?.enemyMembers?.length" :style="styles.tooltipLine">
       <div :style="{ fontWeight: 500, marginBottom: '0.2rem' }">Members:</div>
       <div v-for="(member, idx) in tooltip.item.enemyMembers" :key="idx">
         {{ member }}
       </div>
     </div>
     <div v-if="tooltip.item?.factionName" :style="styles.tooltipLine">
       Faction: {{ tooltip.item.factionName }}
     </div>
     ```
   - This reuses the existing `styles.tooltip`, `styles.tooltipTitle`, and `styles.tooltipLine` styles for visual consistency with equipment tooltips. The tooltip title will show the enemy group name via the existing `tooltip.item?.name` rendering.
  </action>
  <verify>
1. Run `npx tsc --noEmit` — no type errors.
2. Run `npm run build` — build succeeds.
3. Manual: Start the app, navigate to a location with enemies, hover over an enemy spawn row in the Enemies accordion. A styled popover should appear showing the group name as title, individual member names listed, and faction name displayed.
  </verify>
  <done>Enemy spawn rows in the Enemies panel show a styled popover tooltip on hover. The tooltip lists individual member names and faction affiliation. The popover uses the same visual style as equipment tooltips. The native title attribute is removed in favor of the popover.</done>
</task>

</tasks>

<verification>
- Hover an enemy group with multiple members (e.g., x2 or x3 group) — tooltip shows each individual name
- Hover an enemy with a known faction — tooltip shows "Faction: {name}"
- Hover an enemy with no faction (factionId is null) — no faction line appears
- Mouse leave hides the tooltip
- Equipment tooltips still work correctly (no regression)
- Tooltip follows cursor on mousemove
</verification>

<success_criteria>
- Enemy spawn hover shows popover tooltip with same styling as equipment tooltips
- Individual enemy member names listed in the tooltip
- Faction affiliation displayed when the enemy has one
- No regression to existing tooltip functionality for equipment/loot items
</success_criteria>

<output>
After completion, create `.planning/quick/11-add-enemy-popover-tooltip-showing-indivi/11-SUMMARY.md`
</output>
