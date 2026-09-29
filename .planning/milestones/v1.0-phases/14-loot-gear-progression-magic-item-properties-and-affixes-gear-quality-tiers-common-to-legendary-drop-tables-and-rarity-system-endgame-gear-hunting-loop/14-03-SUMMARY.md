---
phase: 14-loot-gear-progression
plan: 03
subsystem: combat, items, loot
tags: [spacetimedb, legendary, salvage, loot, gear]

# Dependency graph
requires:
  - phase: 14-02
    provides: take_loot affix row creation, ItemAffix table with by_instance index, rollQualityTier capped at epic
  - phase: 14-01
    provides: LEGENDARIES catalog with enemyTemplateName/affixes, affix_catalog.ts, ItemAffix table schema
provides:
  - Named boss enemy kills drop their assigned legendary item as a single CombatLoot row (isNamed=true)
  - Legendary CombatLoot rows carry fixed affixes from LEGENDARIES catalog via affixDataJson
  - Legendary drops go to first alive participant only (no group duplication)
  - salvage_item reducer destroys gear and grants gold scaled by tier+quality
  - salvage_item deletes both ItemInstance and associated ItemAffix rows
affects: 14-04, client-loot-display, combat-loot-system, item-lifecycle

# Tech tracking
tech-stack:
  added: []
  patterns:
    - LEGENDARIES catalog lookup by enemyTemplateName for boss-drop routing
    - Single-loot-per-legendary pattern prevents group duplicate legendary drops
    - affix serialization via JSON.stringify for fixed legendary affixes into CombatLoot
    - salvage gold yield = baseGoldByQuality * tier (gold-only fallback until Phase 13 materials)

key-files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/items.ts

key-decisions:
  - "Legendary drop check runs after per-participant regular loot loop, before corpse creation — post-kill, pre-cleanup ordering"
  - "Legendary drop uses ctx.db.itemTemplate.iter() scan by name since no name index exists — acceptable for rare boss kills"
  - "logGroupEvent used for group announcement (takes combatId) rather than appendGroupEvent (takes groupId) for consistency with existing combat log helpers"
  - "Gold-only salvage yield (common=2*tier, uncommon=5*tier, rare=10*tier, epic=20*tier, legendary=50*tier) — material salvage deferred until Phase 13 crafting materials exist"
  - "salvage_item blocks on equippedSlot to prevent unintended loss of active gear"

patterns-established:
  - "Legendary drops: check enemyTemplateName in LEGENDARIES after regular loot loop, insert single CombatLoot with isNamed=true for first alive participant"
  - "Item cleanup pattern: delete ItemAffix rows via by_instance.filter before deleting ItemInstance (matches sell_item pattern)"

# Metrics
duration: 15min
completed: 2026-02-17
---

# Phase 14 Plan 03: Named Legendary Drops and Salvage Summary

**Named boss kills now drop LEGENDARIES catalog items with fixed affixes for first participant, and gear can be salvaged into gold scaled by tier and quality.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-17T00:00:00Z
- **Completed:** 2026-02-17T00:15:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Named boss enemies (Fen Witch, Cinder Sentinel, Hexbinder, Basalt Brute) now drop their LEGENDARIES catalog item after combat victory — a single CombatLoot row with qualityTier='legendary', isNamed=true, and fixed affixDataJson serialized from the catalog
- Legendary drop goes to the first alive participant only, preventing duplicate legendaries across group members
- Group-wide announcement fires via logGroupEvent when a legendary drops
- salvage_item reducer validates ownership, equipped state, and item type (blocks junk/consumable/food/resource/quest) then deletes all ItemAffix rows before deleting the ItemInstance
- Gold yield from salvage scales by quality tier multiplied by item tier (tier 2 uncommon = 5×2 = 10 gold)

## Task Commits

1. **Task 1: Add named legendary drop path in combat end** - `19838b5` (feat)
2. **Task 2: Add salvage_item reducer for gear recycling** - `5a49c2f` (feat)

## Files Created/Modified

- `spacetimedb/src/reducers/combat.ts` - Import LEGENDARIES, legendary drop check block after per-participant loot loop
- `spacetimedb/src/reducers/items.ts` - salvage_item reducer with gold yield by tier+quality

## Decisions Made

- Legendary drop iterates `ctx.db.itemTemplate.iter()` by name to find the base template. No name index exists, but boss kills are rare so full scan is acceptable. If this becomes a performance issue, a name-indexed lookup can be added later.
- Gold-only salvage: the existing resource items (Iron Shard, Scrap Cloth, Ancient Dust) are gatherable resources, not crafting materials. Using them as salvage output would be confusing since players can gather them freely. Gold is clean and straightforward as a placeholder until Phase 13 adds purpose-built crafting materials.
- The legendary check is placed after the per-participant regular loot loop and before corpse creation — this ensures regular loot is already generated and the combatResult auto-clean logic (which runs after loot generation per character) doesn't interfere.
- `logGroupEvent` (which takes `combatId`) used for the group legendary announcement rather than direct `appendGroupEvent` (which takes `groupId`) to stay consistent with all other combat event logging in the same codebase section.

## Deviations from Plan

None — plan executed exactly as written. The gold fallback for salvage was explicitly specified in the plan as the expected approach when no crafting materials exist.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Self-Check

### Files Exist

- `spacetimedb/src/reducers/combat.ts` — modified with legendary drop path
- `spacetimedb/src/reducers/items.ts` — modified with salvage_item reducer

### Commits Exist

- `19838b5` — feat(14-03): add named legendary drop path in combat end
- `5a49c2f` — feat(14-03): add salvage_item reducer for gear recycling

## Next Phase Readiness

- Legendary drop backend path is complete; Phase 14 Plan 04 (client-side loot display with quality colors and affix tooltips) can now integrate legendary-tier display
- The take_loot reducer from Plan 02 already handles isNamed=true items correctly — no client changes needed for legendary pickup logic
- salvage_item is backend-only; client-side "Salvage" context menu option in InventoryPanel is Phase 14 Plan 04 work

---
*Phase: 14-loot-gear-progression*
*Completed: 2026-02-17*
