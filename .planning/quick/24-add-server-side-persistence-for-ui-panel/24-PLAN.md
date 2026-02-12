---
phase: quick-24
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/ui.ts
  - spacetimedb/src/reducers/index.ts
  - spacetimedb/src/views/ui.ts
  - spacetimedb/src/views/index.ts
  - spacetimedb/src/views/types.ts
  - src/composables/useGameData.ts
  - src/composables/usePanelManager.ts
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "Panel positions, sizes, and visibility persist across browser sessions via server"
    - "Each character has independent panel layout settings"
    - "Switching characters loads that character's saved panel layout"
    - "New characters or characters without saved layouts get default positions"
    - "localStorage is still used as immediate cache but server is source of truth on login"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "UiPanelLayout table definition"
      contains: "UiPanelLayout"
    - path: "spacetimedb/src/reducers/ui.ts"
      provides: "save_panel_layout reducer"
      contains: "save_panel_layout"
    - path: "spacetimedb/src/views/ui.ts"
      provides: "my_panel_layout view filtered by active character"
      contains: "my_panel_layout"
    - path: "src/composables/usePanelManager.ts"
      provides: "Server sync logic - load from server data, save via reducer"
      contains: "savePanelLayout"
  key_links:
    - from: "src/composables/usePanelManager.ts"
      to: "spacetimedb/src/reducers/ui.ts"
      via: "useReducer(reducers.savePanelLayout) called on panel changes"
      pattern: "savePanelLayout"
    - from: "src/composables/usePanelManager.ts"
      to: "src/composables/useGameData.ts"
      via: "Server panel layout data passed in as parameter"
      pattern: "serverPanelLayouts"
    - from: "spacetimedb/src/views/ui.ts"
      to: "spacetimedb/src/index.ts"
      via: "View filters UiPanelLayout by active character"
      pattern: "my_panel_layout"
---

<objective>
Add server-side persistence for UI panel layout and preferences so that logging into an account
from another browser or device restores the user's UI setup. Settings are stored per-character.

Purpose: Users currently lose their panel layout when switching browsers/devices because it's only
in localStorage. Server persistence makes the layout follow the account.

Output: UiPanelLayout table, save_panel_layout reducer, my_panel_layout view, and client wiring
that loads server layout on character selection and saves changes back.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@spacetimedb/src/index.ts
@spacetimedb/src/reducers/index.ts
@spacetimedb/src/reducers/hunger.ts (pattern reference for reducer structure)
@spacetimedb/src/views/index.ts
@spacetimedb/src/views/types.ts
@spacetimedb/src/views/hunger.ts (pattern reference for view structure)
@src/composables/usePanelManager.ts
@src/composables/useGameData.ts
@src/App.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend — UiPanelLayout table, reducer, and view</name>
  <files>
    spacetimedb/src/index.ts
    spacetimedb/src/reducers/ui.ts
    spacetimedb/src/reducers/index.ts
    spacetimedb/src/views/ui.ts
    spacetimedb/src/views/index.ts
    spacetimedb/src/views/types.ts
  </files>
  <action>
**1. Add UiPanelLayout table in `spacetimedb/src/index.ts`:**

Define the table near the other tables (before the `schema()` call). Store one row per character
containing a JSON string of all panel states. This avoids 17+ rows per character.

```typescript
const UiPanelLayout = table(
  {
    name: 'ui_panel_layout',
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    panelStatesJson: t.string(), // JSON-serialized Record<string, PanelState>
    updatedAt: t.timestamp(),
  }
);
```

Add `UiPanelLayout` to the `schema()` call at the end (before the closing paren, after `FactionStanding`).

Add `UiPanelLayout` to the `reducerDeps` object.

Add `UiPanelLayout` to the `registerViews()` call.

**2. Create `spacetimedb/src/reducers/ui.ts`:**

Follow the same pattern as `hunger.ts` — export a `registerUiReducers` function that takes deps.

Define `save_panel_layout` reducer:
- Parameters: `{ characterId: t.u64(), panelStatesJson: t.string() }`
- Validate: Use `requireCharacterOwnedBy(ctx, characterId)` to ensure the caller owns this character
- Validate: `panelStatesJson` is not empty and its length is < 10000 (sanity limit)
- Lookup existing row: `[...ctx.db.uiPanelLayout.by_character.filter(characterId)]` then find `[0]`
- If exists: update with new JSON and timestamp via `ctx.db.uiPanelLayout.id.update({ ...existing, panelStatesJson, updatedAt: ctx.timestamp })`
- If not exists: insert new row `ctx.db.uiPanelLayout.insert({ id: 0n, characterId, panelStatesJson, updatedAt: ctx.timestamp })`

