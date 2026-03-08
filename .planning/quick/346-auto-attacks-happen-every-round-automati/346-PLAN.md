---
phase: quick-346
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
  - src/composables/useCombat.ts
  - src/App.vue
autonomous: true
requirements: [QUICK-346]
must_haves:
  truths:
    - "Every player auto-attacks every round regardless of chosen action"
    - "Players choose ability or flee as their bonus action on top of auto-attack"
    - "Auto-attack is no longer a selectable action -- it happens automatically"
    - "Players who submit no action still auto-attack (timer expiry default)"
    - "Enemies retain existing behavior (ability + auto-attack for bosses, 1 action for standard)"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Modified resolveRound that always auto-attacks plus executes chosen action"
    - path: "src/composables/useCombat.ts"
      provides: "Removed Auto-attack option from action prompt, updated submit helpers"
    - path: "src/App.vue"
      provides: "Updated keyword click handler and action feedback text"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "processPlayerAutoAttackForRound"
      via: "Called for every active player every round unconditionally"
      pattern: "processPlayerAutoAttackForRound.*for.*of.*activeParticipants"
---

<objective>
Make auto-attacks happen every round automatically for all players. The player's chosen action (ability or flee) executes ON TOP of the automatic auto-attack, not instead of it.

Purpose: Combat feels more active -- players always deal baseline damage, and abilities/flee are bonus decisions layered on top. Removes the "wasted round" feeling of choosing auto-attack when abilities are on cooldown.

Output: Modified combat resolution where every player auto-attacks each round, plus the server no longer accepts `auto_attack` as a submitted action type. Client UI removes the Auto-attack option from the action prompt.
</objective>

<context>
@spacetimedb/src/reducers/combat.ts (lines 2315-2460 — resolveRound function)
@src/composables/useCombat.ts (lines 260-345 — action submission and prompt)
@src/App.vue (lines 1525-1557 — keyword click handler for combat actions)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Server — auto-attack every player every round, change action model</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
Modify the `resolveRound` function (around line 2316) to change the player action resolution flow:

1. **Remove `auto_attack` from valid actions in `submit_combat_action` reducer** (line 3085):
   Change `const validActions = ['ability', 'auto_attack', 'flee'];` to `const validActions = ['ability', 'flee'];`

2. **Change the default action for non-submitters**: In `resolveRound` where it fills in defaults for participants who didn't submit (around lines 2346-2356), instead of inserting an `auto_attack` action, simply skip them — they get no bonus action but will still auto-attack from step 4.

   Replace:
   ```
   for (const p of activeParticipants) {
     if (!actions.some((a: any) => a.characterId === p.characterId)) {
       const character = ctx.db.character.id.find(p.characterId);
       const targetId = character?.combatTargetEnemyId ??
         enemies.find((e: any) => e.currentHp > 0n)?.id;
       upsertCombatAction(ctx, combatId, p.characterId, round.roundNumber,
         'auto_attack', undefined, targetId);
     }
   }
   ```
   With: simply remove this block entirely. Non-submitters just don't have an action row — they still auto-attack from step 4.

3. **In the player action processing loop** (around lines 2362-2436), remove the `else` branch that calls `processPlayerAutoAttackForRound` for `auto_attack` action type (lines 2432-2435). The loop should now only process `flee` and `ability` actions. The else clause at line 2432 (`// Auto-attack`) should be removed.

