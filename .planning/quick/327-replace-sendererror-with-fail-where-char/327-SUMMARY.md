---
phase: quick-327
plan: 01
subsystem: server
tags: [spacetimedb, error-handling, ux, fail, SenderError]

# Dependency graph
requires:
  - phase: helpers/events
    provides: fail() function that writes to player Log window
provides:
  - All character-scoped reducers surface errors via fail() to player Log
  - Combat helper errors visible to players before throw for control flow
affects: [reducers, combat, player-feedback]

# Tech tracking
tech-stack:
  added: []
  patterns: [fail-then-return for reducer errors, fail-then-throw for helper errors]

key-files:
  modified:
    - spacetimedb/src/reducers/world_events.ts
    - spacetimedb/src/reducers/renown.ts
    - spacetimedb/src/reducers/quests.ts
    - spacetimedb/src/reducers/hunger.ts
    - spacetimedb/src/reducers/characters.ts
    - spacetimedb/src/reducers/npc_interaction.ts
    - spacetimedb/src/reducers/ui.ts
    - spacetimedb/src/reducers/social.ts
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/helpers/combat_perks.ts

key-decisions:
  - "Reducers use fail() + return; helpers use fail() + throw to preserve control flow for callers"
  - "SenderError retained only where character context is unavailable (admin, player-level, infrastructure)"
  - "Removed unused SenderError imports from converted files (renown, quests, hunger, npc_interaction, ui)"

patterns-established:
  - "fail-then-return: In reducers with character context, use fail(ctx, character, msg); return; instead of throw new SenderError(msg)"
  - "fail-then-throw: In helper functions, add fail(ctx, character, msg) before throw new SenderError(msg) to surface errors while preserving abort semantics"

requirements-completed: [QUICK-327]

# Metrics
duration: 10min
completed: 2026-02-25
---

# Quick 327: Replace SenderError with fail() Where Character Context Exists

**Converted ~50 SenderError throws across 10 files to use fail() for player-visible Log messages, keeping SenderError only in infrastructure/admin code without character context**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-02-25T14:53:23Z
- **Completed:** 2026-02-25T15:03:00Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- All reducer-level SenderErrors with character context replaced with fail() + return pattern (9 files)
- All combat helper SenderErrors (35 total) now preceded by fail() calls for player visibility
- Removed unused SenderError imports/destructures from 4 files (renown, quests, hunger, npc_interaction)
- Verified all remaining SenderErrors are in appropriate locations (admin, player-level, infrastructure)

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert SenderError to fail() in reducers** - `6d7a3b4` (feat)
2. **Task 2: Convert SenderError to fail() in helper files** - `250e573` (feat)
3. **Task 3: Verify index.ts wiring and remove unused imports** - No file changes needed (verification only)

## Files Created/Modified
- `spacetimedb/src/reducers/world_events.ts` - collect_event_item uses fail() for character-scoped errors
- `spacetimedb/src/reducers/renown.ts` - choose_perk, grant_test_achievement use fail(); removed SenderError dep
- `spacetimedb/src/reducers/quests.ts` - loot_quest_item, pull_named_enemy use fail(); removed SenderError dep
- `spacetimedb/src/reducers/hunger.ts` - eat_food uses fail(); replaced SenderError with fail in deps
- `spacetimedb/src/reducers/characters.ts` - bind_location, respawn_character use fail()
- `spacetimedb/src/reducers/npc_interaction.ts` - Removed SenderError import; NPC-not-found errors use fail()
- `spacetimedb/src/reducers/ui.ts` - save_panel_layout captures character and uses fail(); removed SenderError dep
- `spacetimedb/src/reducers/social.ts` - send_friend_request_to_character uses fail() with requester
- `spacetimedb/src/helpers/combat.ts` - All 30 SenderErrors in executeAbility() preceded by fail() calls
- `spacetimedb/src/helpers/combat_perks.ts` - All 5 SenderErrors in executePerkAbility() preceded by fail() calls

## Decisions Made
- Reducers use `fail(ctx, character, msg); return;` to stop execution (equivalent to throw behavior)
- Helpers use `fail(ctx, character, msg);` before `throw new SenderError(msg);` to preserve abort semantics while still surfacing the error to the player Log. Some call paths may see duplicate messages (catch block + fail), but this is strictly better than silent failures and can be cleaned up later.
- SenderError kept in: admin gates (admin.ts), player-level operations (auth.ts, social.ts set_display_name/send_friend_request/accept_friend_request), character creation (before character exists), infrastructure (events.ts requireCharacterOwnedBy), location spawn helpers, combat addEnemyToCombat

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All character-scoped errors now visible in player Log window
- Future reducers should follow the established fail-then-return pattern
- Future helper functions should follow the fail-then-throw pattern

## Self-Check: PASSED

- All 10 modified files exist on disk
- Both task commit hashes (6d7a3b4, 250e573) found in git log
- 327-SUMMARY.md exists at expected path

---
*Phase: quick-327*
*Completed: 2026-02-25*
