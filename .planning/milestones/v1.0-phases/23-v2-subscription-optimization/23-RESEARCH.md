# Phase 23: V2 Subscription Optimization - Research

**Researched:** 2026-02-24
**Domain:** SpacetimeDB v2 SDK subscription patterns, Vue 3 reactivity optimization
**Confidence:** HIGH

## Summary

The UWR client currently subscribes to 76 tables via individual `useTable()` calls in a single monolithic `useGameData()` composable. In the v2 SDK (spacetimedb 2.0.1), each `useTable()` call creates its own `subscriptionBuilder().subscribe(querySql)` message -- meaning 76 separate WebSocket `Subscribe` messages are sent on every connect. All subscriptions are `SELECT * FROM table_name` with no WHERE filtering. All 76 subscriptions remain active permanently regardless of whether the user is in combat, crafting, or idle.

The SpacetimeDB v2 SDK already provides all the tools needed to fix this: the `subscribe()` method accepts arrays of queries for batching, `useTable()` supports `.where()` query builder expressions for server-side filtering, and the `event: true` table option enables transient event tables that auto-delete rows and skip cache storage.

**Primary recommendation:** Batch related table subscriptions into domain groups using `subscriptionBuilder().subscribe([...queries])`, split `useGameData` into domain composables that activate/deactivate subscriptions based on UI state, and convert the four event log tables to v2 Event Tables.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| spacetimedb | 2.0.1 | SpacetimeDB client SDK | Already installed, provides subscriptionBuilder, query builder, event tables |
| spacetimedb/vue | 2.0.1 (bundled) | Vue 3 integration | Already in use, provides useTable with .where() support |
| vue | 3.x | UI framework | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| spacetimedb/server | 2.0.1 | Server module definition | Needed for `event: true` table option on backend schema |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-useTable subscriptions | Manual subscriptionBuilder batching | More control but loses useTable reactivity helpers |
| Domain composables | Single useGameData with conditional subscriptions | Simpler but still one massive composable |
| v2 Event Tables | Keep persistent event tables with periodic cleanup | Simpler but wastes storage and bandwidth |

**Installation:** No new packages needed. All capabilities exist in spacetimedb 2.0.1.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── composables/
│   ├── useGameData.ts           # REFACTOR: Split into domain composables below
│   ├── data/                    # NEW: Domain subscription composables
│   │   ├── useCoreData.ts       # Always-on: player, character, world_state, race, faction, etc.
│   │   ├── useCombatData.ts     # Active during combat: combat_*, pull_state, enemy_*
│   │   ├── useCraftingData.ts   # Active when crafting panel open: recipe_*, resource_*
│   │   ├── useSocialData.ts     # Active when social panels open: friend_*, group_*, trade_*
│   │   ├── useWorldData.ts      # Location-scoped: event_location, enemy_spawn, npc, corpse
│   │   ├── useEventData.ts      # Event log tables (converted to v2 Event Tables)
│   │   └── useAdminData.ts      # Admin-only tables (world_event admin views)
│   ├── useCombat.ts             # Existing composable (logic layer)
│   ├── useCrafting.ts           # Existing composable (logic layer)
│   └── ...
├── module_bindings/             # Generated (no changes)
└── App.vue                      # Wire domain composables with activation signals
```

### Pattern 1: Batched Domain Subscriptions
**What:** Group related tables into a single `subscriptionBuilder().subscribe([...queries])` call instead of 76 individual calls.
**When to use:** Always. Replace every useTable() call with a domain-batched subscription.
**Example:**
```typescript
// Source: spacetimedb/src/sdk/subscription_builder_impl.ts (subscribe accepts array)
// Source: spacetimedb docs https://spacetimedb.com/docs/subscriptions

// Instead of 76 individual useTable() calls, batch by domain:
const coreQueries = [
  'SELECT * FROM "player"',
  'SELECT * FROM "character"',
  'SELECT * FROM "world_state"',
  'SELECT * FROM "race"',
  'SELECT * FROM "faction"',
  'SELECT * FROM "location"',
  'SELECT * FROM "region"',
  'SELECT * FROM "app_version"',
  'SELECT * FROM "ability_template"',
  'SELECT * FROM "item_template"',
];

