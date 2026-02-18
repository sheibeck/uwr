---
phase: 153-fix-sanctify-generating-two-log-messages
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/items.ts
autonomous: true
must_haves:
  truths:
    - "Casting Sanctify on a friendly player generates exactly one log message"
    - "The log message references the friendly target, not the combat enemy"
  artifacts:
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "Fixed generic ability log that respects explicit targetCharacterId"
  key_links:
    - from: "items.ts use_ability reducer"
      to: "targetName resolution block"
      via: "args.targetCharacterId guard on enemy name override"
      pattern: "args\\.targetCharacterId"
---

<objective>
Fix the double log message bug in the use_ability reducer where casting Sanctify on a friendly character also generates a spurious "You use cleric sanctify on [enemy]" message.

Purpose: The generic post-ability log at items.ts ~line 662 unconditionally overrides targetName with the combat enemy's name even when the ability has an explicit targetCharacterId pointing to a friendly. This causes a second incorrect log entry.
Output: Single correct log message when Sanctify (or any friendly-targeted ability) is cast in combat.
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
  <name>Task 1: Guard enemy-name override behind targetCharacterId check</name>
  <files>spacetimedb/src/reducers/items.ts</files>
  <action>
In the `use_ability` reducer (around line 658-679 of items.ts), the block that resolves `targetName` currently:

1. Sets targetName to the friendly character's name if `args.targetCharacterId` is provided (line 659-661)
2. Then unconditionally overwrites targetName with the combat enemy's name if the character is in combat (lines 662-671)

Step 2 must only run when `args.targetCharacterId` is NOT provided (i.e., the ability targets the enemy or has no explicit target). Change the `if (combatId)` block to `if (combatId && !args.targetCharacterId)` so that when the caster explicitly targeted a friendly character, the enemy-name override is skipped.

Exact change in `spacetimedb/src/reducers/items.ts`:

Before:
```typescript
        if (combatId) {
          const enemies = [...ctx.db.combatEnemy.by_combat.filter(combatId)];
```

After:
```typescript
        if (combatId && !args.targetCharacterId) {
          const enemies = [...ctx.db.combatEnemy.by_combat.filter(combatId)];
```

No other changes needed. The rest of the block (enemy lookup, template name) is unchanged.
  </action>
  <verify>
1. Publish the module: `spacetime publish uwr --project-path spacetimedb`
2. In-game: cast Sanctify on a friendly player while in combat with an enemy
3. Confirm only one log line appears: "Sanctify cleanses [friendly name]."
4. Confirm NO "You use cleric sanctify on [enemy name]." message appears
5. Also test an offensive ability (e.g., cleric_smite with no explicit targetCharacterId) still logs "You use ... on [enemy]."
  </verify>
  <done>Sanctify targeting a friendly in combat produces exactly one log entry referencing the friendly target. Offensive abilities still log the enemy name correctly.</done>
</task>

</tasks>

<verification>
- `spacetime publish uwr --project-path spacetimedb` succeeds with no errors
- Single log message on Sanctify cast against friendly target in combat
- Generic log still fires correctly for abilities that do NOT set targetCharacterId
</verification>

<success_criteria>
"Sanctify cleanses warrior." appears once. "You use cleric sanctify on Blight Stalker." does not appear.
</success_criteria>

<output>
After completion, create `.planning/quick/153-fix-sanctify-generating-two-log-messages/153-01-SUMMARY.md`
</output>
