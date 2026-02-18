---
phase: quick-188
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/crafting_materials.ts
  - spacetimedb/src/reducers/items.ts
autonomous: true
must_haves:
  truths:
    - "Life Stone modifier with Lesser Essence applies +5 hpBonus (not +1)"
    - "Life Stone modifier with Essence applies +8 hpBonus (not +2)"
    - "Life Stone modifier with Greater Essence applies +15 hpBonus (not +3)"
    - "Mana Pearl modifier with Lesser Essence applies +5 manaBonus (not +1)"
    - "Mana Pearl modifier with Essence applies +8 manaBonus (not +2)"
    - "Mana Pearl modifier with Greater Essence applies +15 manaBonus (not +3)"
    - "Primary stat modifiers (Glowing Stone, Clear Crystal, etc.) still use 1n/2n/3n magnitudes unchanged"
  artifacts:
    - path: "spacetimedb/src/data/crafting_materials.ts"
      provides: "MODIFIER_MAGNITUDE_BY_ESSENCE lookup for stat-specific scaling"
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "craft_recipe applies stat-specific magnitude for hp/mana modifiers"
  key_links:
    - from: "spacetimedb/src/reducers/items.ts"
      to: "spacetimedb/src/data/crafting_materials.ts"
      via: "MODIFIER_MAGNITUDE_BY_ESSENCE import for stat-specific magnitude lookup"
      pattern: "MODIFIER_MAGNITUDE_BY_ESSENCE"
---

<objective>
Scale HP and mana crafting modifier bonuses to tiered progression matching the game's existing magnitude scale.

Purpose: Life Stone and Mana Pearl currently apply the same flat magnitude as primary stat modifiers (1n/2n/3n via ESSENCE_MAGNITUDE), but HP/mana are bulk resource stats that use 5x-8x higher magnitudes everywhere else in the game (dropped gear Vital prefix uses 5n/8n/15n/25n, MATERIAL_AFFIX_MAP hpBonus uses 5n/8n/15n). A +1 HP bonus is meaningless when base HP pools are 50+.

Output: Updated crafting modifier system where hpBonus and manaBonus get stat-appropriate magnitudes per Essence tier.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/crafting_materials.ts
@spacetimedb/src/reducers/items.ts
@spacetimedb/src/data/affix_catalog.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add stat-specific magnitude lookup and apply in craft_recipe</name>
  <files>spacetimedb/src/data/crafting_materials.ts, spacetimedb/src/reducers/items.ts</files>
  <action>
In `spacetimedb/src/data/crafting_materials.ts`:

1. Add a new exported constant `MODIFIER_MAGNITUDE_BY_ESSENCE` that maps (essenceKey, statKey) to a magnitude. This replaces the flat ESSENCE_MAGNITUDE for modifier reagents that need scaled values. Structure it as a Record<string, Record<string, bigint>> where outer key is essence key, inner key is stat key, and value is the magnitude. Only override for hpBonus and manaBonus; all other stats fall through to the existing ESSENCE_MAGNITUDE value.

Use these magnitudes for hpBonus and manaBonus (matching the MATERIAL_AFFIX_MAP hp scale and the Vital prefix magnitudeByTier from affix_catalog.ts):
- `lesser_essence` (tier 1): hpBonus=5n, manaBonus=5n
- `essence` (tier 2): hpBonus=8n, manaBonus=8n
- `greater_essence` (tier 3): hpBonus=15n, manaBonus=15n

Rationale: These match the existing hp magnitudes already used in MATERIAL_AFFIX_MAP (bone_shard standard=5n, reinforced=8n, exquisite=15n) and the Vital prefix magnitudeByTier [5n, 8n, 15n, 25n] in affix_catalog.ts. Mana uses the same scale as HP for consistency.

Add a helper function `getModifierMagnitude(essenceKey: string, statKey: string): bigint` that:
- Checks MODIFIER_MAGNITUDE_BY_ESSENCE[essenceKey]?.[statKey] first
- Falls back to ESSENCE_MAGNITUDE[essenceKey] ?? 1n

2. In `spacetimedb/src/reducers/items.ts`, in the `craft_recipe` reducer's modifier application section (around line 1160-1166 where `magnitude` is set from ESSENCE_MAGNITUDE):

Replace the single `magnitude` variable usage. Currently line 1131 does:
```
const magnitude = ESSENCE_MAGNITUDE[catalystKey] ?? 1n;
```
And this single magnitude is used for ALL modifier affixes at line 1165:
```
magnitude,
```

Change the affix-building loop (lines 1148-1167) so that each modifier's magnitude is determined per-statKey, not globally. Specifically, inside the `for (const modId of modifierIds)` loop, after resolving `modDef`, compute the magnitude for this specific modifier:
```
const modMagnitude = getModifierMagnitude(catalystKey, modDef.statKey);
```
Then use `modMagnitude` instead of `magnitude` in the appliedAffixes.push call at line 1165.

Update the import line (line 4) in items.ts to also import `getModifierMagnitude` from crafting_materials.

Keep ESSENCE_MAGNITUDE unchanged (it is still used for the `slotsAvailable` and quality gate logic, and potentially elsewhere). Only the per-modifier magnitude lookup changes.
  </action>
  <verify>
Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` from the project root to verify TypeScript compilation succeeds.

Grep for `getModifierMagnitude` in items.ts to confirm it is imported and used in the modifier loop. Grep for `MODIFIER_MAGNITUDE_BY_ESSENCE` in crafting_materials.ts to confirm the constant exists with hpBonus and manaBonus entries.
  </verify>
  <done>
- `getModifierMagnitude('lesser_essence', 'hpBonus')` returns 5n
- `getModifierMagnitude('essence', 'manaBonus')` returns 8n
- `getModifierMagnitude('greater_essence', 'hpBonus')` returns 15n
- `getModifierMagnitude('lesser_essence', 'strBonus')` falls back to 1n (unchanged)
- craft_recipe reducer uses per-stat magnitude for each modifier reagent
- No other existing behavior changed
  </done>
</task>

<task type="auto">
  <name>Task 2: Publish module and verify</name>
  <files></files>
  <action>
Publish the SpacetimeDB module using the default server (no --clear-database needed since this is logic-only, no schema changes):
```
spacetime publish uwr --project-path spacetimedb
```

This is a code-only change (no new tables, no new columns), so plain publish preserves all player data per decision #154.

After publish succeeds, regenerate client bindings:
```
spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb
```

Note: Bindings likely won't change since no schema was modified, but regenerate to be safe.
  </action>
  <verify>
`spacetime publish` exits with success. `spacetime logs uwr` shows no errors on startup.
  </verify>
  <done>Module published successfully with scaled HP/mana modifier magnitudes active on the live server.</done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- Module publishes successfully
- Server logs show no errors
- Primary stat modifiers (strBonus, dexBonus, intBonus, wisBonus, chaBonus, armorClassBonus, magicResistanceBonus) still use ESSENCE_MAGNITUDE (1n/2n/3n)
- hpBonus and manaBonus modifiers now use scaled magnitudes (5n/8n/15n)
</verification>

<success_criteria>
Life Stone and Mana Pearl crafting modifiers apply meaningful HP/mana bonuses (+5/+8/+15 per Essence tier) instead of trivial +1/+2/+3, bringing crafted gear modifier bonuses into parity with dropped gear affixes.
</success_criteria>

<output>
After completion, create `.planning/quick/188-scale-hp-and-mana-crafting-modifier-bonu/188-SUMMARY.md`
</output>
