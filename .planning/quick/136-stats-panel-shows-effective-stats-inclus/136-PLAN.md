---
phase: quick-136
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "Stats panel total stat values include gear template bonuses, affix bonuses from equipped items, and active CharacterEffect stat buffs"
    - "Stats panel base value in parentheses still shows the unmodified character base stat"
    - "Food buffs that grant stat bonuses (e.g. str_bonus from Well Fed) are reflected in the total"
  artifacts:
    - path: "src/App.vue"
      provides: "Enhanced equippedStatBonuses computed that sums gear template + affix + CharacterEffect stat bonuses"
  key_links:
    - from: "src/App.vue equippedStatBonuses"
      to: "itemAffixes reactive data"
      via: "filter affixes by equipped item instance IDs, sum stat keys"
    - from: "src/App.vue equippedStatBonuses"
      to: "characterEffects reactive data"
      via: "filter effects by selected character ID, sum str_bonus/dex_bonus/etc."
---

<objective>
Make the Stats panel display effective stat values that include ALL active bonuses: equipped gear template stats, equipped gear affix bonuses, and active CharacterEffect stat buffs (including food/Well Fed buffs and party buffs like Ballad of Resolve).

Currently `equippedStatBonuses` in App.vue (lines 1800-1819) only sums `template.strBonus`, `template.dexBonus`, etc. from equipped items. It misses:
1. Affix bonuses on equipped items (e.g. +2 STR from a "Mighty" prefix) -- available via `itemAffixes` reactive data
2. CharacterEffect stat buffs (effectType: str_bonus, dex_bonus, cha_bonus, wis_bonus, int_bonus) -- available via `characterEffects` reactive data

The parenthetical base value already correctly shows `selectedCharacter.str` etc. Only the total needs enhancement.

Purpose: Players see their true effective stats reflecting all active bonuses, matching what the server uses in `recomputeCharacterDerived`.
Output: Updated `equippedStatBonuses` computed property in App.vue.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.vue (lines 1800-1819 — equippedStatBonuses computed)
@src/components/StatsPanel.vue (consumer — uses statBonuses prop for totalStr/totalDex/etc.)
@spacetimedb/src/helpers/character.ts (lines 53-73 — server recomputeCharacterDerived as reference for how effects are summed)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Enhance equippedStatBonuses to include affix and buff bonuses</name>
  <files>src/App.vue</files>
  <action>
Modify the `equippedStatBonuses` computed property (around line 1800) to add two additional bonus sources on top of existing gear template bonuses:

**1. Affix bonuses from equipped items:**
After the existing template bonus loop, add a second pass that filters `itemAffixes.value` for affixes belonging to equipped item instances. The affix `statKey` values map as follows (same mapping used in server-side `getEquippedBonuses`):
- `strBonus` -> bonus.str
- `dexBonus` -> bonus.dex
- `intBonus` -> bonus.int
- `wisBonus` -> bonus.wis
- `chaBonus` -> bonus.cha

Implementation approach: Collect the set of equipped instance IDs from the first loop (instances where `equippedSlot` is truthy and `ownerCharacterId` matches). Then iterate `itemAffixes.value`, and for each affix whose `itemInstanceId` is in the equipped set, add `affix.magnitude` to the appropriate bonus key based on `affix.statKey`.

**2. CharacterEffect stat buffs:**
After affix bonuses, iterate `characterEffects.value` filtered to the selected character's ID. For each effect, check `effectType` and sum `magnitude` (as BigInt):
- `str_bonus` -> bonus.str
- `dex_bonus` -> bonus.dex
- `cha_bonus` -> bonus.cha
- `wis_bonus` -> bonus.wis
- `int_bonus` -> bonus.int

This matches exactly what the server does in `recomputeCharacterDerived` (spacetimedb/src/helpers/character.ts lines 58-65).

Both `itemAffixes` and `characterEffects` are already destructured from `useGameData()` in App.vue (lines ~629 and ~588 respectively), so no new data sources are needed.

Note: Compare IDs using `.toString()` pattern consistent with the rest of App.vue (e.g. `instance.ownerCharacterId.toString() === selectedCharacter.value.id.toString()`).
  </action>
  <verify>
1. Run `cd C:/projects/uwr && npx vue-tsc --noEmit --pretty 2>&1 | head -30` to check for TypeScript errors (or run the dev build).
2. Visual spot check: Read the updated equippedStatBonuses computed and confirm it sums template bonuses + affix bonuses + effect bonuses.
3. Confirm the StatsPanel.vue consumer is unchanged (it receives the enhanced bonuses transparently via the same prop shape `{ str, dex, cha, wis, int }`).
  </verify>
  <done>
The `equippedStatBonuses` computed in App.vue returns a `{ str, dex, cha, wis, int }` object that sums: (a) equipped item template stat bonuses, (b) equipped item affix stat bonuses, and (c) active CharacterEffect stat buffs for the selected character. StatsPanel displays these as effective totals with base values in parentheses unchanged.
  </done>
</task>

</tasks>

<verification>
- Stats panel `totalStr` = base STR + gear template STR bonus + affix STR bonus + CharacterEffect str_bonus magnitude
- Same for dex, int, wis, cha
- Base value in parentheses is unchanged (still `selectedCharacter.str`)
- No new props, no new composables, no backend changes needed
- Prop shape `{ str: bigint, dex: bigint, cha: bigint, wis: bigint, int: bigint }` is preserved
</verification>

<success_criteria>
Stats panel effective stat values reflect all three bonus sources (gear template, gear affixes, active buffs/consumables). Base values in parentheses remain unchanged. No TypeScript errors.
</success_criteria>

<output>
After completion, create `.planning/quick/136-stats-panel-shows-effective-stats-inclus/136-SUMMARY.md`
</output>
