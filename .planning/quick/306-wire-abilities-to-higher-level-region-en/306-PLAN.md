---
phase: quick-306
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/abilities/enemy_abilities.ts
autonomous: true
requirements: [QUICK-306]
must_haves:
  truths:
    - "L5-6 enemies each have 1-2 abilities thematically matched to their fantasy"
    - "L7-8 enemies each have 2 abilities"
    - "L9-12 dungeon enemies each have 2-3 abilities with stronger power values"
    - "Select L3-4 enemies (Barrow Wight, Webspinner) gain 1 ability"
    - "All new abilities exist in ENEMY_ABILITIES before being referenced in ENEMY_TEMPLATE_ABILITIES"
  artifacts:
    - path: "spacetimedb/src/data/abilities/enemy_abilities.ts"
      provides: "New high-tier enemy abilities and template mappings"
      contains: "Dread Knight"
  key_links:
    - from: "ENEMY_TEMPLATE_ABILITIES"
      to: "ENEMY_ABILITIES"
      via: "string keys must match"
      pattern: "every key in ENEMY_TEMPLATE_ABILITIES arrays exists in ENEMY_ABILITIES"
---

<objective>
Wire abilities to all L5-12 enemies that currently have none, and optionally add 1 ability to select L3-4 enemies. Create new stronger abilities for L9-12 dungeon elites.

Purpose: Higher-level enemies feel like auto-attack punching bags. Adding thematically appropriate abilities makes combat more dangerous and interesting as players progress.
Output: Updated enemy_abilities.ts with new abilities and complete ENEMY_TEMPLATE_ABILITIES mappings.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/abilities/enemy_abilities.ts
@spacetimedb/src/seeding/ensure_enemies.ts (for enemy names, roles, creature types)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create new high-tier abilities for L9-12 dungeon elites</name>
  <files>spacetimedb/src/data/abilities/enemy_abilities.ts</files>
  <action>
Add the following NEW abilities to ENEMY_ABILITIES (insert before the closing brace, after the buff section). These are stronger versions for elite dungeon enemies (higher magnitude, power, longer durations):

**New DoTs (high-tier magic):**
- `abyssal_flame`: name "Abyssal Flame", desc "Hellfire consumes from within, charring soul and flesh alike.", castSeconds 3n, cooldownSeconds 22n, kind 'dot', magnitude 5n, rounds 3n, power 6n, damageType 'magic', dotPowerSplit 0.5, targetRule 'aggro', aiChance 55, aiWeight 75, aiRandomness 10
- `necrotic_rot`: name "Necrotic Rot", desc "Flesh blackens and peels as death magic festers.", castSeconds 2n, cooldownSeconds 20n, kind 'dot', magnitude 4n, rounds 3n, power 5n, damageType 'magic', dotPowerSplit 0.5, targetRule 'aggro', aiChance 55, aiWeight 70, aiRandomness 10
- `runic_discharge`: name "Runic Discharge", desc "Arcane runes sear into exposed skin, crackling with residual energy.", castSeconds 2n, cooldownSeconds 18n, kind 'dot', magnitude 4n, rounds 3n, power 5n, damageType 'magic', dotPowerSplit 0.5, targetRule 'aggro', aiChance 55, aiWeight 70, aiRandomness 10

**New DoTs (high-tier physical):**
- `executioner_bleed`: name "Executioner's Bleed", desc "A deliberate wound that drains the life from its victim.", castSeconds 2n, cooldownSeconds 18n, kind 'dot', magnitude 5n, rounds 3n, power 6n, damageType 'physical', dotPowerSplit 0.5, targetRule 'aggro', aiChance 60, aiWeight 75, aiRandomness 10
- `ironclad_rend`: name "Ironclad Rend", desc "Steel-shod limbs tear through armor and flesh.", castSeconds 2n, cooldownSeconds 16n, kind 'dot', magnitude 4n, rounds 2n, power 5n, damageType 'physical', dotPowerSplit 0.5, targetRule 'aggro', aiChance 55, aiWeight 70, aiRandomness 10

**New Debuffs (high-tier):**
- `doom_mark`: name "Doom Mark", desc "A cursed brand weakens all defenses, heralding destruction.", castSeconds 2n, cooldownSeconds 22n, kind 'debuff', effectType 'ac_bonus', magnitude -4n, rounds 4n, power 5n, damageType 'magic', debuffPowerCost 0.25, targetRule 'aggro', aiChance 50, aiWeight 75, aiRandomness 15
- `armor_shatter`: name "Armor Shatter", desc "A massive blow splinters plate and shatters resolve.", castSeconds 2n, cooldownSeconds 20n, kind 'debuff', effectType 'ac_bonus', magnitude -4n, rounds 3n, power 5n, damageType 'physical', debuffPowerCost 0.25, targetRule 'aggro', aiChance 50, aiWeight 75, aiRandomness 15
- `warding_crush`: name "Warding Crush", desc "Runic fists overload magical protections, leaving them inert.", castSeconds 3n, cooldownSeconds 22n, kind 'debuff', effectType 'ac_bonus', magnitude -4n, rounds 4n, power 5n, damageType 'magic', debuffPowerCost 0.25, targetRule 'aggro', aiChance 50, aiWeight 70, aiRandomness 15

