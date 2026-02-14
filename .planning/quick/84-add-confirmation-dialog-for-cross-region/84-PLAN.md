---
phase: quick-84
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/TravelPanel.vue
autonomous: true

must_haves:
  truths:
    - "Clicking a cross-region travel button shows a confirmation dialog before traveling"
    - "The dialog contains narrative text explaining the journey will exhaust the character and they must rest before another expedition"
    - "Confirming the dialog triggers the move; canceling does not"
    - "Within-region travel buttons still move immediately without any dialog"
  artifacts:
    - path: "src/components/TravelPanel.vue"
      provides: "Confirmation dialog for cross-region travel"
      contains: "pendingCrossRegionMove"
  key_links:
    - from: "TravelPanel.vue cross-region button click"
      to: "$emit('move', locationId)"
      via: "confirmation dialog confirm action"
      pattern: "pendingCrossRegionMove"
---

<objective>
Add a styled in-game confirmation dialog that appears when a player clicks a cross-region travel destination. The dialog presents narrative text warning that the journey will exhaust the character and impose a rest period (cooldown) before another cross-region expedition. Within-region travel remains instant with no dialog.

Purpose: Give cross-region travel a sense of weight and prevent accidental costly moves.
Output: Updated TravelPanel.vue with integrated confirmation overlay.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/TravelPanel.vue
@src/ui/styles.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add cross-region confirmation dialog to TravelPanel</name>
  <files>src/components/TravelPanel.vue</files>
  <action>
Modify TravelPanel.vue to add a confirmation dialog for cross-region travel:

1. Add reactive state for the pending cross-region move:
   - `pendingCrossRegionMove` ref: `null | { locationId: bigint; locationName: string; regionName: string; staminaCost: number }` -- stores the destination info when a cross-region button is clicked, null when no dialog is showing.

2. Modify the Go button `@click` handler:
   - For cross-region entries (`entry.isCrossRegion`): instead of `$emit('move', entry.location.id)`, call a `handleTravelClick(entry)` function that sets `pendingCrossRegionMove` with the destination details.
   - For within-region entries: continue to `$emit('move', entry.location.id)` directly (no dialog).

3. Add `handleTravelClick(entry)` function in script setup:
   - If `entry.isCrossRegion`, set `pendingCrossRegionMove` to `{ locationId: entry.location.id, locationName: entry.location.name, regionName: entry.regionName, staminaCost: entry.staminaCost }`.
   - If not cross-region, emit move directly.

4. Add `confirmCrossRegionTravel()` function: emits `'move'` with `pendingCrossRegionMove.value.locationId`, then sets `pendingCrossRegionMove` back to null.

5. Add `cancelCrossRegionTravel()` function: sets `pendingCrossRegionMove` back to null.

6. Add the dialog overlay in the template. Place it BEFORE the existing content as a sibling, using `v-if="pendingCrossRegionMove"`. Structure:

```html
<div v-if="pendingCrossRegionMove" :style="overlayStyle">
  <div :style="dialogStyle">
    <div :style="dialogTitleStyle">Cross-Region Expedition</div>
    <div :style="dialogBodyStyle">
      <p :style="dialogTextStyle">
        You are about to embark on a long journey to
        <span :style="{ color: '#d4a574', fontWeight: 'bold' }">{{ pendingCrossRegionMove.locationName }}</span>
        in the
        <span :style="{ color: '#d4a574', fontWeight: 'bold' }">{{ pendingCrossRegionMove.regionName }}</span>
        region.
      </p>
      <p :style="dialogNarrativeStyle">
        The road ahead is arduous. Such an expedition will exhaust your character,
        and they must rest before undertaking another journey of this magnitude.
      </p>
      <p :style="dialogCostStyle">
        Cost: {{ pendingCrossRegionMove.staminaCost }} stamina + 5 minute cooldown
      </p>
    </div>
    <div :style="dialogButtonRowStyle">
      <button :style="dialogCancelButtonStyle" @click="cancelCrossRegionTravel">Turn Back</button>
      <button :style="dialogConfirmButtonStyle" @click="confirmCrossRegionTravel">Set Forth</button>
    </div>
  </div>
</div>
```

