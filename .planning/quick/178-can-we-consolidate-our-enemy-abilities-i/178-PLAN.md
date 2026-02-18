---
phase: quick-178
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/abilities/enemy_abilities.ts
  - spacetimedb/src/seeding/ensure_world.ts
  - spacetimedb/src/helpers/combat.ts
autonomous: true
must_haves:
  truths:
    - "Enemy ability metadata is defined in exactly one location"
    - "Adding a new enemy ability requires editing only one file (enemy_abilities.ts) plus the template-to-ability mapping"
    - "Existing combat behavior is unchanged — same damage, same AI scoring, same ability selection"
  artifacts:
    - path: "spacetimedb/src/data/abilities/enemy_abilities.ts"
      provides: "Single source of truth for all enemy ability definitions AND template-to-ability assignments"
    - path: "spacetimedb/src/seeding/ensure_world.ts"
      provides: "ensureEnemyAbilities reads from consolidated ENEMY_ABILITIES constant instead of duplicating metadata"
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "executeEnemyAbility and helper functions continue reading from ENEMY_ABILITIES (no change needed)"
  key_links:
    - from: "spacetimedb/src/seeding/ensure_world.ts"
      to: "spacetimedb/src/data/abilities/enemy_abilities.ts"
      via: "import ENEMY_ABILITIES + ENEMY_TEMPLATE_ABILITIES"
      pattern: "ENEMY_ABILITIES\\[abilityKey\\]"
    - from: "spacetimedb/src/helpers/combat.ts"
      to: "spacetimedb/src/data/abilities/enemy_abilities.ts"
      via: "import ENEMY_ABILITIES"
      pattern: "ENEMY_ABILITIES\\[abilityKey"
---

<objective>
Consolidate enemy ability definitions into a single source of truth so that adding or modifying an enemy ability only requires editing one file.

