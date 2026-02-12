---
phase: quick-14
plan: 01
subsystem: game-systems
tags: [vendors, seeding, randomization, spacetimedb]

# Dependency graph
requires:
  - phase: 03-renown-foundation
    provides: Vendor inventory system and UI
provides:
  - Vendor inventory uses curated random subset selection with tier filtering
  - Deterministic inventory seeding based on vendor NPC id
  - Category-balanced selection (armor, weapons, accessories, consumables)
affects: [vendor-ui, item-availability, progression-balance]

# Tech tracking
tech-stack:
  added: []
  patterns: [deterministic-randomization-with-npc-id-seed, tier-based-item-filtering]

key-files:
  created: []
  modified: [spacetimedb/src/index.ts]

key-decisions:
  - "Vendor tier derived from region dangerMultiplier (e.g. 100 = Tier 1, 200 = Tier 2)"
  - "Random selection uses vendor.id as seed for stable inventory across sync calls"
  - "Category quotas: armor=4, weapons=3, accessories=2, consumables=all"
  - "Stale vendor items from old 'everything' approach are cleaned up automatically"

patterns-established:
  - "Deterministic random selection: pickN(items, n, seed) with vendor.id seed prevents inventory from changing on every sync"
  - "Tier-based filtering: vendor tier >= item tier ensures region-appropriate item availability"

# Metrics
duration: 1min
completed: 2026-02-12
---

# Quick Task 14: Update Vendor Seeding to Use Random Selection Summary

**Vendors now stock a curated random subset of ~13-15 tier-appropriate items instead of displaying all 50+ items in the game**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-12T16:24:32Z
- **Completed:** 2026-02-12T16:25:39Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Vendors iterate all NPCs with npcType='vendor' instead of just the first
- Vendor tier derived from region's dangerMultiplier (Hollowmere Vale = Tier 1)
- Items filtered by tier: only items with tier <= vendor tier are eligible
- Items grouped by category (armor, weapons, accessories, consumables) for balanced selection
- Deterministic random subset selection using vendor.id as seed ensures stable inventory
- Stale vendor items from old seeding approach are automatically cleaned up

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite ensureVendorInventory with tier-filtered random subset selection** - `859b4b2` (feat)

## Files Created/Modified
- `spacetimedb/src/index.ts` - Rewrote ensureVendorInventory function to use tier filtering, category grouping, and deterministic random subset selection

## Decisions Made

**1. Vendor tier derivation from region dangerMultiplier**
- Hollowmere Vale (dangerMultiplier=100) = Tier 1
- Embermarch Fringe (dangerMultiplier=160) = Tier 1
- Embermarch Depths (dangerMultiplier=200) = Tier 2
- Formula: `Math.max(1, Math.floor(dangerMultiplier / 100))`

**2. Category selection quotas**
- Armor: 4 items (out of ~12 total)
- Weapons: 3 items (out of ~8 total)
- Accessories: 2 items (out of ~5 total)
- Consumables: ALL (bandages, rations, potions, food always available)

**3. Deterministic seed using vendor.id**
- Use vendor.id instead of ctx.timestamp to ensure stable inventory
- Same vendor always stocks same items across multiple sync calls
- Prevents inventory from changing unpredictably

**4. Stale item cleanup**
- After upserting selected items, delete VendorInventory rows for items not in selection
- Handles transition from old "everything" approach to new "subset" approach

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation proceeded smoothly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Vendor UI now displays a manageable subset of items instead of overwhelming "debug tool" experience
- Tier-based filtering naturally gates item availability by region
- Stable inventory creates more believable vendor experience
- Ready for future enhancements (vendor refresh mechanics, special inventory events)

## Self-Check

Verification of deliverables:

**Files exist:**
- ✓ spacetimedb/src/index.ts modified with new ensureVendorInventory implementation

**Commits exist:**
- ✓ 859b4b2 - feat(quick-14): update vendor inventory to use random subset selection

**Self-Check: PASSED**

---
*Phase: quick-14*
*Completed: 2026-02-12*