7. Define inline style objects as computed or const objects in the script setup. Use the existing dark theme palette from styles.ts (background: #141821, borders: rgba(255,255,255,0.12), accent: #d4a574 amber/gold). Specific styles:

   - `overlayStyle`: position fixed, inset 0, background rgba(0,0,0,0.6), display flex, justifyContent center, alignItems center, zIndex 9000 (below loadingOverlay 9999 but above everything else).
   - `dialogStyle`: background #141821, border 1px solid rgba(255,255,255,0.15), borderRadius 14px, padding 1.5rem, maxWidth 420px, width 90vw, boxShadow '0 14px 32px rgba(0,0,0,0.6)'.
   - `dialogTitleStyle`: fontSize 1.1rem, fontWeight bold, color #e6e8ef, marginBottom 1rem, textAlign center, letterSpacing 0.05em, textTransform uppercase.
   - `dialogBodyStyle`: marginBottom 1.2rem.
   - `dialogTextStyle`: fontSize 0.9rem, color #c8cad0, lineHeight 1.5, marginBottom 0.6rem.
   - `dialogNarrativeStyle`: fontSize 0.85rem, color rgba(212, 165, 116, 0.85), lineHeight 1.5, fontStyle italic, marginBottom 0.8rem.
   - `dialogCostStyle`: fontSize 0.8rem, color rgba(255,255,255,0.5), textAlign center.
   - `dialogButtonRowStyle`: display flex, gap 0.75rem, justifyContent center.
   - `dialogCancelButtonStyle`: padding '0.5rem 1.2rem', background 'transparent', border '1px solid rgba(255,255,255,0.2)', borderRadius 8px, color '#a0a3ab', cursor 'pointer', fontSize '0.85rem'.
   - `dialogConfirmButtonStyle`: padding '0.5rem 1.2rem', background 'rgba(212, 165, 116, 0.15)', border '1px solid rgba(212, 165, 116, 0.4)', borderRadius 8px, color '#d4a574', cursor 'pointer', fontSize '0.85rem', fontWeight 'bold'.

Important: The dialog is self-contained within TravelPanel.vue. The overlay uses position: fixed so it covers the whole viewport even though TravelPanel is inside a scrollable panel. Do NOT create a separate component file -- keep it inline in TravelPanel.vue for simplicity.
  </action>
  <verify>
    Run `npx vue-tsc --noEmit` from the project root to confirm no type errors. Visually verify by reading the template to confirm: within-region buttons still call `$emit('move')` directly, cross-region buttons call `handleTravelClick`, and the dialog emits move only on confirm.
  </verify>
  <done>
    - Cross-region travel button click shows a styled confirmation dialog with narrative text
    - Dialog displays destination name, region name, stamina cost, and cooldown warning
    - "Set Forth" button triggers the move and closes the dialog
    - "Turn Back" button closes the dialog without moving
    - Within-region travel buttons continue to work immediately without any dialog
  </done>
</task>

</tasks>

<verification>
- Cross-region Go button click opens confirmation dialog (does NOT immediately move)
- Dialog shows destination name, region name, cost info, and narrative text about exhaustion
- Confirming dialog triggers character movement to the destination
- Canceling dialog returns to normal travel view with no movement
- Within-region Go buttons still move immediately with no dialog
- No TypeScript errors
</verification>

<success_criteria>
Cross-region travel destinations show a narrative confirmation dialog before moving. Within-region travel remains instant.
</success_criteria>

<output>
After completion, create `.planning/quick/84-add-confirmation-dialog-for-cross-region/84-SUMMARY.md`
</output>
