---
phase: quick-246
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements:
  - QUICK-246
must_haves:
  truths:
    - "After a wipe (all players dead), add spawns pulled into combat return to state='available' with lockedCombatId cleared"
    - "After everyone flees (all fled), add spawns return to state='available' with lockedCombatId cleared"
    - "Dead/depleted enemies (currentHp===0n) in add spawns do not get restored — only surviving enemies count"
    - "The primary spawn (matching by_location + lockedCombatId) continues to behave exactly as before"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Fixed wipe/flee resolution paths that handle all engaged spawns"
      contains: "lockedCombatId === combat.id"
  key_links:
    - from: "wipe path (!stillActive at line ~3124)"
      to: "all EnemySpawn rows with lockedCombatId === combat.id"
      via: "iterate ctx.db.enemySpawn (no location filter) and check lockedCombatId"
---

<objective>
Fix the wipe/flee resolution path in `combat_loop` so that surviving add spawns (separate EnemySpawn rows pulled into combat as cross-aggro adds) are returned to `state='available'` when combat ends via player death or full flee, rather than remaining stuck in `state='engaged'`.

Purpose: After quick-238, all enemies are individual EnemySpawn rows. When adds are pulled, they get `state='engaged'` and `lockedCombatId=combat.id`. On wipe/flee, the current code only resets the ONE spawn found via `by_location.filter + lockedCombatId` check — all other add spawns are left orphaned.

Output: Patched `combat_loop` reducer; local publish to verify.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

<!-- Key combat resolution paths in spacetimedb/src/reducers/combat.ts:

LEASH PATH (line ~1916): activeParticipants.length === 0 — runs when all active participants
become inactive (fled/dead) at the top of the combat loop tick. Already correctly handles
multiple spawns by collecting `spawnIds = new Set(enemies.map(e => e.spawnId))` and iterating
all of them. No fix needed here.

WIPE/DEATH PATH (line ~3124): `!stillActive` — runs after enemy attacks, at the BOTTOM of the
combat loop. Checks whether any participant is still active + alive. This path only resets the
SINGLE primary spawn found via:
  [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(s => s.lockedCombatId === combat.id)

Add spawns (different EnemySpawn rows also with lockedCombatId===combat.id, possibly at
different or same locations) are NOT found by this query and are left in state='engaged'.

THE FIX: Replace the single-spawn reset in the !stillActive block (lines ~3139-3163) with the
same multi-spawn pattern used in the leash path — collect spawnIds from the enemies array,
then iterate all of them.
-->
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix wipe/flee spawn reset to handle all add spawns</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In the `!stillActive` block (around line 3124 in `combat_loop`), replace the single-spawn
reset logic with a multi-spawn loop that handles all spawns referenced by the enemies in this
combat.

Current code (lines ~3139-3163) finds ONE spawn:
```
const spawn = [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
  (s) => s.lockedCombatId === combat.id
);
if (spawn) {
  // ... restores spawn members, resets state
}
```

Replace with a multi-spawn approach that mirrors the leash path logic (around line 1928):
1. Collect all unique spawnIds from the `enemies` array (same `enemies` variable already in scope).
2. For each spawnId, find the spawn row.
3. Count remaining EnemySpawnMember rows for that spawn (already in DB, not consumed).
4. Re-insert surviving pulled enemies (currentHp > 0n) back as EnemySpawnMember rows.
5. Update spawn to state='available', lockedCombatId=undefined, groupCount=count.

Dead enemies (currentHp === 0n) should NOT be re-inserted — they stay depleted.

The resulting code should look structurally like the leash reset block (lines ~1928-1965) but
without the full-HP reset of combatEnemy rows (that's leash-specific), and without deleting
and reinserting existing members (just count existing + add surviving pulled enemies).

Keep the logic for marking participants dead, event kill credit, XP penalty, corpse creation,
and the clearCombatArtifacts/state=resolved calls exactly as they are — only replace the spawn
reset block.

After the edit, publish locally to confirm no TS errors:
  spacetime publish uwr --project-path C:/projects/uwr/spacetimedb
  </action>
  <verify>
1. `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` completes without errors.
2. Read the modified block and confirm: (a) it iterates all spawnIds from the enemies array,
   (b) it inserts surviving (hp>0) enemies as EnemySpawnMember rows, (c) it calls
   `ctx.db.enemySpawn.id.update({ ...spawn, state: 'available', lockedCombatId: undefined, groupCount: count })` for each spawn.
  </verify>
  <done>
All EnemySpawn rows locked to the combat (including add spawns from cross-aggro pulls) are
reset to state='available' with lockedCombatId cleared when the wipe/all-fled path runs.
Surviving enemies (hp>0) are restored to their spawn group. Dead enemies stay depleted.
Local publish succeeds.
  </done>
</task>

</tasks>

<verification>
After local publish succeeds:
- `spacetime logs uwr` shows no runtime errors during a test flee/wipe scenario.
- In game client: pull a group, body-pull an add, then die. The add spawn should appear as
  available enemies again at the location (not stuck engaged indefinitely).
</verification>

<success_criteria>
- `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` exits 0.
- The `!stillActive` block iterates all spawnIds (not just one) from the enemies array.
- Add spawns no longer get stuck in state='engaged' after a wipe or full flee.
</success_criteria>

<output>
After completion, create `.planning/quick/246-return-surviving-adds-to-location-on-fle/246-01-SUMMARY.md`
</output>
