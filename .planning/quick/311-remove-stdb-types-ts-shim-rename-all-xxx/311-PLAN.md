---
phase: quick-311
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useAuth.ts
  - src/composables/useCharacters.ts
  - src/composables/useCharacterCreation.ts
  - src/composables/useCombat.ts
  - src/composables/useCommands.ts
  - src/composables/useCrafting.ts
  - src/composables/useEvents.ts
  - src/composables/useFriends.ts
  - src/composables/useGroups.ts
  - src/composables/useHotbar.ts
  - src/composables/useInventory.ts
  - src/composables/useItemTooltip.ts
  - src/composables/useMovement.ts
  - src/composables/usePlayer.ts
  - src/composables/useTrade.ts
  - src/components/AppHeader.vue
  - src/components/CharacterActionsPanel.vue
  - src/components/CharacterPanel.vue
  - src/components/CombatPanel.vue
  - src/components/FriendsPanel.vue
  - src/components/GroupPanel.vue
  - src/components/HotbarPanel.vue
  - src/components/InventoryPanel.vue
  - src/components/LocationGrid.vue
  - src/components/LogWindow.vue
  - src/components/MapPanel.vue
  - src/components/NpcDialogPanel.vue
  - src/components/QuestPanel.vue
  - src/components/RacialProfilePanel.vue
  - src/components/RenownPanel.vue
  - src/components/StatsPanel.vue
  - src/components/TrackPanel.vue
  - src/components/TradePanel.vue
  - src/components/TravelPanel.vue
  - src/components/VendorPanel.vue
  - src/components/WorldEventPanel.vue
  - src/stdb-types.ts
autonomous: true
requirements:
  - "QUICK-311"
must_haves:
  truths:
    - "No file imports from stdb-types.ts"
    - "All type references use bare names (e.g. Character not CharacterRow)"
    - "src/stdb-types.ts file is deleted"
    - "TypeScript compiles with zero errors"
  artifacts:
    - path: "src/stdb-types.ts"
      provides: "DELETED — must not exist"
  key_links:
    - from: "all 36 consumer files"
      to: "src/module_bindings/types"
      via: "import type from module_bindings/types"
      pattern: "from.*module_bindings/types"
---

<objective>
Remove the `src/stdb-types.ts` shim file and update all 36 consumer files to import bare type names directly from `module_bindings/types`.

Purpose: Eliminate unnecessary indirection layer — v2 codegen exports clean PascalCase types; the `Row` suffix aliases add confusion and an extra import hop.
Output: All client files reference bare type names (e.g. `Character` not `CharacterRow`), stdb-types.ts deleted, clean compile.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/stdb-types.ts
@src/module_bindings/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update 15 composables — replace stdb-types imports with bare module_bindings/types imports</name>
  <files>
    src/composables/useAuth.ts
    src/composables/useCharacters.ts
    src/composables/useCharacterCreation.ts
    src/composables/useCombat.ts
    src/composables/useCommands.ts
    src/composables/useCrafting.ts
    src/composables/useEvents.ts
    src/composables/useFriends.ts
    src/composables/useGroups.ts
    src/composables/useHotbar.ts
    src/composables/useInventory.ts
    src/composables/useItemTooltip.ts
    src/composables/useMovement.ts
    src/composables/usePlayer.ts
    src/composables/useTrade.ts
  </files>
  <action>
For each of the 15 composable files in src/composables/:

1. Change the import path: `from '../stdb-types'` becomes `from '../module_bindings/types'`
2. Strip `Row` suffix from every imported type name in the import statement (e.g. `CharacterRow` becomes `Character`, `ItemTemplateRow` becomes `ItemTemplate`)
3. Find-and-replace ALL occurrences of each `XxxRow` type name throughout the file body — function params, return types, generics, variable annotations, type assertions, etc.

The full mapping of Row-suffixed names to bare names is defined in stdb-types.ts (88 aliases). Each file only uses a subset. Apply the rename only for types actually imported in that file.

IMPORTANT: Do NOT change any logic, only type names and the import path. Do NOT touch any imports that come from other sources (e.g. `module_bindings`, `spacetimedb/react`, `vue`).
  </action>
  <verify>Run `npx vue-tsc --noEmit 2>&1 | head -50` — no errors referencing composable files or XxxRow types.</verify>
  <done>All 15 composables import from module_bindings/types with bare type names; zero references to stdb-types remain in src/composables/.</done>
</task>

<task type="auto">
  <name>Task 2: Update 21 components and delete stdb-types.ts</name>
  <files>
    src/components/AppHeader.vue
    src/components/CharacterActionsPanel.vue
    src/components/CharacterPanel.vue
    src/components/CombatPanel.vue
    src/components/FriendsPanel.vue
    src/components/GroupPanel.vue
    src/components/HotbarPanel.vue
    src/components/InventoryPanel.vue
    src/components/LocationGrid.vue
    src/components/LogWindow.vue
    src/components/MapPanel.vue
    src/components/NpcDialogPanel.vue
    src/components/QuestPanel.vue
    src/components/RacialProfilePanel.vue
    src/components/RenownPanel.vue
    src/components/StatsPanel.vue
    src/components/TrackPanel.vue
    src/components/TradePanel.vue
    src/components/TravelPanel.vue
    src/components/VendorPanel.vue
    src/components/WorldEventPanel.vue
    src/stdb-types.ts
  </files>
  <action>
For each of the 21 component files in src/components/:

1. Change the import path: `from '../stdb-types'` becomes `from '../module_bindings/types'`
2. Strip `Row` suffix from every imported type name in the import statement
3. Find-and-replace ALL occurrences of each `XxxRow` type name throughout the entire file (template refs in Vue files are type-only so they should not appear in templates, but check script blocks thoroughly — params, return types, generics, variable annotations, computed property types, prop types, etc.)

After all 21 components are updated:

4. DELETE `src/stdb-types.ts` entirely.

Potential concern: `Location` shadows `window.Location` — but these are `import type` only, so no runtime conflict. If any file uses `window.Location`, leave it alone (it refers to the browser API, not the game type). In practice none of these game files reference `window.Location`.

Same concern applies to `Group` — type-only import, no runtime conflict.
  </action>
  <verify>
Run `npx vue-tsc --noEmit 2>&1 | head -80` — zero type errors across all files.
Run `grep -r "stdb-types" src/ --include="*.ts" --include="*.vue"` — zero matches (file deleted and no imports remain).
Run `grep -rn "Row" src/composables/ src/components/ --include="*.ts" --include="*.vue" | grep -v node_modules | grep -v module_bindings | head -20` — verify no leftover XxxRow type references (some legitimate uses of "Row" in variable names or comments are fine; look for type annotation patterns like `: XxxRow` or `XxxRow` which should be gone).
  </verify>
  <done>All 21 components import from module_bindings/types with bare type names. src/stdb-types.ts is deleted. `npx vue-tsc --noEmit` passes clean. Zero references to stdb-types anywhere in src/.</done>
</task>

</tasks>

<verification>
- `npx vue-tsc --noEmit` completes with zero errors
- `grep -r "stdb-types" src/` returns zero matches
- `ls src/stdb-types.ts` returns "No such file"
- App builds successfully: `npm run build`
</verification>

<success_criteria>
- stdb-types.ts deleted
- All 36 files import bare type names from module_bindings/types
- Zero TypeScript compilation errors
- No remaining references to XxxRow type aliases or stdb-types import path
</success_criteria>

<output>
After completion, create `.planning/quick/311-remove-stdb-types-ts-shim-rename-all-xxx/311-SUMMARY.md`
</output>
