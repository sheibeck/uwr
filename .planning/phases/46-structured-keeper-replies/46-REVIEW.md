---
phase: 46-structured-keeper-replies
reviewed: 2026-10-05T16:40:00Z
depth: standard
files_reviewed: 53
files_reviewed_list:
  - scripts/llm/golden.live.ts
  - scripts/llm/golden_review.mjs
  - scripts/llm/golden_review.test.mjs
  - scripts/llm/golden_rules.mjs
  - scripts/llm/golden_rules.test.mjs
  - scripts/llm/golden_run.test.mjs
  - scripts/llm/golden_set.mjs
  - scripts/llm/sweep.live.ts
  - scripts/llm/sweep_rules.mjs
  - scripts/llm/sweep_rules.test.mjs
  - spacetimedb/src/data/__snapshots__/llm_schemas.test.ts.snap
  - spacetimedb/src/data/keeper_bible.test.ts
  - spacetimedb/src/data/keeper_bible.ts
  - spacetimedb/src/data/llm_layers.test.ts
  - spacetimedb/src/data/llm_layers.ts
  - spacetimedb/src/data/llm_routes.test.ts
  - spacetimedb/src/data/llm_routes.ts
  - spacetimedb/src/data/llm_schemas.test.ts
  - spacetimedb/src/data/llm_schemas.ts
  - spacetimedb/src/helpers/__fixtures__/claude/ok_combat_segments.json
  - spacetimedb/src/helpers/__snapshots__/claude_request.test.ts.snap
  - spacetimedb/src/helpers/__snapshots__/llm_apply.characterization.test.ts.snap
  - spacetimedb/src/helpers/claude_request.test.ts
  - spacetimedb/src/helpers/combat_narration.test.ts
  - spacetimedb/src/helpers/combat_narration.ts
  - spacetimedb/src/helpers/creation_generation.test.ts
  - spacetimedb/src/helpers/creation_generation.ts
  - spacetimedb/src/helpers/events.test.ts
  - spacetimedb/src/helpers/events.ts
  - spacetimedb/src/helpers/llm_apply.characterization.test.ts
  - spacetimedb/src/helpers/llm_apply.test.ts
  - spacetimedb/src/helpers/llm_apply.ts
  - spacetimedb/src/helpers/llm_executor.test.ts
  - spacetimedb/src/helpers/llm_failure_drills.test.ts
  - spacetimedb/src/helpers/llm_segment_drills.test.ts
  - spacetimedb/src/helpers/llm_sweeper.test.ts
  - spacetimedb/src/helpers/llm_sweeper.ts
  - spacetimedb/src/helpers/renown.ts
  - spacetimedb/src/helpers/renown_llm.test.ts
  - spacetimedb/src/helpers/segments.test.ts
  - spacetimedb/src/helpers/segments.ts
  - spacetimedb/src/helpers/skill_offer.test.ts
  - spacetimedb/src/helpers/skill_offer.ts
  - spacetimedb/src/helpers/world_gen.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/creation.ts
  - spacetimedb/src/reducers/llm_cutover.test.ts
  - spacetimedb/src/schema/event_segments.test.ts
  - spacetimedb/src/schema/tables.ts
  - src/module_bindings/event_creation_table.ts
  - src/module_bindings/event_location_table.ts
  - src/module_bindings/event_private_table.ts
  - src/module_bindings/types.ts
findings:
  critical: 0
  warning: 8
  info: 5
  total: 13
status: issues_found
---

# Phase 46: Code Review Report

**Reviewed:** 2026-10-05
**Depth:** standard
**Files Reviewed:** 53
**Status:** issues_found

## Summary

Phase 46 is in good shape on the points the orchestrator flagged. The `segments.ts` contract is solid on the security focus: the stored speaker is only ever "The Keeper" or the canonical name of a present NPC (never copied from model text), `speakerNpcId` comes only from the server-supplied present list, the player is never a speaker, the 6-segment and 600-code-point clamps hold, and the logs carry fixed reasons only (`errName`, a fixed NPC line). `ctx.sender` is not involved in the apply layer. The additive optional column, the bindings and the event helpers are consistent with each other. I did not find a data-loss or security defect that needs a BLOCKER.

Offline tests ran: `scripts/llm`, `segments`, `llm_apply*`, `combat_narration`, `events`, `data/*`, `schema/*` and both drill suites. 1989 tests passed. The only failures are the two known baseline suites (`call_log_report.test.mjs`, `proof_rules.test.mjs`), whose files moved to `.planning/milestones/`.

