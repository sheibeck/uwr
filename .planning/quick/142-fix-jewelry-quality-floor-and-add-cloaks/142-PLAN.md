---
quick: 142
description: Fix jewelry quality floor and add cloaks to neck slot with AC bonus
date: 2026-02-17
---

# Quick Task 142: Fix Jewelry Quality Floor and Add Cloaks

## Goal
1. All earring/pendant jewelry templates must be `rarity: 'uncommon'` — they should never appear as common on vendors or loot
2. Common items must not have base stat bonuses that look like affixes — the Stone Pendant (+1 WIS, common) is the smoking gun
3. Add cloak templates to the world-drop pool: `slot: 'neck'`, `armorClassBonus: 1n` base AC, `rarity: 'common'`
4. Update quality-floor logic and loot weights so cloaks (armor-type neck items) aren't treated as jewelry
5. Update affix catalog: Whisperwind legendary slot 'cloak' → 'neck'; remove 'cloak' from accessory affix slots

## Current State
- `ensure_items.ts` ensureWorldDropJewelryTemplates: 10 templates (earrings + neck pendants) all `rarity: 'common'` with stat bonuses
- `combat.ts` line 620-622: JEWELRY_SLOTS_COMBAT bumps all 'earrings'/'neck' items from common→uncommon in combat loot rolls
- `ensure_enemies.ts` line 81-83: JEWELRY_SLOTS includes 'earrings' and 'neck' → gets low drop weight 1n
- `affix_catalog.ts`: Whisperwind has `slot: 'cloak'`; accessory prefixes/suffixes have `slots: ['neck', 'earrings', 'cloak']`

## Tasks

### Task 1: Fix jewelry rarity and add cloak templates (ensure_items.ts)

In `spacetimedb/src/seeding/ensure_items.ts`, in the `ensureWorldDropJewelryTemplates` function:

**Step A — Change all earring + neck pendant rarity from 'common' to 'uncommon':**
- Copper Band, Iron Signet, Tarnished Loop (tier 1 earrings)
- Stone Pendant, Bone Charm, Frayed Cord (tier 1 neck pendants)
- Silver Band, Arcane Loop (tier 2 earrings)
- Ember Pendant, Vitality Cord (tier 2 neck pendants)

**Step B — Add cloak templates after the pendant block:**
```
// Tier 1 cloaks (slot: 'neck', armorType: 'cloth', rarity: 'common', armorClassBonus: 1n)
- 'Rough Cloak'    tier:1 requiredLevel:1 vendorValue:8n  armorClassBonus:1n
- 'Wool Cloak'     tier:1 requiredLevel:1 vendorValue:8n  armorClassBonus:1n
- 'Drifter Cloak'  tier:1 requiredLevel:1 vendorValue:8n  armorClassBonus:1n

// Tier 2 cloaks (slot: 'neck', armorType: 'cloth', rarity: 'common', armorClassBonus: 2n)
- 'Reinforced Cloak'  tier:2 requiredLevel:11 vendorValue:18n  armorClassBonus:2n
- 'Stalker Cloak'     tier:2 requiredLevel:11 vendorValue:18n  armorClassBonus:2n
```
All cloaks: slot='neck', all stat bonuses 0n except armorClassBonus, stackable:false, isJunk:false, allowedClasses:'any'

Commit: `fix(quick-142): jewelry rarity→uncommon, add cloak templates to neck slot`

### Task 2: Fix quality floor and loot weights (combat.ts + ensure_enemies.ts)

**combat.ts line 620-622** — Exclude cloaks (neck items with armorClassBonus > 0) from the uncommon quality floor:
```typescript
// BEFORE:
const JEWELRY_SLOTS_COMBAT = new Set(['earrings', 'neck']);
const effectiveQuality = (JEWELRY_SLOTS_COMBAT.has(template.slot) && quality === 'common')
  ? 'uncommon'
  : quality;

// AFTER:
const JEWELRY_SLOTS_COMBAT = new Set(['earrings', 'neck']);
const effectiveQuality =
  JEWELRY_SLOTS_COMBAT.has(template.slot) && template.armorClassBonus === 0n && quality === 'common'
    ? 'uncommon'
    : quality;
```

**ensure_enemies.ts line 81** — Remove 'neck' from JEWELRY_SLOTS (neck items are now weighted by rarity like all other items):
```typescript
// BEFORE:
const JEWELRY_SLOTS = new Set(['earrings', 'neck']);

// AFTER:
const JEWELRY_SLOTS = new Set(['earrings']);
```
This means:
- Earrings: weight 1n (still rare)
- Neck pendants (uncommon): weight 3n (standard uncommon weight)
- Cloaks (common): weight 6n (standard common weight)

**ensure_enemies.ts line 136-137** — Vendor accessories filter already includes 'neck'; remove dead 'cloak' reference:
```typescript
// BEFORE:
item.slot === 'earrings' || item.slot === 'cloak' || item.slot === 'neck'

// AFTER:
item.slot === 'earrings' || item.slot === 'neck'
```

Commit: `fix(quick-142): quality floor and loot weights exclude cloaks from jewelry logic`

### Task 3: Update affix catalog and republish (affix_catalog.ts + publish)

**affix_catalog.ts:**
- Whisperwind legendary: `slot: 'cloak'` → `slot: 'neck'`
- All accessory prefix/suffix entries: remove 'cloak' from `slots: ['neck', 'earrings', 'cloak']` → `slots: ['neck', 'earrings']`

**Publish module** (standard publish, no --clear-database — upserts update existing templates):
```bash
cd /c/projects/uwr/spacetimedb && spacetime publish uwr
```

Commit: `fix(quick-142): affix catalog cloak→neck slot, republish module`

## Key Constraints
- Do NOT change starter item rarity (Rough Band, Traveler Necklace in starter section)
- Do NOT use --clear-database unless publish fails (upsert handles rarity field updates)
- Cloaks use slot='neck' — they equip in the same slot as pendants, competing for one neck slot
- Cloak armorClassBonus is a BASE template stat, not an affix — it applies to all quality tiers of cloaks
