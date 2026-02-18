---
phase: quick-173
plan: 01
subsystem: crafting-loot
tags: [crafting, loot, combat, salvage, modifier-reagents]
dependency_graph:
  requires: [crafting_materials.ts, ensure_enemies.ts, combat.ts, items.ts]
  provides: [MODIFIER_REAGENT_THRESHOLDS, modifier-reagent-loot-seeding, combat-reagent-drops, salvage-reagent-bonus]
  affects: [combat-loot-pipeline, salvage-reducer, loot-table-seeding]
tech_stack:
  added: []
  patterns: [essenceTemplateMap-mirrored-for-modifiers, level-gated-eligibility-list, deterministic-pick-by-ids]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/crafting_materials.ts
    - spacetimedb/src/seeding/ensure_enemies.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/items.ts
decisions:
  - MODIFIER_REAGENT_THRESHOLDS uses same ordered-highest-first pattern as ESSENCE_TIER_THRESHOLDS
  - Modifier reagent loot seeding gated to isMidTier || isHighTier only (mountains/town/city/dungeon)
  - Combat drop uses different seed offsets (11n/43n) to avoid correlation with essence drops (7n/31n)
  - Salvage roll uses itemInstanceId * 13n to pick both chance and reagent type deterministically
  - 15% combat drop rate and 30% salvage rate chosen for progression feel (not too common, not too rare)
metrics:
  duration: ~8min
  completed: 2026-02-18
  tasks: 2
  files: 4
---

# Phase quick-173 Plan 01: Modifier Reagent Acquisition Summary

Modifier reagents (Glowing Stone, Clear Crystal, Ancient Rune, Wisdom Herb, Silver Token, Life Stone, Mana Pearl, Iron Ward, Spirit Ward) are now obtainable through two gameplay paths: enemy combat drops (15% per kill) and gear salvage (30% bonus yield).

## What Was Built

### Task 1: Modifier reagent thresholds + loot table seeding

Added `MODIFIER_REAGENT_THRESHOLDS` constant to `crafting_materials.ts` with three level bands (ordered highest-first for early-return matching):
- Level 21+: all 9 modifier reagents
- Level 11-20: 6 reagents (adds Ancient Rune, Wisdom Herb, Iron Ward)
- Level 1-10: 3 reagents (Glowing Stone, Clear Crystal, Life Stone)

Updated `ensureMaterialLootEntries` in `ensure_enemies.ts` to import `CRAFTING_MODIFIER_DEFS`, build a `modifierReagentTemplates` Map at function start, then upsert creature-type-affinity reagent entries into mid/high-tier loot tables:
- Animal/beast: Glowing Stone (w8), Clear Crystal (w8), Life Stone (w6)
- Undead: Ancient Rune (w8), Life Stone (w6), Spirit Ward (w6)
- Spirit: Wisdom Herb (w8), Mana Pearl (w8), Spirit Ward (w6)
- Construct: Iron Ward (w8), Glowing Stone (w6), Mana Pearl (w6)
- Humanoid: Silver Token (w8), Clear Crystal (w6), Wisdom Herb (w6)

Low-tier terrains (plains/woods/swamp) receive no modifier reagent seeding, gating progression.

### Task 2: Runtime combat drops + salvage bonus yield

In `combat.ts`:
- Added `MODIFIER_REAGENT_THRESHOLDS` and `CRAFTING_MODIFIER_DEFS` to the import from `crafting_materials`
- Built `modifierTemplateMap` once per victory alongside `essenceTemplateMap`
- Added modifier reagent drop block after essence drop block with 15% chance (seed: `character.id * 11n ^ timestamp + template.id * 43n`)
- Level-gates eligible reagent names via `MODIFIER_REAGENT_THRESHOLDS`
- Picks reagent deterministically: `(character.id + template.id) % eligibleNames.length`
- Inserts `CombatLoot` row with no qualityTier/affixDataJson/isNamed (same as essence pattern)

In `items.ts`:
- Added 30% bonus modifier reagent in `salvage_item` reducer after material yield block
- Roll: `(ctx.timestamp.microsSinceUnixEpoch + args.itemInstanceId * 13n) % 100n < 30n`
- Pick: `(itemInstanceId + character.id) % CRAFTING_MODIFIER_DEFS.length`
- Grants 1x reagent via `addItemToInventory`, appends private event log message

## Commits

| Task | Hash | Description |
|------|------|-------------|
| 1 | ebde139 | feat(quick-173): add MODIFIER_REAGENT_THRESHOLDS and seed modifier reagents to loot tables |
| 2 | 2c6430c | feat(quick-173): add runtime modifier reagent drops in combat and bonus salvage yield |

## Deviations from Plan

None — plan executed exactly as written. The only structural decision was to build `modifierReagentTemplates` as a `Map<string, any>` consistent with `modifierTemplateMap` (same naming) and to use `Map.get()` consistently for zero-overhead lookups during the loot seeding loop.

## Self-Check: PASSED

Files modified confirmed present:
- `spacetimedb/src/data/crafting_materials.ts` — MODIFIER_REAGENT_THRESHOLDS exported
- `spacetimedb/src/seeding/ensure_enemies.ts` — CRAFTING_MODIFIER_DEFS imported, all 5 creature types updated
- `spacetimedb/src/reducers/combat.ts` — modifierTemplateMap built, 15% drop logic inserted
- `spacetimedb/src/reducers/items.ts` — 30% salvage bonus inserted

Commits confirmed:
- ebde139 — present in git log
- 2c6430c — present in git log

Module publishes without errors. No TypeScript compilation errors. No `--clear-database` required (data-only seeding changes via upsert patterns).
