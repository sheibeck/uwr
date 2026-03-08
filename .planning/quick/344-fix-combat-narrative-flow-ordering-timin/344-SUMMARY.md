---
quick: 344
title: "Fix combat narrative flow - ordering, timing, and LLM narration accuracy"
completed: "2026-03-08"
duration: "2min"
tasks_completed: 2
tasks_total: 2
files_modified:
  - src/App.vue
  - spacetimedb/src/data/llm_prompts.ts
  - spacetimedb/src/helpers/combat_narration.ts
commits:
  - hash: 95b89be
    message: "fix(quick-344): remove duplicate status bars and COMBAT ENDED marker"
  - hash: d7741cf
    message: "fix(quick-344): add ability name constraints to LLM prompt and round labels to narration"
---

# Quick Task 344: Fix Combat Narrative Flow Summary

**One-liner:** Removed duplicate HP bars on round transitions, eliminated premature COMBAT ENDED marker, added LLM ability name constraints, and prefixed round narrations with round labels.

## Changes Made

### Task 1: Fix client-side combat event injection (App.vue)

- Status bars (`combatStatusMessage`) now only injected for Round 1; subsequent rounds already show HP via the round summary from the resolved state
- Removed "COMBAT ENDED" marker injection -- server-side narration (victory/defeat) or "The System has lost interest" message serves as natural ending
- Combat end watcher still cleans up `lastInjectedRoundStart` and `lastInjectedSubmit` tracking refs

### Task 2: Fix LLM narration prompt and add round labels

- **System prompt** (`buildCombatNarrationPrompt`): Added "use the EXACT names provided in the user message, never invent new ability names" to the ability reference instruction
- **User prompt** (`buildCombatRoundUserPrompt`): Collects all unique ability names from player and enemy actions, appends an explicit constraint: "Use ONLY these exact ability names... Do NOT invent or rename abilities"
- **Round labels** (`handleCombatNarrationResult`): Round-type narrations now prefixed with `[Round N]` for temporal context when narration arrives late; intro/victory/defeat narrations have no prefix

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED

- [x] src/App.vue modified with correct round-1 guard and no COMBAT ENDED
- [x] spacetimedb/src/data/llm_prompts.ts modified with ability name constraints
- [x] spacetimedb/src/helpers/combat_narration.ts modified with round label prefix
- [x] Commit 95b89be exists
- [x] Commit d7741cf exists
