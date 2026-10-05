---
phase: 46-structured-keeper-replies
plan: 09
subsystem: keeper-voice
tags: [voice, fixed-strings, fallback-lines, approved-edits, characterization]
requires: ["46-08"]
provides:
  - "All 27 approved string- pairs and all 4 approved fallback- pairs applied byte for byte"
  - "COMBAT_NARRATION_FALLBACK_LINE with the approved text (name unchanged for Phase 46.1)"
  - "Segment rules confirmed as the owner decided: unattributed speaker quoted narration (D2), U+2026 cut mark (D3), legacy NPC dialogue salvage on (OQ2)"
affects: [46-10, 46.1]
tech-stack:
  added: []
  patterns:
    - "Approved package applied by a throwaway script: unique-count check per block, per-file line endings preserved, then a stronger conformance check (after text present AND before text gone)"
key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/llm_apply.ts
    - spacetimedb/src/helpers/creation_generation.ts
    - spacetimedb/src/helpers/llm_sweeper.ts
    - spacetimedb/src/helpers/renown.ts
    - spacetimedb/src/helpers/skill_offer.ts
    - spacetimedb/src/helpers/combat_narration.ts
    - spacetimedb/src/reducers/creation.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/helpers/llm_apply.test.ts
    - spacetimedb/src/helpers/llm_failure_drills.test.ts
    - spacetimedb/src/helpers/creation_generation.test.ts
    - spacetimedb/src/helpers/llm_sweeper.test.ts
    - spacetimedb/src/helpers/skill_offer.test.ts
    - spacetimedb/src/reducers/llm_cutover.test.ts
    - spacetimedb/src/helpers/combat_narration.test.ts
    - spacetimedb/src/helpers/llm_segment_drills.test.ts
    - spacetimedb/src/helpers/llm_apply.characterization.test.ts
    - spacetimedb/src/helpers/__snapshots__/llm_apply.characterization.test.ts.snap
key-decisions:
  - "OQ6 (i), all 27 string pairs applied; the status and system strings section E recommends keeping are untouched (llm_status.ts, llm_queue.ts, llm_admin_commands.ts, world_gen.ts, intent.ts, npc_interaction.ts, reducers/combat.ts, llm_indicator_lines.ts, and the kept creation.ts rows)"
  - "D1: the four fallback- blocks applied as drafted"
  - "D2 (unattributed speaker becomes quoted Keeper narration), D3 (U+2026 cut mark) and OQ2 (legacy dialogue salvage on) kept as built: segments.ts and the legacyDialogueSpeaker call are unchanged"
  - "npc_dialog history row 'Marta mutters something unintelligible.' left as is (fallback-2 note: a log row, not a segment)"
metrics:
  duration: "about 40 minutes"
  completed: 2026-10-05
  tasks: 3
  files: 18
status: complete
---

# Phase 46 Plan 09: Approved fixed Keeper strings and fallback lines Summary

The 27 approved `string-` pairs and the 4 approved `fallback-` pairs are in the source byte for byte, so stored Keeper narration lines no longer name the Keeper in the third person, use the first person or wrap their own narration in quotation marks. Malformed NPC, combat and creation replies end in the approved in-voice line, still exactly one Keeper narration segment each. No paid call, no publish, no push.

## Commits

| Task | Commit | What |
|------|--------|------|
| 1 | 2aa6ab7f | string-1, 3, 5, 6, 7, 9, 12 to 22 (llm_apply.ts), string-10, 23, 24 (creation_generation.ts); pins in llm_apply.test.ts, llm_failure_drills.test.ts, creation_generation.test.ts |
| 2 | 59488174 | string-2, 4 (llm_sweeper.ts), 8 (renown.ts), 11, 25 (creation.ts), 26 (skill_offer.ts), 27 (index.ts); sweeper, skill offer and cutover pins |
| 3 | 5e2e382a | fallback-1, 2, 4 (llm_apply.ts), fallback-3 (combat_narration.ts); drills, llm_apply and characterization pins; snapshot re-recorded |

