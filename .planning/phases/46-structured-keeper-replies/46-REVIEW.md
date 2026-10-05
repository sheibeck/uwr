---
phase: 46-structured-keeper-replies
reviewed: 2026-10-05T17:35:00Z
depth: standard
iteration: 3
files_reviewed: 2
files_reviewed_list:
  - spacetimedb/src/helpers/segments.ts
  - spacetimedb/src/helpers/segments.test.ts
findings:
  critical: 0
  warning: 0
  info: 6
  total: 6
status: clean
---

# Phase 46: Code Review Report (iteration 3, final)

**Reviewed:** 2026-10-05
**Depth:** standard
**Files Reviewed:** 2
**Status:** clean (no Critical or Warning finding open; info and deferred items carried)

## Summary

Re-review of commit `752a3263` (WR-09 fix: `packParagraphs` re-chunks when any paragraph is over the cap, via the new `overCap` check). WR-09 is resolved and the change introduces no regression.

Verification performed:
- `segments.test.ts`: 86 tests pass, including the two new WR-09 tests (800-character paragraph split with no loss, and the 700-character ability description whose mechanics line survives in the stage-1 reveal composition and in the stage-2 single-paragraph composition).
- Throwaway randomised probe (20,000 inputs, 1 to 9 paragraphs, shapes: single long paragraphs of one character, astral emoji runs, sentence-heavy and word-heavy text, 40-character unbroken words, single-newline-joined sentences; written, run and deleted, working tree clean apart from the pre-existing planning files). Results:
  - Every result had at most 6 segments, each at most 600 code points, and was never empty (0 failures over both the fits and the over-total inputs, 7,677 and 12,323 respectively).
  - Whenever the text fits in 6 x 600 (measured as the sum of paragraph lengths plus 2 per paragraph), the whitespace-stripped flattened output equals the whitespace-stripped input: 0 losses. This covers a single paragraph longer than 600, astral characters (no split surrogate pairs, `Array.from` code-point accounting is used end to end), and the previous multi-paragraph packing.
  - Over-total input (single 100,000-character paragraph, 3,601 characters, 3,600 astral) never produces more than 6 segments or a segment over 600; it is cut with the truncation mark, as designed.
  - The `char` mode is a guaranteed last resort, so the re-chunk loop always returns before the final `mergeSmallestPairs` fallback for inputs inside the total bound.
- Existing narration packing (more than 6 short paragraphs merged smallest-pair, leftmost on ties) is unchanged: it still returns from the first `merged` return when no part is over the cap.
- Re-chunk joints: segments split mid-paragraph start and end on trimmed text; only whitespace at a cut can be lost, never characters.

WR-09: resolved.

## Narrative Findings (AI reviewer)

No Critical or Warning findings are open.

## Info

Carried forward unchanged from iteration 2 (IN-01 to IN-05) plus one new item.

### IN-01: A player or enemy name drops an NPC's dialogue before the present-speaker lookup

**File:** `spacetimedb/src/helpers/segments.ts:204-205`
**Issue:** The player-name check runs before the `present.find`, so an NPC whose name equals a participant's character name has its dialogue dropped.
**Fix:** Look up `present` first and drop only when the key is a player name and not a present speaker.

### IN-02: The self-correction guard is not applied to the segments path

**File:** `spacetimedb/src/helpers/combat_narration.ts:261-268`
**Issue:** `stripNarrationSelfCorrection` runs only for the legacy `narrative` field and salvaged prose, not for narration segments of a valid segments reply.
**Fix:** Run it over each narration segment's text, or record that the guard is intentionally prose-only.

### IN-03: The catch-all in the creation applies logs only the error class

**File:** `spacetimedb/src/helpers/llm_apply.ts:322-326`, `:374-378`, `:435-439`
**Issue:** `could not be parsed ...: <ErrName>` is also logged for non-parse faults in the same try block (state update, event write, `race_definition` insert), with no message.
**Fix:** Keep the name for `SyntaxError`, log `redactSecrets(err.message)` for others, or narrow the try.

### IN-04: The `segments.ts` header describes dependencies that are no longer true

**File:** `spacetimedb/src/helpers/segments.ts:15-17`
**Issue:** The header says the only import is `truncateCodePoints` and implies it is leaf-pure, but it is imported from `../data/llm_layers`, which now pulls in `skill_budget` and `mechanical_vocabulary`.
**Fix:** Update the comment, or move `truncateCodePoints` into a leaf module.

### IN-05: The golden harness writes into a phase folder that later gets archived

**File:** `scripts/llm/golden.live.ts:74-76`
**Issue:** `PHASE_DIR` pins `.planning/phases/46-structured-keeper-replies`; archiving the phase will break the pinned tests, as happened for Phase 44.
**Fix:** Resolve the directory with a milestones fallback, or write to a milestone-neutral path.

### IN-06: The "does it fit" bound in `packParagraphs` is two code points too strict, and an over-total input collapses to fewer than 6 segments

**File:** `spacetimedb/src/helpers/segments.ts:321-322`
**Issue:** `total` adds 2 for every paragraph, but there are only `n - 1` joints. Text whose real length (paragraphs plus joints) is exactly 3,599 or 3,600 code points therefore skips the re-chunk and is clamped. Confirmed by probe: a single 3,600-character paragraph and a 1,200 + 2,398 two-paragraph input (3,600 with the joint) both come out cut with the truncation mark although they fit exactly. Separately, when the text is over the total cap, the fallback `mergeSmallestPairs(merged, max, false)` can leave a single over-cap paragraph as one clamped segment (a 100,000-character paragraph yields one 600-character segment) rather than using the six segments available. Neither can exceed 6 segments or 600 code points, and neither affects the practical creation prose, so this is informational only.
**Fix:** Use `paragraphs.reduce((n, p) => n + cpLength(p), 0) + 2 * (paragraphs.length - 1)` for `total`. Optionally, for the over-total case, run `fillChunks` with an uncapped chunk list truncated to `max` so the first 3,600 code points are kept.

## Deferred (owner decision, not open)

- WR-07: `scripts/llm/golden_rules.mjs` `FIRST_PERSON` false-positives on the noun "mine". Owner decision G3, keep strict.

Known and deferred, not re-raised: CR-01 `login_email`, the public event-table exposure, OQ4 NPC `maxTokens`.

---

_Reviewed: 2026-10-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
