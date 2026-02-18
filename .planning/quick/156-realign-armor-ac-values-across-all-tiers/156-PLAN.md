---
phase: quick-156
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/items.ts
  - spacetimedb/src/seeding/ensure_items.ts
autonomous: true
must_haves:
  truths:
    - "Starter armor AC follows cloth 2/1/1, leather 3/2/2, chain 4/3/2, plate 5/4/3 (chest/legs/other)"
    - "T1 world-drop armor AC is exactly starter+1 on every slot for each armor type"
    - "Crafting base gear templates (head/wrists/hands/belt/cloak) use correct T1 other-slot AC for their armor type"
    - "Module publishes successfully and upsert pattern updates existing live rows"
  artifacts:
    - path: "spacetimedb/src/helpers/items.ts"
      provides: "STARTER_ARMOR AC values"
      contains: "ac: 2n"
    - path: "spacetimedb/src/seeding/ensure_items.ts"
      provides: "T1 world-drop and crafting base gear AC values"
      contains: "armorClassBonus: 3n"
  key_links:
    - from: "spacetimedb/src/helpers/items.ts"
      to: "spacetimedb/src/seeding/ensure_items.ts"
      via: "STARTER_ARMOR import used in ensureStarterItemTemplates"
      pattern: "STARTER_ARMOR"
---

<objective>
Realign all armor AC values across starter, T1 world-drop, and crafting base gear templates to establish a clear tier progression with consistent armor-type differentiation.

Purpose: Current AC values are 1 point too high across the board and lack a clear formula. This rebalance sets a clean baseline: starter armor is the weakest, T1 world-drop is starter+1 on every slot, and crafted standard gear matches T1 world-drop (same templates). "Other" slots (boots, head, wrists, hands, belt, neck/cloak) use a consistent AC value per armor type.

Output: Updated AC constants and seeding data. Module republish updates live rows via upsert pattern.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/items.ts
@spacetimedb/src/seeding/ensure_items.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update STARTER_ARMOR and T1 world-drop AC values</name>
  <files>spacetimedb/src/helpers/items.ts, spacetimedb/src/seeding/ensure_items.ts</files>
  <action>
Update STARTER_ARMOR in `spacetimedb/src/helpers/items.ts` (lines 21-45):

```
cloth:   chest=2n, legs=1n, boots=1n
leather: chest=3n, legs=2n, boots=2n
chain:   chest=4n, legs=3n, boots=2n
plate:   chest=5n, legs=4n, boots=3n
```

Update T1 world-drop armor in `ensureWorldDropGearTemplates` in `spacetimedb/src/seeding/ensure_items.ts`. Each T1 drop = starter+1 on every slot:

T1 cloth (Worn Robe/Trousers/Slippers):
- Worn Robe chest: armorClassBonus 4n -> 3n
- Worn Trousers legs: armorClassBonus 3n -> 2n
- Worn Slippers boots: armorClassBonus 2n -> 2n (same, matches starter+1)

T1 leather (Scuffed Jerkin/Leggings/Boots):
- Scuffed Jerkin chest: armorClassBonus 5n -> 4n
- Scuffed Leggings legs: armorClassBonus 4n -> 3n
- Scuffed Boots boots: armorClassBonus 3n -> 3n (same)

T1 chain (Dented Hauberk/Greaves/Sabatons):
- Dented Hauberk chest: armorClassBonus 6n -> 5n
- Dented Greaves legs: armorClassBonus 5n -> 4n
- Dented Sabatons boots: armorClassBonus 4n -> 3n

T1 plate (Battered Cuirass/Greaves/Boots):
- Battered Cuirass chest: armorClassBonus 7n -> 6n
- Battered Greaves legs: armorClassBonus 6n -> 5n
- Battered Boots boots: armorClassBonus 5n -> 4n

Update T1 "other" slot items in `ensureCraftingBaseGearTemplates` (same file).
The "other" AC per armor type at T1 is: cloth=2, leather=3, chain=3, plate=4.

- Iron Helm (plate, head): armorClassBonus 3n -> 4n
- Leather Bracers (leather, wrists): armorClassBonus 2n -> 3n
- Iron Gauntlets (plate, hands): armorClassBonus 2n -> 4n
- Rough Girdle (leather, belt): armorClassBonus 1n -> 3n
- Simple Cloak (cloth, neck): armorClassBonus 1n -> 2n
- Wooden Shield (offHand, armorType=none): LEAVE AS-IS at 4n (shield, not typed armor)

Update T1 world-drop cloaks in `ensureWorldDropJewelryTemplates` (same file).
The cloth "other" AC at T1 = 2:

- Rough Cloak (cloth, neck): armorClassBonus 1n -> 2n
- Wool Cloak (cloth, neck): armorClassBonus 1n -> 2n
- Drifter Cloak (cloth, neck): armorClassBonus 1n -> 2n

T2 items (Silken Robe AC=5, Ranger Jerkin AC=6, Reinforced/Stalker Cloak AC=2, T2 weapons): DO NOT CHANGE. These are out of scope for this task.
  </action>
  <verify>
Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` to verify TypeScript compilation succeeds. Then grep for all armorClassBonus values in both files to confirm the new numbers match the spec.
  </verify>
  <done>
STARTER_ARMOR values are cloth 2/1/1, leather 3/2/2, chain 4/3/2, plate 5/4/3. T1 world-drop chest/legs/boots are each starter+1. T1 "other" slots (head/wrists/hands/belt/cloak) use correct per-armor-type values. No T2 items were changed. TypeScript compiles cleanly.
  </done>
</task>

<task type="auto">
  <name>Task 2: Publish module and verify AC values in logs</name>
  <files></files>
  <action>
Publish the module using the default server (upsert pattern handles live rows, no --clear-database needed):

```bash
spacetime publish uwr --project-path spacetimedb
```

If publish fails, check `spacetime logs uwr` for errors and fix.

After successful publish, verify the seeding ran by checking logs for any errors related to item template upserts.
  </action>
  <verify>
`spacetime publish` exits with code 0. `spacetime logs uwr` shows no errors related to item template seeding.
  </verify>
  <done>
Module published successfully. All armor AC values are live and updated via upsert pattern. No database clear was needed.
  </done>
</task>

</tasks>

<verification>
- STARTER_ARMOR in items.ts: cloth chest=2, legs=1, boots=1; leather chest=3, legs=2, boots=2; chain chest=4, legs=3, boots=2; plate chest=5, legs=4, boots=3
- T1 world-drop in ensure_items.ts: each slot = starter + 1 for same armor type
- T1 "other" slot values: cloth=2, leather=3, chain=3, plate=4
- T2 items unchanged
- Module compiles and publishes
</verification>

<success_criteria>
All armor templates have correct AC values per the tier progression spec. Module is published and live. No existing items break (upsert updates templates in-place).
</success_criteria>

<output>
After completion, create `.planning/quick/156-realign-armor-ac-values-across-all-tiers/156-SUMMARY.md`
</output>
