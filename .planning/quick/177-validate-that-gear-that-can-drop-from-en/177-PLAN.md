---
phase: quick-177
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/seeding/ensure_enemies.ts
  - spacetimedb/src/helpers/items.ts
  - spacetimedb/src/data/affix_catalog.ts
autonomous: true
must_haves:
  truths:
    - "T2 gear drops from mid/high-tier enemies"
    - "Head, wrists, hands, belt, offHand slots appear in world-drop loot tables"
    - "Rare dropped gear affix total is not capped below crafted reinforced gear"
    - "HP affix magnitudes for crafted gear match dropped gear at equivalent tier"
  artifacts:
    - path: "spacetimedb/src/seeding/ensure_enemies.ts"
      provides: "T2 gear added to mid/high-tier loot tables; T1 other-slot gear added to T1 loot tables"
    - path: "spacetimedb/src/helpers/items.ts"
      provides: "Rare affix budget cap raised from 2 to 4"
    - path: "spacetimedb/src/data/affix_catalog.ts"
      provides: "No changes expected (already correct)"
  key_links:
    - from: "spacetimedb/src/seeding/ensure_enemies.ts"
      to: "spacetimedb/src/seeding/ensure_items.ts"
      via: "findItemTemplateByName lookups for T2 templates and other-slot templates"
      pattern: "findItemTemplateByName.*ctx"
---

<objective>
Fix misalignments between dropped gear and crafted gear systems so both paths offer comparable power at equivalent tiers.

Purpose: Ensure gear-hunting and crafting are cohesive progression paths -- neither one is strictly superior to the other at any quality tier.

Output: Updated loot table seeding, affix budget fix, published module with corrected gear parity.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/crafting_materials.ts
@spacetimedb/src/data/affix_catalog.ts
@spacetimedb/src/seeding/ensure_items.ts
@spacetimedb/src/seeding/ensure_enemies.ts
@spacetimedb/src/helpers/items.ts
@spacetimedb/src/reducers/combat.ts (lines 594-640: generateLootTemplates)
@spacetimedb/src/reducers/items.ts (lines 1098-1230: craft_recipe affix application)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Audit and document all parity findings</name>
  <files>spacetimedb/src/data/affix_catalog.ts</files>
  <action>
Read and confirm the following parity analysis. NO CODE CHANGES in this task -- just verify the analysis holds by reading the actual files. Document findings as comments where helpful.

**FINDING 1 -- Slot/affix count parity: ALIGNED**
- Crafted: AFFIX_SLOTS_BY_QUALITY: dented=0, standard=1, reinforced=2, exquisite=3
- Dropped: AFFIX_COUNT_BY_QUALITY: common=0, uncommon=1, rare=2, epic=3
- Verdict: Perfect match.

**FINDING 2 -- Stat affix magnitude parity: ALIGNED for stat bonuses**
- Crafted: ESSENCE_MAGNITUDE lesser=1n, essence=2n, greater=3n. Applied per modifier slot.
- Dropped: magnitudeByTier for stat affixes (strBonus, dexBonus, intBonus, wisBonus, armorClassBonus): [1n, 2n, 3n, 4n]. Uncommon=index 0=1n, rare=index 1=2n, epic=index 2=3n.
- Verdict: Matches at uncommon/standard (1n), rare/reinforced (2n), epic/exquisite (3n).

**FINDING 3 -- HP affix magnitude: MISALIGNED (by design, acceptable)**
- Crafted with Life Stone: magnitude = Essence tier (1n/2n/3n for hpBonus).
- Dropped Vital prefix: magnitudeByTier [5n, 8n, 15n, 25n]. Uncommon=5n, rare=8n, epic=15n.
- Verdict: Dropped HP affixes are 5-5x stronger than crafted HP. This is ACCEPTABLE because:
  (a) Crafted gear gives CHOICE -- you pick exact stats. Dropped gear is random.
  (b) HP on drops uses a different scale (5n per tier-step vs 1n for stats).
  (c) Both systems use the same affix definitions; crafted uses flat Essence magnitude while drops use the affix catalog curve.
  NOTE: If this feels too lopsided, a future task could add an HP_MAGNITUDE_SCALE multiplier to crafting. For now, document as intentional asymmetry.

**FINDING 4 -- Rare affix budget cap: MISALIGNED (needs fix)**
- generateAffixData in helpers/items.ts has a special case for 'rare' quality: caps total affix magnitude at 2n.
- A rare dropped item gets 2 affixes, but total magnitude capped at 2n (e.g., +1/+1 or +2/+0).
- A crafted reinforced item (equivalent) gets 2 slots with magnitude 2n EACH = 4n total.
- Verdict: BROKEN. Rare drops are strictly worse than equivalent crafted gear. Fix: raise rare cap from 2n to 4n to match crafted reinforced total.

