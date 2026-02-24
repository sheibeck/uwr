---
phase: quick-304
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [COMBAT-COOLDOWN-REGEN, STAMINA-REGEN-BUMP]
must_haves:
  truths:
    - "After combat ends, characters use in-combat regen rates for 3 seconds before switching to out-of-combat rates"
    - "Stamina in-combat regen is 2 per tick (up from 1)"
    - "Out-of-combat stamina regen formula has +1 bump"
  artifacts:
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "lastCombatEndAt optional timestamp field on Character table"
      contains: "lastCombatEndAt"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Combat cooldown logic in regen_health and stamping in clearCombatArtifacts"
      contains: "COMBAT_COOLDOWN_MICROS"
  key_links:
    - from: "clearCombatArtifacts in combat.ts"
      to: "Character.lastCombatEndAt"
      via: "stamps ctx.timestamp on each participant when combat ends"
      pattern: "lastCombatEndAt.*ctx\\.timestamp"
    - from: "regen_health reducer in combat.ts"
      to: "Character.lastCombatEndAt"
      via: "checks if within 3s cooldown to use in-combat rates"
      pattern: "COMBAT_COOLDOWN_MICROS"
---

<objective>
Add a 3-second combat cooldown before out-of-combat regen kicks in, and bump stamina regen rates.

Purpose: Characters currently switch to high out-of-combat regen instantly when combat ends, making recovery trivially fast. A 3-second cooldown using in-combat rates creates a smoother transition. Stamina regen is also too low in combat.
Output: Modified schema with lastCombatEndAt field, updated regen logic and stamina constants.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/schema/tables.ts (Character table definition, lines 258-325)
@spacetimedb/src/reducers/combat.ts (clearCombatArtifacts ~line 333, regen_health ~line 1302, constants ~line 1295)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add lastCombatEndAt field to Character table</name>
  <files>spacetimedb/src/schema/tables.ts</files>
  <action>
Add an optional timestamp field `lastCombatEndAt` to the Character table definition (around line 323, after the last racial field):

```typescript
lastCombatEndAt: t.u64().optional(),
```

This stores microseconds-since-epoch (matching ctx.timestamp.microsSinceUnixEpoch) of when the character last exited combat. Using u64 instead of t.timestamp() to keep it consistent with the existing microsecond arithmetic used throughout the regen system (e.g., REGEN_TICK_MICROS, startedAtMicros patterns). Optional because characters who have never been in combat will have undefined.
  </action>
  <verify>Check that the schema file parses without TypeScript errors: look for the field in the Character table definition.</verify>
  <done>Character table has `lastCombatEndAt: t.u64().optional()` field.</done>
</task>

<task type="auto">
  <name>Task 2: Stamp lastCombatEndAt in clearCombatArtifacts and update regen logic</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
Three changes in this file:

**A) Stamp lastCombatEndAt in clearCombatArtifacts (around line 362-366)**

In the existing loop that iterates `participantIds` and clears `combatTargetEnemyId`, also set `lastCombatEndAt`. The existing code at lines 362-366 is:

```typescript
for (const characterId of participantIds) {
  const character = ctx.db.character.id.find(characterId);
  if (character && character.combatTargetEnemyId) {
    ctx.db.character.id.update({ ...character, combatTargetEnemyId: undefined });
  }
```

Change this to ALWAYS update the character row to stamp the timestamp (not just when combatTargetEnemyId is set):

```typescript
for (const characterId of participantIds) {
  const character = ctx.db.character.id.find(characterId);
  if (character) {
    ctx.db.character.id.update({
      ...character,
      combatTargetEnemyId: undefined,
      lastCombatEndAt: ctx.timestamp.microsSinceUnixEpoch,
    });
  }
```

Note: the `if (character && character.combatTargetEnemyId)` guard becomes just `if (character)` because we always want to stamp the timestamp, and setting `combatTargetEnemyId: undefined` on a row where it is already undefined is harmless.

**B) Add COMBAT_COOLDOWN_MICROS constant and update STAMINA_REGEN_IN (around line 1295-1298)**

