---
phase: quick-47
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/usePanelManager.ts
autonomous: true
must_haves:
  truths:
    - "When user closes the log panel and reloads, the log panel stays closed"
    - "When user closes any toggleable panel and switches characters, the panel stays closed"
    - "Panels that have no close button (group, travel, inline hotbar) remain always visible"
  artifacts:
    - path: "src/composables/usePanelManager.ts"
      provides: "Panel state persistence without forced overrides"
  key_links:
    - from: "src/composables/usePanelManager.ts"
      to: "server save_panel_layout reducer"
      via: "saveToServer includes open state"
      pattern: "open: state\\.open"
---

<objective>
Persist open/closed state of windows across page reloads and character switches.

Purpose: Currently the panel manager saves the `open` field to the server and localStorage, but then forcefully overrides group, travel, hotbar, and log panels to `open = true` after loading. This means the log panel (which has a close button and ActionBar toggle) always reopens after reload despite the user closing it. The fix is to remove the forced override for panels that have open/close UI (log), while keeping always-visible panels (group, travel, inline hotbar) always open since they lack close buttons in the template.

Output: Updated usePanelManager.ts that respects saved open/closed state for all toggleable panels.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/usePanelManager.ts
@src/App.vue (for panel rendering — group/travel have no v-if open guard, log does)
@src/components/ActionBar.vue (for which panels are toggleable)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove forced open overrides for toggleable panels</name>
  <files>src/composables/usePanelManager.ts</files>
  <action>
In `usePanelManager.ts`, there are two places where panels are forcefully set to `open = true` after loading state:

1. In `loadFromStorage()` (around lines 111-114):
```typescript
if (panels.group) panels.group.open = true;
if (panels.travel) panels.travel.open = true;
if (panels.hotbar) panels.hotbar.open = true;
if (panels.log) panels.log.open = true;
```

2. In the server sync watcher (around lines 380-383):
```typescript
if (panels.group) panels.group.open = true;
if (panels.travel) panels.travel.open = true;
if (panels.hotbar) panels.hotbar.open = true;
if (panels.log) panels.log.open = true;
```

**Remove the `panels.log.open = true` line from BOTH locations.** The log panel has a close button and ActionBar toggle -- its open/closed state should be respected from saved data.

Keep the group, travel, and hotbar forced overrides because:
- `group` panel is always rendered in App.vue (no `v-if` on open state, no close button)
- `travel` panel is always rendered in App.vue (no `v-if` on open state, no close button)
- `hotbar` (the inline floating ability bar) is always rendered when a character is selected (no `v-if` on open state, no close button -- distinct from `hotbarPanel` which IS toggleable)

The result is that after this change:
- group, travel, hotbar (inline bar) still force-open on load (they are chrome, always visible)
- log, character, inventory, stats, crafting, journal, quests, renown, loot, vendor, friends, hotbarPanel, trade, track, characterActions all respect their saved open/closed state
  </action>
  <verify>
1. Read usePanelManager.ts and confirm `panels.log.open = true` no longer appears in loadFromStorage or the server sync watcher
2. Confirm `panels.group.open = true`, `panels.travel.open = true`, and `panels.hotbar.open = true` are still present in both locations
3. Run `npx tsc --noEmit` (if available) or `npx vue-tsc --noEmit` to confirm no type errors
  </verify>
  <done>
The log panel (and all other toggleable panels) respect their saved open/closed state from localStorage and server data. Only the three always-visible chrome panels (group, travel, inline hotbar) are forced open on load.
  </done>
</task>

</tasks>

<verification>
1. Open the app, close the log panel via its X button or the ActionBar toggle
2. Reload the page -- log panel should remain closed
3. Click "Log" in ActionBar to reopen -- it opens
4. Close it again, switch characters -- log should stay closed
5. Group panel and travel panel still appear as always (they have no close button)
</verification>

<success_criteria>
- Closed panels stay closed across page reload
- Closed panels stay closed across character switches
- Group, travel, and inline hotbar remain always visible (no regression)
- ActionBar toggle buttons correctly reflect open/closed state after reload
</success_criteria>

<output>
After completion, create `.planning/quick/47-we-save-the-locations-of-our-windows-on-/47-SUMMARY.md`
</output>
