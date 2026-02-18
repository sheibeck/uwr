---
phase: quick-170
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/seeding/ensure_enemies.ts
autonomous: true

must_haves:
  truths:
    - "Every non-safe, non-dungeon location has at least one night-appropriate enemy template at its effective level"
    - "Level-1 plains locations (Ashen Road, Ironbell Farmstead) spawn level-1 night enemies"
    - "Mid-level locations (Cinderwatch, Scoria, Charwood, Smolder, Ironvein, Pyre) have night enemies within +/-1 of their effective level"
    - "New night enemies are thematically nocturnal (bats, moths, shades, prowlers, specters)"
  artifacts:
    - path: "spacetimedb/src/seeding/ensure_enemies.ts"
      provides: "New night enemy templates with role templates"
      contains: "timeOfDay: 'night'"
  key_links:
    - from: "spacetimedb/src/seeding/ensure_enemies.ts"
      to: "spacetimedb/src/helpers/location.ts"
      via: "ensureLocationEnemyTemplates assigns templates to locations by terrain match; spawnEnemy filters by timeOfDay and level"
      pattern: "timeOfDay.*night"
---

<objective>
Audit and fix night spawn coverage across all locations by adding missing level-appropriate night enemy templates.

Purpose: Night spawns are broken for level-1 (zero-offset) locations. Ashen Road and Ironbell Farmstead (plains, level 1) have zero level-1 night enemies -- the only night-tagged plains enemy is Ember Wisp at level 2, which fails the exact-match filter for zero-offset locations. Several mid/high-level zones also have thin night coverage. This task adds new thematically nocturnal enemy templates to fill every gap.

Output: Updated ensure_enemies.ts with new enemy templates and role templates, plus enemy abilities.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/seeding/ensure_enemies.ts
@spacetimedb/src/seeding/ensure_world.ts (ensureWorldLayout - all locations with terrain/levelOffset)
@spacetimedb/src/helpers/location.ts (spawnEnemy, computeLocationTargetLevel, ensureLocationEnemyTemplates)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add missing night enemy templates with roles and abilities</name>
  <files>spacetimedb/src/seeding/ensure_enemies.ts</files>
  <action>
Add the following new enemy templates inside `ensureEnemyTemplatesAndRoles()`, following the exact same `addEnemyTemplate` + `addRoleTemplate` pattern used for existing enemies. Also add enemy abilities in `ensureEnemyAbilities()` for each new template.

**CRITICAL CONTEXT:** `ensureLocationEnemyTemplates` assigns templates to locations based ONLY on terrain match (terrainTypes field). Level filtering happens at spawn time in `spawnEnemy`. For zero-offset locations (levelOffset=0n), `spawnEnemy` uses EXACT level match (minLevel===maxLevel===adjustedTarget). For non-zero offset locations, it uses +/-1 window. Therefore:
- Level-1 night enemies MUST exist for each terrain where a zero-offset location exists
- Higher-level night enemies should cover the effective level ranges of their target locations

**AUDIT RESULTS -- Gaps Found:**

| Location | Terrain | Effective Level | Night Gap |
|----------|---------|-----------------|-----------|
| Ashen Road | plains | 1 | NO level-1 night enemies |
| Ironbell Farmstead | plains | 1 | NO level-1 night enemies |
| Cinderwatch | plains | 3 | Only Ember Wisp (L2) -- too low |
| Scoria Flats | plains | 3 | Only Ember Wisp (L2) -- too low |
| Charwood Copse | woods | 4 | Only L2-3 night enemies |
| Smolder Marsh | swamp | 4 | Only L3 night enemies |
| Ironvein Pass | mountains | 5 | Only Frostbone Acolyte (L4) -- thin |
| Pyre Overlook | mountains | 5 | Only Frostbone Acolyte (L4) -- thin |

**NEW ENEMY TEMPLATES TO ADD (8 total):**

