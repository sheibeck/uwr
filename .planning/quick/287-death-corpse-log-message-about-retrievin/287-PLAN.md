---
phase: quick
plan: 287
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/corpse.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "When a level 5+ character dies and a corpse is created, the log shows a narratively immersive message about the corpse holding their belongings"
    - "The message clearly communicates the 30-day retrieval window"
    - "Characters below level 5 (no corpse created) do NOT receive the corpse message"
  artifacts:
    - path: "spacetimedb/src/helpers/corpse.ts"
      provides: "Corpse creation with log message"
      contains: "appendPrivateEvent"
  key_links:
    - from: "spacetimedb/src/helpers/corpse.ts"
      to: "helpers/events.ts"
      via: "appendPrivateEvent"
      pattern: "appendPrivateEvent.*corpse"
---

<objective>
Add a narratively immersive log message when a character dies and leaves a corpse, informing them that their belongings remain on the corpse and must be retrieved within 30 days.

Purpose: Players currently get no feedback about their corpse being created or the 30-day decay timer. This leaves them unaware that their items are at risk.
Output: Updated `createCorpse` function that emits a private event log message on corpse creation.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/corpse.ts
@spacetimedb/src/helpers/events.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add corpse creation log message to createCorpse</name>
  <files>spacetimedb/src/helpers/corpse.ts</files>
  <action>
In `createCorpse()`, after the item transfer loop completes (after the `for (const item of inventoryItems)` block, around line 59), add a log message using `appendPrivateEvent`.

First, look up the location name:
```typescript
const location = ctx.db.location.id.find(character.locationId);
const locationName = location?.name ?? 'an unknown place';
```

Then count how many items were transferred (use `inventoryItems.length` minus skipped duplicates, or simply count transferred items in the loop).

Emit a narratively immersive private event. The message should:
- Be written in a dark fantasy / RPG narrative tone (matching the game's style — corpses, death, grim)
- Mention that their mortal remains lie at the location
- State clearly that their belongings can be retrieved from the corpse
- Explicitly mention the 30-day window before the corpse decays and items are lost forever
- Use event kind `'system'` (consistent with other corpse-related messages in this file)

Example message (adapt for tone):
```
"Your body crumbles to the ground at {locationName}. Your belongings remain with your corpse — return to claim them before thirty days pass, or they will be lost to decay."
```

If `inventoryItems.length === 0` (no items transferred, e.g. inventory was empty), use a shorter message without the retrieval warning since there's nothing to retrieve:
```
"Your body falls at {locationName}, but you carried nothing of value."
```

Only emit the message when `createCorpse` actually creates/updates a corpse (i.e., the function doesn't return null). The null return for level < 5 already exits early, so placing the log after the item loop is safe.

Do NOT change any other behavior in the function — only add the log message.
  </action>
  <verify>
1. `npx tsc --noEmit --project spacetimedb/tsconfig.json` compiles without errors
2. Read `spacetimedb/src/helpers/corpse.ts` and confirm `appendPrivateEvent` is called after item transfer with a message mentioning 30 days
3. Confirm the message is NOT emitted when `character.level < 5n` (early return prevents it)
  </verify>
  <done>
When a level 5+ character dies and createCorpse runs, the player's log shows a narrative message about their corpse at the death location with a clear 30-day retrieval warning. No message when inventory is empty (or a shorter variant). No other behavior changed.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- `appendPrivateEvent` call exists in `createCorpse` with corpse/30-day messaging
- Level < 5 characters still return null with no message
- Empty inventory case handled gracefully
</verification>

<success_criteria>
Dying at level 5+ with inventory items produces a narratively immersive log message mentioning the corpse location and 30-day decay window. No regressions to existing corpse logic.
</success_criteria>

<output>
After completion, create `.planning/quick/287-death-corpse-log-message-about-retrievin/287-SUMMARY.md`
</output>
