---
phase: quick-348
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/data/combat_constants.ts
  - spacetimedb/src/helpers/combat_narration.ts
  - src/composables/useCombat.ts
  - src/components/CombatActionBar.vue
  - src/components/NarrativeConsole.vue
  - src/components/NarrativeInput.vue
  - src/App.vue
autonomous: true
requirements: []
---

<objective>
Remove the round-based combat system entirely and restore real-time combat. Auto-attacks fire continuously via the combat_loop scheduled reducer. Ability buttons and flee act immediately (not queued for round resolution). No inline combat HUD in the narrative stream. One LLM summary fires after combat ends.

Purpose: The round-based system (quick-342 through 346) added unnecessary complexity and broke the action-game feel. Real-time combat with a dedicated action bar (quick-347) is the target UX.
Output: Working real-time combat with ability buttons, auto-attacks on timers, and post-combat LLM summary.
</objective>

<context>
@.planning/STATE.md
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/helpers/combat.ts
@spacetimedb/src/helpers/combat_narration.ts
@spacetimedb/src/data/combat_constants.ts
@src/composables/useCombat.ts
@src/components/CombatActionBar.vue
@src/components/EnemyHud.vue
@src/components/NarrativeConsole.vue
@src/components/NarrativeInput.vue
@src/App.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Restore real-time combat_loop and immediate ability/flee on server</name>
  <files>
    spacetimedb/src/reducers/combat.ts
    spacetimedb/src/data/combat_constants.ts
    spacetimedb/src/helpers/combat_narration.ts
  </files>
  <action>
This task re-enables the real-time combat_loop and removes round-based combat from the server. The schema tables (CombatRound, CombatAction, CombatNarrative, RoundTimerTick) remain defined to avoid needing --clear-database, but we stop writing to them.

### 1. Re-enable combat_loop (spacetimedb/src/reducers/combat.ts ~line 3111)

Replace the empty `return;` body with a real-time tick that reuses existing ForRound functions. The old combat_loop (pre-round rewrite) looked like this and should be restored with the ForRound helpers:

```typescript
scheduledReducers['combat_loop'] = spacetimedb.reducer('combat_loop', { arg: CombatLoopTick.rowType }, (ctx, { arg }) => {
  const combat = ctx.db.combat_encounter.id.find(arg.combatId);
  if (!combat || combat.state !== 'active') return;

  const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
  const participants = [...ctx.db.combat_participant.by_combat.filter(combat.id)];
  const enemies = [...ctx.db.combat_enemy.by_combat.filter(combat.id)];

  // Mark newly dead participants
  markNewlyDeadParticipants(ctx, combat, participants);

  const activeParticipants = [...ctx.db.combat_participant.by_combat.filter(combat.id)]
    .filter((p: any) => p.status === 'active');

  const enemyName = enemies[0]?.displayName ??
    ctx.db.enemy_template.id.find(enemies[0]?.enemyTemplateId)?.name ?? 'enemy';

  // Process pending adds
  processPendingAdds(ctx, combat, participants, activeParticipants, enemyName, nowMicros);

  // Player auto-attacks (check nextAutoAttackAt timing)
  for (const p of activeParticipants) {
    const character = ctx.db.character.id.find(p.characterId);
    if (!character || character.hp === 0n) continue;
    const participant = ctx.db.combat_participant.id.find(p.id);
    if (!participant || participant.status !== 'active') continue;
    // Only auto-attack if nextAutoAttackAt has passed
    if (participant.nextAutoAttackAt > nowMicros) continue;
    processPlayerAutoAttackForRound(ctx, combat, character, participant, enemies, nowMicros);
    // Schedule next auto-attack based on weapon speed
    const weapon = deps.getEquippedWeaponStats(ctx, character.id);
    ctx.db.combat_participant.id.update({
      ...participant,
      nextAutoAttackAt: nowMicros + weapon.speed,
    });
  }

  // Enemy actions (abilities + auto-attacks, check nextAutoAttackAt timing)
  const refreshedEnemies = [...ctx.db.combat_enemy.by_combat.filter(combat.id)];
  const refreshedActive = [...ctx.db.combat_participant.by_combat.filter(combat.id)]
    .filter((p: any) => p.status === 'active');

  for (const enemy of refreshedEnemies) {
    if (enemy.currentHp === 0n) continue;
    if (enemy.nextAutoAttackAt > nowMicros) continue;
    const template = ctx.db.enemy_template.id.find(enemy.enemyTemplateId);
    if (!template) continue;
    const usedAbility = tryEnemyAbilityForRound(ctx, combat, enemy, template, refreshedActive, nowMicros);
    if (!usedAbility) {
      processEnemyAutoAttackForRound(ctx, combat, enemy, template, participants, refreshedActive, nowMicros);
    }
    // Schedule next enemy auto-attack
    const speed = deps.getEnemyAttackSpeed(template);
    ctx.db.combat_enemy.id.update({
      ...ctx.db.combat_enemy.id.find(enemy.id)!,
      nextAutoAttackAt: nowMicros + speed,
    });
  }

  // Pet combat
  const livingEnemies = [...ctx.db.combat_enemy.by_combat.filter(combat.id)]
    .filter((e: any) => e.currentHp > 0n);
  processPetCombat(ctx, combat, livingEnemies, nowMicros);

  // Retarget characters whose target died
  const aliveEnemyIds = new Set(livingEnemies.map((e: any) => e.id));
  for (const p of participants) {
    const character = ctx.db.character.id.find(p.characterId);
    if (!character) continue;
    if (character.combatTargetEnemyId && !aliveEnemyIds.has(character.combatTargetEnemyId)) {
      ctx.db.character.id.update({
        ...character,
        combatTargetEnemyId: livingEnemies[0]?.id ?? undefined,
      });
    }
  }

  // Victory check
  if (livingEnemies.length === 0) {
    // Trigger post-combat summary LLM narration (see step 4 below)
    triggerPostCombatSummary(ctx, combat, enemies, participants, 'victory');
    handleVictory(ctx, combat, enemies, participants, activeParticipants, enemyName, nowMicros);
    return;
  }

  // Defeat check
  let stillActive = false;
  for (const p of ctx.db.combat_participant.by_combat.filter(combat.id)) {
    if (p.status !== 'active') continue;
    const character = ctx.db.character.id.find(p.characterId);
    if (character && character.hp > 0n) { stillActive = true; break; }
  }
  if (!stillActive) {
    triggerPostCombatSummary(ctx, combat, enemies, participants, 'defeat');
    handleDefeat(ctx, combat, enemies, participants, enemyName, nowMicros);
    return;
  }

  // Schedule next tick
  scheduleCombatTick(ctx, combat.id);
});
```

