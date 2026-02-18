---
phase: quick-167
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
autonomous: true
must_haves:
  truths:
    - "Enemy HP in combat = template.maxHp (individual) + role.baseHpBonus + role.hpBonusPerLevel * level"
    - "Tank enemies have the most HP bonus, healer second, support third, damage fourth"
    - "Individual seeded maxHp values in ensure_enemies.ts are unchanged"
    - "Enemy heal ability correctly caps at computed maxHp (not stale template.maxHp)"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "ENEMY_ROLE_CONFIG with baseHpBonus/hpBonusPerLevel fields, computeEnemyStats incorporating template.maxHp + role HP bonus"
      contains: "baseHpBonus"
  key_links:
    - from: "spacetimedb/src/helpers/combat.ts:computeEnemyStats"
      to: "spacetimedb/src/helpers/combat.ts:ENEMY_ROLE_CONFIG"
      via: "role.baseHpBonus + role.hpBonusPerLevel * effectiveLevel"
      pattern: "template\\.maxHp.*baseHpBonus"
---

<objective>
Add configurable role-based HP bonuses to enemies, mirroring the armor pattern from quick-159.

Currently `computeEnemyStats` ignores `template.maxHp` entirely and derives HP purely from role config
(`role.baseHp + role.hpPerLevel * effectiveLevel`). The user wants individual enemy maxHp values
preserved as a baseline, with a role-based bonus added on top that can be easily tuned.

Additionally, the existing `baseHp`/`hpPerLevel` fields should be renamed to `baseHpBonus`/`hpBonusPerLevel`
to clearly communicate they are additive bonuses (matching the naming intent), and the HP priority must be
reordered: tank (most) > healer > support > damage (least).

Also fixes a stale heal-cap bug where enemy healer abilities cap healing at `template.maxHp` instead of
the computed combat `maxHp` stored on the `combatEnemy` row.

Purpose: Scale enemy HP to match rising player ability damage, with easy config tuning.
Output: Updated combat.ts with role-based HP bonus system.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md (decision 150 — role-driven enemy AC pattern to mirror)
@spacetimedb/src/helpers/combat.ts (ENEMY_ROLE_CONFIG, computeEnemyStats, enemy heal cap)
@spacetimedb/src/seeding/ensure_enemies.ts (READ ONLY — individual maxHp values for context)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add role-based HP bonus config and update computeEnemyStats</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
In `spacetimedb/src/helpers/combat.ts`, make these changes:

1. **Rename ENEMY_ROLE_CONFIG HP fields** to clarify they are bonuses:
   - `baseHp` -> `baseHpBonus`
   - `hpPerLevel` -> `hpBonusPerLevel`

2. **Update the type annotation** on ENEMY_ROLE_CONFIG (line 64-66) to use the new field names:
   `{ hpBonusPerLevel: bigint; damagePerLevel: bigint; baseHpBonus: bigint; baseDamage: bigint; baseArmor: bigint; armorPerLevel: bigint }`

3. **Reorder HP bonus values** to match priority tank > healer > support > damage:
   - `tank`:    `baseHpBonus: 60n, hpBonusPerLevel: 15n` (unchanged — already highest)
   - `healer`:  `baseHpBonus: 45n, hpBonusPerLevel: 12n` (bumped up from 30n/8n — second highest)
   - `support`: `baseHpBonus: 35n, hpBonusPerLevel: 10n` (unchanged)
   - `damage`:  `baseHpBonus: 20n, hpBonusPerLevel: 8n`  (reduced from 40n/10n — lowest)

4. **Update `computeEnemyStats`** (around line 1946) to incorporate `template.maxHp` as individual baseline, mirroring the armor pattern:
   Change:
   ```typescript
   const baseHp = role.baseHp + role.hpPerLevel * effectiveLevel;
   ```
   To:
   ```typescript
   const baseHp = template.maxHp + role.baseHpBonus + role.hpBonusPerLevel * effectiveLevel;
   ```
   This mirrors the existing armor line: `template.armorClass + role.baseArmor + role.armorPerLevel * effectiveLevel`

5. **Fix the stale heal-cap bug** around line 1662-1665 in the enemy heal ability handler.
   Change:
   ```typescript
   const healTargetTemplate = ctx.db.enemyTemplate.id.find(healTarget.enemyTemplateId);
   const maxHp = healTargetTemplate?.maxHp ?? 100n;
   ```
   To:
   ```typescript
   const maxHp = healTarget.maxHp;
   ```
   The `combatEnemy` row already has the correct computed `maxHp` from `computeEnemyStats`. Reading from the template gives the stale seeded value, not the combat-computed value.

6. **Find-and-replace any other references** to the old field names (`role.baseHp`, `role.hpPerLevel`) in combat.ts. The `getEnemyRole` function returns the config object, so any consumer reading `.baseHp` or `.hpPerLevel` must be updated to `.baseHpBonus` / `.hpBonusPerLevel`. Search the entire file to confirm no references are missed.
  </action>
  <verify>
Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` to confirm no type errors.
Grep for old field names: `grep -n "baseHp\b\|hpPerLevel" spacetimedb/src/helpers/combat.ts` should return zero matches (except inside string literals or comments if any).
  </verify>
  <done>
ENEMY_ROLE_CONFIG has baseHpBonus/hpBonusPerLevel fields with tank > healer > support > damage ordering. computeEnemyStats formula is `template.maxHp + role.baseHpBonus + role.hpBonusPerLevel * effectiveLevel`. Enemy heal cap uses combatEnemy.maxHp instead of stale template value. No type errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Publish module and verify</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
1. Publish the module: `spacetime publish uwr --project-path spacetimedb`
   (No --clear-database needed since no schema changes — only runtime logic changed.)

2. Check logs for errors: `spacetime logs uwr --num-lines 20`

3. If publish fails with type errors, fix them in combat.ts and retry.
  </action>
  <verify>
`spacetime publish` completes without errors. `spacetime logs uwr --num-lines 20` shows no runtime errors related to enemy HP or combat.
  </verify>
  <done>
Module published successfully with updated enemy HP bonus system. No errors in logs.
  </done>
</task>

</tasks>

<verification>
- ENEMY_ROLE_CONFIG uses baseHpBonus/hpBonusPerLevel (not baseHp/hpPerLevel)
- HP priority ordering: tank(60n/15n) > healer(45n/12n) > support(35n/10n) > damage(20n/8n)
- computeEnemyStats: `template.maxHp + role.baseHpBonus + role.hpBonusPerLevel * effectiveLevel`
- Enemy heal cap reads from combatEnemy.maxHp (not template.maxHp)
- ensure_enemies.ts is NOT modified
- Module publishes without errors
</verification>

<success_criteria>
Enemy combat HP now equals individual seeded maxHp + role-based configurable bonus. Tank enemies have the most HP, healers second, support third, damage fourth. Values are easily tunable by editing ENEMY_ROLE_CONFIG in combat.ts.
</success_criteria>

<output>
After completion, create `.planning/quick/167-role-based-hp-bonus-for-enemies-mirrorin/167-SUMMARY.md`
</output>