conn.subscriptionBuilder()
  .onApplied(() => { coreReady.value = true; })
  .subscribe(coreQueries);
```

### Pattern 2: Conditional Subscriptions with Lifecycle Management
**What:** Subscribe to domain-specific tables only when the relevant UI feature is active, unsubscribe when deactivated.
**When to use:** For combat, crafting, social, and other feature-scoped data.
**Example:**
```typescript
// Source: spacetimedb/src/sdk/subscription_builder_impl.ts (unsubscribe/unsubscribeThen)
// Source: spacetimedb/src/vue/useTable.ts (onUnmounted cleanup)

function useCombatData(isInCombat: Ref<boolean>) {
  const combatRows = shallowRef([]);
  let handle: SubscriptionHandle | null = null;

  watch(isInCombat, (active) => {
    if (active && !handle) {
      handle = conn.subscriptionBuilder()
        .onApplied(() => { /* populate refs */ })
        .subscribe([
          'SELECT * FROM "combat_encounter"',
          'SELECT * FROM "combat_participant"',
          'SELECT * FROM "combat_enemy"',
          'SELECT * FROM "combat_enemy_effect"',
          'SELECT * FROM "combat_enemy_cast"',
          'SELECT * FROM "pull_state"',
          'SELECT * FROM "combat_result"',
          'SELECT * FROM "combat_loot"',
        ]);
    } else if (!active && handle) {
      handle.unsubscribe();
      handle = null;
    }
  });
}
```

### Pattern 3: SQL-Filtered Subscriptions via Query Builder
**What:** Use `tables.X.where(r => r.column.eq(value))` to subscribe to only relevant rows server-side.
**When to use:** For location-scoped data (enemy spawns, NPCs, events at current location).
**Example:**
```typescript
// Source: spacetimedb/src/lib/query.ts (where(), eq(), toSql())
// Source: spacetimedb/src/vue/useTable.ts (accepts Query<TableDef>)

// v2 useTable already supports query builder:
const [spawnsHere] = useTable(
  tables.enemy_spawn.where(r => r.locationId.eq(currentLocationId.value))
);

// Or with manual subscription for dynamic location changes:
watch(currentLocationId, (locId) => {
  oldSub?.unsubscribe();
  newSub = conn.subscriptionBuilder()
    .onApplied(() => { /* ... */ })
    .subscribe(`SELECT * FROM "enemy_spawn" WHERE "locationId" = ${locId}`);
});
```

### Pattern 4: V2 Event Tables for Transient Data
**What:** Convert persistent event log tables to `event: true` tables that auto-delete after delivery.
**When to use:** For event_world, event_location, event_private, event_group.
**Example:**
```typescript
// Source: spacetimedb/src/lib/table.ts line 308 (event option)
// Source: spacetimedb/src/sdk/table_cache.ts line 266 (event tables skip cache)

// Backend schema change:
export const EventWorld = table(
  { name: 'event_world', public: true, event: true },  // Add event: true
  {
    // id field removed - event tables typically don't need PKs for accumulation
    // Actually: event tables still need a primary key per SpacetimeDB schema rules
    id: t.u64().primaryKey().autoInc(),
    message: t.string(),
    kind: t.string(),
    createdAt: t.timestamp(),
  }
);

