---
phase: quick-137
plan: 01
subsystem: loot-system
tags: [jewelry, loot-tables, world-drops, quality-floor, seeding]
dependency_graph:
  requires: [quick-129, quick-134, 14-02]
  provides: [world-drop-jewelry-templates, jewelry-loot-weight, jewelry-quality-floor]
  affects: [combat-loot, vendor-inventory, item-templates]
tech_stack:
  added: []
  patterns: [JEWELRY_SLOTS constant for slot-type detection, effectiveQuality quality floor pattern]
key_files:
  created: []
  modified:
    - spacetimedb/src/seeding/ensure_items.ts
    - spacetimedb/src/seeding/ensure_content.ts
    - spacetimedb/src/seeding/ensure_enemies.ts
    - spacetimedb/src/reducers/combat.ts
decisions:
  - "Jewelry templates seeded with rarity 'common' in DB; quality floor applied at loot-generation time not seed time"
  - "JEWELRY_SLOTS_COMBAT defined as local const inside generateLootTemplates closure"
  - "Jewelry weight 1n (vs 3n uncommon / 6n common for weapons/armor) for ~20% relative drop rate"
metrics:
  duration: 2min
  completed: 2026-02-17
---

# Phase quick-137 Plan 01: Add Jewelry to World-Drop Loot Tables Summary

Jewelry (earrings and neck slots) added to world-drop loot pool with 10 templates across two tiers, reduced weight (1n vs 3-6n for gear), and a quality floor that bumps common jewelry rolls to uncommon at loot-generation time.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add world-drop jewelry templates and wire into seeding | fda1d12 | ensure_items.ts, ensure_content.ts |
| 2 | Lower jewelry loot weight and apply quality floor | 5594672 | ensure_enemies.ts, combat.ts |

## What Was Built

### Jewelry Templates (ensure_items.ts)

New exported function `ensureWorldDropJewelryTemplates(ctx)` using the same `upsertByName` helper pattern as `ensureWorldDropGearTemplates`.

**Tier 1 (requiredLevel: 1n, tier: 1n, vendorValue: 6n):**
- Copper Band (earrings, strBonus: 1n)
- Iron Signet (earrings, dexBonus: 1n)
- Tarnished Loop (earrings, intBonus: 1n)
- Stone Pendant (neck, wisBonus: 1n)
- Bone Charm (neck, hpBonus: 3n)
- Frayed Cord (neck, manaBonus: 3n)

**Tier 2 (requiredLevel: 11n, tier: 2n, vendorValue: 16n):**
- Silver Band (earrings, strBonus: 2n)
- Arcane Loop (earrings, intBonus: 2n)
- Ember Pendant (neck, wisBonus: 2n)
- Vitality Cord (neck, hpBonus: 6n)

All templates: armorType 'none', allowedClasses 'any', stackable false, rarity 'common'.

### Seeding Wire-Up (ensure_content.ts)

`ensureWorldDropJewelryTemplates(ctx)` imported and called immediately after `ensureWorldDropGearTemplates(ctx)` in `syncAllContent`.

### Loot Table Weight (ensure_enemies.ts)

`JEWELRY_SLOTS = new Set(['earrings', 'neck'])` defined before gear loop in `addOrSyncTable`. Jewelry items get weight `1n` regardless of rarity; other gear items keep `item.rarity === 'uncommon' ? 3n : 6n`. This gives jewelry ~17% the drop rate of common gear and ~33% the rate of uncommon gear.

### Quality Floor (combat.ts)

In `generateLootTemplates`, after `rollQualityTier` call:

```typescript
const JEWELRY_SLOTS_COMBAT = new Set(['earrings', 'neck']);
const effectiveQuality = (JEWELRY_SLOTS_COMBAT.has(template.slot) && quality === 'common')
  ? 'uncommon'
  : quality;
```

`effectiveQuality` used in place of `quality` for the `!== 'common'` check, affix generation, and both `lootItems.push` calls. Guarantees no common-quality jewelry ever drops from world loot.

### Vendor Inventory

No changes needed — `ensureVendorInventory` already includes `earrings` and `neck` slots in the `accessories` category filter; new jewelry templates with rarity 'common' automatically appear in vendor selections.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- Module published cleanly to local server (no TypeScript or runtime errors)
- 10 jewelry templates seeded (6 tier-1, 4 tier-2) with earrings/neck slots
- Loot table entries for jewelry items have weight 1n vs 6n for normal gear
- Quality floor active: any common jewelry roll promoted to uncommon before affix assignment

## Self-Check: PASSED

- `spacetimedb/src/seeding/ensure_items.ts` — modified, ensureWorldDropJewelryTemplates function added
- `spacetimedb/src/seeding/ensure_content.ts` — modified, import + call added
- `spacetimedb/src/seeding/ensure_enemies.ts` — modified, JEWELRY_SLOTS weight logic added
- `spacetimedb/src/reducers/combat.ts` — modified, JEWELRY_SLOTS_COMBAT + effectiveQuality floor added
- Commit fda1d12: Task 1 jewelry templates
- Commit 5594672: Task 2 loot weight + quality floor
