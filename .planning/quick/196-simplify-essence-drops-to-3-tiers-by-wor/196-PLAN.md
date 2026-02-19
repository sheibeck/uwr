---
phase: quick-196
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [196-essence-3tier-parity]

must_haves:
  truths:
    - "Essence drop chance in combat.ts is 6% (essenceSeed < 6n)"
    - "Reagent drop chance in combat.ts is 10% (modifierSeed < 10n)"
    - "No reference to Essence IV in active source files"
    - "Module publishes without error"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Updated essence and reagent drop chances"
      contains: "essenceSeed < 6n"
  key_links:
    - from: "combat.ts essence drop block"
      to: "6% threshold"
      via: "essenceSeed < 6n"
      pattern: "essenceSeed < 6n"
    - from: "combat.ts reagent drop block"
      to: "10% threshold"
      via: "modifierSeed < 10n"
      pattern: "modifierSeed < 10n"
---

<objective>
Tune essence and reagent drop chances so that gathering crafting components takes roughly the same effort as finding a naturally-dropped affixed gear piece at the same tier.

Purpose: Currently essence drops at 12% and reagents at 15%, making crafting far faster than natural drops (8-10 kills vs 20 kills for T1 affixed gear). Lowering rates to 6% essence / 10% reagent brings expected kills to 16-18 — slightly better than natural (20 kills at T1 L1), which is the right direction.

Output: Updated drop rate constants in combat.ts. No schema changes. Publish to apply.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/data/crafting_materials.ts
@spacetimedb/src/helpers/items.ts
</context>

## Parity Math

**Natural affixed gear drop rate at T1:**
- `TIER_RARITY_WEIGHTS[1]` = [95, 5, 0, 0] — 5% uncommon at L1 baseline
- At L1: uncommonChance = min(35, 1*5 + dangerBonus) ≈ 5%
- Expected kills for naturally-dropped affixed gear at T1 L1 = **1/0.05 = 20 kills**

**Current drop rates (pre-fix):**
- Essence: 12% → E[kills for essence] = 1/0.12 ≈ 8.3 kills
- Reagent: 15% → E[kills for reagent] = 1/0.15 ≈ 6.7 kills
- Player needs BOTH before crafting. E[max(Geom(0.12), Geom(0.15))] ≈ 10-11 kills
- Result: crafting is ~2x faster than natural drops — too easy

**Target rates (post-fix):**
- Essence: **6%** → E[kills for essence] = 1/0.06 ≈ 16.7 kills
- Reagent: **10%** → E[kills for reagent] = 1/0.10 = 10 kills
- E[max(Geom(0.06), Geom(0.10))] ≈ 16-18 kills (essence is the bottleneck)
- Natural drop: 20 kills at T1 L1
- Result: crafting is slightly faster (16-18 vs 20) — appropriate, crafting effort should be slightly rewarded vs pure luck

**Why essence is the bottleneck (intentional):**
Materials are gathered passively (exploration, not kills). The kill-based bottleneck is essence.
Reagent at 10% is comfortably under the essence bottleneck, keeping crafting smooth once you have the essence.

**Confirming Essence IV is gone:**
`MATERIAL_DEFS` has exactly 3 essence entries (lesser_essence/essence/greater_essence).
`ESSENCE_TIER_THRESHOLDS` already maps: 21+→Greater Essence, 11+→Essence, 1+→Lesser Essence.
No `essence_iv` or `Essence IV` strings exist in spacetimedb/src. No changes needed to data or seeding.

<tasks>

<task type="auto">
  <name>Task 1: Lower essence and reagent drop chances for T1 crafting parity</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In combat.ts, find the two drop-chance blocks (around line 2319-2346):

1. Essence drop block — change the threshold from 12n to 6n:
   - Find: `// --- Essence drop: 12% chance, tier based on enemy level ---`
   - Change comment to: `// --- Essence drop: 6% chance, tier based on enemy level ---`
   - Find: `if (essenceSeed < 12n) {`
   - Change to: `if (essenceSeed < 6n) {`

2. Reagent drop block — change the threshold from 15n to 10n:
   - Find: `// --- Modifier reagent drop: 15% chance, level-gated by MODIFIER_REAGENT_THRESHOLDS ---`
   - Change comment to: `// --- Modifier reagent drop: 10% chance, level-gated by MODIFIER_REAGENT_THRESHOLDS ---`
   - Find: `if (modifierSeed < 15n) {`
   - Change to: `if (modifierSeed < 10n) {`

Do NOT touch any other logic, thresholds, or the ESSENCE_TIER_THRESHOLDS data (already correct 3-tier).
  </action>
  <verify>
    grep -n "essenceSeed < " spacetimedb/src/reducers/combat.ts
    grep -n "modifierSeed < " spacetimedb/src/reducers/combat.ts
    Both should show the new values (6n and 10n respectively).
  </verify>
  <done>combat.ts contains `essenceSeed < 6n` and `modifierSeed < 10n`. No other occurrences of the old 12n/15n thresholds in the drop blocks.</done>
</task>

<task type="auto">
  <name>Task 2: Publish module</name>
  <files></files>
  <action>
Publish the updated module to apply the drop rate changes. No schema changes were made, so no --clear-database needed.

Run: spacetime publish uwr --project-path spacetimedb

If publish fails due to compile error, check the changed lines for typos and retry.
  </action>
  <verify>
    spacetime publish uwr --project-path spacetimedb
    Exits with status 0 and no error output.
  </verify>
  <done>Module published successfully. Drop rate changes are live.</done>
</task>

</tasks>

<verification>
- grep -n "essenceSeed < " spacetimedb/src/reducers/combat.ts  → shows `< 6n`
- grep -n "modifierSeed < " spacetimedb/src/reducers/combat.ts → shows `< 10n`
- grep -rn "essence_iv\|Essence IV" spacetimedb/src/             → no matches
- spacetime publish exits 0
</verification>

<success_criteria>
- Essence drops at 6% per kill per enemy template (down from 12%)
- Reagent drops at 10% per kill per enemy template (down from 15%)
- Expected kills to have both components: ~16-18 (matches T1 natural affixed gear at ~20 kills)
- Module published with no errors
- Essence IV is confirmed absent from codebase (already clean)
</success_criteria>

<output>
After completion, create `.planning/quick/196-simplify-essence-drops-to-3-tiers-by-wor/196-SUMMARY.md`
</output>