// Client: subscribe explicitly (event tables excluded from subscribeToAllTables)
// Use onInsert callback to append to local log array
conn.db.event_world.onInsert((ctx, row) => {
  eventLog.value.push({ ...row, scope: 'world' });
});
```

### Anti-Patterns to Avoid
- **Subscribing to all tables globally:** The current approach of 76 permanent `SELECT * FROM X` subscriptions wastes bandwidth and server resources for tables the user may never interact with.
- **Client-side filtering of all rows:** Subscribing to ALL rows and filtering in JS (e.g., `npcs.value.filter(npc => npc.locationId === locId)`) when WHERE clauses could push filtering to the server.
- **Re-creating subscriptions on every render:** `useTable()` in Vue calls `subscriptionBuilder().subscribe()` on component mount. If the parent re-renders and re-creates the composable, subscriptions churn. Use `shallowRef` and lifecycle management.
- **Mixing subscribeToAllTables with subscribe:** The SDK docs explicitly warn this can corrupt the client cache. Choose one pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Query builder SQL generation | Manual SQL string concatenation | `tables.X.where(r => r.col.eq(val))` | Type-safe, handles quoting, Identity serialization |
| Subscription lifecycle management | Manual WebSocket message tracking | `SubscriptionHandle.unsubscribe()` / `unsubscribeThen()` | Handles querySetId, dropped row cleanup |
| Client-side row filtering for subscriptions | Custom filter logic | `useTable(tables.X.where(...))` | SDK evaluates both server-side SQL and client-side BooleanExpr |
| Event delivery for transient data | Periodic cleanup reducers | `event: true` table option | Zero-storage, auto-delete, only fires onInsert |

**Key insight:** The v2 SDK (2.0.1) already has all the primitives needed. The project just isn't using them yet. No new libraries or custom infrastructure required.

## Common Pitfalls

### Pitfall 1: Subscription Deduplication Assumptions
**What goes wrong:** Assuming that subscribing to the same `SELECT * FROM X` query twice creates duplicate data.
**Why it happens:** The SDK documentation says subscriptions are "zero-copy" for identical queries, meaning duplicate subscriptions don't cause extra server work or data duplication.
**How to avoid:** This is actually safe behavior. If two composables need the same table, subscribing twice is fine -- the server deduplicates.
**Warning signs:** Unexpected empty rows after unsubscribing one of two identical subscriptions. Unsubscribing one handle can remove rows from the cache if the queries overlap.

### Pitfall 2: Dynamic WHERE Subscriptions Require Subscribe-Before-Unsubscribe
**What goes wrong:** When changing location (and thus the WHERE clause), unsubscribing the old query before subscribing the new one causes a brief period with no data.
**Why it happens:** Unsubscribe removes rows from cache immediately.
**How to avoid:** Subscribe to new query FIRST, wait for `onApplied`, THEN unsubscribe old query. SpacetimeDB docs explicitly recommend this pattern.
**Warning signs:** Flickering UI when changing locations, brief empty states.

### Pitfall 3: Event Tables Cannot Be Iterated
**What goes wrong:** Calling `table.iter()` or `table.count()` on event tables always returns empty results.
**Why it happens:** Event table rows are never stored in the client cache (see `table_cache.ts:266`). They only fire `onInsert` callbacks.
**How to avoid:** Maintain a local array via `onInsert` callbacks. The `useTable()` composable's `computeFilteredRows()` calls `Array.from(table.iter())` which will always be empty for event tables -- so useTable is NOT suitable for event tables.
**Warning signs:** Event data disappearing after subscribing, useTable returning always-empty arrays.

### Pitfall 4: Event Tables Must Be Subscribed Explicitly
**What goes wrong:** Event table data never arrives on the client.
**Why it happens:** Event tables are excluded from `subscribeToAllTables` and from individual `useTable()` calls unless explicitly subscribed.
**How to avoid:** Add explicit subscription for each event table using `conn.subscriptionBuilder().subscribe('SELECT * FROM "event_world"')`.
**Warning signs:** Event tables defined on server but client never receives inserts.

### Pitfall 5: Breaking the Monolith Incrementally
**What goes wrong:** Attempting to refactor all 76 useTable calls at once causes a massive regression.
**Why it happens:** App.vue destructures all 76 refs from useGameData; changing the shape breaks everything.
**How to avoid:** Incremental approach: (1) Keep useGameData as a thin re-export layer, (2) Move individual domain groups one at a time, (3) Test each domain group in isolation before moving the next.
**Warning signs:** TypeScript errors in App.vue, missing reactive data, subscription ordering issues.

### Pitfall 6: Views vs Tables Subscription Ambiguity
**What goes wrong:** The project has 15 server-side views (my_player, my_private_events, etc.) that the client used to subscribe to but may no longer need.
**Why it happens:** Decision #36/48 in STATE.md converted most per-user tables to public with client-side filtering, making many views redundant.
**How to avoid:** Audit which views are still subscribed to on the client. Many views were replaced by public tables with client-side filtering (per decisions 36 and 48). Don't subscribe to views that duplicate public table data.
**Warning signs:** Double-counting rows, wasted server computation for unused views.

## Code Examples

### Example 1: Current useGameData Pattern (Problem)
```typescript
// Source: src/composables/useGameData.ts (current)
// 76 individual subscriptions, ALL always active
export const useGameData = () => {
  const conn = useSpacetimeDB();
  const [players] = useTable(tables.player);           // Subscribe #1
  const [characters] = useTable(tables.character);      // Subscribe #2
  // ... 74 more subscriptions, each sending a separate WebSocket message
  const [bankSlots] = useTable(tables.my_bank_slots);   // Subscribe #76
  return { conn, players, characters, /* ...74 more... */ bankSlots };
};
```

### Example 2: Domain-Batched Core Subscription (Solution)
```typescript
// Source: spacetimedb/src/sdk/subscription_builder_impl.ts (subscribe accepts array)
import { tables, DbConnection } from '../module_bindings';
import { shallowRef, readonly, type Ref } from 'vue';