The real defects are mostly in the gaps around the contract. One prompt contradicts itself. Three normalisation rules are wrong at their edges. Pack-and-clamp can silently cut server-composed text. Some Keeper-voice lines bypass segments. One golden rule false-positives on ordinary words. I probed the `segments.ts` items with a scratch script (not committed) and cite the results.

Already tracked, not re-raised: CR-01 `login_email`, the public `event_private` and `event_creation` exposure, OQ4 (the NPC `maxTokens` of 512 against a pre-Phase-46 p99 of 379, now with a longer reply shape; deferred to the paid run).

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: The NPC conversation request contradicts itself about who the model is

**File:** `spacetimedb/src/data/llm_layers.ts:446` (block) against `spacetimedb/src/data/llm_layers.ts:767-790` (`buildNpcConversationVolatile`)
**Issue:** `NPC_CONVERSATION_BLOCK` now says "You are the Keeper, narrating a conversation between the player's character and the NPC", and that "you" in narration is the player's character. The volatile user message for the same request is unchanged and still opens with `You are ${npc.name}.`. It continues in the NPC's first person ("Your region", "Your secrets", "At this affinity you are willing to") and ends with `Respond in character.`. The block's "What you know: your own region ... and your secrets" paragraph also still addresses the NPC as "you". The model is told in one request that it is the Keeper and that it is the NPC, and that "you" means the NPC in one place and the player in another. The builder is not in the approved VOICE-CHANGES package (grep finds no mention of it), so this is a functional prompt defect rather than approved wording. It risks the NPC's narration slipping into first person ("I lean in...") or the dialogue and narration split collapsing, which is exactly what `keeper_first_person` and `segments_invalid` would catch in the paid run.
**Fix:** Bring the volatile builder in line with the block. Open with `The NPC is ${w(npc.name)}.`, change "Your region" and "Your secrets" to "Their region" and "Their secrets" (or "The NPC's ..."), change "you are willing to" to "the NPC is willing to", and end with `Reply with the segments JSON object.` Re-pin `llm_layers.test.ts`. Rewrite the block's "What you know" lines in the third person as well. Because this is voice text, put the change in front of the owner.

### WR-02: Dialogue text keeps newlines and blank lines, so the flattened `message` can carry forged attributed lines

**File:** `spacetimedb/src/helpers/segments.ts:83-92` (`sanitize`), `:124-128` (`cleanSegmentText`), `:225-230` (`flattenSegments`)
**Issue:** `sanitize` only collapses three or more newlines to two. A dialogue segment's `text` may therefore contain blank lines. Probe result: the dialogue text `The Keeper says, "x"\n\nThe Ferryman says, "evil"` is stored as one Ferryman dialogue segment with that text. `flattenSegments` then writes it into `message` and `npc_dialog` as a line that looks like two separately attributed speakers (`The Keeper says ...` and `The Ferryman says ...`). The structured `speaker` stays correct, but `message` is what logs, admin views and any non-segment client show, and it is also the broadcast text for the shared combat narrative row. This weakens the "speaker spoofing" guarantee the phase set out to provide: model output (untrusted, and steerable by player input) can forge attribution in the plain-text form.
**Fix:** One speaker turn is one paragraph. For `kind === 'dialogue'`, collapse all whitespace runs including newlines: `text = text.replace(/\s*\n\s*/g, ' ')`, before the quote strip in `cleanSegmentText`. Add a test with embedded `\n\n`.

### WR-03: `stripOuterQuotes` mangles dialogue that merely starts and ends with a quoted phrase

**File:** `spacetimedb/src/helpers/segments.ts:109-118`
**Issue:** It strips the first and last character whenever they are both `"` (or both curly), without checking that they are a matching pair around the whole text. Probe: `"Hello," he said, "goodbye"` becomes `Hello," he said, "goodbye`, which leaves unbalanced quotes inside the final `says, "..."` message. Dialogue that opens and closes on a quoted phrase is not unusual (an NPC quoting someone, or two quoted sentences with an attribution between them).
**Fix:** Strip only when the inner text contains no further double quote: `if (cps.slice(1, -1).some((c) => c === '"' || c === '“' || c === '”')) return text;`.

### WR-04: The control and bidi strip list is incomplete, and it is written as invisible literal characters

