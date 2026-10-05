---
phase: 46-structured-keeper-replies
plan: 06
subsystem: voice-approval
tags: [voice, owner-approval, keeper-bible, route-blocks, checkpoint, seg-03]
requires: ["46-05"]
provides:
  - "46-VOICE-CHANGES.md: the approved voice package (59 before/after pairs, 1 proposal block, owner answers OQ1 to OQ7, D, G, I) read and checked by 46-07 to 46-10"
affects: [46-07, 46-08, 46-09, 46-10]
tech-stack:
  added: []
  patterns:
    - "voice:before / voice:after / voice:rejected / voice:proposal markers with id and file; before blocks checked verbatim against source"
key-files:
  created:
    - .planning/phases/46-structured-keeper-replies/46-VOICE-CHANGES.md
  modified: []
decisions:
  - "Owner replied 'approved' in chat on 2026-10-05: every recommendation taken, every after block approved as drafted (optional ones included), no pair rejected, no owner edits"
  - "OQ1 server wrap as built (no REPLAN); OQ2 keep; OQ3 (a) state the budgets in the per-call text; OQ4 decide after the deferred golden run; OQ5 keep the echo; OQ6 (i), all 27 string pairs; OQ7 listed enemies plus NPCs at the location"
  - "D1 to D3 as drafted; G1 to G4 keep; I1 to I5 accepted"
metrics:
  duration: "continuation after checkpoint, a few minutes"
  completed: 2026-10-05
  tasks: 3
  files: 1
status: complete
---

# Phase 46 Plan 06: Voice change package and owner approval Summary

The Phase 46 voice package is drafted, reviewed and approved by the owner as drafted; every approved after block is now the single checkable source of truth for plans 46-07 to 46-10. No source file changed in this plan.

## Status line

`Status: APPROVED 2026-10-05 (see H)`

## What was done

- **Task 1 (e856e22e):** drafted `46-VOICE-CHANGES.md` (sections A to H, 59 before/after pairs, one `voice:proposal`).
- **Task 2 (blocking checkpoint:decision):** the owner reviewed the package. Not auto-deferred, not auto-approved.
- **Task 3 (bca8bdf0):** recorded the owner's reply verbatim under "Approval record" in section H, filled all 73 rows of the decisions table, and set the status to APPROVED. Only the package file was committed.

## Owner reply (verbatim, 2026-10-05)

> approved

Per the package's own rule, "approved" takes every recommendation.

## Decisions table

| Item | Decision |
|------|----------|
| A: bible-identity, bible-voice, bible-formatting, bible-example-1 to 4 (7 pairs) | Approved as drafted (bible-example-1 is optional, taken) |
| B: route-creation_race-1, creation_class_reveal-1, creation_class-1, world_gen_start-1, world_gen-1, skill_gen-1, renown_perk_gen-1, npc_conversation-1 to 4 (11 pairs) | Approved as drafted |
| B: route-schema-race, route-schema-skill, route-schema-renown (3 optional pairs) | Approved as drafted (optional pairs taken) |
| C: combat-block-1 to 3, combat-schema, combat-import, combat-header, combat-route (7 pairs) | Approved as drafted |
| D: fallback-1 to fallback-4 (D1) | Approved as drafted |
| D2 unattributed speaker | Keep quoted narration |
| D3 cut-text mark | Keep U+2026 |
| E: string-1 to string-27 | Approved as drafted (OQ6 (i)) |
| OQ1 | Server wrap, as built. No REPLAN |
| OQ2 | Keep |
| OQ3 | (a) state the budgets in the per-call text. (b) not chosen, so no golden rule is weakened |
| OQ4 | Decide after the deferred golden run |
| OQ5 | Keep the echo for now |
| OQ6 | (i), all 27 string pairs |
| OQ7 | Listed enemies plus NPCs at the location |
| G1 to G4 | Keep |
| I1 to I5 | Accepted |

No pair was rejected (0 `voice:rejected` markers). No after block was edited by the owner.

## Verification

- Before-block verbatim check: 59 before blocks, 0 not verbatim, exit 0 (re-run after recording).
- Voice gate: `git diff --quiet 6aa1f4f1 -- keeper_bible.ts llm_layers.ts llm_schemas.ts llm_routes.ts` exits 0; `git status --porcelain spacetimedb/src` empty.
- Status line grep: 1 match for `^Status: (APPROVED|REPLAN REQUIRED)`.
- No paid LLM call, no publish, no push, local server untouched.

## Deviations from Plan

None - plan executed as written. One note: the decisions table has no separate D1 row (the draft covers D1 through the four fallback rows); the D1 answer is recorded on those rows and in the approval record rather than by adding a row.

## Notes for plans 46-07 to 46-10

- **Line endings.** The working-tree copy of the package keeps CRLF inside the multi-line blocks for the five CRLF source files (49 CR characters; checked after recording). The repository normalizes `*.md` to LF on commit (`.gitattributes` `*.md text eol=lf`, `core.autocrlf=true`), so the committed blob has 0 CRs, and a fresh checkout of the package would be all LF. Conformance checks in 46-07 to 46-10 should compare after normalizing CRLF to LF on both sides rather than rely on the package's CRs surviving a checkout.
- `SEG-05` is not marked complete (owner constraint); `SEG-03` is not marked complete here because the approved text is applied by 46-07 to 46-10.

## Known Stubs

None.

## Threat Flags

None. Threat register T-46-06-01 to T-46-06-04 mitigated: blocking checkpoint honored, only the owner's verbatim reply recorded, before blocks verified verbatim, OQ3 (b) was offered as an explicit choice and not taken.

## Self-Check: PASSED

- FOUND: .planning/phases/46-structured-keeper-replies/46-VOICE-CHANGES.md (Status: APPROVED 2026-10-05 (see H))
- FOUND commits: e856e22e (Task 1), bca8bdf0 (Task 3)
