---
phase: quick-366
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/reducers/movement.ts
  - spacetimedb/src/reducers/commands.ts
  - src/components/NarrativeMessage.vue
autonomous: true
requirements: [Q366]
must_haves:
  truths:
    - "Travel shows a brief move message without the location description"
    - "After traveling, the full LOOK output appears as a separate event"
    - "LOOK output is visually distinct from surrounding narrative text"
  artifacts:
    - path: "spacetimedb/src/reducers/intent.ts"
      provides: "Travel messages without description duplication, auto-look after travel"
    - path: "spacetimedb/src/reducers/movement.ts"
      provides: "Travel messages without description, auto-look added"
    - path: "src/components/NarrativeMessage.vue"
      provides: "Visual styling for look events"
  key_links:
    - from: "spacetimedb/src/reducers/intent.ts"
      to: "buildLookOutput"
      via: "auto-look after travel"
      pattern: "buildLookOutput.*arrivedChar"
---

<objective>
Fix double description when traveling and improve LOOK formatting.

Currently, traveling shows "You travel to <location>. <description>" then immediately shows LOOK results which also contain the description. The fix: travel message says only "You travel to <location>." and lets the auto-look provide the full details. Additionally, LOOK output needs visual separation (border/spacing) so it doesn't blend into surrounding text.

Purpose: Eliminate redundant description text and make location information visually scannable.
Output: Clean travel->look flow with visually distinct location blocks.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/intent.ts (buildLookOutput + travel handlers at lines ~990, ~1210)
@spacetimedb/src/reducers/movement.ts (move_to reducer at line ~147)
@spacetimedb/src/reducers/commands.ts (legacy look handler at line ~258)
@src/components/NarrativeMessage.vue (event rendering)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove description from travel messages and ensure auto-look everywhere</name>
  <files>spacetimedb/src/reducers/intent.ts, spacetimedb/src/reducers/movement.ts, spacetimedb/src/reducers/commands.ts</files>
  <action>
    1. In `intent.ts` line ~995: Change travel message from:
       `You travel to ${matchedLocation.name}. ${matchedLocation.description}`
       to: `You travel to ${matchedLocation.name}.`
       The auto-look block immediately after (lines 1002-1008) already handles showing full location details.

    2. In `intent.ts` line ~1213: Same change for implicit travel:
       `You travel to ${implicitDest.name}. ${implicitDest.description}`
       to: `You travel to ${implicitDest.name}.`
       The auto-look block (lines 1220-1227) already handles the rest.

    3. In `movement.ts` line ~152: Same change:
       `You travel to ${location.name}. ${location.description}`
       to: `You travel to ${location.name}.`
       Then ADD auto-look after travel (this reducer currently lacks it). After `performPassiveSearch` call (line 157), add:
       ```typescript
       // Auto-look: show full location overview after travel
       const arrivedChar = ctx.db.character.id.find(charId);
       if (arrivedChar) {
         const lookParts = buildLookOutput(ctx, arrivedChar);
         if (lookParts.length > 0) {
           appendPrivateEvent(ctx, arrivedChar.id, arrivedChar.ownerUserId, 'look', lookParts.join('\n'));
         }
       }
       ```
       Import `buildLookOutput` from `./intent` at the top of movement.ts.

    4. In `commands.ts` line ~258-268: Update the legacy look handler to use `buildLookOutput` from intent.ts instead of the simplified `${location.name}: ${location.description}`. Import `buildLookOutput` from `./intent` and replace the body:
       ```typescript
       if (trimmed.toLowerCase() === '/look' || trimmed.toLowerCase() === 'look') {
         const lookParts = buildLookOutput(ctx, character);
         if (lookParts.length > 0) {
           appendPrivateEvent(ctx, character.id, requirePlayerUserId(ctx), 'look', lookParts.join('\n'));
         }
         return;
       }
       ```
  </action>
  <verify>
    <automated>cd C:/projects/uwr && grep -n "You travel to" spacetimedb/src/reducers/intent.ts spacetimedb/src/reducers/movement.ts | grep -v "description" | head -20</automated>
  </verify>
  <done>Travel messages show only "You travel to <name>." without description. All three travel paths (intent explicit, intent implicit, movement reducer) trigger auto-look after arrival. Legacy commands.ts look uses full buildLookOutput.</done>
</task>

<task type="auto">
  <name>Task 2: Add visual styling for LOOK events in NarrativeMessage</name>
  <files>src/components/NarrativeMessage.vue</files>
  <action>
    Add an `isLook` computed property:
    ```typescript
    const isLook = computed(() => props.event.kind === 'look');
    ```

    Update the template div's `:style` binding to give look events visual distinction:
    - `marginTop`: Add `isLook ? '8px'` to the ternary chain (before the default '0')
    - `marginBottom`: Add `isLook ? '8px'` case
    - `borderLeft`: Add `isLook ? '2px solid #c8ccd044'` to the ternary chain
    - `paddingLeft`: Add `isLook ? '10px'` to the ternary chain
    - `paddingTop`: Add `isLook ? '4px'` case
    - `paddingBottom`: Add `isLook ? '4px'` case
    - `background`: Add `isLook ? 'linear-gradient(90deg, rgba(200, 204, 208, 0.06) 0%, transparent 70%)'` case

    This gives look events a subtle left border and spacing to visually separate them from surrounding narrative, similar to how ripple/world events are styled but with the look color (#c8ccd0) instead of purple.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && grep -c "isLook" src/components/NarrativeMessage.vue</automated>
  </verify>
  <done>LOOK events render with left border accent, top/bottom margin spacing, and subtle background gradient making them visually distinct from surrounding text.</done>
</task>

</tasks>

<verification>
1. Publish to local SpacetimeDB: `spacetime publish uwr -p spacetimedb`
2. Travel to a location -- should see brief "You travel to X." message followed by visually-separated LOOK block with full details
3. Type "look" command -- should show same visually-separated location block
4. No double description anywhere in travel flow
</verification>

<success_criteria>
- Travel shows "You travel to X." (no description) followed by auto-look
- LOOK output is visually set apart with border/spacing/background
- All three travel code paths (intent explicit, intent implicit, movement reducer) produce consistent results
- Legacy commands.ts look uses full buildLookOutput
</success_criteria>

<output>
After completion, create `.planning/quick/366-fix-travel-look-double-description-and-i/366-SUMMARY.md`
</output>
