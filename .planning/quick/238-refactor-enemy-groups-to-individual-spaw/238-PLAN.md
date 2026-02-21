---
phase: quick-238
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/location.ts
  - spacetimedb/src/reducers/combat.ts
  - src/components/LocationGrid.vue
  - src/composables/useCombat.ts
autonomous: true
requirements:
  - REFACTOR-238
must_haves:
  truths:
    - "Each enemy in a location is its own EnemySpawn row with groupCount=1 and a single EnemySpawnMember"
    - "Pulling an enemy in a location with same-faction others causes partial/fail outcomes to draw those others as adds"
    - "No 'x5' style group multiplier shown in LocationGrid or combat UI"
    - "Location spawn caps scale with region dangerMultiplier (starter < border < dungeon)"
    - "Pulling into combat continues to work normally — one-roll outcome, adds arrive via combatPendingAdd"
  artifacts:
    - path: "spacetimedb/src/helpers/location.ts"
      provides: "spawnEnemy, spawnEnemyWithTemplate, ensureSpawnsForLocation, ensureLocationRuntimeBootstrap, respawnLocationSpawns — all updated for individual spawns"
      contains: "getLocationSpawnCap"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "resolve_pull with PULL_ALLOW_EXTERNAL_ADDS=true and faction-based candidates filter"
  key_links:
    - from: "spacetimedb/src/helpers/location.ts:spawnEnemy"
      to: "EnemySpawn table"
      via: "N individual inserts instead of 1 with groupCount=N"
      pattern: "for.*groupCount.*insert.*groupCount.*1n"
    - from: "spacetimedb/src/reducers/combat.ts:resolve_pull"
      to: "candidates array"
      via: "factionId match instead of socialGroup/creatureType"
      pattern: "factionId.*===.*factionId"
---

<objective>
Refactor enemy group spawning from a single EnemySpawn row with groupCount=N to N individual EnemySpawn rows each with groupCount=1. Enable cross-spawn aggro via faction-based candidate matching in resolve_pull. Remove group multiplier display from client.

Purpose: Makes each enemy a first-class entity — individually targetable, individually trackable, and capable of responding to combat as a member of a faction rather than as sub-members of a single spawn object.
Output: Backend spawn logic rewritten; resolve_pull faction filter enabled; client display simplified.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/helpers/location.ts
@spacetimedb/src/reducers/combat.ts
@src/components/LocationGrid.vue
@src/composables/useCombat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Refactor spawnEnemy to individual spawns with danger-tiered caps</name>
  <files>spacetimedb/src/helpers/location.ts</files>
  <action>
Add a new exported helper `getLocationSpawnCap(ctx, locationId): number` that returns a danger-tiered cap based on the location's region `dangerMultiplier`:
- dangerMultiplier < 130 (T1, starter): 6
- dangerMultiplier < 190 (T2, border): 9
- dangerMultiplier >= 190 (T3, dungeon/high): 12
- default if region not found: 6

Replace `DEFAULT_LOCATION_SPAWNS` usage in `ensureLocationRuntimeBootstrap` with `getLocationSpawnCap`. `DEFAULT_LOCATION_SPAWNS` can remain as a constant for reference.

Refactor `spawnEnemy` to spawn N INDIVIDUAL EnemySpawn rows instead of 1 group:
- Keep the existing template selection logic (timeOfDay filter, level matching, weighted random) unchanged.
- Keep the existing `groupCount` roll logic (minGroup/maxGroup, danger-bias weighting) to determine N.
- Instead of `insert({ ..., groupCount })` once and `seedSpawnMembers(..., count)`, loop N times:
  - Each iteration: `ctx.db.enemySpawn.insert({ id: 0n, locationId, enemyTemplateId: chosen.id, name: chosen.name, state: 'available', lockedCombatId: undefined, groupCount: 1n })`
  - Pick one role for that individual: `pickRoleTemplate(ctx, chosen.id, groupSeed + BigInt(i) * 7n)`
  - Insert one `ctx.db.enemySpawnMember.insert({ id: 0n, spawnId: spawn.id, enemyTemplateId: chosen.id, roleTemplateId: role.id })`
  - Call `refreshSpawnGroupCount(ctx, spawn.id)` to confirm count=1.
- Return the FIRST spawn row created (same return contract as before — callers use it for the immediate pull target).

