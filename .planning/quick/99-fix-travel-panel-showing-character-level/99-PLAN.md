---
phase: quick-99
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/TravelPanel.vue
autonomous: true
must_haves:
  truths:
    - "Travel panel shows fixed location level (based on region/offset), not character-scaled level"
    - "Travel panel level display matches Location panel level display for the same location"
    - "Con color coding still reflects difficulty relative to character level"
  artifacts:
    - path: "src/components/TravelPanel.vue"
      provides: "Fixed targetLevelForLocation using base level 1 instead of character level"
  key_links:
    - from: "src/components/TravelPanel.vue"
      to: "Location panel in App.vue"
      via: "Same level formula (base=1, scaled by dangerMultiplier, plus levelOffset)"
      pattern: "Math\\.floor\\(\\(1 \\* multiplier\\) / 100\\)"
---

<objective>
Fix Travel panel displaying character's level instead of the actual location level.

Purpose: The Travel panel's `targetLevelForLocation` function currently uses the character's level as the base for the formula `Math.floor((level * multiplier) / 100) + offset`, which makes location levels scale with the player. The Location panel correctly uses `1` as the base level. This fix aligns the Travel panel with the Location panel formula.

Output: TravelPanel.vue with corrected level calculation.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/TravelPanel.vue
@src/App.vue (lines 1501-1517 for reference — currentRegionLevel computed property)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix targetLevelForLocation to use base level 1 instead of character level</name>
  <files>src/components/TravelPanel.vue</files>
  <action>
In `src/components/TravelPanel.vue`, fix the `targetLevelForLocation` function (line 115-121).

Current (WRONG):
```typescript
const targetLevelForLocation = (location: LocationRow, level: number, regions: RegionRow[]) => {
  const region = regions.find((r) => r.id.toString() === location.regionId.toString());
  const multiplier = region ? Number(region.dangerMultiplier) : 100;
  const offset = Number(location.levelOffset ?? 0n);
  const scaled = Math.floor((level * multiplier) / 100);
  return Math.max(1, scaled + offset);
};
```

Change to (CORRECT — matches App.vue currentRegionLevel formula):
```typescript
const targetLevelForLocation = (location: LocationRow, _level: number, regions: RegionRow[]) => {
  const region = regions.find((r) => r.id.toString() === location.regionId.toString());
  const multiplier = region ? Number(region.dangerMultiplier) : 100;
  const offset = Number(location.levelOffset ?? 0n);
  const scaled = Math.floor((1 * multiplier) / 100);
  return Math.max(1, scaled + offset);
};
```

The key change: replace `level` (character's level) with `1` (fixed base) in the scaling formula on the `scaled` line. Keep the `_level` parameter (prefixed with underscore) to avoid breaking the call sites that pass `playerLevel` — the parameter is still used in `sortedLocations` for the `diff` calculation which drives the con color.

Verify that in the `sortedLocations` computed property, the `diff` calculation (`targetLevel - playerLevel`) still correctly computes the difference for con coloring. This should work because `targetLevel` is now the fixed location level and `playerLevel` is the character's level — the diff drives the color coding which is the intended behavior.
  </action>
  <verify>
1. Read the modified file and confirm `targetLevelForLocation` uses `(1 * multiplier)` not `(level * multiplier)`.
2. Confirm the `sortedLocations` computed still computes `diff = targetLevel - playerLevel` for con coloring.
3. Run `npx vue-tsc --noEmit` or the project's type check to ensure no type errors.
  </verify>
  <done>
Travel panel displays fixed location levels (e.g., a location with levelOffset=2 in a 100-multiplier region shows "L3" regardless of character level). Con colors still reflect difficulty relative to the character's level. Formula matches the Location panel's currentRegionLevel calculation.
  </done>
</task>

</tasks>

<verification>
- Open the game with a level 1 character and a level 8 character — both should see the same level numbers for the same locations in the Travel panel.
- Location panel and Travel panel should show matching level numbers for the current location's neighbors.
- Con colors should still vary based on the character's level (green for easy, red for hard).
</verification>

<success_criteria>
Travel panel location levels are fixed properties of locations, not scaled by character level. A level 1 and level 8 character see the same "L3" for the same location. Con coloring still reflects relative difficulty.
</success_criteria>

<output>
After completion, create `.planning/quick/99-fix-travel-panel-showing-character-level/99-SUMMARY.md`
</output>
