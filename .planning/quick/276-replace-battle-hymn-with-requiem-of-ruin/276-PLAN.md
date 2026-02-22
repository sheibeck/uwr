---
phase: quick-276
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/abilities/bard_abilities.ts
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/reducers/items.ts
  - src/App.vue
autonomous: true
requirements: [QUICK-276]

must_haves:
  truths:
    - "bard_battle_hymn no longer exists anywhere in the codebase"
    - "bard_requiem_of_ruin exists in BARD_ABILITIES at level 9 with updated name and description"
    - "Requiem of Ruin song tick applies damage_taken debuff to all active combat enemies (not AoE damage)"
    - "Requiem of Ruin cast block applies immediate first debuff tick and logs the event"
    - "Finale burst correctly applies the damage_taken debuff to all enemies"
    - "BARD_SONG_KEYS arrays in items.ts include bard_requiem_of_ruin instead of bard_battle_hymn"
    - "Client App.vue song display name updated to Requiem of Ruin"
  artifacts:
    - path: "spacetimedb/src/data/abilities/bard_abilities.ts"
      provides: "bard_requiem_of_ruin ability metadata"
      contains: "bard_requiem_of_ruin"
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "cast block and finale burst handling for Requiem of Ruin"
      contains: "bard_requiem_of_ruin"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "tick handler that applies damage_taken debuff per pulse"
      contains: "bard_requiem_of_ruin"
  key_links:
    - from: "tick_bard_songs case 'bard_requiem_of_ruin'"
      to: "addEnemyEffect(..., 'damage_taken', 3n, 1n, 'Requiem of Ruin')"
      via: "loop over enemies in combat"
    - from: "helpers/combat.ts cast block"
      to: "same addEnemyEffect call on immediate cast"
      via: "abilityKey === 'bard_requiem_of_ruin' check"
---

<objective>
Replace Battle Hymn (AoE damage + party heal/mana combo song) with Requiem of Ruin — a pure force-multiplier song that applies a `damage_taken` debuff (+3 flat damage received) to all active combat enemies every 6 seconds.

Purpose: Removes the boring combo song and gives bards a unique support role: every party member hits harder while the song is active.
Output: Renamed ability in data, rewired tick handler, updated cast/finale logic, client display name updated.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Key patterns established by existing code:
- addEnemyEffect(ctx, combatId, enemyId, 'damage_taken', magnitude, roundsRemaining, sourceAbility)
  already used: rogue_death_mark uses magnitude=5n, rounds=3n; ranger_marked_shot uses magnitude=1n, rounds=2n
- damage_taken is summed into raw damage in applyDamage (helpers/combat.ts ~line 688) and in auto-attack (reducers/combat.ts ~line 2426)
- Songs that are combat-only are listed in DAMAGE_SONGS in the cast block (helpers/combat.ts ~line 976)
- Bard song tick switch is in reducers/combat.ts tick_bard_songs (~line 1840)
- Finale burst switch is in helpers/combat.ts bard_finale case (~line 1081)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename ability and update all bard song key references</name>
  <files>
    spacetimedb/src/data/abilities/bard_abilities.ts
    spacetimedb/src/helpers/combat.ts
    spacetimedb/src/reducers/items.ts
    src/App.vue
  </files>
  <action>
Four targeted renames across four files:

