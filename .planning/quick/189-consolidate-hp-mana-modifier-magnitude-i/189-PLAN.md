---
phase: quick-189
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useCrafting.ts
  - src/components/CraftingModal.vue
autonomous: true
must_haves:
  truths:
    - "Crafting modal shows correct HP/mana modifier magnitudes (5/8/15 per essence tier)"
    - "Crafting modal shows correct primary-stat modifier magnitudes (1/2/3 per essence tier)"
    - "No inline HP_MANA_MAGNITUDE constant exists in CraftingModal.vue"
  artifacts:
    - path: "src/composables/useCrafting.ts"
      provides: "getModifierMagnitude helper and consolidated magnitude constants"
      exports: ["getModifierMagnitude"]
    - path: "src/components/CraftingModal.vue"
      provides: "Crafting modal using imported getModifierMagnitude instead of local copy"
  key_links:
    - from: "src/components/CraftingModal.vue"
      to: "src/composables/useCrafting.ts"
      via: "import { getModifierMagnitude }"
      pattern: "getModifierMagnitude"
---

<objective>
Consolidate client-side HP/mana modifier magnitude constants into a single `getModifierMagnitude` helper in `useCrafting.ts`, removing the duplicated `HP_MANA_MAGNITUDE` inline constant from `CraftingModal.vue`.

Purpose: Eliminate duplication between CraftingModal.vue (HP_MANA_MAGNITUDE + getMagnitudeForStat) and useCrafting.ts (ESSENCE_MAGNITUDES) so there is one client-side source of truth for modifier magnitudes.
Output: Single `getModifierMagnitude(essenceName, statKey)` function exported from useCrafting.ts
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/useCrafting.ts
@src/components/CraftingModal.vue
@spacetimedb/src/data/crafting_materials.ts (server-side reference — do not modify)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add getModifierMagnitude helper to useCrafting.ts</name>
  <files>src/composables/useCrafting.ts</files>
  <action>
In `src/composables/useCrafting.ts`, consolidate the magnitude data into a single lookup:

1. Replace the existing `ESSENCE_MAGNITUDES` constant (lines 35-39) with a new `MODIFIER_MAGNITUDE_BY_ESSENCE` constant that includes the stat-specific HP/mana overrides. Key by display name (not snake_case like server), values as numbers (not bigint like server):

```typescript
// Mirrors server-side MODIFIER_MAGNITUDE_BY_ESSENCE + ESSENCE_MAGNITUDE in
// spacetimedb/src/data/crafting_materials.ts — client copy for display purposes only.
const MODIFIER_MAGNITUDE_BY_ESSENCE: Record<string, Record<string, number>> = {
  'Lesser Essence':  { hpBonus: 5, manaBonus: 5 },
  'Essence':         { hpBonus: 8, manaBonus: 8 },
  'Greater Essence': { hpBonus: 15, manaBonus: 15 },
};

const ESSENCE_MAGNITUDES: Record<string, number> = {
  'Lesser Essence':  1,
  'Essence':         2,
  'Greater Essence': 3,
};
```

2. Export a standalone function OUTSIDE the `useCrafting` composable (it needs no reactive state):

```typescript
/**
 * Returns the magnitude for a modifier stat + essence combination.
 * Checks MODIFIER_MAGNITUDE_BY_ESSENCE for stat-specific overrides (HP/mana)
 * first, then falls back to ESSENCE_MAGNITUDES.
 *
 * Mirrors server-side getModifierMagnitude() in crafting_materials.ts
 */
export function getModifierMagnitude(essenceName: string, statKey: string): number {
  return MODIFIER_MAGNITUDE_BY_ESSENCE[essenceName]?.[statKey] ?? ESSENCE_MAGNITUDES[essenceName] ?? 1;
}
```

3. Keep ESSENCE_MAGNITUDES in place (still used by essenceItems computed to populate magnitude on each essence item). Keep it as a module-level const, not re-exported — only getModifierMagnitude is exported.

