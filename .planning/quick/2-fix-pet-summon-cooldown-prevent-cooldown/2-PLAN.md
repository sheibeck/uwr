---
phase: quick
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useHotbar.ts
autonomous: true
must_haves:
  truths:
    - "Pet summon abilities used outside combat do not show a cooldown timer on the hotbar"
    - "Pet summon abilities used outside combat still display the server feedback message (Pets can only be summoned in combat)"
    - "Pet summon abilities used in active combat still work normally with cooldown prediction"
  artifacts:
    - path: "src/composables/useHotbar.ts"
      provides: "Client-side pet summon combat gate in onHotbarClick"
      contains: "PET_SUMMON_KEYS"
  key_links:
    - from: "src/composables/useHotbar.ts"
      to: "spacetimedb/src/reducers/items.ts"
      via: "Matching pet summon ability key set"
      pattern: "shaman_spirit_wolf|beastmaster_call_beast|necromancer_bone_servant|summoner_earth_familiar"
---

<objective>
Fix pet summon abilities showing a false client-side cooldown when used outside of combat.

Purpose: When a player clicks a pet summon ability (Spirit Wolf, Bone Servant, Call Beast, Earth Familiar) while not in combat, the server correctly rejects it with "Pets can only be summoned in combat" but the client's `runPrediction` has already set a local 20-second cooldown prediction. The ability button appears locked for 20 seconds even though the server never applied a cooldown. The fix gates `runPrediction` so it is not called for pet summon abilities when not in active combat.

Output: Updated `useHotbar.ts` with pet summon combat guard.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/useHotbar.ts
@spacetimedb/src/reducers/items.ts (lines 364-394 for server-side petSummons set and combat check)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add pet summon combat guard to onHotbarClick</name>
  <files>src/composables/useHotbar.ts</files>
  <action>
In `src/composables/useHotbar.ts`:

1. Add a constant set of pet summon ability keys near the top of the file (after the `COOLDOWN_SKEW_SUPPRESS_MICROS` constant, around line 43). This mirrors the server-side `petSummons` set in `items.ts` (lines 364-368):

```typescript
const PET_SUMMON_KEYS = new Set([
  'shaman_spirit_wolf',
  'necromancer_bone_servant',
  'beastmaster_call_beast',
  'summoner_earth_familiar',
]);
```

2. In the `onHotbarClick` function (currently around line 270), add a guard BEFORE `runPrediction` is called (line 278). Insert between the existing `activeCombat && !canActInCombat` guard (line 277) and `runPrediction` (line 278):

```typescript
// Pet summons require active combat — skip prediction + reducer call to prevent false cooldown
if (!activeCombat.value && PET_SUMMON_KEYS.has(slot.abilityKey)) return;
```

This prevents BOTH `runPrediction` (which sets the false local cooldown) AND the `useAbility` reducer call (which the server would reject anyway). The button click is simply ignored when not in combat, matching the server's behavior without showing a misleading cooldown timer.

Do NOT add a toast/notification on the client — the server already sends a private event "Pets can only be summoned in combat" via `appendPrivateEvent` if the reducer call reaches it. The client-side guard is a UX optimization to prevent the false cooldown; the server guard is the authoritative check.

Note: An alternative approach would be to still call the reducer (so the user sees the server error message) but skip `runPrediction`. However, since the server error message comes through the event feed regardless, and the primary issue is the false cooldown, blocking the entire click is cleaner and avoids an unnecessary network round-trip.
  </action>
  <verify>
1. Read `src/composables/useHotbar.ts` and confirm:
   - `PET_SUMMON_KEYS` constant exists with all 4 ability keys
   - Guard `if (!activeCombat.value && PET_SUMMON_KEYS.has(slot.abilityKey)) return;` exists in `onHotbarClick` before `runPrediction`
2. Verify no TypeScript errors: the file uses standard Set/string operations, no new imports needed
  </verify>
  <done>Pet summon abilities clicked outside combat are silently blocked on the client, preventing the false 20-second cooldown prediction while the server's combat check remains the authoritative guard.</done>
</task>

</tasks>

<verification>
- `PET_SUMMON_KEYS` matches server-side `petSummons` set in `items.ts` (same 4 keys)
- Guard placement is before `runPrediction` call in `onHotbarClick`
- Guard condition `!activeCombat.value` mirrors server's `!combatId` check
- No other code paths (keyboard shortcuts, etc.) bypass the guard — all ability use flows through `onHotbarClick`
</verification>

<success_criteria>
- Pet summon abilities clicked outside combat do NOT trigger `runPrediction` (no false cooldown timer)
- Pet summon abilities clicked outside combat do NOT call `useAbility` reducer (no wasted server round-trip)
- Pet summon abilities clicked inside active combat continue to work normally with cooldown prediction
- Non-pet-summon combat abilities are unaffected by the change
</success_criteria>

<output>
After completion, create `.planning/quick/2-fix-pet-summon-cooldown-prevent-cooldown/2-SUMMARY.md`
</output>