## Files touched

Production: `llm_apply.ts`, `creation_generation.ts`, `llm_sweeper.ts`, `renown.ts`, `skill_offer.ts`, `combat_narration.ts`, `reducers/creation.ts`, `index.ts`. `llm_queue.ts`, `npc_gender.ts`, `llm_status.ts`, `world_gen.ts`, `llm_indicator_lines.ts`, `intent.ts`, `npc_interaction.ts`, `reducers/combat.ts` and `segments.ts` hold no approved row and are untouched (Task 2 "no rows" for those). `CRLF` files (`llm_apply.ts`, `index.ts`) kept their line endings; the diffs are line-level.

## Applied ids

- string-1 to string-27: all 27 (multi-occurrence blocks replaced everywhere: string-7 twice and string-9 twice in llm_apply.ts, string-11 twice in creation.ts).
- fallback-1 to fallback-4: all 4.
- Conformance check (prefixes `string- fallback-`, CRLF normalized on both sides, plus a check that no before text remains): `after-blocks 31 missing none, old text still present none`, exit 0.

## Owner answers applied

- Unattributed-speech rule (D2): kept as built, a dialogue segment whose speaker is not a present NPC becomes Keeper narration with the speech in straight double quotes. `segments.ts` unchanged; the SEG-04 matrix still pins `"I am in charge now."`.
- Truncation mark (D3): U+2026, as built (`TRUNCATION_MARK`), unchanged.
- OQ2: legacy NPC `dialogue` salvage stays ON; `legacyDialogueSpeaker` is still passed in `applyNpcConversationResult`. No segments.ts or SEG-04 drill change needed.

## Moved pins, with the block id that caused each

| Pin | Moved by |
|-----|----------|
| llm_failure_drills.test.ts: SKILL_RESTING_SUFFIX and the inline lines for the flicker, falter, renown static options and skill failure lines | string-1, 3, 5, 6, 7 |
| llm_apply.test.ts: FLICKER, world_gen failure texts, renown static-option fragments (4 places), renown and skill-offer presentations (opening line, quotation marks dropped), arrival last paragraph, go-back hint, creation malformed line (2 places), NPC mutter lines (4 places) | string-1, 3, 5, 7, 9, 15, 17, 19, 20, 21, 22; fallback-1, 2, 4 |
| creation_generation.test.ts: retry hint line, class-fill failed line; the `him` pin on CLASS_FILL_RETRY_HINT became an exact-text pin of the approved line (not loosened; the no-exclamation and no it/they checks stay) | string-23, 24 |
| llm_sweeper.test.ts (3 lines), skill_offer.test.ts (1), llm_cutover.test.ts (3 lines: skill offer narrative; the `"Level 2.` contains-pin became `Level 2. How quaint.`) | string-1, 3, 18, 26 |
| combat_narration.test.ts: COMBAT_NARRATION_FALLBACK_LINE equals the approved line | fallback-3 |
| llm_segment_drills.test.ts: NPC fallbackText and notJsonText | fallback-1, 2 |
| llm_apply.characterization.test.ts explicit assertions: renown static options (3), creation malformed (`toBe` the full approved line instead of `toContain('malformed')`), world_gen failure errorMessage, arrival last paragraph, renown rank line, combat FALLBACK, NPC mutter lines (4); title "unintelligible" became "mutter" (the snapshot key moved with it); header paragraph extended with the Plan 09 note | string-3, 7, 15, 21; fallback-1, 2, 3, 4 |

No matcher was loosened. The pronoun guard (`pronoun_rules.test.ts`) passes unchanged, including the "You will never see them again" allowlist entry, which still matches exactly one line.

### Characterization snapshot: 57 cases re-recorded (of 151), reviewed hunk by hunk

Every hunk is a changed Keeper line (message and segments changed together to approved text) or the packing consequence below. Cases by block:

