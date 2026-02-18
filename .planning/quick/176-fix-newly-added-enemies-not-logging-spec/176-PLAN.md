---
phase: quick-176
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/abilities/enemy_abilities.ts
autonomous: true
must_haves:
  truths:
    - "Dusk Moth's Moth Dust ability shows 'Moth Dust' in combat log, not 'auto attack'"
    - "All 8 new night enemies (quick-170) use their special abilities in combat and log the correct ability name"
  artifacts:
    - path: "spacetimedb/src/data/abilities/enemy_abilities.ts"
      provides: "All 8 missing enemy ability definitions"
      contains: "moth_dust"
  key_links:
    - from: "spacetimedb/src/data/abilities/enemy_abilities.ts"
      to: "spacetimedb/src/helpers/combat.ts:executeEnemyAbility"
      via: "ENEMY_ABILITIES[abilityKey] lookup at line 1573"
      pattern: "ENEMY_ABILITIES\\[abilityKey"
---

<objective>
Fix newly added enemies (quick-170) not logging special ability names in combat log.

Purpose: The 8 night enemies added in quick-170 (Dusk Moth, Night Rat, Cinder Wraith, Shadow Prowler, Bog Specter, Ashveil Phantom, Nightfang Viper, Gloomwing Bat) have their abilities registered in the EnemyAbility database table but the ability definitions are missing from the ENEMY_ABILITIES constant in enemy_abilities.ts. When executeEnemyAbility looks up the abilityKey in ENEMY_ABILITIES and gets undefined, it silently returns without executing the ability, causing the enemy to fall through to auto-attack on the next combat tick.

Output: All 8 missing ability definitions added to ENEMY_ABILITIES constant.
</objective>

<root_cause>
The combat loop has TWO data sources for enemy abilities:
1. EnemyAbility DB table (used for ability SELECTION in combat_loop tick) -- seeded by ensureEnemyAbilities() in ensure_world.ts
2. ENEMY_ABILITIES constant (used for ability EXECUTION in executeEnemyAbility) -- defined in enemy_abilities.ts

Quick-170 added entries to source #1 (DB table via ensureEnemyAbilities) but NOT to source #2 (ENEMY_ABILITIES constant).

When executeEnemyAbility (combat.ts line 1573) does:
  const ability = ENEMY_ABILITIES[abilityKey as keyof typeof ENEMY_ABILITIES];
  if (!ability) return;  // <-- silently returns for moth_dust, plague_bite, etc.

The ability cast completes but nothing happens. The enemy then auto-attacks on the next tick, which is what shows in the log.

Missing keys: moth_dust, plague_bite, spectral_flame, shadow_pounce, drowning_grasp, soul_rend, venom_fang, sonic_screech
</root_cause>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/abilities/enemy_abilities.ts
@spacetimedb/src/seeding/ensure_world.ts (lines 603-611 for the EnemyAbility DB entries)
@spacetimedb/src/helpers/combat.ts (line 1573 for the ENEMY_ABILITIES lookup)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add 8 missing night enemy ability definitions to ENEMY_ABILITIES constant</name>
  <files>spacetimedb/src/data/abilities/enemy_abilities.ts</files>
  <action>
Add the following 8 ability definitions to the ENEMY_ABILITIES object in enemy_abilities.ts. All 8 are DoT abilities except sonic_screech which is a debuff. Place them in a new comment section "// Night enemy abilities (quick-170)" after the existing abilities.

Each definition must match the kind/damageType pattern used in executeEnemyAbility (combat.ts):

