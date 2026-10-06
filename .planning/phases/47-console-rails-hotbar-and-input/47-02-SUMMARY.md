---
phase: 47-console-rails-hotbar-and-input
plan: 02
subsystem: client-console
tags: [feed, keywords, pure-module, tdd]
requires: []
provides:
  - "cleanServerText(): strips color tokens and unwraps [bracket] words"
  - "parseWhisper / parsePartyChat / parseNpcSays"
  - "buildVocabulary / findKeywords / foldText / KEYWORD_LIMIT (total leftmost-longest matcher)"
  - "classifyEntry / buildFeedLines / KEEPER_LABEL / DIALOGUE_SEGMENT_KIND and the FeedLineView, LineSource types"
affects: [47-04, 47-06, 47-07, 47-09]
tech-stack:
  added: []
  patterns: ["manual code-point scanner, no regex from data", "length-preserving case fold", "player-authored kinds never keyword-eligible"]
key-files:
  created:
    - src/console/cleanServerText.ts
    - src/console/cleanServerText.test.ts
    - src/console/whisper.ts
    - src/console/whisper.test.ts
    - src/console/keywords.ts
    - src/console/keywords.test.ts
    - src/console/lines.ts
    - src/console/lines.test.ts
    - src/console/serverParity.test.ts
  modified: []
key-decisions:
  - "Keyword-eligible lines: Keeper narration, NPC speech, scene, quest, ripple, world event, system and warning. Not eligible: whisper, party, group-kind, say/emote, command echo, local echo and system, error, combat kinds."
  - "Segments with empty or whitespace-only text produce no line (never an empty row)."
  - "cleanServerText color pattern uses a word boundary instead of an optional group, because the colors guard flags the text 'color(' anywhere in source."
requirements-completed: [CON-01, CON-02]
status: complete
duration: 20min
completed: 2026-10-05
---

# Phase 47 Plan 02: Feed text layer Summary

Pure text layer for the feed: rows become labelled line views (Keeper, NPC, whisper, party, scene, quest, ripple, world event, system, error, combat), static server markup is stripped, and a total whole-word keyword matcher marks NPC, place, node and player names only in lines a player cannot author.

## What was built
- `cleanServerText.ts`: removes color open/close tokens and unwraps bracket words; newlines and indentation kept.
- `whisper.ts`: anchored parsers for sent and received whispers, `Name: text` party chat (exact, longest member name first, no regex from names) and `Name says, "text"` / `Name: text` NPC lines.
- `keywords.ts`: vocabulary (priority npc, place, node, player; self name, empty names and duplicates dropped; cap 200) and a code-point scanner. Folded text keeps UTF-16 length, curly apostrophes fold to ASCII, boundaries use `\p{L}\p{N}_` only where the name's own edge is a word character. Try/catch fallback makes it total.
- `lines.ts`: `classifyEntry` (segments win, otherwise kind table; local entries handled separately) and `buildFeedLines` (fills parts, title parts and the speaker keyword only while the NPC is still here).
- `serverParity.test.ts`: reads `spacetimedb/src/helpers/segments.ts` as text and pins SEGMENT_KINDS, the dialogue kind and the Keeper label.

## Verification
- `pnpm exec vitest run --dir src --maxWorkers=2`: 43 files, 752 tests pass (includes 134 in `src/console` + `src/styles`).
- `pnpm exec vue-tsc -b`: clean.

## Deviations from Plan
- **[Rule 3 - Blocking] color token regex shape.** The planned research pattern `\{\{\/?color(?::[^}]*)?\}\}` trips the colors guard (it flags the text `color(`). Replaced with `\{\{\/?color\b[^{}]*\}\}`, which matches the same tokens (`{{color}}`, `{{color:value}}`, `{{/color}}`) and rejects `{{colorful}}`. Commit 295e8f0a.
- Process: implementation and tests written together and committed once per task, not separate RED/GREEN commits (same as 47-01).

## Commits
- 295e8f0a: feat(47-02): server text cleaner and whisper, party chat and NPC-says parsers
- 5eb404fb: feat(47-02): keyword vocabulary and total leftmost-longest matcher
- a632b83f: feat(47-02): feed line classification, keyword building and server parity test

## Known Stubs
None.

## Threat Flags
None. T-47-01 (segments never interpreted), T-47-02 (no regex from names, cap, try/catch, hostile-input tests) and T-47-06 (eligibility false for player-authored kinds, tested per kind) mitigated as planned.

## Flagged assumptions
- CON-02 edge probe stays a manual-review flag for the verifier; common-word names highlight every occurrence (accepted by UI-SPEC).
- Eligibility of server `system` and `warning` lines follows the UI-SPEC scope ("quest and system lines"); `error` and interim combat lines are plain.
- Presence/move rows that name a player may produce a whisper-prefill keyword; this is server text, not player-typed.

## Self-Check: PASSED
All nine files exist; commits 295e8f0a, 5eb404fb and a632b83f verified.
