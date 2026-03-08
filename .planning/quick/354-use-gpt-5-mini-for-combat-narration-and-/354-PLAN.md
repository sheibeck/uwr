---
phase: quick-354
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat_narration.ts
autonomous: true
requirements: [QUICK-354]
must_haves:
  truths:
    - "Each combat encounter consumes exactly 1 LLM credit (intro), not 2"
    - "Combat outro (victory/defeat) narration still fires but does not cost a credit"
    - "Model remains gpt-5-mini for combat narration (already the case)"
  artifacts:
    - path: "spacetimedb/src/helpers/combat_narration.ts"
      provides: "Budget-consolidated combat narration"
      contains: "incrementBudget"
  key_links:
    - from: "spacetimedb/src/helpers/combat_narration.ts"
      to: "spacetimedb/src/helpers/llm.ts"
      via: "incrementBudget call"
      pattern: "incrementBudget"
---

<objective>
Consolidate combat narration to 1 LLM credit per combat instead of 2.

Purpose: Currently each combat costs 2 credits (1 for intro, 1 for outro). The user wants 1 credit per combat to stretch the daily budget further. The model is already gpt-5-mini (fastest available).

Output: Modified combat_narration.ts that only charges budget for the intro narration. Outro (victory/defeat) still fires but is "free" -- it checks budget but does not decrement it.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/combat_narration.ts
@spacetimedb/src/helpers/llm.ts
@spacetimedb/src/data/combat_constants.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Skip budget increment for outro narration</name>
  <files>spacetimedb/src/helpers/combat_narration.ts</files>
  <action>
In the `triggerCombatNarration` function (around line 142), make the `incrementBudget` call conditional on the narrative type. Only increment for 'intro' narration. For 'victory' and 'defeat' (outro), skip the increment so the outro narration is free.

The budget CHECK (line 127-139) should still happen for all types -- if the player has zero budget, skip narration entirely. But the CHARGE only applies to intro.

Change this:
```typescript
// Increment budget for the charged player
incrementBudget(ctx, chargedPlayerIdentity);
```

To:
```typescript
// Only charge budget for intro narration (1 credit per combat, not 2)
if (events.narrativeType === 'intro') {
  incrementBudget(ctx, chargedPlayerIdentity);
}
```

Also update the comment at the top of triggerCombatNarration to document: "Budget is charged once per combat (on intro only). Outro narration is free if budget allows."
  </action>
  <verify>
    <automated>cd C:/projects/uwr && grep -A2 "incrementBudget" spacetimedb/src/helpers/combat_narration.ts</automated>
  </verify>
  <done>incrementBudget is only called for intro narration type, outro narrations do not consume a credit</done>
</task>

</tasks>

<verification>
- grep confirms incrementBudget is wrapped in an intro-only conditional
- No other files need changes (model is already gpt-5-mini, proxy passes model through)
</verification>

<success_criteria>
- Combat intro narration costs 1 credit
- Combat outro narration costs 0 credits
- Total per combat: 1 credit (down from 2)
- Model remains gpt-5-mini (no change needed)
</success_criteria>

<output>
After completion, create `.planning/quick/354-use-gpt-5-mini-for-combat-narration-and-/354-SUMMARY.md`
</output>