4. **Add unconditional auto-attack for ALL active players AFTER the action loop** (after line 2436, before enemy actions at line 2438): Insert a new loop:
   ```typescript
   // ── Every active player auto-attacks every round ──
   for (const p of activeParticipants) {
     const character = ctx.db.character.id.find(p.characterId);
     if (!character || character.hp === 0n) continue;
     const participant = [...ctx.db.combat_participant.by_combat.filter(combatId)]
       .find((pp: any) => pp.characterId === character.id);
     if (!participant || participant.status !== 'active') continue;
     // Skip auto-attack for players who fled this round
     const action = allActions.find((a: any) => a.characterId === character.id);
     if (action?.actionType === 'flee') {
       const fledParticipant = [...ctx.db.combat_participant.by_combat.filter(combatId)]
         .find((pp: any) => pp.characterId === character.id);
       if (fledParticipant?.status === 'fled') continue;
     }
     processPlayerAutoAttackForRound(ctx, combat, character, participant, enemies, nowMicros);
   }
   ```
   Note: Players who successfully fled skip auto-attack. Players who FAILED to flee still auto-attack (they're still in combat). Players who used an ability ALSO auto-attack.

5. **Update the action confirmation message in `submit_combat_action`** (around line 3109-3112):
   Change the message for ability from `Action set: {ability}` to just `Action set: {ability} (+ auto-attack)`.
   Change the flee message to stay as-is (flee intent doesn't guarantee auto-attack since successful flee exits combat).

6. **Update the compact summary builder** (around lines 2634-2678): The summary lines section that handles `auto_attack` action type in the `allActions` loop (around line 2664-2678) should be removed since `auto_attack` will no longer appear in `allActions`. The auto-attack damage will appear from the unconditional auto-attack loop's own log messages (via `resolveAttack` inside `processPlayerAutoAttackForRound`).

7. **Fix `checkAllSubmittedAndResolve`**: This function (around line 2290) checks if all active participants have submitted. Since non-submitters no longer get a default action, the check should consider that having NO action is acceptable (the participant simply chose to only auto-attack). The timer expiry already handles this — when the timer fires, `resolveRound` is called regardless. But `checkAllSubmittedAndResolve` triggers early resolution when everyone HAS submitted. This is fine as-is since players who want to just auto-attack can let the timer expire. No change needed here.
  </action>
  <verify>
    <automated>cd spacetimedb && npx tsc --noEmit --skipLibCheck 2>&1 | head -30</automated>
  </verify>
  <done>
    - `auto_attack` removed from valid submitted action types
    - `resolveRound` calls `processPlayerAutoAttackForRound` for every active (non-fled) player every round
    - Player ability actions execute BEFORE the unconditional auto-attack
    - Flee attempts execute before auto-attack; successful flee skips auto-attack
    - No default `auto_attack` action inserted for non-submitters
  </done>
</task>

<task type="auto">
  <name>Task 2: Client — remove Auto-attack option, update UI text</name>
  <files>src/composables/useCombat.ts, src/App.vue</files>
  <action>
**In `src/composables/useCombat.ts`:**

1. **Remove `[Auto-attack]` from action prompt** (line 323): Delete `lines.push('  [Auto-attack]');`

2. **Remove `submitAutoAttack` function** (lines 281-283): Delete the function. Also remove it from the return object (line 1064).

3. **Update `actionPromptMessage`** (around line 299): Change the header from `'Choose your action:'` to `'Choose your action (auto-attack is automatic):'`

4. **Update action feedback text**: In the `appendPrivateEvent` call inside the `submit_combat_action` reducer on the server (Task 1 already handles server). On the client, the watch at App.vue line 1062 uses `myAction.value?.actionType` — remove the `auto_attack` case since it no longer exists. The remaining cases are `flee` and `ability`.

**In `src/App.vue`:**

1. **Remove auto-attack keyword handler** (lines 1527-1532): Delete the block:
   ```
   if (kwLower === 'auto-attack') {
     const enemy = combatEnemiesList.value.find((e: any) => e.hp > 0n);
     if (enemy) submitAutoAttack(enemy.id);
     return;
   }
   ```

2. **Remove `submitAutoAttack` from destructured imports** from `useCombat` (find where useCombat return values are destructured and remove `submitAutoAttack`).

3. **Update action submitted feedback** (lines 1067-1068): Remove the `auto_attack` ternary case. It should just be:
   ```typescript
   const actionDesc = myAction.value?.actionType === 'flee' ? 'Flee' :
     myAction.value?.actionType === 'ability' ? 'Ability' : 'Action';
   ```

4. **Add an informational line to the combat start event** or round header to indicate auto-attacks are automatic. This is optional and low-priority — the action prompt text change from useCombat handles the main communication.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit --skipLibCheck 2>&1 | head -30</automated>
  </verify>
  <done>
    - [Auto-attack] no longer appears in combat action prompt
    - Clicking ability or flee still works as before
    - Action prompt shows "(auto-attack is automatic)" hint
    - No TypeScript errors from removed submitAutoAttack references
  </done>
</task>

</tasks>

<verification>
1. Publish module locally: `spacetime publish uwr -p spacetimedb`
2. Generate bindings: `spacetime generate --lang typescript --out-dir src/module_bindings -p spacetimedb`
3. Start a combat encounter
4. Verify the action prompt shows abilities and Flee but NOT Auto-attack
5. Submit an ability — round resolves with BOTH the ability effect AND auto-attack damage
6. Let timer expire with no submission — round resolves with just auto-attack damage
7. Submit flee — if flee fails, player still auto-attacks; if flee succeeds, player exits combat
</verification>

<success_criteria>
- Players auto-attack every round without needing to select it
- Abilities and flee are bonus actions on top of auto-attacks
- Auto-attack option removed from UI
- Combat feels more active with consistent baseline damage output
</success_criteria>

<output>
After completion, create `.planning/quick/346-auto-attacks-happen-every-round-automati/346-SUMMARY.md`
</output>