**File:** `spacetimedb/src/helpers/segments.ts:63-64`
**Issue:** The comment promises that "bidi controls" are stripped, but the class only covers U+202A-202E, U+2066-2069, U+200B and U+FEFF, typed as raw invisible characters inside the regex literal (verified: `202a 202e 2066 2069 200b feff`). Probe: U+200E (LRM), U+2028 and U+2029 (line and paragraph separators) all pass through into stored `text`. U+200F (RLM), U+061C (ALM), U+2060 (word joiner), U+00AD and U+180E are also missing. The line separators matter because a client or log view that splits lines on them gets the same forged-line effect as WR-02, and the bidi marks can still reorder the speaker label against the text. Literal invisible characters in source are also fragile: an editor or a paste can drop them, and reviewers cannot see them (the injection scan flagged this file for exactly that).
**Fix:** Use escapes and complete the set: `/[\u0000-\u0009\u000B-\u001F\u007F-\u009F­؜᠎​-‏ -‮⁠-⁩﻿]/g`. ZWJ and ZWNJ (U+200C-200D) fall inside `​-‏`, so keep them out of the range if emoji joiners must survive. Add a test over each code point.

### WR-05: `packParagraphs` ignores the 600 cap, so server-composed mechanics text can be silently cut

**File:** `spacetimedb/src/helpers/segments.ts:185-217`; call sites `spacetimedb/src/helpers/llm_apply.ts:294`, `:392`, `:464`, `:550`
**Issue:** When there are more than 6 paragraphs, the smallest adjacent pair is merged without checking the merged length. Probe: seven paragraphs of 300 characters produce a segment of exactly 600 characters, with 2 characters lost and the cut marked `…`. The inputs here include model text that is not length-clamped upstream: the class description, the ability descriptions (`validateClassReply` does not clamp `description`), the race narrative, and the region description. Class mechanics lines (`abilityMechanicsLine`) sit in the same paragraph as the model's ability description, and the "Choose one. Type the name of the ability..." instruction is its own short paragraph that can be merged with others. A long model description therefore truncates the stat line or the instruction that tells the player what to do. `message` is built from the truncated segments, so the full text is gone from the row. The earlier `appendCreationEvent` calls stored the whole string. Typical output stays under the cap (I traced the class fill and skill offer cases), so this is a latent loss rather than a constant one.
**Fix:** Make the packer cap-aware: never merge when the combined length would exceed `MAX_SEGMENT_CHARS`. Where more than 6 would remain, fall back to splitting at sentence or line boundaries instead of truncating. Separately, keep each mechanics line in its own paragraph (the `\n` before `abilityMechanicsLine` becomes `\n\n`), or clamp the model description before composing.

### WR-06: Some Keeper-voice lines still bypass segments, including the same content that a fresh reply stores with segments

**File:** `spacetimedb/src/helpers/creation_generation.ts:230-237` (`reuseRace`), `spacetimedb/src/helpers/llm_sweeper.ts:313`, `spacetimedb/src/helpers/creation_generation.ts:123`, `:172`, `:205`
**Issue:** `applyCreationResult` stores the race narrative, the bonus line and the "choose your path" prompt through `keeperSegments`. `reuseRace` posts the same narrative, bonuses and prompt through `appendCreationEvent(...)` with a plain string and no segments, so a returning race (the second player to pick it) has `segments` unset while a new race has them. The sweeper's `CREATION_LOCK_RELEASED` line is the same text `applyLlmFailure` stores as a Keeper segment (`llm_apply.ts:194`), but the sweeper writes it plain. `world_gen.ts` was updated for `failWorldFill` and `llm_apply.ts` for `failWorldGen`, so the sweeper's creation path is the odd one out. A Phase 47 client that renders only `segments` would show nothing for these rows unless it also handles the missing-segments case everywhere. SEG-01 and SEG-04 are about "every narrative reply" never breaking the feed.
**Fix:** Give these call sites the same `keeperSegments` / `keeperFallback` wrapping used in `llm_apply.ts` (move `writeCreationSegments` into a shared non-mocked module, or build the segments with `keeperSegments` and pass them through `appendCreationEvent`). If the omission is deliberate, record it in the Phase 47 hand-off so the client keeps a `message` fallback.

### WR-07: The `keeper_first_person` golden rule false-positives on the ordinary noun "mine" and is case-insensitive on "I"

**File:** `scripts/llm/golden_rules.mjs` (`FIRST_PERSON`, the `keeper_first_person` block)
**Issue:** `FIRST_PERSON = /\b(?:I|me|my|mine|myself)\b/i`. Probe: `The abandoned mine breathes cold air.` matches. Fantasy region and location descriptions mention mines and place names such as "Whisper Mine" all the time, and `KEEPER_VOICE_KEY` (`description$`) applies the rule to every location, NPC and class description on the stage routes. The rule would fail golden items on correct output and push the owner toward changing good prose. The `i` flag also lets a lowercase "i" through the "I" branch (names, labels). This is the rule's whole job, and its precision decides whether the deferred SEG-05 run can be trusted.
**Fix:** Drop `mine` (the possessive pronoun in narration is far rarer than the noun), or require a pronoun context. Match `I` case-sensitively: `/\b(?:I|[Mm]e|[Mm]y|[Mm]yself)\b/` with `I` uppercase only. Add `mine` (noun) as a negative test and `my` / `me` / `I` as positives.

