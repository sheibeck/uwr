---
created: 2026-10-07T00:00:00Z
title: Combat outro tells how the fight unfolded from the abilities used
area: general
files:
  - spacetimedb/src/helpers/combat_narration.ts:197-229
  - spacetimedb/src/data/llm_layers.ts:498
  - spacetimedb/src/data/llm_layers.ts:873-905
---

## Problem

The owner, 2026-10-07 (verbatim):

> This is pretty common pattern for a combat summary:
> Eight rounds it took, which is a long time to spend negotiating with something that wears its skeleton on the outside and its dinner on the inside. The Crustback Scavenger ended the way scavengers do, face down in the water it had been picking through, and the weir went on dripping as though nothing had been decided. You stand there wet and still in possession of all your parts, which is the only review a victory ever gets.
>
> I would prefer a more narrative story of how the combat unfolded based on the abilities that were used by both sides. Not exactly a blow-by-blow retelling, but a summary of how the combat went down. Something more fun and action oriented.

Root cause (code read 2026-10-07, no LLM call made):
- The outro prompt gets no record of what happened in the fight. `buildCombatOutroSummary` (`combat_narration.ts`) sends `playerActions: []`, `enemyActions: []` and `effectsApplied: []`. `buildCombatOutroVolatile` (`llm_layers.ts`) only lists the setting, enemies, fallen, survivors and the length line.
- The route block (`llm_layers.ts:498`) asks for "a brief narrative summary of the whole fight in a literary style… Be sardonic about a triumph". With nothing about the fight itself, the model writes wry aftermath about the round count and the setting.

## Solution

1. **Server data (no approval needed):** give the outro a fight digest built from the stored round rows: per side, the abilities used (names, how often, who used them on whom), the turning points (first blood, crits, near deaths, heals, buffs and debuffs that mattered, the killing blow and its ability), and the round count. Cap the list so the prompt stays small. Keep the existing ability-name allowlist ("Use ONLY these exact ability names"), so no ability is invented. Tests for the digest (deterministic, capped, both sides).
2. **Prompt wording (needs the owner's explicit approval of the exact text, SEG-03 / Keeper Bible rule):** change the outro instruction from a sardonic literary aftermath to a short, action-oriented story of how the fight went, built from the abilities both sides used. It should not be a round-by-round retelling. Keep the second person, no numbers or HP, the one-segment length for standard fights and up to 3 for bosses or named foes (142e5dcd), and gendered pronouns for people. Draft the new wording, show it to the owner, then ship. Re-check the golden tests and the `claude_request` snapshot after the change. No paid calls in tests; the golden run waits for the owner's go-ahead.
3. Fits with the pending todo `2026-10-06-combat-victory-summary-looks-like-three-keeper-lines.md` (group consecutive Keeper segments under one header).
