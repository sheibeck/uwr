---
phase: quick-321
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/data/useQuestData.ts
  - src/composables/useGameData.ts
  - src/App.vue
  - src/components/NpcDialogPanel.vue
autonomous: true
requirements: [FIX-321]
must_haves:
  truths:
    - "Quest panel shows quest giver's NPC name and location even when player is at a different location"
    - "Quest panel shows 'Location Name, Region Name' format for quest location, never 'Unknown'"
    - "Journal tab NPC list still shows only NPCs at the current location"
  artifacts:
    - path: "src/composables/data/useQuestData.ts"
      provides: "Global NPC subscription for quest giver resolution"
      contains: "allNpcs"
    - path: "src/components/NpcDialogPanel.vue"
      provides: "Quest tab using allNpcs for giver/location lookup"
      contains: "allNpcs"
  key_links:
    - from: "src/composables/data/useQuestData.ts"
      to: "npc table (global SELECT *)"
      via: "unfiltered subscription"
      pattern: "toSql\\(tables\\.npc\\)"
    - from: "src/components/NpcDialogPanel.vue"
      to: "allNpcs prop"
      via: "questRows computed uses allNpcs instead of npcs"
      pattern: "allNpcs.*find.*npcId"
---

<objective>
Fix quests showing "Unknown" for quest giver name and location when the player leaves the quest giver's location.

Purpose: The NPC subscription in useWorldData is location-scoped (WHERE locationId = currentLocationId), so when the player travels away from a quest giver's location, the NPC data is dropped from the local cache. The questRows computed in NpcDialogPanel looks up the NPC in this scoped array and fails, displaying "Unknown" for both the giver name and location.

Output: Quest panel always resolves quest giver name and location correctly by using a separate global (unfiltered) NPC subscription dedicated to quest data.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/data/useQuestData.ts
@src/composables/useGameData.ts
@src/components/NpcDialogPanel.vue
@src/App.vue (line 155 — NpcDialogPanel usage)
@src/composables/data/useWorldData.ts (line 108 — location-scoped NPC sub causing the bug)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add global NPC subscription to useQuestData and wire through to NpcDialogPanel</name>
  <files>
    src/composables/data/useQuestData.ts
    src/composables/useGameData.ts
    src/App.vue
    src/components/NpcDialogPanel.vue
  </files>
  <action>
**Root cause:** `useWorldData.ts` subscribes to NPCs with `WHERE locationId = currentLocationId`. When the player travels away from a quest giver's location, the NPC row leaves the local cache. The `questRows` computed in NpcDialogPanel.vue looks up NPCs from this scoped `npcs` prop and gets null, causing "Unknown" display.

**Fix — 4 files, all client-only:**

1. **`src/composables/data/useQuestData.ts`**: Add a global (unfiltered) NPC subscription alongside the existing quest subscriptions. Add `allNpcs` shallowRef. In the `subscribe()` call, add `toSql(tables.npc)` to the query list. Add a `rebind` for `dbConn.db.npc` -> `allNpcs`. Return `allNpcs` from the composable.

   The key addition:
   ```typescript
   const allNpcs = shallowRef<any[]>([]);
   ```
   In `refresh()`:
   ```typescript
   allNpcs.value = [...dbConn.db.npc.iter()];
   ```
   In subscription queries add:
   ```typescript
   toSql(tables.npc),
   ```
   Add rebind:
   ```typescript
   rebind(dbConn.db.npc, allNpcs, () => dbConn.db.npc.iter());
   ```
   Return `allNpcs` alongside other refs.

   NOTE: This creates a second subscription to the NPC table — one global (here) and one location-filtered (in useWorldData). SpacetimeDB handles overlapping subscriptions fine; the local cache is the union, and `.iter()` returns all cached rows. The global sub ensures all NPC rows are always available.

2. **`src/composables/useGameData.ts`**: The `...quest` spread already exports everything from useQuestData. Since `allNpcs` is now returned by useQuestData, it will automatically be available in the spread. No changes needed here — BUT verify the `allNpcs` name does not conflict with anything in the spread. The `world` spread exports `npcs` (location-scoped). The quest spread will export `allNpcs` (global). These are different names, no conflict.

   Actually, verify useGameData.ts does NOT need changes — the `...quest` spread on line 69 already passes through all useQuestData return values.

3. **`src/App.vue`**: On line 155, add the `:all-npcs="allNpcs"` prop to the NpcDialogPanel component. The `allNpcs` variable is already available via the `useGameData` spread (since useQuestData now exports it).

   Change line 155 from:
   ```
   <NpcDialogPanel :styles="styles" :npc-dialogs="characterNpcDialogs" :npcs="npcs" :locations="locations" ...
   ```
   to include `:all-npcs="allNpcs"` in the props.

4. **`src/components/NpcDialogPanel.vue`**:
   - Add `allNpcs: Npc[];` to the props definition (alongside existing `npcs` prop)
   - In the `questRows` computed (line 281-308), change the NPC lookup from `props.npcs.find(...)` to `props.allNpcs.find(...)` — this is the key fix. The NPC lookup for quest giver resolution now uses the global NPC list instead of the location-scoped one.
   - Keep `props.npcs` usage unchanged in the journal tab (npcFilters, dialogEntries, selectedNpcData) — those correctly show only NPCs at the player's current location.

   Specifically change line 287-288:
   ```typescript
   // BEFORE (broken — uses location-scoped npcs):
   const npc = template
     ? props.npcs.find((row) => row.id.toString() === template.npcId.toString())
     : null;

   // AFTER (fixed — uses global allNpcs):
   const npc = template
     ? props.allNpcs.find((row) => row.id.toString() === template.npcId.toString())
     : null;
   ```
  </action>
  <verify>
    1. Run `npm run build` from the project root to verify no TypeScript/compilation errors.
    2. Grep for "allNpcs" across the 4 modified files to confirm wiring is complete:
       - useQuestData.ts: declares, populates, and returns allNpcs
       - NpcDialogPanel.vue: receives as prop and uses in questRows
       - App.vue: passes allNpcs to NpcDialogPanel
    3. Verify that the `questRows` computed in NpcDialogPanel.vue uses `props.allNpcs.find(...)` not `props.npcs.find(...)`.
    4. Verify that the journal tab code (npcFilters, dialogEntries, selectedNpcData) still uses `props.npcs` (location-scoped), NOT allNpcs.
  </verify>
  <done>
    Quest panel resolves quest giver NPC name and location using the global NPC subscription (allNpcs) instead of the location-scoped subscription. The "Unknown" display no longer appears when the player is at a different location from the quest giver. Journal tab NPC list is unaffected and still shows only local NPCs.
  </done>
</task>

</tasks>

<verification>
- Build succeeds with no errors
- allNpcs wiring: useQuestData -> useGameData (via spread) -> App.vue -> NpcDialogPanel (prop) -> questRows computed
- Quest tab uses allNpcs for NPC lookup; journal tab still uses location-scoped npcs
- No server-side changes needed (NPC table is already public: true)
</verification>

<success_criteria>
- Quest panel shows correct quest giver name (e.g., "Brom") instead of "Unknown" when player is away from giver's location
- Quest panel shows correct location (e.g., "Town Square, Ashvale") instead of "Unknown" when player is away
- No regression in journal tab — NPC list still shows only NPCs at current location
- Build passes cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/321-fix-quests-showing-unknown-location-when/321-SUMMARY.md`
</output>
