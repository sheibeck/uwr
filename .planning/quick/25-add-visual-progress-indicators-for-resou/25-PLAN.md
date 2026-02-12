---
phase: quick-25
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useGameData.ts
  - src/composables/useCombat.ts
  - src/App.vue
  - src/components/LocationGrid.vue
autonomous: true
must_haves:
  truths:
    - "Enemy tiles in the location grid show a progress bar while being pulled by any player"
    - "Resource node tiles show a progress bar while being gathered by any player (not just the current player)"
    - "Pull progress bar fills over 1 second for body pulls and 2 seconds for careful pulls"
    - "Resource gather progress bar fills over 8 seconds"
    - "Enemy tile remains visible during pull (not hidden by state filter)"
  artifacts:
    - path: "src/composables/useGameData.ts"
      provides: "pullState subscription"
      contains: "tables.pullState"
    - path: "src/composables/useCombat.ts"
      provides: "availableEnemies includes pulling enemies with progress data"
      contains: "pulling"
    - path: "src/components/LocationGrid.vue"
      provides: "Progress bar rendering on enemy tiles during pull"
      contains: "isPulling"
  key_links:
    - from: "src/composables/useGameData.ts"
      to: "src/App.vue"
      via: "pullStates reactive ref passed to useCombat"
      pattern: "pullStates"
    - from: "src/composables/useCombat.ts"
      to: "src/components/LocationGrid.vue"
      via: "availableEnemies computed includes isPulling and pullProgress fields"
      pattern: "isPulling.*pullProgress"
---

<objective>
Add visual progress indicators for resource gathering and enemy pulling so all players at a location can see actions in progress.

Purpose: Currently, enemies disappear from the location grid when being pulled (state changes from 'available' to 'pulling'), and resource gathering progress bars only show for the current player. Other players at the same location have no visual feedback that these actions are happening. This creates a confusing UX in multiplayer.

Output: Enemy tiles show a progress bar during pulls; resource node tiles show progress bars for any player's gather (not just your own).
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@src/composables/useGameData.ts
@src/composables/useCombat.ts
@src/components/LocationGrid.vue
@src/App.vue
@spacetimedb/src/index.ts (lines 374-398 for ResourceGather table, lines 769-807 for PullState/PullTick tables)
@spacetimedb/src/reducers/combat.ts (lines 624-684 for start_pull reducer, lines 9-10 for PULL_DELAY constants)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Subscribe to pullState and wire pull progress into enemy grid tiles</name>
  <files>
    src/composables/useGameData.ts
    src/composables/useCombat.ts
    src/App.vue
    src/components/LocationGrid.vue
  </files>
  <action>
**useGameData.ts** — Add `pullState` subscription:
- Add `const [pullStates] = useTable(tables.pullState);` after the existing `enemySpawnMembers` line
- Add `pullStates` to the return object

**useCombat.ts** — Accept pullStates and include pulling enemies in availableEnemies:
- Add `pullStates: Ref<PullStateRow[]>` to the `UseCombatArgs` type (import `PullStateRow` from module_bindings)
- Add `pullStates` to the destructured args in `useCombat()`
- Modify the `availableEnemies` computed (line ~351) to include enemies with state `'pulling'` in addition to `'available'`:
  - Change the filter from `row.state === 'available'` to `(row.state === 'available' || row.state === 'pulling')`
  - In the `.map()`, find matching pull from `pullStates.value` where `pull.enemySpawnId === spawn.id && pull.state === 'pending'`
  - Compute pull progress using `nowMicros.value` and `timestampToMicros(pull.createdAt)`:
    - `const pullDurationMicros = pull.pullType === 'careful' ? 2_000_000 : 1_000_000`
    - `const pullStartMicros = timestampToMicros(pull.createdAt)`
    - `const pullProgress = Math.max(0, Math.min(1, (nowMicros.value - pullStartMicros) / pullDurationMicros))`
  - Add `isPulling: boolean`, `pullProgress: number`, and `pullType: string | null` to the `EnemySummary` type
  - Set `isPulling: spawn.state === 'pulling'`, `pullProgress` from computation above (0 if not pulling), `pullType` from pull row or null

