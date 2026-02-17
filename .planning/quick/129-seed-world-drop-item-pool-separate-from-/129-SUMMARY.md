---
phase: quick-129
plan: "01"
subsystem: loot-gear
tags: [loot, gear, seeding, ui, inventory]
dependency_graph:
  requires: [14-loot-gear-progression]
  provides: [world-drop-gear-pool, equipped-quality-colors]
  affects: [ensureWorldDropGearTemplates, ensureLootTables, EquippedSlot, InventoryPanel]
tech_stack:
  added: []
  patterns: [upsert-by-name, STARTER_ITEM_NAMES exclusion set, qualityTier fallback chain]
key_files:
  created: []
  modified:
    - spacetimedb/src/seeding/ensure_items.ts
    - spacetimedb/src/seeding/ensure_enemies.ts
    - spacetimedb/src/seeding/ensure_content.ts
    - src/composables/useInventory.ts
    - src/components/InventoryPanel.vue
decisions:
  - "25 world-drop items seeded: 11 weapons (8 tier-1, 3 tier-2) and 14 armor pieces (12 tier-1, 2 tier-2)"
  - "STARTER_ITEM_NAMES set excludes Training/Scout/Warden/Vanguard/Apprentice gear from loot tables"
  - "qualityTier in EquippedSlot falls back to template.rarity for starter gear with no rolled quality"
  - "Empty equipped slots receive no color override - only filled slots show quality color"
metrics:
  duration: 3min
  completed: 2026-02-17
  tasks_completed: 2
  files_modified: 5
---

# Phase quick-129 Plan 01: Seed World-Drop Item Pool Separate from Starters

**One-liner:** Seeded 25-item world-drop gear pool (weapons/armor across all types and tiers), excluded starter Training/Scout/Warden/Vanguard items from loot via STARTER_ITEM_NAMES set, and replaced equipped slot rarity text label with quality-colored item name.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Seed world-drop gear and fix loot table filter | 344efc4 | ensure_items.ts, ensure_enemies.ts, ensure_content.ts |
| 2 | Fix equipped slot quality color display | e64b2b3 | useInventory.ts, InventoryPanel.vue |

## What Was Built

### Task 1: World-Drop Gear Pool

Added `ensureWorldDropGearTemplates` to `spacetimedb/src/seeding/ensure_items.ts` with 25 items:

**Tier 1 Weapons (requiredLevel: 1):**
- Iron Shortsword (sword, warrior/paladin/bard/spellblade/reaver, 6 dmg / 9 dps)
- Hunting Bow (bow, ranger, 5/8)
- Gnarled Staff (staff, caster classes, 4/7)
- Worn Mace (mace, paladin/cleric, 6/8)
- Rusty Axe (axe, beastmaster, 7/9)
- Notched Rapier (rapier, bard, 5/8)
- Chipped Dagger (dagger, rogue, 4/7)
- Cracked Blade (blade, spellblade/reaver, 5/8)

**Tier 2 Weapons (requiredLevel: 11):**
- Steel Longsword (sword, 9/13)
- Yew Bow (bow, 8/12)
- Oak Staff (staff, 7/11)

**Tier 1 Armor (requiredLevel: 1):**
- Cloth: Worn Robe (chest, AC+3), Worn Trousers (legs, AC+2), Worn Slippers (boots, AC+1)
- Leather: Scuffed Jerkin (chest, AC+4), Scuffed Leggings (legs, AC+3), Scuffed Boots (boots, AC+2)
- Chain: Dented Hauberk (chest, AC+5), Dented Greaves (legs, AC+4), Dented Sabatons (boots, AC+3)
- Plate: Battered Cuirass (chest, AC+6), Battered Greaves (legs, AC+5), Battered Boots (boots, AC+4)

**Tier 2 Armor (requiredLevel: 11):**
- Silken Robe (cloth chest, AC+5, INT+1)
- Ranger Jerkin (leather chest, AC+6, DEX+1)

Updated `ensureLootTables` in `ensure_enemies.ts` with `STARTER_ITEM_NAMES` set that excludes all Training/Scout/Warden/Vanguard/Apprentice gear from the `gearTemplates` filter.

Called `ensureWorldDropGearTemplates` in `syncAllContent` in `ensure_content.ts` after `ensureFoodItemTemplates` and before `ensureAbilityTemplates` (which must be before `ensureLootTables`).

### Task 2: Equipped Slot Quality Colors

- Added `qualityTier: string` to `EquippedSlot` type in `useInventory.ts`
- Populated `qualityTier` from `instance?.qualityTier ?? template?.rarity ?? 'common'`
- Added `qualityTier: string` to the equippedSlots prop type in `InventoryPanel.vue`
- Template now uses `rarityStyle(slot.qualityTier)` for the item name color (empty slots get `{}`)
- Removed `<span v-if="slot.name !== 'Empty'" :style="styles.subtle">({{ slot.rarity }})</span>` entirely

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `spacetime publish uwr --project-path spacetimedb` built and deployed cleanly
- `spacetime logs uwr` shows "Database updated" with no seeding errors
- TypeScript errors in `npm run build` are pre-existing issues unrelated to these changes (module_bindings import pattern, App.vue type narrowing)
- No new TypeScript errors introduced by our changes

## Self-Check

### Files created/modified:

- [x] spacetimedb/src/seeding/ensure_items.ts — ensureWorldDropGearTemplates function added
- [x] spacetimedb/src/seeding/ensure_enemies.ts — STARTER_ITEM_NAMES set added, gearTemplates filter updated
- [x] spacetimedb/src/seeding/ensure_content.ts — import and call added
- [x] src/composables/useInventory.ts — qualityTier on EquippedSlot type and return value
- [x] src/components/InventoryPanel.vue — qualityTier on prop type, rarity span removed, name uses qualityTier color

### Commits verified:

- [x] 344efc4: feat(quick-129): seed world-drop gear pool and fix loot table filter
- [x] e64b2b3: feat(quick-129): fix equipped slot quality color - use name color instead of rarity label

## Self-Check: PASSED
