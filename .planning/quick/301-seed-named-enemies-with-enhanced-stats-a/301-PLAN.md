---
phase: quick-301
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/named_enemy_defs.ts
  - spacetimedb/src/seeding/ensure_enemies.ts
  - spacetimedb/src/seeding/ensure_content.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [NAMED-01]
must_haves:
  truths:
    - "Named enemies exist as EnemyTemplate rows with isBoss=true and significantly enhanced stats (2-3x HP, 1.5x damage, 1.5x armor vs normal enemies of same level)"
    - "Each named enemy has a dedicated LootTable with class-specific magical gear drops"
    - "Across all named enemies, every class (warrior, paladin, cleric, reaver, ranger, rogue, wizard, enchanter, necromancer, summoner, shaman, spellblade, druid, bard) has at least 2 pieces of gear they can hunt"
    - "Named enemies are spread across all 3 regions (Hollowmere Vale, Embermarch Fringe, Embermarch Depths) with level-appropriate stats"
  artifacts:
    - path: "spacetimedb/src/data/named_enemy_defs.ts"
      provides: "Named enemy definitions and their loot table definitions"
    - path: "spacetimedb/src/seeding/ensure_enemies.ts"
      provides: "ensureNamedEnemies() function that seeds templates, loot tables, and loot entries"
    - path: "spacetimedb/src/seeding/ensure_content.ts"
      provides: "Calls ensureNamedEnemies in the seeding pipeline"
  key_links:
    - from: "spacetimedb/src/seeding/ensure_enemies.ts"
      to: "spacetimedb/src/data/named_enemy_defs.ts"
      via: "import NAMED_ENEMY_DEFS"
      pattern: "NAMED_ENEMY_DEFS"
    - from: "spacetimedb/src/seeding/ensure_content.ts"
      to: "spacetimedb/src/seeding/ensure_enemies.ts"
      via: "import and call ensureNamedEnemies"
      pattern: "ensureNamedEnemies"
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "EnemyTemplate.isBoss"
      via: "Existing isBoss check grants boss renown on kill"
      pattern: "template\\.isBoss"
---

<objective>
Seed named enemies with enhanced stats and class-specific magical loot tables across all three regions.

Purpose: Create targeted, group-required named enemies that players seek out for specific class loot. Every class should have named enemies worth hunting.
Output: ~10-14 named enemy templates with isBoss=true, enhanced stats, and dedicated loot tables containing class-appropriate magical gear.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/seeding/ensure_enemies.ts (enemy seeding patterns: addEnemyTemplate, addRoleTemplate, ensureLootTables, ensureMaterialLootEntries)
@spacetimedb/src/seeding/ensure_world.ts (world layout: regions, locations, terrainTypes)
@spacetimedb/src/seeding/ensure_content.ts (seeding pipeline order)
@spacetimedb/src/data/item_defs.ts (item defs: ARMOR_ALLOWED_CLASSES, T1/T2 gear, weapon types, starter weapons for class->weapon mapping)
@spacetimedb/src/schema/tables.ts (EnemyTemplate with isBoss, LootTable, LootTableEntry, NamedEnemy schemas)
@spacetimedb/src/reducers/combat.ts (findLootTable uses terrainType+creatureType+tier=1n; isBoss grants boss renown)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create named enemy definitions data file</name>
  <files>spacetimedb/src/data/named_enemy_defs.ts</files>
  <action>
Create a new data file `spacetimedb/src/data/named_enemy_defs.ts` containing all named enemy definitions and their loot table entries.

**Named Enemy Design Principles:**
- `isBoss: true` on all named enemies (this triggers boss renown in combat.ts)
- Stats are enhanced vs normal enemies of same level: ~2-3x HP, ~1.5x damage, ~1.5x armorClass
- Each has a unique creature name (not just "Named Bandit")
- Each has specific terrainTypes matching their location's terrain
- socialGroup/isSocial should be false (named enemies are solo encounters — the group difficulty comes from their raw stats)
- groupMin: 1n, groupMax: 1n (always spawn alone)

**Loot Design Principles:**
- Each named enemy has a custom loot table definition (terrainType matching enemy, creatureType matching enemy, tier: 2n to differentiate from normal tier=1n loot tables)
- The loot table should have HIGH gearChance (60-80n) and LOW junkChance (10-20n) since these are targeted farming mobs
- goldMin/goldMax should be generous (5n-15n)
- Each loot table contains 3-5 specific item template NAMES (looked up at seeding time) with appropriate weights
- Loot targets specific classes via the allowedClasses on the item templates

