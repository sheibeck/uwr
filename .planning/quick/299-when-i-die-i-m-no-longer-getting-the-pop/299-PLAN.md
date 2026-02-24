---
phase: quick-299
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/helpers/character.ts
autonomous: true
requirements: [FIX-DEATH-POPUP]

must_haves:
  truths:
    - "After dying in combat (defeat), character stays at hp=0n until player clicks Respawn"
    - "After dying in a victorious group fight, dead character stays at hp=0n until player clicks Respawn"
    - "Death modal with tombstone art and Respawn button appears when hp=0n and combat is over"
    - "Clicking Respawn calls respawn_character reducer and teleports to bind point with 1 hp"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Combat victory/defeat handlers WITHOUT auto-respawn"
    - path: "spacetimedb/src/helpers/character.ts"
      provides: "autoRespawnDeadCharacter helper (kept for potential future use but unused in combat)"
  key_links:
    - from: "src/App.vue"
      to: "selectedCharacter.hp === 0n && !activeCombat"
      via: "showDeathModal computed"
      pattern: "showDeathModal"
    - from: "src/App.vue"
      to: "reducers.respawnCharacter"
      via: "respawnCharacter button click"
      pattern: "respawnCharacter"
---

<objective>
Fix the death popup (tombstone + Respawn button) not appearing after character death.

Purpose: quick-273 added `autoRespawnDeadCharacter` calls in both combat victory and defeat paths, which immediately sets hp=1n after combat ends. This prevents the client-side death modal from ever appearing because `showDeathModal` requires `hp === 0n && !activeCombat` -- by the time `activeCombat` becomes null (combat state='resolved'), the character already has hp=1n.

Output: Character stays at hp=0n after combat death, death modal appears, user clicks Respawn to trigger the existing `respawn_character` reducer.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/combat.ts (victory handler ~line 2686-2688, defeat handler ~lines 2917-2922)
@spacetimedb/src/helpers/character.ts (autoRespawnDeadCharacter function ~line 227)
@spacetimedb/src/reducers/characters.ts (respawn_character reducer ~line 466 -- the manual respawn path that should be the ONLY respawn path)
@src/App.vue (showDeathModal computed ~line 1011, death modal template ~lines 360-366)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove autoRespawnDeadCharacter calls from combat victory and defeat paths</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
Remove the two `autoRespawnDeadCharacter` invocations from combat.ts so dead characters stay at hp=0n after combat ends:

1. **Victory path (~line 2686-2688):** Inside the `for (const p of participants)` loop in the victory handler, remove the two lines:
   ```
   const deadChar = ctx.db.character.id.find(p.characterId);
   if (deadChar) autoRespawnDeadCharacter(ctx, deadChar);
   ```
   Keep the `continue;` statement that follows -- dead participants should still skip the normal XP/loot path.

2. **Defeat path (~lines 2917-2922):** Remove the entire `for` loop:
   ```
   for (const p of participants) {
     const character = ctx.db.character.id.find(p.characterId);
     if (character && character.hp === 0n) {
       autoRespawnDeadCharacter(ctx, character);
     }
   }
   ```

3. **Clean up the import:** Remove `autoRespawnDeadCharacter` from the destructured `deps` object at ~line 279. It is no longer used in this file.

Do NOT delete the `autoRespawnDeadCharacter` function from helpers/character.ts -- it may be useful for future admin/scheduled cleanup. Only remove its usage from combat.ts.

After this change, the flow becomes:
- Combat ends -> state='resolved' -> client sees activeCombat=null
- Dead character still has hp=0n -> showDeathModal becomes true
- User sees tombstone + Respawn button -> clicks Respawn -> calls respawn_character reducer
- respawn_character sets hp=1n, moves to bind point, clears effects/cooldowns
  </action>
  <verify>
1. `grep -n "autoRespawnDeadCharacter" spacetimedb/src/reducers/combat.ts` returns NO matches
2. `grep -n "autoRespawnDeadCharacter" spacetimedb/src/helpers/character.ts` still shows the function definition (not deleted)
3. Publish to local: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` succeeds without errors
  </verify>
  <done>
autoRespawnDeadCharacter is no longer called after combat. Dead characters remain at hp=0n after combat resolution, allowing the client-side death modal (tombstone + Respawn button) to display. The respawn_character reducer remains the sole respawn mechanism.
  </done>
</task>

</tasks>

<verification>
- After dying in combat, character hp stays at 0n (not auto-set to 1n)
- The death overlay with "You have died.", tombstone ASCII art, and Respawn button appears
- Clicking Respawn teleports character to bind point with 1 hp
- Group victory where one member died: dead member sees death popup after combat ends, alive members see loot normally
</verification>

<success_criteria>
- Death modal appears after character death in combat
- Respawn button works and calls respawn_character reducer
- No server-side auto-respawn occurs
- Module publishes without errors
</success_criteria>

<output>
After completion, create `.planning/quick/299-when-i-die-i-m-no-longer-getting-the-pop/299-SUMMARY.md`
</output>