**New Heals (high-tier):**
- `unholy_mend`: name "Unholy Mend", desc "Dark power stitches torn flesh with threads of shadow.", castSeconds 3n, cooldownSeconds 22n, kind 'heal', power 7n, healPowerSplit 0.5, hotDuration 3n, targetRule 'lowest_hp', aiChance 70, aiWeight 85, aiRandomness 10

**New AoE (high-tier):**
- `death_pulse`: name "Death Pulse", desc "A wave of necrotic energy washes over all who stand near.", castSeconds 3n, cooldownSeconds 25n, kind 'aoe_damage', power 8n, damageType 'magic', targetRule 'all_players', aiChance 50, aiWeight 80, aiRandomness 15

**New mid-tier abilities (for L5-8):**
- `plague_touch`: name "Plague Touch", desc "Festering sickness spreads from the point of contact.", castSeconds 2n, cooldownSeconds 16n, kind 'dot', magnitude 3n, rounds 3n, power 4n, damageType 'magic', dotPowerSplit 0.5, targetRule 'aggro', aiChance 55, aiWeight 60, aiRandomness 15
- `nature_mend`: name "Nature Mend", desc "Roots and vines bind wounds, coaxing flesh to knit.", castSeconds 2n, cooldownSeconds 18n, kind 'heal', power 5n, healPowerSplit 0.6, hotDuration 3n, targetRule 'lowest_hp', aiChance 70, aiWeight 80, aiRandomness 10
- `spirit_ward`: name "Spirit Ward", desc "A shimmering barrier of spirit energy bolsters allies.", castSeconds 2n, cooldownSeconds 25n, kind 'buff', effectType 'armor_up', magnitude 3n, rounds 4n, targetRule 'all_allies', aiChance 55, aiWeight 65, aiRandomness 15
- `web_snare`: name "Web Snare", desc "Sticky silk tangles limbs and hampers movement.", castSeconds 1n, cooldownSeconds 14n, kind 'debuff', effectType 'ac_bonus', magnitude -2n, rounds 3n, power 3n, damageType 'physical', debuffPowerCost 0.25, targetRule 'aggro', aiChance 50, aiWeight 55, aiRandomness 20
- `knight_challenge`: name "Knight's Challenge", desc "A thunderous war cry that rattles armor and resolve.", castSeconds 2n, cooldownSeconds 20n, kind 'debuff', effectType 'ac_bonus', magnitude -3n, rounds 3n, power 4n, damageType 'physical', debuffPowerCost 0.25, targetRule 'aggro', aiChance 50, aiWeight 65, aiRandomness 15
- `troll_smash`: name "Troll Smash", desc "A crushing overhead blow that dents armor and shakes bones.", castSeconds 2n, cooldownSeconds 16n, kind 'debuff', effectType 'ac_bonus', magnitude -2n, rounds 3n, power 3n, damageType 'physical', debuffPowerCost 0.25, targetRule 'aggro', aiChance 50, aiWeight 60, aiRandomness 15
- `barrow_chill`: name "Barrow Chill", desc "Grave-cold seeps through armor, numbing flesh and will.", castSeconds 2n, cooldownSeconds 16n, kind 'debuff', effectType 'ac_bonus', magnitude -2n, rounds 3n, power 3n, damageType 'magic', debuffPowerCost 0.25, targetRule 'aggro', aiChance 45, aiWeight 55, aiRandomness 20
- `command_undead`: name "Command Undead", desc "A dread imperative galvanizes undead allies to strike harder.", castSeconds 2n, cooldownSeconds 28n, kind 'buff', effectType 'damage_bonus', magnitude 4n, rounds 5n, targetRule 'all_allies', aiChance 60, aiWeight 75, aiRandomness 15

Follow the exact same object shape as existing abilities. Group new abilities with a comment header: `// --- High-tier abilities (L9-12 dungeon elites) ---` and `// --- Mid-tier abilities (L5-8 region enemies) ---`.
  </action>
  <verify>Verify the file parses: `cd C:/projects/uwr && npx tsc --noEmit spacetimedb/src/data/abilities/enemy_abilities.ts` or check that the object has no syntax errors by searching for unmatched braces.</verify>
  <done>All new ability keys exist in ENEMY_ABILITIES with correct shapes matching existing patterns.</done>
</task>

<task type="auto">
  <name>Task 2: Wire all L3-12 enemies to their abilities in ENEMY_TEMPLATE_ABILITIES</name>
  <files>spacetimedb/src/data/abilities/enemy_abilities.ts</files>
  <action>