export function useCoreData(conn: DbConnection) {
  const players = shallowRef<any[]>([]);
  const characters = shallowRef<any[]>([]);
  const races = shallowRef<any[]>([]);
  const locations = shallowRef<any[]>([]);
  const isReady = shallowRef(false);

  // One batched subscription for ~15 always-needed tables
  const handle = conn.subscriptionBuilder()
    .onApplied(() => {
      players.value = [...conn.db.player.iter()];
      characters.value = [...conn.db.character.iter()];
      races.value = [...conn.db.race.iter()];
      locations.value = [...conn.db.location.iter()];
      isReady.value = true;
    })
    .subscribe([
      'SELECT * FROM "player"',
      'SELECT * FROM "character"',
      'SELECT * FROM "race"',
      'SELECT * FROM "location"',
      'SELECT * FROM "region"',
      'SELECT * FROM "world_state"',
      'SELECT * FROM "faction"',
      'SELECT * FROM "ability_template"',
      'SELECT * FROM "item_template"',
      'SELECT * FROM "app_version"',
    ]);

  // Set up table listeners for live updates
  conn.db.player.onInsert(() => { players.value = [...conn.db.player.iter()]; });
  conn.db.player.onUpdate(() => { players.value = [...conn.db.player.iter()]; });
  conn.db.player.onDelete(() => { players.value = [...conn.db.player.iter()]; });
  // ... similar for other core tables

  return { players: readonly(players), characters: readonly(characters), /* ... */ isReady };
}
```

### Example 3: Conditional Combat Subscription (Solution)
```typescript
// Subscribe to combat tables only when player is in combat
import type { SubscriptionHandle } from '../module_bindings';

export function useCombatData(conn: DbConnection, isInCombat: Ref<boolean>) {
  let handle: SubscriptionHandle | null = null;
  const combatEncounters = shallowRef<any[]>([]);

  watch(isInCombat, (active) => {
    if (active && !handle) {
      handle = conn.subscriptionBuilder()
        .onApplied(() => {
          combatEncounters.value = [...conn.db.combat_encounter.iter()];
        })
        .subscribe([
          'SELECT * FROM "combat_encounter"',
          'SELECT * FROM "combat_participant"',
          'SELECT * FROM "combat_enemy"',
          'SELECT * FROM "combat_enemy_effect"',
          'SELECT * FROM "combat_enemy_cast"',
          'SELECT * FROM "combat_result"',
          'SELECT * FROM "combat_loot"',
          'SELECT * FROM "pull_state"',
        ]);
    } else if (!active && handle) {
      handle.unsubscribe();
      handle = null;
      combatEncounters.value = [];
    }
  }, { immediate: true });

  return { combatEncounters: readonly(combatEncounters) };
}
```

### Example 4: V2 Event Table Definition (Backend)
```typescript
// Source: spacetimedb/src/lib/table.ts line 308 (event option)
export const EventWorld = table(
  { name: 'event_world', public: true, event: true },
  {
    id: t.u64().primaryKey().autoInc(),
    message: t.string(),
    kind: t.string(),
    createdAt: t.timestamp(),
  }
);
```

### Example 5: Event Table Client Consumption
```typescript
// Event tables fire onInsert only, no cache storage
// useTable() will NOT work for event tables (iter() always empty)
const eventLog = shallowRef<EventEntry[]>([]);
const MAX_EVENTS = 200;

