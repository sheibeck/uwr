---
phase: quick-259
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/location.ts
  - spacetimedb/src/data/crafting_materials.ts
autonomous: true
requirements: [QUICK-259]

must_haves:
  truths:
    - "Modifier reagents represent roughly 5% of any terrain's gather pool, not 23%"
    - "Base resource items (Stone, Wood, Flax, etc.) remain the dominant gather outcome"
    - "Crafting materials (Copper Ore, Darksteel Ore, etc.) maintain relative proportions to base items"
  artifacts:
    - path: "spacetimedb/src/helpers/location.ts"
      provides: "Base pool weights scaled 5x across all terrains"
      contains: "weight: 25n"
    - path: "spacetimedb/src/data/crafting_materials.ts"
      provides: "MATERIAL_DEFS gatherEntries weights scaled 5x"
      contains: "weight: 15n"
  key_links:
    - from: "spacetimedb/src/helpers/location.ts pools"
      to: "modifier reagent weights (stay at 1n)"
      via: "5x larger pool total dilutes modifier share to ~5%"
      pattern: "modifierEntries.*weight.*1n"
---

<objective>
Reduce modifier reagent spawn rate from ~23% to ~5% by scaling base pool weights and MATERIAL_DEFS gather weights 5x, keeping modifier reagent weights at 1n.

Purpose: Modifier reagents (Clear Crystal, Ancient Rune, Iron Ward, etc.) are rare crafting ingredients that should feel like a lucky find, not a near-quarter of all gathers. The CRAFTING_MODIFIER_WEIGHT_MULTIPLIER of 0.5 is broken because floor(1 * 0.5) = 0, then max(1, 0) = 1 — so modifiers always land at weight 1n regardless of the multiplier.
Output: Two file edits. No schema changes, no publish required for logic correctness — but module must be republished to maincloud by user.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/helpers/location.ts
@spacetimedb/src/data/crafting_materials.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scale base pool weights 5x in location.ts</name>
  <files>spacetimedb/src/helpers/location.ts</files>
  <action>
In the `pools` object inside `getGatherableResourceTemplates`, multiply every `weight` value by 5. Apply these exact values:

mountains:
  Stone:       5n → 25n
  Sand:        3n → 15n
  Clear Water: 2n → 10n

woods:
  Wood:        5n → 25n
  Resin:       3n → 15n
  Dry Grass:   3n → 15n
  Bitter Herbs:2n → 10n
  Clear Water: 2n → 10n
  Wild Berries:3n → 15n

plains:
  Flax:          4n → 20n
  Herbs:         3n → 15n
  Clear Water:   2n → 10n
  Salt:          2n → 10n
  Wild Berries:  2n → 10n
  Root Vegetable:3n → 15n

swamp:
  Peat:        4n → 20n
  Mushrooms:   3n → 15n
  Murky Water: 3n → 15n
  Bitter Herbs:2n → 10n

dungeon:
  Iron Shard:  3n → 15n
  Ancient Dust:3n → 15n
  Stone:       2n → 10n

town:
  Scrap Cloth: 3n → 15n
  Lamp Oil:    2n → 10n
  Clear Water: 2n → 10n

city:
  Scrap Cloth: 3n → 15n
  Lamp Oil:    2n → 10n
  Clear Water: 2n → 10n

Do not change any other logic in this function. The modifier weight formula (max(1, floor(w * CRAFTING_MODIFIER_WEIGHT_MULTIPLIER))) and MATERIAL_DEFS injection loops remain untouched.
  </action>
  <verify>
After editing, grep for the old weights to confirm none remain:
  grep -n "weight: [2345]n" spacetimedb/src/helpers/location.ts

Should return zero matches (all pool entries now use 10n, 15n, 20n, or 25n).

Also confirm new values are present:
  grep -n "weight: 25n\|weight: 15n\|weight: 10n\|weight: 20n" spacetimedb/src/helpers/location.ts
  </verify>
  <done>
All seven terrain pools use weights that are exactly 5x their original values. No weight: 2n, 3n, 4n, or 5n entries remain in the pools object.
  </done>
</task>

<task type="auto">
  <name>Task 2: Scale MATERIAL_DEFS gatherEntries weights 5x in crafting_materials.ts</name>
  <files>spacetimedb/src/data/crafting_materials.ts</files>
  <action>
In MATERIAL_DEFS, update each gatherEntries weight by multiplying by 5. Only entries in MATERIAL_DEFS change — CRAFTING_MODIFIER_DEFS gatherEntries stay at 1n (that is intentional; they are the rare reagents).

Apply these exact values:

Copper Ore (key: 'copper_ore'):
  mountains: 3n → 15n
  plains:    2n → 10n

Iron Ore (key: 'iron_ore'):
  mountains: 2n → 10n

Darksteel Ore (key: 'darksteel_ore'):
  mountains: 1n → 5n
  dungeon:   2n → 10n

Moonweave Cloth (key: 'moonweave_cloth'):
  swamp: 1n → 5n
  woods: 1n → 5n

Do not touch any other fields (tier, vendorValue, sources, affinityStats, dropCreatureTypes, etc.).
Do not modify CRAFTING_MODIFIER_DEFS in any way.
  </action>
  <verify>
Confirm MATERIAL_DEFS gatherEntries are updated:
  grep -A2 "gatherEntries" spacetimedb/src/data/crafting_materials.ts | grep "weight:"

Expected: values of 5n, 10n, or 15n for MATERIAL_DEFS entries.

Confirm CRAFTING_MODIFIER_DEFS gatherEntries are untouched (still 1n):
  grep -n "CRAFTING_MODIFIER_DEFS" spacetimedb/src/data/crafting_materials.ts
Then read from that line — all modifier gatherEntries should still show weight: 1n.
  </verify>
  <done>
Copper Ore, Iron Ore, Darksteel Ore, and Moonweave Cloth gatherEntries all use 5x their original weights. CRAFTING_MODIFIER_DEFS entries remain unchanged at weight: 1n.

Post-change dungeon pool math: base=40, material=10 (Darksteel Ore), modifiers=3 (Clear Crystal + Ancient Rune + Iron Ward at 1n each) → total=53 → modifier share ≈ 5.7%.
  </done>
</task>

</tasks>

<verification>
After both tasks complete, verify the math for the dungeon terrain (the problematic case from the bug report):

Base entries: Iron Shard 15n + Ancient Dust 15n + Stone 10n = 40
Material entries (tier ≤ 3): Darksteel Ore 10n = 10
Modifier entries: Clear Crystal 1n + Ancient Rune 1n + Iron Ward 1n = 3
Total: 53
Modifier share: 3/53 ≈ 5.7% — target achieved.

No TypeScript compilation check needed (these are server-side data constants). The module must be republished to maincloud by the user after this change takes effect.
</verification>

<success_criteria>
- All terrain base pool weights are exactly 5x their pre-change values
- MATERIAL_DEFS gatherEntries weights are exactly 5x their pre-change values
- CRAFTING_MODIFIER_DEFS gatherEntries are unchanged at weight: 1n
- Dungeon modifier share drops from ~23% to ~5.7%
- No unrelated code touched
</success_criteria>

<output>
After completion, create `.planning/quick/259-reduce-rare-crafting-reagent-spawn-rate-/259-SUMMARY.md` using the summary template.
</output>
