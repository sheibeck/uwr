---
phase: quick-46
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/index.ts
  - src/composables/useGameData.ts
  - src/App.vue
  - src/composables/useFriends.ts
  - src/composables/useGroups.ts
  - src/composables/useEvents.ts
autonomous: true
must_haves:
  truths:
    - "All remaining private tables that had views are now public"
    - "Client subscribes directly to public tables instead of views"
    - "Client-side filtering replicates the per-user scoping that views provided"
    - "Module publishes and bindings regenerate without errors"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "12 tables changed from private to public true"
      contains: "public: true"
    - path: "src/composables/useGameData.ts"
      provides: "Direct table subscriptions replacing all view subscriptions"
    - path: "src/App.vue"
      provides: "Client-side filtering computeds for user-scoped data"
  key_links:
    - from: "src/composables/useGameData.ts"
      to: "src/module_bindings"
      via: "useTable direct table subscriptions instead of view subscriptions"
      pattern: "tables.friendRequest"
---

<objective>
Convert all remaining SpacetimeDB views to public tables with client-side filtering.

Purpose: SpacetimeDB views have known reactivity issues - they fail to re-evaluate reliably when data changes, causing data to not appear on client. This has been confirmed and fixed 3 times already (quick-35: CombatLoot, quick-42: CharacterEffect, quick-44: NpcDialog). There are 12 more views still active that will exhibit the same issue. Convert them all proactively.

Output: All tables public, all view subscriptions replaced with direct table subscriptions, client-side filtering replicates per-user scoping.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/index.ts
@spacetimedb/src/views/
@src/composables/useGameData.ts
@src/composables/useFriends.ts
@src/composables/useGroups.ts
@src/composables/useEvents.ts
@src/App.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make all remaining private tables public and update client subscriptions</name>
  <files>
    spacetimedb/src/index.ts
    src/composables/useGameData.ts
  </files>
  <action>
**Server-side: Add `public: true` to 12 table definitions in `spacetimedb/src/index.ts`:**

The following tables are currently private (no `public: true`) but have views wrapping them. Add `public: true` to each table's options object:

1. **FriendRequest** (~line 70) - add `public: true` to options object
2. **Friend** (~line 86) - add `public: true` to options object
3. **QuestInstance** (~line 206) - add `public: true` to options object
4. **GroupMember** (~line 573) - add `public: true` to options object
5. **GroupInvite** (~line 592) - add `public: true` to options object
6. **CombatResult** (~line 983) - add `public: true` to options object
7. **EventLocation** (~line 1152) - add `public: true` to options object
8. **EventPrivate** (~line 1167) - add `public: true` to options object
9. **EventGroup** (~line 1185) - add `public: true` to options object
10. **Hunger** (~line 1219) - add `public: true` to options object
11. **FactionStanding** (~line 1244) - add `public: true` to options object
12. **UiPanelLayout** (~line 1259) - add `public: true` to options object

Note: The Player table is already public. Keep the `my_player` view as-is because it filters by ctx.sender (identity) which cannot be replicated by userId alone on the client.

**Client-side: Update all view subscriptions to direct table subscriptions in `src/composables/useGameData.ts`:**

Replace these `useTable` calls (keep variable names and return property names the same):
- Line 9: `useTable(tables.myFriendRequests)` -> `useTable(tables.friendRequest)`
- Line 10: `useTable(tables.myFriends)` -> `useTable(tables.friend)`
- Line 11: `useTable(tables.myGroupInvites)` -> `useTable(tables.groupInvite)`
- Line 40: `useTable(tables.myCombatResults)` -> `useTable(tables.combatResult)`
- Line 48: `useTable(tables.myLocationEvents)` -> `useTable(tables.eventLocation)`
- Line 49: `useTable(tables.myPrivateEvents)` -> `useTable(tables.eventPrivate)`
- Line 50: `useTable(tables.myGroupEvents)` -> `useTable(tables.eventGroup)`
- Line 51: `useTable(tables.myGroupMembers)` -> `useTable(tables.groupMember)`
- Line 54: `useTable(tables.myQuests)` -> `useTable(tables.questInstance)`
- Line 59: `useTable(tables.myHunger)` -> `useTable(tables.hunger)`
- Line 61: `useTable(tables.myFactionStandings)` -> `useTable(tables.factionStanding)`
- Line 62: `useTable(tables.myPanelLayout)` -> `useTable(tables.uiPanelLayout)`
  </action>
  <verify>
    Grep for `tables.my` in useGameData.ts. Only `tables.myPlayer` should remain (1 occurrence). All other my* references replaced with direct table names.
  </verify>
  <done>12 tables have `public: true` in schema. 12 view subscriptions replaced with direct table subscriptions in useGameData.ts. Only `myPlayer` view subscription remains.</done>
</task>

<task type="auto">
  <name>Task 2: Add client-side filtering for all converted tables</name>
  <files>
    src/App.vue
  </files>
  <action>
