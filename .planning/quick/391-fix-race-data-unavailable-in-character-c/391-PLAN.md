---
phase: quick-391
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/look.ts
  - spacetimedb/src/helpers/travel.ts
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/reducers/intent.test.ts
  - spacetimedb/src/reducers/commands.ts
autonomous: true
requirements: [FIX-RACE-LOOKUP, FIX-CIRCULAR-DEP]
must_haves:
  truths:
    - "Character command shows race name, narrative, and bonuses from race_definition table"
    - "No circular dependency between intent.ts and travel.ts"
  artifacts:
    - path: "spacetimedb/src/helpers/look.ts"
      provides: "buildLookOutput extracted from intent.ts"
    - path: "spacetimedb/src/reducers/intent.ts"
      provides: "Character command with race_definition lookup"
  key_links:
    - from: "spacetimedb/src/reducers/intent.ts"
      to: "spacetimedb/src/helpers/look.ts"
      via: "import { buildLookOutput }"
      pattern: "import.*buildLookOutput.*from.*helpers/look"
    - from: "spacetimedb/src/helpers/travel.ts"
      to: "spacetimedb/src/helpers/look.ts"
      via: "import { buildLookOutput }"
      pattern: "import.*buildLookOutput.*from.*look"
---

<objective>
Fix two issues: (1) "Race data unavailable" in the character command because it looks up from the old `race` table instead of `race_definition`, and (2) circular dependency where travel.ts imports buildLookOutput from intent.ts while intent.ts imports from travel.ts.

Purpose: Character command should display race info for v2.0 generated races. Circular dependency causes fragile module loading.
Output: Fixed race lookup, extracted buildLookOutput to helpers/look.ts
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/intent.ts
@spacetimedb/src/helpers/travel.ts
@spacetimedb/src/reducers/commands.ts
@spacetimedb/src/schema/tables.ts (RaceDefinition table at line ~1920)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract buildLookOutput to helpers/look.ts and fix circular dependency</name>
  <files>spacetimedb/src/helpers/look.ts, spacetimedb/src/helpers/travel.ts, spacetimedb/src/reducers/intent.ts, spacetimedb/src/reducers/commands.ts, spacetimedb/src/reducers/intent.test.ts</files>
  <action>
1. Create `spacetimedb/src/helpers/look.ts` — move the `buildLookOutput` function (lines 9-126 of intent.ts) into this new file. Keep the same imports it needs (`getWorldState` from `./location`).

2. Update `spacetimedb/src/reducers/intent.ts`:
   - Remove the `buildLookOutput` function definition (lines 9-126)
   - Add `import { buildLookOutput } from '../helpers/look';`
   - Keep the `export { buildLookOutput }` re-export so existing imports from intent.ts still work (or update all importers directly)

3. Update `spacetimedb/src/helpers/travel.ts` line 4:
   - Change `import { buildLookOutput } from '../reducers/intent';` to `import { buildLookOutput } from './look';`

4. Update `spacetimedb/src/reducers/commands.ts` line 6:
   - Change `import { buildLookOutput } from './intent';` to `import { buildLookOutput } from '../helpers/look';`

5. Update `spacetimedb/src/reducers/intent.test.ts` line 16:
   - Change `import { buildLookOutput } from './intent';` to `import { buildLookOutput } from '../helpers/look';`

This breaks the circular dependency: travel.ts no longer imports from intent.ts.
  </action>
  <verify>grep -r "from '../reducers/intent'" spacetimedb/src/helpers/travel.ts should return nothing (no more circular import)</verify>
  <done>buildLookOutput lives in helpers/look.ts. travel.ts imports from helpers/look.ts (not intent.ts). All other importers updated.</done>
</task>

<task type="auto">
  <name>Task 2: Fix race lookup in character command to use race_definition table</name>
  <files>spacetimedb/src/reducers/intent.ts</files>
  <action>
In the `character` command handler (around line 514-541 of intent.ts), replace the race lookup that iterates `ctx.db.race`:

