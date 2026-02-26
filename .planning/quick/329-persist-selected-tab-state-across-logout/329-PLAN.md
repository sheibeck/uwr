---
phase: quick-329
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/usePanelManager.ts
  - src/components/WorldEventPanel.vue
autonomous: true
---

<objective>
Persist selected tab state across logout/login for all tabbed panels.

Purpose: When a user selects a tab (e.g., Quests in the Journal panel, or Renown in the Renown panel), that selection should survive logout/login. Currently tabs reset to defaults because (1) server sync restore skips the `tab` field, and (2) WorldEventPanel is not wired to the tab persistence system at all.

Output: All four tabbed panels (CharacterInfoPanel, NpcDialogPanel, RenownPanel, WorldEventPanel) persist their selected tab across logout/login via localStorage and server sync.
</objective>

<context>
@src/composables/usePanelManager.ts
@src/components/WorldEventPanel.vue
@src/components/NpcDialogPanel.vue
@src/components/RenownPanel.vue
@src/components/CharacterInfoPanel.vue
@src/App.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Restore tab field in server sync and wire WorldEventPanel</name>
  <files>
    src/composables/usePanelManager.ts
    src/components/WorldEventPanel.vue
    src/App.vue
  </files>
  <action>
**Fix 1 — usePanelManager.ts server sync restore (the core bug):**

In the server sync watcher (around line 464-473), the code restores x, y, w, h, and open from server state but skips `tab`. Add tab restoration:

After line 472 (`if (typeof s.open === 'boolean') panels[id].open = s.open;`), add:
```typescript
if (typeof s.tab === 'string') panels[id].tab = s.tab;
```

This is the main fix. localStorage already restores `tab` correctly (via `Object.assign` at line 161), and the save path already includes `tab` (line 196). Only the server restore path was missing it.

**Fix 2 — WorldEventPanel.vue tab persistence:**

WorldEventPanel is the only tabbed panel not wired to tab persistence. Add:

1. Add `requestedTab` prop to the props interface:
   ```typescript
   requestedTab?: string | null;
   ```

2. Add `tab-change` emit:
   ```typescript
   (e: 'tab-change', tab: string): void;
   ```

3. Initialize `activeTab` from `requestedTab` prop (same pattern as RenownPanel):
   ```typescript
   const activeTab = ref<'active' | 'history' | 'admin'>((props.requestedTab as any) ?? 'active');
   ```

4. Add a watcher to sync `requestedTab` changes:
   ```typescript
   watch(() => props.requestedTab, (tab) => {
     if (tab) activeTab.value = tab as 'active' | 'history' | 'admin';
   });
   ```

5. Update the tab button click handlers to emit `tab-change`. Replace the inline `@click="activeTab = 'active'"` etc. with a `setTab` function (same pattern as RenownPanel):
   ```typescript
   const setTab = (tab: 'active' | 'history' | 'admin') => {
     activeTab.value = tab;
     emit('tab-change', tab);
   };
   ```
   Update the three tab buttons in the template to use `@click="setTab('active')"`, `@click="setTab('history')"`, `@click="setTab('admin')"`.

**Fix 3 — App.vue WorldEventPanel wiring:**

In App.vue, update the WorldEventPanel usage (around line 164-174) to pass the persistence props:

Add to the WorldEventPanel element:
```
:requested-tab="panels.worldEvents?.tab"
@tab-change="tab => setPanelTab('worldEvents', tab)"
```
  </action>
  <verify>
1. `npx vue-tsc --noEmit` passes (or at least no new errors in the modified files)
2. Manual test: Open each tabbed panel, switch to a non-default tab, refresh the page. The tab selection should be restored.
3. Verify localStorage `uwr.panelStates` JSON contains `tab` fields for panels where tabs were changed.
  </verify>
  <done>
All four tabbed panels (CharacterInfoPanel, NpcDialogPanel/Journal, RenownPanel, WorldEventPanel) persist their selected tab across page refresh and logout/login. The `tab` field is restored from both localStorage and server sync.
  </done>
</task>

</tasks>

<verification>
- Open CharacterInfoPanel, switch to "Stats" tab, refresh page -- should stay on Stats
- Open RenownPanel, switch to "Factions" tab, refresh page -- should stay on Factions
- Open Journal (NpcDialogPanel), switch to "Quests" tab, refresh page -- should stay on Quests
- Open WorldEventPanel, switch to "History" tab, refresh page -- should stay on History
- Check `localStorage.getItem('uwr.panelStates')` contains `"tab":"stats"` etc. for modified panels
</verification>

<success_criteria>
Tab selections persist across page refresh and logout/login for all tabbed panels. No regressions in panel position/size persistence.
</success_criteria>
