---
phase: quick-234
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/abilities/enemy_abilities.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [QUICK-234]

must_haves:
  truths:
    - "Every healer-role enemy (Frostbone Acolyte, Ember Priest) has at least one heal ability"
    - "Every support-role enemy (Emberling, Dust Hare, Ember Wisp Spark, Sootbound Sentry Watcher, Dusk Moth Glimmer, Gloomwing Bat Elder) has at least one non-DoT support ability"
    - "all_allies targetRule in pickEnemyTarget returns a valid participant so buff casts are not silently skipped"
  artifacts:
    - path: "spacetimedb/src/data/abilities/enemy_abilities.ts"
      provides: "New heal and debuff abilities + updated ENEMY_TEMPLATE_ABILITIES mappings"
      contains: "frost_mend"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "pickEnemyTarget all_allies case"
      contains: "all_allies"
  key_links:
    - from: "spacetimedb/src/data/abilities/enemy_abilities.ts"
      to: "spacetimedb/src/seeding/ensure_world.ts"
      via: "ENEMY_TEMPLATE_ABILITIES keys match enemyTemplate.name values"
      pattern: "ENEMY_TEMPLATE_ABILITIES"
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "spacetimedb/src/helpers/combat.ts"
      via: "pickEnemyTarget returns valid targetId for all_allies; executeEnemyAbility buff branch handles ally loop"
      pattern: "all_allies"
---

<objective>
Ensure all healer and support enemies have a meaningful ability (heal/buff/debuff), and fix the all_allies buff targetRule in pickEnemyTarget.

Purpose: DoT abilities don't fulfill the support/healer contract. Healer enemies need heals; support enemies need debuffs or buffs. The all_allies targetRule silently falls through to aggro, making buff intent fragile.
Output: New heal/debuff abilities seeded via ENEMY_TEMPLATE_ABILITIES, plus explicit all_allies case in pickEnemyTarget.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/234-ensure-all-healer-and-support-enemies-ha/
@spacetimedb/src/data/abilities/enemy_abilities.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/helpers/combat.ts
@spacetimedb/src/seeding/ensure_world.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add missing heal/debuff abilities and update ENEMY_TEMPLATE_ABILITIES</name>
  <files>spacetimedb/src/data/abilities/enemy_abilities.ts</files>
  <action>
**Critical context — how ENEMY_TEMPLATE_ABILITIES keys work:**
- Keys must match the `enemyTemplate.name` field (the base template name), NOT the roleKey.
- `findEnemyTemplateByName` does a case-insensitive match on `enemyTemplate.name`.
- Abilities apply to ALL role variants of that base template.

**Step 1 — Add new heal abilities to the `// Heal abilities` section (after `dark_mend`):**

```ts
frost_mend: {
  name: 'Frost Mend',
  description: 'Ice crystals seal wounds with a numbing chill.',
  castSeconds: 2n,
  cooldownSeconds: 18n,
  kind: 'heal',
  power: 4n,
  healPowerSplit: 0.6,
  hotDuration: 2n,
  targetRule: 'lowest_hp',
  aiChance: 65,
  aiWeight: 75,
  aiRandomness: 10,
},
ember_mend: {
  name: 'Ember Mend',
  description: 'Smoldering energy cauterizes wounds and restores vitality.',
  castSeconds: 2n,
  cooldownSeconds: 18n,
  kind: 'heal',
  power: 4n,
  healPowerSplit: 0.6,
  hotDuration: 2n,
  targetRule: 'lowest_hp',
  aiChance: 65,
  aiWeight: 75,
  aiRandomness: 10,
},
```

**Step 2 — Add new debuff abilities to the `// Debuff abilities - magic damage` section (after `soot_hex`):**

```ts
ember_daze: {
  name: 'Ember Daze',
  description: 'Scorching pulse disorients and leaves armor exposed.',
  castSeconds: 2n,
  cooldownSeconds: 18n,
  kind: 'debuff',
  effectType: 'ac_bonus',
  magnitude: -2n,
  rounds: 3n,
  power: 3n,
  damageType: 'magic' as DamageType,
  debuffPowerCost: 0.25,
  targetRule: 'aggro',
  aiChance: 45,
  aiWeight: 60,
  aiRandomness: 20,
},
dust_cloud: {
  name: 'Dust Cloud',
  description: 'Choking dust stings eyes and loosens protective gear.',
  castSeconds: 1n,
  cooldownSeconds: 16n,
  kind: 'debuff',
  effectType: 'ac_bonus',
  magnitude: -2n,
  rounds: 3n,
  power: 3n,
  damageType: 'physical' as DamageType,
  debuffPowerCost: 0.25,
  targetRule: 'aggro',
  aiChance: 50,
  aiWeight: 55,
  aiRandomness: 20,
},
wisp_drain: {
  name: 'Wisp Drain',
  description: 'Spectral energy saps defensive cohesion.',
  castSeconds: 1n,
  cooldownSeconds: 16n,
  kind: 'debuff',
  effectType: 'ac_bonus',
  magnitude: -2n,
  rounds: 3n,
  power: 3n,
  damageType: 'magic' as DamageType,
  debuffPowerCost: 0.25,
  targetRule: 'aggro',
  aiChance: 45,
  aiWeight: 55,
  aiRandomness: 20,
},
soot_pulse: {
  name: 'Soot Pulse',
  description: 'Mechanical soot cloud reduces armor effectiveness.',
  castSeconds: 2n,
  cooldownSeconds: 20n,
  kind: 'debuff',
  effectType: 'ac_bonus',
  magnitude: -2n,
  rounds: 3n,
  power: 3n,
  damageType: 'magic' as DamageType,
  debuffPowerCost: 0.25,
  targetRule: 'aggro',
  aiChance: 45,
  aiWeight: 60,
  aiRandomness: 20,
},
```

