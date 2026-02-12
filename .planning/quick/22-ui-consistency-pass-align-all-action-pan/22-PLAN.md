---
phase: quick-22
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/InventoryPanel.vue
  - src/components/StatsPanel.vue
  - src/components/CraftingPanel.vue
  - src/components/CharacterActionsPanel.vue
  - src/components/RenownPanel.vue
autonomous: true
must_haves:
  truths:
    - "No panel component renders a redundant title that duplicates the floatingPanelHeader already shown in App.vue"
    - "All action panel root elements use styles.panelBody for consistent flex-column gap layout"
    - "RenownPanel faction entries use reusable style patterns instead of raw inline style objects"
    - "CharacterActionsPanel action buttons use card-style rows matching the visual language of other panels"
  artifacts:
    - path: "src/components/InventoryPanel.vue"
      provides: "Inventory panel without redundant title, with panelBody wrapper"
    - path: "src/components/StatsPanel.vue"
      provides: "Stats panel with panelBody wrapper"
    - path: "src/components/CraftingPanel.vue"
      provides: "Crafting panel without redundant title, with panelBody wrapper"
    - path: "src/components/CharacterActionsPanel.vue"
      provides: "Character actions panel with panelBody wrapper and card-style buttons"
    - path: "src/components/RenownPanel.vue"
      provides: "Renown panel with polished faction cards using consistent style patterns"
  key_links: []
---

