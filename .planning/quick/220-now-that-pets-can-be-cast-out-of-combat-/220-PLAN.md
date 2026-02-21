---
phase: quick-220
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/abilities/beastmaster_abilities.ts
  - spacetimedb/src/data/abilities/shaman_abilities.ts
  - spacetimedb/src/data/abilities/necromancer_abilities.ts
  - spacetimedb/src/data/abilities/summoner_abilities.ts
  - spacetimedb/src/seeding/ensure_items.ts
autonomous: true
requirements: [QUICK-220]

must_haves:
  truths:
    - "Pet summoning abilities have a 5 second cast time (hotbar fill animation visible)"
    - "Pet summoning costs approximately 3x the original mana"
    - "Pet summons can be used out of combat with a cast bar shown"
    - "shaman_spirit_wolf, necromancer_bone_servant, beastmaster_call_beast are no longer combat_only"
  artifacts:
    - path: "spacetimedb/src/data/abilities/beastmaster_abilities.ts"
      provides: "beastmaster_call_beast castSeconds=5n, power=29n"
    - path: "spacetimedb/src/data/abilities/shaman_abilities.ts"
      provides: "shaman_spirit_wolf castSeconds=5n, power=48n"
    - path: "spacetimedb/src/data/abilities/necromancer_abilities.ts"
      provides: "necromancer_bone_servant castSeconds=5n, power=32n"
    - path: "spacetimedb/src/data/abilities/summoner_abilities.ts"
      provides: "summoner elementals castSeconds=5n with tripled power values"
    - path: "spacetimedb/src/seeding/ensure_items.ts"
      provides: "combatOnlyKeys no longer includes pet summoning abilities"
  key_links:
    - from: "ability data files"
      to: "abilityTemplate DB table"
      via: "ensureAbilityTemplates() seeding (sync_ability_templates reducer)"
      pattern: "castSeconds.*5n"
    - from: "abilityTemplate DB"
      to: "use_ability reducer"
      via: "abilityCastMicros(ctx, abilityKey)"
      pattern: "abilityCastMicros"
    - from: "use_ability reducer"
      to: "characterCast DB table"
      via: "characterCast.insert when castMicros > 0"
      pattern: "characterCast.insert"
---

<objective>
Add a 5-second cast time and 3x mana cost to all pet summoning abilities, and allow pet summons out of combat.

Purpose: Pet summoning out of combat should feel deliberate and costly — a 5-second ritual with meaningful mana investment.
Output: Updated ability data files + corrected combatOnlyKeys seeding, then local publish to apply.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/data/ability_catalog.ts
@spacetimedb/src/helpers/combat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update pet summon ability data — cast time and mana cost</name>
  <files>
    spacetimedb/src/data/abilities/beastmaster_abilities.ts
    spacetimedb/src/data/abilities/shaman_abilities.ts
    spacetimedb/src/data/abilities/necromancer_abilities.ts
    spacetimedb/src/data/abilities/summoner_abilities.ts
  </files>
  <action>
For each pet summoning ability, set castSeconds to 5n and update power to achieve 3x mana cost.

Mana cost formula: `4 + level * 2 + power`. To triple it: new_power = 3 * original_cost - 4 - level * 2.

**beastmaster_abilities.ts — beastmaster_call_beast:**
- castSeconds: 1n → 5n
- power: 3n → 29n  (original cost=13, 3x=39, new_power=39-4-6=29)

**shaman_abilities.ts — shaman_spirit_wolf:**
- castSeconds: 1n → 5n
- power: 4n → 48n  (original cost=22, 3x=66, new_power=66-4-14=48)

**necromancer_abilities.ts — necromancer_bone_servant:**
- castSeconds: 1n → 5n
- power: 4n → 32n  (original cost=14, 3x=42, new_power=42-4-6=32)

**summoner_abilities.ts — all summoned elementals and titan:**
- summoner_earth_elemental: castSeconds: 1n → 5n, power: 4n → 24n  (original=10, 3x=30, new=24)
- summoner_fire_elemental: castSeconds: 1n → 5n, power: 5n → 43n  (original=19, 3x=57, new=43)
- summoner_water_elemental: castSeconds: 1n → 5n, power: 4n → 48n  (original=22, 3x=66, new=48)
- summoner_primal_titan: castSeconds: 2n → 5n, power: 10n → 78n  (original=34, 3x=102, new=78)

NOTE: summoner_conjure_sustenance and summoner_conjure_equipment are NOT pet summons — do not modify them.

NOTE: Power values are safe to increase for pet summoning abilities because damageType is 'none' and pet stats are hardcoded in the summonPet() call. The power field only affects mana cost for these abilities.
  </action>
  <verify>
Check that each modified ability has castSeconds: 5n and the correct power value by reading the files.
  </verify>
  <done>
All pet summon abilities have castSeconds: 5n and power values that yield 3x original mana cost.
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove pet summons from combatOnlyKeys and publish locally</name>
  <files>
    spacetimedb/src/seeding/ensure_items.ts
  </files>
  <action>
In ensure_items.ts around line 516-521, the combatOnlyKeys Set contains:
```
'shaman_spirit_wolf',
'necromancer_bone_servant',
'beastmaster_call_beast',
'summoner_earth_familiar',
```

Remove 'shaman_spirit_wolf', 'necromancer_bone_servant', and 'beastmaster_call_beast' from this Set. Leave 'summoner_earth_familiar' (legacy key, no ability with this key exists in current data).

The summoner elemental abilities (earth, fire, water, primal_titan) are not in combatOnlyKeys already — no change needed for them.

After editing, publish to local SpacetimeDB and run sync_ability_templates to apply the updated castSeconds and power values:

```bash
spacetime publish uwr --project-path C:/projects/uwr/spacetimedb
```

Then call sync_ability_templates via the spacetime CLI or note that the user should call it in-game via admin panel. The module publish itself will re-run ensureAbilityTemplates on clientConnected if that's the hook, OR it may require calling the reducer. Check if ensureAbilityTemplates is called on init — if the reducer exists as sync_ability_templates, the user needs to call it from the admin panel after publish. Add a note in the output.
  </action>
  <verify>
1. File no longer contains 'shaman_spirit_wolf', 'necromancer_bone_servant', 'beastmaster_call_beast' in combatOnlyKeys
2. `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` exits 0
  </verify>
  <done>
Pet summon abilities are removed from combatOnlyKeys. Local module published successfully. User instructed to call sync_ability_templates from in-game admin panel to apply cast time and mana cost changes to the DB.
  </done>
</task>

</tasks>

<verification>
After publish:
1. Log into game and open admin panel
2. Call sync_ability_templates reducer
3. Go to a safe out-of-combat zone
4. Try casting a pet summon ability (e.g. beastmaster_call_beast)
5. Verify: 5-second cast bar fills in the hotbar button
6. Verify: mana deducted is approximately 3x the original cost
7. Verify: pet appears after cast completes
8. Verify: shaman, necromancer, summoner pet abilities also work out of combat
</verification>

<success_criteria>
- All pet summon abilities have castSeconds=5n in data files
- All pet summon ability power values yield 3x original mana cost
- shaman_spirit_wolf, necromancer_bone_servant, beastmaster_call_beast removed from combatOnlyKeys
- Local module published successfully
- After sync_ability_templates: 5-second cast bar appears when summoning a pet out of combat
</success_criteria>

<output>
After completion, create `.planning/quick/220-now-that-pets-can-be-cast-out-of-combat-/220-SUMMARY.md`
</output>