Purpose: Currently, enemy ability data lives in TWO places that must be kept in sync (Decision #155):
1. `ENEMY_ABILITIES` constant in `data/abilities/enemy_abilities.ts` — full metadata (power, damageType, dotPowerSplit, aiChance, etc.) used by `executeEnemyAbility` for ability EXECUTION
2. `ensureEnemyAbilities()` in `seeding/ensure_world.ts` — duplicates name/kind/castSeconds/cooldownSeconds/targetRule for DB seeding used for ability SELECTION

When one is updated without the other, enemies silently fail to use their abilities (quick-176 bug). This plan makes ENEMY_ABILITIES the single definition point and adds a template-to-ability mapping so ensureEnemyAbilities derives all DB fields from the constant.

Output: Single-file enemy ability management where the constant IS the definition and the seeding function reads from it.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/abilities/enemy_abilities.ts
@spacetimedb/src/seeding/ensure_world.ts (ensureEnemyAbilities function, lines 523-612)
@spacetimedb/src/helpers/combat.ts (executeEnemyAbility function, lines 1564-1744; enemyAbilityCastMicros/enemyAbilityCooldownMicros, lines 131-141)
@spacetimedb/src/reducers/combat.ts (combat loop enemy ability selection, lines 1729-1830)
@spacetimedb/src/schema/tables.ts (EnemyAbility table definition, lines 716-732)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add template-to-ability mapping and targetRule to ENEMY_ABILITIES constant</name>
  <files>spacetimedb/src/data/abilities/enemy_abilities.ts</files>
  <action>
Add a `targetRule` field to each entry in ENEMY_ABILITIES that currently lacks it. The targetRule values should match what is currently hardcoded in ensureEnemyAbilities:
- All dot/debuff abilities: targetRule = 'aggro'
- heal abilities (shaman_heal, dark_mend): targetRule = 'lowest_hp'
- aoe_damage abilities (flame_burst, quake_wave): targetRule = 'all_players'
- buff abilities (warchief_rally, bolster_defenses): targetRule = 'all_allies'

Note: some abilities already have targetRule (shaman_heal, dark_mend, warchief_rally, bolster_defenses). For those, keep the existing value. For all others, add `targetRule: 'aggro'`.

Then add a new exported constant `ENEMY_TEMPLATE_ABILITIES` that maps enemy template names to arrays of ability keys. This captures the template-to-ability assignments currently hardcoded as upsertEnemyAbility calls in ensure_world.ts. The mapping should be:

```typescript
export const ENEMY_TEMPLATE_ABILITIES: Record<string, string[]> = {
  'Bog Rat': ['poison_bite'],
  'Ember Wisp': ['ember_burn'],
  'Bandit': ['bleeding_shot'],
  'Blight Stalker': ['shadow_rend'],
  'Grave Acolyte': ['sapping_chant', 'dark_mend'],
  'Hexbinder': ['withering_hex', 'warchief_rally'],
  'Thicket Wolf': ['rending_bite'],
  'Marsh Croaker': ['bog_slime'],
  'Dust Hare': ['quick_nip'],
  'Ash Jackal': ['scorching_snap'],
  'Thorn Sprite': ['thorn_venom'],
  'Gloom Stag': ['crushing_gore'],
  'Mire Leech': ['blood_drain'],
  'Fen Witch': ['mire_curse', 'shaman_heal'],
  'Grave Skirmisher': ['rusty_bleed'],
  'Cinder Sentinel': ['ember_slam', 'flame_burst'],
  'Emberling': ['ember_spark'],
  'Frostbone Acolyte': ['chill_touch'],
  'Ridge Skirmisher': ['stone_cleave'],
  'Emberhawk': ['searing_talon'],
  'Basalt Brute': ['quake_stomp', 'quake_wave'],
  'Grave Servant': ['grave_shield_break'],
  'Alley Shade': ['shadow_bleed'],
  'Vault Sentinel': ['vault_crush'],
  'Sootbound Mystic': ['soot_hex', 'bolster_defenses'],
  'Ember Priest': ['cinder_blight'],
  'Ashforged Revenant': ['molten_bleed'],
  // Night enemies (quick-170)
  'Dusk Moth': ['moth_dust'],
  'Night Rat': ['plague_bite'],
  'Cinder Wraith': ['spectral_flame'],
  'Shadow Prowler': ['shadow_pounce'],
  'Bog Specter': ['drowning_grasp'],
  'Ashveil Phantom': ['soul_rend'],
  'Nightfang Viper': ['venom_fang'],
  'Gloomwing Bat': ['sonic_screech'],
};
```

Verify every abilityKey in ENEMY_TEMPLATE_ABILITIES exists as a key in ENEMY_ABILITIES. Verify every key in ENEMY_ABILITIES appears in at least one ENEMY_TEMPLATE_ABILITIES entry.

Do NOT change any existing field values in ENEMY_ABILITIES entries — only ADD targetRule to entries missing it, and ADD the ENEMY_TEMPLATE_ABILITIES export.
  </action>
  <verify>TypeScript compiles without errors: `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit 2>&1 | head -20`. All ENEMY_ABILITIES keys have a targetRule field. All ENEMY_TEMPLATE_ABILITIES ability keys exist in ENEMY_ABILITIES.</verify>
  <done>ENEMY_ABILITIES has targetRule on every entry. ENEMY_TEMPLATE_ABILITIES maps all 35+ enemy templates to their ability keys. No data values changed from current behavior.</done>
</task>

<task type="auto">
  <name>Task 2: Refactor ensureEnemyAbilities to read from ENEMY_ABILITIES constant</name>
  <files>spacetimedb/src/seeding/ensure_world.ts</files>
  <action>
Replace the entire body of `ensureEnemyAbilities(ctx)` so it reads from the consolidated data instead of hardcoding metadata.

Import ENEMY_ABILITIES and ENEMY_TEMPLATE_ABILITIES from `../data/abilities/enemy_abilities.js` at the top of ensure_world.ts.

Rewrite ensureEnemyAbilities to:
1. Keep the existing `upsertEnemyAbility` inner function signature (templateName, abilityKey, name, kind, castSeconds, cooldownSeconds, targetRule) — it handles the DB upsert logic correctly.
2. Replace all ~40 individual upsertEnemyAbility calls with a loop over ENEMY_TEMPLATE_ABILITIES:

```typescript
export function ensureEnemyAbilities(ctx: any) {
  const upsertEnemyAbility = (
    templateName: string,
    abilityKey: string,
    name: string,
    kind: string,
    castSeconds: bigint,
    cooldownSeconds: bigint,
    targetRule: string
  ) => {
    // ... existing upsert logic unchanged ...
  };

  for (const [templateName, abilityKeys] of Object.entries(ENEMY_TEMPLATE_ABILITIES)) {
    for (const abilityKey of abilityKeys) {
      const ability = ENEMY_ABILITIES[abilityKey as keyof typeof ENEMY_ABILITIES];
      if (!ability) continue;
      upsertEnemyAbility(
        templateName,
        abilityKey,
        ability.name,
        ability.kind,
        ability.castSeconds,
        ability.cooldownSeconds,
        ability.targetRule,
      );
    }
  }
}
```

This eliminates all hardcoded metadata duplication. The upsertEnemyAbility inner function and its DB logic stay exactly the same — only the call sites change from manual args to reading from the constant.

Verify the import path uses `.js` extension per the existing codebase convention for ESM imports in SpacetimeDB modules.
  </action>
  <verify>TypeScript compiles without errors: `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit 2>&1 | head -20`. The ensureEnemyAbilities function no longer contains any hardcoded ability metadata — all values come from ENEMY_ABILITIES constant.</verify>
  <done>ensureEnemyAbilities derives all DB seeding data from ENEMY_ABILITIES and ENEMY_TEMPLATE_ABILITIES. Zero hardcoded ability metadata in ensure_world.ts. Adding a new enemy ability now requires: (1) add entry to ENEMY_ABILITIES, (2) add template mapping to ENEMY_TEMPLATE_ABILITIES — both in the same file.</done>
</task>

<task type="auto">
  <name>Task 3: Update STATE.md Decision #155 and verify no behavioral changes</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
Verify that executeEnemyAbility, enemyAbilityCastMicros, and enemyAbilityCooldownMicros in helpers/combat.ts already import from the correct path and will continue working with the updated ENEMY_ABILITIES (which now has targetRule added but no fields removed or changed). These functions should require NO changes since they already read from ENEMY_ABILITIES.

Confirm that the combat loop in reducers/combat.ts reads abilityKey from the DB EnemyAbility table and passes it to executeEnemyAbility — this path is unchanged.

No code changes needed in this file. This task is verification-only to confirm the refactor is non-breaking.

After verifying, the executor should update STATE.md Decision #155 to reflect the new single-source pattern:
- OLD: "New enemy abilities require entries in TWO places..."
- NEW: "Enemy abilities consolidated into single source of truth: ENEMY_ABILITIES constant + ENEMY_TEMPLATE_ABILITIES mapping in data/abilities/enemy_abilities.ts. Adding a new enemy ability requires adding one entry to ENEMY_ABILITIES (metadata) and one entry to ENEMY_TEMPLATE_ABILITIES (template assignment) — both in the same file. ensureEnemyAbilities() in ensure_world.ts reads from these constants for DB seeding."
  </action>
  <verify>
1. `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit` compiles clean
2. Grep for hardcoded ability metadata in ensure_world.ts: should find zero upsertEnemyAbility calls with literal string/bigint args (only the loop-driven call)
3. Grep ENEMY_ABILITIES imports: should appear in enemy_abilities.ts (definition), ensure_world.ts (seeding), helpers/combat.ts (execution), reducers/combat.ts (AI scoring)
  </verify>
  <done>Full codebase compiles. No behavioral changes — same abilities, same metadata, same DB seeding, same combat execution. Decision #155 updated to reflect single-source pattern. Future enemy ability additions require editing only enemy_abilities.ts.</done>
</task>

</tasks>

<verification>
1. `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit` — full TypeScript compilation passes
2. Count ENEMY_ABILITIES keys matches count of unique ability keys in ENEMY_TEMPLATE_ABILITIES
3. No hardcoded ability metadata strings/bigints in ensureEnemyAbilities function body (only the upsert helper and the loop)
4. executeEnemyAbility still reads from ENEMY_ABILITIES — no import path changes needed
</verification>

<success_criteria>
- Enemy ability data defined in exactly ONE file (data/abilities/enemy_abilities.ts)
- ensureEnemyAbilities reads from the constant, not hardcoded values
- Template-to-ability mapping colocated with ability definitions
- Zero behavioral changes — all damage, AI scoring, ability selection identical
- TypeScript compiles cleanly
- STATE.md Decision #155 updated
</success_criteria>

<output>
After completion, create `.planning/quick/178-can-we-consolidate-our-enemy-abilities-i/178-SUMMARY.md`
</output>
