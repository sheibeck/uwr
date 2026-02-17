---
phase: quick-140
plan: "01"
subsystem: UI / Tooltip
tags: [tooltip, rarity, item-quality, bug-fix]
dependency_graph:
  requires: []
  provides: [rarity-colored-tooltip-title, correct-description-qualityTier, weapon-armorType-fix]
  affects: [src/App.vue, src/composables/useInventory.ts, src/composables/useCombat.ts]
tech_stack:
  added: []
  patterns: [inline-style-rarity-color, qualityTier-over-template-rarity, weaponType-fallback]
key_files:
  created: []
  modified:
    - src/App.vue
    - src/composables/useInventory.ts
    - src/composables/useCombat.ts
decisions:
  - "tooltipRarityColor uses qualityTier ?? rarity ?? 'common' fallback chain for vendor/loot compatibility"
  - "weaponType shown for weapon slots, armorType 'none' explicitly filtered for armor slots"
  - "qualityTier moved before description construction in inventoryItems to avoid forward reference"
metrics:
  duration: 5min
  completed: 2026-02-17T14:08:36Z
  tasks: 1
  files: 3
---

# Quick Task 140: Fix Item Tooltip to Show Correct Rarity

**One-liner:** Rarity-colored tooltip title using `qualityTier` with per-instance color map, and description construction fixed to use instance qualityTier and suppress armorType 'none' on weapons.

## What Was Done

Fixed three tooltip bugs across four code locations:

**Bug 1 — Tooltip title always white**
- Added `tooltipRarityColor(item)` helper in `src/App.vue` near the showTooltip function
- Helper reads `item?.qualityTier ?? item?.rarity ?? 'common'` for backwards compatibility with vendor items (which have `rarity` not `qualityTier`)
- Color map: common=#ffffff, uncommon=#22c55e, rare=#3b82f6, epic=#aa44ff, legendary=#ff8800
- Tooltip title div updated to spread rarity color into its style binding

**Bug 2 — Description shows template rarity instead of instance qualityTier**
- `useInventory.ts` inventoryItems: moved `qualityTier` computation before description construction and replaced `template?.rarity` with `qualityTier` in the description array
- `useInventory.ts` equippedSlots: replaced `template?.rarity` with `instance?.qualityTier ?? template?.rarity ?? 'common'`
- `useCombat.ts` activeLoot: replaced `template?.rarity` with `row.qualityTier ?? template?.rarity ?? 'common'`
- `useCombat.ts` pendingLoot: already used `qualityTier` correctly — no Bug 2 change needed here

**Bug 3 — Weapons show "none" for armorType**
- Applied fix in all four description construction sites
- Weapon slots (`weapon`, `mainHand`, `offHand`): show `template?.weaponType` or omit if falsy
- Armor slots: show `template?.armorType` but only if it is not `'none'`

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- Build passes: `npx vite build` succeeded in 13.97s, 494 modules transformed
- TypeScript errors shown by `vue-tsc --noEmit` are all pre-existing (readonly array types, unused imports) - none introduced by this change
- Tooltip title div in App.vue correctly applies `tooltipRarityColor(tooltip.item)` spread
- Description arrays in useInventory.ts use qualityTier instance field
- Weapons use weaponType (or omit) instead of armorType "none"

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 0966b68 | fix(140): color tooltip title by rarity, fix description rarity/armorType bugs |

## Self-Check: PASSED

- [x] `src/App.vue` modified — tooltipRarityColor helper added, tooltip title updated
- [x] `src/composables/useInventory.ts` modified — qualityTier before description, armorType/weaponType fix in both inventoryItems and equippedSlots
- [x] `src/composables/useCombat.ts` modified — armorType/weaponType fix and qualityTier in both activeLoot and pendingLoot
- [x] Commit 0966b68 exists in git log
