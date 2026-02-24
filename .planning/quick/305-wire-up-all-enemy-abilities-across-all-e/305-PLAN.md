---
phase: quick-305
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/abilities/enemy_abilities.ts
  - spacetimedb/src/seeding/ensure_enemies.ts
  - spacetimedb/src/data/named_enemy_defs.ts
autonomous: true
requirements: [BOSS-ABILITIES, CLEANUP-ABILITY-PROFILES]

must_haves:
  truths:
    - "All 12 named bosses have real combat abilities via ENEMY_TEMPLATE_ABILITIES"
    - "Lower level bosses (L2) have 1-2 abilities, higher level bosses (L5-9) have 2-3"
    - "Regular enemies without ENEMY_TEMPLATE_ABILITIES entries have empty abilityProfile strings"
    - "Enemies WITH ENEMY_TEMPLATE_ABILITIES entries retain their abilityProfile text"
  artifacts:
    - path: "spacetimedb/src/data/abilities/enemy_abilities.ts"
      provides: "12 boss entries in ENEMY_TEMPLATE_ABILITIES mapping boss names to ability keys"
      contains: "Rotfang"
    - path: "spacetimedb/src/seeding/ensure_enemies.ts"
      provides: "Cleaned up abilityProfile strings for non-ability enemies"
    - path: "spacetimedb/src/data/named_enemy_defs.ts"
      provides: "Cleaned up abilityProfile strings for boss base templates and role templates"
  key_links:
    - from: "spacetimedb/src/data/abilities/enemy_abilities.ts"
      to: "spacetimedb/src/seeding/ensure_world.ts"
      via: "ENEMY_TEMPLATE_ABILITIES import used to seed enemyAbility DB rows"
      pattern: "ENEMY_TEMPLATE_ABILITIES"
    - from: "spacetimedb/src/seeding/ensure_world.ts"
      to: "spacetimedb/src/reducers/combat.ts"
      via: "enemyAbility DB rows read by processEnemyAbilities"
      pattern: "enemyAbility.by_template.filter"
---

<objective>
Wire up all 12 named bosses to the enemy ability system and clean up misleading abilityProfile flavor text on enemies that have no real abilities.

Purpose: Bosses currently only auto-attack because they are missing from ENEMY_TEMPLATE_ABILITIES. Regular enemies display ability descriptions that are never actually used, which is misleading. This fix makes bosses threatening and cleans up data integrity.

Output: Updated enemy_abilities.ts with boss mappings, cleaned ensure_enemies.ts and named_enemy_defs.ts with accurate abilityProfile strings.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/abilities/enemy_abilities.ts
@spacetimedb/src/seeding/ensure_enemies.ts
@spacetimedb/src/data/named_enemy_defs.ts
@spacetimedb/src/seeding/ensure_world.ts (lines 988-1018 — ability seeding loop)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add all 12 named bosses to ENEMY_TEMPLATE_ABILITIES</name>
  <files>spacetimedb/src/data/abilities/enemy_abilities.ts</files>
  <action>
Add a new section in ENEMY_TEMPLATE_ABILITIES (after the night enemies block, before the closing brace) with a comment header `// --- Named bosses ---`.

Map each boss to EXISTING ability keys from ENEMY_ABILITIES. Use the boss's theme, role, and level to guide selection. Lower level bosses get 1-2 abilities; higher level bosses get 2-3.

Specific mappings (all keys already exist in ENEMY_ABILITIES):

1. **Rotfang** (L2, dps, melee, beast — venomous bite theme):
   `'Rotfang': ['poison_bite', 'rending_bite']`
   Rationale: poison_bite is the venom theme, rending_bite for the lunge/rend attack.

2. **Mirewalker Thane** (L2, tank, melee, humanoid — shield bash/war cry theme):
   `'Mirewalker Thane': ['crushing_gore', 'warchief_rally']`
   Rationale: crushing_gore is the shield bash analog (AC debuff), warchief_rally is the war cry buff.

3. **Thornmother** (L2, dps, caster, beast — thorn/nature theme):
   `'Thornmother': ['thorn_venom', 'sapping_chant']`
   Rationale: thorn_venom for thorn volley, sapping_chant for root grasp (draining debuff).

4. **Ashwright** (L2, dps, caster, spirit — spirit blast/phase shift theme):
   `'Ashwright': ['ember_spark', 'wisp_drain']`
   Rationale: ember_spark for spirit blast (magic DoT), wisp_drain for phase shift (debuff).

5. **Crag Tyrant** (L4, tank, melee, beast — crushing blow/boulder toss theme):
   `'Crag Tyrant': ['quake_stomp', 'quake_wave']`
   Rationale: quake_stomp for crushing blow (debuff), quake_wave for boulder toss (AoE).

