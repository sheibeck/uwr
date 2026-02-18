---
phase: quick
plan: 163
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/crafting_materials.ts
  - spacetimedb/src/seeding/ensure_items.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true

must_haves:
  truths:
    - "Enemies level 1-10 drop Essence I"
    - "Enemies level 11-20 drop Essence II"
    - "Enemies level 21-30 drop Essence III"
    - "Enemies level 31+ drop Essence IV"
    - "Essence IV exists as an ItemTemplate in the seeded database"
  artifacts:
    - path: "spacetimedb/src/data/crafting_materials.ts"
      provides: "Essence IV in MATERIAL_DEFS with tier 4n"
      contains: "essence_iv"
    - path: "spacetimedb/src/seeding/ensure_items.ts"
      provides: "Essence IV seeded as ItemTemplate"
      contains: "Essence IV"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "4-tier essence drop selection"
      contains: "essenceIVTemplate"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "Essence IV ItemTemplate"
      via: "iter().find(t => t.name === 'Essence IV')"
      pattern: "essenceIVTemplate"
---

<objective>
Fix essence drop tier thresholds and add Essence IV.

The current code uses wrong 5-level-wide bands (1-5 / 6-10 / 11+) instead of the intended 10-level-wide bands (1-10 / 11-20 / 21-30 / 31+). Essence IV does not exist yet as data or a seeded template.

Purpose: Enemy tiers are 10 levels wide, so essence tiers must match that granularity. Without Essence IV, level 31+ enemies have no valid essence to drop.
Output: Updated threshold logic in combat reducer, new Essence IV material definition and seeded ItemTemplate.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Essence IV to material data and seed</name>
  <files>spacetimedb/src/data/crafting_materials.ts, spacetimedb/src/seeding/ensure_items.ts</files>
  <action>
    In `spacetimedb/src/data/crafting_materials.ts`:
    - In the `MATERIAL_DEFS` array, after the `essence_iii` entry (line 127), add:
      `{ key: 'essence_iv', name: 'Essence IV', tier: 4n, sources: ['drop'], dropCreatureTypes: ['beast', 'construct', 'spirit', 'undead', 'humanoid'], affinityStats: [] },`
    - Update the comment on line 34 from "13 materials across 3 tiers (10 original + 3 Essence)" to "14 materials across 3 tiers (10 original + 4 Essence)".
    - No MATERIAL_AFFIX_MAP entry needed — Essences have no affixes (consistent with the other three).

    In `spacetimedb/src/seeding/ensure_items.ts`:
    - Update the comment on line 1809 from "All 13 materials seeded here: 10 original (Tier 1-3) + 3 Essence variants." to "All 14 materials seeded here: 10 original (Tier 1-3) + 4 Essence variants."
    - After the `upsertMaterial({ name: 'Essence III', tier: 3n, vendorValue: 12n });` call (line 1870), add:
      `upsertMaterial({ name: 'Essence IV', tier: 4n, vendorValue: 24n });`
    - No recipe template changes needed — all existing recipes produce base tier-1 gear and correctly use `essenceI`.
  </action>
  <verify>Grep for "essence_iv" in crafting_materials.ts and "Essence IV" in ensure_items.ts returns matches.</verify>
  <done>"Essence IV" exists in MATERIAL_DEFS with tier 4n, and upsertMaterial call for 'Essence IV' with vendorValue 24n is present in ensureGearMaterialItemTemplates.</done>
</task>

<task type="auto">
  <name>Task 2: Fix essence drop thresholds in combat reducer</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
    In `spacetimedb/src/reducers/combat.ts`:

    1. After the `essenceIIITemplate` lookup (line 2271), add a fourth lookup:
       `const essenceIVTemplate = [...ctx.db.itemTemplate.iter()].find(t => t.name === 'Essence IV');`

    2. Replace the 3-tier threshold block (lines 2311-2314):
       ```
       const essenceToDrop =
         enemyLevel >= 11n ? essenceIIITemplate :
         enemyLevel >= 6n  ? essenceIITemplate  :
                             essenceITemplate;
       ```
       with the corrected 4-tier block:
       ```
       const essenceToDrop =
         enemyLevel >= 31n ? essenceIVTemplate  :
         enemyLevel >= 21n ? essenceIIITemplate :
         enemyLevel >= 11n ? essenceIITemplate  :
                             essenceITemplate;
       ```

    No other changes in this file.
  </action>
  <verify>Grep for "essenceIVTemplate" in reducers/combat.ts shows both the lookup and the threshold usage. Grep for "6n" in the essence drop block returns no match (old threshold removed).</verify>
  <done>Combat reducer looks up Essence IV template and selects it for enemies level 31+, uses Essence III for 21-30, Essence II for 11-20, Essence I for 1-10.</done>
</task>

</tasks>

<verification>
After both tasks:
- `grep -n "essence_iv" spacetimedb/src/data/crafting_materials.ts` returns 1 match (MATERIAL_DEFS entry)
- `grep -n "Essence IV" spacetimedb/src/seeding/ensure_items.ts` returns 1 match (upsertMaterial call)
- `grep -n "essenceIVTemplate" spacetimedb/src/reducers/combat.ts` returns 2 matches (lookup + threshold use)
- `grep -n "6n" spacetimedb/src/reducers/combat.ts` near the essence drop block returns no match (old threshold gone)
- Module builds without TypeScript errors: run `cd spacetimedb && npm run build` or equivalent
</verification>

<success_criteria>
- Essence IV defined in MATERIAL_DEFS with tier: 4n
- Essence IV seeded as ItemTemplate with vendorValue: 24n
- Combat reducer uses correct 10-level-wide essence tiers: 1-10 → I, 11-20 → II, 21-30 → III, 31+ → IV
- No TypeScript compilation errors
</success_criteria>

<output>
After completion, create `.planning/quick/163-fix-essence-tiers-1-10-i-11-20-ii-21-30-/163-SUMMARY.md`
</output>