**FINDING 5 -- T2 gear not in any loot table: MISALIGNED (needs fix)**
- ensureLootTables filters gearTemplates to `tier <= 1n && requiredLevel <= 9n`.
- T2 gear (Steel Longsword, Silken Robe, Ranger Jerkin, etc.) exists as templates but NEVER appears in loot tables.
- Players level 11+ fight harder enemies but can only drop T1 gear.
- Verdict: BROKEN. Need to add T2 gear templates to mid/high-tier loot tables.

**FINDING 6 -- head/wrists/hands/belt/offHand missing from drop pool: MISALIGNED (needs fix)**
- ensureCraftingBaseGearTemplates creates Iron Helm, Leather Bracers, Iron Gauntlets, Rough Girdle, Wooden Shield, and many cloth/leather/chain/plate variants for these slots.
- These templates are NOT added to loot tables (they were created for crafting output, not drops).
- ensureLootTables picks from gearTemplates which filters `!row.isJunk && row.tier <= 1n && row.requiredLevel <= 9n` -- this DOES include these templates since they are tier 1n, requiredLevel 1n, and not junk.
- Wait -- actually re-checking: ensureCraftingBaseGearTemplates runs AFTER ensureLootTables. The loot table seeding does `[...ctx.db.itemTemplate.iter()].filter(...)` at call time. If ensureCraftingBaseGearTemplates runs before ensureLootTables in the syncAllContent order, they WOULD be included.

Let me verify: Check the order of seeding calls in ensure_content.ts or index.ts to determine if crafting base gear templates are seeded BEFORE loot tables. If so, these slots ARE already in loot tables. If not, they need to be added.

After reading the actual seeding order, update the findings and proceed to Task 2 only for issues that are confirmed real.
  </action>
  <verify>Read ensure_content.ts (or wherever syncAllContent is defined) and confirm the seeding order. Verify whether T1 other-slot templates (head/wrists/hands/belt/offHand) are seeded before ensureLootTables runs. Document conclusion.</verify>
  <done>All 6 findings documented with confirmed status (aligned, misaligned-needs-fix, or misaligned-acceptable). Seeding order verified.</done>
</task>

<task type="auto">
  <name>Task 2: Fix confirmed parity gaps</name>
  <files>spacetimedb/src/seeding/ensure_enemies.ts, spacetimedb/src/helpers/items.ts</files>
  <action>
Apply fixes for all confirmed misalignment issues from Task 1. Expected fixes based on pre-audit analysis:

**FIX A -- Raise rare affix budget cap (helpers/items.ts)**

In generateAffixData, find the rare-quality magnitude cap block (around line 182-195):
```typescript
if (qualityTier === 'rare') {
    let remaining = 2n;
```
Change `remaining = 2n` to `remaining = 4n`. This makes rare drops (2 affixes, max 4n total) match crafted reinforced gear (2 slots, 2n magnitude each = 4n total).

Rationale: A crafted reinforced item with Essence (magnitude 2n) filling 2 modifier slots gets 2n+2n=4n total affix magnitude. A rare drop should be comparable. With remaining=4n, each of the 2 affixes can use their full magnitudeByTier[1] value (typically 2n each), totaling 4n. This restores parity.

**FIX B -- Add T2 gear to mid/high-tier loot tables (ensure_enemies.ts)**

In ensureLootTables, the current gearTemplates filter only picks T1:
```typescript
const gearTemplates = [...ctx.db.itemTemplate.iter()].filter(
    (row) => !row.isJunk && row.tier <= 1n && row.requiredLevel <= 9n && !STARTER_ITEM_NAMES.has(row.name)
);
```

Add a second filter for T2 gear:
```typescript
const t2GearTemplates = [...ctx.db.itemTemplate.iter()].filter(
    (row) => !row.isJunk && row.tier === 2n && row.requiredLevel <= 20n && !STARTER_ITEM_NAMES.has(row.name)
);
```

Then in the addOrSyncTable function body, after seeding T1 gear entries into ALL loot tables, also seed T2 gear entries into mid-tier and high-tier tables only. Add a `tierLevel` parameter or use the existing terrain to determine which tables get T2 gear:

For mid-tier terrains (mountains, town, city) AND high-tier (dungeon), add T2 gear entries with weight 3n (less common than T1 gear at 6n). Use the `isMidTier` / `isHighTier` pattern already used in ensureMaterialLootEntries.

However -- ensureLootTables currently creates only tier=1n loot tables per terrain/creature combo. To add T2 gear, the simplest approach is: keep single loot table per terrain/creature, just add T2 templates to mid/high-tier terrain tables with lower weight. This avoids needing new LootTable rows.

