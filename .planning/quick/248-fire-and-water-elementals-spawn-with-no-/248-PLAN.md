---
phase: quick-248
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [spacetimedb/src/helpers/combat.ts]
autonomous: true
requirements: []
must_haves:
  truths:
    - "Fire elemental (no pet ability) doesn't generate initial aggro on summon in combat"
    - "Water elemental (pet_heal ability) doesn't generate initial aggro on summon in combat"
    - "Earth elemental (pet_taunt ability) still generates initial aggro on summon in combat"
    - "Non-summoner pets don't generate initial aggro (unchanged)"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "summonPet helper with conditional aggro logic"
      key_section: "lines 465-476 (aggro insertion logic)"
  key_links:
    - from: "summonPet helper"
      to: "aggroEntry insertion"
      via: "condition check on ability.key"
      pattern: "ability?.key === 'pet_taunt'"
---

<objective>
Fix fire and water elemental pets spawning with initial aggro, which causes enemies to immediately focus them instead of the summoner.

Purpose: Tank pets (earth elemental with pet_taunt) hold threat on summon; support pets (fire elemental, water elemental with pet_heal) don't get immediate attention and can survive longer.

Output: Modified `summonPet` helper that only generates initial aggro for pets with the `pet_taunt` ability key.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

Current behavior in `spacetimedb/src/helpers/combat.ts` lines 465-476:
- All summoner pets get initial aggro via SUMMONER_PET_INITIAL_AGGRO on summon
- This includes fire elemental (no ability key) and water elemental (pet_heal key)
- Both should NOT get initial aggro since they can't tank damage

Required change: Only insert aggro entry when `ability?.key === 'pet_taunt'`
</context>

<tasks>

<task type="auto">
  <name>Task 1: Restrict initial aggro to pet_taunt ability only</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
In the `summonPet` helper function around line 465-476, modify the aggro entry insertion condition:

Current condition (line 465):
```typescript
if (inActiveCombat && character.className?.toLowerCase() === 'summoner') {
```

Change to require the pet's ability key to be `'pet_taunt'`:
```typescript
if (inActiveCombat && character.className?.toLowerCase() === 'summoner' && ability?.key === 'pet_taunt') {
```

This ensures:
- Earth elemental (pet_taunt) → gets initial aggro (holds threat as tank)
- Fire elemental (no ability key) → NO initial aggro (survives longer)
- Water elemental (pet_heal) → NO initial aggro (can heal summoner)
- Other summons → NO initial aggro (only taunters get initial threat)
  </action>
  <verify>
Run: `npm test` in spacetimedb/ to ensure no compilation errors
Run: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` to republish module locally
Verify the change compiles and publishes without errors
  </verify>
  <done>
Condition at line 465 includes `ability?.key === 'pet_taunt'` check. On summon:
- Earth elemental generates aggro entry (pet_taunt ability)
- Fire elemental does NOT generate aggro entry
- Water elemental does NOT generate aggro entry
  </done>
</task>

</tasks>

<verification>
Module compiles and publishes without error. Condition logic is correct: only pets with `pet_taunt` ability key trigger initial aggro insertion.
</verification>

<success_criteria>
- spacetimedb/src/helpers/combat.ts line 465 condition includes `ability?.key === 'pet_taunt'`
- Module publishes to local SpacetimeDB without compilation errors
- Fire and water elementals (in-game) no longer generate initial aggro on summon in active combat
- Earth elemental (pet_taunt) still generates initial aggro
</success_criteria>

<output>
After completion, create `.planning/quick/248-fire-and-water-elementals-spawn-with-no-/248-SUMMARY.md`
</output>