Add the following entries to ENEMY_TEMPLATE_ABILITIES (insert after the existing night enemies section, before the named bosses section). Add a comment header `// --- Mid/High-level region enemies ---`.

**L3-4 (0-1 ability, select enemies only):**
- `'Barrow Wight': ['barrow_chill']` — undead, magic debuff fits the grave-cold theme
- `'Webspinner': ['web_snare']` — beast, physical debuff from webbing

(Moorland Harrier and Ashen Ram stay auto-attack only — simple beasts.)

**L5-6 (1-2 abilities):**
- `'Silverpine Sentinel': ['spirit_ward']` — spirit tank/support, protective ward for allies
- `'Moor Hag': ['mire_curse', 'shaman_heal']` — swamp humanoid, curse + heal (like Fen Witch pattern)
- `'Feral Druid': ['nature_mend', 'thorn_venom']` — woods humanoid healer, heal + nature DoT
- `'Moss Troll': ['troll_smash', 'stone_cleave']` — beast tank, armor debuff + physical DoT
- `'Plague Cultist': ['plague_touch', 'sapping_chant']` — humanoid magic dps, plague DoT + drain debuff

**L7-8 (2 abilities):**
- `'Iron Golem': ['armor_shatter', 'ironclad_rend']` — construct tank, crushing debuff + physical DoT (use the new high-tier debuff since L7 is borderline)
- `'Renegade Knight': ['knight_challenge', 'bleeding_shot']` — humanoid tank/berserker, war cry debuff + bleed
- `'Warforged Hulk': ['quake_stomp', 'ironclad_rend']` — construct tank, existing quake + new physical DoT

**L9-12 (2-3 abilities, using new high-tier abilities):**
- `'Dreadspire Wraith': ['necrotic_rot', 'doom_mark', 'death_pulse']` — undead dungeon dps, necrotic DoT + curse debuff + AoE
- `'Runebound Golem': ['warding_crush', 'runic_discharge', 'quake_wave']` — construct dungeon tank, rune debuff + magic DoT + existing AoE
- `'Shadow Necromancer': ['shadow_rend', 'unholy_mend', 'command_undead']` — humanoid dungeon caster, shadow DoT + dark heal + undead buff
- `'Abyssal Fiend': ['abyssal_flame', 'doom_mark', 'death_pulse']` — spirit dungeon dps, hellfire DoT + curse + AoE
- `'Dread Knight': ['executioner_bleed', 'armor_shatter', 'command_undead']` — undead dungeon tank, bleed DoT + armor crush + commander buff

Ensure every ability key referenced here exists in ENEMY_ABILITIES (either existing or newly added in Task 1). Double-check: `bleeding_shot`, `stone_cleave`, `mire_curse`, `shaman_heal`, `thorn_venom`, `sapping_chant`, `quake_stomp`, `shadow_rend`, `quake_wave` are all pre-existing.
  </action>
  <verify>
1. Check no duplicate keys in ENEMY_TEMPLATE_ABILITIES (each enemy name appears exactly once).
2. Verify every ability key referenced in the new entries exists as a key in ENEMY_ABILITIES.
3. Run `cd C:/projects/uwr && npx tsc --noEmit spacetimedb/src/data/abilities/enemy_abilities.ts` to confirm no type errors.
  </verify>
  <done>
All 17 enemies (2 at L3-4, 5 at L5-6, 3 at L7-8, 5 at L9-12) have thematically appropriate abilities wired in ENEMY_TEMPLATE_ABILITIES. L3-4 have 1 ability each, L5-6 have 1-2, L7-8 have 2, L9-12 have 3.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit spacetimedb/src/data/abilities/enemy_abilities.ts` — no type errors
2. Count entries in ENEMY_TEMPLATE_ABILITIES — should be 33 (existing) + 17 (new) = ~50 total entries (excluding bosses which are already 12)
3. Verify no ability key typos by cross-referencing ENEMY_TEMPLATE_ABILITIES values against ENEMY_ABILITIES keys
4. Spot-check power scaling: L9-12 abilities should have magnitude 4-5n and power 5-6n (higher than L1-4 abilities at magnitude 1-3n, power 2-4n)
</verification>

<success_criteria>
- Every L5+ enemy in ensure_enemies.ts has at least 1 ability in ENEMY_TEMPLATE_ABILITIES
- L9-12 enemies have 2-3 abilities each with noticeably stronger stats than L1-4 abilities
- All ability references resolve to valid ENEMY_ABILITIES keys
- TypeScript compiles without errors
- Thematic consistency: plague enemies get plague abilities, constructs get crushing/rune abilities, undead get necrotic/shadow abilities, spirits get magic abilities, beasts get physical abilities
</success_criteria>

<output>
After completion, create `.planning/quick/306-wire-abilities-to-higher-level-region-en/306-SUMMARY.md`
</output>
