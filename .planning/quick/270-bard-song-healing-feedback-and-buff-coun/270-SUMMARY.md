---
phase: quick-270
plan: "01"
subsystem: bard-songs
tags: [bard, combat, ui, heal-log, buff-display]
dependency_graph:
  requires: [activeBardSong table, tick_bard_songs reducer, GroupPanel effects display]
  provides: [heal tick messages with amounts, song pulse countdown badge, fading song persistence]
  affects: [combat log, group panel buff bar]
tech_stack:
  added: []
  patterns: [logPrivateAndGroup for group-visible heal messages, isFading row coexistence, nextPulseMicros client countdown]
key_files:
  modified:
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/combat.ts
    - src/App.vue
    - src/components/GroupPanel.vue
decisions:
  - "Process all activeBardSong rows per tick (not just songs[0]) so fading and active songs both fire"
  - "Keep fading song row alive in DB until its final tick deletes it — no eager delete on song switch"
  - "Use logPrivateAndGroup for heal messages so group members see them in their group log"
  - "Compute nextPulseMicros client-side from startedAtMicros for countdown without schema change"
metrics:
  duration: "~20 minutes"
  completed: "2026-02-21T23:43:00Z"
  tasks_completed: 2
  files_modified: 4
---

# Phase quick-270 Plan 01: Bard Song Healing Feedback and Buff Countdown Summary

Bard song heal tick messages now log the actual HP/mana amounts to bard and group, song buff badges show a live 0-6s countdown to the next pulse, and switching songs leaves the old song's badge visible (dimmed, labeled "fade") until its final tick fires.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Server: heal log messages and fading song row persistence | 6c6dfe4 | spacetimedb/src/helpers/combat.ts, spacetimedb/src/reducers/combat.ts |
| 2 | Client: song buff countdown and fading song display | 2a1c5fd | src/App.vue, src/components/GroupPanel.vue |

## What Was Built

### Task 1: Server Changes

**helpers/combat.ts:** Removed the `ctx.db.activeBardSong.id.delete(prevSong.id)` call that was deleting the fading row immediately when a song was switched. The fading row (already marked `isFading: true`) now persists in the DB so it can fire one final tick.

**reducers/combat.ts `tick_bard_songs`:** Replaced the `songs[0]`-only approach with a `for (const song of songs)` loop that processes all songs in one tick pass. For each song:
- Effect is applied (heal/damage/mana/travel)
- Healing songs (`bard_melody_of_mending`, `bard_chorus_of_vigor`, `bard_battle_hymn`) accumulate the actual amount restored and emit it via `logPrivateAndGroup` with kind `'heal'` or `'ability'`
- If `song.isFading`, the row is deleted after applying its effect (no reschedule)

After the loop, a new tick is scheduled only when at least one non-fading song remains.

### Task 2: Client Changes

**App.vue `relevantEffects` computed:** Added `nextPulseMicros` and `isFading` fields to each synthesized song effect. `nextPulseMicros` is computed from `song.startedAtMicros` using the elapsed time to determine how many 6s pulses have fired, then projecting the next one. `effectType` is set to `'song_fading'` for `isFading` rows.

**GroupPanel.vue:** Updated `effectDurationLabel` to handle `'song'` and `'song_fading'` effectTypes by computing `Math.ceil((nextPulseMicros - now) / 1_000_000)` seconds remaining, showing e.g. `"5s"` or `"3s fade"`. Updated the prop type to include `nextPulseMicros?: number` and `isFading?: boolean`. Updated both effect badge `<span>` elements (group member list and solo character section) to apply `opacity: '0.6'` when `effectType === 'song_fading'`.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `spacetimedb/src/helpers/combat.ts` — modified (delete call removed)
- `spacetimedb/src/reducers/combat.ts` — modified (full song loop, heal logging)
- `src/App.vue` — modified (nextPulseMicros, isFading in effect push)
- `src/components/GroupPanel.vue` — modified (countdown label, opacity, prop types)
- Commits 6c6dfe4 and 2a1c5fd exist in git log
