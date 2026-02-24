---
phase: quick-303
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/helpers/combat.ts
autonomous: false
requirements: [QUICK-303]

must_haves:
  truths:
    - "All in-combat HP healing sources are identified and documented"
    - "Any bugs or imbalances in the regen/heal pipeline are reported with evidence"
    - "User receives a clear diagnosis of what is causing large healing ticks on a Level 1 Goblin Enchanter"
  artifacts: []
  key_links: []
---

<objective>
Deep-dive audit of all in-combat HP regeneration and healing pathways to identify what could cause unexpectedly large healing ticks on a Level 1 Goblin Enchanter (no buffs).

Purpose: The user observes that a Level 1 Goblin Enchanter with no buffs receives disproportionately large HP healing ticks during combat. This investigation will trace every code path that can modify a character's HP upward during combat and identify the root cause.

Output: A diagnostic report with root cause and, if bugs are found, targeted fixes.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/combat.ts (regen_health reducer, tick_hot reducer, combat loop)
@spacetimedb/src/helpers/combat.ts (addCharacterEffect, applyHeal, use_ability ability dispatch)
@spacetimedb/src/data/combat_scaling.ts (calculateHealingPower, HEALING_WIS_SCALING_PER_1000)
@spacetimedb/src/helpers/combat_enemies.ts (applyVariance)
@spacetimedb/src/helpers/combat_perks.ts (perk procs with procHealPercent)
@spacetimedb/src/data/class_stats.ts (CLASS_CONFIG, BASE_STAT, BASE_HP, HP_STR_MULTIPLIER)
@spacetimedb/src/data/races.ts (Goblin race definition)
@spacetimedb/src/data/abilities/enchanter_abilities.ts (enchanter ability catalog)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Comprehensive audit of all in-combat HP healing pathways</name>
  <files>
    spacetimedb/src/reducers/combat.ts
    spacetimedb/src/helpers/combat.ts
    spacetimedb/src/helpers/combat_perks.ts
    spacetimedb/src/helpers/combat_enemies.ts
    spacetimedb/src/data/combat_scaling.ts
    spacetimedb/src/data/class_stats.ts
    spacetimedb/src/data/races.ts
    spacetimedb/src/data/abilities/enchanter_abilities.ts
  </files>
  <action>
Trace EVERY code path that can increase a character's HP during combat. For a Level 1 Goblin Enchanter with no buffs, calculate exact expected values for each source.

**Baseline character stats (Level 1 Goblin Enchanter):**
- CHA: 8 (base) + 4 (primary bonus) = 12
- STR: 8 (base)
- DEX: 8 (base) - 1 (Goblin penalty) = 7
- WIS: 8 (base)
- INT: 8 (base)
- maxHp = BASE_HP(50) + STR(8) * HP_STR_MULTIPLIER(8) = 114
- Goblin racial: mana_regen 2, perception 25 -- NO hp_regen bonus (racialHpRegen = 0)

**Healing sources to trace and quantify:**

1. **regen_health reducer** (scheduled every REGEN_TICK_MICROS = 8s):
   - In-combat: HP_REGEN_IN = 2n, but ONLY on halfTick (tickIndex % 2 === 0), so effectively every 16 seconds
   - hpRegenBonus sources: food_health_regen effects, racialHpRegen (0 for Goblin)
   - Expected: 2 HP every 16 seconds -- very small

2. **tick_hot reducer** (scheduled every HOT_TICK_MICROS = 3s):
   - Processes ALL 'regen' CharacterEffects for ALL characters
   - CRITICAL: There is NO in-combat gate on tick_hot -- regen effects tick every 3 seconds regardless of combat state
   - For an unbuffed enchanter, there should be zero 'regen' effects unless something created one

3. **addCharacterEffect immediate first tick** (line 199-206 of combat.ts helper):
   - When a 'regen' effect is CREATED, it immediately applies the first tick
   - Then tick_hot handles subsequent ticks every 3 seconds
   - Check: Is anything auto-creating regen effects when combat starts? (Answer: No, not in the code)

4. **applyHeal function** (inside use_ability):
   - Uses calculateHealingPower: baseHealing + wis * ABILITY_STAT_SCALING_PER_POINT
   - For WIS=8: adds 8 * 1 = 8 to base healing amount
   - Then applyVariance: 85%-115% range
   - Enchanter has NO heal abilities at any level (no applyHeal calls for enchanter_ abilities)

5. **Perk procs** (combat_perks.ts):
   - procHealPercent: on_hit/on_kill/on_crit perk procs that heal
   - Requires renown perks (Bloodthirst, Vampiric Strikes) -- unlikely for a Level 1 character
   - Check if the character has any renown perks assigned

6. **Second Wind perk ability** (active ability, requires renown rank 7+):
   - Heals 20% maxHp on manual activation
   - Unlikely for a Level 1 character

7. **Pet healing** (pet_heal / pet_aoe_heal):
   - Formula: 10n + pet.level * 5n
   - Enchanter charm creates a pet at level 10 (requires level 10 enchanter)
   - Level 1 enchanter cannot have charm

**Key investigation areas to determine root cause:**

A. Check the `regen_health` reducer logic: Line 1316 `if (inCombat && !halfTick) continue;` -- this gates ALL regen (including bonuses) to halfTick. BUT what if a character has a 'regen' CharacterEffect AND the tick_hot fires independently? That would be DOUBLE healing -- 2 HP from regen_health every 16s + regen effect magnitude every 3s from tick_hot.

