---
phase: quick-145
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/CommandBar.vue
  - src/composables/useCommands.ts
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "Typing /cr in the command bar shows /createitem in the autocomplete dropdown"
    - "Typing /w in the command bar shows /who in the autocomplete dropdown"
    - "Running /who outputs a list of all active characters with name, class, level, and location to the Log panel"
  artifacts:
    - path: "src/components/CommandBar.vue"
      provides: "Autocomplete entries for /createitem and /who"
      contains: "/createitem"
    - path: "src/composables/useCommands.ts"
      provides: "/who command handler"
      contains: "/who"
  key_links:
    - from: "src/composables/useCommands.ts"
      to: "addLocalEvent"
      via: "/who handler calls addLocalEvent with formatted player list"
      pattern: "addLocalEvent.*command"
---

<objective>
Add /createitem to the command autocomplete list and implement a new /who command that lists all active characters currently logged in, showing their name, class, level, and location in the Log panel.

Purpose: Improve command discoverability and add a useful social/admin tool for seeing who is online.
Output: Updated CommandBar.vue with new autocomplete entries, updated useCommands.ts with /who handler.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/CommandBar.vue
@src/composables/useCommands.ts
@src/App.vue
@src/composables/useGameData.ts
@src/module_bindings/character_table.ts
@src/module_bindings/player_table.ts
@src/module_bindings/location_table.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add /createitem and /who to autocomplete list</name>
  <files>src/components/CommandBar.vue</files>
  <action>
In CommandBar.vue, add two new entries to the `commands` array (around line 59-78):

1. `{ value: '/createitem', hint: 'Create test item by quality tier' }` — insert after the `/spawncorpse` entry
2. `{ value: '/who', hint: 'List all online characters' }` — insert after `/resetwindows`

Keep the array in the same style as existing entries.
  </action>
  <verify>Open CommandBar.vue and confirm both entries are present in the commands array. Run `npx vue-tsc --noEmit` to confirm no type errors.</verify>
  <done>Typing /cr shows /createitem in autocomplete; typing /wh shows /who and /whisper.</done>
</task>

<task type="auto">
  <name>Task 2: Implement /who command with character listing</name>
  <files>src/composables/useCommands.ts, src/App.vue</files>
  <action>
**In useCommands.ts:**

1. Add three new optional Ref parameters to `UseCommandsArgs`:
   - `players?: Ref<{ activeCharacterId: bigint | null | undefined }[]>`
   - `characters?: Ref<{ id: bigint; name: string; className: string; level: bigint; locationId: bigint }[]>`
   - `locations?: Ref<{ id: bigint; name: string }[]>`

   Use the actual row types from module_bindings if already imported, or use these structural shapes. The existing imports already have `CharacterRow` so extend from that.

2. Destructure `players`, `characters`, `locations` from the args object.

3. Add a `/who` command handler in the `submitCommand` function. Insert it before the final `else` block (the fallback to `submitCommandReducer`). The handler logic:

   ```
   } else if (lower === '/who') {
     // Find all active character IDs from players with an activeCharacterId
     const activeCharIds = new Set<string>();
     for (const p of players?.value ?? []) {
       if (p.activeCharacterId) {
         activeCharIds.add(p.activeCharacterId.toString());
       }
     }
     // Build character list
     const activeChars = (characters?.value ?? [])
       .filter(c => activeCharIds.has(c.id.toString()))
       .sort((a, b) => a.name.localeCompare(b.name));

     if (activeChars.length === 0) {
       addLocalEvent?.('command', 'No characters are currently online.');
     } else {
       const locationMap = new Map<string, string>();
       for (const loc of locations?.value ?? []) {
         locationMap.set(loc.id.toString(), loc.name);
       }
       const lines = activeChars.map(c => {
         const locName = locationMap.get(c.locationId.toString()) ?? 'Unknown';
         return `  ${c.name} — Level ${c.level} ${c.className} — ${locName}`;
       });
       addLocalEvent?.('command', `Online characters (${activeChars.length}):\n${lines.join('\n')}`);
     }
   }
   ```

**In App.vue:**

Find the `useCommands({...})` call (around line 1267-1280). Add three new properties to the argument object:

```
players: computed(() => players.value),
characters: computed(() => characters.value),
locations: computed(() => locations.value),
```

The `players`, `characters`, and `locations` refs are already destructured from `useGameData()` earlier in App.vue (around line 555-600), so they are in scope.
  </action>
  <verify>
1. Run `npx vue-tsc --noEmit` to confirm no type errors.
2. In-game, type `/who` and press Enter. Confirm the Log panel shows a formatted list of online characters with name, class, level, and location.
  </verify>
  <done>/who command outputs "Online characters (N):" header followed by one line per active character showing name, level, class, and location name. Empty state shows "No characters are currently online."</done>
</task>

</tasks>

<verification>
- Type `/cr` in command bar — autocomplete shows `/createitem` with hint "Create test item by quality tier"
- Type `/wh` in command bar — autocomplete shows `/who` with hint "List all online characters" (and `/whisper`)
- Execute `/who` — Log panel displays formatted list of all active characters
- Execute `/who` with no one online except self — shows at least the current character
- `npx vue-tsc --noEmit` passes with no errors
</verification>

<success_criteria>
- /createitem appears in autocomplete when typing /cr
- /who appears in autocomplete when typing /wh
- /who outputs a formatted list of active characters to the Log panel with name, class, level, location
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/145-add-createitem-to-autocomplete-list-and-/145-SUMMARY.md`
</output>
