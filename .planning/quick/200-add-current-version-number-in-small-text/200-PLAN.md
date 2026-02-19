---
phase: quick-200
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/AppHeader.vue
autonomous: true
requirements:
  - QUICK-200
must_haves:
  truths:
    - "Version string appears next to the Connected/Disconnected status text"
    - "Version text is visibly smaller/dimmer than the status label"
    - "Version is read from window.__client_version at runtime"
  artifacts:
    - path: "src/components/AppHeader.vue"
      provides: "Version display rendered inline after status span"
      contains: "__client_version"
  key_links:
    - from: "src/components/AppHeader.vue"
      to: "window.__client_version"
      via: "computed ref or direct access in template"
      pattern: "__client_version"
---

<objective>
Render the current build version number as small muted text immediately after the "Connected / Disconnected" status span in AppHeader.vue.

Purpose: Lets developers and testers quickly identify which build is running without opening devtools.
Output: AppHeader.vue updated with version display.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/AppHeader.vue
@src/main.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add version display to AppHeader</name>
  <files>src/components/AppHeader.vue</files>
  <action>
In the `<script setup>` block, add a computed ref that reads `window.__client_version`:

```ts
import { computed } from 'vue';  // already imported

const clientVersion = computed(() => (window as any).__client_version ?? 'dev');
```

In the template, immediately after the closing `</span>` on line 9 (the one wrapping "Connected"/"Disconnected"), add a version span inside the same `<div :style="styles.subtle">`:

```html
<span :style="{ fontSize: '0.7rem', opacity: 0.45, marginLeft: '6px', letterSpacing: '0.02em' }">
  v{{ clientVersion }}
</span>
```

The version string is a millisecond timestamp (e.g. "1771431442578") — display it as-is, no formatting needed. The tiny font size and low opacity keep it unobtrusive.

Do NOT add a new prop for version — access `window.__client_version` directly via the computed, matching the pattern already used in main.ts.
  </action>
  <verify>
Run `npm run dev` and open the app. The header should show something like:
  Status: Connected v1771431442578

In dev mode (no Vite define), it should show:
  Status: Connected vdev
  </verify>
  <done>Version string appears inline after status text, visually smaller and dimmed, sourced from window.__client_version.</done>
</task>

</tasks>

<verification>
Inspect header visually: version text is present, smaller than surrounding text, and does not disrupt layout.
Check that both connected and disconnected states still render correctly alongside the version.
</verification>

<success_criteria>
- AppHeader shows version string next to status on every page load
- Version reads from window.__client_version (set by main.ts from __BUILD_VERSION__)
- Displays "dev" when __BUILD_VERSION__ is not defined (local dev without Vite define)
</success_criteria>

<output>
After completion, create `.planning/quick/200-add-current-version-number-in-small-text/quick-200-01-SUMMARY.md`
</output>
