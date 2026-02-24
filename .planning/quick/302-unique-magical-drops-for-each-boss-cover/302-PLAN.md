---
phase: quick-302
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/named_enemy_defs.ts
  - spacetimedb/src/seeding/ensure_items.ts
  - spacetimedb/src/seeding/ensure_content.ts
autonomous: true
requirements: [BOSS-LOOT-01]
must_haves:
  truths:
    - "Each of the 12 named bosses drops 2-3 unique rare items themed to that boss"
    - "Boss items have stats slightly above common tier equivalents (+1-2 stats, +1 AC, +1 damage/dps)"
    - "All 14 classes can find upgrades across the 12 bosses collectively"
    - "Tier 1 boss items (Hollowmere) require level 1, tier 2 boss items (Embermarch) require level 11"
    - "Boss loot entries reference unique item names that exist as seeded ItemTemplates"
  artifacts:
    - path: "spacetimedb/src/data/named_enemy_defs.ts"
      provides: "BOSS_DROP_DEFS array with ~30 unique WorldDropItemDef items AND updated loot entries"
      contains: "BOSS_DROP_DEFS"
    - path: "spacetimedb/src/seeding/ensure_items.ts"
      provides: "ensureBossDropTemplates function to seed boss items as ItemTemplates"
      exports: ["ensureBossDropTemplates"]
    - path: "spacetimedb/src/seeding/ensure_content.ts"
      provides: "Calls ensureBossDropTemplates before ensureNamedEnemies"
      contains: "ensureBossDropTemplates"
  key_links:
    - from: "spacetimedb/src/data/named_enemy_defs.ts"
      to: "spacetimedb/src/seeding/ensure_items.ts"
      via: "BOSS_DROP_DEFS import"
      pattern: "import.*BOSS_DROP_DEFS.*named_enemy_defs"
    - from: "spacetimedb/src/seeding/ensure_items.ts"
      to: "ctx.db.itemTemplate"
      via: "upsert loop over BOSS_DROP_DEFS"
      pattern: "BOSS_DROP_DEFS"
    - from: "spacetimedb/src/seeding/ensure_content.ts"
      to: "spacetimedb/src/seeding/ensure_items.ts"
      via: "ensureBossDropTemplates call before ensureNamedEnemies"
      pattern: "ensureBossDropTemplates\\(ctx\\)"
    - from: "named_enemy_defs.ts loot entries"
      to: "ctx.db.itemTemplate"
      via: "itemName string match in ensureNamedEnemies"
      pattern: "findItemTemplateByName.*entry.itemName"
---

<objective>
Create ~30 unique rare-quality boss drop items for all 12 named enemies, replacing their placeholder mundane loot with thematic magical gear that covers all 14 classes.

Purpose: Named bosses currently drop mundane starter items (Chipped Dagger, Scuffed Jerkin, etc.) which makes them unrewarding. Each boss needs 2-3 unique rare items with thematic names, slightly better stats than common equivalents, and class-appropriate restrictions so every class has a reason to hunt specific bosses.

Output: BOSS_DROP_DEFS data array, seeding function, and updated boss loot entries.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/named_enemy_defs.ts
@spacetimedb/src/data/item_defs.ts (WorldDropItemDef interface, stat reference)
@spacetimedb/src/seeding/ensure_items.ts (ensureWorldDropGearTemplates pattern)
@spacetimedb/src/seeding/ensure_enemies.ts (ensureNamedEnemies, findItemTemplateByName)
@spacetimedb/src/seeding/ensure_content.ts (syncAllContent call order)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Define ~30 unique boss drop items in BOSS_DROP_DEFS</name>
  <files>spacetimedb/src/data/named_enemy_defs.ts</files>
  <action>
Add a new exported array `BOSS_DROP_DEFS: WorldDropItemDef[]` to named_enemy_defs.ts (import WorldDropItemDef from '../data/item_defs'). Create 2-3 unique rare items per boss (roughly 30 total). Each item must use the WorldDropItemDef interface.

**Stat guidelines — rare boss drops are slightly better than common tier equivalents:**

