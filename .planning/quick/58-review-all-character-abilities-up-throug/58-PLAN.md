---
phase: quick-58
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/ability_catalog.ts
  - spacetimedb/src/data/combat_scaling.ts
  - spacetimedb/src/index.ts
autonomous: true
must_haves:
  truths:
    - "Every level 1-2 ability for all 15 classes has a meaningful mechanical effect"
    - "ranger_track does something mechanically useful instead of being a no-op"
    - "Ability power values and cooldowns are balanced relative to class roles"
    - "No dead code paths where bonus variables are computed but never used"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "Fixed ability implementations for all level 1-2 abilities"
    - path: "spacetimedb/src/data/ability_catalog.ts"
      provides: "Balanced power/cooldown values for level 1-2 abilities"
    - path: "spacetimedb/src/data/combat_scaling.ts"
      provides: "Correct stat scaling entries for all abilities"
  key_links:
    - from: "spacetimedb/src/data/ability_catalog.ts"
      to: "spacetimedb/src/index.ts"
      via: "ABILITIES keys used in executeAbilityAction switch cases"
      pattern: "case '(warrior|rogue|wizard|cleric|druid|paladin|ranger|necromancer|spellblade|beastmaster|monk|shaman|enchanter|bard|reaver|summoner)_"
---

<objective>
Review all 15 classes' level 1-2 abilities for balance and implementation completeness, fix any abilities that are no-ops or have dead code, and ensure power/cooldown values are consistent with class roles.

Purpose: Players only have access to level 1-2 abilities early game. Every ability must feel impactful and mechanically distinct. Several abilities have dead code (computed bonuses that are never applied) or are effectively no-ops.

Output: Balanced, fully-functional level 1-2 abilities for all 15 classes.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@spacetimedb/src/data/ability_catalog.ts
@spacetimedb/src/data/combat_scaling.ts
@spacetimedb/src/data/class_stats.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Audit and document all level 1-2 ability issues</name>
  <files>spacetimedb/src/data/ability_catalog.ts, spacetimedb/src/data/combat_scaling.ts</files>
  <action>
Read through all 15 classes' level 1 and level 2 abilities in ability_catalog.ts and their implementations in index.ts (executeAbilityAction switch block, starting around line 2387). Document all issues found in the categories below, then fix the catalog values.

**Known issues to address:**

1. **ranger_track (level 2, power=1, cooldown=600s):** Currently a complete no-op -- just logs "You study the tracks in the area." with zero mechanical effect. This is the ranger's only level 2 ability and needs a real effect. Implement ranger_track as a scouting ability: reveal the names and levels of all enemies at the current location for 60 seconds (add a character effect 'tracking' with duration 20 ticks = 60s). Reduce cooldown from 600n to 120n (2 min) to make it usable.

2. **Balance pass on power values for level 1 damage abilities:**
   Current power values range from 2-4 for level 1 damage abilities:
   - power=2: shaman_spirit_mender (healer, OK), enchanter_mind_fray (has DoT+debuff so lower base is fine), druid_thorn_lash (has DoT+heal so lower base is fine), beastmaster_pack_rush (has 2 hits so lower base is fine), necromancer_plague_spark (has DoT+heal), summoner_conjure_vessel (has mana regen buff), bard_discordant_note (has party buff)
   - power=3: warrior_slam (has stun debuff, OK), paladin_holy_strike (has self AC buff, OK), cleric_mend (heal, OK), ranger_marked_shot (has debuff, OK), monk_crippling_kick (has debuff, OK), reaver_blood_rend (has lifesteal, OK)
   - power=4: wizard_magic_missile (pure damage, OK), rogue_shadow_cut (has DoT, borderline high but rogue needs burst)

   The power distribution is actually reasonable -- abilities with extra effects have lower power, pure damage has higher power. **No changes needed to level 1 power values.**

3. **Balance pass on level 2 utility ability cooldowns:**
   Some utility cooldowns are extreme compared to their effect:
   - 600s (10 min): ranger_track, paladin_lay_on_hands, bard_ballad_of_resolve, enchanter_veil_of_calm -- these are fight-defining abilities that should be rare, BUT ranger_track does nothing so its cooldown is wasted
   - 120s (2 min): rogue_pickpocket, druid_natures_mark -- moderate, out-of-combat utility
   - 60s: monk_centering, spellblade_rune_ward -- once per fight
   - 30s: cleric_sanctify -- cleanse, reusable in long fights
   - 20s: pet summons (shaman/necro/beastmaster/summoner) -- need to resummon if pet dies
   - 12s: reaver_blood_pact -- self buff, frequent
   - Keep all level 2 cooldowns as-is EXCEPT ranger_track (600n -> 120n).

