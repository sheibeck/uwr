---
phase: quick-243
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useHotbar.ts
autonomous: true
requirements:
  - QUICK-243
must_haves:
  truths:
    - "Clicking a hotbar slot with insufficient mana shows 'Not enough mana' immediately, no server round-trip"
    - "Clicking a hotbar slot with insufficient stamina shows 'Not enough stamina' immediately, no server round-trip"
    - "Abilities with no resource cost (free) are unaffected by the check"
    - "The server-side resource check remains unchanged as the authoritative source of truth"
  artifacts:
    - path: "src/composables/useHotbar.ts"
      provides: "Client-side resource pre-check in onHotbarClick"
      contains: "Not enough mana"
  key_links:
    - from: "onHotbarClick"
      to: "addLocalEvent"
      via: "resource cost guard before useAbility call"
      pattern: "addLocalEvent.*mana|addLocalEvent.*stamina"
---

<objective>
Add a client-side resource (mana/stamina) pre-check in `onHotbarClick` so that casting an ability the character cannot afford shows feedback immediately — without waiting for the server to reject it.

Purpose: Eliminate the round-trip delay between clicking a hotbar slot and seeing "Ability failed: Not enough mana/stamina". The check is a UX guard only; the server remains authoritative.

Output: `src/composables/useHotbar.ts` with a resource guard inserted just before `runPrediction` / `useAbility`.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add resource pre-check to onHotbarClick</name>
  <files>src/composables/useHotbar.ts</files>
  <action>
In `onHotbarClick` (around line 380), just before the `runPrediction(slot.abilityKey)` call, insert a resource affordability check using the same cost formulas already used in `hotbarTooltipItem`.

The `ability` variable is already in scope at that point (line 344: `const ability = abilityLookup.value.get(slot.abilityKey)`). Use it to derive `resource`, `level`, and `power` — mirroring exactly what `hotbarTooltipItem` does:

```typescript
// Client-side resource pre-check (server remains authoritative)
const resource = ability?.resource ?? '';
const power = ability?.power ?? 0n;
const level = ability?.level ?? slot.level ?? 0n;
const char = selectedCharacter.value;
if (resource === 'mana') {
  const cost = 4n + level * 2n + power;
  if ((char.mana ?? 0n) < cost) {
    addLocalEvent?.('blocked', 'Not enough mana.');
    return;
  }
} else if (resource === 'stamina') {
  const cost = 2n + power / 2n;
  if ((char.stamina ?? 0n) < cost) {
    addLocalEvent?.('blocked', 'Not enough stamina.');
    return;
  }
}
```

Insert this block immediately before the existing line `runPrediction(slot.abilityKey);` (currently around line 380). Do not modify any other code, and do not alter the `hotbarTooltipItem` function.

Note: `selectedCharacter.value` is already confirmed non-null at the top of `onHotbarClick` (line 323), so no additional null guard is needed for the char reference itself.
  </action>
  <verify>
Run `npm run type-check` (or `vue-tsc --noEmit`) from the project root. No TypeScript errors should be introduced.

Manually test in the browser: equip an ability that costs mana, drain mana below its cost via combat, then click the hotbar slot — confirm "Not enough mana." appears in the event log immediately without a server round-trip delay.
  </verify>
  <done>
"Not enough mana." or "Not enough stamina." appears in the event log the instant the hotbar slot is clicked when the character cannot afford the ability. The `use_ability` reducer is NOT called (no network request made). Free abilities are unaffected. TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
- `npm run type-check` passes with no new errors
- Clicking an unaffordable mana ability shows "Not enough mana." instantly
- Clicking an unaffordable stamina ability shows "Not enough stamina." instantly
- Clicking an affordable ability still fires normally
- Free abilities (resource = '' or other) are unaffected
</verification>

<success_criteria>
Client-side resource guard is in place in `onHotbarClick`. The check fires before `runPrediction` and `useAbility`, produces immediate feedback via `addLocalEvent`, and returns early without calling the server reducer when the character cannot afford the ability.
</success_criteria>

<output>
After completion, create `.planning/quick/243-client-side-mana-check-before-cast-to-pr/243-01-SUMMARY.md` following the summary template.
</output>
