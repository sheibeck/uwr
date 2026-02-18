---
phase: 171-death-overlay-zindex
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ui/styles.ts
autonomous: true
must_haves:
  truths:
    - "Death overlay renders on top of all floating panels and all modal dialogs"
  artifacts:
    - path: "src/ui/styles.ts"
      provides: "deathOverlay zIndex set to 9999"
      contains: "zIndex: 9999"
---

<objective>
Ensure the death splash screen (deathOverlay) renders above all other UI elements.

Currently zIndex: 70 — below floating panels (up to 5000) and the resurrect confirmation (9000).
Fix: set to 9999 to be above everything.
</objective>

<tasks>
<task type="auto">
  <name>Task 1: Bump deathOverlay zIndex to 9999</name>
  <files>src/ui/styles.ts</files>
  <action>Change deathOverlay.zIndex from 70 to 9999.</action>
  <done>deathOverlay has zIndex: 9999</done>
</task>
</tasks>