Tier 1 (Hollowmere, bosses 1-4): requiredLevel 1n, tier 1n, vendorValue 15n
- Weapons: baseDamage +1-2 over common (e.g. dagger 5n/7n vs common 3n/5n), plus a stat bonus (1-2n)
- Armor: armorClassBonus +1 over common (e.g. leather chest 5n vs common 4n), plus a stat bonus (1-2n)
- Accessories: 2 stat bonuses instead of 1 (e.g. dexBonus 1n + hpBonus 3n)

Tier 2 (Embermarch, bosses 5-12): requiredLevel 11n, tier 2n, vendorValue 30n
- Weapons: baseDamage +1-2 over common (e.g. greatsword 11n/12n vs common 9n/10n), plus a stat bonus (2-3n)
- Armor: armorClassBonus +1 over common (e.g. plate chest 8n vs common 7n), plus a stat bonus (2-3n)
- Accessories: 2 stat bonuses (e.g. intBonus 3n + manaBonus 5n)

**Boss item assignments (each must have thematic naming tied to the boss):**

1. **Rotfang** (rogue/druid/ranger, leather/dagger) — 3 items:
   - Dagger (mainHand, dagger, leather classes + dagger classes intersection): "Rotfang's Venomtooth"
   - Leather chest: "Rotfang's Swamphide Vest"
   - Earrings (any): "Fangscale Earring"

2. **Mirewalker Thane** (paladin/cleric/shaman, chain/mace) — 3 items:
   - Mace (mainHand): "Thane's Bogwater Mace"
   - Chain chest: "Mirewalker's Hauberk"
   - Neck (any): "Thane's Oath Pendant"

3. **Thornmother** (wizard/enchanter/necromancer/summoner, staff/cloth) — 3 items:
   - Staff (mainHand): "Thornmother's Briar Staff"
   - Cloth chest: "Thornweave Robe"
   - Earrings (any): "Briarwood Loop"

4. **Ashwright** (universal, accessories) — 3 items:
   - Neck: "Ashwright's Spirit Locket"
   - Earrings: "Cinderwisp Band"
   - Neck (cloak-style, armorType cloth): "Ashwright's Ember Cloak"

5. **Crag Tyrant** (warrior/paladin, plate/greatsword) — 3 items:
   - Greatsword (mainHand): "Crag Tyrant's Cleaver"
   - Plate chest: "Tyrant's Stoneplate"
   - Hands (plate): "Crag Tyrant's Gauntlets"

6. **Hexweaver Nyx** (enchanter/necromancer/summoner/wizard, staff/cloth) — 3 items:
   - Staff (mainHand): "Nyx's Hexstaff"
   - Cloth legs: "Hexweaver's Trousers"
   - Dagger (mainHand): "Nyx's Cursed Athame"

7. **Scorchfang** (spellblade/reaver/rogue, leather/blade/sword) — 3 items:
   - Blade (mainHand): "Scorchfang's Emberblade"
   - Leather chest: "Scorchscale Jerkin"
   - Leather legs: "Scorchfang's Leggings"

8. **Warden of Ash** (warrior/reaver/beastmaster, chain/axe) — 3 items:
   - Axe (mainHand): "Ashen Warden's Axe"
   - Chain chest: "Warden's Cindermail"
   - Wrists (chain): "Ashbound Bracers"

9. **Smolderveil Banshee** (bard/druid/shaman, rapier/cloth/mace) — 2 items:
   - Rapier (mainHand): "Banshee's Wail"
   - Cloth chest: "Smolderveil Vestments"

10. **Pyrelord Kazrak** (warrior/paladin/spellblade, plate/greatsword) — 3 items:
    - Greatsword (mainHand): "Kazrak's Pyrecleft"
    - Plate chest: "Pyrelord's Infernal Plate"
    - Head (plate): "Kazrak's Molten Crown"

11. **Sootveil Archon** (wizard/necromancer/enchanter, staff/cloth/dagger) — 3 items:
    - Staff (mainHand): "Archon's Sootveil Staff"
    - Dagger (mainHand): "Sootveil Sacrificial Blade"
    - Cloth head: "Archon's Dark Cowl"

