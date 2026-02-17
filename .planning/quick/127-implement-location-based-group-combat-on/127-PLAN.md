---
phase: quick-127
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/group.ts
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/reducers/movement.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true
must_haves:
  truths:
    - "Only group members at the puller's location enter combat as participants"
    - "Heals and buffs cannot target group members in a different location"
    - "Arriving at a location where your group is fighting auto-joins you to that combat"
    - "Members absent from the combat location receive no XP, loot, gold, quest credit, or renown"
  artifacts:
    - path: "spacetimedb/src/helpers/group.ts"
      provides: "Location-filtered group participant gathering"
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "Same-location validation for defensive ability targeting"
    - path: "spacetimedb/src/reducers/movement.ts"
      provides: "Auto-join combat on arrival at group's combat location"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Location-aware participant selection in start_combat, start_tracked_combat, resolve_pull"
  key_links:
    - from: "spacetimedb/src/helpers/group.ts"
      to: "spacetimedb/src/reducers/combat.ts"
      via: "getGroupOrSoloParticipants called in start_combat, start_tracked_combat, resolve_pull"
      pattern: "getGroupOrSoloParticipants"
    - from: "spacetimedb/src/reducers/movement.ts"
      to: "combatParticipant + aggroEntry tables"
      via: "Insert participant and aggro rows when character arrives at group combat location"
      pattern: "combatParticipant\\.insert|aggroEntry\\.insert"
---

<objective>
Implement location-based group combat so that only group members physically present at the same location as a pulled enemy participate in that combat. Members in different locations are excluded from combat entry, cannot receive heals/buffs from combatants, and earn no rewards. Arriving at the combat location mid-fight automatically joins the character to the ongoing combat.

Purpose: Prevents free-riding by absent group members and adds tactical depth to group play across multiple locations.
Output: Modified backend reducers and helpers enforcing location-based combat participation.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/helpers/group.ts
@spacetimedb/src/helpers/combat.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/reducers/movement.ts
@spacetimedb/src/schema/tables.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Filter combat participants by location and block cross-location ability targeting</name>
  <files>
    spacetimedb/src/helpers/group.ts
    spacetimedb/src/helpers/combat.ts
    spacetimedb/src/reducers/combat.ts
  </files>
  <action>
**1. Modify `getGroupOrSoloParticipants` in `spacetimedb/src/helpers/group.ts`:**

Currently this function returns ALL group members regardless of location. Add a location filter so only members at the same location as the initiating character are included:

```typescript
export const getGroupOrSoloParticipants = (ctx: any, character: any) => {
  const groupId = effectiveGroupId(character);
  if (!groupId) return [character];
  const participants: typeof character[] = [character];
  const seen = new Set([character.id.toString()]);
  for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
    if (seen.has(member.characterId.toString())) continue;
    const row = ctx.db.character.id.find(member.characterId);
    if (!row) continue;
    // Only include members at the same location as the combat initiator
    if (row.locationId !== character.locationId) continue;
    seen.add(row.id.toString());
    participants.push(row);
  }
  return participants;
};
```

This single change handles Requirement 1 across all three call sites: `start_combat` (line 688), `start_tracked_combat` (line 722), and `resolve_pull` (line 902) in `spacetimedb/src/reducers/combat.ts`. No changes needed to those reducers since they already call `getGroupOrSoloParticipants`.

**2. Add same-location check in `executeAbility` in `spacetimedb/src/helpers/combat.ts`:**

In the target validation block (around lines 328-337), after the existing group membership check, add a location check. The current code at line 331-332 checks:
```typescript
if (effectiveGroupId(targetCharacter) !== actorGroupId) {
  throw new SenderError('Target not in your group');
}
```

Add immediately after the group check (before the `} else if` on line 335):
```typescript
if (targetCharacter.locationId !== character.locationId) {
  throw new SenderError('Target is not at your location');
}
```

This blocks heals, buffs, and cleanses from reaching group members in different locations.

**3. Reward exclusion (Requirement 4) is automatically handled:**

Since `getGroupOrSoloParticipants` now only returns same-location members, and the reward loop in `combat_loop` (lines 2158-2430) iterates over `combatParticipant` rows (which are only created for same-location members), absent members naturally receive nothing: no XP, no loot, no gold, no quest credit, no faction standing, no renown. No additional changes needed in the reward section.
  </action>
  <verify>
Publish the module: `spacetime publish uwr --project-path spacetimedb`

Verify no compilation errors. Check that `getGroupOrSoloParticipants` has the `locationId` filter. Check that `executeAbility` has the location check for defensive targets. Test scenario: create a group with 2 characters at different locations, have one start combat -- only the local character should appear as a combatParticipant (check `spacetime logs uwr`).
  </verify>
  <done>
- `getGroupOrSoloParticipants` filters out group members not at the initiator's location
- `executeAbility` throws SenderError when targeting a group member at a different location
- Only same-location members get combatParticipant rows (and thus only they receive rewards)
  </done>
</task>

<task type="auto">
  <name>Task 2: Auto-join combat when traveling to group's active combat location</name>
  <files>
    spacetimedb/src/reducers/movement.ts
    spacetimedb/src/reducers/combat.ts
  </files>
  <action>
**1. In `spacetimedb/src/reducers/movement.ts`, add combat auto-join logic after each character moves.**