Modify addOrSyncTable to accept an optional t2Gear array parameter, or add a second loop after the main terrain loop specifically for mid/high-tier terrains to upsert T2 gear entries.

Approach:
```typescript
// After existing T1 gear seeding inside addOrSyncTable:
const JEWELRY_SLOTS = new Set(['earrings']);
for (const item of gearTemplates) {
    const weight = JEWELRY_SLOTS.has(item.slot) ? 1n : (item.rarity === 'uncommon' ? 3n : 6n);
    upsertLootEntry(tableId, item.id, weight);
}
// ADD: T2 gear for mid/high-tier terrains
if (isHighTier || isMidTier) {
    for (const item of t2GearTemplates) {
        const weight = JEWELRY_SLOTS.has(item.slot) ? 1n : 3n;
        upsertLootEntry(tableId, item.id, weight);
    }
}
```

But the current addOrSyncTable does not receive terrain context for mid/high determination. Refactor: add terrain parameter to addOrSyncTable, or move the T2 gear seeding to a separate loop after the main seeding loop (cleaner, matches the ensureMaterialLootEntries pattern).

Better approach: Add a separate loop AFTER the main terrain loop that iterates mid/high-tier terrains and adds T2 gear entries to existing tables via findLootTable + upsertLootEntry. This avoids modifying the addOrSyncTable signature.

```typescript
// --- T2 gear entries for mid/high-tier loot tables ---
const MID_HIGH_TERRAINS = ['mountains', 'town', 'city', 'dungeon'];
const creatureTypes = ['animal', 'beast', 'humanoid', 'undead', 'spirit', 'construct'];
for (const terrain of MID_HIGH_TERRAINS) {
    for (const creature of creatureTypes) {
        const table = findLootTable(terrain, creature, 1n);
        if (!table) continue;
        for (const item of t2GearTemplates) {
            const weight = JEWELRY_SLOTS.has(item.slot) ? 1n : 3n;
            upsertLootEntry(table.id, item.id, weight);
        }
    }
}
```

Place this block at the end of ensureLootTables, after all the addOrSyncTable calls. Move the JEWELRY_SLOTS constant to function scope (above addOrSyncTable) so both blocks can use it.

**FIX C -- Verify head/wrists/hands/belt/offHand inclusion (conditional)**

Based on Task 1 findings about seeding order:
- If these templates ARE already in loot tables (seeded before ensureLootTables): no fix needed.
- If NOT: Add them explicitly to T1 loot table entries, or ensure the seeding order is correct.

After applying fixes, republish the module:
```bash
cd spacetimedb && spacetime publish uwr --project-path .
```
(NOT --clear-database, since no schema changes -- only data/logic changes.)
  </action>
  <verify>
1. `grep -n "remaining = 4n" spacetimedb/src/helpers/items.ts` -- confirms rare cap raised
2. `grep -n "t2GearTemplates" spacetimedb/src/seeding/ensure_enemies.ts` -- confirms T2 gear seeding added
3. Publish succeeds without errors
4. Spot-check: `spacetime logs uwr` shows no errors after publish
  </verify>
  <done>
- Rare affix budget cap raised from 2n to 4n (matching crafted reinforced gear total)
- T2 gear templates added to mid/high-tier loot tables (mountains, town, city, dungeon)
- Other-slot gear (head/wrists/hands/belt/offHand) confirmed present or added to T1 loot tables
- Module published successfully
  </done>
</task>

</tasks>

<verification>
After both tasks complete:

1. **Rare parity check**: A rare dropped weapon should be able to have e.g. Fierce (strBonus +2) + of Power (strBonus +2) = total 4n, matching a crafted reinforced weapon with 2 Glowing Stone modifiers at Essence magnitude 2n each = 4n total.

2. **T2 drop check**: Mid-tier loot tables (mountains, dungeon creature types) should contain T2 templates like Steel Longsword, Silken Robe, Ranger Jerkin, etc.

3. **Slot coverage check**: Loot tables should include templates for ALL equipment slots: head, chest, wrists, hands, belt, legs, boots, earrings, neck, cloak, mainHand, offHand.

4. **No regression**: T1 loot tables for low-tier terrains (plains, woods, swamp) should still only contain T1 gear.
</verification>

<success_criteria>
- Rare dropped gear total affix magnitude (4n) matches crafted reinforced gear total (4n)
- T2 gear appears in mid/high-tier loot tables
- All equipment slots are represented in world-drop loot pools
- HP affix asymmetry documented as intentional (drops stronger than crafted for HP, compensated by crafting choice)
- Module publishes cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/177-validate-that-gear-that-can-drop-from-en/177-SUMMARY.md`
</output>
