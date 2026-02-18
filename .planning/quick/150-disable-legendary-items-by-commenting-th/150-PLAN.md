---
phase: 150-disable-legendary-items
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/affix_catalog.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true

must_haves:
  truths:
    - "Killing placeholder boss enemies (Fen Witch, Cinder Sentinel, Hexbinder, Basalt Brute) no longer drops legendary items"
    - "The LEGENDARIES array and LegendaryDef interface remain in the codebase as commented-out code for future restoration"
    - "All other quality tiers (common through epic) continue to function normally in loot drops and /createitem"
    - "Module compiles and publishes without errors"
  artifacts:
    - path: "spacetimedb/src/data/affix_catalog.ts"
      provides: "Commented-out LEGENDARIES array and LegendaryDef interface"
      contains: "// DISABLED: Legendary items not tied to actual bosses yet"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Commented-out legendary drop check block"
      contains: "// DISABLED: Legendary drops disabled"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "spacetimedb/src/data/affix_catalog.ts"
      via: "LEGENDARIES import removed"
      pattern: "no longer imports LEGENDARIES"
---

<objective>
Disable legendary item drops by commenting out the LEGENDARIES array definition in affix_catalog.ts and the legendary drop check block in combat.ts. These legendaries use placeholder boss names (Fen Witch, Cinder Sentinel, etc.) that aren't tied to actual World Boss encounters yet. Comment them out so they can be restored in a future phase that specs out proper legendary drops.

Purpose: Prevent misleading legendary drops from non-boss enemies; keep code available for future restoration.
Output: Two modified server files with legendary code commented out, module still compiles.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/affix_catalog.ts
@spacetimedb/src/reducers/combat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Comment out LEGENDARIES in affix_catalog.ts and legendary drop block in combat.ts</name>
  <files>spacetimedb/src/data/affix_catalog.ts, spacetimedb/src/reducers/combat.ts</files>
  <action>
In `spacetimedb/src/data/affix_catalog.ts`:
1. Comment out the `LegendaryDef` interface (lines ~21-30) with a header comment: `// DISABLED: Legendary items not tied to actual bosses yet. Re-enable when World Bosses phase specs legendary drops.`
2. Comment out the entire `LEGENDARIES` array (lines ~264-357) including the section header comments. Add the same disabled header comment above.
3. Add `export const LEGENDARIES: any[] = [];` as an empty placeholder export so any residual imports don't break compilation. Place it right after the commented-out block.
4. Leave ALL other legendary-related constants intact: QUALITY_TIERS, AFFIX_COUNT_BY_QUALITY, QUALITY_TIER_COLORS, QUALITY_TIER_NUMBER. The "legendary" quality tier concept stays -- only the specific named legendary item definitions are disabled.

In `spacetimedb/src/reducers/combat.ts`:
1. Remove the `import { LEGENDARIES } from '../data/affix_catalog';` line (line 10) since the empty array makes the block a no-op anyway, but cleaner to remove the import entirely.
2. Comment out the entire legendary drop check block (lines ~2360-2408) from `// Legendary drop check` through the closing of the `logGroupEvent` call. Add a header comment: `// DISABLED: Legendary drops disabled — re-enable when World Bosses phase adds proper boss encounters`
3. Do NOT touch anything else in combat.ts -- the isNamed field on regular loot items (line ~632, 634, 2296) should remain as-is since it's always `false` for normal drops.
  </action>
  <verify>
Run `cd /c/projects/uwr/spacetimedb && npx tsc --noEmit` to confirm TypeScript compilation succeeds with no errors.
Grep for `LEGENDARIES.find` in combat.ts to confirm no active references remain.
  </verify>
  <done>
LEGENDARIES array and LegendaryDef interface are commented out with restoration notes. The legendary drop check block in combat.ts is commented out. Module compiles cleanly. All regular loot (common through epic) is unaffected.
  </done>
</task>

</tasks>

<verification>
- TypeScript compilation: `cd spacetimedb && npx tsc --noEmit` passes
- No active LEGENDARIES references: `grep -r "LEGENDARIES\." spacetimedb/src/` returns only commented lines
- QUALITY_TIERS still includes 'legendary': `grep "QUALITY_TIERS" spacetimedb/src/data/affix_catalog.ts` confirms array unchanged
- /createitem legendary still works (uses generateAffixData, not LEGENDARIES)
</verification>

<success_criteria>
- LEGENDARIES array and LegendaryDef interface commented out with clear restoration notes
- Legendary drop check block in combat.ts commented out
- Empty LEGENDARIES export prevents import errors
- Module compiles without errors
- All non-legendary loot systems unaffected
</success_criteria>

<output>
After completion, create `.planning/quick/150-disable-legendary-items-by-commenting-th/150-SUMMARY.md`
</output>
