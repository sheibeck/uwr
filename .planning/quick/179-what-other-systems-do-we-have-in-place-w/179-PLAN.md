---
phase: quick-179
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/179-what-other-systems-do-we-have-in-place-w/179-AUDIT.md
autonomous: true
must_haves:
  truths:
    - "Every data+seeding pattern across the backend is cataloged"
    - "Each system is classified as consolidated, split, or partially split"
    - "Priority recommendations identify the highest-impact consolidation targets"
  artifacts:
    - path: ".planning/quick/179-what-other-systems-do-we-have-in-place-w/179-AUDIT.md"
      provides: "Comprehensive audit of all data/seeding split patterns"
---

<objective>
Audit all data/seeding patterns in the backend codebase and produce a comprehensive report identifying which systems have split data (constants in one file, seeding logic in another with inline data) versus consolidated single-source-of-truth patterns.

Purpose: After quick-178 consolidated enemy abilities, we want a full inventory of similar split patterns across all game systems to prioritize future consolidation work.
Output: An audit document cataloging every data system, its current structure, and consolidation priority.
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
  <name>Task 1: Deep audit of all data/seeding patterns and produce comprehensive report</name>
  <files>.planning/quick/179-what-other-systems-do-we-have-in-place-w/179-AUDIT.md</files>
  <action>
Read every file in spacetimedb/src/data/, spacetimedb/src/data/abilities/, spacetimedb/src/seeding/, and spacetimedb/src/helpers/ to build a complete inventory of all data+seeding patterns.

For EACH game system (enemies, abilities, items, NPCs, quests, locations, factions, races, crafting, loot tables, renown, food, world events, etc.), document:

1. **Where the data constants live** (which file, what export names)
2. **Where the seeding/ensure function lives** (which file, which function)
3. **Whether any data is defined INLINE in the seeding function** rather than imported from a data constant
4. **Classification:**
   - CONSOLIDATED: Data constant exists in data/, seeding function imports and loops over it (e.g., ENEMY_ABILITIES pattern from quick-178, FACTION_DATA in faction_data.ts, RACE_DATA in races.ts, MATERIAL_DEFS in crafting_materials.ts)
   - SPLIT: Data is defined inline in seeding functions with no corresponding data constant (e.g., all enemy templates hardcoded in ensure_enemies.ts)
   - PARTIALLY_SPLIT: Some data is in constants but some is still inline (e.g., starter items have STARTER_ARMOR in helpers/items.ts but inline weaponTemplates/junkTemplates in ensure_items.ts)

5. **Impact assessment for each SPLIT system:**
   - How many inline data entries exist (count of hardcoded calls)
   - How hard it is to add a new entry (must edit seeding function vs data file)
   - Risk of inconsistency (data in multiple places)

6. **Priority ranking** (high/medium/low) for consolidation:
   - HIGH: >20 inline entries, frequently edited, high inconsistency risk
   - MEDIUM: 5-20 inline entries, occasionally edited
   - LOW: <5 entries, rarely changes, or co-location is acceptable

Special attention to:
- Enemy templates in ensure_enemies.ts (likely the biggest split -- ~35 templates with ~70 role templates, all inline)
- NPC definitions in ensure_world.ts (inline, ~12 NPCs)
- Quest templates in ensure_world.ts (inline, ~20 quests)
- World layout (regions/locations/connections) in ensure_world.ts (inline, ~30 locations)
- World-drop gear in ensure_items.ts (inline, ~50+ item templates across multiple functions)
- Food items in ensure_items.ts (inline, 5 items)
- Loot table configuration in ensure_enemies.ts (inline terrain/creature matrices)
- ABILITY_STAT_SCALING living in combat_scaling.ts, separate from ability definitions in data/abilities/*.ts
- Combat state keys (utilityKeys, combatOnlyKeys, outOfCombatOnlyKeys) inline in ensureAbilityTemplates

Write the report to 179-AUDIT.md with sections:
- Executive Summary (how many systems total, how many consolidated vs split)
- Consolidated Systems (already good, brief listing)
- Split Systems (detailed per-system breakdown with line counts and priority)
- Recommended Consolidation Order (prioritized list for future quick tasks)
  </action>
  <verify>The audit file exists at .planning/quick/179-what-other-systems-do-we-have-in-place-w/179-AUDIT.md and contains classifications for all major game systems</verify>
  <done>Every data/seeding pattern in the backend is cataloged with classification, impact assessment, and prioritized consolidation recommendations</done>
</task>

</tasks>

<verification>
- 179-AUDIT.md exists and is comprehensive
- All seeding functions in ensure_content.ts's syncAllContent() call chain are accounted for
- Each system has a clear CONSOLIDATED / SPLIT / PARTIALLY_SPLIT classification
- Priority recommendations are actionable (each could become a standalone quick task)
</verification>

<success_criteria>
- Complete inventory of all data/seeding patterns
- Clear identification of which systems need consolidation
- Prioritized recommendations the user can act on
</success_criteria>

<output>
After completion, create `.planning/quick/179-what-other-systems-do-we-have-in-place-w/179-SUMMARY.md`
</output>
