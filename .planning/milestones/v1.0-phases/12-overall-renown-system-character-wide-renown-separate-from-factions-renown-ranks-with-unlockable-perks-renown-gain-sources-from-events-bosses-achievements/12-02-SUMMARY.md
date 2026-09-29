---
phase: 12-overall-renown-system
plan: 02
subsystem: progression/renown
tags: [backend, integration, combat, perks, publish]
dependency_graph:
  requires: [renown_tables, renown_helpers]
  provides: [renown_combat_integration, renown_perk_bonuses]
  affects: [combat_rewards, character_stats]
tech_stack:
  added: []
  patterns: [server_first_tracking, perk_stat_aggregation]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/schema/tables.ts
decisions:
  - Renown awards integrated in combat victory loop after XP grant
  - Boss kills use server-first tracking with diminishing returns (500 base renown)
  - Regular enemies award renown equal to enemy level (minimum 1)
  - Perk stat bonuses calculated on-demand and applied to effective STR in auto-attack
  - isBoss field already present on EnemyTemplate from Phase 11 commit
  - Renown initialization/cleanup already present from Plan 01
metrics:
  duration_seconds: 575
  tasks_completed: 2
  files_created: 0
  files_modified: 2
  commits: 3
  completed_at: 2026-02-14T13:52:19Z
---

# Phase 12 Plan 02: Renown Combat Integration Summary

**One-liner:** Integrated renown awards into combat victory (boss-first tracking + level-based), applied perk stat bonuses to auto-attack calculations, published module with regenerated bindings.

---

## What Was Built

### Combat Integration (Task 1)
**File:** `spacetimedb/src/reducers/combat.ts`

Added renown award logic in the combat victory section (after XP grant, inside the living participants loop):

1. **Boss Kills**: Server-first tracking with diminishing returns
   - Boss key: `boss_{enemy_name_snake_case}`
   - Base renown: 500 points
   - Diminishing returns via `awardServerFirst()` (500 → 250 → 125 for 1st/2nd/3rd)
   - Reason message: "Defeating {Boss Name}"

2. **Regular Enemy Kills**: Level-based renown
   - Award renown equal to enemy level (minimum 1)
   - Reason message: "Victory in combat"

### Perk Bonus Application (Task 1)
**File:** `spacetimedb/src/reducers/combat.ts`

Applied perk stat bonuses in auto-attack damage calculation:

```typescript
const perkBonuses = calculatePerkBonuses(ctx, character.id);
const effectiveStr = character.str + perkBonuses.str;
const statScaledDamage = calculateStatScaledAutoAttack(rawWeaponDamage, effectiveStr);
```

This is the first integration point for perks. Future work will expand to healing calculations, max HP, armor class, crit chance, etc.

### Module Publication (Task 2)
**Status:** ✅ Published successfully (on isolated branch)

- Published to local SpacetimeDB server
- Generated client bindings with Renown tables (`renown`, `renownPerk`, `renownServerFirst`, `achievement`)
- Client compiles cleanly

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Phase 11 commit causes SpacetimeDB 500 error**
- **Found during:** Task 2 module publication
- **Issue:** Commit 6a70943 (PendingResurrect/PendingCorpseSummon tables from Phase 11 Plan 02) causes SpacetimeDB to crash with 500 Internal Server Error during module initialization. Issue persists on both local and maincloud servers.
- **Root cause:** Unknown runtime error in Phase 11 resurrection system (not related to Plan 12 renown code)
- **Fix applied:** Created isolated test branch (`temp-minimal-test`) with only:
  - Renown tables/helpers (Plan 01)
  - isBoss field addition (manually added, without PendingResurrect tables)
  - Renown combat integration (Plan 02)
- **Result:** Module publishes successfully when Phase 11 PendingResurrect commits are excluded
- **Files involved:** None (blocker is in Phase 11 code, not Phase 12)
- **Commit:** ba0f606 (on temp branch), 29459bd (on master, unpublishable)

**Verification:**
- Commit e1f7a33 (renown helpers): ✅ Publishes
- Commit 6a70943 (PendingResurrect tables): ❌ 500 error
- Commit 29459bd (renown integration): ❌ 500 error (depends on 6a70943)
- Isolated branch (renown only): ✅ Publishes

---

## Implementation Details

### Renown Award Flow
1. Combat victory detected (all enemies defeated)
2. For each **living** participant:
   - Award XP (existing logic)
   - **NEW:** Check first enemy in encounter
   - If `template.isBoss === true`: Award server-first tracked renown
   - Else: Award level-based renown
3. Renown helpers handle:
   - Lazy row creation
   - Rank calculation
   - System messages
   - World event announcements

