---
phase: 298-enemy-attack-speed-by-role
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat_enemies.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [ENEMY-ATTACK-SPEED]

must_haves:
  truths:
    - "Damage-role enemies auto-attack every 3.5s instead of 5.0s"
    - "Tank-role enemies auto-attack every 5.0s (unchanged)"
    - "Healer-role enemies auto-attack every 4.0s"
    - "Support-role enemies auto-attack every 4.0s"
    - "DPS output per enemy role stays roughly the same despite speed changes"
    - "Pets and pull-add delay still use the generic 5s AUTO_ATTACK_INTERVAL"
  artifacts:
    - path: "spacetimedb/src/helpers/combat_enemies.ts"
      provides: "attackSpeedMicros per role in ENEMY_ROLE_CONFIG, getEnemyAttackSpeed helper"
      contains: "attackSpeedMicros"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Role-based enemy attack scheduling using getEnemyAttackSpeed"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "spacetimedb/src/helpers/combat_enemies.ts"
      via: "import getEnemyAttackSpeed"
      pattern: "getEnemyAttackSpeed"
---

<objective>
Add per-role attack speed to enemies so different roles feel mechanically distinct.
Currently all enemies auto-attack at a hardcoded 5.0s interval. After this change:
- damage: 3.5s (fast, threatening)
- tank: 5.0s (unchanged)
- healer: 4.0s (moderate)
- support: 4.0s (moderate)

Per-hit damage is rebalanced inversely with speed so DPS stays roughly the same.

Purpose: Make combat more dynamic; damage-role enemies feel dangerous with fast attacks while tanks hit slower but harder.
Output: Updated combat_enemies.ts and combat.ts with role-based enemy attack speed.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/combat_enemies.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/data/combat_constants.ts
@spacetimedb/src/schema/tables.ts (CombatEnemy table, EnemyRoleTemplate table)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add attackSpeedMicros to ENEMY_ROLE_CONFIG and rebalance damage</name>
  <files>spacetimedb/src/helpers/combat_enemies.ts</files>
  <action>
1. Update the `ENEMY_ROLE_CONFIG` Record type to include `attackSpeedMicros: bigint`.

2. Add `attackSpeedMicros` to each role entry:
   - damage:  3_500_000n (3.5s)
   - tank:    5_000_000n (5.0s)
   - healer:  4_000_000n (4.0s)
   - support: 4_000_000n (4.0s)

3. Rebalance `baseDamage` and `damagePerLevel` inversely with speed to keep DPS constant.
   The current values were balanced around 5.0s. Scale factor = oldSpeed / newSpeed.

   Current values (at 5.0s):
   - damage:  baseDamage=12n, damagePerLevel=5n
   - tank:    baseDamage=8n,  damagePerLevel=3n  (5.0s unchanged, no rebalance needed)
   - healer:  baseDamage=6n,  damagePerLevel=2n
   - support: baseDamage=7n,  damagePerLevel=3n

   Rebalanced (multiply by 5.0/newSpeed, round to nearest bigint):
   - damage (5.0/3.5 = 1.4286x): baseDamage = round(12*3.5/5.0) = round(8.4) = 8n, damagePerLevel = round(5*3.5/5.0) = round(3.5) = 4n
     (INVERTED: damage per hit goes DOWN because they attack MORE often, preserving DPS)
   - tank (unchanged): baseDamage=8n, damagePerLevel=3n
   - healer (5.0/4.0 = 1.25x): baseDamage = round(6*4.0/5.0) = round(4.8) = 5n, damagePerLevel = round(2*4.0/5.0) = round(1.6) = 2n
   - support (5.0/4.0 = 1.25x): baseDamage = round(7*4.0/5.0) = round(5.6) = 6n, damagePerLevel = round(3*4.0/5.0) = round(2.4) = 2n

4. Add a new exported helper function:
   ```typescript
   export function getEnemyAttackSpeed(role: string): bigint {
     const key = role.trim().toLowerCase();
     const config = ENEMY_ROLE_CONFIG[key] ?? ENEMY_ROLE_CONFIG.damage;
     return config.attackSpeedMicros;
   }
   ```

5. Update `computeEnemyStats` to also return `attackSpeedMicros` from the role config:
   Add `attackSpeedMicros: role.attackSpeedMicros` to the returned object.
  </action>
  <verify>TypeScript compiles without errors: `cd spacetimedb && npx tsc --noEmit`</verify>
  <done>ENEMY_ROLE_CONFIG has attackSpeedMicros per role, damage values rebalanced, getEnemyAttackSpeed helper exported, computeEnemyStats returns attackSpeedMicros.</done>
</task>

