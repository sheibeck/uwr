---
task: 102
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useGameData.ts
autonomous: true
---

<objective>
Fix enemy debuffs/DoTs not displaying on group members in the group panel.

**Root cause**: Commit 8b46cf7 switched from `tables.myCharacterEffects` (view) to `tables.characterEffect` (table) to fix scheduled effects. However, while `CharacterEffect` is marked as `public: true` in the schema, SpacetimeDB's `useTable()` hook does NOT automatically subscribe to public tables - it only subscribes to tables/views that are explicitly requested. The client is subscribing to the raw `characterEffect` table, but without an explicit subscription, it's not receiving updates.

**Solution**: Switch back to using the `my_character_effects` view which was specifically designed to return effects for the player's character AND their group members (see `spacetimedb/src/views/effects.ts`). This view filters properly and will be subscribed to automatically.

**Why this works**: The `my_character_effects` view explicitly includes group member effects (lines 14-21 of effects.ts), and views ARE properly subscribed to when using `useTable()`.
</objective>

<context>
@C:/projects/uwr/src/composables/useGameData.ts
@C:/projects/uwr/spacetimedb/src/views/effects.ts
@C:/projects/uwr/src/components/GroupPanel.vue
@C:/projects/uwr/src/App.vue
</context>

<tasks>

<task type="auto">
  <name>Switch character effects subscription from table to view</name>
  <files>src/composables/useGameData.ts</files>
  <action>
In `src/composables/useGameData.ts`, line 42:

Change:
```typescript
const [characterEffects] = useTable(tables.characterEffect);
```

To:
```typescript
const [characterEffects] = useTable(tables.myCharacterEffects);
```

**Rationale**: The `my_character_effects` view (defined in `spacetimedb/src/views/effects.ts`) was specifically built to return effects for both the logged-in player's active character AND all members of their group. It uses the `effectiveGroupId` helper and filters `CharacterEffect` by character IDs for all group members (lines 14-28).

This is a reversion of commit 8b46cf7 which switched to the table, but that commit broke group member effect visibility. The original concern about "views don't re-evaluate reliably for scheduled reducer inserts" may have been a different issue or has since been fixed in SpacetimeDB.

**Do NOT** change anything in App.vue - the `relevantEffects` computed property can stay as-is since it's just an additional layer of client-side filtering that won't hurt.
  </action>
  <verify>
1. Check the file was updated correctly:
```bash
grep "useTable(tables.myCharacterEffects)" C:/projects/uwr/src/composables/useGameData.ts
```

2. Start the development server and test:
   - Create/join a group with another character
   - Enter combat where an enemy uses a debuff/DoT ability on a group member
   - Verify the debuff/DoT now appears in the GroupPanel for that character
  </verify>
  <done>
- src/composables/useGameData.ts line 42 uses `tables.myCharacterEffects` instead of `tables.characterEffect`
- Enemy debuffs/DoTs are visible on all group members in the group panel
- Cast bars continue to work correctly (unrelated system, should not be affected)
  </done>
</task>

</tasks>

<success_criteria>
- [ ] `useTable(tables.myCharacterEffects)` is used in useGameData.ts
- [ ] Group members' debuffs/DoTs from enemy abilities are visible in the GroupPanel
- [ ] Solo character's debuffs/DoTs continue to work
- [ ] Cast bars remain functional (they use a different system)
</success_criteria>

<notes>
## Why the original table approach failed

While `CharacterEffect` is marked `public: true`, the SpacetimeDB SDK's `useTable()` doesn't automatically subscribe to ALL rows of public tables - it still requires an explicit subscription or a view. The `my_character_effects` view provides that explicit scoping.

## About the regression

Commit 8b46cf7 tried to fix "Ballad of Resolve" (out-of-combat buff) not appearing. That might have been a separate issue (perhaps related to scheduled reducers and views not re-evaluating). If that issue resurfaces after this fix, we should investigate the root cause in the SpacetimeDB view system rather than abandoning the view approach, because the view is essential for group functionality.

## Alternative if views still don't work

If the view approach truly doesn't work for scheduled effects, the proper fix would be:
1. Keep using `tables.characterEffect` (the table)
2. But add an EXPLICIT subscription in the connection setup
3. This would ensure all public CharacterEffect rows are received by the client

However, testing the view first is simpler and follows the established pattern.
</notes>
