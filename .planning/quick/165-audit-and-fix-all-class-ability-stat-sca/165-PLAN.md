---
phase: quick-165
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/combat_scaling.ts
  - spacetimedb/src/data/class_stats.ts
autonomous: true
must_haves:
  truths:
    - "Pure classes scale damage abilities on their primary stat only"
    - "Hybrid classes scale damage abilities using 60% primary + 40% secondary stat"
    - "The hybrid formula in getAbilityStatScaling reads primary/secondary from CLASS_CONFIG"
    - "All ability keys in ABILITY_STAT_SCALING map to the correct scaling type"
  artifacts:
    - path: "spacetimedb/src/data/combat_scaling.ts"
      provides: "Updated ABILITY_STAT_SCALING map and getAbilityStatScaling with 60/40 hybrid support"
    - path: "spacetimedb/src/data/class_stats.ts"
      provides: "Paladin secondary stat correction (if needed)"
  key_links:
    - from: "spacetimedb/src/data/combat_scaling.ts"
      to: "spacetimedb/src/data/class_stats.ts"
      via: "getClassConfig import for hybrid stat lookup"
      pattern: "getClassConfig.*className"
---

<objective>
Audit and fix all class ability stat scaling so that: (1) pure classes scale damage
abilities on their primary stat, (2) hybrid classes use a 60% primary / 40% secondary
weighted split instead of the current 50/50 STR+INT hardcoded sum.

Purpose: Several classes have incorrect or suboptimal stat scaling that causes damage
abilities to key off the wrong stat or miss the secondary stat contribution entirely.
Output: Updated combat_scaling.ts with correct per-ability scaling types and a
class-config-aware 60/40 hybrid formula.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/combat_scaling.ts
@spacetimedb/src/data/class_stats.ts
@spacetimedb/src/helpers/combat.ts (lines 479-492 - stat scaling consumption)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix getAbilityStatScaling hybrid formula to use 60/40 class-config-aware split</name>
  <files>spacetimedb/src/data/combat_scaling.ts</files>
  <action>
Update the `getAbilityStatScaling` function's `hybrid` branch to use CLASS_CONFIG
primary/secondary instead of hardcoded STR+INT:

Current hybrid code (line 294-297):
```typescript
if (statScaling === 'hybrid') {
  return (characterStats.str + characterStats.int) * 1n;
}
```

Replace with a 60/40 weighted split using the class's actual primary and secondary stats:
```typescript
if (statScaling === 'hybrid') {
  const config = getClassConfig(className);
  if (config.secondary) {
    const primaryVal = characterStats[config.primary] ?? 0n;
    const secondaryVal = characterStats[config.secondary] ?? 0n;
    // 60% primary + 40% secondary, scaled by ABILITY_STAT_SCALING_PER_POINT
    return ((primaryVal * 60n + secondaryVal * 40n) / 100n) * ABILITY_STAT_SCALING_PER_POINT;
  }
  // Fallback: class has no secondary, use primary only
  return characterStats[config.primary] * ABILITY_STAT_SCALING_PER_POINT;
}
```

The function already imports `getClassConfig` (line 1). The `className` parameter is
already passed in (line 287). No signature changes needed.

Note: Pure stat scaling branch (line 300) stays as-is: `stat * ABILITY_STAT_SCALING_PER_POINT`.
The 60/40 hybrid branch effectively gives hybrid classes slightly more total scaling
than pure classes (0.6*primary + 0.4*secondary vs 1.0*primary), which is correct
because hybrid classes split their stat growth across two stats and thus have lower
individual stat values.
  </action>
  <verify>
Grep combat_scaling.ts for the hybrid branch to confirm it references getClassConfig
and uses 60n/40n weighting. Verify no TypeScript compilation errors by checking
`npx tsc --noEmit --project spacetimedb/tsconfig.json` (or equivalent build check).
  </verify>
  <done>
The hybrid formula uses 60% primary + 40% secondary from CLASS_CONFIG instead of
hardcoded STR+INT sum. Classes without a secondary stat fall back to primary-only scaling.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix all incorrect ABILITY_STAT_SCALING entries per class primary/secondary config</name>
  <files>spacetimedb/src/data/combat_scaling.ts</files>
  <action>
Update ABILITY_STAT_SCALING entries for every class whose damage abilities have incorrect
scaling. The corrections are based on CLASS_CONFIG in class_stats.ts:

**Enchanter** (primary: cha, no secondary) -- currently 'int', should be 'cha':
- `enchanter_mind_fray: 'int'` -> `'cha'`
- `enchanter_slow: 'int'` -> `'cha'`
- `enchanter_charm_fray: 'int'` -> `'cha'`

**Paladin** (primary: wis, no secondary) -- currently 'hybrid', should be 'wis':
- `paladin_holy_strike: 'hybrid'` -> `'wis'`
- `paladin_radiant_smite: 'hybrid'` -> `'wis'`

**Ranger** (primary: dex, secondary: wis) -- currently 'wis', should be 'hybrid':
- `ranger_marked_shot: 'wis'` -> `'hybrid'`
- `ranger_rapid_shot: 'wis'` -> `'hybrid'`
- `ranger_piercing_arrow: 'wis'` -> `'hybrid'`

**Monk** (primary: dex, secondary: str) -- currently 'str', should be 'hybrid':
- `monk_crippling_kick: 'str'` -> `'hybrid'`
- `monk_palm_strike: 'str'` -> `'hybrid'`
- `monk_tiger_flurry: 'str'` -> `'hybrid'`

**Beastmaster** (primary: str, secondary: dex) -- currently 'str', should be 'hybrid':
- `beastmaster_pack_rush: 'str'` -> `'hybrid'`
- `beastmaster_beast_fang: 'str'` -> `'hybrid'`
- `beastmaster_alpha_assault: 'str'` -> `'hybrid'`

