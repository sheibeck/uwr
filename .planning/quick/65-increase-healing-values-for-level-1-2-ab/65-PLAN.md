---
phase: quick-65
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/index.ts
autonomous: true
must_haves:
  truths:
    - "Level 1-2 healing abilities restore proportionally meaningful HP relative to the new ~146 HP pools"
    - "Shaman Spirit Mender heals roughly 2x its previous values"
    - "Cleric Mend heals roughly 2x its previous value"
    - "Minor lifetap heals (Thorn Lash, Plague Spark) scale up proportionally"
    - "Paladin Lay on Hands unchanged (already scales to missing HP)"
    - "Reaver Blood Rend unchanged (percentage-based lifesteal already scales)"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "Updated healing values in ability switch statements"
  key_links:
    - from: "spacetimedb/src/index.ts"
      to: "applyHeal function"
      via: "hardcoded bigint healing amounts passed to applyHeal"
      pattern: "applyHeal\\(.*\\d+n"
---

<objective>
Increase flat healing values for level 1-2 character abilities to match the ~1.8x HP pool increase from quick-56.

Purpose: HP pools increased from ~80 to ~146 (quick-56: BASE_HP 20->50, HP_STR_MULTIPLIER 5->8), but healing amounts stayed the same. A Cleric Mend healing 10 HP against 80 max (12.5%) now heals 10 against 146 max (6.8%), making heals feel weak.

Output: Updated hardcoded healing values in spacetimedb/src/index.ts switch statement.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/index.ts (lines 2302-2335 applyHeal function, lines 2387-2395 Spirit Mender, line 2545 Mend, line 2588 Heal, lines 2701-2712 Lay on Hands, line 2808 Plague Spark, line 2933 Thorn Lash, lines 3007-3014 Blood Rend, line 2794 Nature's Balm, line 2995 Nature's Gift)
@spacetimedb/src/data/ability_catalog.ts (ability metadata with power/hotPowerSplit values)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scale level 1-2 healing values ~2x in ability switch statements</name>
  <files>spacetimedb/src/index.ts</files>
  <action>
Update the hardcoded healing amounts in the ability switch statement (around lines 2387-3082) for all level 1 and 2 abilities that have flat healing values. Apply roughly 2x multiplier to match the ~1.8x HP pool increase (rounding up to clean numbers).

Specific changes:

**shaman_spirit_mender (L1)** — line ~2390:
- `applyHeal(targetCharacter, 6n, ...)` -> `applyHeal(targetCharacter, 12n, ...)`
- `addCharacterEffect(ctx, targetCharacter.id, 'regen', 3n, 2n, ...)` -> `addCharacterEffect(ctx, targetCharacter.id, 'regen', 5n, 2n, ...)`
- Old total: 6 direct + 6 HoT = 12. New total: 12 direct + 10 HoT = 22.

**cleric_mend (L1)** — line ~2545:
- `applyHeal(targetCharacter, 10n, ...)` -> `applyHeal(targetCharacter, 18n, ...)`
- Old: 10. New: 18 (~1.8x, Mend is the bread-and-butter heal).

**cleric_heal (L5, included for consistency but NOT level 1-2)** — Do NOT change. This is level 5.

**necromancer_plague_spark (L1)** — line ~2808:
- `applyHeal(character, 2n, ...)` -> `applyHeal(character, 4n, ...)`
- Minor self-lifetap, 2x is clean.

**druid_thorn_lash (L1)** — line ~2933:
- `applyHeal(character, 3n, ...)` -> `applyHeal(character, 6n, ...)`
- Minor self-lifetap, 2x is clean.

**DO NOT change these (they already scale with HP/damage):**
- `paladin_lay_on_hands` (L2): Heals missing HP (already proportional to max HP)
- `reaver_blood_rend` (L1): Heals 30% of damage dealt (already proportional)

**Also scale these higher-level abilities that are HoT/HP-bonus based (for consistency):**

**ranger_natures_balm (L4)** — line ~2794:
- `addCharacterEffect(ctx, targetCharacter.id, 'regen', 4n, 3n, ...)` -> `addCharacterEffect(ctx, targetCharacter.id, 'regen', 7n, 3n, ...)`
- Old total: 12 HoT. New total: 21 HoT.

**druid_natures_gift (L4)** — line ~2995:
- `applyPartyHpBonus(8n, 3n, ...)` -> `applyPartyHpBonus(15n, 3n, ...)`
- Old: 8 temp HP per member. New: 15 temp HP per member.

The goal is that healing abilities restore roughly the same PERCENTAGE of HP as before the HP pool increase. Before: Mend healed ~12.5% of 80 HP. After: Mend heals ~12.3% of 146 HP (18/146).
  </action>
  <verify>
Run `spacetime publish uwr --project-path spacetimedb` (or local build check) to verify no syntax errors. Grep for the updated values:
- `grep -n "applyHeal\|addCharacterEffect.*regen\|applyPartyHpBonus" spacetimedb/src/index.ts` and verify the new numbers appear.
  </verify>
  <done>
All level 1-2 flat healing values doubled. Spirit Mender: 12n direct + 5n/tick HoT. Mend: 18n. Plague Spark lifetap: 4n. Thorn Lash lifetap: 6n. Nature's Balm HoT: 7n/tick. Nature's Gift HP bonus: 15n. Lay on Hands and Blood Rend unchanged (already scale with HP/damage).
  </done>
</task>

</tasks>

<verification>
1. Build succeeds without errors
2. Healing values in switch statement match the specified new amounts
3. Lay on Hands and Blood Rend remain unchanged
4. No other abilities accidentally modified
</verification>

<success_criteria>
- All flat healing amounts for level 1-2 abilities increased ~2x
- Build/publish succeeds
- Percentage of HP healed per cast is roughly equivalent to pre-quick-56 ratios
</success_criteria>

<output>
After completion, create `.planning/quick/65-increase-healing-values-for-level-1-2-ab/65-SUMMARY.md`
</output>