**1. Dusk Moth** -- Level 1, plains, night, spirit
Ghostly insects that emerge at dusk to feed on ambient energy.
```
name: 'Dusk Moth', terrainTypes: 'plains', creatureType: 'spirit', timeOfDay: 'night',
socialGroup: 'spirit', socialRadius: 1n, awareness: 'idle',
groupMin: 1n, groupMax: 2n, armorClass: 0n, level: 1n,
maxHp: 16n, baseDamage: 3n, xpReward: 10n, factionId: fVerdantCircle
```
Role templates:
- dusk_moth / 'Dusk Moth' / 'dps' / 'magic' / 'flutter, dust'
- dusk_moth_glimmer / 'Dusk Moth Glimmer' / 'support' / 'magic' / 'shimmer, blind'
Enemy ability: 'Dusk Moth', 'moth_dust', 'Moth Dust', 'dot', 1n, 12n, 'aggro'

**2. Night Rat** -- Level 1, plains, night, animal
Scavenging rats that emerge from burrows after dark to hunt in packs.
```
name: 'Night Rat', terrainTypes: 'plains', creatureType: 'animal', timeOfDay: 'night',
socialGroup: 'animal', socialRadius: 2n, awareness: 'idle',
groupMin: 1n, groupMax: 2n, armorClass: 0n, level: 1n,
maxHp: 18n, baseDamage: 3n, xpReward: 10n, factionId: fVerdantCircle
```
Role templates:
- night_rat / 'Night Rat' / 'dps' / 'melee' / 'gnaw, dart'
- night_rat_scrapper / 'Night Rat Scrapper' / 'tank' / 'melee' / 'gnaw, brace'
Enemy ability: 'Night Rat', 'plague_bite', 'Plague Bite', 'dot', 1n, 12n, 'aggro'

**3. Cinder Wraith** -- Level 3, plains, night, undead
Spectral remnants of travelers who perished on the scorched roads.
```
name: 'Cinder Wraith', terrainTypes: 'plains,mountains', creatureType: 'undead', timeOfDay: 'night',
socialGroup: 'undead', socialRadius: 2n, awareness: 'idle',
groupMin: 1n, groupMax: 2n, armorClass: 0n, level: 3n,
maxHp: 28n, baseDamage: 6n, xpReward: 22n, factionId: fAshenOrder
```
Role templates:
- cinder_wraith / 'Cinder Wraith' / 'dps' / 'magic' / 'spectral flame, wail'
- cinder_wraith_howler / 'Cinder Wraith Howler' / 'support' / 'magic' / 'howl, chill'
Enemy ability: 'Cinder Wraith', 'spectral_flame', 'Spectral Flame', 'dot', 2n, 16n, 'aggro'

**4. Shadow Prowler** -- Level 4, woods, night, beast
Silent predators that stalk through darkened forests.
```
name: 'Shadow Prowler', terrainTypes: 'woods', creatureType: 'beast', timeOfDay: 'night',
socialGroup: 'beast', socialRadius: 2n, awareness: 'idle',
groupMin: 1n, groupMax: 2n, armorClass: 0n, level: 4n,
maxHp: 32n, baseDamage: 8n, xpReward: 30n, factionId: fVerdantCircle
```
Role templates:
- shadow_prowler / 'Shadow Prowler' / 'dps' / 'melee' / 'pounce, rend'
- shadow_prowler_stalker / 'Shadow Prowler Stalker' / 'dps' / 'melee' / 'ambush, rake'
Enemy ability: 'Shadow Prowler', 'shadow_pounce', 'Shadow Pounce', 'dot', 2n, 18n, 'aggro'

**5. Bog Specter** -- Level 4, swamp, night, spirit
Luminous swamp spirits that lure travelers into deep water.
```
name: 'Bog Specter', terrainTypes: 'swamp', creatureType: 'spirit', timeOfDay: 'night',
socialGroup: 'spirit', socialRadius: 1n, awareness: 'idle',
groupMin: 1n, groupMax: 2n, armorClass: 0n, level: 4n,
maxHp: 26n, baseDamage: 7n, xpReward: 28n, factionId: fVerdantCircle
```
Role templates:
- bog_specter / 'Bog Specter' / 'dps' / 'magic' / 'drowning grasp, lure'
- bog_specter_lantern / 'Bog Specter Lantern' / 'support' / 'magic' / 'wisp light, veil'
Enemy ability: 'Bog Specter', 'drowning_grasp', 'Drowning Grasp', 'dot', 2n, 18n, 'aggro'

