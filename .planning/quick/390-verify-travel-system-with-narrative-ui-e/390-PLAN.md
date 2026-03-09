---
phase: quick-390
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/travel.ts
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/reducers/movement.ts
  - src/components/TravelPanel.vue
  - src/App.vue
  - src/composables/usePanelManager.ts
  - src/components/ActionBar.vue
autonomous: true
requirements: [QUICK-390]
must_haves:
  truths:
    - "Narrative travel (go/travel commands) charges stamina costs identical to move_character reducer"
    - "Cross-region narrative travel enforces cooldown and shows narrative message when blocked"
    - "Legacy cross-region confirmation popup is removed from TravelPanel"
    - "TravelPanel no longer has modal overlay code"
  artifacts:
    - path: "spacetimedb/src/helpers/travel.ts"
      provides: "Shared performTravel helper with full movement logic"
    - path: "spacetimedb/src/reducers/intent.ts"
      provides: "Intent handler delegates to performTravel instead of inline move"
  key_links:
    - from: "spacetimedb/src/reducers/intent.ts"
      to: "spacetimedb/src/helpers/travel.ts"
      via: "import performTravel"
      pattern: "performTravel"
    - from: "spacetimedb/src/reducers/movement.ts"
      to: "spacetimedb/src/helpers/travel.ts"
      via: "import performTravel"
      pattern: "performTravel"
---

<objective>
Fix narrative travel (go/travel commands) to properly charge stamina costs and enforce cross-region cooldowns, then remove the legacy cross-region confirmation popup from TravelPanel.

Purpose: Currently the intent handler's travel code does a "minimal inline move" that skips stamina costs, cross-region cooldown checks, group travel, ensureSpawnsForLocation, world event auto-registration, and auto-join group combat. This means typing "go <place>" is free while clicking the button costs stamina. The legacy cross-region popup in TravelPanel is also no longer needed since travel enforcement now happens server-side with narrative messages.

Output: Shared travel helper, fixed intent handler, cleaned TravelPanel
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/movement.ts (full move_character reducer with proper costs)
@spacetimedb/src/reducers/intent.ts (intent handler with inline travel at ~line 1178 and ~line 1394)
@spacetimedb/src/data/travel_config.ts (TRAVEL_CONFIG constants)
@src/components/TravelPanel.vue (has legacy cross-region popup overlay)
@src/App.vue (imports TravelPanel, has travelPanel FloatingPanel)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract shared performTravel helper and wire into both reducers</name>
  <files>spacetimedb/src/helpers/travel.ts, spacetimedb/src/reducers/intent.ts, spacetimedb/src/reducers/movement.ts</files>
  <action>
1. Create `spacetimedb/src/helpers/travel.ts` with a `performTravel(ctx, deps, character, targetLocationId)` function that contains the full movement logic currently in `move_character` reducer (movement.ts lines 27-278). The function should:
   - Validate location exists, not same location, not in combat, not gathering
   - Check areLocationsConnected
   - Determine cross-region status and stamina cost from TRAVEL_CONFIG
   - Handle group travel (effectiveGroupId, isGroupLeaderOrSolo, collect followers)
   - Validate ALL-OR-NOTHING stamina for all travelers (including racial cost modifiers, ability discounts)
   - Check cross-region cooldown for all travelers, return narrative message with remaining seconds if blocked
   - Deduct stamina and apply cooldowns (with perk-based cooldown reduction)
   - Execute movement for each character (update location, emit move events, ensureSpawnsForLocation, performPassiveSearch, auto-look via buildLookOutput, world event auto-registration, auto-join group combat)
   - Handle uncharted location world generation trigger
   - Use `deps.appendSystemMessage(ctx, character, msg)` for error messages (via the `fail` pattern)
   - Return a boolean or void (errors handled via fail/appendSystemMessage internally)

   The `deps` parameter should expect these keys (all available in the shared deps object):
   `appendSystemMessage`, `appendPrivateEvent`, `appendLocationEvent`, `appendGroupEvent`, `areLocationsConnected`, `activeCombatIdForCharacter`, `ensureSpawnsForLocation`, `isGroupLeaderOrSolo`, `effectiveGroupId`, `getEquippedWeaponStats`

   Import `TRAVEL_CONFIG` from `../data/travel_config`, `performPassiveSearch` from `./search`, `getPerkBonusByField` from `./renown`, `buildLookOutput` from `../reducers/intent`.