6. **Hexweaver Nyx** (L4, dps, caster, humanoid — hex/mana drain/dark ward theme):
   `'Hexweaver Nyx': ['withering_hex', 'shadow_rend', 'bolster_defenses']`
   Rationale: withering_hex for hex bolt, shadow_rend for mana drain (magic DoT), bolster_defenses for dark ward.

7. **Scorchfang** (L5, dps, melee, beast — flame strike/rending claws theme):
   `'Scorchfang': ['searing_talon', 'rending_bite']`
   Rationale: searing_talon for flame strike (fire DoT), rending_bite for rending claws.

8. **Warden of Ash** (L5, tank, melee, construct — smash/flame aura/fortify theme):
   `'Warden of Ash': ['ember_slam', 'flame_burst', 'bolster_defenses']`
   Rationale: ember_slam for smash (debuff), flame_burst for flame aura (AoE), bolster_defenses for fortify.

9. **Smolderveil Banshee** (L4, dps, caster, spirit — wail/spectral chill/life drain theme):
   `'Smolderveil Banshee': ['soul_rend', 'chill_touch', 'dark_mend']`
   Rationale: soul_rend for wail (magic DoT), chill_touch for spectral chill (debuff), dark_mend for life drain (self-heal).

10. **Pyrelord Kazrak** (L7, tank, melee, humanoid — inferno slash/molten shield/earthquake theme):
    `'Pyrelord Kazrak': ['molten_bleed', 'ember_slam', 'quake_wave']`
    Rationale: molten_bleed for inferno slash (highest-power magic DoT), ember_slam for molten shield (debuff), quake_wave for earthquake (AoE).

11. **Sootveil Archon** (L7, dps, caster, undead — shadow bolt/necrotic wave/dark pact theme):
    `'Sootveil Archon': ['shadow_rend', 'withering_hex', 'dark_mend']`
    Rationale: shadow_rend for shadow bolt (magic DoT), withering_hex for necrotic wave (debuff), dark_mend for dark pact (self-heal).

12. **Emberclaw Matriarch** (L9, dps, melee, beast — savage rend/primal roar/flame breath theme):
    `'Emberclaw Matriarch': ['molten_bleed', 'warchief_rally', 'flame_burst']`
    Rationale: molten_bleed for savage rend (high-power DoT), warchief_rally for primal roar (buff), flame_burst for flame breath (AoE).

All keys used: poison_bite, rending_bite, crushing_gore, warchief_rally, thorn_venom, sapping_chant, ember_spark, wisp_drain, quake_stomp, quake_wave, withering_hex, shadow_rend, bolster_defenses, searing_talon, ember_slam, flame_burst, soul_rend, chill_touch, dark_mend, molten_bleed — all exist in ENEMY_ABILITIES already. NO new abilities needed.
  </action>
  <verify>
Run TypeScript compilation check: `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit --pretty 2>&1 | head -20`

Also verify all referenced ability keys exist:
- Grep for each key used in the boss mappings and confirm it appears in ENEMY_ABILITIES
- Confirm no typos by checking the keys match exactly
  </verify>
  <done>
All 12 named bosses appear in ENEMY_TEMPLATE_ABILITIES with 2-3 existing ability keys each. L2 bosses have 2 abilities, L4+ bosses have 2-3 abilities. No new ability definitions were created. TypeScript compiles without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Clean up abilityProfile text on enemies without real abilities</name>
  <files>spacetimedb/src/seeding/ensure_enemies.ts, spacetimedb/src/data/named_enemy_defs.ts</files>
  <action>
**In `ensure_enemies.ts` (ensureEnemyTemplatesAndRoles function):**

For every enemy base template and every addRoleTemplate call where the enemy's BASE TEMPLATE NAME is NOT in ENEMY_TEMPLATE_ABILITIES, change the abilityProfile parameter to empty string `''`.

Enemies that DO have entries in ENEMY_TEMPLATE_ABILITIES (KEEP their abilityProfile text):
- Ember Wisp, Bandit, Blight Stalker, Ash Jackal, Thorn Sprite, Mire Leech, Emberhawk, Alley Shade, Sootbound Mystic, Ember Priest, Ashforged Revenant
- Gloom Stag, Grave Skirmisher, Ridge Skirmisher, Frostbone Acolyte, Grave Servant, Vault Sentinel
- Emberling, Dust Hare, Sootbound Sentry, Dusk Moth, Gloomwing Bat
- Grave Acolyte, Hexbinder, Fen Witch, Cinder Sentinel, Basalt Brute
- Cinder Wraith, Shadow Prowler, Bog Specter, Ashveil Phantom, Nightfang Viper

