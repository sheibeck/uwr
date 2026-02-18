---
phase: quick-173
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/crafting_materials.ts
  - spacetimedb/src/seeding/ensure_enemies.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/reducers/items.ts
autonomous: true
must_haves:
  truths:
    - "Modifier reagents (Glowing Stone, Clear Crystal, etc.) drop from enemies during combat"
    - "Modifier reagent drops are tier-appropriate: low-level enemies drop stat reagents, higher-level drop defensive/utility reagents"
    - "Salvaging gear can yield a modifier reagent in addition to crafting materials"
    - "The crafting loop is coherent: fight -> loot reagents + essence -> craft enhanced gear"
  artifacts:
    - path: "spacetimedb/src/data/crafting_materials.ts"
      provides: "MODIFIER_REAGENT_THRESHOLDS constant mapping enemy level ranges to eligible modifier reagent names"
    - path: "spacetimedb/src/seeding/ensure_enemies.ts"
      provides: "Modifier reagent items added to loot table entries across creature types"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Runtime modifier reagent drop logic alongside existing essence drops"
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "Salvage yields a bonus modifier reagent on a chance roll"
  key_links:
    - from: "spacetimedb/src/data/crafting_materials.ts"
      to: "spacetimedb/src/reducers/combat.ts"
      via: "MODIFIER_REAGENT_THRESHOLDS import"
      pattern: "MODIFIER_REAGENT_THRESHOLDS"
    - from: "spacetimedb/src/data/crafting_materials.ts"
      to: "spacetimedb/src/seeding/ensure_enemies.ts"
      via: "CRAFTING_MODIFIER_DEFS import for loot table seeding"
      pattern: "CRAFTING_MODIFIER_DEFS"
    - from: "spacetimedb/src/data/crafting_materials.ts"
      to: "spacetimedb/src/reducers/items.ts"
      via: "CRAFTING_MODIFIER_DEFS import for salvage reagent yield"
      pattern: "CRAFTING_MODIFIER_DEFS"
---

<objective>
Bring modifier reagent acquisition into alignment with the redesigned crafting system by adding modifier reagents (Glowing Stone, Clear Crystal, Ancient Rune, Wisdom Herb, Silver Token, Life Stone, Mana Pearl, Iron Ward, Spirit Ward) to enemy loot drops and salvage yields.

Purpose: Players currently have no way to acquire the 9 modifier reagent items needed for the crafting dialog's stat affix system. This task creates two acquisition paths: enemy combat drops and gear salvage. Combined with the existing Essence drops (25% per kill) and crafting material drops (via loot tables), this completes the coherent crafting loop: fight enemies -> loot reagents + essence + materials -> craft enhanced gear.

Output: Modified combat loot logic, updated loot table seeding, updated salvage reducer — all modifier reagents acquirable through gameplay.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/crafting_materials.ts
@spacetimedb/src/seeding/ensure_enemies.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/reducers/items.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add modifier reagent drop definitions and seed loot table entries</name>
  <files>
    spacetimedb/src/data/crafting_materials.ts
    spacetimedb/src/seeding/ensure_enemies.ts
  </files>
  <action>
**In crafting_materials.ts**, add a new exported constant `MODIFIER_REAGENT_THRESHOLDS` that maps enemy level ranges to eligible modifier reagent names. Design the thresholds so that:
- Level 1-10 enemies can drop: Glowing Stone (STR), Clear Crystal (DEX), Life Stone (HP) — basic stat reagents
- Level 11-20 enemies can drop: all of the above PLUS Ancient Rune (INT), Wisdom Herb (WIS), Iron Ward (AC) — mid-tier adds caster + defensive
- Level 21+ enemies can drop: all 9 modifier reagents — Silver Token (CHA), Mana Pearl (Mana), Spirit Ward (MR) added at high tier

Structure as an array of `{ minLevel: bigint; reagentNames: string[] }` ordered highest-first (same pattern as ESSENCE_TIER_THRESHOLDS) for early-return matching.

**In ensure_enemies.ts `ensureMaterialLootEntries`**, add modifier reagent items to existing creature-type loot tables with appropriate weights. Use the same `upsertLootEntry` helper and `findItemTemplateByName` pattern already in the function. Look up all 9 modifier reagent templates at the top of the function. Add them to loot tables following this creature-type affinity pattern:
- **Animal/Beast tables**: Glowing Stone (w8), Clear Crystal (w8), Life Stone (w6) — physical stat reagents from natural creatures
- **Undead tables**: Ancient Rune (w8), Life Stone (w6), Spirit Ward (w6) — magical/defensive from undead
- **Spirit tables**: Wisdom Herb (w8), Mana Pearl (w8), Spirit Ward (w6) — caster reagents from spirits
- **Construct tables**: Iron Ward (w8), Glowing Stone (w6), Mana Pearl (w6) — defensive/arcane from constructs
- **Humanoid tables**: Silver Token (w8), Clear Crystal (w6), Wisdom Herb (w6) — social/diverse from humanoids