Also refactor `spawnEnemyWithTemplate` the same way: loop N times, each inserting a single EnemySpawn+EnemySpawnMember. The function still returns the first spawn created.

In `ensureLocationRuntimeBootstrap`, change:
```typescript
// before
while (count < DEFAULT_LOCATION_SPAWNS) { spawnEnemy(...); count++ }
// after
const cap = getLocationSpawnCap(ctx, location.id);
while (count < cap) { spawnEnemy(...); count++ }
```

In `ensureSpawnsForLocation`, the `needed` comparison can keep its current semantics (ensure at least as many available as there are active player groups), but also enforce a maximum: don't spawn beyond `getLocationSpawnCap(ctx, locationId)`.

In `respawnLocationSpawns`, the `desired` param is caller-supplied — leave the signature unchanged. Call sites in index.ts will be updated in Task 4 to pass `getLocationSpawnCap`.
  </action>
  <verify>
Build: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb 2>&1 | tail -20`
Should compile without errors. After publish, observe that pulling an enemy in-game spawns it as a single entity (groupCount=1 in EnemySpawn table).
  </verify>
  <done>
`spawnEnemy` creates N separate EnemySpawn rows with groupCount=1 each. `getLocationSpawnCap` exists and returns 6/9/12 by tier. `ensureLocationRuntimeBootstrap` and `ensureSpawnsForLocation` use `getLocationSpawnCap`. TypeScript compiles cleanly.
  </done>
</task>

<task type="auto">
  <name>Task 2: Enable cross-spawn faction aggro in resolve_pull and update log messages</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
Make three targeted changes in `resolve_pull`:

**Change 1 — Flip the flag (line 31):**
Change `const PULL_ALLOW_EXTERNAL_ADDS = false;` to `const PULL_ALLOW_EXTERNAL_ADDS = true;`

**Change 2 — Replace socialGroup/creatureType filter with factionId filter:**
Remove:
```typescript
const targetGroup = (template.socialGroup || template.creatureType || '').trim().toLowerCase();
```

Replace the candidates filter condition with a `factionId` match:
```typescript
const candidates = PULL_ALLOW_EXTERNAL_ADDS
  ? [...ctx.db.enemySpawn.by_location.filter(pull.locationId)]
      .filter((row) => row.id !== spawn.id && row.state === 'available')
      .map((row) => ({
        spawn: row,
        template: ctx.db.enemyTemplate.id.find(row.enemyTemplateId),
      }))
      .filter(
        (row) =>
          row.template &&
          row.template.factionId !== undefined &&
          template.factionId !== undefined &&
          row.template.factionId === template.factionId
      )
  : [];
```

The awareness check `candidates.some(...)` still works since candidates has the same shape.

**Change 3 — Update combat log messages** (the "1 of N" / "Remaining in group" framing no longer applies):

Partial outcome (around line 1102):
- New private: `Your ${pull.pullType} pull draws attention. You engage ${spawn.name}, but ${reserved.length} ${reserved.length === 1 ? 'add' : 'adds'} of the same faction will arrive in ${Number(delayMicros / 1_000_000n)}s.${reasonSuffix}`
- New group: `${character.name}'s pull draws attention. ${reserved.length} ${reserved.length === 1 ? 'add' : 'adds'} will arrive in ${Number(delayMicros / 1_000_000n)}s.`

Failure outcome (around line 1127):
- New private: `Your ${pull.pullType} pull is noticed. You engage ${spawn.name} and ${reserved.length} ${reserved.length === 1 ? 'add' : 'adds'} of the same faction rush in immediately.${reasonSuffix}`

Success outcome (around line 1140):
- New private: `Your ${pull.pullType} pull is clean. You engage ${spawn.name} alone.${reasonSuffix}`
- Other participants: `${character.name}'s pull is clean.`

Also update the `PULL_ALLOW_EXTERNAL_ADDS` reason message (around line 1047) to:
`Other ${template.name} of the same faction are nearby and may answer the call.`

The `initialGroupCount`, `groupAddsAvailable`, `maxAdds` variables remain unchanged — they still compute correctly (groupCount=1 means groupAddsAvailable=0, so all adds come from `candidates`).
  </action>
  <verify>
