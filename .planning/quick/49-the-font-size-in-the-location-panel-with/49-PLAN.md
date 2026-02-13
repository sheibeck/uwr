---
phase: quick-49
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ui/styles.ts
  - src/components/LocationGrid.vue
autonomous: true
must_haves:
  truths:
    - "Location panel text is noticeably more readable than before"
    - "Section labels, tile text, and secondary info all scale up proportionally"
  artifacts:
    - path: "src/ui/styles.ts"
      provides: "Increased font sizes for grid section labels, grid tiles, and travel tiles"
    - path: "src/components/LocationGrid.vue"
      provides: "Increased inline font sizes for group count, empty state, and NPC description"
  key_links: []
---

<objective>
Increase font sizes throughout the Location panel (LocationGrid and related grid styles) to improve readability.

Purpose: The current font sizes (0.65rem-0.78rem) are too small for comfortable reading of location information like enemies, resources, players, and NPCs.
Output: Updated styles with bumped font sizes across the Location panel.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/ui/styles.ts
@src/components/LocationGrid.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Bump Location panel font sizes in styles.ts and LocationGrid.vue</name>
  <files>src/ui/styles.ts, src/components/LocationGrid.vue</files>
  <action>
In `src/ui/styles.ts`, increase these font sizes:

1. `gridSectionLabel` (line ~1373): `fontSize` from `'0.65rem'` to `'0.75rem'` — section headers (ENEMIES, RESOURCES, PLAYERS, NPCS)
2. `gridTile` (line ~1383): `fontSize` from `'0.78rem'` to `'0.88rem'` — enemy/resource/player tiles
3. `gridTileTravel` (line ~1414): `fontSize` from `'0.78rem'` to `'0.88rem'` — travel destination tiles
4. `gridTileGoButton` (line ~1429): `fontSize` from `'0.7rem'` to `'0.78rem'` — travel Go buttons

In `src/components/LocationGrid.vue`, increase these inline font sizes:

5. Line ~32 (enemy group count `x{{ enemy.groupCount }}`): `fontSize` from `'0.7rem'` to `'0.78rem'`
6. Line ~95 (empty players "No other adventurers here."): `fontSize` from `'0.75rem'` to `'0.85rem'`
7. Line ~127 (NPC description text): `fontSize` from `'0.65rem'` to `'0.75rem'`

Each bump is roughly +0.1rem, keeping proportional relationships intact. Do NOT change any colors, spacing, or other properties — only fontSize values.
  </action>
  <verify>
Run `npm run build` (or the project's build command) to confirm no syntax errors. Visually inspect that all seven fontSize values have been updated in the correct locations.
  </verify>
  <done>All Location panel font sizes bumped by ~0.1rem. Section labels at 0.75rem, tiles at 0.88rem, secondary text proportionally increased. Build succeeds.</done>
</task>

</tasks>

<verification>
- grep for the old font sizes (0.65rem in gridSectionLabel, 0.78rem in gridTile/gridTileTravel) to confirm they are replaced
- Build completes without errors
</verification>

<success_criteria>
Location panel text is visibly larger and more readable while maintaining the existing visual hierarchy (section labels smaller than tile text, secondary info smaller than primary).
</success_criteria>

<output>
After completion, create `.planning/quick/49-the-font-size-in-the-location-panel-with/49-SUMMARY.md`
</output>