### WR-08: `isUsableProse` accepts a reply that contains JSON debris after a prose prefix

**File:** `spacetimedb/src/helpers/segments.ts:255-268`
**Issue:** Probe: `Sure, here: {"segments":[{"kind":"narration","speaker":"The Keeper","text":"You walk` returns true. The only structure check is that the text does not start with `{`, `[` or a fence. A truncated or malformed reply that has a preamble then goes through `keeperSegments` and the raw JSON fragment is shown to the player as Keeper narration (combat `salvageProse`). With the route now on structured output this should be rare, but it is exactly the malformed-reply case the ladder exists for, and the in-voice fallback is the intended outcome.
**Fix:** Reject prose that contains a JSON key fragment: `if (/"(?:segments|kind|speaker|text)"\s*:/.test(t)) return false;`, and add it to the `segments.test.ts` prose cases.

## Info

### IN-01: A player or enemy name drops an NPC's dialogue before the present-speaker lookup

**File:** `spacetimedb/src/helpers/segments.ts:165-167`
**Issue:** The player-name check runs before the `present.find`, so an NPC whose name equals a participant's character name (or "You", "Player") has its dialogue silently dropped. This is limited to the griefing-yourself case (a player names a character after a local NPC) and, in combat, to a group-mate's name colliding with an enemy. The conversation NPC itself falls into the fallback line.
**Fix:** Look up `present` first and drop only when the key is a player name and not a present speaker, or give the player-name set priority only for the literal pronoun keys.

### IN-02: The self-correction guard is not applied to the segments path

**File:** `spacetimedb/src/helpers/combat_narration.ts:261-268`
**Issue:** `cleanProse: stripNarrationSelfCorrection` runs only for the legacy `narrative` field and for salvaged prose. A narration segment inside a valid segments reply that carries a self-check paragraph ("Wait: that uses their...") is stored as is. The structured route makes this less likely, and `toneLint` still catches it in the paid run, but the server-side guard that existed for prose no longer protects the main path.
**Fix:** Run `stripNarrationSelfCorrection` over each narration segment's text in `handleCombatNarrationResult` (or in `normalizeSegments` via an optional cleaner), or record in the summary that the guard is intentionally prose-only.

### IN-03: The catch-all in the creation applies now logs only the error class

**File:** `spacetimedb/src/helpers/llm_apply.ts:322-326`, `:374-378`, `:435-439`
**Issue:** The log line says "could not be parsed" and prints `errName(...)`, but the `creation_race` try block also covers the state update, the event write and the `race_definition` insert. A database or code fault there is logged as `could not be parsed ...: Error` or `TypeError` with no message, and the catch then writes a second (error) event and reverts the step after the success line was already stored. The reduction to the error name is the right call for `SyntaxError` (its message quotes the reply), but it throws away useful detail for every other error.
**Fix:** Keep the name for `SyntaxError` and log `redactSecrets(err.message)` for the others, or narrow the try to `extractJson` and `validateRaceReply` as the two class paths already do.

### IN-04: The `segments.ts` header describes dependencies that are no longer true

**File:** `spacetimedb/src/helpers/segments.ts:15-17`
**Issue:** The header says "the only import is truncateCodePoints ... so scripts/llm/*.mjs can import this file directly". The import is from `../data/llm_layers`, which now pulls in `../helpers/skill_budget` and `mechanical_vocabulary` (new in this phase). It still works and there is no cycle (`combat_narration` is a type-only import), but a data module now imports a helper module and the "pure, tiny import" claim is stale. Moving `truncateCodePoints` into a small shared file would restore it.
**Fix:** Update the comment, or move `truncateCodePoints` (and `LONE_SURROGATE`, which `segments.ts` copies locally) into a leaf module that both files import.

### IN-05: The golden harness writes into a phase folder that later gets archived

**File:** `scripts/llm/golden.live.ts:74-76`
**Issue:** `PHASE_DIR` is `.planning/phases/46-structured-keeper-replies`. The Phase 44 version of this path is what broke `golden_run.test.mjs`, `call_log_report.test.mjs` and `proof_rules.test.mjs` when v2.2 moved to `.planning/milestones/`. The new test pins the Phase 46 path in the harness source, so archiving this phase will repeat the break.
**Fix:** Resolve the phase directory with a fallback to `.planning/milestones/*/46-*`, or write the record to a milestone-neutral path such as `.planning/golden/`.

---

_Reviewed: 2026-10-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
