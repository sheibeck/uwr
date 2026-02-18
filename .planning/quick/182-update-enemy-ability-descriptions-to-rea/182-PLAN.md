---
phase: quick-182
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/abilities/enemy_abilities.ts
autonomous: true
must_haves:
  truths:
    - "Every enemy ability description reads naturally as a combat log continuation after the structured prefix"
    - "No description repeats the enemy name or ability name (those are prepended by code)"
    - "Descriptions match the tone of the ability kind (dot=ongoing pain, debuff=weakening effect, heal=mending, aoe=area destruction, buff=rallying)"
  artifacts:
    - path: "spacetimedb/src/data/abilities/enemy_abilities.ts"
      provides: "All 41 ENEMY_ABILITIES entries with rewritten description fields"
      contains: "description:"
  key_links:
    - from: "spacetimedb/src/data/abilities/enemy_abilities.ts"
      to: "spacetimedb/src/helpers/combat.ts"
      via: "description field read at line 1575 and appended to log messages"
      pattern: "const desc = \\(ability as any\\)\\.description"
---

<objective>
Rewrite all 41 ENEMY_ABILITIES description strings so they read as natural combat log message continuations rather than passive flavour prose.

Purpose: The combat log currently shows messages like:
  "The Nightfang Viper uses Venom Fang on you for 12. Venomous fangs sink deep, leaving a festering wound that seeps poison."
The description portion ("Venomous fangs sink deep...") reads as standalone flavour text, not a natural continuation of the log entry. Rewriting these to action-oriented continuations will make the combat log read more naturally as a single cohesive message.

Output: Updated enemy_abilities.ts with all 41 descriptions rewritten.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/data/abilities/enemy_abilities.ts
@spacetimedb/src/helpers/combat.ts (lines 1564-1758 - executeEnemyAbility function)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite all 41 ENEMY_ABILITIES descriptions as combat log continuations</name>
  <files>spacetimedb/src/data/abilities/enemy_abilities.ts</files>
  <action>
Rewrite the `description` field on all 41 entries in ENEMY_ABILITIES. Only change description strings -- do not modify any other field (name, castSeconds, cooldownSeconds, kind, magnitude, rounds, power, damageType, targetRule, aiChance, aiWeight, aiRandomness, etc.).

The description is appended to a structured prefix by executeEnemyAbility in combat.ts. The prefix format varies by ability kind:

- dot: "{EnemyName} uses {AbilityName} on you/target for {N}. {DESCRIPTION}"
- debuff: "{EnemyName} uses {AbilityName} for {N} and afflicts you/target. {DESCRIPTION}"
- heal: "{EnemyName} heals {AllyName} for {N}. {DESCRIPTION}"
- aoe_damage: "{EnemyName} hits you/target with {AbilityName} for {N}. {DESCRIPTION}"
- buff: "{EnemyName} rallies allies with {AbilityName}! {DESCRIPTION}"

Rules for rewriting:
1. DO NOT include the enemy name (it is already in the prefix).
2. DO NOT include the ability name (it is already in the prefix).
3. DO NOT start with "A" or "The" as the first word -- jump straight into the action.
4. Each description is a sentence fragment or short sentence that reads as a natural continuation after the period/exclamation in the prefix.
5. Use present tense, active voice.
6. Keep descriptions SHORT -- ideally 6-12 words, max ~15 words. They share line space with damage numbers.
7. Match the ability's mechanical effect:
   - dot: emphasize ongoing/lingering pain
   - debuff: emphasize weakening/vulnerability
   - heal: emphasize mending/restoration
   - aoe_damage: emphasize widespread destruction
   - buff: emphasize empowerment/rallying
8. Use visceral, specific language (not generic fantasy prose).

Example transformations (showing the full log line for context):

BEFORE: "Venomous fangs sink deep, leaving a festering wound that seeps poison."
  Log: "Nightfang Viper uses Venom Fang on you for 12. Venomous fangs sink deep, leaving a festering wound that seeps poison."
AFTER: "Venom courses through the wound."
  Log: "Nightfang Viper uses Venom Fang on you for 12. Venom courses through the wound."

BEFORE: "A brutal horn strike that cracks armor and leaves you staggering."
  Log: "Gloom Stag uses Crushing Gore for 8 and afflicts you. A brutal horn strike that cracks armor and leaves you staggering."
AFTER: "Your armor buckles from the impact."
  Log: "Gloom Stag uses Crushing Gore for 8 and afflicts you. Your armor buckles from the impact."

BEFORE: "Guttural chanting mends torn flesh with pulsing green light."
  Log: "Grave Acolyte heals Blight Stalker for 15. Guttural chanting mends torn flesh with pulsing green light."
AFTER: "Torn flesh knits together with a sickly glow."
  Log: "Grave Acolyte heals Blight Stalker for 15. Torn flesh knits together with a sickly glow."

Note: "you/your" is acceptable in descriptions since the private log message addresses the player directly. For group messages the code uses target names, but the description is the same string for both -- keep it general enough to work in both contexts (prefer "the wound" over "your wound" where possible, but "your armor" is fine since group members understand the context).

All 41 abilities to rewrite (grouped by kind):

DOT - physical (9): poison_bite, rending_bite, bleeding_shot, bog_slime, quick_nip, thorn_venom, blood_drain, rusty_bleed, stone_cleave
DOT - magic (8): ember_burn, shadow_rend, scorching_snap, ember_spark, searing_talon, shadow_bleed, cinder_blight, molten_bleed
DOT - night physical (4): moth_dust, plague_bite, shadow_pounce, venom_fang
DOT - night magic (3): spectral_flame, drowning_grasp, soul_rend
DEBUFF - physical (2): crushing_gore, quake_stomp
DEBUFF - magic (8): sapping_chant, withering_hex, mire_curse, ember_slam, chill_touch, grave_shield_break, vault_crush, soot_hex
DEBUFF - night (1): sonic_screech
HEAL (2): shaman_heal, dark_mend
AOE_DAMAGE (2): flame_burst, quake_wave
BUFF (2): warchief_rally, bolster_defenses
  </action>
  <verify>
1. Run `grep -c "description:" spacetimedb/src/data/abilities/enemy_abilities.ts` -- should return 41.
2. Spot-check 5 random entries to confirm: no enemy names, no ability names repeated, short length, active voice.
3. Run TypeScript compilation check: `cd spacetimedb && npx tsc --noEmit` -- should pass with no errors (only string values changed).
  </verify>
  <done>All 41 ENEMY_ABILITIES description fields rewritten as short, action-oriented combat log continuations. No other fields modified. TypeScript compiles cleanly.</done>
</task>

</tasks>

<verification>
- All 41 descriptions updated (count description: occurrences)
- No description contains an enemy template name from ENEMY_TEMPLATE_ABILITIES
- No description starts with "A " or "The "
- TypeScript compiles without errors
- No fields other than description were modified (diff shows only description line changes)
</verification>

<success_criteria>
- 41/41 descriptions rewritten as natural combat log continuations
- Each description is 6-15 words, active voice, present tense
- Descriptions do not repeat enemy name or ability name
- TypeScript compilation passes
- Git diff shows only description string changes in enemy_abilities.ts
</success_criteria>

<output>
After completion, create `.planning/quick/182-update-enemy-ability-descriptions-to-rea/182-SUMMARY.md`
</output>