**Step 3 — Update ENEMY_TEMPLATE_ABILITIES:**

Update existing healer entries:
- `'Frostbone Acolyte': ['chill_touch']` → `'Frostbone Acolyte': ['chill_touch', 'frost_mend']`
- `'Ember Priest': ['cinder_blight']` → `'Ember Priest': ['cinder_blight', 'ember_mend']`

Add new support entries (use base template names — these are the `enemyTemplate.name` values):
```ts
'Emberling':       ['ember_daze'],       // support ember spirit, disorient pulse
'Dust Hare':       ['dust_cloud'],       // support hare, choking dust
'Ember Wisp':      ['ember_burn', 'wisp_drain'],  // existing DoT + new debuff for support variant
'Sootbound Sentry': ['soot_pulse'],     // construct watcher, armor-stripping pulse
'Dusk Moth':       ['moth_dust'],        // moth_dust already in ENEMY_ABILITIES, just needs mapping
'Gloomwing Bat':   ['sonic_screech'],    // sonic_screech already in ENEMY_ABILITIES, just needs mapping
```

**Note for Dust Hare:** This base template covers the `dust_hare` (dps) AND `dust_hare_scout` (support) role variants. Giving all Dust Hares `dust_cloud` is acceptable — a hare kicking up dust is thematically consistent regardless of role.

**Note for Ember Wisp:** Template already has `['ember_burn']`. Change it to `['ember_burn', 'wisp_drain']` so the support variant (`ember_wisp_spark`) has a true support ability.

**Note for Dusk Moth and Gloomwing Bat:** `moth_dust` and `sonic_screech` are already defined in ENEMY_ABILITIES — just add the template name mappings.

Update the comment block at top of ENEMY_TEMPLATE_ABILITIES:
```ts
// Bog Rat, Thicket Wolf, Marsh Croaker → omitted intentionally
// (Dust Hare, Emberling, Dusk Moth, Gloomwing Bat now have abilities)
```
  </action>
  <verify>Run `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` and confirm it builds without errors. Check that `frost_mend`, `ember_mend`, `ember_daze`, `dust_cloud`, `wisp_drain`, `soot_pulse` are defined in ENEMY_ABILITIES and that all six new template mappings appear in ENEMY_TEMPLATE_ABILITIES.</verify>
  <done>ENEMY_ABILITIES contains frost_mend, ember_mend, ember_daze, dust_cloud, wisp_drain, soot_pulse. ENEMY_TEMPLATE_ABILITIES has updated entries for Frostbone Acolyte, Ember Priest, Emberling, Dust Hare, Ember Wisp, Sootbound Sentry, Dusk Moth, and Gloomwing Bat. Module publishes to local without errors.</done>
</task>

<task type="auto">
  <name>Task 2: Fix all_allies case in pickEnemyTarget</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In `pickEnemyTarget` (around line 740), add an explicit `all_allies` case BEFORE the final aggro fallthrough.

Current code ends with:
```ts
if (normalized === 'self') return undefined;
const targetEntry = [...ctx.db.aggroEntry.by_combat.filter(combatId)]
  ...
return targetEntry?.characterId ?? activeParticipants[0]?.characterId;
```

Add after the `self` check and before the aggro block:
```ts
if (normalized === 'all_allies') {
  // Buff applies to all living enemy allies via executeEnemyAbility.
  // Return any active participant as a placeholder so the cast is not skipped.
  return activeParticipants[0]?.characterId;
}
```

This makes the intent explicit and removes reliance on the accidental aggro fallthrough. The actual buff application in `executeEnemyAbility` already loops over all `combatEnemy.by_combat` entries — this fix just ensures the cast is never silently dropped due to an unrecognized targetRule.
  </action>
  <verify>After publishing, confirm the module compiles. Search for `all_allies` in combat.ts and confirm the explicit case exists inside `pickEnemyTarget`. Confirm `warchief_rally` and `bolster_defenses` abilities (used by Hexbinder and Sootbound Mystic) still fire correctly by reviewing the logic path: pickEnemyTarget returns activeParticipants[0]?.characterId → cast is inserted → executeEnemyAbility buff branch loops over all combatEnemy.by_combat entries.</verify>
  <done>pickEnemyTarget contains an explicit `all_allies` branch returning activeParticipants[0]?.characterId. Module publishes to local without errors. The buff abilities warchief_rally and bolster_defenses have a clear, non-accidental execution path.</done>
</task>

</tasks>

<verification>
After both tasks:
1. `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` succeeds with no TypeScript errors.
2. ENEMY_ABILITIES has 6 new entries (frost_mend, ember_mend, ember_daze, dust_cloud, wisp_drain, soot_pulse).
3. ENEMY_TEMPLATE_ABILITIES has updated/new entries for all 8 affected templates.
4. pickEnemyTarget in combat.ts has explicit `all_allies` case before the aggro fallthrough.
5. Do NOT publish to maincloud.
</verification>

<success_criteria>
- Frostbone Acolyte (healer) → chill_touch + frost_mend
- Ember Priest (healer) → cinder_blight + ember_mend
- Emberling (support) → ember_daze
- Dust Hare (includes scout role) → dust_cloud
- Ember Wisp (includes spark support role) → ember_burn + wisp_drain
- Sootbound Sentry (includes watcher support role) → soot_pulse
- Dusk Moth (includes glimmer support role) → moth_dust
- Gloomwing Bat (includes elder support role) → sonic_screech
- pickEnemyTarget handles all_allies explicitly, no silent fallthrough
</success_criteria>

<output>
After completion, create `.planning/quick/234-ensure-all-healer-and-support-enemies-ha/234-SUMMARY.md` using the summary template.
</output>