12. **Emberclaw Matriarch** (ranger/rogue/druid, bow/leather) — 3 items:
    - Bow (mainHand): "Matriarch's Emberclaw Bow"
    - Leather chest: "Emberclaw Stalker Hide"
    - Leather boots: "Matriarch's Trackless Boots"

Then update each boss's `loot.entries` array to replace the mundane placeholder items with the new unique items. Each entry should have weight 20n-25n (higher than normal drops to make boss loot feel rewarding). Keep 1-2 of the existing mundane items at lower weight (8n-10n) as filler drops so the loot table isn't too small.

All item names MUST be unique across the entire codebase (no collisions with existing items in WORLD_DROP_GEAR_DEFS or WORLD_DROP_JEWELRY_DEFS).
  </action>
  <verify>
Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` to verify no type errors. Grep for BOSS_DROP_DEFS to confirm it exists and has roughly 30+ entries. Verify each boss's loot.entries references at least 2 unique items from BOSS_DROP_DEFS.
  </verify>
  <done>
BOSS_DROP_DEFS exported with ~30 unique WorldDropItemDef items. All 12 bosses' loot.entries updated to reference unique items by name. No type errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add ensureBossDropTemplates seeding and wire into syncAllContent</name>
  <files>spacetimedb/src/seeding/ensure_items.ts, spacetimedb/src/seeding/ensure_content.ts</files>
  <action>
**In ensure_items.ts:**

Add a new exported function `ensureBossDropTemplates(ctx: any)` following the exact same pattern as `ensureWorldDropGearTemplates`. Import `BOSS_DROP_DEFS` from `'../data/named_enemy_defs'`. The function should:
1. Loop over BOSS_DROP_DEFS
2. Use the same upsertByName pattern (with all default fields: wellFedDurationMicros 0n, wellFedBuffType '', wellFedBuffMagnitude 0n, weaponType '', magicResistanceBonus 0n, etc.)
3. Map each WorldDropItemDef field to the ItemTemplate insert (same as ensureWorldDropGearTemplates does)
4. Set isJunk: false, stackable: false for all boss drops

**In ensure_content.ts:**

1. Add `ensureBossDropTemplates` to the import from './ensure_items'
2. Call `ensureBossDropTemplates(ctx)` in syncAllContent AFTER `ensureWorldDropJewelryTemplates(ctx)` (line ~104) and BEFORE `ensureNamedEnemies(ctx)` (line ~118). This is critical: boss item templates must exist before ensureNamedEnemies tries to resolve their names via findItemTemplateByName.

Add a comment: `// Boss-unique rare drops (must be before ensureNamedEnemies)`
  </action>
  <verify>
Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` to confirm no type errors. Grep ensure_content.ts to verify ensureBossDropTemplates appears before ensureNamedEnemies in syncAllContent. Run `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` (local only) to verify module compiles and publishes.
  </verify>
  <done>
ensureBossDropTemplates seeds all boss drop items as ItemTemplates before ensureNamedEnemies runs. Module publishes successfully to local SpacetimeDB. Boss loot entries resolve to the new unique item templates.
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles: `npx tsc --noEmit --project spacetimedb/tsconfig.json` passes
2. Module publishes locally: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` succeeds
3. Check logs for errors: `spacetime logs uwr` shows no seeding failures
4. Verify item count: grep BOSS_DROP_DEFS for roughly 30 entries
5. Verify all 12 bosses have updated loot.entries referencing unique items
6. Verify seeding order: ensureBossDropTemplates called before ensureNamedEnemies in syncAllContent
</verification>

<success_criteria>
- All 12 named bosses have 2-3 unique rare items in their loot tables
- ~30 unique boss items defined with thematic names, correct stats, and proper class restrictions
- All 14 classes can find upgrades across the bosses collectively
- Boss items are seeded as ItemTemplates before enemy loot resolution
- Module compiles and publishes to local SpacetimeDB without errors
</success_criteria>

<output>
After completion, create `.planning/quick/302-unique-magical-drops-for-each-boss-cover/302-SUMMARY.md`
</output>