**IMPORTANT**: The `processPlayerAutoAttackForRound` function works fine for real-time -- it resolves a single auto-attack for a character. The key difference from round-based is we now check `nextAutoAttackAt` timing before calling it, and reschedule after.

### 2. Modify startCombatForSpawn (~line 159)

- Remove the call to `createFirstRound(ctx, combat.id, !!groupId)` at line 233
- Remove the intro narration trigger block (lines 235-262) that depends on rounds
- Add `scheduleCombatTick(ctx, combat.id)` to start the combat loop instead

### 3. Make flee_combat work immediately (~line 1213)

The `flee_combat` reducer currently checks for a round and submits a round action if in action_select. Remove the round-based branch (lines 1220-1231). Keep the fallback real-time flee logic that follows. If there's no real-time flee logic after the round block, add one:
- Calculate flee chance via `calculateFleeChance`
- Use deterministic seed: `(nowMicros + character.id * 17n) % 100n`
- Success: update participant status to 'fled', log messages
- Failure: log "flee attempt fails"

### 4. Create a use_ability_realtime reducer

Add a new reducer `use_ability_realtime` (right after `flee_combat`) that immediately executes an ability:

```typescript
spacetimedb.reducer('use_ability_realtime', {
  characterId: t.u64(),
  abilityTemplateId: t.u64(),
  targetEnemyId: t.u64().optional(),
  targetCharacterId: t.u64().optional(),
}, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const combatId = activeCombatIdForCharacter(ctx, character.id);
  if (!combatId) return failCombat(ctx, character, 'Not in combat');

  const ability = ctx.db.ability_template.id.find(args.abilityTemplateId);
  if (!ability || ability.characterId !== character.id) {
    return failCombat(ctx, character, 'Ability not available');
  }

  // Check cooldown
  const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
  const cd = [...ctx.db.ability_cooldown.by_character.filter(character.id)]
    .find((row: any) => row.abilityTemplateId === args.abilityTemplateId);
  if (cd && cd.startedAtMicros + cd.durationMicros > nowMicros) {
    return failCombat(ctx, character, `${ability.name} is on cooldown`);
  }

  // Check resource cost
  // (resource checking was handled in resolveRound's executeAbilityAction; keep that logic)

  // Execute immediately
  try {
    executeAbilityAction(ctx, {
      actorType: 'player',
      actorId: character.id,
      combatId,
      abilityKey: ability.name,
      targetEnemyId: args.targetEnemyId,
      targetCharacterId: args.targetCharacterId,
      abilityTemplateId: args.abilityTemplateId,
    });
    // Set cooldown
    const cooldownDuration = abilityCooldownMicros(ctx, args.abilityTemplateId);
    if (cooldownDuration > 0n) {
      for (const cdRow of ctx.db.ability_cooldown.by_character.filter(character.id)) {
        if (cdRow.abilityTemplateId === args.abilityTemplateId) {
          ctx.db.ability_cooldown.id.delete(cdRow.id);
        }
      }
      ctx.db.ability_cooldown.insert({
        id: 0n,
        characterId: character.id,
        abilityTemplateId: args.abilityTemplateId,
        startedAtMicros: nowMicros,
        durationMicros: cooldownDuration,
      });
    }
  } catch (e) {
    failCombat(ctx, character, 'Ability failed');
  }
});
```