**Use existing item templates from item_defs.ts** — reference by name. These are T1 and T2 gear items that already exist (Iron Shortsword, Steel Longsword, Hunting Bow, etc.). The named enemy loot tables should reference existing gear items with higher weight for the class-appropriate ones. Also reference existing crafting materials and scrolls for variety.

Export two arrays:

```typescript
export interface NamedEnemyDef {
  name: string;
  role: string;
  roleDetail: string;
  abilityProfile: string;
  terrainTypes: string;
  creatureType: string;
  timeOfDay: string;
  socialGroup: string;
  socialRadius: bigint;
  awareness: string;
  groupMin: bigint;
  groupMax: bigint;
  armorClass: bigint;
  level: bigint;
  maxHp: bigint;
  baseDamage: bigint;
  xpReward: bigint;
  factionName: string; // looked up at seed time
  roles: { roleKey: string; displayName: string; role: string; roleDetail: string; abilityProfile: string }[];
  loot: NamedEnemyLootDef;
}

export interface NamedEnemyLootDef {
  junkChance: bigint;
  gearChance: bigint;
  goldMin: bigint;
  goldMax: bigint;
  entries: { itemName: string; weight: bigint }[]; // looked up by name at seed time
}
```

**Create ~12 named enemies spread across regions:**

Hollowmere Vale (Starter, levels 3-5, dangerMultiplier 100):
1. **Rotfang** — beast, swamp terrain, level 5, drops leather/dagger gear (rogue, druid, ranger, monk loot)
2. **Mirewalker Thane** — humanoid, swamp terrain, level 5, drops chain/mace gear (paladin, cleric, shaman loot)
3. **Thornmother** — beast, woods terrain, level 4, drops staff/cloth gear (wizard, enchanter, necromancer, summoner loot)
4. **Ashwright** — spirit, plains terrain, level 5, drops accessories (earrings, cloak, neck — universal loot)

Embermarch Fringe (Border, levels 8-12, dangerMultiplier 160):
5. **Crag Tyrant** — beast, mountains terrain, level 10, drops plate/greatsword gear (warrior, paladin loot)
6. **Hexweaver Nyx** — humanoid, woods terrain, level 10, drops staff/cloth gear (enchanter, necromancer, summoner, wizard loot)
7. **Scorchfang** — beast, plains terrain, level 11, drops leather/blade/sword gear (spellblade, reaver, rogue loot)
8. **Warden of Ash** — construct, mountains terrain, level 12, drops chain/axe gear (warrior, reaver, beastmaster loot)
9. **Smolderveil Banshee** — spirit, swamp terrain, level 11, drops rapier/cloth gear (bard, druid, shaman loot)

Embermarch Depths (Dungeon, levels 13-16, dangerMultiplier 200):
10. **Pyrelord Kazrak** — humanoid, dungeon terrain, level 15, drops plate/greatsword gear (warrior, paladin, spellblade loot)
11. **Sootveil Archon** — undead, dungeon terrain, level 14, drops staff/cloth/dagger gear (wizard, necromancer, enchanter loot)
12. **Emberclaw Matriarch** — beast, dungeon terrain, level 16, drops bow/leather gear (ranger, rogue, druid loot)

**Stat scaling for named enemies (enhanced vs normal):**
- Starter named (level 3-5): HP 80-150, damage 12-18, armor 15-20, xpReward 80-120
- Border named (level 8-12): HP 200-400, damage 20-35, armor 22-30, xpReward 150-250
- Dungeon named (level 13-16): HP 400-700, damage 35-50, armor 28-38, xpReward 300-500

**Loot entries per named enemy (3-5 items each, by NAME from item_defs.ts):**
Use T1 gear names for starter named enemies, T2 gear names for border/dungeon. Add crafting materials (Tanned Leather, Spirit Essence, Shadowhide, Void Crystal) and scrolls as secondary drops. Weight the class-targeted items at 15-20n (high), secondary items at 5-10n (medium).

IMPORTANT: Cross-reference item names against the actual items in item_defs.ts. The T1 weapons are: Iron Shortsword, Hunting Bow, Gnarled Staff, Worn Mace, Rusty Axe, Notched Rapier, Chipped Dagger, Cracked Blade, Crude Greatsword. T2 weapons are: Steel Longsword, Yew Bow, Oak Staff, Steel Greatsword, Flanged Mace, Hardened Axe, Stiletto, Dueling Rapier, Tempered Blade. Armor items exist for head/wrists/hands/chest/legs slots across plate/chain/leather/cloth tiers. Accessories: Rough Band, Worn Cloak, Traveler Necklace, Glimmer Ring, Shaded Cloak.

