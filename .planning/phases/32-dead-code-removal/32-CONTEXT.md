# Phase 32: Dead Code Removal - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Purge all v1.0 legacy files from the MEMORY.md deletion list, extract implicit mechanical rules into domain-specific rule files, deduplicate backend and frontend code, and clean the import graph. Every remaining file after this phase is actively used.

</domain>

<decisions>
## Implementation Decisions

### Deletion scope & strategy
- **Delete all files on the MEMORY.md deletion list** and rewire callers — no half-measures
- **Remove the entire seeding system** (spacetimedb/src/seeding/ directory) — v2.0 generates everything through play, new DBs start empty
- **crafting_materials.ts**: Extract material tiers, modifier defs, and crafting formulas into a domain rule file, then delete. Discard specific recipes and material lists
- **faction_data.ts**: Move mechanical rules (rival relationship structure, faction type enum) to a domain rule file. Delete the 4 hardcoded faction definitions. Factions get generated through play
- **dialogue_data.ts**: Delete entirely — LLM-powered NPC conversation already built
- **named_enemy_defs.ts**: Extract boss stat scaling formulas, ability slot counts per tier, loot table drop rate ranges into a domain rule file, then delete
- **item_defs.ts**: Extract slot-to-armor-class mappings, stat range formulas per rarity tier, weapon type base stat ranges into a domain rule file, then delete
- **npc_data.ts**: Keep affinity tier constants and cooldown mechanics (move to domain rule file). Delete NPC_PERSONALITIES
- **world_gen.ts**: Delete — region generation is LLM-powered in v2.0
- Requires `--clear-database` on next publish (schema changes from table removal)

### Rule extraction approach
- **Extract constraints only** — slot-to-armor-class mappings, stat range formulas per rarity, weapon type base stat ranges, scaling formulas. Discard specific item/enemy/NPC definitions
- **Domain-split file organization** — NO giant umbrella files. New domain-specific rule files in `spacetimedb/src/data/`:
  - `equipment_rules.ts` — armor class restrictions, stat ranges per slot/rarity, weapon type constraints
  - `enemy_rules.ts` — boss stat scaling by danger level, ability slot counts per tier, loot drop rate ranges
  - `crafting_rules.ts` — material tiers, modifier defs, crafting formulas
  - `faction_rules.ts` — rival relationship structure, faction type vocabulary
  - `npc_rules.ts` — affinity tier constants, conversation cooldowns
- `mechanical_vocabulary.ts` stays focused on shared vocabulary (ability kinds, effect types, stat enums, damage types)

### Frontend legacy cleanup
- **Remove ALL legacy panels**: CharacterPanel.vue, NpcDialogPanel.vue, QuestPanel.vue, RenownPanel.vue
- **Remove associated composables**: useCharacterCreation.ts and any other composables only used by deleted panels
- **Remove old create_character reducer** from characters.ts
- **Clean App.vue**: Remove dead imports, unused composable calls, and orphaned event handlers left behind by panel deletion
- **Claude traces the full import graph** to find ALL unused components, composables, and utilities — not just the known list

### Deduplication targets
- **Claude identifies ALL backend duplication** — sell calculations, damage formulas, gold math, stat lookups, economy helpers. Extract shared helpers for everything found
- **Shared helpers go into existing domain files** — combat.ts gets all combat utils, economy.ts gets all gold/sell math. No new files unless a function truly doesn't belong
- **Frontend consolidation**: After removing legacy panels, consolidate any remaining components with duplicate patterns (similar lists, modals, status displays)
- **Remove unused tables from schema** (index.ts) — if a table is only referenced by deleted seeding/legacy code with no active views or reducers, remove it
- **Remove dead reducers and unused table accessors** (CLEAN-05)

### Claude's Discretion
- Exact ordering of deletions to minimize intermediate broken states
- Which tables are truly orphaned vs borderline (flag borderline cases)
- How to handle import chain cascades during deletion
- Whether to batch deletions or do incremental compile-check cycles

</decisions>

<specifics>
## Specific Ideas

- User strongly prefers domain-split organization over monolithic files — "leverage domains instead of putting all our vocabulary under one giant umbrella"
- The v2.0 principle: "Everything is generated through play. Nothing is pre-seeded." — this phase enforces that by removing the seeding infrastructure

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mechanical_vocabulary.ts` (26,358 bytes) — already the shared vocabulary for ability kinds, damage types, stats, effects. Domain rule files will sit alongside it
- Phase 31 test infrastructure — tests exist for combat, inventory, intent routing, equipment generation to catch regressions during deletion
- Vitest configured and working (`npm test` in spacetimedb/)

### Established Patterns
- Backend helpers in `spacetimedb/src/helpers/` — domain-organized (combat.ts, items.ts, economy.ts, events.ts)
- Data files in `spacetimedb/src/data/` — constants and rule definitions
- Frontend composables in `src/composables/` — `use[Feature].ts` pattern
- Narrative UI components in `src/components/Narrative*.vue` — the active UI layer

### Integration Points
- `spacetimedb/src/index.ts` — table definitions, schema export, syncAllContent() call chain (to be removed)
- `src/App.vue` — 2k+ lines, wires up both legacy and narrative components (needs dead reference cleanup)
- `src/module_bindings/` — must be regenerated after table/reducer removals
- Seeding entry: `ensure_content.ts` → `ensure_items.ts`, `ensure_enemies.ts`, `ensure_world.ts` (entire chain deleted)

### Deletion List File Status (from scout)
- **Already gone**: `abilities/` dir, `ability_catalog.ts`
- **Active imports (need rewiring)**: crafting_materials.ts (6 deps), named_enemy_defs.ts (3 deps), item_defs.ts (2 deps), faction_data.ts (2 deps), npc_data.ts (2 deps), world_gen.ts (2 deps)
- **Low dependency**: dialogue_data.ts (1 dep — ensure_world.ts, also being deleted)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 32-dead-code-removal*
*Context gathered: 2026-03-09*
