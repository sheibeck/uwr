---
phase: quick
plan: 261006-hpo
subsystem: server-prompt
tags: [llm, combat-narration, keeper, outro]
status: complete
key-files:
  modified:
    - spacetimedb/src/data/llm_layers.ts
    - spacetimedb/src/helpers/combat_narration.ts
    - spacetimedb/src/data/llm_layers.test.ts
    - spacetimedb/src/helpers/combat_narration.test.ts
    - spacetimedb/src/helpers/__snapshots__/claude_request.test.ts.snap
commits:
  - 7091bb47 feat(quick-261006-hpo): combat outro length scales with the fight
---

# Quick Task 261006-hpo: Short combat fights get short Keeper summaries

## One-liner

The combat victory/defeat outro now scales with the fight: a short fight (3 rounds or fewer, no boss or named foe) gets exactly one narration segment of 2 or 3 sentences, a longer fight at most 2 segments, a boss or named foe at most 3.

Owner approval: chat, 2026-10-06, "We need short fight summaries to be shorter". Only the outro length guidance changed; the Keeper Bible, other routes and other prompt text are untouched.

## What changed

- Stable route block (VICTORY/DEFEAT paragraph, `llm_layers.ts`): the closing sentence "Write the summary as narration segments in the same JSON shape." gains the tier guidance (exact text in the final report). "brief", the sardonic voice, the second person and the no-numbers rule are unchanged.
- Volatile outro text: one `Length:` line from the new exported `combatOutroLengthLine`, chosen by `roundNumber` and the new optional `RoundEventSummary.fightBossOrNamed`.
- `buildCombatOutroSummary` sets `fightBossOrNamed` using the same `isBossOrNamed` test as the big-moment picker (template `isBoss`, or a `named_enemy` of a participant). A lookup failure reads as false. The final round number was already in the summary.
- Tests: stable wording, each volatile tier (short, longer, boss/named, defeat, 0 and 1 round), the exact-text outro test, summary flag for boss, named, someone else's named foe, and survival through the job snapshot. The `claude_request` combat_narration body snapshot was updated deliberately (one paragraph).

## Deviations from Plan

None. No golden or characterization test pinned the old sentence apart from `claude_request.test.ts.snap` and the regex in `llm_layers.test.ts`, both updated. `scripts/llm` needed no change.

## Notes

- The stable route layer changed, so the cached prefix for `combat_narration` is rewritten once on first use after deploy.
- The "2-4 sentences" total in the shared Format paragraph is untouched; the short tier (2 or 3 sentences) sits inside it. Golden rules were not re-run (no paid calls, per the task).

## Gates

- Touched modules (`llm_layers`, `combat_narration`, `claude_request`): pass.
- Full spacetimedb suite excluding `measurement.results.test.ts`: 87 files, 3930 tests, all pass (includes `no_ripple_word.test.ts`).
- `scripts/llm` (vitest): 7 files pass, 486 tests pass; the only failing files are the baseline `call_log_report.test.mjs` and `proof_rules.test.mjs`.

## Self-Check: PASSED
