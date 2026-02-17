---
phase: quick-123
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/helpers/combat.ts
autonomous: true

must_haves:
  truths:
    - "Flee is no longer guaranteed - success depends on danger level"
    - "Flee attempt is logged as 'You attempt to flee...' immediately"
    - "Flee resolution happens on the next combat tick, not immediately"
    - "Successful flee logs 'You successfully flee.' and removes character from combat"
    - "Failed flee logs 'You fail to flee!' and combat continues"
    - "In group: fleeing character is removed from aggro list on success"
    - "In group: group event log shows '<Character> attempts to flee' / succeeds / fails"
    - "Solo successful flee exits combat normally (enemies leash)"
    - "Failed flee allows re-attempting on subsequent ticks"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Flee reducer sets 'fleeing' status, combat_loop resolves flee attempts"
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "Flee chance calculation based on danger level"
  key_links:
    - from: "flee_combat reducer"
      to: "combat_loop reducer"
      via: "participant.status = 'fleeing' triggers resolution on next tick"
      pattern: "status.*fleeing"
    - from: "combat_loop"
      to: "calculateFleeChance"
      via: "helper function call"
      pattern: "calculateFleeChance"
---

<objective>
Implement chance-based flee mechanic where flee success depends on the region's danger level. Currently flee is instant and guaranteed (status set to 'fled'). Change to: flee_combat sets status to 'fleeing' and logs the attempt, then the next combat_loop tick resolves the attempt with a roll based on danger level.

Purpose: Add risk/reward to fleeing - harder zones make escape harder, creating meaningful combat decisions.
Output: Modified combat.ts reducer and combat.ts helper with flee chance logic.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/reducers/combat.ts (flee_combat reducer ~line 1019, combat_loop ~line 1501)
@spacetimedb/src/helpers/combat.ts (combat helper functions)
@spacetimedb/src/data/combat_constants.ts (combat timing constants)
@spacetimedb/src/schema/tables.ts (CombatParticipant, CombatEncounter, Region tables)
@spacetimedb/src/helpers/events.ts (appendPrivateEvent, appendGroupEvent, logPrivateAndGroup)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add flee chance helper and update flee reducer to set 'fleeing' status</name>
  <files>spacetimedb/src/helpers/combat.ts, spacetimedb/src/reducers/combat.ts</files>
  <action>
**In `spacetimedb/src/helpers/combat.ts`:**

Add a new exported function `calculateFleeChance` that takes the region's `dangerMultiplier` (bigint) and returns a flee success percentage (number, 0-100).

Formula:
- dangerMultiplier 100 (starter zone) = 90% flee chance (easy to escape)
- dangerMultiplier 160 (border zone) = 60% flee chance
- dangerMultiplier 200 (dungeon zone) = 40% flee chance
- Linear interpolation: `fleeChance = Math.max(10, Math.min(95, 120 - Number(dangerMultiplier) / 3))`
  - At 100: 120 - 33 = 87 (~90%)
  - At 160: 120 - 53 = 67 (~60%)
  - At 200: 120 - 67 = 53 (~40%)
  - Floor of 10% so it's never impossible, cap of 95% so it's never guaranteed

Use this formula: `Math.max(10, Math.min(95, 120 - Math.floor(Number(dangerMultiplier) / 3)))`

**In `spacetimedb/src/reducers/combat.ts` - `flee_combat` reducer (~line 1019):**

