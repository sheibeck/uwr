---
phase: 46-structured-keeper-replies
fixed_at: 2026-10-05T17:10:00Z
review_path: .planning/phases/46-structured-keeper-replies/46-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 6
skipped: 2
status: partial
---

# Phase 46: Code Review Fix Report

**Fixed at:** 2026-10-05
**Source review:** .planning/phases/46-structured-keeper-replies/46-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (Critical 0, Warning 8; Info excluded by `fix_scope: critical_warning`)
- Fixed: 6
- Skipped: 2 (both by orchestrator scope decision)

No approved wording was changed. No characterization or other snapshot was re-recorded: no stored-output snapshot changed, so there are no re-recorded cases to list. Three sweeper assertions in `llm_sweeper.test.ts` were updated by hand because the sweeper's lock-release row now carries segments (see WR-06).

Verification: full `spacetimedb` suite (`vitest run --maxWorkers=1`) 3404 passed, 2 failed, both in the known-baseline `measurement.results.test.ts`. `scripts/llm` 486 passed, with only the known-baseline `call_log_report.test.mjs` and `proof_rules.test.mjs` failing to load. `tsc --noEmit` reports nothing for the touched files. No new failures.

## Fixed Issues

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
**Applied fix:** Packing is now cap-aware. Pair merging refuses any merge whose result (with its blank-line joint) passes 600 code points. When more than 6 parts remain, the text is re-chunked greedily by sentence units, then word units, then code points (joints between paragraphs, lines and words are preserved), so nothing is dropped whenever the whole text fits in 6 x 600. Only text that cannot fit at all falls back to the previous merge-and-clamp behaviour (and an input beyond 6 x 600 skips the re-chunk work). Behaviour for 6 or fewer paragraphs, and for small paragraph sets, is unchanged (existing tests untouched and passing, including `clamps each paragraph` for a single 800-character paragraph). Tests: seven 300-character paragraphs (the review probe) lose no text; seven five-sentence paragraphs split only on sentence ends; a short instruction paragraph survives next to long ones; unfittable text stays within the clamps. The first two fail against the old code.
**Not applied:** the review's separate suggestion to change the `\n` before `abilityMechanicsLine` to `\n\n` (changes stored text and approved formatting; not needed once packing is cap-aware).
**Status:** fixed: requires human verification (packing logic).

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

## Skipped Issues

### WR-01: The NPC conversation request contradicts itself about who the model is

**File:** `spacetimedb/src/data/llm_layers.ts:446` and `:767-790`
**Reason:** prompt wording needs owner approval; escalated to orchestrator
**Original issue:** `NPC_CONVERSATION_BLOCK` says the model is the Keeper narrating, while `buildNpcConversationVolatile` still opens with `You are ${npc.name}.` and speaks in the NPC's first person; the block's "What you know" lines also address the NPC as "you".

### WR-07: The `keeper_first_person` golden rule false-positives on the ordinary noun "mine"

**File:** `scripts/llm/golden_rules.mjs` (`FIRST_PERSON`)
**Reason:** owner decision G3: keep strict
**Original issue:** `FIRST_PERSON = /\b(?:I|me|my|mine|myself)\b/i` matches the noun "mine" and, case-insensitively, a lowercase "i".

---

_Fixed: 2026-10-05_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