4. The existing `essenceItems` computed still references `ESSENCE_MAGNITUDES[template.name]` on line 273 — this is fine, it provides the base magnitude for the dropdown display. No change needed there.
  </action>
  <verify>Run `npx vue-tsc --noEmit` from the project root to confirm no type errors. Grep for `getModifierMagnitude` in useCrafting.ts to confirm the export exists.</verify>
  <done>useCrafting.ts exports getModifierMagnitude(essenceName, statKey) that returns 5/8/15 for hpBonus/manaBonus and 1/2/3 for all other stats, with a comment noting it mirrors the server-side version.</done>
</task>

<task type="auto">
  <name>Task 2: Update CraftingModal.vue to use imported getModifierMagnitude</name>
  <files>src/components/CraftingModal.vue</files>
  <action>
In `src/components/CraftingModal.vue`:

1. Add import at top of the `<script setup>` block (after the existing `import { computed, ref } from 'vue';` line):
```typescript
import { getModifierMagnitude } from '../composables/useCrafting';
```

2. DELETE the `HP_MANA_MAGNITUDE` constant (lines 246-250):
```typescript
// DELETE THIS ENTIRE BLOCK
const HP_MANA_MAGNITUDE: Record<string, Record<string, number>> = {
  'Lesser Essence': { hpBonus: 5, manaBonus: 5 },
  'Essence':        { hpBonus: 8, manaBonus: 8 },
  'Greater Essence':{ hpBonus: 15, manaBonus: 15 },
};
```

3. REPLACE the `getMagnitudeForStat` function (lines 252-257) with a simplified version that delegates to the imported helper:
```typescript
function getMagnitudeForStat(statKey: string): number {
  if (!selectedCatalystId.value) return 0;
  const essenceItem = props.essenceItems.find(e => e.templateId.toString() === selectedCatalystId.value?.toString());
  if (!essenceItem) return 1;
  return getModifierMagnitude(essenceItem.name, statKey);
}
```

The key difference: the old version did `HP_MANA_MAGNITUDE[essenceItem.name]?.[statKey] ?? essenceItem.magnitude ?? 1` — the new version calls `getModifierMagnitude(essenceItem.name, statKey)` which does the same lookup internally but from the consolidated source in useCrafting.ts.

4. The template reference `getMagnitudeForStat(affix.statKey)` on line 102 remains unchanged — it calls the local wrapper which now delegates to the imported function.
  </action>
  <verify>Run `npx vue-tsc --noEmit` from the project root to confirm no type errors. Grep CraftingModal.vue for `HP_MANA_MAGNITUDE` to confirm it is gone. Grep CraftingModal.vue for `getModifierMagnitude` to confirm the import is present.</verify>
  <done>CraftingModal.vue no longer defines HP_MANA_MAGNITUDE inline. getMagnitudeForStat delegates to imported getModifierMagnitude from useCrafting.ts. The live preview in the crafting modal displays identical magnitudes as before (5/8/15 for HP/mana, 1/2/3 for other stats).</done>
</task>

</tasks>

<verification>
1. `npx vue-tsc --noEmit` passes with no errors
2. `HP_MANA_MAGNITUDE` does not appear in CraftingModal.vue
3. `getModifierMagnitude` is exported from useCrafting.ts
4. `getModifierMagnitude` is imported in CraftingModal.vue
5. ESSENCE_MAGNITUDES still exists in useCrafting.ts (used by essenceItems computed)
6. No changes to any server-side files
</verification>

<success_criteria>
- Single source of truth for client-side modifier magnitudes in useCrafting.ts
- CraftingModal.vue imports and uses the helper instead of defining its own copy
- Type check passes
- Identical runtime behavior (same magnitude numbers displayed in crafting modal)
</success_criteria>

<output>
After completion, create `.planning/quick/189-consolidate-hp-mana-modifier-magnitude-i/189-SUMMARY.md`
</output>
