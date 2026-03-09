# Quick Task 381: Remove LLM combat narration — Summary

## Changes

### combat.ts
- Removed `triggerPostCombatSummary` function (built RoundEventSummary and called triggerCombatNarration)
- Removed both call sites: victory (line 2787) and defeat (line 2800)
- Removed unused import of `triggerCombatNarration` and `RoundEventSummary` from combat_narration

### What remains
- `combat_narration.ts` helper file still exists (not deleted — may be useful later or has other callers)
- Static intro messages from quick-370 still fire at combat start
- All combat logging from quick-378 (abilities, HoTs, DoTs, effects) remains
- Combat results (XP, loot, death) still logged via existing handlers

### Rationale
LLM combat narration was too slow — blocked user input while waiting for generation. The detailed combat log (auto-attacks, abilities, effects) provides sufficient feedback without the narrative delay.
