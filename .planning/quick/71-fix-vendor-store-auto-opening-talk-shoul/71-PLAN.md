---
phase: quick-71
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "Clicking 'Talk' on a vendor NPC shows dialog text but does NOT open the vendor store panel"
    - "Clicking 'Open Store' on a vendor NPC opens the vendor store panel (and optionally shows dialog)"
    - "Typing /hail on a vendor NPC shows dialog text but does NOT open the vendor store panel"
  artifacts:
    - path: "src/App.vue"
      provides: "hailNpc function without vendor auto-open, onNpcHail without vendor auto-open"
  key_links:
    - from: "src/components/LocationGrid.vue"
      to: "src/App.vue"
      via: "@open-vendor event -> openVendor function"
      pattern: "openVendor"
---

<objective>
Fix vendor store auto-opening when talking to vendor NPCs.

Purpose: Currently, the "Talk" context menu option on vendor NPCs (and the /hail command) automatically opens the vendor store panel. Only the "Open Store" context menu option should open the store. "Talk" should only trigger the NPC dialog.

Output: Modified App.vue with vendor auto-open removed from hailNpc and onNpcHail.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.vue
@src/components/LocationGrid.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove vendor auto-open from Talk and /hail paths</name>
  <files>src/App.vue</files>
  <action>
In src/App.vue, make two targeted changes:

1. **Remove vendor auto-open from `hailNpc` function (around line 1105-1112):**
   Remove the `if (npc?.npcType === 'vendor') { openVendor(npc.id); }` block from the `hailNpc` function. The function should simply call the `hailNpcReducer` without any vendor panel logic. The resulting function should be:
   ```
   const hailNpc = (npcName: string) => {
     if (!selectedCharacter.value) return;
     hailNpcReducer({ characterId: selectedCharacter.value.id, npcName });
   };
   ```

2. **Remove vendor auto-open from `onNpcHail` callback (around line 1043-1048):**
   In the `useCommands` options object, simplify the `onNpcHail` callback to remove the vendor panel logic. Since the only thing it did was open the vendor panel for vendor NPCs, it can become a no-op or be removed entirely. If `onNpcHail` is a required parameter, make it an empty function: `onNpcHail: () => {}`. If it is optional, remove the property.

Do NOT modify LocationGrid.vue. The "Open Store" context menu option in LocationGrid.vue correctly emits both 'hail' (for dialog) and 'open-vendor' (for store panel) -- this is the intended behavior for that option. With the hailNpc fix above, the 'hail' emission will no longer auto-open the store, and the separate 'open-vendor' emission will handle store opening via the existing `openVendor` handler.
  </action>
  <verify>
1. Read the modified hailNpc function and confirm it has no vendor/store logic
2. Read the modified onNpcHail callback and confirm it has no vendor/store logic
3. Run `npm run build --prefix C:\projects\uwr` to confirm no TypeScript errors
  </verify>
  <done>
- hailNpc function only calls hailNpcReducer (no openVendor call)
- onNpcHail callback has no vendor panel opening logic
- "Open Store" context menu path still works (emits open-vendor which calls openVendor in App.vue)
- Build succeeds with no errors
  </done>
</task>

</tasks>

<verification>
- Build passes: `npm run build --prefix C:\projects\uwr`
- Code review: hailNpc has no openVendor or openPanel('vendor') calls
- Code review: onNpcHail has no openPanel('vendor') or activeVendorId assignment
- The openVendor function (line ~1077) remains unchanged for the "Open Store" path
</verification>

<success_criteria>
Talking to a vendor NPC (via "Talk" context menu or /hail command) triggers only dialog -- the vendor store panel does NOT auto-open. The "Open Store" context menu option remains the sole way to open the vendor panel.
</success_criteria>

<output>
After completion, create `.planning/quick/71-fix-vendor-store-auto-opening-talk-shoul/71-SUMMARY.md`
</output>