Import `activeCombatIdForCharacter` (already imported as a dep). The deps object already includes: `activeCombatIdForCharacter`, `effectiveGroupId`, `appendPrivateEvent`.

Additional deps needed: add `appendGroupEvent` to the destructured deps at the top of `registerMovementReducers`. It should already be available in the deps object passed to this function -- check the index.ts wiring. If not present, add it.

Inside the `moveOne` function (around line 116-130), AFTER the character's location is updated and events are appended, add auto-join logic:

```typescript
const moveOne = (charId: bigint) => {
  const row = ctx.db.character.id.find(charId)!;
  ctx.db.character.id.update({ ...row, locationId: location.id });
  appendPrivateEvent(ctx, row.id, row.ownerUserId, 'move', `You travel to ${location.name}. ${location.description}`);
  appendLocationEvent(ctx, originLocationId, 'move', `${row.name} departs.`, row.id);
  appendLocationEvent(ctx, location.id, 'move', `${row.name} arrives.`, row.id);
  ensureSpawnsForLocation(ctx, location.id);
  performPassiveSearch(ctx, ctx.db.character.id.find(charId)!, location.id, appendPrivateEvent);

  // AUTO-JOIN: If character's group has active combat at this location, join it
  const movedChar = ctx.db.character.id.find(charId)!;
  const gId = effectiveGroupId(movedChar);
  if (gId && !activeCombatIdForCharacter(ctx, movedChar.id)) {
    // Find active combat for this group at this location
    for (const combat of ctx.db.combatEncounter.by_group.filter(gId)) {
      if (combat.state !== 'active' || combat.locationId !== location.id) continue;
      // Character is not already a participant
      const alreadyIn = [...ctx.db.combatParticipant.by_character.filter(movedChar.id)]
        .some(p => p.combatId === combat.id);
      if (alreadyIn) break;

      // Add as combat participant
      const AUTO_ATTACK_INTERVAL = 5_000_000n;
      ctx.db.combatParticipant.insert({
        id: 0n,
        combatId: combat.id,
        characterId: movedChar.id,
        status: 'active',
        nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + AUTO_ATTACK_INTERVAL,
      });

      // Add aggro entries for all living enemies in this combat
      const enemies = [...ctx.db.combatEnemy.by_combat.filter(combat.id)];
      for (const enemy of enemies) {
        if (enemy.currentHp <= 0n) continue;
        ctx.db.aggroEntry.insert({
          id: 0n,
          combatId: combat.id,
          enemyId: enemy.id,
          characterId: movedChar.id,
          petId: undefined,
          value: 0n,
        });
      }

      // Auto-target first living enemy if character has no target
      const firstLiving = enemies.find(e => e.currentHp > 0n);
      if (firstLiving && !movedChar.combatTargetEnemyId) {
        ctx.db.character.id.update({ ...movedChar, combatTargetEnemyId: firstLiving.id });
      }

      appendPrivateEvent(ctx, movedChar.id, movedChar.ownerUserId, 'combat',
        'You join your group in combat!');
      // Notify group
      if (deps.appendGroupEvent) {
        deps.appendGroupEvent(ctx, gId, movedChar.id, 'combat',
          `${movedChar.name} joins the fight!`);
      }
      break; // Only join one combat
    }
  }
};
```

**2. Wire `appendGroupEvent` in movement deps if not already present.**

Check `spacetimedb/src/reducers/index.ts` (or wherever `registerMovementReducers` is called) to see what deps are passed. Add `appendGroupEvent` to the deps object if missing. The function is exported from `helpers/events.ts`.

The constant `AUTO_ATTACK_INTERVAL` (5_000_000n) is defined inline to avoid importing from combat which could create circular deps. This matches the value used elsewhere.
  </action>
  <verify>
Publish the module: `spacetime publish uwr --project-path spacetimedb`

Verify no compilation errors. Test scenario: character A starts combat at Location X. Character B (same group, different location) travels to Location X. Check logs for "joins the fight" message. Verify B appears in combatParticipant table for the active combat. Verify B gets aggro entries for living enemies.
  </verify>
  <done>
- Moving to a location where your group is in active combat automatically creates a combatParticipant row and aggroEntry rows for the arriving character
- The arriving character gets a "You join your group in combat!" message
- The group gets a "{name} joins the fight!" notification
- The arriving character auto-targets the first living enemy
  </done>
</task>

</tasks>

<verification>
1. Start combat with a grouped character -- only same-location group members should become participants
2. Attempt to heal a group member at a different location -- should get "Target is not at your location" error
3. Move a group member to the combat location mid-fight -- should auto-join combat with participant + aggro rows
4. Kill the enemy -- only participants (same-location members) should receive XP, loot, gold, quest credit, standing, renown
5. Verify members who stayed at a different location receive nothing
</verification>

<success_criteria>
- getGroupOrSoloParticipants filters by locationId, excluding remote group members from combat entry
- executeAbility rejects defensive targeting across locations with clear error message
- move_character auto-joins arriving group members to active group combat at destination
- Rewards (XP, loot, gold, quest credit, faction standing, renown) are only granted to combatParticipants -- which are exclusively same-location members
- Module publishes without errors
</success_criteria>

<output>
After completion, create `.planning/quick/127-implement-location-based-group-combat-on/127-SUMMARY.md`
</output>
