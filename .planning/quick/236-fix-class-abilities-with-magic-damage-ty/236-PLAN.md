---
phase: quick-236
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/abilities/bard_abilities.ts
  - spacetimedb/src/data/abilities/cleric_abilities.ts
  - spacetimedb/src/data/abilities/druid_abilities.ts
  - spacetimedb/src/data/abilities/enchanter_abilities.ts
  - spacetimedb/src/data/abilities/wizard_abilities.ts
  - spacetimedb/src/data/abilities/necromancer_abilities.ts
  - spacetimedb/src/data/abilities/paladin_abilities.ts
  - spacetimedb/src/data/abilities/ranger_abilities.ts
  - spacetimedb/src/data/abilities/reaver_abilities.ts
  - spacetimedb/src/data/abilities/rogue_abilities.ts
  - spacetimedb/src/data/abilities/shaman_abilities.ts
  - spacetimedb/src/data/abilities/warrior_abilities.ts
  - spacetimedb/src/data/abilities/monk_abilities.ts
  - spacetimedb/src/data/abilities/spellblade_abilities.ts
  - spacetimedb/src/data/abilities/summoner_abilities.ts
  - spacetimedb/src/data/abilities/beastmaster_abilities.ts
autonomous: true
requirements: [QUICK-236]

must_haves:
  truths:
    - "Every ability that deals direct magic damage to enemies has damageType: 'magic'"
    - "Every ability that is a buff, heal, shield, stance, utility, or summon retains damageType: 'none'"
    - "Physical damage abilities remain damageType: 'physical'"
  artifacts:
    - path: "spacetimedb/src/data/abilities/wizard_abilities.ts"
      provides: "Wizard abilities with correct damageType"
    - path: "spacetimedb/src/data/abilities/enchanter_abilities.ts"
      provides: "Enchanter abilities with correct damageType"
  key_links:
    - from: "ability damageType field"
      to: "spacetimedb/src/helpers/combat.ts"
      via: "armor/magic-resist mitigation routing"
      pattern: "ability\\.damageType"
---

<objective>
Audit all class ability files and correct any `damageType: 'none'` entries that actually deal direct magic damage to enemies. The `damageType` field controls combat mitigation routing in combat.ts — `'magic'` bypasses armor and hits magic resist, `'none'` bypasses both. Abilities that deal HP damage to enemies via arcane/elemental/divine/shadow/psychic means should be `'magic'`.

Purpose: Ensure magic-damaging abilities correctly interact with player and enemy magic resist stats.
Output: Updated ability files where damageType has been corrected from 'none' to 'magic' for directly-damaging spells.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md

@spacetimedb/src/data/ability_catalog.ts
@spacetimedb/src/helpers/combat.ts

@spacetimedb/src/data/abilities/bard_abilities.ts
@spacetimedb/src/data/abilities/cleric_abilities.ts
@spacetimedb/src/data/abilities/druid_abilities.ts
@spacetimedb/src/data/abilities/enchanter_abilities.ts
@spacetimedb/src/data/abilities/wizard_abilities.ts
@spacetimedb/src/data/abilities/necromancer_abilities.ts
@spacetimedb/src/data/abilities/paladin_abilities.ts
@spacetimedb/src/data/abilities/ranger_abilities.ts
@spacetimedb/src/data/abilities/reaver_abilities.ts
@spacetimedb/src/data/abilities/rogue_abilities.ts
@spacetimedb/src/data/abilities/shaman_abilities.ts
@spacetimedb/src/data/abilities/warrior_abilities.ts
@spacetimedb/src/data/abilities/monk_abilities.ts
@spacetimedb/src/data/abilities/spellblade_abilities.ts
@spacetimedb/src/data/abilities/summoner_abilities.ts
@spacetimedb/src/data/abilities/beastmaster_abilities.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Audit and fix damageType for all class abilities</name>
  <files>
    spacetimedb/src/data/abilities/bard_abilities.ts
    spacetimedb/src/data/abilities/cleric_abilities.ts
    spacetimedb/src/data/abilities/druid_abilities.ts
    spacetimedb/src/data/abilities/enchanter_abilities.ts
    spacetimedb/src/data/abilities/wizard_abilities.ts
    spacetimedb/src/data/abilities/necromancer_abilities.ts
    spacetimedb/src/data/abilities/paladin_abilities.ts
    spacetimedb/src/data/abilities/ranger_abilities.ts
    spacetimedb/src/data/abilities/reaver_abilities.ts
    spacetimedb/src/data/abilities/rogue_abilities.ts
    spacetimedb/src/data/abilities/shaman_abilities.ts
    spacetimedb/src/data/abilities/warrior_abilities.ts
    spacetimedb/src/data/abilities/monk_abilities.ts
    spacetimedb/src/data/abilities/spellblade_abilities.ts
    spacetimedb/src/data/abilities/summoner_abilities.ts
    spacetimedb/src/data/abilities/beastmaster_abilities.ts
  </files>
  <action>