conn.db.event_world.onInsert((_ctx, row) => {
  eventLog.value = [...eventLog.value.slice(-(MAX_EVENTS - 1)), {
    scope: 'world',
    message: row.message,
    kind: row.kind,
    createdAt: row.createdAt,
  }];
});

// Must explicitly subscribe to event tables
conn.subscriptionBuilder().subscribe('SELECT * FROM "event_world"');
```

### Example 6: useTable with WHERE Query Builder
```typescript
// Source: spacetimedb/src/vue/useTable.ts (accepts Query<TableDef>)
// Source: spacetimedb/src/lib/query.ts (where/eq generate SQL + client-side filter)

// Subscribe only to enemy spawns at current location (server-side filter)
const [spawnsHere] = useTable(
  tables.enemy_spawn.where(r => r.locationId.eq(currentLocationId))
);
// Generates: SELECT * FROM "enemy_spawn" WHERE "enemy_spawn"."locationId" = 42
// Also client-side filters via evaluateBooleanExpr for reactivity
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `subscribeToAllTables()` | Per-table `subscribe()` via useTable | SDK 2.0.0 | Each useTable creates individual subscription message |
| `@clockworklabs/spacetimedb-sdk` | `spacetimedb` package | SDK 1.4.0 | New package name, different imports |
| Reducer callbacks (`conn.reducers.onX()`) | Event tables (`event: true`) | SDK 2.0.0 | Transient event delivery replaces global callbacks |
| `--project-path` CLI flag | `--module-path` CLI flag | SDK 2.0.0 | CLI argument renamed |
| `--clear-database` | `--delete-data=always` | SDK 2.0.0 | Publish flag renamed |
| `withModuleName()` | `withDatabaseName()` | SDK 2.0.0 | Connection builder method renamed |

**Deprecated/outdated:**
- `subscribeToAllTables()`: Still exists but docs say "should not be combined with subscribe" and is "intended as a convenience for applications where client-side memory use and network bandwidth are not concerns"
- Global reducer callbacks: Removed in v2, replaced by event tables
- Light mode: Removed in v2

## Event Table Conversion (Expanded Scope per User Request)