**6. Ashveil Phantom** -- Level 5, mountains, night, undead
Tortured spirits of miners who died in collapsed tunnels beneath the peaks.
```
name: 'Ashveil Phantom', terrainTypes: 'mountains', creatureType: 'undead', timeOfDay: 'night',
socialGroup: 'undead', socialRadius: 2n, awareness: 'idle',
groupMin: 1n, groupMax: 2n, armorClass: 0n, level: 5n,
maxHp: 34n, baseDamage: 8n, xpReward: 36n, factionId: fAshenOrder
```
Role templates:
- ashveil_phantom / 'Ashveil Phantom' / 'dps' / 'magic' / 'soul rend, phase'
- ashveil_phantom_warden / 'Ashveil Phantom Warden' / 'tank' / 'melee' / 'spectral guard, slam'
Enemy ability: 'Ashveil Phantom', 'soul_rend', 'Soul Rend', 'dot', 2n, 20n, 'aggro'

**7. Nightfang Viper** -- Level 1, swamp, night, beast
Venomous swamp snakes that hunt at night when their cold-blooded prey is sluggish.
```
name: 'Nightfang Viper', terrainTypes: 'swamp', creatureType: 'beast', timeOfDay: 'night',
socialGroup: 'beast', socialRadius: 1n, awareness: 'idle',
groupMin: 1n, groupMax: 2n, armorClass: 0n, level: 1n,
maxHp: 16n, baseDamage: 4n, xpReward: 12n, factionId: fVerdantCircle
```
Role templates:
- nightfang_viper / 'Nightfang Viper' / 'dps' / 'melee' / 'venom strike, coil'
- nightfang_viper_spitter / 'Nightfang Viper Spitter' / 'dps' / 'ranged' / 'venom spit, dart'
Enemy ability: 'Nightfang Viper', 'venom_fang', 'Venom Fang', 'dot', 1n, 12n, 'aggro'

**8. Gloomwing Bat** -- Level 1, woods,mountains, night, beast
Cave bats that swarm out at dusk to hunt insects and small prey.
```
name: 'Gloomwing Bat', terrainTypes: 'woods,mountains', creatureType: 'beast', timeOfDay: 'night',
socialGroup: 'beast', socialRadius: 2n, awareness: 'idle',
groupMin: 1n, groupMax: 2n, armorClass: 0n, level: 1n,
maxHp: 14n, baseDamage: 3n, xpReward: 10n, factionId: fVerdantCircle
```
Role templates:
- gloomwing_bat / 'Gloomwing Bat' / 'dps' / 'melee' / 'screech, swoop'
- gloomwing_bat_elder / 'Gloomwing Bat Elder' / 'support' / 'melee' / 'sonic pulse, swoop'
Enemy ability: 'Gloomwing Bat', 'sonic_screech', 'Sonic Screech', 'debuff', 1n, 14n, 'aggro'

**IMPORTANT NOTES:**
- All new templates use `armorClass: 0n` per decision #150 (enemy AC is now role-driven via ENEMY_ROLE_CONFIG, template armorClass is ignored)
- Follow existing `addEnemyTemplate` pattern exactly (pass `id: 0n` as first field for new templates, just like Grave Acolyte and later templates do)
- Follow existing `addRoleTemplate` calls exactly
- Follow existing `upsertEnemyAbility` calls in `ensureEnemyAbilities` exactly
- Templates are automatically assigned to locations via `ensureLocationEnemyTemplates` which matches by terrainType

**COVERAGE AFTER CHANGES:**