**Bard** (primary: cha, secondary: int) -- currently 'cha', should be 'hybrid':
- `bard_discordant_note: 'cha'` -> `'hybrid'`
- `bard_echoed_chord: 'cha'` -> `'hybrid'`
- `bard_crushing_crescendo: 'cha'` -> `'hybrid'`

**Spellblade** (primary: int, secondary: str) -- currently 'hybrid', stays 'hybrid':
- No change needed (already 'hybrid'), but the formula fix in Task 1 will change its
  behavior from (str+int)*1 to (int*60%+str*40%)*1 which is the correct weighting.

**Reaver** (primary: str, secondary: int) -- currently 'hybrid', stays 'hybrid':
- No change needed (already 'hybrid'), but the formula fix in Task 1 will change its
  behavior from (str+int)*1 to (str*60%+int*40%)*1 which is the correct weighting.

Also update the section comments in ABILITY_STAT_SCALING to reflect the new groupings:
- Rename "STR abilities" section to only include warrior (pure STR classes)
- Add a "Hybrid abilities" section that lists all six hybrid classes: ranger, monk,
  beastmaster, bard, spellblade, reaver
- The "Hybrid abilities (STR+INT)" comment should become "Hybrid abilities (60% primary + 40% secondary per CLASS_CONFIG)"
- Move paladin damage abilities to the "WIS abilities" section
- Move enchanter damage abilities to the "CHA abilities" section (rename from just bard)

Summary of changes (17 ability entries total):
- 3 enchanter abilities: int -> cha
- 2 paladin abilities: hybrid -> wis
- 3 ranger abilities: wis -> hybrid
- 3 monk abilities: str -> hybrid
- 3 beastmaster abilities: str -> hybrid
- 3 bard abilities: cha -> hybrid

Classes unchanged (already correct):
- warrior (str) -- pure STR, OK
- rogue (dex) -- pure DEX, OK
- wizard (int) -- pure INT, OK
- cleric (wis) -- pure WIS, OK
- necromancer (int) -- pure INT, OK
- summoner (int) -- pure INT, OK
- druid (wis) -- pure WIS, OK
- shaman (wis) -- pure WIS, OK
- spellblade (hybrid) -- already hybrid, formula fix handles 60/40
- reaver (hybrid) -- already hybrid, formula fix handles 60/40
  </action>
  <verify>
1. Count entries in ABILITY_STAT_SCALING: should still have exactly the same number of
   ability keys (no additions or removals).
2. Verify every class's damage abilities map to the correct scaling type:
   - Pure classes (warrior/rogue/wizard/cleric/necromancer/summoner/enchanter/druid/shaman/paladin):
     damage abilities should use their CLASS_CONFIG.primary stat string
   - Hybrid classes (ranger/monk/beastmaster/bard/spellblade/reaver):
     damage abilities should use 'hybrid'
3. `npx tsc --noEmit --project spacetimedb/tsconfig.json` passes (type checking).
  </verify>
  <done>
All 17 ability scaling entries corrected. Every class's damage abilities now scale
on their CLASS_CONFIG primary stat (pure classes) or use 'hybrid' (classes with secondary).
  </done>
</task>

<task type="auto">
  <name>Task 3: Republish module and re-seed ability templates with corrected statScaling values</name>
  <files>spacetimedb/src/data/combat_scaling.ts</files>
  <action>
The ABILITY_STAT_SCALING map is used by ensureAbilityTemplates (in ensure_abilities.ts or
similar) to seed the AbilityTemplate table's statScaling column. After changing the map
values, the module must be republished with --clear-database to re-seed all ability
templates with the corrected statScaling values.

Run:
```bash
spacetime publish uwr --clear-database -y --project-path spacetimedb
```

Then verify the logs show no errors:
```bash
spacetime logs uwr
```

Note: --clear-database is required because statScaling values are seeded into AbilityTemplate
rows at init time. The upsert pattern in ensureAbilityTemplates will update existing rows,
but --clear-database ensures a clean slate. This is consistent with the pattern used in
quick-164 (rogue stat scaling fix).
  </action>
  <verify>
1. `spacetime publish` completes without error
2. `spacetime logs uwr` shows no panics or errors related to ability templates
3. Spot-check: search logs for "ability" or inspect AbilityTemplate rows to confirm
   statScaling values match the updated ABILITY_STAT_SCALING map
  </verify>
  <done>
Module republished with corrected statScaling values in all AbilityTemplate rows.
Combat damage for all 16 classes now scales correctly on their primary stat (pure)
or 60/40 primary/secondary split (hybrid).
  </done>
</task>

</tasks>

<verification>
After all tasks complete:
1. Pure class abilities (warrior/rogue/wizard/cleric/necro/summoner/enchanter/druid/shaman/paladin)
   scale on their CLASS_CONFIG.primary stat
2. Hybrid class abilities (ranger/monk/beastmaster/bard/spellblade/reaver) use 60% primary
   + 40% secondary from CLASS_CONFIG
3. No hardcoded STR+INT sum remains in the hybrid branch
4. Module publishes and runs without errors
</verification>

<success_criteria>
- getAbilityStatScaling hybrid branch uses CLASS_CONFIG primary/secondary with 60/40 weighting
- All 17 incorrect ABILITY_STAT_SCALING entries corrected per audit
- Module republished successfully with corrected ability template seeds
- Enchanter damage scales on CHA, Paladin damage scales on WIS, Ranger/Monk/Beastmaster/Bard
  damage uses hybrid formula with their respective primary/secondary stats
</success_criteria>

<output>
After completion, create `.planning/quick/165-audit-and-fix-all-class-ability-stat-sca/165-SUMMARY.md`
</output>
