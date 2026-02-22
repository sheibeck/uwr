---
phase: quick-273
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/character.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [QUICK-273]

must_haves:
  truths:
    - "When a player dies in combat (defeat path), they are automatically teleported to their bind point with hp=1n"
    - "When a party member dies during a victory, they are automatically teleported to their bind point with hp=1n"
    - "An event message tells the dead character where they awoke"
    - "An event message notifies about corpse location(s) if any exist"
    - "The death modal never appears (character has hp=1n by the time subscription arrives)"
  artifacts:
    - path: "spacetimedb/src/helpers/character.ts"
      provides: "autoRespawnDeadCharacter helper function"
      exports: ["autoRespawnDeadCharacter"]
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Auto-respawn calls in both defeat and victory-with-deaths paths"
      contains: "autoRespawnDeadCharacter"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "spacetimedb/src/helpers/character.ts"
      via: "deps.autoRespawnDeadCharacter"
      pattern: "deps\\.autoRespawnDeadCharacter"
    - from: "spacetimedb/src/index.ts"
      to: "spacetimedb/src/helpers/character.ts"
      via: "import and deps object"
      pattern: "autoRespawnDeadCharacter"
---

<objective>
Automatically teleport dead characters to their bind point at the end of combat, eliminating the manual respawn button requirement.

Purpose: When a character dies in combat the game currently leaves them at the death location with hp=0n and shows a death modal requiring a button click to respawn. The expected behavior is automatic teleportation to the bind point immediately when combat resolves.
Output: `autoRespawnDeadCharacter` helper called from both combat death paths; characters arrive at bind point with hp=1n when subscription updates.
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
  <name>Task 1: Add autoRespawnDeadCharacter helper to helpers/character.ts</name>
  <files>spacetimedb/src/helpers/character.ts</files>
  <action>
Add an import for `appendPrivateEvent` from `./events` at the top of the file (after existing imports).

Then add this exported function at the end of the file:

```typescript
import { appendPrivateEvent } from './events';

export function autoRespawnDeadCharacter(ctx: any, character: any): void {
  // Clear character effects
  for (const effect of ctx.db.characterEffect.by_character.filter(character.id)) {
    ctx.db.characterEffect.id.delete(effect.id);
  }
  // Clear travel cooldowns — death is penalty enough
  for (const cd of ctx.db.travelCooldown.by_character.filter(character.id)) {
    ctx.db.travelCooldown.id.delete(cd.id);
  }
  const nextLocationId = character.boundLocationId ?? character.locationId;
  const respawnLocation = ctx.db.location.id.find(nextLocationId)?.name ?? 'your bind point';
  ctx.db.character.id.update({
    ...character,
    locationId: nextLocationId,
    hp: 1n,
    mana: character.maxMana > 0n ? 1n : 0n,
    stamina: character.maxStamina > 0n ? 1n : 0n,
  });
  appendPrivateEvent(
    ctx,
    character.id,
    character.ownerUserId,
    'combat',
    `You awaken at ${respawnLocation}, shaken but alive.`
  );
  // Notify about corpse location(s)
  const corpses = [...ctx.db.corpse.by_character.filter(character.id)];
  if (corpses.length > 0) {
    const locationNames = corpses.map((c: any) => {
      const loc = ctx.db.location.id.find(c.locationId);
      return loc?.name ?? 'unknown';
    });
    const unique = [...new Set(locationNames)];
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      `You have ${corpses.length} corpse(s) containing your belongings at: ${unique.join(', ')}.`
    );
  }
}
```

Note: The logic mirrors `respawn_character` in `reducers/characters.ts` but is a plain helper (no ownership check, no combat check) for use directly inside the combat loop where we already have the character row.
  </action>
  <verify>Run `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` (local). No TypeScript compile errors.</verify>
  <done>Module compiles without errors. `autoRespawnDeadCharacter` is exported from `helpers/character.ts`.</done>