OLD (broken for v2.0 generated races):
```typescript
let raceFound = false;
for (const r of ctx.db.race.iter()) {
  if (r.name.toLowerCase() === character.race.toLowerCase()) {
    raceFound = true;
    // ... displays old Race table fields (bonus1Type, bonus2Type, etc.)
  }
}
if (!raceFound) {
  parts.push(`Race: ${character.race}`);
  parts.push('Race data unavailable.');
}
```

NEW (uses race_definition table with by_name index):
```typescript
// Try race_definition first (v2.0 generated races)
const raceLower = character.race.toLowerCase();
const raceDefs = [...ctx.db.race_definition.by_name.filter(raceLower)];
if (raceDefs.length > 0) {
  const rd = raceDefs[0];
  parts.push(`Race: ${rd.name}`);
  if (rd.narrative) parts.push(rd.narrative);
  parts.push('');
  try {
    const bonuses = JSON.parse(rd.bonusesJson);
    if (bonuses.primary) {
      parts.push('Racial Bonuses:');
      parts.push(`  ${fmtLabel(bonuses.primary.stat)}: ${fmtVal(bonuses.primary.stat, BigInt(bonuses.primary.value))}`);
      if (bonuses.secondary) {
        parts.push(`  ${fmtLabel(bonuses.secondary.stat)}: ${fmtVal(bonuses.secondary.stat, BigInt(bonuses.secondary.value))}`);
      }
      if (bonuses.flavor) parts.push(`  ${bonuses.flavor}`);
    }
  } catch { /* bonusesJson parse error - show name only */ }
} else {
  // Fallback to old race table (legacy races)
  let raceFound = false;
  for (const r of ctx.db.race.iter()) {
    if (r.name.toLowerCase() === raceLower) {
      raceFound = true;
      parts.push(`Race: ${r.name}`);
      if (r.description) parts.push(r.description);
      parts.push('');
      parts.push('Racial Bonuses:');
      parts.push(`  ${fmtLabel(r.bonus1Type)}: ${fmtVal(r.bonus1Type, r.bonus1Value)}`);
      parts.push(`  ${fmtLabel(r.bonus2Type)}: ${fmtVal(r.bonus2Type, r.bonus2Value)}`);
      if (r.penaltyType && r.penaltyValue) {
        parts.push(`  ${fmtLabel(r.penaltyType)}: ${fmtPenalty(r.penaltyType, r.penaltyValue)}`);
      }
      parts.push('');
      const evenLevels = Number(character.level) / 2 | 0;
      parts.push('Level Bonus (every 2 levels):');
      parts.push(`  ${fmtLabel(r.levelBonusType)}: ${fmtVal(r.levelBonusType, r.levelBonusValue)} per even level`);
      if (evenLevels > 0) {
        parts.push(`  Total at level ${character.level}: ${fmtVal(r.levelBonusType, r.levelBonusValue * BigInt(evenLevels))}`);
      }
      break;
    }
  }
  if (!raceFound) {
    parts.push(`Race: ${character.race}`);
    parts.push('Race data unavailable.');
  }
}
```

Key points:
- `race_definition` uses `by_name` index with lowercase lookup (the `nameLower` column)
- `bonusesJson` is a JSON string with `{ primary: {stat, value}, secondary: {stat, value}, flavor }` structure
- Falls back to old `race` table for any legacy characters
  </action>
  <verify>spacetime publish uwr -p spacetimedb compiles without errors</verify>
  <done>Character command displays race narrative and bonuses from race_definition for v2.0 characters, falls back to old race table for legacy characters</done>
</task>

</tasks>

<verification>
1. `spacetime publish uwr -p spacetimedb` compiles successfully
2. No circular dependency: `grep -r "from '../reducers/intent'" spacetimedb/src/helpers/travel.ts` returns empty
3. In-game: type "character" with a v2.0 generated race character -- should show race name, narrative, and bonuses instead of "Race data unavailable"
</verification>

<success_criteria>
- "Race data unavailable" no longer appears for characters with generated races
- buildLookOutput lives in helpers/look.ts with no circular dependency
- Module compiles and publishes cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/391-fix-race-data-unavailable-in-character-c/391-SUMMARY.md`
</output>
