---
phase: quick-132
plan: 01
subsystem: movement
tags: [passive-search, group-travel, resource-nodes, per-character, seed]

# Dependency graph
requires:
  - phase: quick-118
    provides: per-character ResourceNode with characterId and by_character index
  - phase: 06-quest-system
    provides: performPassiveSearch helper in search.ts with seed formula
provides:
  - Verified per-character passive search independence in group travel (no bug)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "charId XOR nowMicros seed: unique per character even at same timestamp"
    - "Bit-shifted roll variants (>>8/*7 and >>16/*13) for independent multi-rolls from single seed"
    - "All SearchResult and ResourceNode rows scoped by character.id"

key-files:
  created: []
  modified: []

key-decisions:
  - "No code changes required: per-character independence already correctly implemented"

patterns-established:
  - "moveOne inner function called per-traveler in group loop ensures independent performPassiveSearch calls"

# Metrics
duration: 2min
completed: 2026-02-17
---

# Quick Task 132: Verify Per-Character Independence of Passive Search Summary

**Confirmed correct: each grouped character independently gets its own performPassiveSearch call with a unique charId XOR nowMicros seed, independent roll outcomes, and personal SearchResult and ResourceNode rows -- no bug exists**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T13:31:21Z
- **Completed:** 2026-02-17T13:33:00Z
- **Tasks:** 1
- **Files modified:** 0

## Accomplishments

- Read and analyzed group travel flow in `movement.ts` and `search.ts`
- Confirmed `moveOne` is called individually for each traveler with their own `charId`
- Confirmed seed formula `charId ^ nowMicros` produces unique seeds per character
- Confirmed all three rolls derive from the same seed using bit-shifted variants, producing independent outcomes per character
- Confirmed `SearchResult` and `ResourceNode` rows are scoped by individual `character.id`
- No bug found; no code changes required

## Task Commits

This was a verification-only task. No code was changed; no commits were made.

## Files Created/Modified

None.

## Verification Details

### movement.ts — Group Travel Loop

- **Line 117:** `const moveOne = (charId: bigint)` — inner function takes individual character ID
- **Line 118:** `const row = ctx.db.character.id.find(charId)!` — fresh row fetch per character
- **Line 130:** `performPassiveSearch(ctx, ctx.db.character.id.find(charId)!, location.id, appendPrivateEvent)` — called with that character's own row
- **Lines 185-187:** `for (const traveler of travelingCharacters) { moveOne(traveler.id); }` — iterates every group member independently

Each grouped character triggers its own separate `performPassiveSearch` call.

### search.ts — Seed and Roll Independence

- **Lines 15-17:** `const charId = BigInt(character.id); const nowMicros = BigInt(ctx.timestamp.microsSinceUnixEpoch); const seed = charId ^ nowMicros;` — seed is unique per character because charId differs
- **Line 26:** Roll 1 (resources): `seed % 100n` — different per character
- **Line 33:** Roll 2 (quest items): `((seed >> 8n) ^ (seed * 7n)) % 100n` — independent bit-mix variant
- **Line 74:** Roll 3 (named enemy): `((seed >> 16n) ^ (seed * 13n)) % 100n` — second independent bit-mix variant
- **Line 136:** `characterId: character.id` in SearchResult insert — personal row per character
- **Line 149:** `ctx.db.resourceNode.by_character.filter(character.id)` — cleanup scoped to individual character
- **Line 166:** `spawnResourceNode(ctx, locationId, character.id, ...)` — nodes tied to individual character

### Conclusion

The suspected bug does NOT exist. Per-character independence is already correctly implemented across all three verification criteria in the plan:

1. Each grouped character gets an independent `performPassiveSearch` call with their own `charId` -- **CONFIRMED**
2. Seed calculation (`charId XOR nowMicros`) produces different values per character even at the same timestamp -- **CONFIRMED**
3. Each character receives their own `SearchResult` row and personal `ResourceNode` entries -- **CONFIRMED**

## Decisions Made

None - verification-only task. No implementation decisions required.

## Deviations from Plan

None - plan executed exactly as written. The code was already correct.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Per-character passive search independence verified as correct
- No follow-up work needed for this concern
- Safe to proceed with any next phase

---
*Phase: quick-132*
*Completed: 2026-02-17*