Verify every itemName in loot entries exists in item_defs.ts before finalizing. Read the full T1_GEAR_DEFS and T2_GEAR_DEFS arrays to get exact names.
  </action>
  <verify>TypeScript compiles: `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit src/data/named_enemy_defs.ts` (or check via full build). Every itemName referenced in loot entries exists in item_defs.ts.</verify>
  <done>Data file exports NAMED_ENEMY_DEFS array with ~12 entries, each having enhanced stats, isBoss semantics, and class-specific loot entries referencing existing item template names.</done>
</task>

<task type="auto">
  <name>Task 2: Add ensureNamedEnemies seeding function and wire into pipeline</name>
  <files>spacetimedb/src/seeding/ensure_enemies.ts, spacetimedb/src/seeding/ensure_content.ts, spacetimedb/src/reducers/combat.ts</files>
  <action>
Add a new `ensureNamedEnemies(ctx: any)` function to `ensure_enemies.ts`. This function:

1. Imports `NAMED_ENEMY_DEFS` from `../data/named_enemy_defs`
2. Imports `findEnemyTemplateByName` from `../helpers/location` and `findItemTemplateByName` from `../helpers/items` (same as existing functions use)
3. For each named enemy def:
   a. Call the same `addEnemyTemplate` pattern (upsert by name) with `isBoss: true` set. Look up factionId by name using the same `factionIdByName` helper pattern already in `ensureEnemyTemplatesAndRoles`.
   b. Add role templates using the same `addRoleTemplate` pattern.
   c. Create a dedicated LootTable row with `tier: 2n` and terrainType set to `named_<snake_case_name>` (e.g., `named_rotfang`) so each named enemy gets a unique loot table. Use the enemy's creatureType as-is.
   d. Add LootTableEntry rows for each item in the loot definition, looking up itemTemplateId via `findItemTemplateByName(ctx, entry.itemName)`. Skip any entries where the item template is not found (same pattern as existing seeding).

**CRITICAL: Update findLootTable in combat.ts** to route boss enemies to their named loot tables:

```typescript
const findLootTable = (ctx: any, enemyTemplate: any) => {
  const terrain = enemyTemplate.terrainTypes?.split(',')[0]?.trim() ?? 'plains';
  const creatureType = enemyTemplate.creatureType ?? 'beast';
  // Boss/named enemies: try named-specific loot table first (tier 2)
  if (enemyTemplate.isBoss) {
    const namedKey = 'named_' + enemyTemplate.name.toLowerCase().replace(/\s+/g, '_');
    for (const row of ctx.db.lootTable.iter()) {
      if (row.tier !== 2n) continue;
      if (row.terrainType !== namedKey) continue;
      if (row.creatureType !== creatureType) continue;
      return row;
    }
  }
  // Normal fallback: tier 1
  let best: any | null = null;
  for (const row of ctx.db.lootTable.iter()) {
    if (row.tier !== 1n) continue;
    if (row.terrainType !== terrain) continue;
    if (row.creatureType !== creatureType) continue;
    best = row;
    break;
  }
  if (best) return best;
  for (const row of ctx.db.lootTable.iter()) {
    if (row.tier !== 1n) continue;
    if (row.terrainType !== 'plains') continue;
    if (row.creatureType !== creatureType) continue;
    best = row;
    break;
  }
  return best;
};
```

In `ensure_content.ts`, import `ensureNamedEnemies` from `./ensure_enemies` and call it AFTER `ensureEnemyTemplatesAndRoles` and AFTER `ensureLootTables` (it needs both enemy templates for faction lookups and loot table infrastructure). Place the call in the existing seeding sequence.

**Loot table upsert pattern in ensureNamedEnemies:**
```typescript
const namedKey = 'named_' + def.name.toLowerCase().replace(/\s+/g, '_');
const existingTable = [...ctx.db.lootTable.iter()].find(
  (row) => row.terrainType === namedKey && row.creatureType === def.creatureType && row.tier === 2n
);
let tableId: bigint;
if (existingTable) {
  ctx.db.lootTable.id.update({ ...existingTable, junkChance: def.loot.junkChance, gearChance: def.loot.gearChance, goldMin: def.loot.goldMin, goldMax: def.loot.goldMax });
  tableId = existingTable.id;
} else {
  const inserted = ctx.db.lootTable.insert({ id: 0n, terrainType: namedKey, creatureType: def.creatureType, tier: 2n, junkChance: def.loot.junkChance, gearChance: def.loot.gearChance, goldMin: def.loot.goldMin, goldMax: def.loot.goldMax });
  tableId = inserted.id;
}
// Upsert entries (same pattern as ensureLootTables)
for (const entry of def.loot.entries) {
  const template = findItemTemplateByName(ctx, entry.itemName);
  if (!template) continue;
  const existing = [...ctx.db.lootTableEntry.by_table.filter(tableId)].find((row) => row.itemTemplateId === template.id);
  if (existing) {
    if (existing.weight !== entry.weight) ctx.db.lootTableEntry.id.update({ ...existing, weight: entry.weight });
  } else {
    ctx.db.lootTableEntry.insert({ id: 0n, lootTableId: tableId, itemTemplateId: template.id, weight: entry.weight });
  }
}
```
  </action>
  <verify>
