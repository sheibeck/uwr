---
phase: quick-35
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/views/combat.ts
  - src/composables/useCombat.ts
  - src/App.vue
autonomous: false

must_haves:
  truths:
    - "After combat victory, loot items appear in the Loot Panel"
    - "Loot panel auto-opens when items drop"
    - "Taking loot moves item to inventory and removes from panel"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "Public combat_loot table (bypasses view layer)"
      contains: "public: true"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Loot generation with diagnostic event logging"
    - path: "src/composables/useCombat.ts"
      provides: "pendingLoot computed with diagnostic console logging"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "combat_loot table"
      via: "ctx.db.combatLoot.insert"
      pattern: "combatLoot\\.insert"
    - from: "src/composables/useCombat.ts"
      to: "combat_loot data"
      via: "combatLoot.value filter"
      pattern: "combatLoot\\.value"
---

<objective>
Deep analysis and fix of the combat loot pipeline. Loot has not appeared in LootPanel
across 3 prior fix attempts (quick-29, 31, 33). All prior fixes were verified by code
inspection only, never runtime tested.

This task takes a two-pronged approach:
1. Make combat_loot a PUBLIC table to bypass the view layer entirely (eliminates view
   re-evaluation as a failure mode)
2. Add diagnostic server-side event logging at every step of loot generation so the
   user can see in-game whether loot was generated, how many items, and for which
   character
3. Add client-side console logging to trace data arrival

Purpose: Find and fix the actual root cause by eliminating the view abstraction layer
and adding visibility into the loot pipeline.

