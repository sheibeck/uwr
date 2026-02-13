---
phase: quick
plan: 44
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/index.ts
  - src/composables/useGameData.ts
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "NPC dialog entries appear in Journal panel after talking to NPCs"
    - "Journal only shows dialogs for the currently selected character"
    - "Existing NPC dialog panel functionality (NPC list, dialog entries, sorting) unchanged"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "Public NpcDialog table"
      contains: "public: true"
    - path: "src/composables/useGameData.ts"
      provides: "Direct table subscription instead of view"
      contains: "tables.npcDialog"
    - path: "src/App.vue"
      provides: "Client-side character filtering for NPC dialogs"
  key_links:
    - from: "src/composables/useGameData.ts"
      to: "tables.npcDialog"
      via: "useTable subscription"
      pattern: "useTable\\(tables\\.npcDialog\\)"
    - from: "src/App.vue"
      to: "NpcDialogPanel"
      via: "filtered npcDialogs prop"
---

<objective>
Fix NPC dialog not appearing in the Journal panel when talking to NPCs.

Purpose: The `my_npc_dialog` view (which filters private `npc_dialog` rows by active character) has the same unreliable reactivity issue as other views in this codebase (see Decision #33, quick-35, quick-42). The view does not re-evaluate reliably when new dialog rows are inserted, so the Journal panel always shows empty.

Output: Journal panel displays NPC dialog entries after hailing NPCs, using the established public-table + client-side-filter pattern.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/index.ts (NpcDialog table definition ~line 166, appendNpcDialog ~line 1493)
@spacetimedb/src/views/npc.ts (my_npc_dialog view — being bypassed)
@src/composables/useGameData.ts (npcDialogs subscription ~line 52)
@src/App.vue (Journal panel ~line 215, npcDialogs destructured ~line 540)
@src/components/NpcDialogPanel.vue (receives npcDialogs prop, filters by npcId)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make NpcDialog table public and switch client to direct subscription with client-side filtering</name>
  <files>spacetimedb/src/index.ts, src/composables/useGameData.ts, src/App.vue</files>
  <action>
This follows the exact pattern from quick-35 (CombatLoot) and quick-42 (CharacterEffect) — bypass unreliable view with public table + client-side filter.

**Server (spacetimedb/src/index.ts):**
- Find the NpcDialog table definition (~line 166) and add `public: true` to the options object (first argument of `table()`).
- The table currently has `name: 'npc_dialog'` and indexes `by_character` and `by_npc`. Just add `public: true` alongside `name`.

**Client subscription (src/composables/useGameData.ts):**
- Change line 52 from `const [npcDialogs] = useTable(tables.myNpcDialog)` to `const [npcDialogs] = useTable(tables.npcDialog)`.
- This switches from the unreliable view to the direct public table subscription.

**Client-side filtering (src/App.vue):**
- Add a `characterNpcDialogs` computed that filters `npcDialogs.value` to only include entries where `entry.characterId.toString() === selectedCharacter.value?.id.toString()`.
- Pass `characterNpcDialogs` instead of raw `npcDialogs` to the NpcDialogPanel component on line 215. Change `:npc-dialogs="npcDialogs"` to `:npc-dialogs="characterNpcDialogs"`.
- Place the computed near the other filtering computeds (like `relevantEffects`).

**Do NOT:**
- Remove the `my_npc_dialog` view from `spacetimedb/src/views/npc.ts` (leave it for backwards compatibility; it just won't be subscribed to).
- Change NpcDialogPanel.vue (it already works correctly — it receives NpcDialogRow[] and filters/sorts by npcId).
- Modify the `appendNpcDialog` function or the `hail_npc` reducer logic.

After code changes:
1. Publish module: `spacetime publish uwr --project-path spacetimedb` (use `--clear-database -y` only if migration errors occur)
2. Regenerate bindings: `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb`
3. Build client: `npm run build` (or `npx vite build`) to verify no TypeScript errors
  </action>
  <verify>
1. `spacetime publish uwr --project-path spacetimedb` succeeds (or with --clear-database if migration needed)
2. `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb` succeeds
3. Client builds without TypeScript errors
4. `spacetime logs uwr` shows no errors after publishing
  </verify>
  <done>
NpcDialog table is public, client subscribes to `tables.npcDialog` directly, App.vue filters dialogs by selected character before passing to NpcDialogPanel. When a user hails an NPC, the dialog entry appears in the Journal panel.
  </done>
</task>

</tasks>

<verification>
- Module publishes without errors
- Client bindings regenerate successfully
- Client builds without TypeScript errors
- NpcDialog table has `public: true` in schema
- useGameData subscribes to `tables.npcDialog` (not `tables.myNpcDialog`)
- App.vue filters npcDialogs by selectedCharacter.id before passing to panel
</verification>

<success_criteria>
Journal panel displays NPC dialog entries after talking to NPCs via hail command. Dialog is filtered to show only the selected character's conversations. Existing NPC dialog panel UI (NPC sidebar, dialog list, timestamp sorting) works unchanged.
</success_criteria>

<output>
After completion, create `.planning/quick/44-fix-npc-dialog-not-appearing-in-journal-/44-SUMMARY.md`
</output>