B. Check if Sanctify or other party buff could have been applied before combat (Sanctify: regen 4n, 450 rounds). If a cleric in the group cast Sanctify before combat, the enchanter would have a 'regen' effect of 4n ticking every 3 seconds (that is 80 HP/minute). Against a 114 HP pool, that is huge.

C. Check if the `mana_regen_bonus` effect type from Clarity is accidentally being counted as HP regen somewhere. In regen_health, line 1332: `else if (effect.effectType === 'mana_regen_bonus') manaRegenBonus += effect.magnitude;` -- this correctly goes to mana, NOT hp. So Clarity is not the issue.

D. Check for CharacterEffect row leaks: Could old 'regen' effects from previous combats persist? The `addCharacterEffect` function (line 180) checks for existing effects with same effectType AND sourceAbility. If an effect was created by one source and never cleaned up, it would keep ticking.

E. Check regen_health line 1310-1313: Dead out-of-combat characters get all effects cleaned. But LIVING out-of-combat characters do NOT get effects cleaned -- effects only expire via the effect_tick reducer (roundsRemaining countdown). If a 'regen' effect has very long roundsRemaining (e.g., Sanctify = 450 rounds, at 10s per effect_tick = 75 minutes), it persists through multiple combats.

F. The effect_tick reducer decrements roundsRemaining for ALL non-regen, non-dot effects every EFFECT_TICK_MICROS (10s). Meanwhile, regen/dot effects are decremented by... Let me check: in tick_hot, line 1668 `if (effect.roundsRemaining === 0n) { delete }`, but I do NOT see tick_hot decrementing roundsRemaining! This means regen effects may NEVER expire via tick_hot. They would only expire if the effect_tick reducer handles them -- but effect_tick (line 1597-1626) does handle 'regen' type effects.

**Produce a diagnostic report as output** listing:
- Each healing source, its expected magnitude, and frequency for a Level 1 Goblin Enchanter
- Any bugs or issues found
- The most likely explanation for "really big healing ticks"
- Recommended fixes if bugs exist

Check spacetime logs if available: `spacetime logs uwr` to look for actual heal event messages mentioning the enchanter.
  </action>
  <verify>
    Diagnostic report is produced with clear root cause analysis. Every in-combat healing pathway is accounted for. Run `spacetime logs uwr 2>&1 | grep -i "heal\|regen\|restored" | tail -50` to look for recent healing events.
  </verify>
  <done>A comprehensive written analysis of all in-combat HP healing pathways is produced, with specific numeric expectations for a Level 1 Goblin Enchanter and identification of any bugs or unexpected behaviors.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Comprehensive audit of all in-combat HP healing pathways with diagnostic report identifying root cause of large healing ticks on Level 1 Goblin Enchanter.

    **Pre-audit key findings from code review:**

    The most likely explanations for "really big healing ticks" on a Level 1 Goblin Enchanter are:

    1. **Stale 'regen' CharacterEffects persisting from party buffs**: If the enchanter was in a group with a Cleric who cast Sanctify (applies regen 4n, 450 rounds), the regen effect ticks every 3 seconds via tick_hot (which has NO in-combat gate). That is 4 HP every 3 seconds = 80 HP/minute against a 114 HP pool. Sanctify lasts 450 rounds at 10s/round = 75 minutes, so it persists through multiple fights.

    2. **tick_hot has no combat awareness**: The tick_hot reducer processes ALL regen CharacterEffects every 3 seconds regardless of combat state. This is BY DESIGN for HoTs cast during combat (like Nature's Balm, Consecrated Ground). But it also means any pre-combat regen buff (Sanctify, food_health_regen) ticks at full rate during combat, bypassing the regen_health reducer's halfTick gate.

    3. **Potential double-healing from regen_health + tick_hot**: If a 'regen' type CharacterEffect exists, the character gets healed by tick_hot every 3 seconds AND by regen_health's base HP_REGEN_IN=2 every 16 seconds. These are independent systems.

    4. **lifeOnHit gear stat is tracked but never consumed**: The `getEquippedBonuses` function accumulates lifeOnHit from Vampiric affixes, but no combat code actually applies it on auto-attacks. This is a separate issue (missing feature, not a healing bug).
  </what-built>
  <how-to-verify>
    Review the diagnostic report. Key questions:
    1. Does the character have any CharacterEffect rows with effectType='regen'? (Check in-game or via DB query)
    2. Was the character ever in a group with a Cleric who cast Sanctify?
    3. Does the character have any food buffs (food_health_regen)?
    4. Does the healing tick amount match any known effect magnitude (e.g., 4 = Sanctify, 7 = Nature's Balm, 8 = Consecrated Ground)?
    5. Is the "really big" healing from the passive regen_health tick (which would be 2 HP max without bonuses) or from a separate heal event?
  </how-to-verify>
  <resume-signal>Share what the actual healing tick amounts are and whether the enchanter had any buffs/party members. Or type "approved" if the analysis is sufficient.</resume-signal>
</task>

</tasks>

<verification>
- All in-combat HP healing code paths traced: regen_health, tick_hot, addCharacterEffect immediate tick, applyHeal, perk procs, pet healing, Second Wind
- Expected healing values calculated for Level 1 Goblin Enchanter baseline
- Root cause candidates ranked by likelihood
- Any bugs identified with fix recommendations
</verification>

<success_criteria>
- User understands exactly which code paths can heal their character during combat
- Root cause of "really big healing ticks" is identified or narrowed to 2-3 candidates
- If a bug exists, a fix is proposed or implemented
</success_criteria>

<output>
After completion, create `.planning/quick/303-deepdive-into-in-combat-regen-of-health-/303-SUMMARY.md`
</output>