2. Update `spacetimedb/src/reducers/movement.ts`:
   - Import `performTravel` from `../helpers/travel`
   - Replace the body of `move_character` reducer with a call to `performTravel(ctx, deps, character, args.locationId)` (keep the player lastActivityAt update before it)
   - The deps object passed should include all the keys performTravel needs (they're already destructured from deps in registerMovementReducers)

3. Update `spacetimedb/src/reducers/intent.ts`:
   - Import `performTravel` from `../helpers/travel`
   - Add `ensureSpawnsForLocation`, `isGroupLeaderOrSolo`, `effectiveGroupId`, `appendGroupEvent`, `getEquippedWeaponStats` to the destructured deps (they're available in the shared deps object)
   - Replace BOTH inline travel blocks:
     a. The "go <place>" / "travel <place>" block (~lines 1178-1217): after resolving matchedLocation, call `performTravel(ctx, intentDeps, character, matchedLocation.id)` where intentDeps includes all required deps keys. Remove the inline move code (ctx.db.character.id.update, appendPrivateEvent, appendLocationEvent, performPassiveSearch, auto-look, world-gen trigger).
     b. The "IMPLICIT TRAVEL: bare location name match" block (~lines 1394-1429): same replacement — call performTravel instead of inline move. Remove the combat check too since performTravel handles it.
   - Keep the location name resolution logic (finding matchedLocation/implicitDest from connections) — only replace the actual movement execution.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>Both narrative travel paths and move_character reducer use the same performTravel helper. Stamina costs, cross-region cooldown, group travel, spawns, and world-gen triggers all work identically regardless of whether player types "go place" or clicks the travel button.</done>
</task>

<task type="auto">
  <name>Task 2: Remove legacy cross-region popup from TravelPanel and clean up unused code</name>
  <files>src/components/TravelPanel.vue, src/App.vue, src/composables/usePanelManager.ts, src/components/ActionBar.vue</files>
  <action>
1. In `src/components/TravelPanel.vue`:
   - Remove the entire cross-region confirmation dialog overlay (template lines 3-28: the `v-if="pendingCrossRegionMove"` block with overlayStyle, dialogStyle, etc.)
   - Remove the `pendingCrossRegionMove` ref and its type
   - Remove the `handleTravelClick` function — change the button @click to directly `emit('move', entry.location.id)` for ALL destinations (no more cross-region gating)
   - Remove `confirmCrossRegionTravel` and `cancelCrossRegionTravel` functions
   - Remove ALL dialog style objects: `overlayStyle`, `dialogStyle`, `dialogTitleStyle`, `dialogBodyStyle`, `dialogTextStyle`, `dialogNarrativeStyle`, `dialogCostStyle`, `dialogButtonRowStyle`, `dialogCancelButtonStyle`, `dialogConfirmButtonStyle`
   - Keep the button disabled logic for cooldown and stamina (the server will reject anyway, but client-side feedback is good UX)
   - Keep the cooldown countdown display text

2. In `src/App.vue`:
   - Remove the `travelPanel` FloatingPanel block (lines ~208-211) since TravelPanel is a legacy duplicate of the `travel` panel with LocationGrid
   - Remove the `import TravelPanel from './components/TravelPanel.vue'` line
   - Remove the keyboard shortcut 't'/'T' that toggles 'travelPanel' (~line 2657)

3. In `src/composables/usePanelManager.ts`:
   - Remove `'travelPanel'` from the panel IDs array (line 7)

4. In `src/components/ActionBar.vue`:
   - Remove the button that toggles `travelPanel` (lines ~56-58)
   - Remove `'travelPanel'` from the toggle emit type union (line ~97)

NOTE: Do NOT delete TravelPanel.vue file itself yet — it may still be useful for future reference or if someone wants a dedicated travel panel. Just remove the popup code and the App.vue integration of the duplicate panel.

Actually, on second thought: since TravelPanel.vue is no longer imported or used anywhere after removing from App.vue, DO delete it entirely. The `travel` FloatingPanel with LocationGrid already provides travel functionality. Keeping dead code is worse than removing it.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>Legacy TravelPanel.vue deleted. Cross-region popup gone. No travelPanel references remain in App.vue, ActionBar, or usePanelManager. The travel FloatingPanel with LocationGrid remains as the sole travel UI.</done>
</task>

</tasks>

<verification>
1. `cd spacetimedb && npx tsc --noEmit` — server compiles without errors
2. `cd client && npx vue-tsc --noEmit` — client compiles without errors
3. Grep confirms no remaining inline `ctx.db.character.id.update({ ...character, locationId:` in intent.ts travel blocks
4. Grep confirms no `pendingCrossRegionMove` or `overlayStyle` in any Vue file
5. Grep confirms no `travelPanel` references in App.vue, ActionBar.vue, or usePanelManager.ts
</verification>

<success_criteria>
- Typing "go <place>" in narrative costs stamina and enforces cross-region cooldown (same as move_character reducer)
- Cross-region travel blocked by cooldown shows narrative message with remaining time
- Group leader travel via narrative pulls followers (same as button-based travel)
- No legacy cross-region confirmation popup exists anywhere
- TravelPanel.vue deleted, all references cleaned up
- Both server and client compile cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/390-verify-travel-system-with-narrative-ui-e/390-SUMMARY.md`
</output>
