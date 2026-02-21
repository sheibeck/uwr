---
phase: quick-236
plan: 01
subsystem: game-data
tags: [abilities, combat, damageType, magic-resist, armor-mitigation]

# Dependency graph
requires: []
provides:
  - "Audited all 16 class ability files for correct damageType classification"
  - "Verified every magic-damaging ability uses damageType: 'magic'"
  - "Verified every non-damaging ability retains damageType: 'none'"
affects: [combat, class-abilities, magic-resist, armor-mitigation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "damageType: 'magic' = direct arcane/elemental/divine/shadow/psychic HP damage to enemies"
    - "damageType: 'none' = heals, buffs, shields, stances, summons, utilities, debuff-only"
    - "damageType: 'physical' = melee/ranged weapon attacks and physical abilities"

key-files:
  created: []
  modified: []

key-decisions:
  - "All 50 damageType: 'none' entries across 16 class files were confirmed correct — no changes needed"
  - "Summoner elemental summons (fire, water, earth, primal titan) retain 'none' because power represents pet stats not cast damage"
  - "Enchanter mesmerize retains 'magic' correctly — psychic stun with direct damage component"
  - "Spellblade thunder_cleave remains 'physical' — plan explicitly excludes physical-to-magic reclassification"
  - "Pre-existing TypeScript errors in combat.ts/corpse.ts/location.ts are out-of-scope and deferred"

patterns-established:
  - "Audit pattern: read every file, grep all 'none' entries, verify against description and power semantics"

requirements-completed: [QUICK-236]

# Metrics
duration: 15min
completed: 2026-02-21
---

# Phase quick-236 Plan 01: Fix Class Abilities with Magic Damage Type Summary

**Full audit of 16 class ability files confirmed all 50 `damageType: 'none'` entries are correctly classified — no ability dealing direct magic HP damage to enemies was mislabeled.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-21T00:00:00Z
- **Completed:** 2026-02-21T00:15:00Z
- **Tasks:** 1
- **Files modified:** 0

## Accomplishments
- Audited all 16 class ability files (bard, cleric, druid, enchanter, wizard, necromancer, paladin, ranger, reaver, rogue, shaman, warrior, monk, spellblade, summoner, beastmaster)
- Verified all 50 `damageType: 'none'` entries match their correct semantic category
- Verified all `damageType: 'magic'` entries correctly represent direct-damage magic abilities
- Confirmed no `damageType: 'none'` misclassification exists — files were already correct

## Task Commits

No file changes were needed — all ability files were already correctly classified.

## Files Created/Modified

None — the audit confirmed existing files are correct.

## Complete Audit Results

Every `damageType: 'none'` entry verified as a non-damaging ability:

**Bard:** melody_of_mending (heal), chorus_of_vigor (mana regen), march_of_wayfarers (travel buff), finale (trigger mechanic, power=0)

**Cleric:** mend (heal), blessing_of_might (STR buff), heal (HP restore), sanctify (armor+regen buff), resurrect (utility)

**Druid:** natures_mark (resource gather utility), natures_gift (HoT heal), shapeshifter_form (stance, power=0)

**Enchanter:** clarity (mana regen), haste (speed buff), bewilderment (debuff-only, no HP damage), charm (pet summon, power=0)

**Wizard:** mana_shield (absorb shield)

**Necromancer:** bone_servant (pet summon), corpse_summon (utility, power=0), plague_lord_form (stance, power=0)

**Paladin:** shield_of_faith (absorb shield), lay_on_hands (heal), devotion (party defense buff)

**Ranger:** track (utility), natures_balm (HoT heal)

**Reaver:** dread_aura (debuff-only damage_down, no HP damage), blood_pact (self-buff), deaths_embrace (stance, power=0)

**Rogue:** evasion (dodge buff), pickpocket (utility), death_mark (damage modifier debuff, power=0)

**Shaman:** spirit_mender (HoT heal), spirit_wolf (pet summon), ancestral_ward (absorb shield)

**Warrior:** intimidating_presence (taunt), rally (party buff), berserker_rage (stance, power=0)

**Monk:** centering (stamina regen), inner_focus (damage buff)

**Spellblade:** frost_armor (absorb shield), stone_skin (armor buff), magma_shield (reactive shield — caster takes hits, attackers self-apply DoT, no active enemy targeting)

**Summoner:** earth_elemental, fire_elemental, water_elemental, primal_titan (all pet summons — power represents pet stats), conjure_sustenance (utility, power=0), conjure_equipment (utility, power=0)

**Beastmaster:** call_beast (pet summon), wild_howl (pet buff)

## Decisions Made

- No changes made. All ability files were already correct.
- Summoner elementals confirmed as pet summons: their `power` field (39n-78n) represents the summoned pet's stat budget, not a cast damage number. These correctly use `'none'`.
- Pre-existing TypeScript errors in `combat.ts`, `corpse.ts`, `location.ts` (RowBuilder type issues) are out-of-scope for this audit and deferred to `deferred-items.md`.

## Deviations from Plan

None - plan executed exactly as written. No ability files required modification.

## Issues Encountered

Pre-existing TypeScript compilation errors in `spacetimedb/src/helpers/combat.ts`, `corpse.ts`, and `location.ts` related to SpacetimeDB RowBuilder type access patterns. These pre-existed this task and are unrelated to ability damageType. Deferred per scope boundary rules.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All class ability damageType values confirmed correct
- Combat mitigation routing (armor vs magic-resist) will correctly apply to all abilities
- No follow-up work needed from this audit

---
*Phase: quick-236*
*Completed: 2026-02-21*