**App.vue** — Pass pullStates to useCombat:
- Destructure `pullStates` from `useGameData()` (add to the existing destructuring around line ~498)
- Pass `pullStates` to the `useCombat({...})` call (around line ~741)

**LocationGrid.vue** — Show progress bar on enemy tiles during pull:
- Update the `EnemySummary` type to include `isPulling: boolean`, `pullProgress: number`, `pullType: string | null`
- Inside the enemy `v-for` tile div (around line 22-37), add a progress bar element below the enemy name/level, using the same pattern as the existing resource gather progress bar (lines 51-69):
  - Show only when `enemy.isPulling && enemy.pullProgress > 0`
  - Use amber/orange color to distinguish from the blue gather bar: background `rgba(217, 159, 52, 0.3)`, fill `rgba(217, 159, 52, 0.8)`
  - Same 3px height, full width, rounded corners
- Disable the context menu pull options when the enemy is already being pulled: add `disabled: enemy.isPulling` condition alongside the existing `!props.canEngage` check (line 200, 205 in `openEnemyContextMenu`)
</action>
  <verify>
1. Run `npm run build` in the client directory to verify TypeScript compiles
2. Visual check: start the app, navigate to a location with enemies. Right-click an enemy, select "Careful Pull" — the enemy tile should show an amber progress bar filling over ~2 seconds before combat starts
3. Visual check: start gathering a resource — the blue progress bar should still appear on the resource node tile as before
  </verify>
  <done>
- Enemy tiles show amber progress bar while being pulled (visible to all players at the location)
- Pull context menu options disabled on enemies already being pulled
- Resource gather progress bars continue working as before
- TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Show resource gather progress for other players' gathers</name>
  <files>
    src/App.vue
  </files>
  <action>
**App.vue** — Update `resourceNodesHere` computed (around line 1233) to show progress bars for ANY player's active gather on a node, not just the selected character's:

Currently `activeResourceGather` (line 1226) only finds the selected character's gather. The progress bar only shows for your own gathering.

Modify the `resourceNodesHere` computed to:
1. For each resource node, check ALL `resourceGathers.value` entries (not just `activeResourceGather`) to find any gather where `gather.nodeId === node.id`
2. If any gather is found on the node, compute `isGathering = true` and progress from that gather's `endsAtMicros`
3. Keep the existing `localGather` optimistic display logic — local gather should take priority (for instant feedback before the server row arrives)

Specific change in the `.map()` callback:
- Replace `const local = localGather.value?.nodeId?.toString() === node.id.toString();` and the subsequent `isGathering` logic with:
  ```
  const local = localGather.value?.nodeId?.toString() === node.id.toString();
  const anyGather = resourceGathers.value.find(g => g.nodeId.toString() === node.id.toString());
  const isGathering = local || !!anyGather;
  ```
- For `endsAt` computation, use the found `anyGather` instead of only the selected character's `gather`:
  ```
  const endsAt = local
    ? localGather.value!.startMicros + castMicros
    : anyGather
      ? Number(anyGather.endsAtMicros)
      : 0;
  ```
- This replaces the old logic that only checked `gather?.nodeId?.toString() === node.id.toString()` where `gather` was `activeResourceGather` (the selected character's gather only)
</action>
  <verify>
1. Run `npm run build` in the client directory to verify TypeScript compiles
2. Test with two browser tabs logged in as different characters at the same location. When Character A starts gathering, Character B should see the blue progress bar on the resource node tile
  </verify>
  <done>
- Resource gather progress bars visible to all players at the same location (not just the gathering player)
- Local optimistic gather still provides instant feedback for the player who initiated the gather
- TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
- `npm run build` passes in the client directory
- Enemy tiles show amber progress bar during pulls (1s for body, 2s for careful)
- Resource node tiles show blue progress bar for any player's active gather
- Context menu pull options disabled for enemies already being pulled
- Progress bars animate smoothly via the existing 200ms nowMicros tick
- No regressions: existing combat flow, gathering flow, and context menus still work
</verification>

<success_criteria>
- All players at a location see visual progress indicators for both pulls and gathers in progress
- Progress bars distinguish pull (amber) from gather (blue)
- No backend changes needed — all data already exists in public tables
</success_criteria>

<output>
After completion, create `.planning/quick/25-add-visual-progress-indicators-for-resou/25-SUMMARY.md`
</output>
