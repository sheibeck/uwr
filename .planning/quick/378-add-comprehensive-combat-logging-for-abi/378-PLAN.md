---
phase: quick-378
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [COMBAT-LOG-01]
must_haves:
  truths:
    - "Player sees a log message when an enemy uses an ability on them"
    - "Player sees a log message when a DoT/HoT ticks on them or an enemy"
    - "Player sees a log message when a buff or debuff is applied"
    - "Player sees a log message when an effect expires"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "Enemy ability logging in resolveAbility for all kinds"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Effect expiry logging in tickEffectsForRound"
  key_links:
    - from: "spacetimedb/src/helpers/combat.ts"
      to: "event_private table"
      via: "appendPrivateEvent calls"
      pattern: "appendPrivateEvent.*ability|damage|heal"
---

<objective>
Add comprehensive combat logging so every combat action produces a narrative log entry visible to the player.

Purpose: Players currently only see auto-attack damage in their combat log. Ability damage/effects, DoT/HoT ticks, buff/debuff application, and effect expiry are all silent. This makes combat incomprehensible.

Output: Updated combat helpers and reducers with complete logging for all combat actions.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/combat.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/helpers/events.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add enemy-actor logging to all ability kinds in resolveAbility</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
In the `resolveAbility` function, most ability kind handlers only log when `actor.type === 'character'`. Add logging for enemy actors targeting players. The target character info is available via `targetCharacterId` parameter.

For each kind, add an `else if (actor.type === 'enemy')` branch (or just an else block) that logs to the target player:

1. **`damage` kind (line ~465)**: After `applyDamageToEnemy`, add else branch for enemy actor. When enemy uses damage ability on a player (via `targetCharacterId`), find the target character and log: `"{actorName}'s {abilityName} hits you for {dealt} damage."` using `logPrivate(target.id, target.ownerUserId, 'damage', msg)`. Note: enemy `damage` kind currently calls `findEnemyTarget()` which returns another enemy -- for enemy-on-player damage, the `aoe_damage` kind's enemy branch is actually what gets used. But add the logging guard anyway for completeness.

2. **`dot` kind (line ~516)**: Add else branch for enemy actor. When enemy applies DoT, find target character via `targetCharacterId` and log: `"{actorName}'s {abilityName} hits you for {dealt} damage and applies a burning effect."` Also note the DoT was applied.

3. **`buff` kind (line ~561)**: Add else branch for enemy actor. Log to all combat participants: `"{actorName} uses {abilityName}."` — enemies buffing themselves should be visible to players.

4. **`debuff` kind (line ~584)**: This kind targets enemies (from player perspective), so enemy actors wouldn't use this on players. However, add a guard log for completeness: if enemy actor, find target character and log `"{actorName}'s {abilityName} weakens you."`.

5. **`shield` kind (line ~606)**: Add else branch for enemy actor to notify participants: `"{actorName} shields itself with {abilityName}."`.

6. **`cc` kind (line ~739)**: Add else branch for enemy actor. If enemy stuns a player, find target character via `targetCharacterId` and log: `"{actorName}'s {abilityName} stuns you!"`.

7. **`drain` kind (line ~754)**: Already has character-only logging. Add enemy actor logging to target: `"{actorName}'s {abilityName} drains you for {dealt} damage."`.

8. **`execute` kind (line ~775)**: Add enemy actor logging to target: `"{actorName}'s {abilityName} hits you for {dealt} damage{bonusMsg}."`.

For all enemy-actor logging, get the target character from `targetCharacterId`:
```typescript
if (actor.type === 'enemy' && targetCharacterId) {
  const target = ctx.db.character.id.find(targetCharacterId);
  if (target) logPrivate(target.id, target.ownerUserId, 'damage', `${actor.name}'s ${ability.name} hits you for ${dealt} damage.`);
}
```

Also add logging in `addCharacterEffect` (line ~182) for the immediate first tick of DoTs and HoTs:
- For `regen` (HoT first tick): After applying heal at line ~216, add: find character, call `appendPrivateEvent(ctx, character.id, character.ownerUserId, 'heal', "{sourceAbility} heals you for {magnitude}.")`.
- For `dot` (DoT first tick on player): After applying damage at line ~218, add: find updated character, call `appendPrivateEvent(ctx, character.id, character.ownerUserId, 'damage', "{sourceAbility} burns you for {magnitude} damage.")`.

Import `appendPrivateEvent` if not already imported (it IS already imported at line 23).
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>Every ability kind in resolveAbility logs to the affected player regardless of whether the actor is a character or enemy. First-tick DoT/HoT effects in addCharacterEffect also produce log messages.</done>
</task>

<task type="auto">
  <name>Task 2: Add effect expiry and buff/debuff application logging in tickEffectsForRound</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In `tickEffectsForRound` (line ~2476 in combat.ts), add logging for:

1. **Effect expiry messages** (line ~2505-2515): When `newRounds <= 0n` and the effect is about to be deleted, log to the character BEFORE deleting:
   - For character effects: `appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', "{sourceAbility ?? effectType} has worn off.")` — but only for meaningful effect types (skip `food_health_regen`, `food_mana_regen`, `food_stamina_regen`, `travel_discount` to avoid spam). Log for: `regen`, `dot`, `damage_up`, `armor_up`, `ac_bonus`, `damage_shield`, `hp_bonus`, `magic_resist`, `stamina_free`, `stun`, `armor_down`.

2. **Enemy effect expiry** (line ~2558-2559): When enemy stun/dot effects expire, notify all participants: `appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', "{sourceAbility} on {enemy.displayName} fades.")` for each participant.

3. **Enemy DoT tick notifications already exist** at line ~2536-2541 (they log to all participants). No change needed there.

Do NOT add logging for every regen tick (health/mana/stamina regen is every 8s and would spam the log). Only log combat-relevant effect ticks (DoT, HoT/regen within combat).

Keep the existing DoT/regen tick logging in tickEffectsForRound as-is (lines 2488-2495 already log these correctly for character effects).
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>Effect expiry produces a narrative log entry for the affected player. Enemy effect expiry notifies all combat participants. No spam from food/travel/regen effects.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p spacetimedb/tsconfig.json` compiles cleanly
- Publish locally: `spacetime publish uwr -p spacetimedb`
- In-game: use an ability in combat and see the damage/effect logged
- In-game: observe enemy ability usage produces log entries
- In-game: watch a DoT/HoT tick and see periodic messages
- In-game: see "X has worn off" when effects expire
</verification>

<success_criteria>
Every combat action (player abilities, enemy abilities, DoT/HoT ticks, buff/debuff application, effect expiry) produces a visible narrative log entry for the affected player.
</success_criteria>

<output>
After completion, create `.planning/quick/378-add-comprehensive-combat-logging-for-abi/378-SUMMARY.md`
</output>
</task>
