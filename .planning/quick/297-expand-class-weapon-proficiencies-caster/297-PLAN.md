---
phase: 297-expand-class-weapon-proficiencies-caster
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/item_defs.ts
autonomous: true
requirements: [WPNCLASS-01]

must_haves:
  truths:
    - "Casters (enchanter, necromancer, summoner, wizard, shaman) can equip staff OR dagger"
    - "Druid can equip staff, dagger, OR mace"
    - "Ranger can equip ALL weapon types"
    - "Monk can equip dagger OR staff"
    - "Warrior can equip sword, greatsword, OR axe"
    - "Reaver can equip sword, blade, greatsword, OR axe"
    - "Spellblade can equip sword, blade, OR greatsword"
  artifacts:
    - path: "spacetimedb/src/data/item_defs.ts"
      provides: "Updated allowedClasses on all weapon items"
  key_links:
    - from: "spacetimedb/src/data/item_defs.ts"
      to: "spacetimedb/src/seeding/ensure_items.ts"
      via: "import of STARTER_WEAPON_DEFS and WORLD_DROP_GEAR_DEFS"
      pattern: "allowedClasses"
---

<objective>
Expand weapon class proficiencies so casters get dagger access, ranger gets all weapons, and several melee classes get additional weapon options.

Purpose: Broaden build diversity by giving classes more weapon choices.
Output: Updated `item_defs.ts` with corrected `allowedClasses` on all weapon entries.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/item_defs.ts
@spacetimedb/src/seeding/ensure_items.ts (imports from item_defs, no inline weapon data)
@spacetimedb/src/helpers/character.ts (isClassAllowed reads allowedClasses string)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update allowedClasses on all weapon items in item_defs.ts</name>
  <files>spacetimedb/src/data/item_defs.ts</files>
  <action>
Update the `allowedClasses` string on every weapon item across three sections: STARTER_WEAPON_DEFS, WORLD_DROP_GEAR_DEFS (T1 and T2 weapons), to match the new proficiency mapping below.

**Per-weapon-type target allowedClasses:**
- `sword` items: `'warrior,paladin,bard,spellblade,reaver,ranger'`
- `mace` items: `'paladin,cleric,druid,ranger'`
- `blade` items: `'spellblade,reaver,ranger'`
- `axe` items: `'beastmaster,warrior,reaver,ranger'`
- `rapier` items: `'bard,ranger'`
- `dagger` items: `'rogue,enchanter,necromancer,summoner,wizard,shaman,druid,monk,ranger'`
- `staff` items: `'enchanter,necromancer,summoner,druid,shaman,monk,wizard,ranger'`
- `bow` items: `'ranger'` (unchanged)
- `greatsword` items: `'warrior,paladin,reaver,spellblade,ranger'`

**Sections to update (with line references):**

1. **STARTER_WEAPON_DEFS** (lines 39-49):
   - Training Sword (line 40): `allowed` -> `'warrior,paladin,bard,spellblade,reaver,ranger'`
     NOTE: Starter sword currently says `'warrior'` only. Per the proficiency table, warrior still gets a starter sword, but the `allowed` field should reflect which classes CAN use it. Update to the full sword list above so any sword-proficient class picking one up can equip it.
   - Training Mace (line 41): `allowed` -> `'paladin,cleric,druid,ranger'`
   - Training Staff (line 42): `allowed` -> `'enchanter,necromancer,summoner,druid,shaman,monk,wizard,ranger'`
   - Training Bow (line 43): unchanged (`'ranger'`)
   - Training Dagger (line 44): `allowed` -> `'rogue,enchanter,necromancer,summoner,wizard,shaman,druid,monk,ranger'`
   - Training Axe (line 45): `allowed` -> `'beastmaster,warrior,reaver,ranger'`
   - Training Blade (line 46): `allowed` -> `'spellblade,reaver,ranger'`
   - Training Rapier (line 47): `allowed` -> `'bard,ranger'`
   - Training Greatsword (line 48): `allowed` -> `'warrior,paladin,reaver,spellblade,ranger'`