### 5. Add triggerPostCombatSummary function

Add a helper function (inside registerCombatReducers, near handleVictory/handleDefeat) that fires ONE post-combat LLM narration:

```typescript
const triggerPostCombatSummary = (
  ctx: any, combat: any, enemies: any[], participants: any[],
  outcome: 'victory' | 'defeat'
) => {
  const location = ctx.db.location.id.find(combat.locationId);
  const enemyNames = enemies.map((e: any) => e.displayName);
  const playerNames = participants.map((p: any) => {
    const c = ctx.db.character.id.find(p.characterId);
    return c?.name || 'Unknown';
  });
  const hpSummary: RoundEventSummary['participantHpSummary'] = [];
  for (const p of participants) {
    const c = ctx.db.character.id.find(p.characterId);
    if (c) hpSummary.push({ name: c.name, hp: c.hp, maxHp: c.maxHp, isEnemy: false });
  }
  for (const e of enemies) {
    hpSummary.push({ name: e.displayName, hp: e.currentHp, maxHp: e.maxHp, isEnemy: true });
  }
  const events: RoundEventSummary = {
    combatId: combat.id,
    roundNumber: 0n,
    narrativeType: outcome,
    playerActions: [],
    enemyActions: [],
    effectsApplied: [],
    effectsExpired: [],
    deaths: enemies.filter((e: any) => e.currentHp === 0n).map((e: any) => e.displayName),
    nearDeathNames: [],
    hasCrit: false,
    hasKill: outcome === 'victory',
    hasNearDeath: false,
    participantHpSummary: hpSummary,
    locationName: location?.name || 'an unknown place',
    enemyNames,
    playerNames,
  };
  // Use triggerCombatNarration but pass null for round (it only needs combat for narrationCount)
  // Create a minimal fake round object since triggerCombatNarration expects one
  triggerCombatNarration(ctx, combat, { narrationCount: 0n, roundNumber: 0n }, events);
};
```

### 6. Remove round creation/resolution code paths

- Remove or comment out the `resolveRound` function (large block ~lines 2316-2709) -- it is no longer called
- Remove or comment out `checkAllSubmittedAndResolve` (~line 2287-2312)
- Remove or comment out `getCurrentRound` (~line 2246-2264)
- Remove or comment out `upsertCombatAction` (~line 2267-2285)
- Remove or comment out the `submit_combat_action` reducer (~lines 3044-3090)
- Remove or comment out the `resolve_round_timer` scheduled reducer (~lines 3094-3107)
- Remove the compact mechanical round summary block inside resolveRound (it goes away with resolveRound)
- Keep `processPlayerAutoAttackForRound`, `processEnemyAutoAttackForRound`, `tryEnemyAbilityForRound`, `tickEffectsForRound`, `processPetCombat`, `processPendingAdds` -- these are still used by combat_loop

### 7. Remove per-round narration from handleVictory/handleDefeat

In `handleVictory` (~line 2598-2601) and `handleDefeat` (~line 2614-2618), remove the calls to `triggerCombatNarration` with victory/defeat events since `triggerPostCombatSummary` handles this now (called before handleVictory/handleDefeat in combat_loop).

### 8. Update combat_constants.ts

Remove or mark as deprecated the round-specific constants:
- `ROUND_TIMER_MICROS` (no longer used)
- `SOLO_TIMER_MICROS` (no longer used)
- `EFFECT_ROUND_CONVERSION_MICROS` (no longer used -- effects tick every combat_loop tick)
- `MIN_EFFECT_ROUNDS` (no longer used)
- `MAX_COMBAT_NARRATIONS` (keep -- still used for post-combat narration budget)
- `NARRATION_BUDGET_THRESHOLD` (keep)

### 9. Update tickEffectsForRound to tick by time