| Location | Terrain | Level | Night Enemies |
|----------|---------|-------|---------------|
| Ashen Road | plains | 1 | Dusk Moth (L1), Night Rat (L1) |
| Ironbell Farmstead | plains | 1 | Dusk Moth (L1), Night Rat (L1) |
| Fogroot Crossing | swamp | 2 | Nightfang Viper (L1), Blight Stalker (L3), Fen Witch (L3), Hexbinder (L3) |
| Bramble Hollow | woods | 2 | Gloomwing Bat (L1), Blight Stalker (L3), Hexbinder (L3), Thorn Sprite (L2) |
| Willowfen | swamp | 2 | Nightfang Viper (L1), Blight Stalker (L3), Fen Witch (L3), Hexbinder (L3) |
| Duskwater Shallows | swamp | 2 | Nightfang Viper (L1), Blight Stalker (L3), Fen Witch (L3), Hexbinder (L3) |
| Thornveil Thicket | woods | 2 | Gloomwing Bat (L1), Blight Stalker (L3), Hexbinder (L3), Thorn Sprite (L2) |
| Lichen Ridge | mountains | 2 | Gloomwing Bat (L1), Ember Wisp (L2), Frostbone Acolyte (L4) |
| Cairn Meadow | plains | 2 | Dusk Moth (L1), Night Rat (L1), Ember Wisp (L2) |
| Cinderwatch | plains | 3 | Cinder Wraith (L3), Ember Wisp (L2), Dusk Moth (L1), Night Rat (L1) |
| Scoria Flats | plains | 3 | Cinder Wraith (L3), Ember Wisp (L2), Dusk Moth (L1), Night Rat (L1) |
| Charwood Copse | woods | 4 | Shadow Prowler (L4), Blight Stalker (L3), Thorn Sprite (L2), Gloomwing Bat (L1) |
| Smolder Marsh | swamp | 4 | Bog Specter (L4), Nightfang Viper (L1), Blight Stalker (L3), Fen Witch (L3) |
| Ironvein Pass | mountains | 5 | Ashveil Phantom (L5), Frostbone Acolyte (L4), Cinder Wraith (L3) |
| Pyre Overlook | mountains | 5 | Ashveil Phantom (L5), Frostbone Acolyte (L4), Cinder Wraith (L3) |
| Ashfen Hollow | swamp | 3 | Blight Stalker (L3), Fen Witch (L3), Hexbinder (L3), Nightfang Viper (L1) |
  </action>
  <verify>
1. `npx tsc --noEmit --project spacetimedb/tsconfig.json` compiles without errors
2. Manually count: Every non-safe, non-dungeon location terrain has at least one night enemy at its effective level (exact match for offset=0, +/-1 for offset!=0)
3. Verify all 8 new templates appear in the `ensureEnemyTemplatesAndRoles` function
4. Verify all 8 new enemy abilities appear in `ensureEnemyAbilities` function
  </verify>
  <done>
- 8 new night enemy templates added with 16 role templates and 8 enemy abilities
- Plains level 1 has Dusk Moth + Night Rat (both L1 night)
- Plains level 3 has Cinder Wraith (L3 night)
- Woods level 4 has Shadow Prowler (L4 night)
- Swamp level 4 has Bog Specter (L4 night)
- Mountains level 5 has Ashveil Phantom (L5 night)
- Swamp level 1 has Nightfang Viper (L1 night)
- Woods/mountains level 1 has Gloomwing Bat (L1 night)
- TypeScript compiles cleanly
  </done>
</task>

<task type="auto">
  <name>Task 2: Republish module and verify night spawns</name>
  <files></files>
  <action>
Republish the SpacetimeDB module with `--clear-database` to reseed all enemy templates and location-enemy-template associations:

```bash
spacetime publish uwr --clear-database -y --project-path spacetimedb
```

After publishing, check the logs to verify no errors during seeding:

```bash
spacetime logs uwr 2>&1 | tail -50
```

The clear-database is needed because ensureLocationEnemyTemplates only inserts new associations (it skips existing ones), and we want a clean slate to verify the full coverage.
  </action>
  <verify>
1. `spacetime publish` succeeds without errors
2. `spacetime logs uwr` shows no SenderError or panic during seeding
  </verify>
  <done>
- Module published successfully with all new night enemy templates
- Seeding completes without errors
- New night enemies are available for spawning at appropriate locations
  </done>
</task>

</tasks>

<verification>
After both tasks complete:
1. TypeScript compiles with no errors
2. Module publishes successfully
3. All non-safe, non-dungeon locations have night enemy coverage at their effective level
4. Level-1 zero-offset plains locations (Ashen Road, Ironbell) can spawn level-1 night enemies (Dusk Moth, Night Rat)
</verification>

<success_criteria>
- Every non-safe, non-dungeon location has at least one night-appropriate enemy template within its spawn-eligible level range
- The critical gap (level-1 plains night enemies) is filled with 2 thematically appropriate enemies
- All mid/high-level terrain gaps have at least one night enemy within +/-1 of the effective level
- Module compiles and publishes cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/170-audit-and-fix-night-spawn-coverage-ensur/170-SUMMARY.md`
</output>