Change the constants block from:
```typescript
const HP_REGEN_IN = 2n;
const MANA_REGEN_IN = 2n;
const STAMINA_REGEN_IN = 1n;
```

To:
```typescript
const HP_REGEN_IN = 2n;
const MANA_REGEN_IN = 2n;
const STAMINA_REGEN_IN = 2n;  // bumped from 1
const COMBAT_COOLDOWN_MICROS = 3_000_000n;  // 3 seconds post-combat cooldown
```

**C) Update regen_health reducer logic (around line 1307)**

Currently line 1307 is:
```typescript
const inCombat = !!activeCombatIdForCharacter(ctx, character.id);
```

Change the combat state determination to also account for the 3-second post-combat cooldown:

```typescript
const activelyInCombat = !!activeCombatIdForCharacter(ctx, character.id);
const inCooldown = !activelyInCombat && character.lastCombatEndAt !== undefined && character.lastCombatEndAt !== null &&
  (ctx.timestamp.microsSinceUnixEpoch - character.lastCombatEndAt) < COMBAT_COOLDOWN_MICROS;
const inCombat = activelyInCombat || inCooldown;
```

This means `inCombat` is true if either actively in combat OR within 3 seconds of combat ending. All downstream regen logic (lines 1308-1367) continues to use `inCombat` unchanged, which means:
- HP/mana/stamina all use in-combat rates during cooldown
- The `halfTick` skip applies during cooldown (slower tick rate)
- Cooldown cleanup of ability cooldowns is deferred until after the 3s window

**D) Bump out-of-combat stamina regen (line 1320)**

Change:
```typescript
const staminaRegen = inCombat ? STAMINA_REGEN_IN : (character.maxStamina / 12n > 2n ? character.maxStamina / 12n : 2n);
```

To:
```typescript
const staminaRegen = inCombat ? STAMINA_REGEN_IN : (character.maxStamina / 12n > 3n ? character.maxStamina / 12n : 3n);
```

This bumps the minimum out-of-combat stamina regen from 2 to 3 (the +1 bump requested).
  </action>
  <verify>
1. Verify the constants: `grep -n "STAMINA_REGEN_IN\|COMBAT_COOLDOWN_MICROS" spacetimedb/src/reducers/combat.ts` should show STAMINA_REGEN_IN = 2n and COMBAT_COOLDOWN_MICROS = 3_000_000n
2. Verify the cooldown logic: `grep -n "inCooldown\|activelyInCombat" spacetimedb/src/reducers/combat.ts` should show the new variables
3. Verify the timestamp stamping: `grep -n "lastCombatEndAt" spacetimedb/src/reducers/combat.ts` should show the stamp in clearCombatArtifacts
4. Verify out-of-combat stamina minimum: `grep -n "3n ? character.maxStamina" spacetimedb/src/reducers/combat.ts` should show the bumped floor
5. Publish locally: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb --clear-database -y` (clear needed for schema change)
  </verify>
  <done>
- clearCombatArtifacts stamps lastCombatEndAt on every participant when combat ends
- regen_health treats characters within 3 seconds of combat end as "in combat" for regen purposes
- STAMINA_REGEN_IN is 2n (up from 1n)
- Out-of-combat stamina regen minimum floor is 3 (up from 2)
- Module publishes and runs successfully on local SpacetimeDB
  </done>
</task>

</tasks>

<verification>
- Publish module locally with `--clear-database` (schema change requires it)
- Check `spacetime logs uwr` for any runtime errors
- Verify regen_health reducer fires without errors by checking logs after a character exists
</verification>

<success_criteria>
- Character table has `lastCombatEndAt` optional u64 field
- clearCombatArtifacts stamps `lastCombatEndAt` on all combat participants when combat ends
- regen_health uses in-combat rates for 3 seconds after combat ends (checks lastCombatEndAt)
- STAMINA_REGEN_IN = 2n (was 1n)
- Out-of-combat stamina regen floor = 3 (was 2)
- Module publishes and runs on local SpacetimeDB without errors
</success_criteria>

<output>
After completion, create `.planning/quick/304-3s-combat-cooldown-before-out-of-combat-/304-SUMMARY.md`
</output>