Enemies that need abilityProfile changed to '' (base template AND all addRoleTemplate calls):
- Bog Rat (bog_rat, bog_rat_brute, bog_rat_scavenger) — currently 'thick hide, taunt', 'gnaw, dart'
- Thicket Wolf (thicket_wolf, thicket_wolf_alpha, thicket_wolf_prowler) — currently 'pack bite, lunge' etc.
- Marsh Croaker (marsh_croaker, marsh_croaker_bully) — currently 'tongue lash, croak' etc.
- Ashen Ram (ashen_ram, ashen_ram_runner) — currently 'ram charge, shove' etc.
- Night Rat (night_rat, night_rat_scrapper) — currently 'gnaw, dart' etc.
- Moorland Harrier (moorland_harrier, moorland_harrier_swooper) — currently 'diving strike, screech' etc.
- Barrow Wight (barrow_wight, barrow_wight_shade, barrow_wight_guardian) — currently 'death grip, wail' etc.
- Moor Hag (moor_hag, moor_hag_cackler) — currently 'curse, hex ward' etc.
- Webspinner (webspinner, webspinner_lurker, webspinner_matriarch) — currently 'venomous bite, web' etc.
- Silverpine Sentinel (silverpine_sentinel, silverpine_sentinel_warden)
- Moss Troll (moss_troll, moss_troll_hurler)
- Feral Druid (feral_druid, feral_druid_shapeshifter, feral_druid_caller)
- Iron Golem (iron_golem, iron_golem_siege)
- Renegade Knight (renegade_knight, renegade_knight_berserker, renegade_knight_captain)
- Plague Cultist (plague_cultist, plague_cultist_preacher, plague_cultist_fanatic)
- Warforged Hulk (warforged_hulk, warforged_hulk_devastator)
- Dreadspire Wraith (dreadspire_wraith, dreadspire_wraith_anchor, dreadspire_wraith_howler)
- Runebound Golem (runebound_golem, runebound_golem_shatterer)
- Shadow Necromancer (shadow_necromancer, shadow_necromancer_summoner, shadow_necromancer_lich)
- Abyssal Fiend (abyssal_fiend, abyssal_fiend_tormentor, abyssal_fiend_guardian)
- Dread Knight (dread_knight, dread_knight_executioner, dread_knight_commander)

For each of these: change BOTH the base template `abilityProfile: '...'` AND the addRoleTemplate last parameter from the descriptive string to `''`.

**In `named_enemy_defs.ts` (NAMED_ENEMY_DEFS array):**

For all 12 named bosses, the abilityProfile text is currently flavor text describing abilities that now ARE real (after Task 1 wires them up). KEEP the abilityProfile strings on bosses as-is since they now accurately describe the boss's actual abilities. No changes needed to named_enemy_defs.ts.

IMPORTANT: Do NOT change abilityProfile on enemies that ARE in ENEMY_TEMPLATE_ABILITIES. The abilityProfile text on those enemies serves as documentation and is harmless.
  </action>
  <verify>
1. `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit --pretty 2>&1 | head -20` — compiles cleanly
2. Grep to confirm NO abilityProfile text remains on enemies not in ENEMY_TEMPLATE_ABILITIES:
   - Search for all addRoleTemplate calls and verify only enemies IN ENEMY_TEMPLATE_ABILITIES have non-empty last parameter
3. Grep to confirm enemies WITH abilities still have their abilityProfile text intact (e.g., Ember Wisp should still have 'fire bolts, ignite')
  </verify>
  <done>
All regular enemies without real abilities have empty abilityProfile strings ('') on both their base template and role template entries. Enemies with ENEMY_TEMPLATE_ABILITIES entries retain their descriptive abilityProfile text. TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles: `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit`
2. All 12 boss names appear in ENEMY_TEMPLATE_ABILITIES with 2-3 ability keys each
3. All ability keys used in boss mappings exist in ENEMY_ABILITIES
4. No abilityProfile text on enemies that lack ENEMY_TEMPLATE_ABILITIES entries
5. abilityProfile text preserved on enemies that DO have ENEMY_TEMPLATE_ABILITIES entries
6. Publish locally and check server logs for clean startup: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb`
</verification>

<success_criteria>
- 12 named bosses wired into ENEMY_TEMPLATE_ABILITIES, each with 2-3 abilities from existing catalog
- ~21 regular enemy base templates + their role variants have abilityProfile set to ''
- Enemies with real abilities retain their abilityProfile descriptions
- TypeScript compiles, local publish succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/305-wire-up-all-enemy-abilities-across-all-e/305-SUMMARY.md`
</output>
