# Phase 32: Dead Code Removal - Research

**Researched:** 2026-03-09
**Domain:** Codebase cleanup, dead code removal, rule extraction, import graph repair
**Confidence:** HIGH

## Summary

Phase 32 is a large-scale codebase surgery removing v1.0 legacy artifacts (seeded data files, old components, unused reducers) and extracting implicit mechanical rules into domain-specific files before deletion. The codebase has been investigated and all dependency chains are mapped.

The critical insight is that most files on the deletion list are either pure seeding data (can be deleted outright) or contain a mix of seeded content AND active mechanical rules (need careful extraction first). The `crafting_materials.ts` file is the most complex case -- it has 6 active importers using its helper functions, modifier defs, and tier thresholds in live game systems (combat drops, crafting, gathering, salvage). The `world_gen.ts` data file contains template strings and functions that are actively used by the LLM-powered world generation system and should NOT be deleted -- only the seeded location data (which doesn't exist in this file) is dead.

**Primary recommendation:** Execute in three waves -- (1) extract mechanical rules to new domain files, (2) delete seeded data files and seeding system, (3) clean frontend legacy components and import graph. Each wave should compile-check before proceeding.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Delete all files on the MEMORY.md deletion list** and rewire callers -- no half-measures
- **Remove the entire seeding system** (spacetimedb/src/seeding/ directory) -- v2.0 generates everything through play, new DBs start empty
- **crafting_materials.ts**: Extract material tiers, modifier defs, and crafting formulas into a domain rule file, then delete. Discard specific recipes and material lists
- **faction_data.ts**: Move mechanical rules (rival relationship structure, faction type enum) to a domain rule file. Delete the 4 hardcoded faction definitions. Factions get generated through play
- **dialogue_data.ts**: Delete entirely -- LLM-powered NPC conversation already built
- **named_enemy_defs.ts**: Extract boss stat scaling formulas, ability slot counts per tier, loot table drop rate ranges into a domain rule file, then delete
- **item_defs.ts**: Extract slot-to-armor-class mappings, stat range formulas per rarity tier, weapon type base stat ranges into a domain rule file, then delete
- **npc_data.ts**: Keep affinity tier constants and cooldown mechanics (move to domain rule file). Delete NPC_PERSONALITIES
- **world_gen.ts**: Delete -- region generation is LLM-powered in v2.0
- Requires `--clear-database` on next publish (schema changes from table removal)
- **Domain-split file organization** -- new domain-specific rule files in `spacetimedb/src/data/`:
  - `equipment_rules.ts` -- armor class restrictions, stat ranges per slot/rarity, weapon type constraints
  - `enemy_rules.ts` -- boss stat scaling by danger level, ability slot counts per tier, loot drop rate ranges
  - `crafting_rules.ts` -- material tiers, modifier defs, crafting formulas
  - `faction_rules.ts` -- rival relationship structure, faction type vocabulary
  - `npc_rules.ts` -- affinity tier constants, conversation cooldowns
- **Remove ALL legacy panels**: CharacterPanel.vue, NpcDialogPanel.vue, QuestPanel.vue, RenownPanel.vue
- **Remove associated composables**: useCharacterCreation.ts and any other composables only used by deleted panels
- **Remove old create_character reducer** from characters.ts
- **Claude identifies ALL backend duplication** -- sell calculations, damage formulas, gold math, stat lookups, economy helpers
- **Remove unused tables from schema** and dead reducers/unused table accessors (CLEAN-05)

### Claude's Discretion
- Exact ordering of deletions to minimize intermediate broken states
- Which tables are truly orphaned vs borderline (flag borderline cases)
- How to handle import chain cascades during deletion
- Whether to batch deletions or do incremental compile-check cycles

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLEAN-01 | All v1.0 legacy files identified in MEMORY.md are removed | Deletion list mapped with full dependency chains; 4 seeding files, 7 data files, 4+ frontend components, 1+ composables |
| CLEAN-02 | Implicit mechanical rules from item_defs.ts are extracted to mechanical_vocabulary.ts before deletion | item_defs.ts analyzed: ARMOR_ALLOWED_CLASSES, starter weapon/armor definitions, world drop stat patterns need extraction to equipment_rules.ts |
| CLEAN-03 | Backend code is deduplicated (shared helpers extracted for sell logic, combat utilities) | Sell/vendor logic found in items.ts, npc_interaction.ts, quests.ts, intent.ts reducers; crafting material functions in crafting_materials.ts used by 6 files |
| CLEAN-04 | Frontend code is deduplicated (redundant components consolidated) | 4 legacy panels (CharacterPanel, NpcDialogPanel, QuestPanel, RenownPanel) have narrative equivalents; useCharacterCreation.ts only used by App.vue for legacy flow |
| CLEAN-05 | Dead reducers and unused table accessors are removed | create_character reducer in characters.ts identified as legacy; syncAllContent seeding chain used by index.ts, items.ts, commands.ts reducers |
| CLEAN-06 | Import graph is clean -- no broken or circular imports after cleanup | Full import chains traced; world_gen.ts functions used by index.ts and helpers/world_gen.ts; crafting_materials.ts has 6 live importers that must be rewired |
</phase_requirements>

## Architecture Patterns

### Deletion Dependency Map (Backend)

Files to delete and their ACTIVE (non-seeding) consumers that need rewiring:

```
dialogue_data.ts
  └── ensure_world.ts (ALSO DELETED) .......... No rewiring needed

faction_data.ts
  ├── index.ts (calls ensureFactions) .......... Remove import + call
  └── ensure_content.ts (ALSO DELETED) ........ No rewiring needed

npc_data.ts
  ├── ensure_world.ts (ALSO DELETED) .......... No rewiring needed
  └── helpers/npc_affinity.ts .................. Move CONVERSATION_COOLDOWN_MICROS to npc_rules.ts

named_enemy_defs.ts
  ├── ensure_enemies.ts (ALSO DELETED) ........ No rewiring needed
  ├── ensure_items.ts (ALSO DELETED) .......... No rewiring needed
  └── (WorldDropItemDef type) .................. Move interface to equipment_rules.ts if still needed

item_defs.ts
  ├── ensure_items.ts (ALSO DELETED) .......... No rewiring needed
  ├── named_enemy_defs.ts (ALSO DELETED) ...... No rewiring needed
  └── helpers/items.ts ......................... STARTER_WEAPON_DEFS used for character creation
                                                Move to equipment_rules.ts

crafting_materials.ts  [MOST COMPLEX]
  ├── ensure_items.ts (ALSO DELETED) .......... No rewiring needed
  ├── ensure_enemies.ts (ALSO DELETED) ........ No rewiring needed
  ├── helpers/location.ts ...................... Uses MATERIAL_DEFS, CRAFTING_MODIFIER_DEFS,
  │                                             CRAFTING_MODIFIER_WEIGHT_MULTIPLIER
  ├── reducers/combat.ts ...................... Uses ESSENCE_TIER_THRESHOLDS,
  │                                             MODIFIER_REAGENT_THRESHOLDS, CRAFTING_MODIFIER_DEFS
  ├── reducers/items_gathering.ts ............. Uses CRAFTING_MODIFIER_DEFS
  └── reducers/items_crafting.ts .............. Uses getMaterialForSalvage, SALVAGE_YIELD_BY_TIER,
                                                MATERIAL_DEFS, materialTierToCraftQuality,
                                                getCraftQualityStatBonus, CRAFTING_MODIFIER_DEFS,
                                                AFFIX_SLOTS_BY_QUALITY, ESSENCE_MAGNITUDE,
                                                ESSENCE_QUALITY_GATE, getModifierMagnitude

world_gen.ts (data/)  [CAUTION: NOT ALL DEAD]
  ├── index.ts ................................ Uses pickRippleMessage, pickDiscoveryMessage,
  │                                             computeRegionDanger
  ├── helpers/world_gen.ts .................... Uses computeRegionDanger
  └── helpers/world_gen.test.ts ............... Mocks computeRegionDanger
```

**CRITICAL: `data/world_gen.ts` contains ACTIVE functions** (pickRippleMessage, pickDiscoveryMessage, computeRegionDanger) used by the live LLM-powered world generation system. These are NOT seeded data. This file should either be kept or its functions relocated to `helpers/world_gen.ts`. The CONTEXT.md says "Delete" but the functions are actively used -- the executor must relocate the functions before deleting the file.

### Seeding System Removal

The entire `spacetimedb/src/seeding/` directory (4 files) is deleted:
- `ensure_content.ts` -- orchestrates all seeding + scheduled table setup
- `ensure_items.ts` -- seeds item templates from data defs
- `ensure_enemies.ts` -- seeds loot tables and enemy templates
- `ensure_world.ts` -- seeds regions, locations, NPCs, vendors

**Important:** `ensure_content.ts` also contains scheduled table setup functions (`ensureHealthRegenScheduled`, `ensureDayNightTickScheduled`, etc.) that ARE still needed. These must be relocated before deletion -- move to `helpers/scheduling.ts` or similar.

The `syncAllContent` function is called from:
- `index.ts` line 1335 (clientConnected hook)
- `reducers/items.ts` line 996
- `reducers/commands.ts` line 270

After removing seeding, these call sites need to either call a minimal "ensure scheduled tables" function or be removed entirely.

### Frontend Deletion Map

```
Components to delete:
  CharacterPanel.vue ......... Not imported in App.vue (already unused?)
  NpcDialogPanel.vue ......... Imported in App.vue lines 545, 154
  QuestPanel.vue ............. Not found in imports (check if already removed)
  RenownPanel.vue ............ Imported in App.vue lines 549, 159

Composables to delete:
  useCharacterCreation.ts .... Imported in App.vue line 561, used line 870

App.vue cleanup needed:
  - Remove NpcDialogPanel import + template usage (lines 154, 545)
  - Remove RenownPanel import + template usage (lines 159, 549)
  - Remove useCharacterCreation import + destructured values (lines 561, 870)
  - Clean up any orphaned data/computed/handlers only used by deleted panels
```

### Recommended Deletion Order (Minimize Broken States)

**Wave 1: Extract rules (no deletions yet)**
1. Create `equipment_rules.ts` -- extract from item_defs.ts
2. Create `crafting_rules.ts` -- extract from crafting_materials.ts
3. Create `enemy_rules.ts` -- extract from named_enemy_defs.ts
4. Create `faction_rules.ts` -- extract from faction_data.ts
5. Create `npc_rules.ts` -- extract from npc_data.ts
6. Relocate `data/world_gen.ts` functions to `helpers/world_gen.ts`
7. Relocate scheduled table setup from `ensure_content.ts` to a new helper
8. Rewire ALL importers to use new locations
9. Compile check

**Wave 2: Delete backend files**
1. Delete `spacetimedb/src/seeding/` (all 4 files)
2. Delete `data/dialogue_data.ts`
3. Delete `data/faction_data.ts`
4. Delete `data/npc_data.ts`
5. Delete `data/named_enemy_defs.ts`
6. Delete `data/item_defs.ts`
7. Delete `data/crafting_materials.ts`
8. Delete `data/world_gen.ts`
9. Remove `syncAllContent` calls from index.ts, items.ts, commands.ts -- replace with scheduled table init only
10. Remove `create_character` reducer from characters.ts
11. Remove `ensureFactions` import/call from index.ts
12. Clean up any orphaned reducer exports
13. Compile check + run tests

**Wave 3: Frontend cleanup**
1. Delete CharacterPanel.vue, NpcDialogPanel.vue, QuestPanel.vue, RenownPanel.vue
2. Delete useCharacterCreation.ts
3. Clean App.vue (remove imports, template refs, handler refs)
4. Trace full import graph for any other orphaned components/composables
5. Compile check

### What to Extract vs Discard

| Source File | KEEP (extract to rule file) | DISCARD |
|-------------|---------------------------|---------|
| item_defs.ts | ARMOR_ALLOWED_CLASSES, StarterWeaponDef interface + STARTER_WEAPON_DEFS (used in helpers/items.ts for character creation), WorldDropItemDef interface | All specific WORLD_DROP_GEAR_DEFS, WORLD_DROP_JEWELRY_DEFS, CRAFTING_BASE_GEAR_DEFS, BOSS_DROP_DEFS, starter accessory/armor descriptions, junk defs, resource defs |
| crafting_materials.ts | MaterialDef interface + MATERIAL_DEFS (used by location.ts, items_crafting.ts), CraftingModifierDef interface + CRAFTING_MODIFIER_DEFS (used by 4 files), CRAFTING_MODIFIER_WEIGHT_MULTIPLIER, all helper functions (materialTierToCraftQuality, getMaterialForSalvage, getCraftQualityStatBonus, getModifierMagnitude), CRAFT_QUALITY_LEVELS, AFFIX_SLOTS_BY_QUALITY, ESSENCE_MAGNITUDE, ESSENCE_QUALITY_GATE, SALVAGE_YIELD_BY_TIER, ESSENCE_TIER_THRESHOLDS, MODIFIER_REAGENT_THRESHOLDS, MODIFIER_MAGNITUDE_BY_ESSENCE | ConsumableRecipeDef + CONSUMABLE_RECIPES, GearRecipeDef + GEAR_RECIPES, GEAR_RECIPE_NAMES |
| named_enemy_defs.ts | NamedEnemyLootDef interface (loot table structure), boss stat scaling patterns (document as formulas) | All 12 NAMED_ENEMY_DEFS, all BOSS_DROP_DEFS (already in item_defs analysis) |
| faction_data.ts | Rival relationship structure concept (faction has rivalFactionId) | FACTION_DATA array, ensureFactions function |
| npc_data.ts | AFFINITY_TIERS, AFFINITY_TIER_NAMES, getAffinityTierName, CONVERSATION_COOLDOWN_MICROS, MAX_GIFTS_PER_DAY, GIFT_COOLDOWN_MICROS | NPC_PERSONALITIES |
| world_gen.ts | pickRippleMessage, pickDiscoveryMessage, computeRegionDanger, RIPPLE_TEMPLATES, DISCOVERY_TEMPLATES, BIOME_HINTS | Nothing -- all content is active |

**IMPORTANT NOTE on crafting_materials.ts:** The CONTEXT.md says "Extract material tiers, modifier defs, and crafting formulas into a domain rule file, then delete. Discard specific recipes and material lists." However, `MATERIAL_DEFS` (the material list) IS actively used by `helpers/location.ts` for gather node generation and `reducers/items_crafting.ts` for salvage. The executor should keep MATERIAL_DEFS in `crafting_rules.ts` since it defines the material taxonomy used by live game systems, not seeded content.

Similarly, `CONSUMABLE_RECIPES` and `GEAR_RECIPES` may still be used by the crafting system (items_crafting.ts imports from crafting_materials.ts). The executor should trace whether these are only used by seeding or also by live crafting before discarding.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Import graph analysis | Manual grep-based tracing | TypeScript compiler errors after deletion | Compiler will catch every broken import; grep can miss re-exports and dynamic imports |
| Circular dependency detection | Manual analysis | `npx madge --circular spacetimedb/src/` or just compile | TypeScript bundler will fail on true circular deps |

## Common Pitfalls

### Pitfall 1: Deleting Active Functions Along With Seeded Data
**What goes wrong:** Files like `crafting_materials.ts` and `world_gen.ts` contain both seeded data AND active helper functions/constants used by live systems
**Why it happens:** The deletion list names entire files, not specific exports
**How to avoid:** Extract active exports FIRST, rewire importers, compile-check, THEN delete
**Warning signs:** Compilation errors mentioning helper functions, not just data constants

### Pitfall 2: ensure_content.ts Contains Scheduled Table Setup
**What goes wrong:** Deleting the seeding directory removes scheduled table initialization, breaking day/night cycle, health regen, effect ticks, etc.
**Why it happens:** Scheduled table setup was co-located with seeding logic
**How to avoid:** Relocate `ensureHealthRegenScheduled`, `ensureDayNightTickScheduled`, etc. BEFORE deleting
**Warning signs:** Game systems stop ticking after publish

### Pitfall 3: syncAllContent Removal Breaks Admin Commands
**What goes wrong:** `reducers/commands.ts` line 270 calls syncAllContent -- removing it without replacement breaks admin resync
**Why it happens:** Admin "resync" command relied on re-running all seeding
**How to avoid:** Replace with a minimal "ensure scheduled tables + world state" function
**Warning signs:** Admin resync command throws errors

### Pitfall 4: Frontend Orphaned Data
**What goes wrong:** App.vue has 2971 lines with many data properties, computed values, and handlers that only existed for deleted panels
**Why it happens:** Large component with accumulated legacy code
**How to avoid:** After deleting panel imports/templates, search App.vue for variables only referenced in deleted sections
**Warning signs:** Unused variable warnings, data fetching for tables no longer displayed

### Pitfall 5: STARTER_WEAPON_DEFS Still Needed
**What goes wrong:** Deleting item_defs.ts breaks character creation -- helpers/items.ts imports STARTER_WEAPON_DEFS
**Why it happens:** Starter weapons are part of the live character creation flow, not just seeding
**How to avoid:** Extract STARTER_WEAPON_DEFS to equipment_rules.ts before deletion
**Warning signs:** New characters created without weapons

### Pitfall 6: World Gen Functions Are Active
**What goes wrong:** Deleting data/world_gen.ts removes pickRippleMessage, pickDiscoveryMessage, computeRegionDanger used by live world generation
**Why it happens:** File name suggests "seeded world data" but actually contains active generation logic
**How to avoid:** Relocate these 3 functions + their template arrays to helpers/world_gen.ts
**Warning signs:** Region discovery/generation fails

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.1 |
| Config file | None (vitest defaults, script in package.json) |
| Quick run command | `cd spacetimedb && npm test` |
| Full suite command | `cd spacetimedb && npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLEAN-01 | Files deleted, project compiles | build | `cd spacetimedb && npx spacetime build` | N/A (build check) |
| CLEAN-02 | Rules extracted, equipment_rules.ts has armor class mappings | unit | `cd spacetimedb && npx vitest run --reporter=verbose` | Wave 0 |
| CLEAN-03 | Shared helpers work (combat, items, economy) | unit | `cd spacetimedb && npx vitest run` | Existing: combat.test.ts, items.test.ts |
| CLEAN-04 | Frontend compiles after panel removal | build | `npm run build` (client) | N/A (build check) |
| CLEAN-05 | Dead reducers removed, no broken refs | build | `cd spacetimedb && npx spacetime build` | N/A (build check) |
| CLEAN-06 | No broken imports after cleanup | build | `cd spacetimedb && npx spacetime build && npm run build` | N/A (build check) |

### Sampling Rate
- **Per task commit:** `cd spacetimedb && npm test`
- **Per wave merge:** `cd spacetimedb && npm test` + `cd spacetimedb && npx spacetime build`
- **Phase gate:** Full backend tests + backend build + frontend build all green

### Wave 0 Gaps
- [ ] Existing tests in `helpers/items.test.ts` mock `STARTER_WEAPON_DEFS` -- must update mock path after extraction
- [ ] Existing tests in `helpers/world_gen.test.ts` mock `computeRegionDanger` -- must update mock path after relocation
- [ ] No new test files needed -- existing Phase 31 tests serve as regression guards

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis via grep/read of all files on deletion list
- Import chain traced via grep for every file being deleted
- ensure_content.ts read in full -- scheduled table functions identified

### Secondary (MEDIUM confidence)
- App.vue import analysis (2971 lines -- checked key imports, may have missed deeply nested references)

## Metadata

**Confidence breakdown:**
- Deletion dependency map: HIGH -- every import traced via grep
- Rule extraction scope: HIGH -- all source files read in full
- Frontend cleanup: MEDIUM -- App.vue is 2971 lines, some orphaned refs may be missed (compiler will catch)
- Deduplication targets: MEDIUM -- sell logic spread across 4 reducers, needs deeper analysis during execution

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable codebase, no external dependencies)
