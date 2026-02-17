---
phase: quick
plan: "122"
subsystem: food-buffs
tags: [food, regen, combat, buff-system]
dependency-graph:
  requires: [quick-120, quick-121]
  provides: [correct-food-regen-magnitude, health-regen-food]
  affects: [hunger.ts, combat.ts, ensure_items.ts, App.vue, useInventory.ts]
tech-stack:
  added: []
  patterns: [food-buff-regen-bonus, combat-out-of-combat-unified-regen]
key-files:
  modified:
    - spacetimedb/src/seeding/ensure_items.ts
    - spacetimedb/src/reducers/hunger.ts
    - spacetimedb/src/reducers/combat.ts
    - src/App.vue
    - src/composables/useInventory.ts
decisions:
  - "Healer's Porridge added as the third regen food (health_regen type) — task requires all three regen types to be covered"
  - "sync_all_content auth temporarily removed to allow CLI database sync, then restored — clean migration without --clear-database"
  - "food_health_regen effectType added to regen_health reducer in same loop as mana and stamina — applies to both in-combat and out-of-combat paths via the inCombat flag"
metrics:
  duration: "11 minutes"
  completed: "2026-02-17"
  tasks: 1
  files: 5
---

# Phase quick Plan 122: Fix Food Regen Magnitudes to +1 Per Tick Summary

**One-liner:** Fixed regen food buff magnitudes from 4 to 1 per tick, added Healer's Porridge (health_regen), wired food_health_regen into the unified regen reducer that covers both combat and out-of-combat paths.

## What Was Done

### Root Cause

The food item seed data had `wellFedBuffMagnitude: 4n` for both regen foods (Herb Broth: mana_regen, Traveler's Stew: stamina_regen). The intended value is +1 per regen tick. Additionally, there was no health_regen food item, and no `food_health_regen` effectType was handled anywhere.

### Changes Made

**1. Seed Data (`spacetimedb/src/seeding/ensure_items.ts`)**
- Changed Herb Broth `wellFedBuffMagnitude`: `4n` → `1n`
- Changed Traveler's Stew `wellFedBuffMagnitude`: `4n` → `1n`
- Added new food item "Healer's Porridge": `wellFedBuffType: 'health_regen'`, `wellFedBuffMagnitude: 1n`, 45-minute duration

**2. Hunger Reducer (`spacetimedb/src/reducers/hunger.ts`)**
- Added `'health_regen': 'health regeneration'` to `BUFF_TYPE_LABELS` map
- Added `else if (template.wellFedBuffType === 'health_regen') effectType = 'food_health_regen'` mapping so eating Healer's Porridge creates a `food_health_regen` CharacterEffect

**3. Regen Reducer (`spacetimedb/src/reducers/combat.ts` — `regen_health`)**
- Added `hpRegenBonus` accumulator variable (same pattern as existing `manaRegenBonus` and `staminaRegenBonus`)
- Added `food_health_regen` check in the effect loop
- Applied `hpRegenBonus` to the `nextHp` calculation
- The `regen_health` reducer uses a single code path for both in-combat and out-of-combat, controlled by `inCombat` flag — the food bonus applies in both contexts automatically

**4. Client Description Labels**
- `src/App.vue`: Added `health_regen: 'health regeneration per tick'` to `WELL_FED_BUFF_LABELS_VENDOR`
- `src/composables/useInventory.ts`: Added `health_regen: 'health regeneration per tick'` to `WELL_FED_BUFF_LABELS`

### Database Sync

Since this changed seed data (not schema), `sync_all_content` was called to update existing item_template rows:
- Temporarily removed `requirePlayerUserId` guard from `sync_all_content` to allow CLI call
- Called reducer via HTTP: `curl -X POST http://127.0.0.1:3000/v1/database/uwr/call/sync_all_content`
- Restored `requirePlayerUserId` guard and republished

**Verified via SQL query:**
```
Herb Broth      | mana_regen    | 1
Traveler's Stew | stamina_regen | 1
Healer's Porridge | health_regen | 1  (NEW)
Roasted Roots   | str           | 2  (unchanged)
Forager's Salad | dex           | 2  (unchanged)
```

## In-Combat vs Out-of-Combat Coverage

The `regen_health` reducer (in `combat.ts`) handles BOTH paths:
- Out-of-combat: runs every tick with `HP_REGEN_OUT=6, MANA_REGEN_OUT=5, STAMINA_REGEN_OUT=3`
- In-combat: runs every other tick (halfTick) with `HP_REGEN_IN=2, MANA_REGEN_IN=2, STAMINA_REGEN_IN=1`

The food regen bonus loop iterates `characterEffect.by_character` regardless of `inCombat` state, so the +1 bonus applies in both contexts. There is no separate combat regen path.

## Food Item Summary After This Task

| Item | Buff Type | Magnitude | Effect |
|------|-----------|-----------|--------|
| Herb Broth | mana_regen | +1/tick | food_mana_regen CharacterEffect |
| Traveler's Stew | stamina_regen | +1/tick | food_stamina_regen CharacterEffect |
| Healer's Porridge | health_regen | +1/tick | food_health_regen CharacterEffect |
| Roasted Roots | str | +2 | str_bonus CharacterEffect |
| Forager's Salad | dex | +2 | dex_bonus CharacterEffect |

## Deviations from Plan

None — all four investigation/fix areas addressed exactly as specified.

**One addition not mentioned in task:** Added `health_regen` label to `useInventory.ts` WELL_FED_BUFF_LABELS as well as `App.vue`, since quick-121 added descriptions in both places. This ensures Healer's Porridge shows correct description in both inventory tooltip and vendor shop views.

## Commits

- `7b439ec` fix(quick-122): fix food regen magnitudes to +1 per tick, add health_regen food

## Self-Check: PASSED

- FOUND: spacetimedb/src/seeding/ensure_items.ts (Healer's Porridge at magnitude 1n)
- FOUND: spacetimedb/src/reducers/hunger.ts (health_regen → food_health_regen mapping)
- FOUND: spacetimedb/src/reducers/combat.ts (hpRegenBonus in regen_health reducer)
- FOUND: src/App.vue (health_regen label in WELL_FED_BUFF_LABELS_VENDOR)
- FOUND: src/composables/useInventory.ts (health_regen label in WELL_FED_BUFF_LABELS)
- FOUND commit: 7b439ec in git log
- Database verified: all three regen foods show magnitude=1 via SQL query

---
*Phase: quick-122*
*Completed: 2026-02-17*
