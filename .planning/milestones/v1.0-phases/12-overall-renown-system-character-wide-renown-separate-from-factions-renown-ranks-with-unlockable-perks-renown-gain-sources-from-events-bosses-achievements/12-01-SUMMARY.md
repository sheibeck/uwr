---
phase: 12-overall-renown-system
plan: 01
subsystem: progression/renown
tags: [backend, database, renown, achievements, perks]
dependency_graph:
  requires: []
  provides: [renown_tables, renown_helpers, renown_reducers]
  affects: [character_progression, achievement_system]
tech_stack:
  added: [renown_data_constants, perk_pools]
  patterns: [lazy_initialization, diminishing_returns, server_first_tracking]
key_files:
  created:
    - spacetimedb/src/data/renown_data.ts
    - spacetimedb/src/helpers/renown.ts
    - spacetimedb/src/reducers/renown.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/reducers/index.ts
decisions:
  - Renown rows lazy-initialized on first point award (not at character creation)
  - Server-first tracking uses single-column index with manual achievementKey filtering (multi-column indexes broken per CLAUDE.md)
  - Diminishing returns formula uses BigInt division with 2^(position-1) denominator
  - Perk bonuses aggregated on-demand via calculatePerkBonuses (not cached on character stats)
  - Achievement definitions stored in code constants (future: migrate to database table)
metrics:
  duration_seconds: 217
  tasks_completed: 2
  files_created: 3
  files_modified: 2
  commits: 2
  completed_at: 2026-02-14T06:32:17Z
---

# Phase 12 Plan 01: Renown System Backend Foundation Summary

**One-liner:** Complete renown system backend with 15-rank progression, perk pools (passive stats + active abilities), server-first tracking with diminishing returns, and achievement system.

---

## What Was Built

### Tables (4 new)
1. **Renown** - Per-character renown progression tracking (points, currentRank, updatedAt)
2. **RenownPerk** - Permanent perk selections per character per rank
3. **RenownServerFirst** - Competitive achievement tracking with position timestamps
4. **Achievement** - One-time character milestone tracking

### Data Constants
- **RENOWN_RANKS**: 15 named ranks across 5 tiers (Unsung → Eternal) with stepped threshold curve
  - Tier 1 (1-3): 0/100/250 (fast early progression)
  - Tier 2 (4-6): 500/900/1500 (moderate scaling)
  - Tier 3 (7-9): 2500/4000/6500 (steeper climb)
  - Tier 4 (10-12): 10000/15000/22000 (prestige territory)
  - Tier 5 (13-15): 32000/47000/70000 (endgame legends)

- **RENOWN_PERK_POOLS**: 2-3 choices per rank (14 ranks total, rank 1 has no perks)
  - Passive perks: stat bonuses (HP, STR, DEX, INT, WIS, CHA, armor, crit)
  - Active perks: cooldown-based abilities (Second Wind, Warcry, Rally, Defy Death, etc.)
  - Tier progression: +25 HP → +150 HP, +1 stat → +5 stat, +1 AC → +3 AC

- **RENOWN_GAIN**: Point amounts for different sources (boss 500, quest 50, achievement 200, event 100, personal-first bonus 50)

- **ACHIEVEMENT_DEFINITIONS**: 4 starter achievements (First Steps, Slayer, Veteran Adventurer, Quest Master)

### Helpers (4 functions)
1. **awardRenown**: Core renown grant function with automatic rank-up detection and world event announcements
2. **awardServerFirst**: Position tracking (1st/2nd/3rd) with diminishing returns (baseRenown / 2^(position-1))
3. **calculatePerkBonuses**: Aggregate passive perk stat bonuses across all chosen perks
4. **grantAchievement**: Achievement unlock with server-first bonus + personal-first bonus stacking

### Reducers (3 reducers)
1. **choose_perk**: Validates rank eligibility, prevents duplicate selections, records permanent perk choice
2. **grant_test_renown**: Admin/test reducer for manually awarding renown points
3. **grant_test_achievement**: Admin/test reducer for triggering achievement unlocks

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Implementation Details

### Lazy Initialization Pattern
Renown rows are NOT created at character creation. They are lazy-initialized on first `awardRenown()` call, starting at rank 1 with 0 points. This avoids cluttering the database with renown records for inactive characters.

### Server-First Tracking
- Uses single-column `by_category` index (multi-column indexes are broken in SpacetimeDB per CLAUDE.md)
- Manual filtering for `achievementKey` after index lookup
- Position calculated by counting existing entries (1-indexed)
- Diminishing returns: `baseRenown / (2n ** (position - 1n))` with BigInt math
- Top 3 announcements via `appendWorldEvent` with ordinal formatting

### Perk System
- **One choice per rank** - choose_perk enforces single selection via duplicate check
- **Permanent choices** - no respec mechanism (by design)
- **Two perk types**:
  - `passive`: Stat bonuses aggregated via `calculatePerkBonuses` (returns object with 9 stat fields)
  - `active`: Cooldown-based abilities with description text (actual activation deferred to future implementation)

### Rank-Up Announcements
- Private system message: "You have achieved rank: {rankName}!"
- World event: "{characterName} has achieved the rank of {rankName}!"

---

## Testing Hooks

### Admin Reducers (for testing/debugging)
```typescript
// Grant renown points manually
grant_test_renown({ characterId: 1n, points: 500n })

// Unlock achievement manually
grant_test_achievement({ characterId: 1n, achievementKey: 'test_achievement' })
```

### Integration Points (Plan 02)
- Combat victory: call `awardRenown` with boss kill points
- Boss kills: call `awardServerFirst` for competitive tracking
- Quest completion: call `awardRenown` with quest points
- Level-up: call `grantAchievement('reach_level_5')` at level 5

---

## Self-Check: PASSED

### Created Files Verified
```
FOUND: spacetimedb/src/data/renown_data.ts
FOUND: spacetimedb/src/helpers/renown.ts
FOUND: spacetimedb/src/reducers/renown.ts
```

### Modified Files Verified
```
FOUND: spacetimedb/src/schema/tables.ts (4 new tables + schema export)
FOUND: spacetimedb/src/reducers/index.ts (registerRenownReducers import + call)
```

### Commits Verified
```
FOUND: 4fe4420 (feat(12-01): add renown system tables and rank/perk data)
FOUND: e1f7a33 (feat(12-01): add renown helpers and reducers)
```

---

## Next Steps (Plan 02)

1. **Combat Integration**: Call `awardRenown` on boss kills, integrate `awardServerFirst` for boss-first tracking
2. **Character Creation**: Initialize FactionStanding AND consider whether to pre-create Renown row (currently lazy)
3. **Achievement Triggers**: Wire `grantAchievement` to level-up events, quest completions, combat milestones
4. **Perk Application**: Apply `calculatePerkBonuses` results to character derived stats (HP, AC, crit, etc.)
5. **Active Perk Implementation**: Build cooldown + effect system for active perk abilities (Second Wind, Rally, etc.)

---

## Plan 03: UI

1. **Renown Panel**: Show current rank, points to next rank, progress bar, available perk selection UI
2. **Achievement Panel**: List all achievements with completion status, renown rewards, timestamps
3. **Server-First Leaderboard**: Display top 3 for each achievement category
4. **Perk Tooltip**: Show passive bonuses and active ability descriptions in detail

---

## Completion Summary

- **Duration**: 3 minutes 37 seconds
- **Tasks**: 2/2 complete
- **Commits**: 2 (one per task)
- **Files**: 3 created, 2 modified
- **Backend compiles**: Yes (no renown-related TypeScript errors)
- **Integration ready**: Yes - all hooks exported and available for Plan 02
