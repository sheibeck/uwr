---
created: 2026-10-09T16:10:00.000Z
title: The Keeper sums up a fight you fled, noting your cowardice
area: general
files:
  - spacetimedb/src/reducers/combat.ts:2646-2686 (resolveFleeChoice; success only logs "You successfully flee.")
  - spacetimedb/src/reducers/combat.ts:1935,2038 (the outro runs only on victory and defeat)
  - spacetimedb/src/helpers/combat_narration.ts:202-251 (buildCombatOutroSummary / enqueueCombatOutroNarration, narrativeType 'victory' | 'defeat')
  - spacetimedb/src/data/llm_layers.ts:1109-1110 (round summaries already know fled / fleeSuccess)
---

## Problem

Owner, 2026-10-09: "when you flee combat, the keeper should definitely summarize the combat by noting your cowardice."

Today a successful flee removes you from the fight (aggro, pets, cooldowns, choices, participant row) and logs only the system lines "You successfully flee." / "{name} successfully flees." No Keeper outro runs: `enqueueCombatOutroNarration` is called only from the victory and defeat paths, and its `narrativeType` is only `'victory' | 'defeat'`. So a fled fight ends without any narration.

## Solution

TBD (discuss with the owner). Notes:
- Add a `'fled'` outro type: when a character escapes, the Keeper narrates a short summary of the fight so far that wryly notes the retreat (the Keeper's sardonic voice fits here, unlike the action-oriented victory outro the owner asked for in `2026-10-07-combat-outro-tells-how-the-fight-unfolded.md`; reuse that todo's fight digest so the summary knows what happened before the escape).
- Decide who gets it: only the one who fled (private), or the group too, and what happens when the whole party flees (the fight ends; one outro for everyone) versus one member fleeing while others keep fighting (a private line for the fleer only, so the fight's feed is not interrupted).
- A failed flee stays a system line (no extra call).
- Second person, no first person, gendered pronouns for people, no numbers or HP, one segment. Keep it gently mocking, never cruel (the owner can tune the tone).
- **Prompt wording needs the owner's explicit approval of the exact text** (new route block or a branch of the outro block); re-check the golden tests and the `claude_request` snapshot. One more paid call per successful flee; it goes through the existing narration budget and no-retry rules. No paid calls in tests.
Candidate home: Phase 51.3.2 Wind-Up (combat rework) alongside the victory-outro todo, or wherever that outro todo lands.