**spacetimedb/src/data/abilities/bard_abilities.ts** — rename key and update metadata:
- Change `bard_battle_hymn:` key to `bard_requiem_of_ruin:`
- Change `name: 'Battle Hymn'` to `name: 'Requiem of Ruin'`
- Change description to: `'Activates a dark requiem that weakens all enemies in combat, increasing all damage they take every 6 seconds.'`
- Keep level 9n, power 4n, cooldownSeconds 1n, castSeconds 0n
- Change `damageType` to `'none' as DamageType` (no longer a damage song)
- Remove `aoeTargets: 'all_enemies'` (not an AoE attack, it's a debuff song)

**spacetimedb/src/helpers/combat.ts** — four locations to update:
1. Case label at ~line 975: add `case 'bard_requiem_of_ruin':` (replacing `case 'bard_battle_hymn':`)
2. DAMAGE_SONGS array at ~line 976: remove `'bard_battle_hymn'` from the array — Requiem is a debuff song, NOT a damage song, so it does NOT require combat-only enforcement via DAMAGE_SONGS. Update: `const DAMAGE_SONGS = ['bard_discordant_note'];` — but Requiem of Ruin DOES require combat (needs enemies), so add `'bard_requiem_of_ruin'` to DAMAGE_SONGS. Final: `const DAMAGE_SONGS = ['bard_discordant_note', 'bard_requiem_of_ruin'];`
3. songNames map at ~line 1009: change `bard_battle_hymn: 'Battle Hymn'` to `bard_requiem_of_ruin: 'Requiem of Ruin'`
4. Immediate-on-cast block at ~line 1012: Replace the entire block that checks `abilityKey === 'bard_battle_hymn' || abilityKey === 'bard_discordant_note'` with two separate blocks:
   - Keep the existing Discordant Note block exactly as-is (checking `abilityKey === 'bard_discordant_note'`)
   - Add a new block for Requiem of Ruin: apply damage_taken debuff to all active enemies immediately on cast:
     ```
     if (abilityKey === 'bard_requiem_of_ruin') {
       const activeEnemies = combatId
         ? [...ctx.db.combatEnemy.by_combat.filter(combatId)].filter((e: any) => e.currentHp > 0n)
         : [];
       for (const en of activeEnemies) {
         addEnemyEffect(ctx, combatId!, en.id, 'damage_taken', 3n, 1n, 'Requiem of Ruin');
       }
       logPrivateAndGroup(ctx, character, 'ability', 'Requiem of Ruin weakens all enemies, increasing damage they take.');
     }
     ```
5. Finale burst switch at ~line 1082: Change `case 'bard_battle_hymn':` to `case 'bard_requiem_of_ruin':` and replace the body of that case. The old body did AoE damage + party heals. The new body: apply damage_taken debuff to all bardEnemies:
   ```
   case 'bard_requiem_of_ruin':
     for (const tEnemy of bardEnemies) {
       addEnemyEffect(ctx, combatId!, tEnemy.id, 'damage_taken', 3n, 1n, 'Requiem of Ruin');
     }
     break;
   ```
   Remove the old `if (activeSong.songKey === 'bard_battle_hymn') { ... }` party heal/mana block entirely.

**spacetimedb/src/reducers/items.ts** — two BARD_SONG_KEYS arrays (at ~line 776 and ~line 840):
- In both: replace `'bard_battle_hymn'` with `'bard_requiem_of_ruin'`
- In the songDisplayNames map at ~line 786: replace `bard_battle_hymn: 'Battle Hymn'` with `bard_requiem_of_ruin: 'Requiem of Ruin'`

**src/App.vue** — client song name map at ~line 1067:
- Replace `bard_battle_hymn: 'Battle Hymn'` with `bard_requiem_of_ruin: 'Requiem of Ruin'`
  </action>
  <verify>
    grep -r "bard_battle_hymn" spacetimedb/src/ src/ returns no results.
    grep -r "bard_requiem_of_ruin" spacetimedb/src/ returns matches in bard_abilities.ts, helpers/combat.ts, reducers/combat.ts (via Task 2), and reducers/items.ts.
  </verify>
  <done>No bard_battle_hymn references remain. bard_requiem_of_ruin is present in the ability catalog, both BARD_SONG_KEYS arrays, the songNames/songDisplayNames maps, the cast block, and the finale case. Client App.vue shows "Requiem of Ruin".</done>
</task>

<task type="auto">
  <name>Task 2: Replace tick_bard_songs battle hymn case with Requiem of Ruin debuff pulse</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In reducers/combat.ts, find the `tick_bard_songs` reducer's switch block — specifically the `case 'bard_battle_hymn':` at ~line 1840.

Replace the entire case with `case 'bard_requiem_of_ruin':`. The old body did: AoE damage to enemies, mana drain from bard, then HP + mana restore for all party members. Remove ALL of that logic.

The new body: loop over all active combat enemies and apply/refresh the damage_taken debuff using addEnemyEffect. Use magnitude=3n (flat +3 damage taken per hit), roundsRemaining=1n (expires after 1 combat round — but gets refreshed every 6s tick so it's effectively permanent while the song is active), sourceAbility='Requiem of Ruin'. Log the event.

New case body:
```typescript
case 'bard_requiem_of_ruin': {
  if (!combatId) break;
  for (const en of enemies) {
    addEnemyEffect(ctx, combatId, en.id, 'damage_taken', 3n, 1n, 'Requiem of Ruin');
  }
  logPrivateAndGroup(ctx, bard, 'ability', 'Requiem of Ruin weakens all enemies, increasing damage they take.');
  break;
}
```

Verify that `addEnemyEffect` is imported/available in this file. Check the top of reducers/combat.ts for the import from helpers/combat. If not already imported, add it to the import.
  </action>
  <verify>
    Run: grep -n "bard_requiem_of_ruin\|addEnemyEffect" spacetimedb/src/reducers/combat.ts
    Should show the new case and the addEnemyEffect call inside it.
    Run: spacetime publish uwr --project-path C:/projects/uwr/spacetimedb (local publish to confirm no compile errors).
  </verify>
  <done>tick_bard_songs has case 'bard_requiem_of_ruin' that calls addEnemyEffect for each active enemy. Module compiles successfully. No bard_battle_hymn reference remains in combat.ts.</done>
</task>

</tasks>

<verification>
After both tasks:
1. `grep -rn "bard_battle_hymn" C:/projects/uwr/spacetimedb/src/ C:/projects/uwr/src/` returns zero results.
2. `grep -rn "bard_requiem_of_ruin" C:/projects/uwr/spacetimedb/src/` returns hits in: bard_abilities.ts, helpers/combat.ts (3+ locations), reducers/combat.ts (tick case), reducers/items.ts (2 BARD_SONG_KEYS arrays + songDisplayNames map).
3. Local publish compiles without errors: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb`
</verification>

<success_criteria>
- Ability renamed in catalog, no Battle Hymn references anywhere
- Song tick applies damage_taken debuff (magnitude 3n, 1 round, refreshes each 6s tick) to all active combat enemies
- Cast block applies immediate first debuff tick on song activation
- Finale burst applies the debuff instead of damage + heals
- Song is combat-only (in DAMAGE_SONGS list)
- Client displays "Requiem of Ruin" in hotbar and song stop messages
- Module compiles and publishes to local SpacetimeDB
</success_criteria>

<output>
After completion, create `.planning/quick/276-replace-battle-hymn-with-requiem-of-ruin/276-SUMMARY.md`
</output>
