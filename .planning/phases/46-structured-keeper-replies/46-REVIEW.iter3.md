---
phase: 46-structured-keeper-replies
reviewed: 2026-10-05T17:30:00Z
depth: standard
iteration: 2
files_reviewed: 11
files_reviewed_list:
  - spacetimedb/src/data/llm_layers.ts
  - spacetimedb/src/data/llm_layers.test.ts
  - spacetimedb/src/helpers/__snapshots__/claude_request.test.ts.snap
  - spacetimedb/src/helpers/creation_generation.ts
  - spacetimedb/src/helpers/creation_generation.test.ts
  - spacetimedb/src/helpers/llm_sweeper.ts
  - spacetimedb/src/helpers/llm_sweeper.test.ts
  - spacetimedb/src/helpers/segments.ts
  - spacetimedb/src/helpers/segments.test.ts
  - spacetimedb/src/helpers/world_gen.ts
  - spacetimedb/src/helpers/world_gen.test.ts
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
status: issues_found
---

# Phase 46: Code Review Report (iteration 2)

**Reviewed:** 2026-10-05
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Re-review of the seven fix commits (WR-02, WR-03, WR-04, WR-05, WR-08, WR-06, WR-01). Six of the seven fixes resolve their finding and introduce no new defect. WR-05 is only partly resolved: the packer is now cap-aware, but a single paragraph that is itself over 600 code points is still clamped whenever there are 6 or fewer paragraphs, so text is still lost in a case the fix report says is covered (WR-09 below).

Verification performed:
- Ran the touched suites (segments, creation_generation, llm_sweeper, world_gen, llm_layers, claude_request, llm_apply*): 8 files, 977 tests passed.
- Probed `segments.ts` with a throwaway randomised test (3000 inputs, 1 to 14 paragraphs, mixed sentence and word shapes; deleted afterwards, working tree clean apart from the two pre-existing untracked iter2 files). Whenever every paragraph is at most 600 code points and the text fits in 6 x 600, the stripped text of `flattenSegments(keeperSegments(text))` equals the input with nothing lost (0 failures). Every result had at most 6 segments of at most 600 code points. `message === flattenSegments(segments)` holds by construction at the creation call sites.
- WR-03 probes: `"Hello," he said, "goodbye"`, `"Yes." He paused. "No."`, `"A" and "B"` keep their quotes. `"He said "no" to me"`, `""Hi""`, `"I am "Bob""`, `"Call me "Bob," he said"`, `"Fine."` and the curly pair are stripped. The balance heuristic fails in the safe direction (it keeps the outer quotes, at worst a doubled mark, e.g. `"Take 5" rope"`).
- WR-04 probes: U+2028, U+000B, U+0085 are removed; U+200C and U+200D survive; LF survives in narration. The class is written as escapes only.
- WR-02: a newline run inside dialogue becomes one space before the quote strip, so the flattened message cannot carry a forged second attributed line from a blank line.
- WR-01 (approved wording, checked for function only): the block and the volatile are now consistent. `w(npc.name)` is used for every interpolation, no `You are ${...}`, "Respond in character." or first-person NPC line remains (grep over `data/` and `helpers/`), the reply shape still names the dialogue speaker "exactly as the user message gives it", and the NPC name is still present for the speaker match. No functional defect.
- WR-06: every site now passes `message = flattenSegments(segments)` with the segments. `keeperFallback` makes one clamped segment, which is fine for the short fixed lines used here. `world_gen.ts` imports `keeperFallback` and `flattenSegments`. The sweeper imports only the pure `segments` module.

Deferred (not open): WR-07 (`keeper_first_person` golden rule, owner decision G3, keep strict). Known and deferred, not re-raised: CR-01 `login_email`, the public event-table exposure, OQ4 NPC `maxTokens`.

## Narrative Findings (AI reviewer)

## Warnings

### WR-09: A single over-cap paragraph is still clamped (residual of WR-05), which can cut the ability mechanics line

**File:** `spacetimedb/src/helpers/segments.ts:313-324` (`packParagraphs`), `:337-340` (`keeperSegments`); composition at `spacetimedb/src/helpers/llm_apply.ts:395` and `:461`
**Issue:** `packParagraphs` returns `merged` as soon as `merged.length <= max`. Re-chunking only runs when more than 6 paragraphs remain after capped merging. A paragraph that is longer than 600 code points on its own is never split in the other case, and `cleanSegmentText` then cuts it at the cap with a `…`. The stage-1 class reveal (5 paragraphs) and the stage-2 class message (several paragraphs, typically merged to 6 or fewer) both put `${a.name} — ${a.description}\n${abilityMechanicsLine(a)}` in one paragraph, with the mechanics line at the tail. `validateClassReply` does not clamp `ability.description` (`creation_validate.ts:149`) or `classDescription` (`:193`). So a model description of roughly 480 code points or more silently drops the damage, cooldown and cost line the player needs to choose an ability, and the stored `message` loses it too (it is the flattened segments). Before this phase the whole string was stored. The same input gets split (no loss) when it arrives with 7 or more paragraphs, so behaviour depends on paragraph count. The fix report states "nothing is dropped whenever the whole text fits in 6 x 600"; that is false for this case, and the review's separate suggestion (put the mechanics line in its own paragraph) was declined on the grounds that cap-aware packing made it unnecessary. Confirmed by reading the code path and by the probe: with any paragraph over 600 code points and 6 or fewer paragraphs, the stripped text differs from the input.
**Fix:** Make the over-cap case go through the same re-chunking. For example, in `packParagraphs`, treat "any part longer than the cap" like "too many parts":
```ts
function packParagraphs(paragraphs: string[], max: number): string[] {
  const merged = mergeSmallestPairs(paragraphs, max, true);
  const overCap = merged.some((p) => cpLength(p) > MAX_SEGMENT_CHARS);
  if (merged.length <= max && !overCap) return merged;
  const total = paragraphs.reduce((n, p) => n + cpLength(p) + 2, 0);
  if (total > max * MAX_SEGMENT_CHARS) return mergeSmallestPairs(merged, max, false);
  for (const by of ['sentence', 'word', 'char'] as const) {
    const chunks = fillChunks(packUnits(paragraphs, by), max);
    if (chunks) return chunks;
  }
  return mergeSmallestPairs(merged, max, false);
}
```
(Keep the existing `clamps each paragraph` test for a single 800-character paragraph only if that is still intended; otherwise it should now expect two segments with no loss.) Independently, the cheap and robust complement is to emit the mechanics line as its own paragraph (`\n\n` before `abilityMechanicsLine`) so it is never the tail of a long description. Add a test with a 700-character ability description that asserts the mechanics line survives in `flattenSegments`.

## Info

Carried forward unchanged from iteration 1 (not part of the fix scope, none re-verified as fixed):

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

## Deferred (owner decision, not open)

- WR-07: `scripts/llm/golden_rules.mjs` `FIRST_PERSON` false-positives on the noun "mine". Owner decision G3, keep strict.

---

_Reviewed: 2026-10-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
