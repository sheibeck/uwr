---
phase: quick-397
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat_enemies.ts
  - spacetimedb/src/helpers/combat_enemies.test.ts
  - spacetimedb/src/helpers/items.ts
  - spacetimedb/src/helpers/world_gen.ts
  - spacetimedb/src/data/combat_scaling.ts
  - spacetimedb/src/data/combat_scaling.test.ts
autonomous: true
requirements: [QUICK-397]
must_haves:
  truths:
    - "Solo level 1 player can kill an equal-level damage-role enemy before dying"
    - "Party of 2 stomps level 1 enemies quickly"
    - "Higher-level and elite enemies remain dangerous"
  artifacts:
    - path: "spacetimedb/src/helpers/combat_enemies.ts"
      provides: "Rebalanced enemy role configs with lower baseDamage, damagePerLevel, baseHpBonus, hpBonusPerLevel"
    - path: "spacetimedb/src/helpers/combat_enemies.test.ts"
      provides: "Updated tests validating new role values and solo-winnable math"
    - path: "spacetimedb/src/data/combat_scaling.ts"
      provides: "GLOBAL_DAMAGE_MULTIPLIER restored to 100n"
  key_links:
    - from: "spacetimedb/src/helpers/combat_enemies.ts"
      to: "spacetimedb/src/reducers/combat.ts"
      via: "computeEnemyStats called during combat init"
      pattern: "computeEnemyStats"
---

<objective>
Rebalance combat numbers so a solo level 1 player can reliably defeat an equal-level standard enemy.

Purpose: Currently enemies deal ~10x the DPS of a player and have ~10x more effective HP, making combat mathematically unwinnable solo. This fix adjusts enemy role stats, restores the global damage multiplier, and slightly buffs starter weapons so the intended design (solo winnable, parties stomp, challenge from higher levels/elites) is achieved.

Output: Tuned combat constants, updated tests proving the math works.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/combat_enemies.ts
@spacetimedb/src/helpers/combat_enemies.test.ts
@spacetimedb/src/data/combat_scaling.ts
@spacetimedb/src/data/combat_scaling.test.ts
@spacetimedb/src/helpers/items.ts
@spacetimedb/src/helpers/world_gen.ts
@spacetimedb/src/helpers/character.ts (recomputeCharacterDerived - HP formula: BASE_HP=50 + STR*8)

<interfaces>
<!-- Current balance math (all broken): -->

Player Level 1 (Warrior, STR=14, sword):
- HP = 50 + 14*8 = 162
- Sword baseDamage = 3n, STR scaling = (3*14*15)/1000 = 0 (bigint truncation!)
- After armor(5) + GLOBAL(85%): ~1 damage per hit = 0.29 DPS
- Time to kill enemy: ~355 seconds

Enemy Level 1 (damage role):
- template.maxHp = 1*25+50 = 75, + baseHpBonus(20) + hpPerLevel(8) = 103 HP
- attackDamage = baseDamage(12) + damagePerLevel(6)*1 = 18
- After player armor(~2) + GLOBAL(85%): ~14 damage per hit = 4.0 DPS
- Time to kill player: ~40 seconds

TARGET: Player DPS should be ~60-80% of enemy DPS, fights last 30-60s solo.

