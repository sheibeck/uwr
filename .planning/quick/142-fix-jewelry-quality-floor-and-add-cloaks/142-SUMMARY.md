---
quick: 142
description: Fix jewelry quality floor and add cloaks to neck slot with AC bonus
date: 2026-02-17
completed: 2026-02-17T14:18:33Z
tags: [loot, items, jewelry, cloaks, affix, balance]
key-files:
  modified:
    - spacetimedb/src/seeding/ensure_items.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/seeding/ensure_enemies.ts
    - spacetimedb/src/data/affix_catalog.ts
key-decisions:
  - Cloaks use slot='neck' so they compete for the same slot as pendants — one neck item equipped at a time
  - Quality floor now conditional on armorClassBonus === 0n so cloaks stay common while pendants become uncommon
  - 'neck' removed from JEWELRY_SLOTS loot weight set so cloaks get standard 6n common weight
  - Whisperwind legendary slot corrected from 'cloak' to 'neck' to match actual slot name
---

# Quick Task 142: Fix Jewelry Quality Floor and Add Cloaks

**One-liner:** All earring/pendant templates set to rarity 'uncommon'; five new cloak templates added to 'neck' slot with base AC bonus; quality-floor logic and loot weights updated to distinguish cloaks from jewelry; affix catalog 'cloak' slot references corrected to 'neck'.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Jewelry rarity→uncommon, add cloak templates | 1d3eb5b |
| 2 | Quality floor and loot weights exclude cloaks | e89f32f |
| 3 | Affix catalog cloak→neck, republish module | 7e16d3e |

## Changes Made

### Task 1 — ensure_items.ts

**Jewelry rarity changed to 'uncommon':**
- Tier 1 earrings: Copper Band, Iron Signet, Tarnished Loop
- Tier 1 neck pendants: Stone Pendant, Bone Charm, Frayed Cord
- Tier 2 earrings: Silver Band, Arcane Loop
- Tier 2 neck pendants: Ember Pendant, Vitality Cord

**New cloak templates added:**
- Rough Cloak (tier 1, AC 1, common, vendorValue 8g)
- Wool Cloak (tier 1, AC 1, common, vendorValue 8g)
- Drifter Cloak (tier 1, AC 1, common, vendorValue 8g)
- Reinforced Cloak (tier 2, AC 2, common, vendorValue 18g, requiredLevel 11)
- Stalker Cloak (tier 2, AC 2, common, vendorValue 18g, requiredLevel 11)

All cloaks: slot='neck', armorType='cloth', all stat bonuses 0n except armorClassBonus, stackable=false, allowedClasses='any'.

### Task 2 — combat.ts + ensure_enemies.ts

**combat.ts:** Uncommon quality floor now conditional — only applies to neck items with `armorClassBonus === 0n` (pendants), not cloaks. Cloaks drop at whatever tier they roll.

**ensure_enemies.ts (JEWELRY_SLOTS):** Removed 'neck' from `new Set(['earrings', 'neck'])` — now only `new Set(['earrings'])`. Result: earrings still get weight 1n, neck pendants get standard uncommon weight 3n, cloaks get standard common weight 6n.

**ensure_enemies.ts (vendor filter):** Removed dead `|| item.slot === 'cloak'` reference from accessories filter. Cloaks are now common rarity so they appear in vendor inventory via `allEligible` (rarity='common') filtering.

### Task 3 — affix_catalog.ts + publish

**Whisperwind legendary:** `slot: 'cloak'` → `slot: 'neck'` — corrects mismatch with actual equipment slot name used in game.

**Accessory affix slot arrays:** Removed 'cloak' from all 5 entries:
- `empowered` prefix: `['neck', 'earrings', 'cloak']` → `['neck', 'earrings']`
- `resolute` prefix: same
- `of_mana_flow` suffix: same
- `of_insight` suffix: same
- `of_vigor` suffix: same

**Module published** to local SpacetimeDB. Upsert logic updates existing templates — no --clear-database needed.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `spacetimedb/src/seeding/ensure_items.ts` — modified (confirmed via git log)
- `spacetimedb/src/reducers/combat.ts` — modified (confirmed via git log)
- `spacetimedb/src/seeding/ensure_enemies.ts` — modified (confirmed via git log)
- `spacetimedb/src/data/affix_catalog.ts` — modified (confirmed via git log)
- Commits 1d3eb5b, e89f32f, 7e16d3e — all present
- Module published successfully: "Updated database with name: uwr"