Currently `tickEffectsForRound` ticks effects "once per round." For real-time, it should be called every combat_loop tick. The function decrements `roundsRemaining` on effects. Since we're calling it every 1s now instead of every 30s, either:
- Option A: Change effect durations to be time-based (big refactor -- avoid)
- Option B: Only tick effects every N seconds (simpler -- add a timestamp check)

**Use Option B**: In the combat_loop, only call `tickEffectsForRound` if 4 seconds have passed since last tick (matching the old EFFECT_ROUND_CONVERSION_MICROS of 4s). Track this via a simple comparison against effect timestamps. Or simpler: just call it every tick but have `tickEffectsForRound` check remaining duration in time-based units.

Actually, the simplest approach: keep calling `tickEffectsForRound` in combat_loop every tick. The function decrements `roundsRemaining` -- so effects that had 3 "rounds" would now expire in 3 ticks (3 seconds). This is fine because effects were already short-lived. If duration balance is off, it can be tuned later. Keep it simple.

### 10. Handle items.ts references to rounds

The `items.ts` reducer (~lines 687-734) has a use_item reducer that checks for `combat_round` and `combat_action` tables (for submitting item-use as a round action). This needs to be updated:
- Remove the round-action submission logic
- If using an item in combat, apply it immediately (similar to use_ability_realtime)
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx spacetime build spacetimedb 2>&1 | tail -5</automated>
  </verify>
  <done>combat_loop ticks real-time auto-attacks for both players and enemies based on nextAutoAttackAt. use_ability_realtime executes abilities immediately. flee_combat works immediately. No rounds created on combat start. Post-combat LLM summary fires once on victory/defeat. Build succeeds.</done>
</task>

<task type="auto">
  <name>Task 2: Remove round UI and inline combat HUD from client, wire real-time reducers</name>
  <files>
    src/composables/useCombat.ts
    src/components/CombatActionBar.vue
    src/components/NarrativeConsole.vue
    src/components/NarrativeInput.vue
    src/App.vue
  </files>
  <action>
This task removes all round-based UI from the client and wires ability/flee to the new real-time reducers.

### 1. Update useCombat.ts

**Remove round-based state entirely:**
- Remove `currentRound` computed (lines 189-202)
- Remove `roundState` computed (lines 204-206)
- Remove `myAction` computed (lines 208-219)
- Remove `hasSubmittedAction` computed (line 221)
- Remove `roundTimeRemaining` ref and RAF timer loop (lines 224-257)
- Remove `submitAction`, `submitAbility`, `submitFlee` functions (lines 261-283) -- these called `submitCombatAction` reducer
- Remove `actionPromptMessage` computed (lines 287-340)
- Remove `roundSummaryMessage` computed (lines 344-411)
- Remove `combatStatusMessage` computed (lines 414-475)
- Remove `roundHeaderMessage` computed (lines 1016-1019)
- Remove `roundEndMessage` computed (lines 1022-1026)
- Remove `actionPromptData` computed (lines 1071-1097)
- Remove `combatRounds`, `combatActions`, `combatNarratives` from UseCombatArgs type and destructuring

**Add real-time ability/flee functions:**
```typescript
const useAbilityRealtime = (abilityTemplateId: bigint, targetEnemyId?: bigint) => {
  if (!connActive.value || !selectedCharacter.value) return;
  const useAbilityReducer = useReducer(reducers.useAbilityRealtime);
  useAbilityReducer({
    characterId: selectedCharacter.value.id,
    abilityTemplateId,
    targetEnemyId: targetEnemyId ?? activeEnemy.value?.id ?? undefined,
  });
};
```

Note: The `useReducer` call for `useAbilityRealtime` needs to be at the composable's top level (not inside a function). Add it next to the existing reducer hooks:
```typescript
const useAbilityRealtimeReducer = useReducer(reducers.useAbilityRealtime);
```
Then the function calls `useAbilityRealtimeReducer(...)`.

The `flee` function already calls `fleeCombatReducer` directly (line 952-957), which is correct for real-time. Keep it as-is.

**Update return object:** Remove all round-related exports. Keep: `activeCombat`, `isInCombat`, `activeEnemy`, `activeEnemyName`, `combatEnemiesList`, `combatRoster`, `startCombat`, `startPull`, `startTrackedCombat`, `setCombatTarget`, `flee`, `dismissResults`, `takeLoot`, `takeAllLoot`, `useAbilityRealtime`, `availableEnemies`, and all existing non-round exports.

### 2. Update CombatActionBar.vue