<task type="auto">
  <name>Task 2: Use role-based attack speed for enemy auto-attack scheduling in combat.ts</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
1. Import `getEnemyAttackSpeed` from `../helpers/combat_enemies`.

2. In `spawnEnemyIntoCombat` (around line 113-126): The initial `nextAutoAttackAt` uses a stagger offset `1_000_000n + (spawnToUse.id % 2_000_000n)`. This is fine as-is since it's just the first attack stagger, not the recurring interval.

3. In the enemy auto-attack loop (around line 2740-2860): Every place where an enemy's `nextAutoAttackAt` is set to `nowMicros + AUTO_ATTACK_INTERVAL`, replace with role-based speed. The enemy's role is available via the `enemyRoleTemplateId` on the `combatEnemy` row. Lookup pattern:

   For each enemy attack scheduling site, resolve the attack speed:
   ```typescript
   const roleTemplate = enemySnapshot.enemyRoleTemplateId
     ? ctx.db.enemyRoleTemplate.id.find(enemySnapshot.enemyRoleTemplateId)
     : null;
   const enemyAttackSpeed = getEnemyAttackSpeed(roleTemplate?.role ?? 'damage');
   ```

   Cache this lookup once per enemy in the enemy attack loop (do it right after the `enemySnapshot` and `enemyTemplate` lookups around line 2740-2742), then use `enemyAttackSpeed` in place of `AUTO_ATTACK_INTERVAL` for ALL enemy attack scheduling within that enemy's block.

   Specific lines to change (all within the enemy attack section ~2740-2858):
   - Line ~2760: `nowMicros + AUTO_ATTACK_INTERVAL` (skip/stagger) -> `nowMicros + enemyAttackSpeed`
   - Line ~2797: `nowMicros + AUTO_ATTACK_INTERVAL` (after attacking pet) -> `nowMicros + enemyAttackSpeed`
   - Line ~2850: `nowMicros + AUTO_ATTACK_INTERVAL` (after attacking character) -> `nowMicros + enemyAttackSpeed`

   Do NOT change:
   - RETRY_ATTACK_INTERVAL usages (lines ~2773, ~2855) -- these are short 1s retries when no target found, keep as-is.
   - Line ~2294 (`nowMicros + chosen.castMicros`) -- this is ability cast time, not auto-attack interval, keep as-is.
   - Pet auto-attack scheduling (~line 2482) -- pets use AUTO_ATTACK_INTERVAL, keep as-is.
   - Pull add delay (~line 1092) -- uses AUTO_ATTACK_INTERVAL for timing adds, keep as-is.
   - Line ~209 where pets get `nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + AUTO_ATTACK_INTERVAL` -- keep as-is.

4. Also update the "add enemy to existing combat" path. Search for where `combatPendingAdd` enemies are inserted into combat (there's a section where pending adds arrive). That code creates a new combatEnemy -- it should also use role-based speed for the initial `nextAutoAttackAt` if applicable. Grep for `combatPendingAdd` and `arriveAtMicros` to find this path.

5. Keep the local `const AUTO_ATTACK_INTERVAL = 5_000_000n;` at line 34 -- it's still used for pets, pull delay, etc.
  </action>
  <verify>
1. TypeScript compiles: `cd spacetimedb && npx tsc --noEmit`
2. Grep to confirm no enemy auto-attack path still uses raw AUTO_ATTACK_INTERVAL (except pet/pull paths): search for `AUTO_ATTACK_INTERVAL` in combat.ts and verify remaining usages are only for pets or pull delay.
  </verify>
  <done>Enemy auto-attacks use per-role speed: damage enemies attack every 3.5s, tank every 5.0s, healer/support every 4.0s. Pet and pull-add timing unchanged. DPS roughly preserved via inverse damage scaling.</done>
</task>

</tasks>

<verification>
1. `cd spacetimedb && npx tsc --noEmit` -- no type errors
2. Publish locally: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb`
3. Check logs for errors: `spacetime logs uwr`
4. In-game: start combat with a damage-role enemy and observe faster attack messages (every ~3.5s vs old 5.0s)
5. In-game: start combat with a tank-role enemy and observe same 5.0s cadence
6. Verify damage per hit is lower for faster enemies so overall DPS is similar
</verification>

<success_criteria>
- ENEMY_ROLE_CONFIG includes attackSpeedMicros for all 4 roles
- getEnemyAttackSpeed helper returns correct speed per role
- Enemy auto-attack scheduling in combat loop uses role-based speed
- Per-hit damage rebalanced inversely so DPS is roughly unchanged
- Pets and pull-add delay still use the generic 5s interval
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/298-enemy-attack-speed-by-role-damage-3-5s-t/298-SUMMARY.md`
</output>