**3. Register the reducer in `spacetimedb/src/reducers/index.ts`:**

- Import `registerUiReducers` from `./ui`
- Call `registerUiReducers(deps)` inside `registerReducers`

**4. Create `spacetimedb/src/views/ui.ts`:**

Follow the same pattern as `hunger.ts`.

```typescript
export const registerUiViews = ({ spacetimedb, t, UiPanelLayout }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_panel_layout', public: true },
    t.array(UiPanelLayout.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player || !player.activeCharacterId) return [];
      return [...ctx.db.uiPanelLayout.by_character.filter(player.activeCharacterId)];
    }
  );
};
```

**5. Register the view in `spacetimedb/src/views/index.ts`:**

- Import `registerUiViews` from `./ui`
- Call `registerUiViews(deps)` inside `registerViews`

**6. Update `spacetimedb/src/views/types.ts`:**

Add `UiPanelLayout: any;` to the ViewDeps interface.
  </action>
  <verify>
    Run `spacetime publish uwr --clear-database -y --project-path spacetimedb` (or equivalent local publish command used by this project). Module should compile and publish without errors. Check `spacetime logs uwr` for no startup errors.
  </verify>
  <done>
    UiPanelLayout table exists in schema. save_panel_layout reducer accepts characterId + JSON string and upserts. my_panel_layout view returns the active character's layout row. Module publishes cleanly.
  </done>
</task>

<task type="auto">
  <name>Task 2: Client — Wire up server sync in panel manager and game data</name>
  <files>
    src/composables/useGameData.ts
    src/composables/usePanelManager.ts
    src/App.vue
  </files>
  <action>
**1. Add subscription in `src/composables/useGameData.ts`:**

Add a new `useTable` line following the existing pattern:
```typescript
const [panelLayouts] = useTable(tables.myPanelLayout);
```

Return `panelLayouts` from the composable alongside the other data.

**2. Update `src/App.vue` to destructure and pass panel layout data:**

In the `useGameData()` destructure block (around line 482-539), add `panelLayouts`.

Import `reducers` is already imported. Add a new reducer:
```typescript
const savePanelLayoutReducer = useReducer(reducers.savePanelLayout);
```

Pass `panelLayouts`, `savePanelLayoutReducer`, and `selectedCharacterId` to `usePanelManager`:
```typescript
} = usePanelManager({
  group: { x: 40, y: 140 },
  // ... existing defaults ...
}, {
  serverPanelLayouts: panelLayouts,
  selectedCharacterId,
  savePanelLayout: savePanelLayoutReducer,
});
```

Note: `selectedCharacterId` is a `ref<bigint | undefined>` already defined in App.vue at around line 552.

**3. Update `src/composables/usePanelManager.ts` to sync with server:**

Modify the function signature to accept an optional second argument for server sync:

```typescript
interface ServerSyncOptions {
  serverPanelLayouts: Ref<any[]>;
  selectedCharacterId: Ref<bigint | undefined>;
  savePanelLayout: (args: { characterId: bigint; panelStatesJson: string }) => void;
}

export function usePanelManager(
  defaults: Record<string, { x: number; y: number; w?: number; h?: number }>,
  serverSync?: ServerSyncOptions
)
```

Import `Ref` and `watchEffect` from vue (add to existing imports).

**Server -> Client loading:**

Add a `watch` on `serverSync.serverPanelLayouts` and `serverSync.selectedCharacterId`. When server data arrives for the active character, parse the JSON and apply it to `panels`:

```typescript
if (serverSync) {
  watch(
    [() => serverSync.serverPanelLayouts.value, () => serverSync.selectedCharacterId.value],
    ([layouts, charId]) => {
      if (!charId || !layouts || layouts.length === 0) return;
      // Find the layout row for the active character
      const row = layouts.find((r: any) => r.characterId === charId);
      if (!row?.panelStatesJson) return;
      try {
        const parsed = JSON.parse(row.panelStatesJson);
        for (const [id, state] of Object.entries(parsed)) {
          if (panels[id] && typeof state === 'object' && state !== null) {
            const s = state as any;
            // Only apply position/size/visibility, keep zIndex local
            if (typeof s.x === 'number') panels[id].x = s.x;
            if (typeof s.y === 'number') panels[id].y = s.y;
            if (typeof s.w === 'number') panels[id].w = s.w;
            if (typeof s.h === 'number') panels[id].h = s.h;
            if (typeof s.open === 'boolean') panels[id].open = s.open;
          }
        }
        // Always ensure fixed panels start open
        if (panels.group) panels.group.open = true;
        if (panels.travel) panels.travel.open = true;
        if (panels.hotbar) panels.hotbar.open = true;
        if (panels.log) panels.log.open = true;
      } catch (e) {
        console.warn('Failed to parse server panel layout:', e);
      }
    },
    { immediate: true }
  );
}
```

**Client -> Server saving:**

Modify the existing `saveToStorage` function. After writing to localStorage, also call the server save if `serverSync` is provided and a character is selected. Use a longer debounce for server saves (2 seconds) to avoid spamming the reducer:

```typescript
let serverSaveTimer: number | undefined;
const saveToServer = () => {
  if (!serverSync) return;
  clearTimeout(serverSaveTimer);
  serverSaveTimer = window.setTimeout(() => {
    const charId = serverSync.selectedCharacterId.value;
    if (!charId) return;
    try {
      const data: Record<string, any> = {};
      for (const [id, state] of Object.entries(panels)) {
        // Save all fields except zIndex (local-only)
        data[id] = { open: state.open, x: state.x, y: state.y, w: state.w, h: state.h };
      }
      serverSync.savePanelLayout({ characterId: charId, panelStatesJson: JSON.stringify(data) });
    } catch (e) {
      console.warn('Failed to save panel layout to server:', e);
    }
  }, 2000);
};
```

Call `saveToServer()` at the end of the existing `saveToStorage()` function (inside the timeout callback, after the localStorage write).

**Guard against feedback loop:**

Add a `loadingFromServer` flag (ref<boolean>) that is set to `true` when applying server data and `false` after. In the watch that triggers `saveToStorage`, skip if `loadingFromServer` is true. This prevents the server load from immediately triggering a server save.

```typescript
const loadingFromServer = ref(false);

// In the server load watch, wrap the panel assignments:
loadingFromServer.value = true;
// ... apply panel states ...
loadingFromServer.value = false;

// In the existing panels watch, guard:
watch(
  () => JSON.stringify(panels),
  () => {
    if (!loadingFromServer.value) {
      saveToStorage();
    }
  }
);
```

**Keep localStorage as fast cache:** The existing localStorage load in `loadFromStorage()` remains. It provides instant panel restoration on page load. Server data overrides it once it arrives via the subscription.
  </action>
  <verify>
    1. Run `cd client && npm run build` (or equivalent) to confirm TypeScript compiles with no errors.
    2. After generating bindings (`spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb`), verify the build still succeeds.
    3. Manually test: Open the app, move panels around. Check SpacetimeDB logs for `save_panel_layout` reducer calls. Open in a different browser/incognito — panels should restore from server after selecting the same character.
  </verify>
  <done>
    Panel layout persists on the server per character. Switching characters loads that character's layout. Moving/resizing panels debounce-saves to server. localStorage provides instant cache. New characters gracefully fall back to defaults.
  </done>
</task>

</tasks>

<verification>
1. Publish backend module — no compile errors
2. Generate client bindings — no errors
3. Client builds — no TypeScript errors
4. Move a panel, check SpacetimeDB logs for save_panel_layout reducer call
5. Open same account in incognito — panel positions match
6. Create a second character — gets default layout, not first character's layout
7. Switch between characters — each loads their own layout
</verification>

<success_criteria>
- UiPanelLayout table stores one JSON row per character
- save_panel_layout reducer upserts with ownership validation
- my_panel_layout view returns only the active character's row
- Client loads server layout when character selected, saves on changes with 2s debounce
- localStorage still works as immediate cache for same-browser experience
- No feedback loop between server load and server save
</success_criteria>

<output>
After completion, create `.planning/quick/24-add-server-side-persistence-for-ui-panel/24-SUMMARY.md`
</output>