Build: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb 2>&1 | tail -20`
Compiles without errors. In-game: pull an enemy of a faction that has other same-faction spawns in the same location — partial/failure outcomes draw those other spawns as adds. Enemies without a factionId set (factionId=undefined) produce no faction adds.
  </verify>
  <done>
`PULL_ALLOW_EXTERNAL_ADDS = true`. Candidates filter uses `factionId` equality. Log messages no longer reference "1 of N" or "Remaining in group". Enemies with undefined factionId are never candidates. TypeScript compiles cleanly.
  </done>
</task>

<task type="auto">
  <name>Task 3: Remove group multiplier display from client</name>
  <files>
    src/components/LocationGrid.vue
    src/composables/useCombat.ts
  </files>
  <action>
**LocationGrid.vue:**

Remove the group multiplier badge span. Find and delete:
```html
<span v-if="enemy.groupCount > 1n" :style="{ fontSize: '0.78rem', opacity: 0.8 }">
  x{{ enemy.groupCount }}
</span>
```

Update the tooltip subtitle to drop the group count:
- Old: `` subtitle: `L${enemy.level}${enemy.groupCount > 1n ? ' x' + enemy.groupCount : ''} · ${enemy.factionName}`, ``
- New: `` subtitle: `L${enemy.level} · ${enemy.factionName}`, ``

Check if `groupCount` appears anywhere else in `LocationGrid.vue` — if it was only used by the now-deleted display and tooltip, remove it from the component's prop type definition (around line 264) as well.

**useCombat.ts:**

No changes needed. The `EnemySummary` type keeps `groupCount: bigint` (reflects real data) and `availableEnemies` computed continues populating it. With individual spawns groupCount is always 1n — the field stays for debugging/future use.
  </action>
  <verify>
`npm run build` in the client root passes without TypeScript errors. Dev server shows enemy list without any "x5" or group count badge. Each enemy renders as "Wolf (L3)" with no multiplier suffix.
  </verify>
  <done>
LocationGrid.vue no longer renders group multiplier span. Tooltip subtitle no longer shows "x{count}". Client builds without TypeScript errors.
  </done>
</task>

<task type="auto">
  <name>Task 4: Update index.ts respawn call site to use danger-tiered caps</name>
  <files>spacetimedb/src/index.ts</files>
  <action>
In `index.ts`, find the day/night cycle respawn loop that calls `respawnLocationSpawns(ctx, location.id, DEFAULT_LOCATION_SPAWNS)` (around line 252-256):

```typescript
for (const location of ctx.db.location.iter()) {
  if (!location.isSafe) {
    respawnLocationSpawns(ctx, location.id, DEFAULT_LOCATION_SPAWNS);
  }
}
```

Change to:
```typescript
for (const location of ctx.db.location.iter()) {
  if (!location.isSafe) {
    respawnLocationSpawns(ctx, location.id, getLocationSpawnCap(ctx, location.id));
  }
}
```

Add `getLocationSpawnCap` to the existing import block from `./helpers/location` (the block already imports `respawnLocationSpawns`, `ensureLocationRuntimeBootstrap`, `DEFAULT_LOCATION_SPAWNS`, etc.).

This ensures the day/night respawn cycle fills each location to its danger-tiered cap rather than the fixed DEFAULT_LOCATION_SPAWNS=3.
  </action>
  <verify>
Build: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb 2>&1 | tail -20`
Compiles without errors. No functional regression in day/night cycle.
  </verify>
  <done>
`index.ts` day/night respawn uses `getLocationSpawnCap` per-location. Import block updated. TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
1. `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` succeeds without errors
2. After a database clear and republish, locations contain multiple individual EnemySpawn rows (each groupCount=1) rather than single multi-member spawns
3. Pulling an enemy that has same-faction enemies at the same location produces adds on partial/failure outcomes
4. Pulling an enemy with no factionId set produces no faction adds (clean pull behavior unchanged)
5. Client shows no "x5" or group badge on any enemy in LocationGrid
6. Client builds without TypeScript errors
</verification>

<success_criteria>
- `spawnEnemy` inserts N rows with groupCount=1, one per individual enemy
- `getLocationSpawnCap` returns 6/9/12 by danger tier (T1 < 130 / T2 < 190 / T3 >= 190)
- `PULL_ALLOW_EXTERNAL_ADDS = true` in combat.ts
- Candidates in `resolve_pull` match on `factionId` equality (both defined and equal)
- LocationGrid shows no group multiplier badge
- All changed files compile cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/238-refactor-enemy-groups-to-individual-spaw/238-SUMMARY.md`
</output>
