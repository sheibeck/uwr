---
phase: quick-312
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/module_bindings/index.ts
  - package.json
autonomous: true
requirements: [FIX-312]
must_haves:
  truths:
    - "Client connects to SpacetimeDB v2 server without 'Cannot read properties of undefined' error"
    - "All table subscriptions resolve successfully"
    - "Vite dev server serves fresh bundled SDK code"
  artifacts:
    - path: "src/module_bindings/index.ts"
      provides: "v2-compatible module bindings with camelCase tablesSchema keys"
    - path: "package.json"
      provides: "Clean scripts without stale v1 generate command"
  key_links:
    - from: "src/module_bindings/index.ts tablesSchema keys"
      to: "spacetimedb SDK sourceNameToTableDef lookup"
      via: "accName becomes sourceName, server sends data tagged with same name"
      pattern: "abilityCooldown.*__table"
---

<objective>
Fix "Cannot read properties of undefined (reading 'columns')" error in SpacetimeDB client connection.

Purpose: The v2 server was published and sends table data tagged with camelCase accessor names (e.g., `abilityCooldown`), but the committed client bindings still use PascalCase keys (e.g., `AbilityCooldown`) from the v1 CLI. The SDK's `sourceNameToTableDef` lookup fails because the keys don't match, causing the undefined.columns error at `parseRowList_fn`.

Root cause analysis:
- `spacetime generate` with v2 CLI (2.0.1) regenerated `index.ts` with camelCase keys
- These changes are uncommitted (only in working tree)
- The v2 server sends data tagged with camelCase names matching the v2 bindings
- The committed code still has PascalCase keys, so `this.#sourceNameToTableDef['abilityCooldown']` returns undefined when the map has `'AbilityCooldown'`
- `package.json` also has a stale `generate` script removal pending

Output: Committed v2-compatible bindings and clean package.json
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/module_bindings/index.ts
@package.json
@src/composables/useGameData.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Commit v2 module bindings and clean package.json</name>
  <files>src/module_bindings/index.ts, package.json</files>
  <action>
The working tree already contains the correct v2-regenerated bindings. The changes are:

1. `src/module_bindings/index.ts`:
   - Import reordering (My* view imports moved alphabetically)
   - All `tablesSchema` keys changed from PascalCase (`AbilityCooldown`) to camelCase (`abilityCooldown`)
   - The `name` fields inside each `__table()` call remain snake_case (`ability_cooldown`) -- these are unchanged
   - View table keys remain snake_case (`my_bank_slots`, `my_player`, etc.) -- unchanged

2. `package.json`:
   - Removed stale `generate` script that referenced old v1 tooling (`pnpm --dir spacetimedb install --ignore-workspace && cargo run -p gen-bindings`)

Verify the working tree changes look correct (no unintended modifications), then stage and commit both files.

Do NOT regenerate bindings -- the current working tree state is already correct from the v2 CLI generation.
  </action>
  <verify>
Run `git diff --cached --stat` after staging to confirm only the expected files are staged with expected line counts (~228 lines changed in index.ts, ~1 line removed in package.json).
  </verify>
  <done>Both files committed. The tablesSchema keys in index.ts are camelCase, matching what the v2 server sends.</done>
</task>

<task type="auto">
  <name>Task 2: Clear Vite cache and verify dev server starts</name>
  <files></files>
  <action>
1. Delete the Vite pre-bundle cache at `node_modules/.vite/deps/` to force fresh bundling of the spacetimedb SDK with the updated bindings.
   Run: `rm -rf node_modules/.vite`

2. Start the Vite dev server briefly to confirm it builds without errors:
   Run: `npx vite --host 2>&1 | head -20` (or check that it starts without import/build errors)

3. If the dev server starts successfully (shows "ready" or local URL), the fix is confirmed.

Note: The actual runtime connection test requires the SpacetimeDB local server to be running. The dev server starting without bundling errors confirms the bindings are structurally valid.
  </action>
  <verify>
Vite dev server starts without errors referencing spacetimedb or module_bindings. The pre-bundle cache is regenerated fresh.
  </verify>
  <done>Vite cache cleared, dev server starts cleanly with v2 bindings.</done>
</task>

</tasks>

<verification>
1. `git log --oneline -1` shows the commit with v2 bindings
2. `grep -c "abilityCooldown" src/module_bindings/index.ts` returns > 0 (camelCase keys present)
3. `grep -c "AbilityCooldown" src/module_bindings/index.ts` returns 0 (no PascalCase keys remain)
4. Vite dev server starts without bundling errors
</verification>

<success_criteria>
- The "Cannot read properties of undefined (reading 'columns')" error no longer occurs when connecting to the v2 SpacetimeDB server
- Client bindings use camelCase tablesSchema keys matching v2 server expectations
- Vite serves fresh-bundled SDK code (no stale cache)
</success_criteria>

<output>
After completion, create `.planning/quick/312-fix-cannot-read-properties-of-undefined-/312-SUMMARY.md`
</output>