4. **Verify ABILITY_STAT_SCALING in combat_scaling.ts has entries for ALL abilities.** Currently all entries are present -- confirm no gaps.

Update ability_catalog.ts:
- ranger_track: change cooldownSeconds from 600n to 120n

Verify combat_scaling.ts:
- Confirm all level 1-2 abilities have entries in ABILITY_STAT_SCALING (they do -- no changes needed)
  </action>
  <verify>
Verify that ranger_track cooldown is 120n in ability_catalog.ts.
Verify every ability key in ABILITIES has a corresponding entry in ABILITY_STAT_SCALING.
  </verify>
  <done>ranger_track cooldown updated to 120n. All level 1-2 abilities have stat scaling entries.</done>
</task>

<task type="auto">
  <name>Task 2: Fix ranger_track implementation and clean up dead code in executeAbilityAction</name>
  <files>spacetimedb/src/index.ts</files>
  <action>
Fix the following issues in the executeAbilityAction function (switch block starting around line 2387):

1. **Fix ranger_track (around line 2743):** Currently just logs text. Replace with a meaningful scouting mechanic:
   - Get the character's current location
   - Find all enemy spawns at that location using `ctx.db.locationEnemyTemplate.by_location.filter(character.locationId)` (or whatever the location-enemy mapping is)
   - For each enemy template found, get the template details and log a private event showing the enemy name and level: "Tracks reveal: {enemyName} (Level {level})"
   - If no enemies are trackable, log "You find no tracks worth following."
   - Add a 'tracking' character effect (magnitude 1n, duration 6n = 18 seconds) so the player knows the ability activated. This is cosmetic -- the real value is the information in the log.
   - Look up the actual data model for location-enemy associations. Check for `locationEnemyTemplate` or similar table with a `by_location` index. Use `ctx.db.enemyTemplate.id.find()` to resolve template details.

2. **Do NOT touch any level 3+ ability implementations** even if they have issues (bard_echoed_chord, bard_crushing_crescendo, rogue_shadow_strike have computed-but-unused bonus variables). Those are out of scope for this task (level 1-2 only).

3. **Verify druid_natures_mark implementation (around line 2898):** This IS implemented and works -- gathers resources when used out of combat. Confirm the implementation is solid:
   - Checks for combat (throws if in combat) -- correct
   - Gets location terrain -- correct
   - Picks random resource from terrain pool -- correct
   - Checks inventory space -- correct
   - Adds 1-4 items -- correct
   - No changes needed for druid_natures_mark.

After making changes, publish the module and regenerate bindings:
```bash
spacetime publish uwr --project-path spacetimedb && spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb
```
  </action>
  <verify>
Run `spacetime publish uwr --project-path spacetimedb` and verify no compilation errors.
Grep for `case 'ranger_track':` in index.ts and verify it has meaningful logic (not just a log message).
Verify druid_natures_mark case still has the resource gathering logic intact.
  </verify>
  <done>
ranger_track reveals enemy information at the current location and applies a tracking effect.
druid_natures_mark confirmed working (gathers resources out of combat).
All level 1-2 abilities for all 15 classes have meaningful mechanical implementations.
Module publishes without errors.
  </done>
</task>

</tasks>

<verification>
1. All 15 classes have level 1 and level 2 abilities defined in ability_catalog.ts
2. Every ability key has a matching case in executeAbilityAction
3. Every ability key has a ABILITY_STAT_SCALING entry in combat_scaling.ts
4. ranger_track does something mechanically useful (reveals enemy info)
5. druid_natures_mark gathers resources (already working)
6. No level 1-2 abilities are pure no-ops
7. Module publishes successfully
</verification>

<success_criteria>
- All 30 abilities (15 classes x 2 levels) have working implementations with mechanical effects
- ranger_track reveals enemies at current location with 120s cooldown
- druid_natures_mark continues to work as resource gatherer
- Power/cooldown values are consistent with class roles (documented in audit)
- Module compiles and publishes without errors
</success_criteria>

<output>
After completion, create `.planning/quick/58-review-all-character-abilities-up-throug/58-SUMMARY.md`
</output>
