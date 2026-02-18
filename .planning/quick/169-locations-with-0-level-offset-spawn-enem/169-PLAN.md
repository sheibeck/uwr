---
phase: quick-169
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/location.ts
autonomous: true

must_haves:
  truths:
    - "Locations with levelOffset 0 spawn enemies at exactly the location's computed target level -- no +/- 1 variance"
    - "Locations with non-zero levelOffset still spawn enemies with the existing +/- 1 level variance window"
  artifacts:
    - path: "spacetimedb/src/helpers/location.ts"
      provides: "Level-exact spawning for zero-offset locations"
      contains: "levelOffset"
  key_links:
    - from: "spawnEnemy"
      to: "computeLocationTargetLevel"
      via: "levelOffset check narrows minLevel/maxLevel window"
      pattern: "levelOffset.*0n"
---

<objective>
Make locations with `levelOffset === 0n` spawn enemies at exactly the location's computed target level with no RNG variance. Currently all locations use a +/- 1 level window when selecting enemy templates, which means a level 1 location can spawn level 2 enemies. Locations with `levelOffset: 0n` (starter towns like Lanternford, Ashfall Road, Bell Farm) should spawn enemies at exactly the target level.

Purpose: Starter areas with levelOffset 0 should feel predictable -- a level 1 area spawns level 1 enemies, period.
Output: Updated `spawnEnemy` and `ensureAvailableSpawn` functions in location.ts.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/location.ts
@spacetimedb/src/schema/tables.ts (Location table has levelOffset: t.i64())
</context>

<tasks>

<task type="auto">
  <name>Task 1: Narrow enemy level window to exact match when levelOffset is 0</name>
  <files>spacetimedb/src/helpers/location.ts</files>
  <action>
Two functions need surgical changes:

**1. `spawnEnemy` (line ~343-348):**

Currently:
```typescript
const adjustedTarget = computeLocationTargetLevel(ctx, locationId, targetLevel);
const minLevel = adjustedTarget > 1n ? adjustedTarget - 1n : 1n;
const maxLevel = adjustedTarget + 1n;
```

Read the location's `levelOffset` and when it is `0n`, use exact level matching (no +/- 1). `locationRow` is already declared on line 325 in `spawnEnemy` for the isSafe check and is in scope. Reuse it:
```typescript
const adjustedTarget = computeLocationTargetLevel(ctx, locationId, targetLevel);
const offset = locationRow?.levelOffset ?? 0n;
const exactMatch = offset === 0n;
const minLevel = exactMatch ? adjustedTarget : (adjustedTarget > 1n ? adjustedTarget - 1n : 1n);
const maxLevel = exactMatch ? adjustedTarget : adjustedTarget + 1n;
```

**2. `ensureAvailableSpawn` (line ~236):**

Currently:
```typescript
if (best && bestDiff !== null && bestDiff <= 1n) return best;
```

Read the location's `levelOffset` and when it is `0n`, require exact match (diff === 0n):
```typescript
const locationRow = ctx.db.location.id.find(locationId);
const offset = locationRow?.levelOffset ?? 0n;
const maxDiff = offset === 0n ? 0n : 1n;
if (best && bestDiff !== null && bestDiff <= maxDiff) return best;
```

Place the location lookup just before the `if (best ...)` check (around line 235-236).
  </action>
  <verify>
Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` to confirm no type errors. Review the diff to ensure:
1. `spawnEnemy` uses exact match (minLevel === maxLevel === adjustedTarget) when levelOffset is 0n
2. `ensureAvailableSpawn` uses bestDiff <= 0n (exact) when levelOffset is 0n
3. Non-zero levelOffset locations are completely unchanged (still use +/- 1 window)
  </verify>
  <done>
Locations with levelOffset 0n spawn enemies at exactly the computed target level. Locations with non-zero levelOffset retain the +/- 1 variance window. No type errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Republish module</name>
  <files></files>
  <action>
Publish the module to apply the change:
```bash
spacetime publish uwr --project-path spacetimedb
```

No --clear-database needed -- this is a logic-only change with no schema modifications.
  </action>
  <verify>
`spacetime publish` exits successfully. Check `spacetime logs uwr` for any errors.
  </verify>
  <done>Module published with zero-offset exact level spawning active.</done>
</task>

</tasks>

<verification>
After publish, verify conceptually:
- Starter locations (Lanternford, Ashfall Road, Bell Farm) have levelOffset 0n and dangerMultiplier 100n, so adjustedTarget = 1. With exact match, only level 1 enemies should spawn.
- Border/dungeon locations have levelOffset >= 1n, so they retain the +/- 1 variance window unchanged.
</verification>

<success_criteria>
- TypeScript compiles without errors
- Module publishes successfully
- `spawnEnemy` uses minLevel === maxLevel === adjustedTarget when levelOffset is 0n
- `ensureAvailableSpawn` requires bestDiff === 0n when levelOffset is 0n
- No behavioral change for non-zero levelOffset locations
</success_criteria>

<output>
After completion, create `.planning/quick/169-locations-with-0-level-offset-spawn-enem/169-SUMMARY.md`
</output>
