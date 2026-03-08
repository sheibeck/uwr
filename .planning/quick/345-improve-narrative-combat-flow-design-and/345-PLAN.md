---
phase: quick-345
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
  - src/App.vue
autonomous: true
requirements: [QUICK-345]
must_haves:
  truths:
    - "Per-round LLM narration does NOT fire (only intro/victory/defeat)"
    - "A compact mechanical summary event appears in the narrative after each round resolves"
    - "Rounds resolve instantly with no 'resolving' wait state felt by the player"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Compact round summary builder, removed mid-round triggerCombatNarration call"
    - path: "src/App.vue"
      provides: "Clean round resolution injection without resolving delay"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "appendPrivateEvent"
      via: "combat_status event with compact summary text"
      pattern: "appendPrivateEvent.*combat_status.*summary"
---

<objective>
Switch combat from per-round LLM narration to batch narration: mechanical compact summaries per round, LLM narration only at combat end (victory/defeat) and intro.

Purpose: Makes rounds resolve instantly (no LLM wait), saves budget, improves combat flow.
Output: Modified combat reducer with compact summaries, cleaned client injection.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/helpers/combat_narration.ts
@src/App.vue
@src/composables/useCombat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove mid-round LLM narration and add compact mechanical summary</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In the `resolveRound` function:

1. **Remove the mid-round triggerCombatNarration call** (lines ~2634-2637):
   ```typescript
   // DELETE these 4 lines:
   // const updatedRound = ctx.db.combat_round.id.find(round.id);
   // const roundEvents = buildRoundEvents('round');
   // triggerCombatNarration(ctx, combat, updatedRound || round, roundEvents);
   ```
   KEEP the victory (line ~2611) and defeat (line ~2628) triggerCombatNarration calls. KEEP the intro call (line ~261). Only remove the 'round' type call at line ~2637.

