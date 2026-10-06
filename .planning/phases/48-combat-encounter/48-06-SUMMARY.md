---
phase: 48-combat-encounter
plan: 06
subsystem: client-feed
tags: [vue-client, feed, rounds]
status: complete
requires: ["48-05"]
provides:
  - "feedStore: client-made round headers and wind-up blocks with rank-based ordered insert, narratedRound stamping, ServerFeedSource"
  - "lines: 'round' and 'windup' line kinds, roundNumber/roundKey/roundTag/windup view fields, late-narration round tag"
affects: [48]
tech-stack:
  added: []
  patterns: ["combat entries rank after server sources (header 4, wind-up 5) and are inserted by a bounded backward scan", "bigint-only placement"]
key-files:
  created: []
  modified:
    - src/console/feedStore.ts
    - src/console/feedStore.test.ts
    - src/console/lines.ts
    - src/console/lines.test.ts
    - src/game/gameData.ts
key-decisions:
  - "Header entry id is 1n (per plan); wind-up entry id is the cast id, so equal-instant wind-ups order by cast id"
  - "setNarratedRound also patches a still-pending entry, so a stamp that arrives before the flush is not lost"
  - "The late-narration tag goes on the first Keeper line of the entry (not strictly the first line), so a narration that opens with NPC dialogue still carries the tag"
  - "buildFeedLines tracks the nearest preceding round header while iterating; no header yet means the tag shows"
requirements-completed: [CMB-03, CMB-04]
metrics:
  tasks: 2
  files: 5
  completed: 2026-10-06
---

# Phase 48 Plan 06: Round headers, wind-up blocks and late-narration tag Summary

The feed store now accepts client-made round headers and wind-up blocks that sort by the 46.1 boundary rule and dedupe by key, and the line classifier turns them into `round` and `windup` lines, drops the two unused server kinds, and tags late narration with its round.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Round header and wind-up entries in the feed store | ff32de52 | src/console/feedStore.ts, feedStore.test.ts, src/game/gameData.ts |
| 2 | Round and wind-up line kinds and the late-narration tag | b3f752a3 | src/console/lines.ts, lines.test.ts |

## What was built

- **feedStore.ts**: `FeedSource` gains `'combat'`; `ServerFeedSource` exported and used by `ingest`, `acceptRow` and `SOURCE_RANK`. `FeedEntry` gains optional `combatId`, `roundNumber`, `narratedRound`, `windup`. `rankOf` gives server sources 0-3, round header 4, wind-up 5. `addRoundHeader` (key `round:{combatId}:{roundNumber}`, createdAt = startedAtMicros, message `Round N`; ignored for 0n or no character) and `addWindup` (key `windup:{castId}`) dedupe against known and pending keys and schedule a flush. `flush()` appends server entries and inserts each combat entry before the first entry that sorts after it, scanning back no further than a local entry. `setNarratedRound(key, round)` replaces the entry in a new array (other entries keep identity). Cap, `clear()` and `setCharacter()` behave as for any entry.
- **gameData.ts**: event source alias is now `ServerFeedSource` (type only).
- **lines.ts**: `FeedSourceName` gains `'combat'`; `LineSource` gains the optional combat fields; `LineKind` gains `'round' | 'windup'`; `FeedLineView` gains optional `roundNumber`, `roundKey` (`{combatId}:{roundNumber}`), `roundTag`, `windup`. `classifyEntry` routes `source === 'combat'` to a small classifier (neither kind keyword-eligible, malformed entries render nothing). `combat_round_header` and `combat_resolving` leave `COMBAT_KINDS` and render nothing (UI-SPEC A15). `buildFeedLines` tracks the nearest preceding round header and sets `roundTag` on the first Keeper line of an entry whose `narratedRound` differs from it or has no header before it.

## Pinned assertions changed deliberately

1. `src/console/lines.test.ts` "errors, warnings and combat kinds": `combat_round_header` and `combat_resolving` left the combat-kind list; a new case asserts both classify to `[]` (UI-SPEC A15; RESEARCH Q4). The RESEARCH-expected lines 210-211.

Nothing else in a Phase 45/47 test changed. The existing feedStore and lines cases pass unchanged.

## Verification

- `pnpm exec vitest run src/console src/game`: 17 files, 355 tests passed.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 90 files, 1637 tests passed (1613 before).
- `pnpm exec vue-tsc -b`: exit 0.
- Design-guard grep over the diff (replaceAll, `.at(`, Object.hasOwn, v-html, svg, hex colors): no matches.

## Deviations from Plan

None - plan executed as written. (Both tasks were developed together, then committed per task; the task 1 commit's `feedStore.test.ts` only type-checks together with the task 2 `lines.ts` types, so `vue-tsc` is green at the task 2 commit, not at the task 1 commit alone.)

## Auth gates

None.

## Known Stubs

None. Nothing calls `addRoundHeader`, `addWindup` or `setNarratedRound` yet and nothing renders the new line kinds: plan 07 wires the combat rows to the store and draws them. The `FeedLineView` fields are optional so existing consumers are unaffected.

## Threat Flags

None beyond the register. T-48-21: wind-up text and parts are plain strings, never keyword-eligible, and a markup-in-text test pins them literal (rendering as text nodes is plan 07). T-48-22: headers only come from calls the client makes for rounds it saw, startedAt 0 is ignored, server rows only append, placement tests pin both sides of each boundary. T-48-23: headers and wind-ups dedupe by key and count toward the 300-line cap (tested).

## Flagged assumptions

- CMB-04 prohibition (never invent a boundary or move a line already read): covered by the tests above; one residual case is a late header inserted before already-read later lines, which is the intended "late boundary" behavior from RESEARCH Q4 step 4 and is bounded by the local-entry stop.
- CMB-03 wind-up placement under the round it arrives in and dedupe by cast id are tested; end-to-end behavior is verified once plan 07 wires it.
- A narration with a known round but no preceding header shows the tag (it landed under no header); for owner review at UAT.

## Deferred owner verification

Nothing visible changes in this plan (no producer or renderer yet). After plan 07: start a fight and confirm "Round 1" appears above the first combat lines, a line stamped at a round boundary sits under the round it closes, a late narration for an earlier round shows its round tag, and a wind-up block appears once per cast.

## Self-Check: PASSED

- FOUND: src/console/feedStore.ts, src/console/feedStore.test.ts, src/console/lines.ts, src/console/lines.test.ts, src/game/gameData.ts
- FOUND commits: ff32de52, b3f752a3