Only add modifier reagents to mid-tier and high-tier terrain loot tables (same `isMidTier || isHighTier` gating used for tier 2+ materials). Low-tier terrains should not drop modifier reagents — players need to progress to areas with mountains/town/city/dungeon terrain to find them.
  </action>
  <verify>
Run `spacetime publish uwr --project-path spacetimedb` (no --clear-database needed since this is data-only seeding changes). Check `spacetime logs uwr` for errors. The module should publish successfully and syncAllContent should seed modifier reagent entries into loot tables without errors.
  </verify>
  <done>
All 9 modifier reagent item templates appear in creature-type loot tables for mid/high-tier terrains. MODIFIER_REAGENT_THRESHOLDS is exported from crafting_materials.ts for use by combat.ts runtime drops.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add runtime modifier reagent drops in combat and bonus salvage yield</name>
  <files>
    spacetimedb/src/reducers/combat.ts
    spacetimedb/src/reducers/items.ts
  </files>
  <action>
**In combat.ts**, add a runtime modifier reagent drop check in the victory loot loop, placed immediately after the existing Essence drop block (line ~2334). This creates a SECOND independent drop chance per enemy kill per participant. Follow the exact same pattern as the Essence drop:

1. Import `MODIFIER_REAGENT_THRESHOLDS` and `CRAFTING_MODIFIER_DEFS` from `'../data/crafting_materials'`.
2. Before the per-participant loop (near line 2270 where essenceTemplateMap is built), build a `modifierTemplateMap` by looking up all 9 modifier reagent templates via `[...ctx.db.itemTemplate.iter()].find(t => t.name === name)` — cache in a `Map<string, any>` keyed by name.
3. Inside the `for (const template of enemyTemplates)` loop, after the Essence drop block, add:
   - Use a DIFFERENT seed to avoid correlation with essence drops: `const modifierSeed = (character.id * 11n ^ ctx.timestamp.microsSinceUnixEpoch + template.id * 43n) % 100n;`
   - 15% drop chance: `if (modifierSeed < 15n)`
   - Look up eligible reagent names from MODIFIER_REAGENT_THRESHOLDS based on `template.level` (highest-first early return, same as Essence)
   - Pick a specific reagent deterministically from the eligible list: `const pickIndex = Number((character.id + template.id) % BigInt(eligibleNames.length));`
   - Look up the template from modifierTemplateMap, insert a CombatLoot row with no qualityTier/affixDataJson/isNamed (same as Essence insertion pattern)

**In items.ts `salvage_item` reducer**, add a bonus modifier reagent yield after the existing material yield block (line ~1703). This gives salvaging a secondary output:

1. Import `CRAFTING_MODIFIER_DEFS` from `'../data/crafting_materials'`.
2. After the material yield block, add a 30% chance to also yield a modifier reagent:
   - Deterministic roll: `const modifierRoll = (ctx.timestamp.microsSinceUnixEpoch + args.itemInstanceId * 13n) % 100n;`
   - If `modifierRoll < 30n`:
     - Pick a modifier reagent deterministically based on the item being salvaged: `const modIdx = Number((args.itemInstanceId + character.id) % BigInt(CRAFTING_MODIFIER_DEFS.length));`
     - Look up the modifier template by name using `findItemTemplateByName(ctx, CRAFTING_MODIFIER_DEFS[modIdx].name)`
     - Call `addItemToInventory(ctx, character.id, modifierTemplate.id, 1n)` to grant 1 unit
     - Append a private event: `"You also found 1x {modifierName} while salvaging."`
  </action>
  <verify>
Run `spacetime publish uwr --project-path spacetimedb`. Check `spacetime logs uwr` for compilation/runtime errors. Kill an enemy in a mid-tier+ zone and verify that modifier reagents can appear in loot alongside regular drops and essence. Salvage a piece of gear and verify the 30% chance modifier yield appears.
  </verify>
  <done>
Modifier reagents drop from enemies at 15% per kill (in addition to existing 25% Essence and loot table material drops). Salvaging gear has a 30% chance to yield a bonus modifier reagent. Players now have two acquisition paths for all 9 modifier reagents needed by the crafting dialog.
  </done>
</task>

</tasks>

<verification>
1. Module publishes without errors (`spacetime publish uwr --project-path spacetimedb`)
2. No new TypeScript compilation errors
3. Loot table entries include modifier reagent items for mid/high-tier terrains
4. Combat loot loop generates modifier reagent drops (15% chance, level-gated)
5. Salvage reducer yields bonus modifier reagent (30% chance)
6. Existing Essence drops (25%) and crafting material drops are unchanged
7. No --clear-database required (data-only changes via upsert patterns)
</verification>

<success_criteria>
- All 9 modifier reagent items are obtainable through gameplay (enemy drops + salvage)
- Drop rates feel appropriate: 15% combat, 30% salvage — not too common, not too rare
- Level gating ensures progression: basic stat reagents from low-level, full set from high-level
- Existing loot systems (Essence, crafting materials, gear) continue to work unchanged
- The crafting loop is complete: fight -> loot reagents/essence/materials -> craft gear with stat affixes
</success_criteria>

<output>
After completion, create `.planning/quick/173-now-that-we-ve-re-oriented-our-crafting-/173-SUMMARY.md`
</output>
