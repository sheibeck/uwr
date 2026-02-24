---
phase: quick-310
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useGameData.ts
  - src/stdb-types.ts
autonomous: true
requirements: [Q310-01, Q310-02]

must_haves:
  truths:
    - "useGameData returns populated reactive arrays for all subscribed tables"
    - "No runtime crash from passing undefined to useTable"
    - "stdb-types.ts accurately describes its purpose as a disambiguation barrel, not v1 compat"
  artifacts:
    - path: "src/composables/useGameData.ts"
      provides: "All table subscriptions using correct v2 camelCase keys"
      contains: "tables.player"
    - path: "src/stdb-types.ts"
      provides: "Row suffix type aliases for namespace disambiguation"
      contains: "disambiguation"
  key_links:
    - from: "src/composables/useGameData.ts"
      to: "src/module_bindings/index.ts"
      via: "tables object property access"
      pattern: "tables\\.(player|character|abilityTemplate)"
---

<objective>
Fix useTable crash by converting all PascalCase table accesses to v2 camelCase keys, and update stdb-types.ts comment to reflect its actual purpose as a disambiguation barrel (not v1 compat shim).

Purpose: The app crashes on load because `tables.Player` is undefined in v2 bindings (v2 exports `tables.player`). The stdb-types.ts file comment is misleading — it says "v1 compatibility" but actually provides useful Row suffix aliases to avoid namespace collisions (e.g., `Location` vs `window.Location`).

Output: Working client that loads without useTable crashes; accurate stdb-types.ts comment.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/useGameData.ts
@src/stdb-types.ts
@src/module_bindings/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix all PascalCase table accesses to camelCase in useGameData.ts</name>
  <files>src/composables/useGameData.ts</files>
  <action>
Change every `tables.XxxYyy` reference to match the v2 generated camelCase keys from `module_bindings/index.ts`. The complete mapping (PascalCase -> camelCase):

- `tables.Player` -> `tables.player`
- `tables.User` -> `tables.user`
- `tables.FriendRequest` -> `tables.friendRequest`
- `tables.Friend` -> `tables.friend`
- `tables.GroupInvite` -> `tables.groupInvite`
- `tables.Character` -> `tables.character`
- `tables.Region` -> `tables.region`
- `tables.LocationConnection` -> `tables.locationConnection`
- `tables.ItemTemplate` -> `tables.itemTemplate`
- `tables.ItemInstance` -> `tables.itemInstance`
- `tables.RecipeTemplate` -> `tables.recipeTemplate`
- `tables.RecipeDiscovered` -> `tables.recipeDiscovered`
- `tables.ItemCooldown` -> `tables.itemCooldown`
- `tables.ResourceNode` -> `tables.resourceNode`
- `tables.ResourceGather` -> `tables.resourceGather`
- `tables.HotbarSlot` -> `tables.hotbarSlot`
- `tables.AbilityTemplate` -> `tables.abilityTemplate`
- `tables.Location` -> `tables.location`
- `tables.Npc` -> `tables.npc`
- `tables.VendorInventory` -> `tables.vendorInventory`
- `tables.EnemyTemplate` -> `tables.enemyTemplate`
- `tables.EnemyRoleTemplate` -> `tables.enemyRoleTemplate`
- `tables.EnemyAbility` -> `tables.enemyAbility`
- `tables.EnemySpawn` -> `tables.enemySpawn`
- `tables.EnemySpawnMember` -> `tables.enemySpawnMember`
- `tables.PullState` -> `tables.pullState`
- `tables.CombatEncounter` -> `tables.combatEncounter`
- `tables.CombatParticipant` -> `tables.combatParticipant`
- `tables.CombatEnemy` -> `tables.combatEnemy`
- `tables.ActivePet` -> `tables.activePet`
- `tables.CombatEnemyEffect` -> `tables.combatEnemyEffect`
- `tables.CombatEnemyCast` -> `tables.combatEnemyCast`
- `tables.AggroEntry` -> `tables.aggroEntry`
- `tables.CombatResult` -> `tables.combatResult`
- `tables.CombatLoot` -> `tables.combatLoot`
- `tables.Group` -> `tables.group`
- `tables.CharacterEffect` -> `tables.characterEffect`
- `tables.CharacterLogoutTick` -> `tables.characterLogoutTick`
- `tables.CharacterCast` -> `tables.characterCast`
- `tables.AbilityCooldown` -> `tables.abilityCooldown`
- `tables.EventWorld` -> `tables.eventWorld`
- `tables.EventLocation` -> `tables.eventLocation`
- `tables.EventPrivate` -> `tables.eventPrivate`
- `tables.EventGroup` -> `tables.eventGroup`
- `tables.GroupMember` -> `tables.groupMember`
- `tables.NpcDialog` -> `tables.npcDialog`
- `tables.QuestTemplate` -> `tables.questTemplate`
- `tables.QuestInstance` -> `tables.questInstance`
- `tables.WorldState` -> `tables.worldState`
- `tables.TradeSession` -> `tables.tradeSession`
- `tables.TradeItem` -> `tables.tradeItem`
- `tables.Race` -> `tables.race`
- `tables.Faction` -> `tables.faction`
- `tables.FactionStanding` -> `tables.factionStanding`
- `tables.UiPanelLayout` -> `tables.uiPanelLayout`
- `tables.TravelCooldown` -> `tables.travelCooldown`
- `tables.Renown` -> `tables.renown`
- `tables.RenownPerk` -> `tables.renownPerk`
- `tables.RenownServerFirst` -> `tables.renownServerFirst`
- `tables.Achievement` -> `tables.achievement`
- `tables.NpcAffinity` -> `tables.npcAffinity`
- `tables.NpcDialogueOption` -> `tables.npcDialogueOption`
- `tables.Corpse` -> `tables.corpse`
- `tables.CorpseItem` -> `tables.corpseItem`
- `tables.PendingSpellCast` -> `tables.pendingSpellCast`
- `tables.QuestItem` -> `tables.questItem`
- `tables.NamedEnemy` -> `tables.namedEnemy`
- `tables.SearchResult` -> `tables.searchResult`
- `tables.ItemAffix` -> `tables.itemAffix`
- `tables.WorldEvent` -> `tables.worldEvent`
- `tables.EventContribution` -> `tables.eventContribution`
- `tables.EventSpawnEnemy` -> `tables.eventSpawnEnemy`
- `tables.EventSpawnItem` -> `tables.eventSpawnItem`
- `tables.EventObjective` -> `tables.eventObjective`
- `tables.AppVersion` -> `tables.appVersion`
- `tables.ActiveBardSong` -> `tables.activeBardSong`