Output: Working loot display after combat, with diagnostic logging to confirm data flow.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/29-refactor-loot-system-replace-combat-summ/29-SUMMARY.md
@.planning/quick/31-fix-loot-panel-and-victory-messages-loot/31-SUMMARY.md
@.planning/quick/33-remove-legacy-auto-dismiss-loot-system-a/33-SUMMARY.md
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/views/combat.ts
@spacetimedb/src/index.ts (CombatLoot table definition near line 462)
@src/composables/useCombat.ts
@src/composables/useGameData.ts
@src/components/LootPanel.vue
@src/App.vue (loot panel wiring near line 225, watcher near line 891)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make combat_loot public, add diagnostic logging, switch client from view to direct table</name>
  <files>
    spacetimedb/src/index.ts
    spacetimedb/src/views/combat.ts
    spacetimedb/src/reducers/combat.ts
    src/composables/useGameData.ts
    src/composables/useCombat.ts
    src/App.vue
  </files>
  <action>
    **Root cause analysis summary from deep code review:**

    The loot system has a private `combat_loot` table with a `my_combat_loot` view.
    The view depends on SpacetimeDB re-evaluating per-subscriber when data changes
    during a scheduled reducer (`combat_loop`). All 3 prior fixes addressed client-side
    timing issues, but never verified whether data actually arrives at the client from
    the view. The view pattern is the most likely failure mode because:
    - Combat resolves in a SCHEDULED reducer (no ctx.sender)
    - Views must re-evaluate per-subscriber when their data changes
    - Other data (events, effects) works because those tables/views may have different
      update timing or the effects view uses iter() not index lookup

    **Server changes:**

    1. In `spacetimedb/src/index.ts`, find the `CombatLoot` table definition (around
       line 462). Add `public: true` to the table options. This makes the table directly
       subscribable by clients, bypassing the view layer entirely:

       ```typescript
       const CombatLoot = table(
         {
           name: 'combat_loot',
           public: true,    // ADD THIS LINE
           indexes: [
             { name: 'by_owner', algorithm: 'btree', columns: ['ownerUserId'] },
             { name: 'by_combat', algorithm: 'btree', columns: ['combatId'] },
             { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
           ],
         },
         {
           id: t.u64().primaryKey().autoInc(),
           combatId: t.u64(),
           ownerUserId: t.u64(),
           characterId: t.u64(),
           itemTemplateId: t.u64(),
           createdAt: t.timestamp(),
         }
       );
       ```

    2. In `spacetimedb/src/views/combat.ts`, KEEP the `my_combat_loot` view definition
       in place (do not remove it -- removing it would break the schema and require
       `--clear-database`). The view will still exist but the client will subscribe
       to the public table directly instead.

    3. In `spacetimedb/src/reducers/combat.ts`, add diagnostic event logging in the
       victory loot generation section. Find the victory loot generation loop (around
       line 1848-1908 in the `livingEnemies.length === 0` block). After the loot
       generation for each participant, add a private event log message:

       After the `for (const lootTemplate of lootTemplates)` loop and before the
       gold reward section, add:

       ```typescript
       // Diagnostic: log loot generation results
       appendPrivateEvent(
         ctx,
         character.id,
         character.ownerUserId,
         'reward',
         lootTemplates.length > 0
           ? `Loot generated: ${lootTemplates.map(t => t.name).join(', ')}`
           : `No loot dropped from ${template?.name ?? 'enemy'}.`
       );
       ```

       This goes INSIDE the `for (const template of enemyTemplates)` loop, right
       after the loot insertion loop. This way the user sees in their event log
       exactly what loot was or wasn't generated per enemy template.

    **Client changes:**

    4. In `src/composables/useGameData.ts`, change line 41 from:
       ```typescript
       const [combatLoot] = useTable(tables.myCombatLoot);
       ```
       to:
       ```typescript
       const [combatLoot] = useTable(tables.combatLoot);
       ```
       This switches from the view (`my_combat_loot`) to the now-public table
       (`combat_loot`) directly. The row shape is identical (same fields).

    5. In `src/composables/useCombat.ts`, add diagnostic console.log in the
       `pendingLoot` computed (around line 227). After the filter and before the
       `.map()`, add a console.log:

       ```typescript
       const pendingLoot = computed(() => {
         if (!selectedCharacter.value) return [];
         const characterId = selectedCharacter.value.id.toString();
         const allLoot = combatLoot.value;
         const filtered = allLoot.filter((row) => row.characterId.toString() === characterId);

         // Diagnostic logging
         if (allLoot.length > 0 || filtered.length > 0) {
           console.log('[LOOT DEBUG] combatLoot rows:', allLoot.length, 'filtered for char:', filtered.length, 'characterId:', characterId);
         }

         return filtered
           .slice(0, 10)
           .map((row) => {
             // ... existing map logic unchanged
           });
       });
       ```

       Note: Keep the existing map logic exactly as-is. Only add the console.log
       before the return statement.

    6. In `src/App.vue`, find the pendingLoot watcher (around line 891). Add a
       console.log before the `openPanel` call:

       ```typescript
       watch(
         () => pendingLoot.value.length,
         (count, prevCount) => {
           console.log('[LOOT DEBUG] pendingLoot changed:', prevCount, '->', count);
           if (count > 0 && (prevCount === 0 || prevCount === undefined)) {
             openPanel('loot');
           }
         }
       );
       ```

    **After making changes:**
    - Regenerate client bindings: `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb`
    - Verify TypeScript compiles: `npx vue-tsc --noEmit` (ignore pre-existing errors)
    - Publish: `spacetime publish uwr --project-path spacetimedb`

    **IMPORTANT:** After `spacetime generate`, verify that `tables.combatLoot` exists
    in the generated bindings (it should now be a public table with proper fields).
    If `tables.combatLoot` does NOT exist or has different field names than
    `tables.myCombatLoot`, adjust the import in useGameData.ts accordingly.
  </action>
  <verify>
    1. `spacetime publish uwr --project-path spacetimedb` succeeds without errors
    2. `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb` succeeds
    3. `npx vue-tsc --noEmit` produces no NEW errors (pre-existing errors acceptable)
    4. The CombatLoot table in spacetimedb/src/index.ts has `public: true`
    5. useGameData.ts references `tables.combatLoot` (not `tables.myCombatLoot`)
    6. combat.ts has diagnostic appendPrivateEvent calls in victory loot section
    7. useCombat.ts has console.log in pendingLoot computed
    8. App.vue has console.log in pendingLoot watcher
  </verify>
  <done>
    Server published with public combat_loot table and diagnostic logging.
    Client switched to direct table subscription with console logging.
    Ready for human runtime verification.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Verify loot appears in-game after combat victory</name>
  <what-built>
    Made combat_loot a public table (bypassing view layer), added diagnostic
    server-side event logging for loot generation, added client-side console
    logging for data arrival tracking.
  </what-built>
  <how-to-verify>
    1. Start the client (`npm run dev` or equivalent)
    2. Log in, select a character
    3. Find and engage an enemy in combat
    4. Win the combat (use a low-level enemy if needed)
    5. Check these things:
       a. Look at the event log (bottom of screen) -- you should see messages like
          "Loot generated: [item names]" or "No loot dropped from [enemy]."
       b. If loot WAS generated: Does the Loot panel auto-open? Does it show items?
       c. If loot panel shows items: Click "Take" on an item -- does it move to inventory?
       d. Open browser dev tools (F12) -> Console tab. Look for "[LOOT DEBUG]" messages.
          Report what you see.
    6. If loot STILL doesn't appear:
       a. Report the exact "[LOOT DEBUG]" console messages (or lack thereof)
       b. Report whether the event log shows "Loot generated" or "No loot dropped"
       c. Run `spacetime logs uwr` and report any errors
  </how-to-verify>
  <resume-signal>
    Type "approved" if loot appears correctly, OR describe what you see (event log
    messages, console output, any errors) so we can diagnose further.
  </resume-signal>
</task>

</tasks>

<verification>
- combat_loot table is public (server-side)
- Client subscribes to combat_loot directly (not via view)
- Diagnostic logging present at server (event log) and client (console.log)
- User confirms loot items appear in LootPanel after combat victory
</verification>

<success_criteria>
After combat victory where loot is generated:
1. Event log shows "Loot generated: [item names]" message
2. Loot panel auto-opens with item names, rarity, and Take buttons
3. Taking loot moves item to inventory and removes from loot panel
4. Console shows [LOOT DEBUG] messages confirming data flow
</success_criteria>

<output>
After completion, create `.planning/quick/35-deep-analysis-and-fix-of-combat-loot-sys/35-SUMMARY.md`
</output>
