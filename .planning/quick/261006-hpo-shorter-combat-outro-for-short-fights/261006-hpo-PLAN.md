---
quick_id: 261006-hpo
type: quick
autonomous: true
---

# Quick Task 261006-hpo: Short combat fights get short Keeper summaries

Server prompt part of the todo `combat-victory-summary-looks-like-three-keeper-lines` (part 2). Owner approval: given in chat on 2026-10-06 ("We need short fight summaries to be shorter"). That approves changing the combat outro length guidance only. No other prompt, Keeper Bible or route text changes. No publish, no paid LLM call, no golden run.

## Task 1: Length scales with the fight

- `llm_layers.ts` (VICTORY/DEFEAT paragraph of the combat_narration route block): keep "brief", the sardonic voice, the second person and the no-numbers rule. Replace the closing "Write the summary as narration segments in the same JSON shape." with the same sentence plus the three tiers: a short fight is exactly one narration segment of 2 or 3 sentences, a longer fight at most 2 segments, a boss or named foe at most 3 segments; the user message states which tier applies.
- `buildCombatOutroVolatile` appends one `Length:` line chosen by the new exported `combatOutroLengthLine`: 3 rounds or fewer and no boss or named foe = short; otherwise a boss or named foe = up to 3 segments; otherwise = at most 2.
- `RoundEventSummary` gets an optional `fightBossOrNamed`. `buildCombatOutroSummary` (`combat_narration.ts`) sets it from the fight's enemies: template `isBoss`, or a `named_enemy` of a participant (the same `isBossOrNamed` test the big-moment picker uses). A lookup failure reads as false. The round number already rides in `roundNumber` (the final round).

## Task 2: Tests

- `llm_layers.test.ts`: the stable wording (full new sentence, plus the voice and no-numbers rules still present); the volatile `Length:` line for each tier (short, longer, boss/named, defeat, 0 and 1 round); the exact-text outro test carries the new line; round text has none.
- `combat_narration.test.ts`: the summary sets `fightBossOrNamed` and the tier line for a 3-round fight, a 5-round fight, a boss template, a named foe, a named foe of someone else, and the flag survives the job snapshot.
- `claude_request.test.ts.snap`: the combat_narration body snapshot is updated deliberately (stable layer changed, only the VICTORY/DEFEAT paragraph).

## Gate

`vitest run` for the touched modules, the full spacetimedb suite excluding `measurement.results.test.ts`, and the `scripts/llm` tests (baseline failures `call_log_report.test.mjs` and `proof_rules.test.mjs` ignored). `no_ripple_word.test.ts` stays green.
