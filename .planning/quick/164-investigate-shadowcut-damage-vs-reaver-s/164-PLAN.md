---
phase: quick-164
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/combat_scaling.ts
autonomous: true
must_haves:
  truths:
    - "Rogue Shadow Cut deals competitive damage with Reaver Blood Rend and Spellblade Arcane Slash at level 1"
    - "Rogue abilities scale off the rogue's primary stat (DEX) not their dump stat (STR)"
    - "Damage gap between rogue level-1 ability and hybrid class level-1 abilities is within ~30% not 60%+"
  artifacts:
    - path: "spacetimedb/src/data/combat_scaling.ts"
      provides: "Corrected stat scaling for rogue damage abilities"
      contains: "rogue_shadow_cut: 'dex'"
  key_links:
    - from: "spacetimedb/src/data/combat_scaling.ts"
      to: "spacetimedb/src/seeding/ensure_items.ts"
      via: "ABILITY_STAT_SCALING map used during ability template seeding"
      pattern: "ABILITY_STAT_SCALING\\[key\\]"
---

<objective>
Fix rogue ability damage scaling so Shadow Cut and other rogue damage abilities use DEX (the rogue's primary stat) instead of STR (a dump stat for rogues).

Purpose: Rogue Shadow Cut hits for ~11 at level 1 while Reaver Blood Rend and Spellblade Arcane Slash hit for 25-27. The root cause is a stat scaling mismatch -- rogue damage abilities are mapped to 'str' scaling in ABILITY_STAT_SCALING, but rogue's primary stat is DEX (12 at level 1 vs STR 8). Combined with hybrid classes getting STR+INT=22 total scaling vs rogue's STR=8, the gap is massive. Changing rogue abilities to 'dex' scaling narrows the gap from ~60% to ~30%, which is appropriate given Shadow Cut's DoT component adds sustained damage on top.

Output: Updated combat_scaling.ts with corrected rogue stat scaling, republished module.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/combat_scaling.ts
@spacetimedb/src/data/abilities/rogue_abilities.ts
@spacetimedb/src/data/class_stats.ts
</context>

<analysis>
## Root Cause Analysis

### Level 1 Stats (from computeBaseStats)
- Rogue (primary DEX): STR=8, DEX=12, INT=8
- Reaver (primary STR, secondary INT): STR=12, INT=10
- Spellblade (primary INT, secondary STR): INT=12, STR=10

### Current Stat Scaling (getAbilityStatScaling)
- rogue_shadow_cut: 'str' -> pure scaling: 8 * 1n = 8
- reaver_blood_rend: 'hybrid' -> hybrid scaling: (12 + 10) * 1n = 22
- spellblade_arcane_slash: 'hybrid' -> hybrid scaling: (10 + 12) * 1n = 22

### Ability Multiplier (getAbilityMultiplier = 100 + cast*10 + CD*5/10)
- Shadow Cut (0s cast, 4s CD): 102
- Blood Rend (0s cast, 6s CD): 103
- Arcane Slash (0s cast, 6s CD): 103

### Scaled Ability Damage = (power*5 + statScaling) * multiplier / 100
- Shadow Cut: (20 + 8) * 102 / 100 = 28 -> 60% direct (dotPowerSplit=0.4) = ~16
- Blood Rend: (15 + 22) * 103 / 100 = 38 (no DoT split)
- Arcane Slash: (10 + 22) * 103 / 100 = 32 (no DoT split)

### After Fix (rogue_shadow_cut: 'dex')
- Shadow Cut: (20 + 12) * 102 / 100 = 32 -> 60% direct = ~19, plus DoT ~13 over 2 ticks
- Total Shadow Cut value: ~19 direct + ~13 DoT = ~32 total vs Blood Rend 38, Arcane Slash 32
- Gap narrows from 60%+ to ~15-20% for direct damage, with DoT making up the difference

### Three Compounding Factors
1. **FIXABLE - Stat mismatch**: Rogue abilities scale on STR (8) but rogue primary is DEX (12)
2. **BY DESIGN - Hybrid advantage**: Hybrid uses STR+INT sum (22) vs pure single-stat (8-12). This is intentional -- hybrid classes sacrifice having one great stat for two decent ones.
3. **BY DESIGN - DoT power split**: Shadow Cut's 40% DoT reduces burst but adds sustained damage. This is the rogue's niche.

Only factor #1 is a bug. Factors #2 and #3 are design choices that work correctly once the stat mismatch is fixed.
</analysis>

<tasks>

<task type="auto">
  <name>Task 1: Change rogue damage abilities from STR to DEX scaling</name>
  <files>spacetimedb/src/data/combat_scaling.ts</files>
  <action>
In `spacetimedb/src/data/combat_scaling.ts`, in the ABILITY_STAT_SCALING map, change the three rogue damage abilities from 'str' to 'dex':

```
rogue_shadow_cut: 'dex',    // was 'str' -- rogue primary is DEX, not STR
rogue_bleed: 'dex',         // was 'str' -- rogue primary is DEX, not STR
rogue_shadow_strike: 'dex', // was 'str' -- rogue primary is DEX, not STR
```

Also update the section comment from "STR abilities (melee weapon)" to note these are now under a separate DEX section, or move them to their own DEX block with a comment. Example:

```typescript
// STR abilities (melee weapon)
warrior_slam: 'str',
warrior_cleave: 'str',
warrior_crushing_blow: 'str',
monk_crippling_kick: 'str',
monk_palm_strike: 'str',
monk_tiger_flurry: 'str',
beastmaster_pack_rush: 'str',
beastmaster_beast_fang: 'str',
beastmaster_alpha_assault: 'str',

// DEX abilities (rogue finesse)
rogue_shadow_cut: 'dex',
rogue_bleed: 'dex',
rogue_shadow_strike: 'dex',
```

Do NOT change any other abilities. Monk and Beastmaster stay as STR because those classes have STR as primary or secondary. Only rogue has the mismatch.
  </action>
  <verify>
Grep the file to confirm all three rogue damage abilities now show 'dex' and no rogue damage ability still shows 'str':
- `grep "rogue_shadow_cut" spacetimedb/src/data/combat_scaling.ts` should show 'dex'
- `grep "rogue_bleed" spacetimedb/src/data/combat_scaling.ts` should show 'dex'
- `grep "rogue_shadow_strike" spacetimedb/src/data/combat_scaling.ts` should show 'dex'
  </verify>
  <done>All three rogue damage abilities (shadow_cut, bleed, shadow_strike) scale on 'dex' instead of 'str' in ABILITY_STAT_SCALING map</done>
</task>

<task type="auto">
  <name>Task 2: Republish module to apply scaling fix</name>
  <files></files>
  <action>
Republish the SpacetimeDB module so the updated ABILITY_STAT_SCALING values are seeded into the database:

```bash
spacetime publish uwr --project-path spacetimedb --clear-database -y
```

The `--clear-database` flag is needed because the statScaling field is written during seeding (ensureAbilityTemplates reads ABILITY_STAT_SCALING). An update-in-place publish would also work since the seeding code does update existing rows, but clear-database is safer to ensure clean state.

After publishing, verify the logs show no errors:
```bash
spacetime logs uwr 2>&1 | tail -20
```
  </action>
  <verify>
`spacetime logs uwr` shows successful module initialization with no errors. The ensureAbilityTemplates function should run without issues.
  </verify>
  <done>Module republished with corrected rogue stat scaling. Rogue Shadow Cut should now deal ~19 direct damage (up from ~16) at level 1 with the DEX scaling fix, plus DoT ticks for total ~32 damage value vs Reaver Blood Rend ~38 and Spellblade Arcane Slash ~32.</done>
</task>

</tasks>

<verification>
- Rogue Shadow Cut at level 1 should deal approximately 19 direct + 13 DoT = 32 total damage value (before armor mitigation), compared to Reaver Blood Rend ~38 and Spellblade Arcane Slash ~32
- The ~15-20% direct damage gap vs hybrid classes is acceptable because Shadow Cut compensates with DoT sustained damage and a shorter 4s cooldown (vs 6s for Blood Rend and Arcane Slash)
- At higher levels, the gap further narrows as DEX grows at 3n/level (primary growth) while STR stays at 1n/level (other growth) for rogues
</verification>

<success_criteria>
- ABILITY_STAT_SCALING in combat_scaling.ts maps all three rogue damage abilities to 'dex'
- Module republished successfully
- No rogue damage ability remains mapped to 'str'
</success_criteria>

<output>
After completion, create `.planning/quick/164-investigate-shadowcut-damage-vs-reaver-s/164-SUMMARY.md`
</output>
