---
phase: quick-308
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [src/composables/useCommands.ts, src/composables/usePlayer.ts, src/components/RenownPanel.vue, src/App.vue, src/module_bindings/]
autonomous: true
requirements: [QUICK-308]
must_haves:
  truths:
    - "All v2-specific TypeScript errors from the SpacetimeDB 2.0 migration are resolved"
    - "vue-tsc --noEmit produces zero v2-specific type errors in the fixed files"
    - "New v2-generated module_bindings files are tracked in git"
  artifacts:
    - path: "src/composables/useCommands.ts"
      provides: "Zero-arg recomputeRacialAllReducer call"
    - path: "src/composables/usePlayer.ts"
      provides: "player computed returns null not undefined when no identity"
    - path: "src/components/RenownPanel.vue"
      provides: "Number-wrapped bigint position calls and corrected rank field name"
    - path: "src/App.vue"
      provides: "Correct type conversions for selectedCharacterId bigint/string bridge"
  key_links:
    - from: "src/App.vue"
      to: "src/composables/useAuth.ts"
      via: "player prop"
    - from: "src/App.vue"
      to: "src/composables/useCommands.ts"
      via: "selectedCharacterId prop"
---

<objective>
Fix the remaining v2-specific TypeScript errors from the SpacetimeDB 1.12 to 2.0 migration, and commit the untracked v2-generated module_bindings files.

Purpose: Complete the migration started in quick-307 so the client compiles cleanly against v2 bindings.
Output: Clean vue-tsc for all v2-related errors, all module_bindings tracked in git.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/useCommands.ts
@src/composables/usePlayer.ts
@src/components/RenownPanel.vue
@src/App.vue
@src/module_bindings/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix v2 type errors across 4 source files</name>
  <files>
    src/composables/useCommands.ts
    src/composables/usePlayer.ts
    src/components/RenownPanel.vue
    src/App.vue
  </files>
  <action>
Apply these 7 targeted fixes — each is a one-line or minimal change:

1. **src/composables/useCommands.ts line 388** — `recomputeRacialAllReducer({})` now takes 0 args in v2.
   Change to: `recomputeRacialAllReducer()`

2. **src/composables/usePlayer.ts line 16** — `return undefined` makes ComputedRef include `undefined`, but useAuth expects `Ref<PlayerRow | null>`.
   Change: `return undefined` to `return null`

3. **src/components/RenownPanel.vue line 212** — `entry.position` is bigint in v2, `getPositionColor` expects number.
   Change: `getPositionColor(entry.position)` to `getPositionColor(Number(entry.position))`

4. **src/components/RenownPanel.vue line 215** — Same bigint-to-number issue for `getPositionOrdinal`.
   Change: `getPositionOrdinal(entry.position)` to `getPositionOrdinal(Number(entry.position))`

5. **src/components/RenownPanel.vue line 459** — `p.rankEarned` field was renamed to `p.rank` in v2 bindings.
   Change: `p.rankEarned` to `p.rank`

6. **src/App.vue line 155** — `selectedCharacterId` is `ref('')` (string) but NpcDialogPanel prop `selected-character-id` expects `bigint`. The selectedCharacterId is used as a string throughout the app (set via `.toString()`, compared via BigInt conversion). Fix the prop binding by converting:
   Change: `:selected-character-id="selectedCharacterId"` to `:selected-character-id="selectedCharacterId ? BigInt(selectedCharacterId) : null"`

7. **src/App.vue line 1274** — `computed(() => selectedCharacterId.value)` gives `ComputedRef<string>` but `useCommands` expects `Ref<bigint | null>`. Convert to bigint:
   Change: `selectedCharacterId: computed(() => selectedCharacterId.value)` to `selectedCharacterId: computed(() => selectedCharacterId.value ? BigInt(selectedCharacterId.value) : null)`

IMPORTANT: Do NOT touch any other code. Only fix these 7 specific sites. Pre-existing TS6133 (unused variable) warnings and non-v2 DOM type issues are out of scope.
  </action>
  <verify>
Run `npx vue-tsc --noEmit 2>&1 | grep -E "(useCommands|usePlayer|RenownPanel\.vue:(212|215|459)|App\.vue:(155|724|1274))"` — should return zero matches for these specific error sites.
  </verify>
  <done>
All 7 v2-specific type errors are resolved. The files compile without these specific errors. Pre-existing warnings (TS6133 unused vars, DOM type issues) may still appear but are not v2-related.
  </done>
</task>

<task type="auto">
  <name>Task 2: Commit untracked v2 module_bindings and all fixes</name>
  <files>
    src/module_bindings/
    src/composables/useCommands.ts
    src/composables/usePlayer.ts
    src/components/RenownPanel.vue
    src/App.vue
  </files>
  <action>
Stage and commit all changes in a single commit:
1. `git add src/module_bindings/` — adds all new v2-generated binding files plus modified index.ts and types/reducers.ts
2. `git add src/composables/useCommands.ts src/composables/usePlayer.ts src/components/RenownPanel.vue src/App.vue`
3. Commit with message: "fix(quick-308): resolve v2 type errors, commit v2 module_bindings"

This commit captures both the type fixes and the previously untracked v2-generated files from quick-307.
  </action>
  <verify>
`git status` shows clean working tree for all module_bindings and the 4 fixed source files. `git log --oneline -1` shows the new commit.
  </verify>
  <done>
All v2-generated module_bindings are tracked in git. All v2 type fixes are committed. Working tree is clean for migration-related files.
  </done>
</task>

</tasks>

<verification>
Run `npx vue-tsc --noEmit 2>&1` and confirm none of the 7 specific v2 error sites appear:
- No error at useCommands.ts:388
- No error at usePlayer.ts (player undefined issue)
- No error at RenownPanel.vue:212, :215, :459
- No error at App.vue:155, :724, :1274
Pre-existing TS6133 unused-var warnings are acceptable (not v2-related).
</verification>

<success_criteria>
- Zero v2-specific TypeScript errors across the 4 fixed files
- All 33 new module_bindings files tracked in git
- Single clean commit with all changes
</success_criteria>

<output>
After completion, create `.planning/quick/308-continue-quick-task-307/308-SUMMARY.md`
</output>