Change the flee_combat reducer:
1. Instead of setting `status: 'fled'`, set `status: 'fleeing'`
2. Keep the private event message as: `'You attempt to flee...'`
3. Add a group event: `appendGroupEvent(ctx, groupId, character.id, 'combat', '${character.name} attempts to flee.')` — need to get groupId from the character's group. Use `character.groupId` if it exists (effectiveGroupId pattern).
4. To get groupId, import `effectiveGroupId` from `../helpers/group` (it's already imported in combat.ts helpers). Use: `const groupId = effectiveGroupId(character); if (groupId) { appendGroupEvent(ctx, groupId, character.id, 'combat', \`${character.name} attempts to flee.\`); }`

The participant status 'fleeing' is the NEW interim status. 'fled' remains as the final resolved status (set by combat_loop on success).
  </action>
  <verify>
Check that the flee_combat reducer now sets status to 'fleeing' not 'fled'. Verify calculateFleeChance returns sensible values: `calculateFleeChance(100n)` returns ~87, `calculateFleeChance(200n)` returns ~53. TypeScript compilation: `cd spacetimedb && npx tsc --noEmit`.
  </verify>
  <done>flee_combat reducer sets 'fleeing' status and logs attempt message. calculateFleeChance helper exists and returns danger-scaled percentages.</done>
</task>

<task type="auto">
  <name>Task 2: Resolve flee attempts in combat_loop tick</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
**In the `combat_loop` reducer (~line 1501), add flee resolution logic AFTER the dead-participant check (line ~1542) and BEFORE the `activeParticipants` filtering (line ~1544).**

The logic should go right after the dead-status updates (line ~1542) and BEFORE `const refreshedParticipants = ...` (line ~1543).

Add a new block to resolve fleeing participants:

```
// Resolve flee attempts
for (const p of participants) {
  if (p.status !== 'fleeing') continue;
  const fleeingChar = ctx.db.character.id.find(p.characterId);
  if (!fleeingChar) continue;

  // Get danger level from combat location's region
  const fleeLocation = ctx.db.location.id.find(combat.locationId);
  const fleeRegion = fleeLocation ? ctx.db.region.id.find(fleeLocation.regionId) : null;
  const dangerMultiplier = fleeRegion?.dangerMultiplier ?? 100n;
  const fleeChance = calculateFleeChance(dangerMultiplier);

  // Deterministic roll using timestamp + character id
  const fleeRoll = Number((nowMicros + fleeingChar.id * 13n) % 100n);

  if (fleeRoll < fleeChance) {
    // SUCCESS - mark as fled
    ctx.db.combatParticipant.id.update({ ...p, status: 'fled' });

    // Remove from aggro list so enemies stop targeting them
    for (const entry of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
      if (entry.characterId === fleeingChar.id && !entry.petId) {
        ctx.db.aggroEntry.id.delete(entry.id);
      }
    }

    // Remove their pets
    for (const pet of ctx.db.combatPet.by_combat.filter(combat.id)) {
      if (pet.ownerCharacterId === fleeingChar.id) {
        ctx.db.combatPet.id.delete(pet.id);
      }
    }

    // Clear combat target
    ctx.db.character.id.update({ ...fleeingChar, combatTargetEnemyId: undefined });

    // Log success
    appendPrivateEvent(ctx, fleeingChar.id, fleeingChar.ownerUserId, 'combat', 'You successfully flee.');
    const fleeGroupId = effectiveGroupId(fleeingChar);
    if (fleeGroupId) {
      appendGroupEvent(ctx, fleeGroupId, fleeingChar.id, 'combat', `${fleeingChar.name} successfully flees.`);
    }
  } else {
    // FAILURE - revert to active so they can try again
    ctx.db.combatParticipant.id.update({ ...p, status: 'active' });

    appendPrivateEvent(ctx, fleeingChar.id, fleeingChar.ownerUserId, 'combat', 'You fail to flee!');
    const fleeGroupId = effectiveGroupId(fleeingChar);
    if (fleeGroupId) {
      appendGroupEvent(ctx, fleeGroupId, fleeingChar.id, 'combat', `${fleeingChar.name} fails to flee.`);
    }
  }
}
```

Import `calculateFleeChance` from `../helpers/combat` at the top of the file (it's already imported from there for other helpers). Also ensure `effectiveGroupId` is available - it's imported in combat.ts helpers but check if it's accessible in the reducer file. The reducers file imports from `../helpers/combat` which re-exports from `../helpers/group`. If `effectiveGroupId` is not directly available, import it from `'../helpers/group'`.

**IMPORTANT:** The `activeParticipants` filter on line ~1544 already filters for `status === 'active'` only, which means:
- 'fleeing' participants won't auto-attack (good - they're trying to flee, not fight)
- 'fleeing' participants won't be targeted by enemy abilities (pickEnemyTarget uses activeParticipants)
- BUT the aggro system still has their entries, so enemies may auto-attack them until the aggro entries are cleaned up on successful flee

The `activeParticipants` length check on line ~1549 (leash check) will naturally handle the solo-flee case: if a solo player flees successfully, activeParticipants becomes 0, triggering the leash logic that evades enemies and ends combat.

**Also ensure 'fleeing' participants are not auto-attacked by enemies.** Look at the enemy auto-attack section (~line 2311-2480). The `activeIds` set on line 2312 is built from `activeParticipants` which only includes status='active'. So enemies will only target 'active' players via aggro - BUT there's a check `if (!activeIds.has(entry.characterId)) continue;` on line 2327 which skips aggro entries for non-active participants. This means fleeing characters are already protected from being targeted. Good.

**One edge case:** If the fleeing character was the ONLY target and they succeed, enemies will have no valid targets. The `stillActive` check at line ~2483 will detect this and trigger the defeat/leash path. For solo players this is correct (combat ends). For groups where other members are still fighting, this won't happen because other members remain active.
  </action>
  <verify>
TypeScript compilation: `cd spacetimedb && npx tsc --noEmit`. Then publish and test: `spacetime publish uwr --project-path spacetimedb`. Test scenarios: (1) Solo flee attempt should log "You attempt to flee..." then on next tick resolve success/failure. (2) Flee in starter zone should succeed most of the time (~87%). (3) Failed flee should revert to active status allowing combat to continue.
  </verify>
  <done>Combat loop resolves 'fleeing' status on each tick with danger-based roll. Successful flee removes from aggro, logs success, solo flee ends combat via leash. Failed flee reverts to 'active' with failure message. Group members see flee attempt/success/failure in group log.</done>
</task>

</tasks>

<verification>
1. `cd spacetimedb && npx tsc --noEmit` — TypeScript compiles without errors
2. `spacetime publish uwr --project-path spacetimedb` — module publishes successfully
3. In-game: Click Flee in combat, see "You attempt to flee..." message
4. On next combat tick (~1 second): see either "You successfully flee." or "You fail to flee!"
5. On success: character exits combat (solo) or is removed from combat (group)
6. On failure: combat continues, can click Flee again
7. In group: other members see "<Name> attempts to flee" / succeeds / fails messages
</verification>

<success_criteria>
- Flee is no longer instant/guaranteed
- Flee chance scales with region danger (starter ~87%, dungeon ~53%)
- Flee resolves on the next combat tick, not immediately
- Solo successful flee ends combat (enemies leash)
- Group successful flee removes character from aggro and combat participation
- Failed flee allows retry
- All flee events (attempt/success/failure) visible in personal and group logs
</success_criteria>

<output>
After completion, create `.planning/quick/123-implement-chance-based-flee-mechanic-fle/123-SUMMARY.md`
</output>
