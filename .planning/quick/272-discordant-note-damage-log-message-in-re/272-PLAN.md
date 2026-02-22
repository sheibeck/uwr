---
phase: quick-272
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements:
  - QUICK-272
must_haves:
  truths:
    - "When discordant note ticks, a red damage message appears in the bard's log"
    - "The message reads 'Discordant Note deals X damage to all enemies.' with the actual total damage dealt"
    - "The message is visible to the bard and all group members"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Updated bard_discordant_note case with total damage accumulation and logPrivateAndGroup call"
      contains: "logPrivateAndGroup"
  key_links:
    - from: "bard_discordant_note case"
      to: "logPrivateAndGroup"
      via: "totalDamage accumulation"
      pattern: "logPrivateAndGroup.*bard.*damage.*Discordant"
---

<objective>
Add a red damage log message when the bard's Discordant Note song ticks AoE damage.

Purpose: Gives the bard and group feedback on how much damage Discordant Note is dealing each tick, matching the pattern established by Melody of Mending's healing message.
Output: `spacetimedb/src/reducers/combat.ts` updated with total damage accumulation and `logPrivateAndGroup` call using kind `'damage'`.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/helpers/events.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Accumulate total damage and log red message for Discordant Note tick</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In the `tick_bard_songs` reducer, locate the `case 'bard_discordant_note':` block (around line 1774).

Currently the block applies damage per enemy and calls `appendPrivateEvent` with kind `'ability'`.

Replace that block with:

```typescript
case 'bard_discordant_note': {
  // AoE sonic damage to all enemies — scales with level + CHA
  let totalDamage = 0n;
  for (const en of enemies) {
    const dmg = 8n + bard.level * 2n + bard.cha;
    const actualDmg = en.currentHp > dmg ? dmg : en.currentHp;
    totalDamage += actualDmg;
    const nextHp = en.currentHp > dmg ? en.currentHp - dmg : 0n;
    ctx.db.combatEnemy.id.update({ ...en, currentHp: nextHp });
  }
  // Small mana drain per pulse
  const freshBardDN = ctx.db.character.id.find(bard.id);
  if (freshBardDN && freshBardDN.mana > 0n) {
    const manaCost = 3n;
    const newMana = freshBardDN.mana > manaCost ? freshBardDN.mana - manaCost : 0n;
    ctx.db.character.id.update({ ...freshBardDN, mana: newMana });
  }
  logPrivateAndGroup(ctx, bard, 'damage', `Discordant Note deals ${totalDamage} damage to all enemies.`);
  break;
}
```

Key points:
- `actualDmg` is clamped so enemies that die don't inflate total (same logic as HP clamping)
- Kind is `'damage'` so it renders red in the client log
- `logPrivateAndGroup` sends to the bard's private log AND the group event feed — identical to `melody_of_mending` and `chorus_of_vigor` patterns
- The old `appendPrivateEvent` call is fully replaced

`logPrivateAndGroup` is already imported via `spacetimedb/src/helpers/events.ts` and used elsewhere in this same file — no import change needed.
  </action>
  <verify>
Run the TypeScript compiler to confirm no type errors:

```bash
cd /c/projects/uwr/spacetimedb && npx tsc --noEmit
```

Optionally, grep to confirm the new pattern is in place:

```bash
grep -n "Discordant Note deals" /c/projects/uwr/spacetimedb/src/reducers/combat.ts
grep -n "logPrivateAndGroup.*bard\|bard.*logPrivateAndGroup\|totalDamage" /c/projects/uwr/spacetimedb/src/reducers/combat.ts
```
  </verify>
  <done>
TypeScript compiles clean. The `bard_discordant_note` case accumulates `totalDamage` across all enemies, applies clamped HP reduction, and calls `logPrivateAndGroup(ctx, bard, 'damage', "Discordant Note deals X damage to all enemies.")`. The old `appendPrivateEvent` with kind `'ability'` is gone.
  </done>
</task>

</tasks>

<verification>
After the code change:
1. `npx tsc --noEmit` passes with no errors in the spacetimedb module
2. The pattern `logPrivateAndGroup.*damage.*Discordant` or equivalent appears in combat.ts
3. No remaining `appendPrivateEvent.*discordant\|Discordant Note deals sonic` line exists (old message is gone)
</verification>

<success_criteria>
When a bard has Discordant Note active during combat, every 6-second song tick produces a red log entry ("Discordant Note deals X damage to all enemies.") visible in the bard's event log and the group feed. The total X accurately reflects sum of damage dealt (clamped to actual HP for near-dead enemies).
</success_criteria>

<output>
After completion, create `.planning/quick/272-discordant-note-damage-log-message-in-re/272-01-SUMMARY.md` using the summary template.
</output>