</task>

<task type="auto">
  <name>Task 2: Wire autoRespawnDeadCharacter into deps and call it from both combat death paths</name>
  <files>spacetimedb/src/index.ts, spacetimedb/src/reducers/combat.ts</files>
  <action>
**In `spacetimedb/src/index.ts`:**

1. Add `autoRespawnDeadCharacter` to the import from `./helpers/character` (around line 149-157):
   ```typescript
   import {
     getGroupParticipants,
     isGroupLeaderOrSolo,
     partyMembersInLocation,
     recomputeCharacterDerived,
     isClassAllowed,
     friendUserIds,
     findCharacterByName,
     autoRespawnDeadCharacter,   // ADD THIS
   } from './helpers/character';
   ```

2. Add `autoRespawnDeadCharacter` to the `reducerDeps` object (around line 565, before `startCombatForSpawn: null as any`):
   ```typescript
   autoRespawnDeadCharacter,
   startCombatForSpawn: null as any,
   ```

**In `spacetimedb/src/reducers/combat.ts`:**

3. Add `autoRespawnDeadCharacter` to the destructured `deps` block inside `registerCombatReducers` (around line 265, after `calculateFleeChance`):
   ```typescript
     calculateFleeChance,
     autoRespawnDeadCharacter,   // ADD THIS
   } = deps;
   ```

4. **Victory path (partial deaths) — around line 3009:** Before the `continue;` that ends the `p.status === 'dead'` block, add a re-fetch and call:
   ```typescript
           // Auto-respawn dead party member after XP award
           const deadChar = ctx.db.character.id.find(p.characterId);
           if (deadChar) autoRespawnDeadCharacter(ctx, deadChar);
           continue;
   ```
   The re-fetch is important because `awardXp` may have updated the character row.

5. **Defeat path — around line 3418:** After the XP penalty loop and before `return;`, add a second auto-respawn loop:
   ```typescript
       for (const p of participants) {
         const character = ctx.db.character.id.find(p.characterId);
         if (character && character.hp === 0n) {
           autoRespawnDeadCharacter(ctx, character);
         }
       }
       return;
   ```
   The defeat path uses `hp === 0n` guard because `applyDeathXpPenalty` does not change hp. Re-fetch after the penalty loop because `applyDeathXpPenalty` updates xp on the character row — the `...character` spread in `autoRespawnDeadCharacter` must have the latest row to avoid overwriting xp with a stale value.
  </action>
  <verify>
Run `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` (local). No TypeScript compile errors. Check `spacetime logs uwr` after triggering a combat death — should see "You awaken at [location]" event, no "You lose X HP" or death modal in the client UI.
  </verify>
  <done>
Module publishes without errors. Dead characters are teleported to their bind point at the end of combat (both full-defeat and partial-death victory paths). The `showDeathModal` condition (`hp === 0n`) is never satisfied on the client, so no death modal appears.
  </done>
</task>

</tasks>

<verification>
1. `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` succeeds with no errors
2. Die in combat (solo or party wipe) → character appears at bind point with hp=1n, private event log shows "You awaken at [bind point name]"
3. If items were on corpse, second event shows corpse location
4. Party partial-death scenario: dead party member respawns at bind point; surviving members receive normal XP
5. The respawn button in the client remains as a no-op fallback (harmless — `if (character.hp > 0n) return;` guards it)
</verification>

<success_criteria>
- `autoRespawnDeadCharacter` exported from `helpers/character.ts`
- Imported and present in `reducerDeps` in `index.ts`
- Destructured from `deps` and called in both death paths in `reducers/combat.ts`
- Module compiles and publishes to local SpacetimeDB
- Characters no longer sit at `hp=0n` after combat ends
</success_criteria>

<output>
After completion, create `.planning/quick/273-fix-player-death-not-teleporting-to-bind/273-01-SUMMARY.md`
</output>