2. **Build and emit a compact mechanical round summary** right before the "Mark round resolved" section (before line ~2639). After `buildRoundEvents` is removed, the summary should use data already available in scope:

   Build the summary from `allActions`, pre/post HP snapshots, and enemy action results. Insert this block after the defeat check (after line ~2632) and before marking the round resolved:

   ```typescript
   // ── Compact mechanical round summary ──
   const summaryLines: string[] = [];

   // Player action lines from allActions + HP diffs
   for (const action of allActions) {
     const character = ctx.db.character.id.find(action.characterId);
     if (!character) continue;

     if (action.actionType === 'flee') {
       const participant = [...ctx.db.combat_participant.by_combat.filter(combatId)]
         .find((p: any) => p.characterId === character.id);
       const success = participant?.status === 'fled';
       summaryLines.push(`${character.name} attempts to flee -- ${success ? 'success!' : 'fails!'}`);
     } else if (action.actionType === 'ability' && action.abilityTemplateId) {
       const ability = ctx.db.ability_template.id.find(action.abilityTemplateId);
       const abilityName = ability?.name ?? 'an ability';
       if (action.targetEnemyId) {
         const enemy = ctx.db.combat_enemy.id.find(action.targetEnemyId);
         const eName = enemy?.displayName ?? 'enemy';
         const preHp = preEnemyHp.get(action.targetEnemyId) ?? 0n;
         const postHp = enemy?.currentHp ?? 0n;
         const dmg = preHp > postHp ? preHp - postHp : 0n;
         if (dmg > 0n) {
           summaryLines.push(`${character.name} uses [${abilityName}] on ${eName} -- {{color:#ff6b6b}}${dmg} damage{{/color}}.`);
         } else {
           summaryLines.push(`${character.name} uses [${abilityName}] on ${eName}.`);
         }
       } else {
         summaryLines.push(`${character.name} uses [${abilityName}].`);
       }
     } else {
       // auto-attack
       if (action.targetEnemyId) {
         const enemy = ctx.db.combat_enemy.id.find(action.targetEnemyId);
         const eName = enemy?.displayName ?? 'enemy';
         const preHp = preEnemyHp.get(action.targetEnemyId) ?? 0n;
         const postHp = enemy?.currentHp ?? 0n;
         const dmg = preHp > postHp ? preHp - postHp : 0n;
         if (dmg > 0n) {
           summaryLines.push(`${character.name} attacks ${eName} -- {{color:#ff6b6b}}${dmg} damage{{/color}}.`);
         } else {
           summaryLines.push(`${character.name} attacks ${eName}.`);
         }
       }
     }
   }

   // Enemy action lines from HP diffs on players
   for (const p of participants) {
     const character = ctx.db.character.id.find(p.characterId);
     if (!character) continue;
     const preHp = prePlayerHp.get(character.id) ?? character.hp;
     const dmgTaken = preHp > character.hp ? preHp - character.hp : 0n;
     if (dmgTaken > 0n) {
       // Attribute to enemies generically (individual enemy attribution not tracked)
       summaryLines.push(`${character.name} takes {{color:#ff6b6b}}${dmgTaken} damage{{/color}}.`);
     }
     if (preHp > 0n && character.hp === 0n) {
       summaryLines.push(`${character.name} falls!`);
     }
   }

   // Enemy deaths
   for (const enemy of finalEnemies) {
     const preHp = preEnemyHp.get(enemy.id) ?? enemy.maxHp;
     if (preHp > 0n && enemy.currentHp === 0n) {
       summaryLines.push(`${enemy.displayName} falls!`);
     }
   }

   // Emit compact summary to each participant
   if (summaryLines.length > 0) {
     const summaryText = summaryLines.join('\n');
     for (const p of participants) {
       const character = ctx.db.character.id.find(p.characterId);
       if (!character) continue;
       appendPrivateEvent(ctx, character.id, character.ownerUserId, 'combat_status', summaryText);
     }
   }
   ```

   Note: The `appendPrivateEvent` import and the `preEnemyHp`/`prePlayerHp` maps are already in scope. The `buildRoundEvents` function and its `RoundEventSummary` type can remain in the file (still used by victory/defeat paths). Just remove the mid-round call to `triggerCombatNarration`.

3. **Also remove the updatedRound fetch** that was only used for the mid-round narration (line ~2635). The later `latestRound` fetch at line ~2641 handles the round state update.
  </action>
  <verify>
    <automated>cd /c/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>
    - Line ~2637 `triggerCombatNarration(ctx, combat, updatedRound || round, roundEvents)` is removed
    - Victory and defeat triggerCombatNarration calls remain intact
    - Intro triggerCombatNarration call remains intact
    - Compact summary block emits `combat_status` events with mechanical round recap
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Clean up client round resolution injection</name>
  <files>src/App.vue</files>
  <action>
The client-side round lifecycle watchers in App.vue (around lines 1073-1081) handle 'resolved' state. Since the server now emits a `combat_status` event with the compact summary, and rounds resolve instantly (no LLM wait), verify the following:

1. The `roundState` watcher at line 1074 injects `roundSummaryMessage` (HP bars from useCombat) on 'resolved'. This is FINE -- keep it. The server compact summary arrives via subscription as a separate event, and the client HP bars complement it.

2. The `roundEndMessage` injection at line 1078 (round end marker) is FINE -- keep it.

3. **No changes needed if there is no "resolving" state injection.** Based on grep, there is no "The round is being resolved" or similar message. The watchers just respond to 'resolved'.

If after reading App.vue more carefully there IS a "resolving" wait message or spinner, remove it. Otherwise, this task confirms the client already handles the new flow correctly and no changes are needed.

Actually, verify one thing: since `triggerCombatNarration` for mid-round is removed, the `narrationCount` on `combat_round` will no longer increment for mid-round narrations. The client `roundSummaryMessage` in useCombat uses HP data from participants/enemies, NOT narrationCount, so this should not affect anything. Confirm by checking useCombat's `roundSummaryMessage` computed does not depend on narrationCount.
  </action>
  <verify>
    <automated>cd /c/projects/uwr && npx vue-tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
    - Client correctly receives compact summary via combat_status subscription events
    - No stale "resolving" wait messages exist
    - HP bar summary still renders on round resolved
    - No TypeScript errors
  </done>
</task>

</tasks>

<verification>
1. Publish module locally: `spacetime publish uwr -p spacetimedb`
2. Start a combat encounter in-game
3. Verify: Round resolves instantly with compact mechanical summary lines (colored damage numbers)
4. Verify: No LLM narration fires mid-round (check `spacetime logs uwr` for absence of mid-round LLM tasks)
5. Verify: Victory/defeat still triggers LLM narration
6. Verify: Combat intro still triggers LLM narration
</verification>

<success_criteria>
- Per-round LLM narration eliminated (only intro/victory/defeat remain)
- Compact mechanical summary appears as combat_status event after each round
- Summary includes player actions, damage dealt, damage taken, deaths with color formatting
- Rounds feel instant (no waiting for LLM response between rounds)
- No regressions in victory/defeat/intro narration
</success_criteria>

<output>
After completion, create `.planning/quick/345-improve-narrative-combat-flow-design-and/345-SUMMARY.md`
</output>
