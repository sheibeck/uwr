---
phase: quick-66
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/usePanelManager.ts
  - src/App.vue
autonomous: true

must_haves:
  truths:
    - "New players (no saved panel state) see the Log panel open on first login"
    - "Existing players who closed their Log panel keep it closed"
    - "Existing players who have Log panel open keep it open"
    - "Always-visible panels (group, travel, hotbar) remain forced open regardless"
  artifacts:
    - path: "src/composables/usePanelManager.ts"
      provides: "Support for optional default open state in panel defaults"
      contains: "open.*def"
    - path: "src/App.vue"
      provides: "Log panel default open: true in panel defaults"
      contains: "log.*open"
  key_links:
    - from: "src/App.vue"
      to: "src/composables/usePanelManager.ts"
      via: "usePanelManager defaults parameter"
      pattern: "log.*open.*true"
---

<objective>
Make the Log panel open by default for new players who have no saved panel state.

Purpose: New players currently see no Log panel because all panels default to `open: false` in usePanelManager. The log is essential for understanding game events, so it should be visible by default. Players who have already customized their layout (closed it) should keep their preference.

Output: Updated usePanelManager to accept optional `open` default, App.vue passes `open: true` for log panel.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/usePanelManager.ts
@src/App.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add default open state support and set Log panel open by default</name>
  <files>src/composables/usePanelManager.ts, src/App.vue</files>
  <action>
Two changes needed:

1. In `src/composables/usePanelManager.ts`:
   - Update the `defaults` parameter type from `Record<string, { x: number; y: number; w?: number; h?: number }>` to also include an optional `open?: boolean` field: `Record<string, { x: number; y: number; w?: number; h?: number; open?: boolean }>`
   - In the initialization loop (line 59-68), change `open: false` to `open: def.open ?? false` so panels use the provided default or fall back to closed.
   - No other changes needed. The `loadFromStorage()` call at line 415 and the server sync watcher at line 373 both use `Object.assign` / direct property assignment which will override this default when saved state exists. The always-visible panel force-open (group/travel/hotbar at lines 120-122 and 399-401) remains unchanged.

2. In `src/App.vue`:
   - In the `usePanelManager({...})` call (around line 1500), add `open: true` to the log panel entry.
   - Change: `log: { x: 40, y: 400, w: 500, h: 300 }` to `log: { x: 40, y: 400, w: 500, h: 300, open: true }`
   - Do NOT change any other panel entries.
  </action>
  <verify>
Run `npx vue-tsc --noEmit` from the project root to verify TypeScript compiles without errors. Grep for `open: def.open` in usePanelManager.ts and `open: true` in the log entry of App.vue to confirm changes are in place.
  </verify>
  <done>
New players (no saved state) see Log panel open. Existing players with saved state retain their preference. Type signature updated to support optional open default.
  </done>
</task>

</tasks>

<verification>
- New player flow: No localStorage, no server panel state -> log panel initializes with `open: true` from defaults -> panel is visible
- Existing player flow: localStorage or server has saved state with `open: false` for log -> loadFromStorage or server sync overwrites the default -> log stays closed
- Existing player flow: localStorage or server has saved state with `open: true` for log -> loadFromStorage or server sync overwrites the default -> log stays open
- Always-visible panels (group, travel, hotbar) unaffected — still forced open in both loadFromStorage and server sync watcher
</verification>

<success_criteria>
- TypeScript compiles without errors
- Log panel default includes `open: true` in App.vue
- usePanelManager respects optional `open` field in defaults
- No regression: group/travel/hotbar still forced open; other toggleable panels still default closed
</success_criteria>

<output>
After completion, create `.planning/quick/66-make-log-panel-open-by-default-for-new-p/66-SUMMARY.md`
</output>
