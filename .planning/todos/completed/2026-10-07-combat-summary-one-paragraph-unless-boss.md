---
created: 2026-10-07T01:20:00Z
title: Combat summary is one short paragraph unless the fight had a boss or named foe
area: llm
files:
  - spacetimedb/src/data/llm_layers.ts:873-889
  - spacetimedb/src/helpers/combat_narration.ts:227
---

## Problem

On 2026-10-07 the owner said: "Unless we are fighting a boss or elite mob, one paragraph of combat summary is preferable. I'm seeing 2 now. So, for special combats, narrate longer, but for standard ones just a one short paragraph."

`combatOutroLengthLine` (`llm_layers.ts:880-889`) has three tiers today:
- Up to 3 rounds (`SHORT_FIGHT_MAX_ROUNDS = 3n`): exactly one segment of 2 or 3 sentences.
- Longer fights: **at most 2 segments**. This is what the owner sees.
- A boss or named foe (`fightBossOrNamed`): at most 3 segments.

"Elite" is not a mechanic yet. The special-fight flag is `fightBossOrNamed` (`combat_narration.ts:227`).

## Solution

This is a prompt text change, so it needs the owner's approval of the exact wording.
- **Standard fights**, at any length: `Length: this was a standard fight ({rounds}). Write exactly one short narration segment of 2 or 3 sentences.`
- **Boss or named foe**: unchanged, `at most 3 narration segments`.
- Remove the "longer fight" tier and `SHORT_FIGHT_MAX_ROUNDS` if nothing else uses them.
- Update the `combatOutroLengthLine` tests and any prompt snapshot.
- If elite enemies are added later, they join the special tier through the same flag.
