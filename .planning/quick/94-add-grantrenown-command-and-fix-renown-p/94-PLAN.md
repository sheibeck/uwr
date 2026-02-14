---
phase: quick-94
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useCommands.ts
  - src/components/CommandBar.vue
  - src/components/RenownPanel.vue
autonomous: true
must_haves:
  truths:
    - "User can type /grantrenown <amount> to award test renown to selected character"
    - "Renown panel shows Rank 1 (Unsung) with 0 renown and progress bar even when no Renown row exists"
  artifacts:
    - path: "src/composables/useCommands.ts"
      provides: "/grantrenown command handler calling grantTestRenown reducer"
    - path: "src/components/CommandBar.vue"
      provides: "/grantrenown entry in autocomplete list"
    - path: "src/components/RenownPanel.vue"
      provides: "Rank 1 display when renownData is null"
  key_links:
    - from: "src/composables/useCommands.ts"
      to: "module_bindings reducers.grantTestRenown"
      via: "useReducer + object call syntax"
      pattern: "grantTestRenown.*characterId.*points"
---

<objective>
Add /grantrenown slash command for testing renown and fix the Renown panel to display Rank 1 information when a character has no renown data yet.

Purpose: The grant_test_renown reducer exists on the backend but has no client command wired to it. The Renown panel shows "No renown data yet" instead of displaying Rank 1 (Unsung) info for characters who haven't earned any renown, which is confusing since every character conceptually starts at Rank 1.
Output: Working /grantrenown command and improved Renown panel zero-state display.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/composables/useCommands.ts
@src/components/CommandBar.vue
@src/components/RenownPanel.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add /grantrenown command and fix Renown panel zero-state</name>
  <files>src/composables/useCommands.ts, src/components/CommandBar.vue, src/components/RenownPanel.vue</files>
  <action>
**1. Add /grantrenown to CommandBar.vue autocomplete list (line ~74, before the closing bracket):**

Add entry to the `commands` array:
```
{ value: '/grantrenown', hint: 'Grant test renown points' },
```

**2. Wire /grantrenown command in useCommands.ts:**

- Add `useReducer(reducers.grantTestRenown)` to the reducer declarations at the top (around line 33, after `levelReducer`).
- Add a new `else if` branch for `/grantrenown` in the `submitCommand` function. Place it after the `/level` handler (line ~149) and before the final `else` block. Pattern:
```typescript
} else if (lower.startsWith('/grantrenown ')) {
  const value = Number(raw.slice(13).trim());
  if (!Number.isFinite(value) || value < 1) return;
  grantTestRenownReducer({
    characterId: selectedCharacter.value.id,
    points: BigInt(Math.floor(value)),
  });
}
```
Note: The reducer is `grant_test_renown` server-side which becomes `grantTestRenown` in client bindings (snake_case to camelCase).

**3. Fix RenownPanel.vue to show Rank 1 when renownData is null:**

Replace the `v-else-if="!renownData"` block (line 66-68) that shows "No renown data yet." with the same rank display content used when renownData exists. The simplest approach: remove the `!renownData` guard entirely so the `v-else` block always renders when a character is selected.

The computed properties already handle null renownData gracefully:
- `currentRankNum` returns `1` when `renownData` is null (line 375)
- `renownPoints` returns `0` when `renownData` is null (line 376)
- `currentRankName` will resolve to 'Unsung' (rank 1)
- `isMaxRank` will be false
- `rankProgress` will be 0%
- `hasUnspentPerk` returns false when `!props.renownData` (line 404)

So the fix is: change line 66 from:
```html
<div v-else-if="!renownData" :style="styles.subtle">
  No renown data yet. Earn renown by defeating enemies and completing achievements!
</div>
```
to simply removing that entire block (lines 66-68). The existing `v-else` block on line 69 will then handle both cases (renownData exists or null), showing Rank 1 / Unsung / 0 renown / progress bar at 0%.
  </action>
  <verify>
1. Run `npx vue-tsc --noEmit` from the client directory to confirm no type errors
2. Grep for `grantrenown` in useCommands.ts and CommandBar.vue to confirm wiring
3. Grep for "No renown data yet" in RenownPanel.vue to confirm the guard was removed
  </verify>
  <done>
- /grantrenown appears in command autocomplete dropdown when typing "/"
- /grantrenown 100 calls grantTestRenown reducer with characterId and points: 100n
- Renown panel shows "Unsung", "Rank 1 / 15", "0 Renown", and a progress bar (at 0%) when character has no renown row
  </done>
</task>

</tasks>

<verification>
- CommandBar.vue contains `/grantrenown` in commands array
- useCommands.ts has grantTestRenown reducer wired and `/grantrenown` handler
- RenownPanel.vue no longer has "No renown data yet" conditional block
- No TypeScript compilation errors
</verification>

<success_criteria>
1. Typing `/gr` in command bar shows `/grantrenown` in autocomplete
2. Executing `/grantrenown 500` calls the grant_test_renown reducer
3. Renown panel displays Rank 1 (Unsung) info for characters with no renown data
</success_criteria>

<output>
After completion, create `.planning/quick/94-add-grantrenown-command-and-fix-renown-p/94-SUMMARY.md`
</output>