<objective>
Align all action panel components with a cohesive visual language. Remove redundant titles (already shown in App.vue's floatingPanelHeader), add panelBody wrappers for consistent spacing, and polish inline styles into reusable patterns.

Purpose: After quick tasks 18 and 20 aligned the Hotbar panel, the remaining panels (Inventory, Stats, Crafting, CharacterActions, Renown) still have inconsistent structure. This pass brings them all to the same standard.

Output: 5 modified panel components with unified structure.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/ui/styles.ts
@src/components/HotbarPanel.vue (reference: already aligned, uses panelBody wrapper, subtleSmall, card-style rows)
@src/App.vue (lines 160-244: all panels already have floatingPanelHeader with title + floatingPanelBody wrapper)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove redundant titles and add panelBody wrappers to Inventory, Stats, Crafting, CharacterActions</name>
  <files>
    src/components/InventoryPanel.vue
    src/components/StatsPanel.vue
    src/components/CraftingPanel.vue
    src/components/CharacterActionsPanel.vue
  </files>
  <action>
Each of these panels is already wrapped in `<div :style="styles.floatingPanelBody">` by App.vue. The internal component root should use `styles.panelBody` for consistent flex-column gap layout (matching HotbarPanel.vue and QuestPanel.vue patterns).

**InventoryPanel.vue:**
- REMOVE the redundant `<div :style="styles.panelSectionTitle">Inventory</div>` on line 3 (App.vue already shows "Inventory" in floatingPanelHeader)
- Change root `<div>` to `<div :style="styles.panelBody">`
- The "Backpack" panelSectionTitle on line 42 is a SECTION title (not panel title) -- KEEP it
- Everything else stays the same

**StatsPanel.vue:**
- Change root `<div>` to `<div :style="styles.panelBody">`
- The "Core", "Base Stats", "Derived" panelSectionTitle usages are SECTION titles -- KEEP them
- Everything else stays the same

**CraftingPanel.vue:**
- REMOVE the redundant `<div :style="styles.panelSectionTitle">Crafting</div>` on line 3 (App.vue already shows "Crafting" in floatingPanelHeader)
- Change root `<div>` to `<div :style="styles.panelBody">`
- Everything else stays the same

**CharacterActionsPanel.vue:**
- Change root `<div>` to `<div :style="styles.panelBody">`
- Replace `styles.panelForm` (grid layout) with card-style button rows: each button gets a wrapper div with the same card-style pattern used in HotbarPanel:
  ```
  display: 'flex', alignItems: 'center', gap: '0.5rem',
  padding: '0.35rem 0.5rem',
  background: 'rgba(255,255,255,0.03)',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.06)'
  ```
  But since these are just action buttons (not slot-number + dropdown combos), a simpler approach is better: change `panelForm` to a flex-column gap layout using `{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }` so buttons stack with consistent spacing. Use `styles.ghostButton` as-is for each button (they already look fine individually). The key improvement is the panelBody wrapper + removing the grid layout that makes buttons stretch weirdly.
  </action>
  <verify>
Run `npx vue-tsc --noEmit` to verify no TypeScript errors. Grep for `panelSectionTitle` in the 4 files -- InventoryPanel should only have "Backpack" usage, CraftingPanel should have zero, StatsPanel should have "Core"/"Base Stats"/"Derived", CharacterActionsPanel should have zero.
  </verify>
  <done>
4 panel components use panelBody root wrapper. InventoryPanel and CraftingPanel no longer render redundant panel-level titles. CharacterActionsPanel buttons use flex-column layout instead of grid.
  </done>
</task>

<task type="auto">
  <name>Task 2: Polish RenownPanel faction entries with consistent card styling</name>
  <files>src/components/RenownPanel.vue</files>
  <action>
RenownPanel already uses `styles.panelBody` (good), but its faction entries use raw inline style objects for margins, backgrounds, borders, and progress bars. Refactor to use consistent patterns:

1. Each faction entry: wrap in a card-style container matching the `resultCard` pattern from styles.ts:
   ```
   :style="styles.resultCard"
   ```
   This gives: `border: 1px solid rgba(255,255,255,0.12)`, `borderRadius: 12px`, `padding: 0.75rem 0.85rem`, `background: rgba(12,16,24,0.75)`, `flexDirection: column`, `gap: 0.45rem`.
   Remove the raw `{ marginBottom: '16px' }` style.

2. Faction name: replace `{ fontWeight: 600, marginBottom: '2px' }` with `styles.recipeName` (which is `{ fontWeight: 600, letterSpacing: '0.02em' }`) -- the gap from resultCard handles spacing.

3. Description: already uses `styles.subtleSmall` -- KEEP.

4. Rank display: replace `{ marginTop: '4px', color: row.rank.color }` with just `{ color: row.rank.color, fontWeight: 600, fontSize: '0.85rem' }` -- the card gap handles spacing.

5. Progress bar container: replace `{ margin: '4px 0', background: '#333', borderRadius: '3px', height: '6px', overflow: 'hidden' }` with a style closer to the hunger/xp bar patterns: `{ background: 'rgba(255,255,255,0.1)', borderRadius: '999px', height: '6px', overflow: 'hidden' }`. This matches the `hpBar` background pattern but at smaller height.

6. Progress bar fill: replace `{ height: '6px', borderRadius: '3px', ... }` with `{ height: '100%', borderRadius: '999px', background: row.rank.color, width: \`${row.progress}%\`, transition: 'width 0.3s ease' }`.

7. "Next rank" text: already uses `styles.subtleSmall` -- KEEP.

These changes eliminate all raw inline style objects in favor of either existing style constants or minimal overrides that follow established patterns.
  </action>
  <verify>
Run `npx vue-tsc --noEmit` to verify no TypeScript errors. Visually inspect that RenownPanel no longer has raw `#333` colors or pixel-based margins -- all should use rgba patterns and rem/gap-based spacing.
  </verify>
  <done>
RenownPanel faction entries render inside resultCard containers with consistent border-radius, backgrounds, and progress bar styling that matches the application's visual language. No raw hex backgrounds or pixel margins remain.
  </done>
</task>

</tasks>

<verification>
- `npx vue-tsc --noEmit` passes with no errors
- Grep `panelSectionTitle` in modified files shows only legitimate section titles (not panel-level titles that duplicate floatingPanelHeader)
- All 5 panel component root elements use `styles.panelBody` or equivalent flex-column gap wrapper
- No raw `#333` or pixel-based inline margin styles remain in RenownPanel
</verification>

<success_criteria>
All 7 target panels (Inventory, Stats, Crafting, Journal/NpcDialog, Quests, Renown, CharacterActions) use consistent structure: panelBody wrapper, no redundant titles, card-style containers for grouped content, and unified progress bar styling. QuestPanel and HotbarPanel were already consistent and needed no changes. NpcDialogPanel (Journal) was already clean. The 5 modified files produce a cohesive visual language across all floating panels.
</success_criteria>

<output>
After completion, create `.planning/quick/22-ui-consistency-pass-align-all-action-pan/22-SUMMARY.md`
</output>