1. moth_dust: DoT, physical, castSeconds 1n, cooldownSeconds 12n, magnitude 1n, rounds 2n, power 2n, dotPowerSplit 0.5, aiChance 55, aiWeight 45, aiRandomness 20
2. plague_bite: DoT, physical, castSeconds 1n, cooldownSeconds 12n, magnitude 1n, rounds 2n, power 2n, dotPowerSplit 0.5, aiChance 55, aiWeight 50, aiRandomness 20
3. spectral_flame: DoT, magic, castSeconds 2n, cooldownSeconds 16n, magnitude 2n, rounds 3n, power 3n, dotPowerSplit 0.5, aiChance 50, aiWeight 55, aiRandomness 15
4. shadow_pounce: DoT, physical, castSeconds 2n, cooldownSeconds 18n, magnitude 3n, rounds 2n, power 4n, dotPowerSplit 0.5, aiChance 50, aiWeight 60, aiRandomness 15
5. drowning_grasp: DoT, magic, castSeconds 2n, cooldownSeconds 18n, magnitude 3n, rounds 3n, power 4n, dotPowerSplit 0.5, aiChance 50, aiWeight 60, aiRandomness 15
6. soul_rend: DoT, magic, castSeconds 2n, cooldownSeconds 20n, magnitude 3n, rounds 3n, power 4n, dotPowerSplit 0.5, aiChance 50, aiWeight 65, aiRandomness 15
7. venom_fang: DoT, physical, castSeconds 1n, cooldownSeconds 12n, magnitude 1n, rounds 2n, power 2n, dotPowerSplit 0.5, aiChance 55, aiWeight 50, aiRandomness 20
8. sonic_screech: debuff (effectType 'ac_bonus', magnitude -2n, rounds 3n, debuffPowerCost 0.25), magic, castSeconds 1n, cooldownSeconds 14n, power 3n, aiChance 45, aiWeight 55, aiRandomness 20

Scale the stats appropriately for enemy level:
- Level 1 enemies (moth_dust, plague_bite, venom_fang, sonic_screech): power 2n, magnitude 1n (or -2n for debuff), lower aiWeight (45-55)
- Level 3 enemies (spectral_flame): power 3n, magnitude 2n, moderate aiWeight (55)
- Level 4 enemies (shadow_pounce, drowning_grasp): power 4n, magnitude 3n, higher aiWeight (60)
- Level 5 enemies (soul_rend): power 4n, magnitude 3n, higher aiWeight (65)

The name field must match what was seeded in ensureEnemyAbilities: 'Moth Dust', 'Plague Bite', 'Spectral Flame', 'Shadow Pounce', 'Drowning Grasp', 'Soul Rend', 'Venom Fang', 'Sonic Screech'.
  </action>
  <verify>
Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` to confirm no TypeScript errors.
Grep for all 8 keys in enemy_abilities.ts to confirm they exist: moth_dust, plague_bite, spectral_flame, shadow_pounce, drowning_grasp, soul_rend, venom_fang, sonic_screech.
  </verify>
  <done>
All 8 ability keys exist in ENEMY_ABILITIES constant with correct name, kind, damageType, power, magnitude, rounds, castSeconds, cooldownSeconds, and AI weight fields. executeEnemyAbility will now find these abilities and execute them instead of silently returning.
  </done>
</task>

<task type="auto">
  <name>Task 2: Publish module to deploy the fix</name>
  <files></files>
  <action>
Publish the module using plain `spacetime publish` (no --clear-database needed since this is only a code change, no schema changes):

```
spacetime publish uwr --project-path spacetimedb
```

Then run sync_content to re-seed (not strictly needed since ENEMY_ABILITIES is a code constant, but good practice):

The fix takes effect immediately on next combat tick since executeEnemyAbility reads ENEMY_ABILITIES at runtime.
  </action>
  <verify>Check `spacetime logs uwr` for successful publish and no errors.</verify>
  <done>Module published successfully. New night enemies will now use their special abilities in combat with correct log messages.</done>
</task>

</tasks>

<verification>
- All 8 new ability keys present in ENEMY_ABILITIES constant
- TypeScript compilation passes
- Module publishes without error
- Combat log should now show e.g. "Dusk Moth uses Moth Dust on you for X." instead of "Dusk Moth hits you with auto-attack for X."
</verification>

<success_criteria>
- All 8 missing enemy ability definitions (moth_dust, plague_bite, spectral_flame, shadow_pounce, drowning_grasp, soul_rend, venom_fang, sonic_screech) are in ENEMY_ABILITIES constant
- TypeScript compiles cleanly
- Module publishes successfully
- No behavioral regression for existing enemy abilities
</success_criteria>

<output>
After completion, create `.planning/quick/176-fix-newly-added-enemies-not-logging-spec/176-SUMMARY.md`
</output>