Now that the client receives ALL rows from each public table (not just the user's rows), we need client-side filtering. The views filtered by ctx.sender -> player -> userId or activeCharacterId. The client equivalent uses the `userId` ref and `selectedCharacter` ref.

**Key insight:** Some composables already filter internally:
- `useFriends.ts` already filters friendRequests and friends by userId - NO CHANGES NEEDED
- `useGroups.ts` already filters groupInvites by selectedCharacter.id - NO CHANGES NEEDED
- `useEvents.ts` just combines whatever events are passed to it - filtering happens before passing

**Add these computed properties in App.vue** (near existing `relevantEffects` and `characterNpcDialogs` computeds around line 810-828):

```typescript
// Filter group members to current user's groups only
const userGroupMembers = computed(() => {
  if (userId.value == null) return [];
  return groupMemberRows.value.filter(
    (row: any) => row.ownerUserId === userId.value
  );
});

// Filter combat results to current user
const userCombatResults = computed(() => {
  if (userId.value == null) return [];
  return combatResults.value.filter(
    (row: any) => row.ownerUserId === userId.value
  );
});

// Filter private events to current user
const userPrivateEvents = computed(() => {
  if (userId.value == null) return [];
  return privateEvents.value.filter(
    (row: any) => row.ownerUserId === userId.value
  );
});

// Filter location events to current character's location
const userLocationEvents = computed(() => {
  if (!selectedCharacter.value) return [];
  const locId = selectedCharacter.value.locationId;
  return locationEvents.value.filter(
    (row: any) => row.locationId === locId &&
      (!row.excludeCharacterId || row.excludeCharacterId !== selectedCharacter.value!.id)
  );
});

// Filter group events to current user's groups
const userGroupEvents = computed(() => {
  if (userId.value == null) return [];
  const myGroupIds = new Set(
    userGroupMembers.value.map((m: any) => m.groupId.toString())
  );
  return groupEvents.value.filter(
    (row: any) => myGroupIds.has(row.groupId.toString())
  );
});

// Filter quest instances to current character
const characterQuests = computed(() => {
  if (!selectedCharacter.value) return [];
  return questInstances.value.filter(
    (row: any) => row.characterId.toString() === selectedCharacter.value!.id.toString()
  );
});

// Filter faction standings to current character
const characterFactionStandings = computed(() => {
  if (!selectedCharacter.value) return [];
  return factionStandings.value.filter(
    (row: any) => row.characterId.toString() === selectedCharacter.value!.id.toString()
  );
});

// Filter panel layouts to current character
const characterPanelLayouts = computed(() => {
  if (!selectedCharacter.value) return [];
  return panelLayouts.value.filter(
    (row: any) => row.characterId.toString() === selectedCharacter.value!.id.toString()
  );
});
```

**Then update all downstream references to use filtered versions:**
- Where `groupMemberRows` is passed to composables, use `userGroupMembers`
- Where `combatResults` is passed to useCombat, use `userCombatResults`
- Where `locationEvents` is passed to useEvents, use `userLocationEvents`
- Where `privateEvents` is passed to useEvents, use `userPrivateEvents`
- Where `groupEvents` is passed to useEvents, use `userGroupEvents`
- Where `questInstances` appears in template (QuestPanel prop), use `characterQuests`
- Where `factionStandings` appears in template (RenownPanel prop), use `characterFactionStandings`
- Where `panelLayouts` is passed to usePanelManager serverSync, use `characterPanelLayouts`
- `myHunger` (now `hunger` from all characters) - the existing `activeHunger` computed already filters by selectedCharacter.id, so it handles scoping correctly. No additional filter needed.

**The raw variables from useGameData destructuring still exist** (needed as data source for the computeds), but must NOT be passed directly to components or composables.
  </action>
  <verify>
    1. Search App.vue for `userGroupMembers`, `userCombatResults`, `userPrivateEvents`, `userLocationEvents`, `userGroupEvents`, `characterQuests`, `characterFactionStandings`, `characterPanelLayouts` - all should exist as computed properties.
    2. Verify no raw unfiltered variables are passed to components/composables (except as sources for computed filters).
  </verify>
  <done>All 12 converted tables have client-side filtering that replicates the per-user scoping previously handled by views. Downstream components receive only user-relevant data.</done>
</task>

<task type="auto">
  <name>Task 3: Publish module, regenerate bindings, and verify</name>
  <files>
    src/module_bindings/
  </files>
  <action>
1. Publish the module: `spacetime publish uwr --project-path spacetimedb`. If migration fails, try without --clear-database first. Only use `--clear-database -y` as last resort.

2. Regenerate client bindings: `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb`

3. Verify no TypeScript errors from the subscription changes. The generated binding table names should match the new direct table subscriptions (e.g., `tables.friendRequest`, `tables.friend`, etc.).

4. Check `spacetime logs uwr` for any errors.

5. The view files in `spacetimedb/src/views/` remain as-is. Views still exist on the server but clients no longer subscribe to them. They are dead code but harmless. Removing them is a separate cleanup task.
  </action>
  <verify>
    - `spacetime publish` succeeds
    - `spacetime generate` succeeds
    - `spacetime logs uwr` shows no panics or errors related to table access
    - Client can connect and load data from the new public tables
  </verify>
  <done>Module published with all 12 tables now public. Client bindings regenerated. No compilation or runtime errors. Views are bypassed.</done>
</task>

</tasks>

<verification>
1. All 12 previously-private tables now have `public: true` in schema
2. Client subscribes to 12 direct tables instead of 12 views (only `myPlayer` view remains)
3. Client-side computed properties filter data to match previous view scoping
4. Module publishes and client connects without errors
5. Functionality is preserved: user sees only their own data in the UI
</verification>

<success_criteria>
- 12 tables converted from private to public
- 12 view subscriptions replaced with direct table subscriptions
- Client-side filtering added for all converted tables
- Module published and bindings regenerated successfully
- No data leaks: users only see their own data in the UI (filtering is client-side but correct)
</success_criteria>

<output>
After completion, create `.planning/quick/46-proactively-fix-remaining-spacetimedb-vi/46-SUMMARY.md`
</output>
