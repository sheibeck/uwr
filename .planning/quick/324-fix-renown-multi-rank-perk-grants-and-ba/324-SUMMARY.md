---
phase: quick-324
plan: 01
subsystem: renown
tags: [renown, balance, perks, rank-up]
dependency-graph:
  requires: []
  provides: [multi-rank-perk-grants, balanced-renown-rewards]
  affects: [renown-system, world-events, combat-rewards]
tech-stack:
  added: []
  patterns: [lowest-unchosen-rank-perk-selection, per-rank-loop-announcements]
key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/renown.ts
    - spacetimedb/src/reducers/renown.ts
    - spacetimedb/src/data/renown_data.ts
    - spacetimedb/src/data/world_event_data.ts
    - src/components/RenownPanel.vue
decisions:
  - Reduced boss renown from 500 to 150 (server-first) to prevent single-event rank jumping
  - Kept rank thresholds unchanged; only reward amounts were reduced
  - World event broadcast only announces highest achieved rank to prevent chat spam
metrics:
  duration: 126s
  completed: 2026-02-25T14:15:26Z
  tasks: 2/2
  files: 5
---

# Quick Task 324: Fix Renown Multi-Rank Perk Grants and Balance

Server-side awardRenown loops through all intermediate ranks on rank-up, choose_perk selects from lowest unchosen rank, client perk UI matches. Boss kill renown reduced from 500 to 150; world event tier 2/3 renown cut to 35-150 range.

## Task Results

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Fix multi-rank perk availability | b43f0a2 | awardRenown loops intermediate ranks; choose_perk finds lowest unchosen rank; client hasUnspentPerk/availablePerks check all ranks 2..current |
| 2 | Balance renown rewards and thresholds | 445c19c | BOSS_KILL_BASE 500->150; world event tier 2 success 35-75; tier 3 success 60-150; failure rewards halved proportionally |

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **Reduced BOSS_KILL_BASE from 500n to 150n** - Server-first boss kill now awards 150 renown (barely reaches rank 2 at 100 threshold), 2nd kill = 75, 3rd = 37. Players need sustained activity across multiple systems to rank up.

2. **Only renown values changed in world events** - Gold, faction, and item rewards left untouched. Only the renown column was reduced to prevent rank-jumping from a single event.

3. **World event only announces highest rank** - When a player jumps multiple ranks, only the final rank triggers a world event broadcast. System messages still log each intermediate rank privately.

## Verification

- awardRenown: loops `oldRank+1..newRank`, logs each rank-up, broadcasts world event only for highest
- choose_perk: scans ranks 2..currentRank for first unchosen, validates perk key against that rank's pool
- Client hasUnspentPerk: checks ALL ranks 2..currentRank for missing perks
- Client availablePerks: shows perks for lowestUnchosenRank
- BOSS_KILL_BASE: 150n (confirmed in renown_data.ts line 493)
- World event tier 3 max: 150 renown (ashen_awakening gold success)
- Non-renown reward fields: all unchanged

## Self-Check: PASSED

All 5 modified files exist. Both commits (b43f0a2, 445c19c) verified in git log.
