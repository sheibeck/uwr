---
phase: quick-309
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
autonomous: true
requirements: [FIX-SCHEMA-KEYS]
must_haves:
  truths:
    - "Module publishes without errors after schema key fix"
    - "client_connected reducer no longer crashes with 'Cannot read properties of undefined (reading id)'"
    - "ctx.db.player, ctx.db.user, etc. resolve correctly at runtime"
  artifacts:
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "schema() call with camelCase keys matching ctx.db accessor convention"
      contains: "player: Player"
  key_links:
    - from: "spacetimedb/src/schema/tables.ts schema() call"
      to: "all reducer files using ctx.db.camelCase"
      via: "schema object keys define ctx.db accessor names"
      pattern: "player: Player"
---

<objective>
Fix the v2 schema key casing so ctx.db accessors match the camelCase used throughout all reducers.

Purpose: The SpacetimeDB v2 `schema()` function uses object KEYS as `ctx.db` accessor names. The current shorthand `{Player}` produces `ctx.db.Player` (PascalCase), but all server code uses `ctx.db.player` (camelCase), causing `Cannot read properties of undefined (reading 'id')` at runtime.

Output: Single-file fix in tables.ts, module republished locally.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/schema/tables.ts (lines 1768-1870 — the schema() call and trailing view)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace PascalCase schema keys with explicit camelCase keys</name>
  <files>spacetimedb/src/schema/tables.ts</files>
  <action>
Replace the `schema({...})` call at line 1768 from shorthand PascalCase keys to explicit camelCase keys. Change:

```typescript
const spacetimedb = schema({
  Player,
  User,
  FriendRequest,
  ...
});
```

to:

```typescript
const spacetimedb = schema({
  player: Player,
  user: User,
  friendRequest: FriendRequest,
  friend: Friend,
  worldState: WorldState,
  region: Region,
  location: Location,
  locationConnection: LocationConnection,
  npc: Npc,
  npcDialog: NpcDialog,
  npcAffinity: NpcAffinity,
  npcDialogueOption: NpcDialogueOption,
  npcDialogueVisited: NpcDialogueVisited,
  questTemplate: QuestTemplate,
  questInstance: QuestInstance,
  hotbarSlot: HotbarSlot,
  abilityTemplate: AbilityTemplate,
  abilityCooldown: AbilityCooldown,
  characterCast: CharacterCast,
  character: Character,
  race: Race,
  itemTemplate: ItemTemplate,
  itemInstance: ItemInstance,
  itemAffix: ItemAffix,
  recipeTemplate: RecipeTemplate,
  recipeDiscovered: RecipeDiscovered,
  itemCooldown: ItemCooldown,
  resourceNode: ResourceNode,
  resourceGather: ResourceGather,
  resourceGatherTick: ResourceGatherTick,
  tradeSession: TradeSession,
  tradeItem: TradeItem,
  enemyRespawnTick: EnemyRespawnTick,
  combatLoot: CombatLoot,
  group: Group,
  groupMember: GroupMember,
  groupInvite: GroupInvite,
  enemyTemplate: EnemyTemplate,
  enemyRoleTemplate: EnemyRoleTemplate,
  enemyAbility: EnemyAbility,
  vendorInventory: VendorInventory,
  lootTable: LootTable,
  lootTableEntry: LootTableEntry,
  locationEnemyTemplate: LocationEnemyTemplate,
  enemySpawn: EnemySpawn,
  enemySpawnMember: EnemySpawnMember,
  pullState: PullState,
  pullTick: PullTick,
  combatEncounter: CombatEncounter,
  combatParticipant: CombatParticipant,
  combatEnemy: CombatEnemy,
  activePet: ActivePet,
  combatEnemyCast: CombatEnemyCast,
  combatEnemyCooldown: CombatEnemyCooldown,
  characterEffect: CharacterEffect,
  combatEnemyEffect: CombatEnemyEffect,
  combatPendingAdd: CombatPendingAdd,
  aggroEntry: AggroEntry,
  combatLoopTick: CombatLoopTick,
  healthRegenTick: HealthRegenTick,
  effectTick: EffectTick,
  hotTick: HotTick,
  castTick: CastTick,
  dayNightTick: DayNightTick,
  disconnectLogoutTick: DisconnectLogoutTick,
  characterLogoutTick: CharacterLogoutTick,
  combatResult: CombatResult,
  command: Command,
  eventWorld: EventWorld,
  eventLocation: EventLocation,
  eventPrivate: EventPrivate,
  eventGroup: EventGroup,
  faction: Faction,
  factionStanding: FactionStanding,
  uiPanelLayout: UiPanelLayout,
  travelCooldown: TravelCooldown,
  renown: Renown,
  renownPerk: RenownPerk,
  renownServerFirst: RenownServerFirst,
  achievement: Achievement,
  corpse: Corpse,
  corpseItem: CorpseItem,
  pendingSpellCast: PendingSpellCast,
  questItem: QuestItem,
  namedEnemy: NamedEnemy,
  searchResult: SearchResult,
  worldEvent: WorldEvent,
  eventContribution: EventContribution,
  eventSpawnEnemy: EventSpawnEnemy,
  eventSpawnItem: EventSpawnItem,
  eventObjective: EventObjective,
  worldStatTracker: WorldStatTracker,
  eventDespawnTick: EventDespawnTick,
  inactivityTick: InactivityTick,
  appVersion: AppVersion,
  activeBardSong: ActiveBardSong,
  bardSongTick: BardSongTick,
  bankSlot: BankSlot,
});
```

Do NOT change anything else in the file. The view at line 1871+ already uses camelCase (`ctx.db.player`, `ctx.db.bankSlot`) and will work correctly after this fix.
  </action>
  <verify>
Publish locally to verify no runtime errors:
```bash
spacetime publish uwr -p C:/projects/uwr/spacetimedb --delete-data=always -y
```
Then check logs for the absence of "Cannot read properties of undefined":
```bash
spacetime logs uwr 2>&1 | tail -20
```
  </verify>
  <done>Module publishes successfully, no "Cannot read properties of undefined" errors in logs, ctx.db.player and all other camelCase accessors resolve at runtime.</done>
</task>

</tasks>

<verification>
- `spacetime publish` succeeds without errors
- `spacetime logs uwr` shows no "Cannot read properties of undefined" crashes
- client_connected reducer executes without error (visible in logs when a client connects)
</verification>

<success_criteria>
- schema() call uses explicit camelCase keys for all 80+ tables
- Module publishes and runs without the undefined accessor crash
- All existing ctx.db.camelCase usages throughout reducers work correctly
</success_criteria>

<output>
After completion, create `.planning/quick/309-fix-client-connected-reducer-undefined-i/309-SUMMARY.md`
</output>
