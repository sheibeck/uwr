---
phase: 46-structured-keeper-replies
fixed_at: 2026-10-05T18:00:00Z
review_path: .planning/phases/46-structured-keeper-replies/46-REVIEW.md
iteration: 2
findings_in_scope: 9
fixed: 8
skipped: 1
status: partial
---

# Phase 46: Code Review Fix Report

**Fixed at:** 2026-10-05
**Source review:** .planning/phases/46-structured-keeper-replies/46-REVIEW.md
**Iteration:** 2 (cumulative: carries forward the iteration-1 fixes WR-01 to WR-08 and adds WR-09)

**Summary:**
- Findings in scope: 9 (Critical 0, Warning 9; Info excluded by `fix_scope: critical_warning`)
- Fixed: 8 (WR-01 to WR-06 and WR-08 in iteration 1, WR-09 in iteration 2)
- Skipped: 1 (WR-07, owner decision G3)

Iteration 2 handled only WR-09 (the iteration-2 review's single Warning). It changed no stored wording and left the `\n` before the mechanics line as it was. No snapshot changed: `git status` after the gates shows no `.snap` file modified, so there are no re-recorded characterization cases to list. WR-01 was applied in iteration 1 after the owner approved its wording on 2026-10-05 (chat, "Apply as proposed"); the verbatim before/after pairs are in `46-VOICE-CHANGES.md` section H, "Addendum (post-review WR-01, approved 2026-10-05)". That commit re-recorded the `claude_request` snapshot; only the npc_conversation entry changed. Three sweeper assertions in `llm_sweeper.test.ts` were updated by hand in iteration 1 because the sweeper's lock-release row now carries segments (see WR-06).

Verification (iteration 2, after the WR-09 commit): full `spacetimedb` suite (`vitest run --maxWorkers=1`) 3406 passed, 2 failed, both in the known-baseline `measurement.results.test.ts`. Root `scripts/llm`: 486 passed, with only the known-baseline `call_log_report.test.mjs` and `proof_rules.test.mjs` failing to load. `tsc --noEmit` reports nothing for `segments.ts`. No new failures.

## Fixed Issues

### WR-09: A single over-cap paragraph is still clamped (residual of WR-05), which can cut the ability mechanics line

**Files modified:** `spacetimedb/src/helpers/segments.ts`, `spacetimedb/src/helpers/segments.test.ts`
**Commit:** 752a3263
**Applied fix:** `packParagraphs` now treats "a part longer than 600 code points after capped merging" like "too many parts". It computes `overCap = merged.some(p => cpLength(p) > MAX_SEGMENT_CHARS)` and returns `merged` only when `merged.length <= max && !overCap`. Otherwise it runs the existing cap-aware re-chunk path (sentence units, then word units, then code points), so nothing is dropped whenever the whole text fits in 6 x 600. Text that cannot fit still falls back to merge-and-clamp, as before. This is the review's suggested change applied as written; the existing `total > max * 600` shortcut and the final fallback are unchanged. The doc comment on `packParagraphs` was updated to match. The `\n` before `abilityMechanicsLine` in `llm_apply.ts` was not touched and no stored wording changed.
**Tests:**
- New: a 700-character ability description composed the way `llm_apply.ts` composes the stage-1 class reveal (`Your first ability:\n\n${name} — ${description}\n${mechanicsLine}\n\n...`). It asserts at most 6 segments, each at most 600 code points, the mechanics line present in a segment and in `flattenSegments` (the stored `message`), no truncation mark, and the flattened text equal to the input modulo whitespace. It also checks the same description in a short (under 6 paragraphs) text, so the result no longer depends on paragraph count.
- Changed: the old `clamps each paragraph` test (one 800-character paragraph plus `short`) was renamed to `splits a paragraph over the cap instead of cutting it, losing no text (WR-09)`. The behaviour it pinned (clamp and lose the tail) is exactly the defect; it now asserts two segments, the first 600 code points, none over the cap, no truncation mark, and no lost characters.
- Both new and changed tests fail against the old `packParagraphs` and pass with the fix.
**Status:** fixed: requires human verification (packing logic). Note: the iteration-1 WR-05 report claimed "Behaviour for 6 or fewer paragraphs ... is unchanged (including `clamps each paragraph`)"; that claim is superseded by this fix, which intentionally changes the single over-cap paragraph case.

### WR-02: Dialogue text keeps newlines and blank lines, so the flattened `message` can carry forged attributed lines

**Files modified:** `spacetimedb/src/helpers/segments.ts`, `spacetimedb/src/helpers/segments.test.ts`
**Commit:** 9ab04365
**Applied fix:** `cleanSegmentText` collapses every whitespace run that contains a newline to one space for `kind === 'dialogue'`, before the quote strip. Narration keeps its paragraph structure. The test reproduces the probe (`The Keeper says, "x"\n\nThe Ferryman says, "evil"`) and asserts the flattened message has no newline.
**Status:** fixed: requires human verification (logic change in text normalisation).

### WR-03: `stripOuterQuotes` mangles dialogue that merely starts and ends with a quoted phrase

**Files modified:** `spacetimedb/src/helpers/segments.ts`, `spacetimedb/src/helpers/segments.test.ts`
**Commit:** 678a68e3
**Applied fix:** The outer pair is stripped only when the double quotes inside nest cleanly (new private `innerQuotesBalanced`). This is an adaptation of the review's suggested check ("strip only when the inner text has no further double quote"): that exact check would have broken the existing pinned case `"He said "no" to me"` -> `He said "no" to me` and `""Hi""` -> `"Hi"`. The balance check keeps those and still keeps the quotes for the review's probe `"Hello," he said, "goodbye"` (and for `"Yes." He paused. "No."`). Straight quotes open after the start or whitespace and close otherwise; curly quotes count as themselves.
**Status:** fixed: requires human verification (heuristic).

### WR-04: The control and bidi strip list is incomplete, and it is written as invisible literal characters

**Files modified:** `spacetimedb/src/helpers/segments.ts`, `spacetimedb/src/helpers/segments.test.ts`
**Commit:** c3775a00
**Applied fix:** `STRIPPED_CHARS` is now written entirely as `\u` escapes and covers U+0000-0009, U+000B-001F, U+007F-009F (incl. NEL), U+00AD, U+061C, U+180E, U+200B, U+200E, U+200F, U+2028-202E (line and paragraph separators, all bidi embedding and override controls), U+2060-206F and U+FEFF. ZWNJ and ZWJ (U+200C, U+200D) are deliberately kept so emoji joiners survive (the review flagged this choice). The file no longer contains invisible literal characters in code. Tests loop over 28 code points (each alone, narration and dialogue) and assert LF, ZWNJ and ZWJ survive. The older test that embeds raw invisible characters in a string was left untouched and still passes.

### WR-05: `packParagraphs` ignores the 600 cap, so server-composed mechanics text can be silently cut

**Files modified:** `spacetimedb/src/helpers/segments.ts`, `spacetimedb/src/helpers/segments.test.ts`
**Commit:** 8c1971de
**Applied fix:** Packing is now cap-aware. Pair merging refuses any merge whose result (with its blank-line joint) passes 600 code points. When more than 6 parts remain, the text is re-chunked greedily by sentence units, then word units, then code points (joints between paragraphs, lines and words are preserved), so nothing is dropped whenever the whole text fits in 6 x 600. Only text that cannot fit at all falls back to the previous merge-and-clamp behaviour (and an input beyond 6 x 600 skips the re-chunk work). Tests: seven 300-character paragraphs (the review probe) lose no text; seven five-sentence paragraphs split only on sentence ends; a short instruction paragraph survives next to long ones; unfittable text stays within the clamps. The first two fail against the old code.
**Not applied:** the review's separate suggestion to change the `\n` before `abilityMechanicsLine` to `\n\n` (changes stored text and approved formatting; not needed once packing is cap-aware).
**Status:** fixed: requires human verification (packing logic). Residual (a single paragraph over 600 code points with 6 or fewer paragraphs) found by the iteration-2 review and fixed as WR-09 above.

### WR-06: Some Keeper-voice lines still bypass segments

**Files modified:** `spacetimedb/src/helpers/creation_generation.ts`, `spacetimedb/src/helpers/llm_sweeper.ts`, `spacetimedb/src/helpers/world_gen.ts`, `spacetimedb/src/helpers/creation_generation.test.ts`, `spacetimedb/src/helpers/llm_sweeper.test.ts`, `spacetimedb/src/helpers/world_gen.test.ts`
**Commit:** e833cfa2
**Applied fix:** The existing strings are wrapped, with no wording change, through the trailing `segments` parameter of `appendCreationEvent`, with `message = flattenSegments(segments)`:
- `creation_generation.ts`: `reuseRace` (narrative, bonus line, choose-your-path prompt) uses `keeperSegments`; the refusal line, the `toError` lines and `CLASS_FILL_RETRY_LINE` use `keeperFallback`, via a private `postKeeperSegments` helper.
- `llm_sweeper.ts`: the `CREATION_LOCK_RELEASED` line (`lock.line`) uses `keeperFallback`.
- `world_gen.ts` (one site beyond the review's list, same defect, found while checking the pattern): the refusal line posted for a character not yet placed (`startWorldGeneration` refusal branch) uses `keeperFallback`, matching `failWorldFill`/`failWorldGen`.
No export was added to `events.ts`; `segments.ts` (pure, never mocked) is the only new import. Tests: three new cases in `creation_generation.test.ts` (reused race stores 4 Keeper segments equal to the message, refusal, retry and class-fill refusal each store one), segments assertions in two `world_gen.test.ts` cases, and three `llm_sweeper.test.ts` assertions updated to expect the new fourth argument (segments) of `appendCreationEvent`. The review's note on `reducers/creation.ts` was not in scope: that file still posts many plain Keeper lines (greetings, validation, patience lines) without segments; the Phase 47 client should keep a `message` fallback for them.

### WR-08: `isUsableProse` accepts a reply that contains JSON debris after a prose prefix

**Files modified:** `spacetimedb/src/helpers/segments.ts`, `spacetimedb/src/helpers/segments.test.ts`
**Commit:** c2a02be2
**Applied fix:** `isUsableProse` returns false when the text contains `"segments"`, `"kind"`, `"speaker"` or `"text"` followed by a colon. The test reproduces the probe (`Sure, here: {"segments":[{"kind":"narration","speaker":"The Keeper","text":"You walk`), checks the ladder reaches the in-voice fallback with `salvageProse`, and checks ordinary prose containing the words "speaker" and "kind" is still accepted.

### WR-01: The NPC conversation request contradicts itself about who the model is

**Files modified:** `spacetimedb/src/data/llm_layers.ts`, `spacetimedb/src/data/llm_layers.test.ts`, `spacetimedb/src/helpers/__snapshots__/claude_request.test.ts.snap`
**Commit:** 4deb65c8
**Status:** fixed (owner-approved). The owner approved this exact wording on 2026-10-05 in chat via the WR-01 question: Apply as proposed.
**Applied fix:** `buildNpcConversationVolatile` now names the NPC in the third person ("The NPC in this conversation is {NAME}.", "{NAME}'s region", "{NAME}'s secrets (share only at trusted+ affinity)", "{NAME} has no particular secrets to share.", "At this affinity {NAME} is willing to", "Quests {NAME} gave that the player completed", "{NAME} can reference these", "{NAME} has already given this player a task ...") and ends with "Reply with the segments JSON object: {NAME}'s words in dialogue segments, your narration in the second person." Two lines of `NPC_CONVERSATION_BLOCK` ("What the NPC knows" and "What the NPC does NOT know") are in the third person. The change from "you have never visited" to "he or she has never visited" is the minimal grammatical follow-through of the approved head words. All other lines are unchanged. Tests: a new case in `llm_layers.test.ts` (volatile starts with "The NPC in this conversation is", no "You are " + name, no "Respond in character.", no "Your region/secrets", the block lines, the unfinished-task line); the `claude_request` snapshot was re-recorded and the diff shows only the npc_conversation entry. Verification at the time: `spacetimedb` full suite 3405 passed and 2 failed (known-baseline `measurement.results.test.ts` only); root `scripts/llm` 486 passed with only the known-baseline `call_log_report.test.mjs` and `proof_rules.test.mjs` failing to load; free golden dry run passed (27 requests built, validated, byte-stable, none sent). The model-facing effect (first-person slips, `segments_invalid`) remains for the deferred paid golden run to judge.

## Skipped Issues

### WR-07: The `keeper_first_person` golden rule false-positives on the ordinary noun "mine"

**File:** `scripts/llm/golden_rules.mjs` (`FIRST_PERSON`)
**Reason:** owner decision G3: keep strict
**Original issue:** `FIRST_PERSON = /\b(?:I|me|my|mine|myself)\b/i` matches the noun "mine" and, case-insensitively, a lowercase "i".

---

_Fixed: 2026-10-05_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
