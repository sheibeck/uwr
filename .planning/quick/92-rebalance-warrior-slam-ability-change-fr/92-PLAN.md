---
phase: quick-92
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [spacetimedb/src/data/abilities/warrior_abilities.ts]
autonomous: true

must_haves:
  truths:
    - "Warrior Slam reduces target AC by 5 instead of dealing damage"
    - "Slam debuff lasts 7 seconds (7 rounds)"
    - "Ability metadata in database reflects debuff configuration"
  artifacts:
    - path: "spacetimedb/src/data/abilities/warrior_abilities.ts"
      provides: "warrior_slam ability metadata with debuff configuration"
      min_lines: 15
  key_links:
    - from: "spacetimedb/src/data/abilities/warrior_abilities.ts"
      to: "AbilityTemplate database"
      via: "ability seeding"
      pattern: "debuffType.*ac_bonus|debuffMagnitude.*-5"
---

<objective>
Rebalance Warrior Slam ability from a damage-dealing move to an AC debuff ability.

Purpose: Warrior class becomes more tactical with a protective debuff instead of pure offense, shifting the class identity toward control and threat management. AC debuff gives Warriors a unique utility role in group combat.

Output: Updated warrior_abilities.ts with Slam configured as debuff (AC -5 for 7 seconds).
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

**Ability Database Schema:**
- AbilityTemplate table stores metadata: power, damageType, debuffType, debuffMagnitude, debuffDuration
- Player abilities defined in spacetimedb/src/data/abilities/*.ts files
- Shaman Hex (shaman_hex) is reference example: debuffType='ac_bonus', debuffMagnitude=-2, debuffDuration=3
- Combat scaling applies statScaling to power, debuff costs 25% of power budget per decision #38 from STATE.md

**Current Warrior Slam:**
- power: 3n (damage-based)
- cooldownSeconds: 6n
- damageType: 'physical'
- No debuff fields
</context>

<tasks>

<task type="auto">
  <name>Convert Warrior Slam to AC debuff ability</name>
  <files>spacetimedb/src/data/abilities/warrior_abilities.ts</files>
  <action>
Update warrior_slam in WARRIOR_ABILITIES object:

1. Change kind from implicit (or undefined) to 'debuff' to signal debuff ability
2. Add debuffType: 'ac_bonus' to indicate AC reduction effect
3. Add debuffMagnitude: -5n for 5-point AC reduction per user requirement
4. Add debuffDuration: 7n for 7-second duration per user requirement
5. Remove damageType since debuffs don't deal damage (or keep it 'none')
6. Remove power or reduce to minimal since debuff cost is 25% of power budget
   - With debuff cost at 25%, effective power = 1n gives ~0.25 power to debuff, sufficient for AC-5
   - Reference: Shaman Hex uses power=4n with AC-2 debuff (lighter effect)
   - For AC-5 debuff, use power=3n (same as original) for consistency
7. Update description to reflect debuff behavior: "Slams the target, reducing their armor class by 5 for 7 seconds."

Keep cooldownSeconds=6n unchanged (existing cooldown tuning OK for debuff).

Structure matches Shaman Hex example:
  shaman_hex: {
    name: 'Hex',
    description: '...',
    className: 'shaman',
    resource: 'mana',
    level: 3n,
    power: 4n,
    cooldownSeconds: 0n,
    castSeconds: 1n,
    damageType: 'magic',
    debuffType: 'ac_bonus',
    debuffMagnitude: -2n,
    debuffDuration: 3n,
  }
  </action>
  <verify>
1. Run: `grep -A 12 "warrior_slam:" spacetimedb/src/data/abilities/warrior_abilities.ts`
2. Verify output contains:
   - debuffType: 'ac_bonus'
   - debuffMagnitude: -5n
   - debuffDuration: 7n
   - description mentions "armor class" or "ac"
   - kind is not defined (inherit default) or kind: 'debuff'
3. Confirm cooldownSeconds: 6n is unchanged
4. Build module: `spacetime publish test-db --project-path spacetimedb` to verify TypeScript compilation
  </verify>
  <done>
warrior_slam in spacetimedb/src/data/abilities/warrior_abilities.ts has:
- debuffType: 'ac_bonus'
- debuffMagnitude: -5n
- debuffDuration: 7n
- Updated description mentioning AC reduction
- power: 3n for proper debuff budget allocation
- cooldownSeconds: 6n (unchanged)
- Module compiles without errors
  </done>
</task>

</tasks>

<verification>
After task completion:
1. File spacetimedb/src/data/abilities/warrior_abilities.ts contains valid warrior_slam debuff configuration
2. TypeScript compilation succeeds (spacetime generate detects no type errors)
3. Debuff fields (debuffType, debuffMagnitude, debuffDuration) all populated correctly
4. Ability metadata will seed to AbilityTemplate table on next publish/sync
</verification>

<success_criteria>
- warrior_slam is now configured as AC debuff (reduces target AC by 5 for 7 seconds)
- Ability data is valid TypeScript and compiles
- Configuration matches other debuff abilities (Shaman Hex pattern)
- No breaking changes to other abilities or game systems
</success_criteria>

<output>
After completion, create `.planning/quick/92-rebalance-warrior-slam-ability-change-fr/92-SUMMARY.md` with:

## Summary

**Quick Task 92: Rebalance Warrior Slam ability**

Converted Warrior Slam from damage-dealing (power: 3n, physical damage) to AC debuff ability (power: 3n, debuffType: ac_bonus, debuffMagnitude: -5n, debuffDuration: 7n).

Impact: Warrior class gains tactical debuff utility. Slam now reduces target AC by 5 for 7 seconds instead of dealing damage, aligning with threat management identity.

Files: `spacetimedb/src/data/abilities/warrior_abilities.ts` (15 lines in warrior_slam definition)

Status: Deployed via standard ability seeding pipeline to AbilityTemplate table.
</output>