Key formulas:
- computeEnemyStats: maxHp = template.maxHp + role.baseHpBonus + role.hpBonusPerLevel * level
- computeEnemyStats: attackDamage = role.baseDamage + role.damagePerLevel * level
- calculateStatScaledAutoAttack: base + (base * str * 15) / 1000
- applyArmorMitigation: (dmg * 100) / (100 + armor) * GLOBAL / 100
- world_gen enemy template: maxHp = level * 25 + 50, armorClass = level * 2 + 5
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Rebalance enemy role configs, restore global multiplier, buff starter weapons</name>
  <files>
    spacetimedb/src/helpers/combat_enemies.ts,
    spacetimedb/src/data/combat_scaling.ts,
    spacetimedb/src/helpers/items.ts,
    spacetimedb/src/helpers/world_gen.ts
  </files>
  <behavior>
    - Level 1 damage-role enemy should have ~45-55 HP total (template 30 + role bonuses)
    - Level 1 damage-role enemy should deal ~6-8 damage per hit (not 18)
    - Player with sword (baseDamage ~6) and STR 14 should deal ~7-9 after STR scaling
    - After armor mitigation, solo fight should last roughly 30-60 seconds
    - Tank role should have more HP but still be killable solo (slower fight, ~60-90s)
    - Higher level enemies scale appropriately (level 5 should be clearly harder than level 1)
  </behavior>
  <action>
    **1. ENEMY_ROLE_CONFIG in combat_enemies.ts** -- Reduce all roles significantly:

    damage role:
    - baseDamage: 12n -> 4n (level 1 total: 4+3=7 instead of 18)
    - damagePerLevel: 6n -> 3n
    - baseHpBonus: 20n -> 5n (level 1 total HP from role: 5+5=10 instead of 28)
    - hpBonusPerLevel: 8n -> 5n

    tank role:
    - baseDamage: 12n -> 3n
    - damagePerLevel: 5n -> 2n
    - baseHpBonus: 60n -> 15n
    - hpBonusPerLevel: 15n -> 8n

    healer role:
    - baseDamage: 8n -> 3n
    - damagePerLevel: 3n -> 2n
    - baseHpBonus: 45n -> 10n
    - hpBonusPerLevel: 12n -> 6n

    support role:
    - baseDamage: 9n -> 3n
    - damagePerLevel: 3n -> 2n
    - baseHpBonus: 35n -> 8n
    - hpBonusPerLevel: 10n -> 5n

    dps role (same as damage):
    - baseDamage: 12n -> 4n
    - damagePerLevel: 6n -> 3n
    - baseHpBonus: 20n -> 5n
    - hpBonusPerLevel: 8n -> 5n

    **2. GLOBAL_DAMAGE_MULTIPLIER in combat_scaling.ts** -- Change from 85n to 100n.
    This removes the flat 15% penalty on ALL damage which hurts players more than enemies (player damage is already tiny).

    **3. Starter weapon stats in items.ts** (~line 562) -- Buff base damage:
    - dagger: 2n -> 4n, rapier: 2n -> 4n
    - sword: 3n -> 6n, blade: 3n -> 6n, mace: 3n -> 6n
    - axe: 4n -> 7n
    - staff: 7n -> 8n (already decent), bow: 7n -> 8n
    - greatsword: 8n -> 10n
    Update dps values proportionally (baseDamage + 1 for dps).

    **4. World gen enemy template HP in world_gen.ts** (~line 249) -- Reduce:
    - maxHp formula: `level * 25n + 50n` -> `level * 12n + 20n` (level 1: 32 instead of 75)
    - armorClass: `level * 2n + 5n` -> `level * 2n + 2n` (level 1: 4 instead of 7)

    **Post-change math check (level 1 damage role, solo warrior STR=14, sword baseDamage=6):**
    - Enemy HP: 32 (template) + 5 (baseHpBonus) + 5 (hpBonusPerLevel*1) = 42
    - Enemy damage: 4 + 3*1 = 7 per 3.5s = 2.0 DPS
    - Player damage: 6 + (6*14*15)/1000 = 6+1 = 7 per 3.5s
    - After enemy armor(4): (7*100)/(104) * 100/100 = 6 per hit = 1.7 DPS
    - After player armor(~5 with starter gear): (7*100)/(105) = 6 per hit = 1.7 DPS
    - Time to kill enemy: 42/1.7 = ~25s
    - Time to kill player: 162/1.7 = ~95s
    - Player wins with ~70% HP remaining -- solid solo victory with room for error
    - Party of 2: enemy dies in ~12s, trivial as intended
  </action>
  <verify>
    <automated>cd spacetimedb && npx vitest run src/helpers/combat_enemies.test.ts src/data/combat_scaling.test.ts --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>
    - ENEMY_ROLE_CONFIG values reduced across all roles
    - GLOBAL_DAMAGE_MULTIPLIER = 100n
    - Starter weapons buffed
    - World gen template HP/armor reduced
    - All existing tests updated to match new values
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add balance assertion tests proving solo-winnable math</name>
  <files>
    spacetimedb/src/helpers/combat_enemies.test.ts
  </files>
  <behavior>
    - Test: Level 1 damage-role enemy total HP < 60 (should be ~42)
    - Test: Level 1 damage-role enemy attack damage < 10 (should be ~7)
    - Test: Level 1 tank-role enemy total HP < 80 (should be ~60ish)
    - Test: Player with sword (baseDamage 6, STR 14) deals more damage per hit than enemy after armor
    - Test: Enemy DPS < player effective HP / 30 (player survives at least 30 seconds)
    - Test: Level 5 enemies are significantly harder than level 1 (HP and damage scale up)
  </behavior>
  <action>
    Add a new `describe('balance assertions')` block in combat_enemies.test.ts that validates the core balance invariants:

    1. Import `calculateStatScaledAutoAttack` from combat_scaling, `applyArmorMitigation` from combat_enemies.
    2. Create a helper that computes level-1 enemy stats using `computeEnemyStats` with a realistic template (maxHp: 32n from world_gen formula, armorClass: 4n, level: 1n).
    3. Assert enemy HP is in range 35-60 for damage role.
    4. Assert enemy attack damage is in range 5-10 for damage role.
    5. Compute player auto-attack with sword baseDamage=6n, STR=14n, apply enemy armor mitigation.
    6. Compute enemy auto-attack, apply player armor mitigation (assume ~5n for starter gear).
    7. Assert player time-to-kill < 60 seconds (player can kill enemy in under a minute).
    8. Assert player time-to-kill-player > player time-to-kill-enemy (player wins the fight).
    9. Assert level 5 enemy HP > level 1 enemy HP * 1.5 (scaling works).

    These tests serve as a regression guard -- if anyone changes constants, the balance invariants still hold.
  </action>
  <verify>
    <automated>cd spacetimedb && npx vitest run src/helpers/combat_enemies.test.ts --reporter=verbose 2>&1 | tail -40</automated>
  </verify>
  <done>
    - Balance assertion test block exists with at least 6 test cases
    - All tests pass confirming solo player can beat equal-level standard enemy
    - Tests serve as regression guard for future constant changes
  </done>
</task>

</tasks>

<verification>
1. All vitest tests pass: `cd spacetimedb && npx vitest run --reporter=verbose 2>&1 | tail -50`
2. TypeScript compiles: `cd spacetimedb && npx tsc --noEmit 2>&1 | head -20`
</verification>

<success_criteria>
- Level 1 solo player mathematically wins vs equal-level damage-role enemy
- Party of 2 trivially defeats level 1 enemies
- Balance assertion tests pass as regression guard
- No TypeScript compilation errors
- GLOBAL_DAMAGE_MULTIPLIER restored to 100n (no hidden penalty)
</success_criteria>

<output>
After completion, create `.planning/quick/397-rebalance-combat-so-solo-player-can-reli/397-SUMMARY.md`
</output>