2. **WORLD_DROP_GEAR_DEFS T1 weapons** (lines 153-161):
   - Iron Shortsword (line 153, sword): `allowedClasses` -> `'warrior,paladin,bard,spellblade,reaver,ranger'`
   - Hunting Bow (line 154, bow): unchanged
   - Gnarled Staff (line 155, staff): `allowedClasses` -> `'enchanter,necromancer,summoner,druid,shaman,monk,wizard,ranger'`
   - Worn Mace (line 156, mace): `allowedClasses` -> `'paladin,cleric,druid,ranger'`
   - Rusty Axe (line 157, axe): `allowedClasses` -> `'beastmaster,warrior,reaver,ranger'`
   - Notched Rapier (line 158, rapier): `allowedClasses` -> `'bard,ranger'`
   - Chipped Dagger (line 159, dagger): `allowedClasses` -> `'rogue,enchanter,necromancer,summoner,wizard,shaman,druid,monk,ranger'`
   - Cracked Blade (line 160, blade): `allowedClasses` -> `'spellblade,reaver,ranger'`
   - Crude Greatsword (line 161, greatsword): `allowedClasses` -> `'warrior,paladin,reaver,spellblade,ranger'`

3. **WORLD_DROP_GEAR_DEFS T2 weapons** (lines 164-214):
   - Steel Longsword (line 164, sword): `allowedClasses` -> `'warrior,paladin,bard,spellblade,reaver,ranger'`
   - Yew Bow (line 165, bow): unchanged
   - Oak Staff (line 166, staff): `allowedClasses` -> `'enchanter,necromancer,summoner,druid,shaman,monk,wizard,ranger'`
   - Steel Greatsword (line 167, greatsword): `allowedClasses` -> `'warrior,paladin,reaver,spellblade,ranger'`
   - Flanged Mace (line 210, mace): `allowedClasses` -> `'paladin,cleric,druid,ranger'`
   - Hardened Axe (line 211, axe): `allowedClasses` -> `'beastmaster,warrior,reaver,ranger'`
   - Stiletto (line 212, dagger): `allowedClasses` -> `'rogue,enchanter,necromancer,summoner,wizard,shaman,druid,monk,ranger'`
   - Dueling Rapier (line 213, rapier): `allowedClasses` -> `'bard,ranger'`
   - Tempered Blade (line 214, blade): `allowedClasses` -> `'spellblade,reaver,ranger'`

**Do NOT change:**
- Any armor items (chest, legs, boots, head, wrists, hands, belt, offHand)
- Any jewelry/cloak items
- The ARMOR_ALLOWED_CLASSES record
- Any file other than item_defs.ts
  </action>
  <verify>
Grep for each weapon type and visually confirm the allowedClasses match the target:
- `grep "weaponType: 'sword'" spacetimedb/src/data/item_defs.ts` should show `ranger` in every allowedClasses
- `grep "weaponType: 'dagger'" spacetimedb/src/data/item_defs.ts` should show `enchanter,necromancer,summoner,wizard,shaman,druid,monk,ranger`
- `grep "weaponType: 'axe'" spacetimedb/src/data/item_defs.ts` should show `warrior,reaver` alongside `beastmaster`
- `grep "weaponType: 'greatsword'" spacetimedb/src/data/item_defs.ts` should show `spellblade` alongside existing classes
- Ensure NO armor lines were changed by diffing only weapon lines
  </verify>
  <done>
Every weapon item (starter, T1, T2) in item_defs.ts has its allowedClasses updated to the new proficiency mapping. No armor, jewelry, or non-weapon items were modified.
  </done>
</task>

</tasks>

<verification>
- All 9 weapon types across 3 sections (starter, T1, T2) have correct allowedClasses
- TypeScript compiles without errors: `cd spacetimedb && npx tsc --noEmit`
- No armor or non-weapon items were changed (git diff shows only weapon lines)
</verification>

<success_criteria>
- Casters can equip daggers (allowedClasses includes enchanter, necromancer, summoner, wizard, shaman on all dagger items)
- Druid appears on dagger and mace items (in addition to existing staff)
- Ranger appears on ALL weapon type items
- Monk appears on dagger items (in addition to existing staff)
- Warrior and Reaver appear on axe items
- Spellblade appears on greatsword items
</success_criteria>

<output>
After completion, create `.planning/quick/297-expand-class-weapon-proficiencies-caster/297-SUMMARY.md`
</output>