1. `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit` — full server build passes
2. Publish locally: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` (do NOT use --clear-database unless needed)
3. Check logs: `spacetime logs uwr` — no errors during seeding
4. Verify named enemies exist: check logs for named enemy template creation or query via spacetime sql if available
  </verify>
  <done>
- ensureNamedEnemies function exists and seeds ~12 named enemy templates with isBoss=true and enhanced stats
- Each named enemy has a unique tier=2n LootTable (keyed by named_<enemy_name>) with class-specific gear entries
- findLootTable in combat.ts routes boss enemies to their named loot tables
- ensure_content.ts calls ensureNamedEnemies in correct pipeline order
- Server compiles and publishes without error
  </done>
</task>

<task type="auto">
  <name>Task 3: Verify class coverage and publish</name>
  <files>spacetimedb/src/data/named_enemy_defs.ts</files>
  <action>
After Tasks 1-2 are complete, do a class coverage audit:

For each of the 14 classes (warrior, paladin, cleric, reaver, ranger, rogue, wizard, enchanter, necromancer, summoner, shaman, spellblade, druid, bard), verify that at least 2 named enemies drop gear that class can equip. Cross-reference the `allowedClasses` field on the item templates referenced in each named enemy's loot entries.

Class-to-gear mapping (from item_defs.ts ARMOR_ALLOWED_CLASSES and weapon allowed):
- **warrior**: plate armor, chain armor, leather armor, sword, axe, greatsword, blade
- **paladin**: plate armor, chain armor, leather armor, sword, mace, greatsword
- **cleric**: plate armor, chain armor, mace
- **reaver**: chain armor, leather armor, sword, axe, blade, greatsword
- **ranger**: chain, leather, sword, mace, staff, bow, dagger, axe, blade, rapier, greatsword (uses everything)
- **rogue**: leather, sword, mace, dagger
- **wizard**: cloth, staff, dagger
- **enchanter**: cloth, staff, dagger
- **necromancer**: cloth, staff, dagger
- **summoner**: cloth, staff, dagger
- **shaman**: chain, leather, mace, staff, dagger
- **spellblade**: chain, leather, sword, blade, greatsword
- **druid**: leather, mace, staff, dagger
- **bard**: plate, chain, sword, rapier

If any class has fewer than 2 named enemies with usable drops, adjust the loot entries in named_enemy_defs.ts to add coverage. For example, if bard only has 1 named enemy, add a rapier or plate item to another named enemy's loot table.

After verification, do a final local publish:
```bash
spacetime publish uwr --project-path C:/projects/uwr/spacetimedb
```
Check `spacetime logs uwr` for clean seeding with no errors.
  </action>
  <verify>
1. Manual class coverage check: every class has >= 2 named enemies with drops they can equip
2. `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` succeeds
3. `spacetime logs uwr` shows no seeding errors
  </verify>
  <done>All 14 classes have at least 2 named enemies worth farming. Server is published locally with named enemies active.</done>
</task>

</tasks>

<verification>
- All ~12 named enemies seeded as EnemyTemplate rows with isBoss=true
- Each named enemy has enhanced stats appropriate to its region (2-3x HP vs normal enemies of same level)
- Each named enemy has a unique LootTable (tier=2n) with class-specific gear
- combat.ts findLootTable routes isBoss enemies to their named loot tables first
- All 14 classes have >= 2 named enemies with relevant drops
- Server compiles, publishes, and seeds without errors
</verification>

<success_criteria>
- 12+ named enemies spread across Hollowmere Vale, Embermarch Fringe, and Embermarch Depths
- Each named enemy drops class-specific magical gear via dedicated loot tables
- Every class (14 total) can target at least 2 named enemies for gear upgrades
- Named enemies have isBoss=true for boss renown rewards
- Existing loot system unchanged for normal enemies
</success_criteria>

<output>
After completion, create `.planning/quick/301-seed-named-enemies-with-enhanced-stats-a/301-SUMMARY.md`
</output>