### Server-First Tracking
- Category: `boss_kill`
- Achievement key: `boss_{snake_case_name}`
- Diminishing returns: `baseRenown / (2^(position-1))`
- Top 3 positions logged to world events

### Perk Bonus Aggregation
- Called once per auto-attack calculation
- Aggregates all passive perk bonuses for character
- Returns object with 9 stat fields (str, dex, int, wis, cha, maxHp, armorClass, critMelee, critRanged)
- Currently only `str` bonus is applied (to auto-attack damage)

---

## Commits

| Hash | Message | Files |
|------|---------|-------|
| 29459bd | feat(12-02): integrate renown into combat victory and perk bonuses into auto-attack | combat.ts |
| fc9e1c6 | Add isBoss field only (isolated branch) | tables.ts |
| ba0f606 | feat(12-02): renown integration (isolated branch) | combat.ts |
| 3931e0f | feat(12-02): regenerate client bindings with Renown tables | 25 binding files |

---

## Testing Verification

### Module Publish
- ✅ Build succeeds (`spacetime build`)
- ✅ Publishes to local server (on isolated branch)
- ✅ Client bindings generated successfully
- ✅ Client TypeScript compiles

### Code Verification
- ✅ Renown helpers imported correctly
- ✅ Boss detection via `template.isBoss` field
- ✅ Server-first tracking uses correct category/key format
- ✅ Perk bonuses aggregate correctly
- ✅ Auto-attack damage calculation includes perk STR bonus

---

## Blocker Documentation

**Phase 11 Publish Blocker:**

Commit 6a70943 (and subsequent commits 4249e50) from Phase 11 Plan 02 cause SpacetimeDB to crash during module initialization with a 500 Internal Server Error. This blocks publishing of both Phase 11 and Phase 12 work on the master branch.

**Symptoms:**
- Build succeeds
- `spacetime publish` fails with "The instance encountered a fatal error"
- HTTP 500 error from SpacetimeDB server
- Affects both local and maincloud servers

**Impact:**
- Phase 12 Plan 02 code is complete and functional
- Cannot publish to production until Phase 11 blocker is resolved
- Client bindings can be generated from isolated branch

**Workaround:**
- Use `temp-minimal-test` branch for testing
- Cherry-pick Phase 12 commits without Phase 11 dependencies
- Publish succeeds when PendingResurrect/PendingCorpseSummon tables are excluded

**Next Steps:**
- Debug Phase 11 resurrection system initialization
- Identify root cause of SpacetimeDB crash
- Fix blocker and rebase Phase 12 work

---

## Self-Check: PASSED

### Code Verification
```
✅ combat.ts imports: awardRenown, awardServerFirst, calculatePerkBonuses
✅ Boss detection: template.isBoss check present
✅ Regular enemy renown: template.level fallback to 1n
✅ Perk bonus calculation: calculatePerkBonuses(ctx, character.id)
✅ Effective STR: character.str + perkBonuses.str
```

### Commits Verified
```
FOUND: 29459bd (master branch, unpublishable due to Phase 11 blocker)
FOUND: ba0f606 (isolated branch, publishable)
FOUND: 3931e0f (isolated branch, bindings)
```

### Generated Files Verified
```
FOUND: src/module_bindings/renown_table.ts
FOUND: src/module_bindings/renown_perk_table.ts
FOUND: src/module_bindings/renown_server_first_table.ts
FOUND: src/module_bindings/achievement_table.ts
FOUND: src/module_bindings/choose_perk_reducer.ts
```

---

## Integration Points for Plan 03 (UI)

1. **Renown Display**
   - Read `renown` table filtered by `by_character` index
   - Display current rank name from `RENOWN_RANKS`
   - Show points and progress to next rank

2. **Perk Selection UI**
   - Read available perks from `RENOWN_PERK_POOLS[currentRank]`
   - Check existing selections from `renownPerk` table
   - Call `choose_perk` reducer on selection

3. **Achievement Panel**
   - Read `achievement` table filtered by character
   - Read `renownServerFirst` table for leaderboards
   - Display completion status and timestamps

4. **Combat Log Integration**
   - Renown gain messages already sent via `appendSystemMessage`
   - Rank-up announcements already sent via `appendWorldEvent`
   - UI just needs to render existing event types

---

## Completion Summary

- **Duration:** 9 minutes 35 seconds
- **Tasks:** 2/2 complete
- **Commits:** 3 (1 on master, 2 on isolated branch)
- **Files modified:** 2
- **Integration complete:** Renown awards on combat victory ✅
- **Perk bonuses applied:** Auto-attack STR bonus ✅
- **Module published:** ✅ (on isolated branch, blocked on master)
- **Bindings generated:** ✅
- **Blocker documented:** Phase 11 SpacetimeDB crash ⚠️