Read every ability file. For each ability with `damageType: 'none'`, apply this decision rule:

**Change to `'magic'` if:** The ability description explicitly states it deals damage to enemies via arcane, elemental (fire, ice, lightning, nature), divine, shadow, psychic, sonic, or other magical means AND the `power` field is used as a direct damage number (not pet stats).

**Keep as `'none'` if:** The ability is a heal, a buff (self or party), a stance/form toggle, a debuff that applies no direct HP damage, a summon (pet power represents the pet's stats, not cast damage), a utility (corpse summon, resource gather, pickpocket), a damage absorb shield, or a mana/stamina restoration.

Apply this rule file by file. Based on careful reading of all current ability files, the following changes are expected — but re-read each file and verify before editing:

**Abilities that appear to correctly use 'magic' already:** All wizard damage spells, bard_discordant_note, bard_battle_hymn, druid_thorn_lash, druid_wild_surge, druid_entangle, necromancer_plague_spark, necromancer_wither, necromancer_soul_rot, cleric_holy_nova, paladin_consecrated_ground, shaman_hex, shaman_stormcall, enchanter_mind_fray, enchanter_mesmerize.

**Abilities that correctly use 'none' (leave unchanged):**
- Bard: melody_of_mending (heal), chorus_of_vigor (mana regen), march_of_wayfarers (travel buff), finale (trigger mechanic, no direct damage)
- Cleric: mend, heal, blessing_of_might, sanctify, resurrect (all heals/buffs, no enemy damage)
- Druid: natures_mark (utility), natures_gift (HoT), shapeshifter_form (stance)
- Enchanter: clarity (mana regen), haste (speed buff), bewilderment (debuff only, no HP damage), charm (pet summon — power=0n)
- Wizard: mana_shield (absorb shield, no enemy damage)
- Necromancer: bone_servant (pet summon), corpse_summon (utility), plague_lord_form (stance)
- Paladin: shield_of_faith (absorb shield), lay_on_hands (heal), devotion (party defense buff)
- Ranger: track (utility), natures_balm (HoT heal)
- Reaver: dread_aura (debuff only, no HP damage), blood_pact (self-buff), deaths_embrace (stance)
- Rogue: evasion (dodge buff), pickpocket (utility), death_mark (damage modifier debuff, no direct damage)
- Shaman: spirit_mender (HoT), spirit_wolf (pet summon), ancestral_ward (absorb shield)
- Warrior: intimidating_presence (taunt), rally (party buff), berserker_rage (stance)
- Monk: centering (stamina regen), inner_focus (damage buff)
- Spellblade: frost_armor (absorb shield), stone_skin (armor buff), magma_shield (reactive shield — the caster takes hits, attackers self-apply DoT, no active enemy targeting)
- Summoner: all summons and conjures — power represents pet stats, not cast damage
- Beastmaster: call_beast (pet summon), wild_howl (pet buff)

If, upon re-reading, you find any ability not listed above where description clearly says it deals direct magic damage to an enemy but damageType is 'none', change it to 'magic'. Document each change made in the commit message.

Do NOT change physical damage abilities. Do NOT add `'magic'` to debuff-only abilities that apply no direct HP damage.
  </action>
  <verify>
Run TypeScript compilation to confirm no type errors were introduced:

```
cd spacetimedb && npx tsc --noEmit 2>&1 | head -20
```

Grep confirms no ability that deals direct magical HP damage has `damageType: 'none'`:
```
grep -n "damageType: 'none'" spacetimedb/src/data/abilities/*.ts
```

Review the output manually — every remaining 'none' should be a heal, buff, shield, stance, summon, or utility.
  </verify>
  <done>All ability files have been audited. Any ability dealing direct magic damage to enemies has damageType: 'magic'. All non-damaging abilities (heals, buffs, shields, stances, summons, utilities, debuff-only) retain damageType: 'none'. TypeScript compiles without errors.</done>
</task>

</tasks>

<verification>
- `grep -n "damageType: 'none'" spacetimedb/src/data/abilities/*.ts` output reviewed — each 'none' is explicably non-damaging
- `cd spacetimedb && npx tsc --noEmit` exits 0
</verification>

<success_criteria>
All class ability files audited. Any spells that deal direct magical HP damage to enemies use `damageType: 'magic'`. Non-damaging abilities retain `damageType: 'none'`. No TypeScript errors.
</success_criteria>

<output>
After completion, create `.planning/quick/236-fix-class-abilities-with-magic-damage-ty/236-SUMMARY.md` following the summary template.
</output>