- fallback-3: combat_narration JSON without a segments or narrative field; combat empty reply.
- fallback-4: creation_race malformed JSON; creation_class_reveal malformed JSON; creation_class_reveal reply without a usable firstAbility; creation_race failure; creation_class_reveal failure (failure path).
- fallback-1 and 2: NPC "reply has no dialogue" mutter line; NPC invalid JSON (this case's key was renamed with its title, so the old key is dropped and the new key written).
- string-9 and 12: creation_race success (5 cases: valid reply, prose around JSON, code fence, no second race_definition, Unknown race), creation_race clamped, creation_class success (valid reply, null ability entry, legacy field names, missing stats), creation_class clamped.
- string-23: creation_class (fill) failure, empty object, malformed JSON, null ability entry.
- string-1: creation_race failure, creation_class_reveal failure (flicker line).
- string-3, 4, 13, 14: world_gen_start failure path (4 cases), world_gen_start success stage 1 incomplete or invalid-JSON cases (6 cases).
- string-15: world_gen_start success stage 1 (starter region, no first NPC, code fence, gate-closed FILL_ERROR).
- string-5, 6, 16: skill_gen failure, skill_gen with fewer than three skills (3 cases).
- string-17, 18, 19: skill_gen success (4 cases).
- string-20, 21, 22: renown_perk_gen success (4 cases).
- string-7: renown static fallback (8 cases, including the failure path and the rank-2 and rank-6 pools).

One consequence worth stating: where the quotation marks were dropped (string-18, 19, 21, 22), the six-segment pack merged a different adjacent paragraph pair in two renown and skill-presentation cases, so the segment boundaries moved with the shorter lines. The message text and the message equals flattened-segments invariant hold in every case, and the invariant tests pass.

## Verification

- Module suite: 3383 passed, 2 failed, both in `measurement.results.test.ts` (known baseline).
- Scripts suite (`scripts/llm`): 485 passed; failing files only `call_log_report.test.mjs` and `proof_rules.test.mjs` (known baseline); `golden_run.test.mjs` and `golden_rules.test.mjs` pass.
- Free golden dry run (`env -u GOLDEN_LIVE_RUN -u GOLDEN_ONLY`): "dry: 27 requests built, validated and byte-stable, none sent".
- SEG-04 matrix, message/segments invariant and the leak-pattern drill pass with the new lines.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test files outside the plan's file list pinned old strings**
- **Found during:** Tasks 1 and 2 (full module suite)
- **Issue:** `llm_sweeper.test.ts`, `skill_offer.test.ts`, `llm_cutover.test.ts` and `creation_generation.test.ts` pin approved-string text (the package's section G lists them). Only some were in this plan's file list.
- **Fix:** Moved the pins to the approved text; no matcher loosened (the `him` pin became an exact-text pin).
- **Commits:** 2aa6ab7f, 59488174

**2. [Rule 1 - Bug] The plan's conformance one-liner can pass falsely**
- **Found during:** Task 1
- **Issue:** The 46-07 check does not normalize CRLF and treats an after text as present when it is a substring of the old line. string-27's after text is a substring of its before text, and `llm_apply.ts` and `index.ts` are CRLF.
- **Fix:** Ran an equivalent check with CRLF normalized on both sides plus a second assertion that no before text remains. Result in the section above. No source change.

## Deferred owner verification

Nothing human-verify in this plan. For the deferred paid run (SEG-05, not authorized here): read the arrival, skill offer, renown offer and failure lines in the console once to confirm the unquoted narration reads as intended, and that the shorter NPC and combat fallback lines read in voice.

## Known Stubs

None.

## Threat Flags

None. T-46-09-01 mitigated (only string- and fallback- after blocks applied, conformance 31 of 31, status and system rows untouched), T-46-09-02 (drill leak pattern still runs over every posted line and passes), T-46-09-03 (pins moved to exact new text, listed above).

## Self-Check: PASSED

- FOUND: 46-09-SUMMARY.md and every file listed under key-files
- FOUND commits: 2aa6ab7f, 59488174, 5e2e382a
