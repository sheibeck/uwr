---
phase: 20-perk-variety-expansion
plan: "01"
subsystem: renown-perks
tags: [perks, renown, crafting, social, combat, data-definitions]
dependency_graph:
  requires: [12-overall-renown-system]
  provides: [perk-variety-data-foundation]
  affects: [spacetimedb/src/data/renown_data.ts, src/components/RenownPanel.vue]
tech_stack:
  added: []
  patterns: [proc-trigger-perks, crafting-bonus-perks, social-utility-perks, scaling-perks, domain-categorization]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/renown_data.ts
    - src/components/RenownPanel.vue
decisions:
  - Extended PerkEffect type with proc/crafting/social/scaling fields, leaving existing stat fields intact
  - Ranks 12-15 kept unchanged with domain field added as 'combat' (capstones deferred)
  - Frontend uses [Domain] prefix tags in descriptions for at-a-glance category identification
  - Border-left 3px color coding: combat=#c55, crafting=#5c5, social=#55c
metrics:
  duration: "5 min"
  completed: "2026-02-17"
  tasks: 2
  files: 2
---

# Phase 20 Plan 01: Perk Variety Expansion Data Foundation Summary

Extended PerkEffect type with proc triggers, crafting bonuses, social bonuses, and scaling fields; designed 30 new domain-categorized perks for renown ranks 2-11 (10 combat, 10 crafting, 10 social) with matching frontend display data and domain color indicators.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend PerkEffect type and redesign ranks 2-11 perk definitions | ffd5fd1 | spacetimedb/src/data/renown_data.ts |
| 2 | Sync frontend perk display data in RenownPanel.vue | 4b0bed3 | src/components/RenownPanel.vue |

## What Was Built

### Backend (renown_data.ts)

Extended `PerkEffect` type with 16 new optional fields organized into four categories:

**Proc effects:** `procType` ('on_crit' | 'on_hit' | 'on_kill' | 'on_damage_taken'), `procChance`, `procDamageMultiplier`, `procHealPercent`, `procBonusDamage`

**Crafting/gathering:** `gatherDoubleChance`, `gatherSpeedBonus`, `craftQualityBonus`, `rareGatherChance`

**Social/utility:** `npcAffinityGainBonus`, `vendorBuyDiscount`, `vendorSellBonus`, `travelCooldownReduction`, `goldFindBonus`, `xpBonus`

**Scaling:** `scalesWithLevel`, `perLevelBonus`

Added `domain: 'combat' | 'crafting' | 'social'` field to `Perk` type.

Designed 30 perks for ranks 2-11 (3 per rank: one combat, one crafting, one social):

| Rank | Combat | Crafting | Social |
|------|--------|----------|--------|
| 2 | Iron Will (+25HP, +1STR) | Keen Eye (10% double gather) | Smooth Talker (+15% affinity) |
| 3 | Quick Reflexes (+1DEX, +2% crit) | Efficient Hands (15% faster gather) | Shrewd Bargainer (5% buy/sell) |
| 4 | Bloodthirst (3% on-kill 20% HP) | Prospector's Luck (15% rare gather) | Wanderer's Pace (20% travel CD) |
| 5 | Savage Strikes (5% on-crit 150% burst) | Master Harvester (20% double + 10% speed) | Silver Tongue (+25% affinity, 5% discount) |
| 6 | Second Wind (active: 20% HP, 5min CD) | Artisan's Touch (+15% craft quality) | Fortune's Favor (+10% gold, +5% XP) |
| 7 | Vampiric Strikes (5% on-hit 30% lifesteal) | Bountiful Harvest (25% double, 5% rare) | Diplomat's Grace (+30% affinity, 25% CD) |
| 8 | Thunderous Blow (active: 300% damage, 5min) | Resourceful (20% double + 20% speed + 10% quality) | Merchant Prince (10% buy + sell + gold) |
| 9 | Deathbringer (8% on-kill AoE 200%) | Masterwork (+25% quality, scales +0.5%/level) | Voice of Authority (+40% affinity, 8% buy, 8% XP) |
| 10 | Wrath of the Fallen (active: +25% dmg 20s, 10min) | Golden Touch (30% double, 15% rare, 15% quality) | Legend's Presence (+50% affinity, 30% CD, 15% gold) |
| 11 | Undying Fury (3% on-hit: +50% dmg 10s) | Grand Artisan (35% double, 20% rare, 25% quality, scaling) | World Shaper (+15% XP/gold, 10% buy/sell, 35% CD) |

Ranks 12-15 unchanged (capstones deferred to future plan).

### Frontend (RenownPanel.vue)

- Added `DOMAIN_COLORS` constant: `{ combat: '#c55', crafting: '#5c5', social: '#55c' }`
- Extended `RENOWN_PERK_POOLS` type to include `domain` field
- Replaced ranks 2-11 perk entries with new definitions matching backend
- Added `[Combat]`, `[Crafting]`, `[Social]` prefix tags to perk descriptions
- Added `getDomainColor()` helper function
- Applied `border-left: 3px solid {domainColor}` to perk option elements

## Verification

- All ranks 2-15 have exactly 3 perks: CONFIRMED
- Every rank 2-11 perk has domain field: CONFIRMED
- Frontend keys match backend keys for ranks 2-11: CONFIRMED (10 ranks verified)
- PerkEffect type includes procType, scalesWithLevel: CONFIRMED
- Ranks 12-15 unchanged in backend perk keys: CONFIRMED
- No new TypeScript errors in renown_data.ts: CONFIRMED
- Pre-existing errors in combat.ts/ensure_enemies.ts/App.vue are unrelated pre-existing issues

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files verified:
- spacetimedb/src/data/renown_data.ts: EXISTS
- src/components/RenownPanel.vue: EXISTS

Commits verified:
- ffd5fd1: feat(20-01): extend PerkEffect type and redesign ranks 2-11 perk definitions
- 4b0bed3: feat(20-01): sync frontend perk display data for ranks 2-11 with domain indicators