The user has requested that event logging be updated to use v2 Event Tables to eliminate the need for manual trimming. The official SpacetimeDB Event Tables documentation (https://spacetimedb.com/docs/tables/event-tables/) confirms:

### Official Event Table Behavior
- Rows "exist only for the duration of the transaction that created them"
- After transaction commits, rows are "broadcast to subscribed clients and then deleted from the table"
- Table remains empty between transactions
- Constraints operate "only within a single transaction and reset between transactions"
- The `event` flag **cannot change after publishing** — conversion requires `--delete-data=always` (schema migration)
- Event tables **cannot be accessed within view functions** — critical: the existing `my_private_events` and `my_location_events` views MUST be removed before converting
- Event tables **cannot be used as lookup tables in subscription joins**
- RLS rules function identically to regular tables (identity-based filtering still works)
- Only `onInsert` callbacks exist on client — no `onDelete`, `onUpdate`, `onBeforeDelete`

### Tables to Convert to Event Tables

**Primary targets (4 event log tables):**
| Table | Current Trimming | Post-Conversion |
|-------|-----------------|-----------------|
| event_world | 200 rows / 1hr age | Auto-delete, no trimming code needed |
| event_location | 200 rows / 1hr age | Auto-delete, no trimming code needed |
| event_private | 200 rows / 1hr age | Auto-delete, no trimming code needed |
| event_group | 200 rows / 1hr age | Auto-delete, no trimming code needed |

**Server-side changes needed:**
1. Add `event: true` to all 4 table definitions in `spacetimedb/src/schema/tables.ts`
2. Remove all `trimEventRows()` calls from `spacetimedb/src/helpers/events.ts` — event tables auto-delete
3. Remove `EVENT_TRIM_MAX` and `EVENT_TRIM_AGE_MICROS` constants
4. Remove `my_private_events` and `my_location_events` views from `spacetimedb/src/views/events.ts` — views cannot access event tables
5. Keep helper functions (appendWorldEvent, appendLocationEvent, etc.) — they still handle insert logic

**Client-side changes needed:**
1. Replace `useTable(tables.event_world)` etc. with `onInsert` callbacks — `useTable()` doesn't work for event tables (iter() always empty)
2. Maintain local `shallowRef<EventItem[]>` arrays, append on onInsert, client-side trim to 200 entries
3. Update `useEvents.ts` to consume local arrays instead of reactive table data
4. Add explicit `subscriptionBuilder().subscribe()` for each event table — event tables require explicit subscription

**Additional candidates evaluated:**
| Table | Candidate? | Reason |
|-------|-----------|--------|
| npc_dialog | NO | Needs to persist across transactions for conversation history display |
| command | NO | Has `status` field — needs update tracking, not just insert |
| combat_result | NO | Persists until player dismisses loot — not transient |
| search_result | NO | Persists until player acts on results — not transient |

**Conclusion:** Only the 4 event log tables are good candidates for event table conversion. Other log-like tables have persistence requirements that conflict with the auto-delete behavior.

## Open Questions

1. **How many simultaneous subscriptions can SpacetimeDB handle efficiently?**
   - What we know: Each `subscribe()` call sends a separate WebSocket message. Batching reduces this to one per domain group.
   - What's unclear: Server-side cost of 76 vs 5-10 subscription query sets. Zero-copy dedup may mean 76 subscriptions is fine performance-wise.
   - Recommendation: Batch regardless -- fewer messages is better for connection setup latency. Measure before/after.

2. **Can useTable's built-in subscription be replaced with manual subscriptionBuilder?**
   - What we know: `useTable()` internally calls `subscriptionBuilder().subscribe(querySql)`. It manages lifecycle (subscribe on mount, unsubscribe on unmount) and row reactivity.
   - What's unclear: Whether mixing manual `subscriptionBuilder()` calls with `useTable()` calls works correctly. The SDK warns against mixing `subscribe` and `subscribeToAllTables` but doesn't address mixing multiple `subscribe` patterns.
   - Recommendation: Test compatibility. If manual subscriptions work alongside useTable, use manual for batched domain groups and keep useTable for individual filtered queries.

3. **Event table primary key requirement**
   - What we know: Event tables use `event: true` option. The SDK handles them as insert-only with no cache.
   - What's unclear: Whether event tables require a primary key column, or if the autoInc id can be removed.
   - Recommendation: Keep the id field initially. Test removing it in a follow-up.

4. **useTable with dynamic WHERE and subscription churn**
   - What we know: `useTable(tables.X.where(r => r.col.eq(val)))` generates SQL and subscribes. Changing the value creates a new subscription.
   - What's unclear: Whether Vue's reactivity system properly handles the old subscription being cleaned up when the query parameter changes.
   - Recommendation: For dynamic values (like current location), use manual subscriptionBuilder with explicit subscribe-before-unsubscribe pattern rather than useTable with reactive WHERE values.

5. **Existing views: keep, remove, or convert?**
   - What we know: 15 server-side views exist (my_player, my_private_events, etc.). Decision #36/48 moved most per-user tables to public + client-side filtering.
   - What's unclear: Which views are still subscribed to on the client. Some may be dead code.
   - Recommendation: Audit view usage in useGameData. Views that filter by identity (my_private_events, my_location_events) may become unnecessary if event tables are adopted.

## Domain Grouping Analysis

Based on the current 76 useTable() calls in useGameData.ts, here is the recommended domain split:

### Core (Always Active) -- ~20 tables
player, user, character, world_state, region, location, location_connection, race, faction, faction_standing, ability_template, item_template, item_instance, hotbar_slot, item_cooldown, item_affix, renown, renown_perk, renown_server_first, achievement, app_version, ui_panel_layout

### Combat (Active During Combat) -- ~12 tables
combat_encounter, combat_participant, combat_enemy, combat_enemy_effect, combat_enemy_cast, combat_result, combat_loot, pull_state, active_pet, ability_cooldown, character_cast, character_effect, active_bard_song

### World/Location (Location-Scoped with WHERE) -- ~8 tables
enemy_spawn, enemy_spawn_member, enemy_template, enemy_role_template, enemy_ability, npc, vendor_inventory, named_enemy, resource_node, resource_gather, corpse, corpse_item, search_result

### Social (Active When Social Panels Open) -- ~8 tables
friend_request, friend, group_invite, group, group_member, trade_session, trade_item, npc_affinity, npc_dialogue_option

### Crafting (Active When Crafting Panel Open) -- ~3 tables
recipe_template, recipe_discovered, pending_spell_cast

### Quest (Active When Quest Panel Open or Exploring) -- ~4 tables
quest_template, quest_instance, quest_item, npc_dialog

### Events (Converted to Event Tables) -- ~4 tables
event_world, event_location, event_private, event_group

### World Events (Active When World Event Panel Open) -- ~5 tables
world_event, event_contribution, event_spawn_enemy, event_spawn_item, event_objective

### Other -- ~3 tables
travel_cooldown, character_logout_tick, my_bank_slots

## Sources

### Primary (HIGH confidence)
- SpacetimeDB SDK source code (node_modules/spacetimedb/src/vue/useTable.ts) - Verified useTable creates individual subscriptions, supports .where() query builder
- SpacetimeDB SDK source code (node_modules/spacetimedb/src/sdk/subscription_builder_impl.ts) - Verified subscribe() accepts arrays, subscribeToAllTables warning
- SpacetimeDB SDK source code (node_modules/spacetimedb/src/lib/table.ts) - Verified `event: true` option at line 308
- SpacetimeDB SDK source code (node_modules/spacetimedb/src/sdk/table_cache.ts) - Verified event tables skip cache storage, only fire onInsert
- SpacetimeDB SDK source code (node_modules/spacetimedb/src/vue/SpacetimeDBProvider.ts) - Verified Provider does NOT call subscribeToAllTables
- Project source (src/composables/useGameData.ts) - 76 useTable() calls, all SELECT * with no WHERE
- Project source (spacetimedb/src/schema/tables.ts) - 83 public tables, 4 event log tables

### Secondary (MEDIUM confidence)
- [SpacetimeDB Subscription Docs](https://spacetimedb.com/docs/subscriptions) - Zero-copy dedup, subscribe-before-unsubscribe pattern, batching guidance
- [SpacetimeDB Performance Docs](https://spacetimedb.com/docs/tables/performance/) - Private tables reduce overhead, split tables for targeted subscriptions
- [SpacetimeDB SQL Docs](https://spacetimedb.com/docs/sql/) - WHERE clause support, JOIN limitations
- [SpacetimeDB v1-to-v2 Migration](https://spacetimedb.com/docs/2.0.0-rc1/upgrade/) - Event tables replace reducer callbacks, explicit subscription required

### Tertiary (LOW confidence)
- [SpacetimeDB batch subscription issue](https://github.com/clockworklabs/SpacetimeDB/issues/2784) - Server-side batching of subscription updates (internal optimization, not client-facing)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools exist in the installed SDK (2.0.1), verified in source code
- Architecture: HIGH - Domain grouping pattern is straightforward, subscribe() array batching verified
- Event tables: MEDIUM - `event: true` option verified in SDK source, but behavior with useTable needs testing
- Pitfalls: HIGH - Subscribe-before-unsubscribe pattern documented by SpacetimeDB, event table limitations verified in source

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (stable SDK, unlikely to change rapidly)