**Remove round-related props and UI:**
- Remove props: `roundTimeRemaining`, `roundState`, `hasSubmittedAction`
- Remove the "Action locked in..." text block (lines 49-51)
- Remove the round timer display (lines 52-57)
- Remove `hasSubmittedAction` from disabled conditions on buttons (lines 6, 16)
- The component becomes just: Flee button + Ability buttons (with cast/cooldown states)
- Keep the Spacer div for layout

Updated props interface:
```typescript
const props = defineProps<{
  abilities: CombatAbility[];
  castingAbilityId: bigint | null;
  castProgress: number;
}>();
```

### 3. Update NarrativeConsole.vue

**Remove round-related props and inline combat status:**
- Remove props: `roundTimeRemaining`, `roundState`, `hasSubmittedAction`
- Remove the entire "Combat round timer / status indicators" block (lines 32-41) that shows timer, "Action locked in", "Round resolving..."
- Remove these props from NarrativeInput pass-through (lines 67-69)
- Keep `isInCombat`, `combatAbilities`, `combatEnemies`, `castingAbilityId`, `castProgress` props for combat action bar

### 4. Update NarrativeInput.vue

**Remove round-related props:**
- Remove props: `roundTimeRemaining`, `roundState`, `hasSubmittedAction`
- Remove these from CombatActionBar pass-through (lines 14-16)
- Remove from withDefaults (lines 125-127)

### 5. Update App.vue

**Remove all round-related narrative injections and watchers:**
- Remove: `lastInjectedRoundStart` ref (~line 1043)
- Remove: The "Round START" watcher that injects round headers and status bars (~lines 1047-1063)
- Remove: The "hasSubmittedAction" watcher that injects "Action submitted" (~lines 1066-1074)
- Remove: The "Round RESOLVED" watcher that injects summaries and round end markers (~lines 1078-1083)
- Remove: The combat start watcher's round-related code that injects "COMBAT BEGINS" header and status bars (~lines 1090-1100). Replace with a simple "Combat begins!" narrative event:
  ```typescript
  addLocalEvent('combat', 'Combat begins!', 'private');
  ```
- Remove round-related props passed to NarrativeConsole: `roundTimeRemaining`, `roundState`, `hasSubmittedAction`

**Wire ability use to new reducer:**
- Update `onCombatUseAbility` function to call `useAbilityRealtime(abilityId)` from useCombat instead of `submitAbility`
- The `onCombatFlee` function should call `flee()` from useCombat (it likely already does -- verify)

**Remove round-related data from useCombat destructuring:**
- Remove: `currentRound`, `roundState`, `myAction`, `hasSubmittedAction`, `roundTimeRemaining`, `actionPromptMessage`, `roundSummaryMessage`, `combatStatusMessage`, `roundHeaderMessage`, `roundEndMessage`, `submitAction`, `submitAbility`, `submitFlee`, `actionPromptData`

**Remove round-related data feeds:**
- Remove `combatRounds`, `combatActions`, `combatNarratives` from the useCombat args object (these were round-based table subscriptions)

**After running `spacetime generate`**, the new `useAbilityRealtime` reducer should appear in module_bindings. Make sure to regenerate bindings before testing the client.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit 2>&1 | tail -10</automated>
  </verify>
  <done>CombatActionBar shows only Flee + ability buttons (no timer, no "locked in" state). Abilities call use_ability_realtime reducer directly. No round headers, status bars, or round summaries appear in the narrative stream. Client type-checks clean.</done>
</task>

</tasks>

<verification>
1. `cd spacetimedb && npx spacetime build .` -- server compiles
2. `spacetime generate --lang typescript --out-dir ../src/module_bindings -p .` -- bindings regenerate with useAbilityRealtime
3. `cd .. && npx vue-tsc --noEmit` -- client type-checks
4. Manual: Start combat, verify auto-attacks happen on timer (not in rounds), abilities fire immediately, flee works immediately, no round UI visible, post-combat LLM summary appears after victory/defeat
</verification>

<success_criteria>
- No references to rounds, round timers, or round state in combat flow
- combat_loop ticks every 1s processing auto-attacks based on nextAutoAttackAt
- Abilities execute immediately via use_ability_realtime reducer
- Flee executes immediately via flee_combat reducer
- CombatActionBar shows ability buttons + flee (no timer, no submitted state)
- No inline combat status bars (HP bars, round headers, round summaries) injected into narrative stream
- EnemyHud component remains visible during combat in NarrativeInput area
- One LLM narration fires after combat ends (victory or defeat)
- Server builds, client type-checks
</success_criteria>

<output>
After completion, create `.planning/quick/348-remove-rounds-and-inline-combat-hud-rest/348-SUMMARY.md`
</output>
