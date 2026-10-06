---
phase: 47-console-rails-hotbar-and-input
plan: 01
subsystem: client-input
tags: [input, routing, pure-module, tdd]
requires: []
provides:
  - "routeInput(): pure router returning a Route descriptor (none, reducer, intent, talk, hail, info, endConversation)"
  - "COMMAND_WORDS / COMMAND_SHAPES / tokenize / isCommandWord"
  - "FAREWELL_WORDS / BARE_GAME_ACTIONS / isFarewell / isGameAction"
  - "createInputHistory (50 lines, draft restore)"
affects: [47-09]
tech-stack:
  added: []
  patterns: ["pure descriptor router; string comparison for names, only fixed linear regexes"]
key-files:
  created:
    - src/input/commands.ts
    - src/input/conversation.ts
    - src/input/conversation.test.ts
    - src/input/routeInput.ts
    - src/input/routeInput.test.ts
    - src/input/history.ts
    - src/input/history.test.ts
  modified: []
key-decisions:
  - "A command word runs a command only in its exact typed shape; a '/' line is always a command (fixes backlog 999.7)"
  - "Bare 'leave' and 'end' end a conversation; '/leave' and '/end' still run the commands"
  - "accept/decline <one token> is exact only when the token is a pending inviter's name (research S6)"
  - "'whisper <word> <anything>' is the exact whisper shape, so 'Whisper softly to the wind' whispers to 'softly' (inherent in the owner's shape rule; the server rejects an unknown target)"
requirements-completed: [INP-01, INP-02]
status: complete
duration: 25min
completed: 2026-10-05
---

# Phase 47 Plan 01: Input routing and history Summary

Pure exact-shape input router (`routeInput`) plus a 50-line session history, so "Who is that over there?" and "Leave him alone" reach intent while `who`, `/who` and `invite Bob` still run commands.

## What was built
- `src/input/commands.ts`: 18 command words with shapes, whitespace tokenizer, own-property `isCommandWord` (so `constructor` / `__proto__` never match).
- `src/input/conversation.ts`: farewell words, bare game actions and the shape-checked game-action test (place and node names compared as strings, no regex from data).
- `src/input/routeInput.ts`: precedence empty, slash, exact command, say, hail, conversation, intent. Descriptors carry no `characterId`; 47-09 adds it.
- `src/input/history.ts`: newest-first, limit 50, draft saved on first Up and restored by Down, empty lines and consecutive duplicates skipped.

## Verification
- `pnpm exec vitest run src/input --maxWorkers=1`: 3 files, 207 tests pass (includes the 18-word exact and sentence matrix, 5000-char, lone-surrogate and metacharacter inputs).
- `pnpm exec vue-tsc -b`: clean. `src/styles` design guards: 58 pass.

## Deviations from Plan
None in behavior. Process note: implementation and tests were written together and committed per task (one commit each) rather than as separate RED/GREEN commits. One test row was adjusted: the whisper sentence-form row uses `Whisper` (alone), because `Whisper softly to the wind` is itself a valid exact whisper shape per the plan.

## Commits
- 27851f15: feat(47-01): exact-shape input router with command table and conversation words
- 8da21893: feat(47-01): session input history of the last 50 lines

## Known Stubs
None.

## Threat Flags
None. T-47-03 and T-47-02a mitigated as planned (matrix test; only fixed linear regexes).

## Flagged assumptions
- Research A4 game-action list adopted as written; the owner may trim it after try-out.
- INP-01 edge probe stays a manual-review flag for the verifier.

## Self-Check: PASSED
Files and both commits verified to exist.