Keep `tables.my_bank_slots` unchanged — views retain snake_case in v2 bindings.

Do NOT change anything else in the file — the wrapper function, return object, and variable names are all fine.
  </action>
  <verify>Run `npx vue-tsc --noEmit 2>&1 | head -30` to check for type errors in useGameData.ts. No "Property does not exist on type" errors for any tables.XxxYyy access.</verify>
  <done>All 76 PascalCase `tables.Xxx` references converted to matching camelCase `tables.xxx` keys; `tables.my_bank_slots` left as-is; file compiles without table access errors.</done>
</task>

<task type="auto">
  <name>Task 2: Update stdb-types.ts comment to reflect disambiguation purpose</name>
  <files>src/stdb-types.ts</files>
  <action>
Replace the first 3 comment lines:
```
// Re-exports v2 SpacetimeDB types with Row suffix aliases for v1 compatibility.
// v2 codegen exports types as PascalCase (e.g. Character) from module_bindings/types.
// Client code uses XxxRow names (e.g. CharacterRow). This shim bridges the gap.
```

With:
```
// Row suffix type aliases for namespace disambiguation.
// v2 codegen exports bare PascalCase types (e.g. Character, Location, Group) which
// can collide with browser globals or generic names. XxxRow aliases (e.g. CharacterRow,
// LocationRow) make DB row types unambiguous throughout client code.
```

Do NOT change any of the type re-exports — they are correct and used across 36+ files.
  </action>
  <verify>Run `npx vue-tsc --noEmit 2>&1 | grep stdb-types` — should produce no errors. The file should have no mention of "v1" or "compatibility" or "shim".</verify>
  <done>stdb-types.ts comment accurately describes its purpose as namespace disambiguation; no reference to v1 compatibility remains; all type exports unchanged.</done>
</task>

</tasks>

<verification>
1. `npx vue-tsc --noEmit` completes without useGameData table access errors
2. `grep -c "tables\.[A-Z]" src/composables/useGameData.ts` returns 0 (no PascalCase table accesses remain)
3. `grep "v1" src/stdb-types.ts` returns nothing
4. App loads without "Cannot read properties of undefined" crash from useTable
</verification>

<success_criteria>
- Zero PascalCase `tables.Xxx` accesses in useGameData.ts (all converted to camelCase)
- stdb-types.ts comment updated with no v1/compat/shim language
- TypeScript compilation passes for both modified files
</success_criteria>

<output>
After completion, create `.planning/quick/310-remove-v1-shims-and-fix-usetable-error-n/310-SUMMARY.md`
</output>
