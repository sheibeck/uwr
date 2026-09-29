# Phase 18: World Events System Expansion - Research

**Researched:** 2026-02-17
**Domain:** SpacetimeDB TypeScript SDK — world events, scheduled tables, contribution tracking, permanent world state (Ripple), Vue 3 panel UI
**Confidence:** HIGH

## Summary

Phase 18 adds a full world event lifecycle system on top of an existing SpacetimeDB TypeScript backend and Vue 3 client. The codebase is already well-structured: helpers provide `awardRenown`, `mutateStanding`, `appendWorldEvent`, and `addItemToInventory` — all reusable as-is for event rewards. The backend uses a dependency-injection pattern (a `deps` object passed into reducer registration functions), and views use `spacetimedb.view` with per-subscriber sender filtering.

The "Ripple" system means permanent world-state changes on event resolution, implemented as mutations to existing tables (e.g. `Race.unlocked`, `EnemyTemplate`, `Faction` records) — not a geographic cascade. There is no `RegionAdjacency` table and none is needed. Events own exclusive spawned content (enemies, items, objectives) that only exist while the event is active, implemented via event-scoped tables with an `eventId` foreign key.

The primary design challenge is the data model: a single `WorldEvent` table must support both time-based and two-sided threshold failure conditions, and must carry enough metadata to drive contribution tracking (Bronze/Silver/Gold tiers), reward specifications per tier, and both success/failure consequence types. Client-side, a new `WorldEventPanel.vue` follows the existing RenownPanel tab pattern, registered in `usePanelManager` and `App.vue` identically to all other panels.

**Primary recommendation:** Model events in a flat `WorldEvent` table with JSON fields for tier thresholds and reward specs; use separate `EventContribution` and `EventSpawnEnemy`/`EventSpawnItem`/`EventObjective` tables for runtime data; implement despawn via a scheduled `EventDespawnTick` table.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Ripple = permanent world consequence, NOT geographic cascade.** "Ripple" means: when an event resolves (success or failure), it permanently changes world state. RegionAdjacency is NOT part of this.
- **Events are self-contained.** They spawn their own exclusive enemies, items, and objectives that only exist while the event is active.
- **Joining is automatic on region entry.** Rewards only if player interacted with at least one piece of event content.
- **Contribution tiers: Bronze/Silver/Gold** with fixed per-tier rewards specified in event data constants.
- **Every event has both success AND failure consequences.** Failure darkens the world but never breaks playability. One-time events locked permanently after resolve.
- **Failure conditions are flexible:** time-based OR two-sided threshold race (e.g. villager protection).
- **Notification: log entry + banner overlay** on event fire. Same for all events regardless of trigger source.
- **WorldEventPanel: dedicated action bar button** with badge when active events exist. Two tabs: Active and History.
- **Active cards show:** name, region, objective progress bar, rewards preview.
- **History shows:** name, outcome (success/fail), consequence triggered, when it resolved.
- **Rewards fire immediately on event resolution.** Types: overall renown, faction standing, gold, special event loot. Success pays more; failure gets consolation reward.
- **Event spawns linger ~2 minutes after resolve then despawn.**
- **Recurring events must be explicitly flagged.** One-time events are default.

### Claude's Discretion

- Exact Bronze/Silver/Gold contribution thresholds per event (specified per event in data constants)
- How event-specific enemies are seeded and tracked (separate table or flag on existing tables)
- How the banner overlay is styled and dismissed (duration, animation)
- How the History section is structured in the WorldEventPanel (ordering, pagination if needed)
- Admin identity guard implementation pattern

### Deferred Ideas (OUT OF SCOPE)

- None raised — discussion stayed within phase scope.
</user_constraints>

---

## Standard Stack

### Core (all verified in codebase)

| Library / Pattern | Version / Source | Purpose | Why Standard |
|-------------------|-----------------|---------|--------------|
| `spacetimedb/server` | 1.11.x | `table()`, `t.*`, `SenderError`, `ScheduleAt` | Project-wide server SDK |
| `spacetimedb/vue` | 1.11.x | `useTable()`, `useSpacetimeDB()` | Client data access in composables |
| SpacetimeDB scheduled tables | 1.11.x | `{ scheduled: 'reducer_name' }` + `scheduledAt: t.scheduleAt()` | Existing pattern for timed operations |
| Vue 3 `<script setup>` SFCs | 3.x | All existing components use this pattern | Consistency with `App.vue` panel pattern |
| Inline style objects | Existing codebase | `styles.*` object from `src/ui/styles.ts` | All panels use this, no CSS modules |

### Supporting

| Helper | File | Purpose | When to Use |
|--------|------|---------|-------------|
| `appendWorldEvent(ctx, kind, message)` | `helpers/events.ts` | Write to EventWorld log | Event fire and resolve notifications |
| `awardRenown(ctx, character, points, reason)` | `helpers/renown.ts` | Award renown to a character | Reward distribution on resolve |
| `mutateStanding(ctx, characterId, factionId, delta)` | `helpers/economy.ts` | Award faction standing | Reward distribution on resolve |
| `addItemToInventory(ctx, characterId, templateId, qty)` | `helpers/items.ts` | Give item to character | Special event loot rewards |
| `requirePlayerUserId(ctx)` | `helpers/events.ts` | Get userId from sender | Auth in reducers |
| `ScheduleAt` | `spacetimedb` import | Schedule timed operations | EventDespawnTick |

### Installation

No new packages needed. All dependencies already in project.

---

## Architecture Patterns

### Recommended Project Structure

New files to create:

```
spacetimedb/src/
  schema/tables.ts              # Add: WorldEvent, EventContribution, EventSpawnEnemy,
                                #      EventSpawnItem, EventObjective, EventDespawnTick
  data/
    world_event_data.ts         # Event definitions, tier thresholds, reward specs
  helpers/
    world_events.ts             # fireWorldEvent(), resolveWorldEvent(), awardEventRewards()
  reducers/
    world_events.ts             # fire_world_event, contribute_to_event, increment_event_counter
  views/
    world_events.ts             # my_event_contributions view (per-subscriber)
  index.ts                      # Add world_events tables to schema() export and registerReducers

src/
  composables/
    useGameData.ts              # Add worldEventRows, eventContributions, etc. to existing
  components/
    WorldEventPanel.vue         # New panel with Active + History tabs
  App.vue                       # Add worldEvents action bar button + panel mount
```

### Pattern 1: WorldEvent Table Schema

The central table carries lifecycle state and all configuration needed to drive resolution logic.

```typescript
// Source: existing tables.ts pattern — verified against SDK column types
export const WorldEvent = table(
  {
    name: 'world_event',
    public: true,
    indexes: [
      { name: 'by_status', algorithm: 'btree', columns: ['status'] },
      { name: 'by_region', algorithm: 'btree', columns: ['regionId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    eventKey: t.string(),                    // data constant key, e.g. 'ashen_awakening'
    name: t.string(),
    regionId: t.u64(),
    status: t.string(),                      // 'active' | 'success' | 'failed'
    isRecurring: t.bool(),
    firedAt: t.timestamp(),
    resolvedAt: t.timestamp().optional(),

    // Failure condition type
    failureConditionType: t.string(),        // 'time' | 'threshold_race'

    // Time-based failure: event ends at this timestamp
    deadlineAtMicros: t.u64().optional(),

    // Two-sided threshold race
    successThreshold: t.u64().optional(),    // e.g. players must save 10 villagers
    failureThreshold: t.u64().optional(),    // e.g. enemies kill 5 villagers
    successCounter: t.u64().optional(),      // current success-side count
    failureCounter: t.u64().optional(),      // current failure-side count

    // Consequences (string keys, resolved at runtime from data constants)
    successConsequenceType: t.string(),
    successConsequencePayload: t.string(),   // JSON or key string
    failureConsequenceType: t.string(),
    failureConsequencePayload: t.string(),

    // Reward specs per tier as JSON: { bronze: {...}, silver: {...}, gold: {...} }
    rewardTiersJson: t.string(),

    // Written at resolve time (stubbed for now)
    consequenceText: t.string().optional(),
  }
);
```

**Confidence:** HIGH — mirrors existing table patterns exactly.

### Pattern 2: EventContribution Table

Tracks per-character engagement for tier determination at resolve time.

```typescript
// Source: existing tables.ts pattern
export const EventContribution = table(
  {
    name: 'event_contribution',
    public: true,
    indexes: [
      { name: 'by_event', algorithm: 'btree', columns: ['eventId'] },
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    eventId: t.u64(),
    characterId: t.u64(),
    ownerUserId: t.u64(),
    count: t.u64(),                 // meaningful interactions count; 0 = no reward
    regionEnteredAt: t.timestamp(),
  }
);
```

### Pattern 3: Event Spawn Tables

Separate tables for event-exclusive content, tagged with `eventId` for lifecycle management.

```typescript
// Event-exclusive enemies: references EnemySpawn rows created at event fire
export const EventSpawnEnemy = table(
  {
    name: 'event_spawn_enemy',
    public: true,
    indexes: [
      { name: 'by_event', algorithm: 'btree', columns: ['eventId'] },
      { name: 'by_spawn', algorithm: 'btree', columns: ['spawnId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    eventId: t.u64(),
    spawnId: t.u64(),      // FK to EnemySpawn.id
    locationId: t.u64(),
  }
);

// Event-exclusive collectible items (world-placed, not in inventory)
export const EventSpawnItem = table(
  {
    name: 'event_spawn_item',
    public: true,
    indexes: [
      { name: 'by_event', algorithm: 'btree', columns: ['eventId'] },
      { name: 'by_location', algorithm: 'btree', columns: ['locationId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    eventId: t.u64(),
    locationId: t.u64(),
    itemTemplateId: t.u64(),
    name: t.string(),
    collected: t.bool(),
    collectedByCharacterId: t.u64().optional(),
  }
);

// Protect/explore/kill-count objectives
export const EventObjective = table(
  {
    name: 'event_objective',
    public: true,
    indexes: [
      { name: 'by_event', algorithm: 'btree', columns: ['eventId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    eventId: t.u64(),
    objectiveType: t.string(),   // 'protect_npc' | 'explore' | 'kill_count'
    locationId: t.u64(),
    name: t.string(),
    targetCount: t.u64(),
    currentCount: t.u64(),
    isAlive: t.bool().optional(), // for protect_npc objectives
  }
);
```

### Pattern 4: Scheduled Despawn Table

Follows existing scheduled table pattern exactly (same as `EnemyRespawnTick`, `ResourceGatherTick`, `PullTick`).

```typescript
export const EventDespawnTick = table(
  {
    name: 'event_despawn_tick',
    scheduled: 'despawn_event_content',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    eventId: t.u64(),
  }
);
```

### Pattern 5: Admin Identity Guard

No existing admin-role system exists. Dev-facing reducers (`create_test_item`, `level_character`) have no access control. For Phase 18, use a hardcoded set of admin identity hex strings in a data constant:

```typescript
// spacetimedb/src/data/world_event_data.ts
export const ADMIN_IDENTITIES = new Set<string>([
  // Add hex identity strings of admin users
  // Run: spacetime identity show  to find your hex
]);

// In fire_world_event reducer:
if (!ADMIN_IDENTITIES.has(ctx.sender.toHexString())) {
  throw new SenderError('Admin only');
}
```

**Confidence:** MEDIUM — no prior admin pattern exists; this is the pragmatic approach matching the project's style.

### Pattern 6: Reducer Registration (DI Pattern)

```typescript
// spacetimedb/src/reducers/world_events.ts
export const registerWorldEventReducers = (deps: any) => {
  const {
    spacetimedb, t, SenderError, ScheduleAt,
    appendWorldEvent, appendPrivateEvent,
    awardRenown, mutateStanding, addItemToInventory,
    requirePlayerUserId, requireCharacterOwnedBy,
    spawnEnemyWithTemplate,
    EventDespawnTick,
  } = deps;

  spacetimedb.reducer('fire_world_event', { eventKey: t.string() }, (ctx, { eventKey }) => {
    // Admin guard, look up event def, spawn content, insert WorldEvent, appendWorldEvent
  });

  spacetimedb.reducer(
    'contribute_event',
    { eventId: t.u64(), characterId: t.u64() },
    (ctx, args) => {
      // Increment contribution count for character; called from kill/collect/objective logic
    }
  );

  spacetimedb.reducer(
    'increment_event_counter',
    { eventId: t.u64(), side: t.string(), amount: t.u64() },
    (ctx, args) => {
      // Update threshold counters; check for resolve condition
    }
  );

  spacetimedb.reducer(
    'despawn_event_content',
    { arg: EventDespawnTick.rowType },
    (ctx, { arg }) => {
      // Collect EnemySpawn IDs from EventSpawnEnemy, delete spawns + members
      // Delete EventSpawnItem, EventObjective rows
    }
  );
};
```

Wire into `index.ts` DI deps object and call `registerWorldEventReducers(reducerDeps)` in `registerReducers`.

### Pattern 7: Ripple Consequence Switch

```typescript
// spacetimedb/src/helpers/world_events.ts
function applyConsequence(ctx: any, event: any, outcome: 'success' | 'failure') {
  const consequenceType = outcome === 'success'
    ? event.successConsequenceType
    : event.failureConsequenceType;
  const payload = outcome === 'success'
    ? event.successConsequencePayload
    : event.failureConsequencePayload;

  switch (consequenceType) {
    case 'race_unlock':
      // Mutate Race.unlocked = true for race named in payload
      // Race table already has 'unlocked' boolean column
      for (const row of ctx.db.race.iter()) {
        if (row.name === payload) {
          ctx.db.race.id.update({ ...row, unlocked: true });
        }
      }
      break;

    case 'enemy_composition_change':
      // payload = JSON with regionId + enemy template keys to add/remove
      // Mutate LocationEnemyTemplate rows for affected locations
      break;

    case 'faction_standing_bonus':
      // payload = JSON { factionId, amount }
      // Award to ALL contributors (server-wide historical recognition)
      break;

    case 'system_unlock':
      // payload = string key; record in WorldState or new table
      break;

    case 'none':
      break;
  }
}
```

**Key insight:** The `Race` table already has `unlocked: t.bool()` — `race_unlock` consequence is a one-line update. No new tables needed for this consequence type.

### Pattern 8: View for Per-Character Contribution

```typescript
// spacetimedb/src/views/world_events.ts
// WorldEvent itself is public=true so subscription works directly.
// EventContribution needs a per-sender view.

export const registerWorldEventViews = ({ spacetimedb, t, EventContribution }: any) => {
  spacetimedb.view(
    { name: 'my_event_contributions', public: true },
    t.array(EventContribution.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player?.activeCharacterId) return [];
      return [...ctx.db.eventContribution.by_character.filter(player.activeCharacterId)];
    }
  );
};
```

Matches the existing `my_location_events` view pattern exactly.

### Pattern 9: Vue Panel (WorldEventPanel.vue)

Follows the RenownPanel multi-tab pattern — same tab bar styling, same `resultCard` pattern for list items:

```vue
<template>
  <div :style="styles.panelBody">
    <!-- Tab bar: identical inline style pattern to RenownPanel.vue -->
    <div :style="{ display: 'flex', gap: '0', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px' }">
      <button type="button" @click="activeTab = 'active'" :style="tabStyle('active')">Active</button>
      <button type="button" @click="activeTab = 'history'" :style="tabStyle('history')">History</button>
    </div>

    <div v-if="activeTab === 'active'">
      <div v-if="activeEvents.length === 0" :style="styles.subtle">No active world events.</div>
      <div v-for="event in activeEvents" :key="event.id.toString()" :style="styles.resultCard">
        <div :style="styles.recipeName">{{ event.name }}</div>
        <div :style="styles.subtleSmall">Region: {{ regionName(event.regionId) }}</div>
        <!-- Progress bar -->
        <div :style="{ background: 'rgba(255,255,255,0.1)', borderRadius: '999px', height: '6px', overflow: 'hidden' }">
          <div :style="{ height: '100%', borderRadius: '999px', background: '#60a5fa', width: `${progressPercent(event)}%`, transition: 'width 0.3s ease' }"></div>
        </div>
        <div :style="styles.subtleSmall">Rewards: {{ rewardsPreview(event) }}</div>
      </div>
    </div>

    <div v-if="activeTab === 'history'">
      <div v-if="historyEvents.length === 0" :style="styles.subtle">No resolved events yet.</div>
      <div v-for="event in historyEvents" :key="event.id.toString()" :style="styles.resultCard">
        <div :style="styles.recipeName">{{ event.name }}</div>
        <div :style="{ color: event.status === 'success' ? '#4ade80' : '#f87171', fontWeight: 600 }">
          {{ event.status === 'success' ? 'Success' : 'Failed' }}
        </div>
        <div :style="styles.subtleSmall">{{ event.consequenceText ?? 'World changed.' }}</div>
        <div :style="styles.subtleSmall">{{ event.resolvedAt ? formatTimestamp(event.resolvedAt) : '' }}</div>
      </div>
    </div>
  </div>
</template>
```

### Pattern 10: Banner Overlay in App.vue

Watch `worldEventRows` for newly added active rows, show a dismissing banner:

```typescript
// In App.vue <script setup> — after existing watchers
const activeBanner = ref<string | null>(null);
let bannerTimer: ReturnType<typeof setTimeout> | null = null;

watch(worldEvents, (newRows, oldRows) => {
  if (!oldRows) return;
  const prevIds = new Set((oldRows as any[]).map((r: any) => r.id.toString()));
  for (const row of (newRows as any[])) {
    if (!prevIds.has(row.id.toString()) && row.status === 'active') {
      activeBanner.value = `World Event: ${row.name} has begun!`;
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { activeBanner.value = null; }, 5000);
    }
  }
}, { deep: true });
```

```vue
<!-- In App.vue template, inside the game world div, above floating panels -->
<div v-if="activeBanner" :style="styles.worldEventBanner">
  {{ activeBanner }}
</div>
```

### Pattern 11: Action Bar Badge

```vue
<!-- In ActionBar.vue, new button with badge -->
<button
  @click="emit('toggle', 'worldEvents')"
  :style="{ ...actionStyle('worldEvents'), position: 'relative' }"
  :disabled="isLocked('worldEvents')"
>
  Events
  <span
    v-if="hasActiveEvents"
    :style="{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px',
              background: '#facc15', borderRadius: '50%', display: 'block' }"
  ></span>
</button>
```

`hasActiveEvents` is a computed prop passed from App.vue (`worldEventRows.value.some(r => r.status === 'active')`).

### Anti-Patterns to Avoid

- **`ctx.db.worldEvent.iter()` in a view** — views cannot scan tables; use public table direct subscription instead. Views only need index lookups.
- **Multi-column index filters** — BROKEN in current SDK. Use single-column index + JavaScript filter.
- **Awarding rewards inside `move_character`** — region entry creates the `EventContribution` row; rewards fire at resolve time only.
- **Using EventWorld log rows as the History tab source** — those rows are trimmed after 1 hour / 200 max. Use `WorldEvent` table rows with `status = 'success' | 'failed'` instead (permanent).
- **Storing reward amounts as individual columns** — schema churn. Use `rewardTiersJson` (JSON string) for extensibility.
- **Deleting EventSpawnEnemy before EnemySpawn** — must delete EnemySpawn (and EnemySpawnMember) rows first, then EventSpawnEnemy. Check for active CombatEncounters at those locations.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Renown award on resolve | Custom point accumulation | `awardRenown(ctx, char, points, reason)` | Handles rank-up announcement, world event post, upsert |
| Faction standing change | Manual table mutation | `mutateStanding(ctx, charId, factionId, delta)` | Handles upsert (find-or-create) correctly |
| Item reward distribution | Custom inventory insert | `addItemToInventory(ctx, charId, templateId, qty)` | Handles stackable merging, slot limits |
| Scheduled despawn | Polling scheduler | `EventDespawnTick` table + scheduled reducer | Existing pattern for all timed ops |
| World log entry | Custom event table | `appendWorldEvent(ctx, kind, message)` | Already wired to EventWorld with trim logic |
| Combat-kill contribution tracking | Separate kill listener | Call `contribute_event` inside existing combat kill resolution | Keep kill logic co-located with combat reducers |

**Key insight:** The helper layer handles all reward edge cases. Event resolution is orchestration — calling the right helpers in the right order — not new infrastructure.

---

## Common Pitfalls

### Pitfall 1: Zero-Contribution Region Presence Gets Rewards

**What goes wrong:** A character walks into the region, gets an `EventContribution` row, and receives Bronze-tier rewards at resolve even with `count = 0`.

**Why it happens:** Creating the row on region entry and not guarding the reward loop on `count >= 1`.

**How to avoid:** At resolve time: `if (contrib.count === 0n) continue;` before all reward logic. Only Bronze threshold (minimum 1 interaction) unlocks any reward.

**Warning signs:** All characters in region receiving rewards without combat/collect logs.

### Pitfall 2: Double-Resolve on Threshold Race

**What goes wrong:** The event resolves twice (two consequence applications, two resolve log entries).

**Why it happens:** SpacetimeDB reducers are single-threaded per DB, so no true race condition. But if `increment_event_counter` calls `resolveWorldEvent` and a second call arrives before the status update commits within the same reducer, it could branch again.

**How to avoid:** First line of `resolveWorldEvent`: `if (eventRow.status !== 'active') return;`. Re-read the event row from DB before checking, do not rely on function parameter if called from within a loop.

**Warning signs:** `consequenceText` written twice, two EventWorld log entries for same event resolve.

### Pitfall 3: Ghost Enemy Spawns After Despawn

**What goes wrong:** `EventSpawnEnemy` rows deleted, but linked `EnemySpawn` rows remain, leaving enemies accessible in locations after event ends.

**Why it happens:** `EventSpawnEnemy` is a reference table. The actual spawn is in `EnemySpawn`.

**How to avoid:** In `despawn_event_content`: (1) collect all `spawnId` values from `EventSpawnEnemy.by_event`, (2) for each `spawnId`, delete `EnemySpawnMember` rows via `by_spawn` index, (3) delete `EnemySpawn` row, (4) delete `EventSpawnEnemy` row. If any spawn has an active `CombatEncounter`, force-resolve the combat before deleting.

**Warning signs:** Players reporting enemies still present after event resolution banner.

### Pitfall 4: History Tab Uses Trimmed EventWorld Rows

**What goes wrong:** History tab is empty after an hour even though events resolved.

**Why it happens:** Developer used `EventWorld` (trimmed at 1 hour / 200 rows) as History data source instead of `WorldEvent` table rows.

**How to avoid:** History tab reads `worldEventRows.value.filter(r => r.status === 'success' || r.status === 'failed')` — these rows are permanent, never trimmed.

**Warning signs:** History tab working initially but emptying over time.

### Pitfall 5: Admin Identity Mismatch Across Environments

**What goes wrong:** `fire_world_event` always throws "Admin only" in production (maincloud).

**Why it happens:** Admin identity hex differs between local dev (different `spacetime login`) and maincloud.

**How to avoid:** Before publishing to maincloud, run `spacetime identity show` while logged in as maincloud user to get the correct hex. Document this in the data constant file as a comment. Consider an `AdminConfig` table seeded at init as a more maintainable alternative.

**Warning signs:** Admin reducer always throwing; local test works but maincloud fails.

### Pitfall 6: Region Entry Hooks in move_character

**What goes wrong:** Hooking contribution registration inside `move_character` reducer causes issues if the event is in a multi-location region (character needs to match region, not exact location).

**Why it happens:** `WorldEvent` has a `regionId`, but `Character` has a `locationId`. The join is `location.regionId === event.regionId`.

**How to avoid:** In `move_character`, after updating `character.locationId`, check if any active world event has `regionId === toLocation.regionId`. If yes and character not already contributing, insert `EventContribution` with `count = 0`. Use `by_character` index on `EventContribution` to avoid duplicates.

---

## Code Examples

### Firing a World Event (reducer outline)

```typescript
// Source: existing reducer patterns in spacetimedb/src/reducers/
spacetimedb.reducer('fire_world_event', { eventKey: t.string() }, (ctx, { eventKey }) => {
  if (!ADMIN_IDENTITIES.has(ctx.sender.toHexString())) {
    throw new SenderError('Admin only');
  }

  const eventDef = WORLD_EVENT_DEFINITIONS[eventKey];
  if (!eventDef) throw new SenderError(`Unknown event: ${eventKey}`);

  // One-time check: prevent re-firing resolved one-time events
  if (!eventDef.isRecurring) {
    for (const row of ctx.db.worldEvent.by_status.filter('active')) {
      if (row.eventKey === eventKey) throw new SenderError('Event already active');
    }
    // Also check resolved states via status index
  }

  const deadlineAtMicros = eventDef.failureConditionType === 'time'
    ? ctx.timestamp.microsSinceUnixEpoch + eventDef.durationMicros
    : undefined;

  const eventRow = ctx.db.worldEvent.insert({
    id: 0n,
    eventKey,
    name: eventDef.name,
    regionId: eventDef.regionId,
    status: 'active',
    isRecurring: eventDef.isRecurring,
    firedAt: ctx.timestamp,
    resolvedAt: undefined,
    failureConditionType: eventDef.failureConditionType,
    deadlineAtMicros,
    successThreshold: eventDef.successThreshold,
    failureThreshold: eventDef.failureThreshold,
    successCounter: 0n,
    failureCounter: 0n,
    successConsequenceType: eventDef.successConsequenceType,
    successConsequencePayload: eventDef.successConsequencePayload,
    failureConsequenceType: eventDef.failureConsequenceType,
    failureConsequencePayload: eventDef.failureConsequencePayload,
    rewardTiersJson: JSON.stringify(eventDef.rewardTiers),
    consequenceText: eventDef.consequenceTextStub,
  });

  spawnEventContent(ctx, eventRow.id, eventDef, deps);
  appendWorldEvent(ctx, 'world_event', `A world event has begun: ${eventDef.name}!`);
});
```

### Resolving a World Event (helper outline)

```typescript
// spacetimedb/src/helpers/world_events.ts
export function resolveWorldEvent(
  ctx: any, eventRow: any, outcome: 'success' | 'failure', deps: any
) {
  if (eventRow.status !== 'active') return; // guard

  ctx.db.worldEvent.id.update({
    ...eventRow,
    status: outcome,
    resolvedAt: ctx.timestamp,
  });

  applyConsequence(ctx, eventRow, outcome);

  const msg = outcome === 'success'
    ? `The world event "${eventRow.name}" ended in success!`
    : `The world event "${eventRow.name}" has failed. The world darkens.`;
  appendWorldEvent(ctx, 'world_event', msg);

  // Distribute rewards to all contributors
  const rewardTiers = JSON.parse(eventRow.rewardTiersJson);
  for (const contrib of ctx.db.eventContribution.by_event.filter(eventRow.id)) {
    if (contrib.count === 0n) continue; // zero contribution = no reward

    const tier = contrib.count >= BigInt(rewardTiers.gold.threshold) ? 'gold'
               : contrib.count >= BigInt(rewardTiers.silver.threshold) ? 'silver'
               : 'bronze';
    const tierReward = outcome === 'success'
      ? rewardTiers[tier].success
      : rewardTiers[tier].failure;

    const character = ctx.db.character.id.find(contrib.characterId);
    if (!character) continue;

    if (tierReward.renown > 0) {
      deps.awardRenown(ctx, character, BigInt(tierReward.renown),
        `World Event: ${eventRow.name} (${tier})`);
    }
    if (tierReward.gold > 0) {
      ctx.db.character.id.update({ ...character, gold: character.gold + BigInt(tierReward.gold) });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
        `World Event reward: ${tierReward.gold} gold (${tier}).`);
    }
    if (tierReward.factionId && tierReward.factionAmount > 0) {
      deps.mutateStanding(ctx, character.id,
        BigInt(tierReward.factionId), BigInt(tierReward.factionAmount));
    }
    if (tierReward.itemTemplateKey) {
      // resolve template by name, award item
    }
  }

  // Schedule 2-minute content despawn
  ctx.db.eventDespawnTick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 120_000_000n),
    eventId: eventRow.id,
  });
}
```

### World Event Data Constant Structure

```typescript
// spacetimedb/src/data/world_event_data.ts
export type RewardSpec = {
  renown: number;
  gold: number;
  factionId: number | null;
  factionAmount: number;
  itemTemplateKey: string | null;
};

export type TierSpec = {
  threshold: number;       // contribution count needed for this tier
  success: RewardSpec;
  failure: RewardSpec;
};

export type WorldEventDefinition = {
  name: string;
  regionId: bigint;         // NOTE: see Open Questions re: stable IDs
  isRecurring: boolean;
  failureConditionType: 'time' | 'threshold_race';
  durationMicros?: bigint;          // for time-based
  successThreshold?: bigint;        // for threshold_race
  failureThreshold?: bigint;
  successConsequenceType: string;
  successConsequencePayload: string;
  failureConsequenceType: string;
  failureConsequencePayload: string;
  consequenceTextStub?: string;
  rewardTiers: { bronze: TierSpec; silver: TierSpec; gold: TierSpec };
  contentLocations: Array<{
    locationId: bigint;
    enemies: Array<{ enemyTemplateKey: string; count: number }>;
    items: Array<{ itemTemplateKey: string; count: number }>;
  }>;
};

export const ADMIN_IDENTITIES = new Set<string>([
  // Add admin identity hex strings here
  // Run: spacetime identity show
]);

export const WORLD_EVENT_DEFINITIONS: Record<string, WorldEventDefinition> = {
  ashen_awakening: {
    name: 'The Ashen Awakening',
    regionId: 2n,
    isRecurring: false,
    failureConditionType: 'time',
    durationMicros: 3_600_000_000n, // 1 hour
    successConsequenceType: 'race_unlock',
    successConsequencePayload: 'Hollowed',
    failureConsequenceType: 'enemy_composition_change',
    failureConsequencePayload: JSON.stringify({ regionKey: 'ashlands', addEnemyKeys: ['ash_revenant'] }),
    consequenceTextStub: 'The ashen ritual either awakens a new form of life... or curses the land with greater darkness.',
    rewardTiers: {
      bronze: {
        threshold: 1,
        success: { renown: 50, gold: 100, factionId: null, factionAmount: 0, itemTemplateKey: null },
        failure: { renown: 10, gold: 20, factionId: null, factionAmount: 0, itemTemplateKey: null },
      },
      silver: {
        threshold: 5,
        success: { renown: 150, gold: 300, factionId: 3, factionAmount: 25, itemTemplateKey: null },
        failure: { renown: 25, gold: 50, factionId: null, factionAmount: 0, itemTemplateKey: null },
      },
      gold: {
        threshold: 15,
        success: { renown: 400, gold: 750, factionId: 3, factionAmount: 75, itemTemplateKey: 'ash_medallion' },
        failure: { renown: 60, gold: 100, factionId: null, factionAmount: 0, itemTemplateKey: null },
      },
    },
    contentLocations: [
      {
        locationId: 12n,
        enemies: [{ enemyTemplateKey: 'ash_shade', count: 3 }],
        items: [{ itemTemplateKey: 'ash_shard', count: 5 }],
      },
    ],
  },
};
```

### Client: useGameData.ts Additions

```typescript
// Add these lines to useGameData.ts alongside existing useTable calls
const [worldEventRows] = useTable(tables.worldEvent);
const [eventContributions] = useTable(tables.eventContribution);
const [eventSpawnEnemies] = useTable(tables.eventSpawnEnemy);
const [eventSpawnItems] = useTable(tables.eventSpawnItem);
const [eventObjectives] = useTable(tables.eventObjective);
// Also add my_event_contributions view table when bindings are regenerated
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Geographic event cascade to neighbors | Permanent world state change on resolve | Phase 18 design | RegionAdjacency not needed at all |
| Proportional reward scaling | Fixed Bronze/Silver/Gold tier rewards | Phase 18 design | Simpler to balance, more accessible |
| Ad hoc admin calls | Dedicated `fire_world_event` reducer with guard | Phase 18 | Clean admin interface |

**No deprecated SDK patterns apply** — codebase is current with SpacetimeDB 1.11.x and SDK rules documented in CLAUDE.md.

---

## Open Questions

1. **Stable Region IDs in data constants**
   - What we know: `Region` table uses `autoInc` primary key; IDs are not deterministic across `--clear-database` republish.
   - What's unclear: Whether region IDs will be stable in practice (same seed order = same IDs).
   - Recommendation: Add a `key: t.string()` column to `Region` (e.g. `'ashlands'`) and resolve at event-fire time by iterating `ctx.db.region.iter()` to find by key. This prevents hardcoding numeric IDs in data constants.

2. **In-progress combats on event enemy despawn**
   - What we know: `despawn_event_content` will delete `EnemySpawn` rows, which may have active `CombatEncounter` rows pointing to them.
   - What's unclear: Whether the client handles missing spawn gracefully, or whether server needs to force-resolve combats.
   - Recommendation: In `despawn_event_content`, for each spawn being deleted, check for active `CombatEncounter` at that location. If found, mark it as resolved ('victory') before deleting the spawn. Log a private message to participants.

3. **LLM consequence text implementation**
   - What we know: REQ-034 requires consequence text; "stub acceptable." No existing LLM pipeline exists in the codebase.
   - What's unclear: Whether the intent is to wire up a procedure-based HTTP call or just ship static stubs.
   - Recommendation: Ship static `consequenceTextStub` string per event definition. Write it to `WorldEvent.consequenceText` at fire time. Designate a separate `update_event_consequence_text` reducer (admin-only) for future LLM integration.

4. **EventContribution visibility to other players**
   - What we know: `EventContribution` is `public: true`, meaning all rows visible to all subscribers.
   - What's unclear: Whether it should be private (only the player sees their own contribution count).
   - Recommendation: Use `public: true` and filter client-side. The Alternative (view-based filtering) adds complexity without clear benefit, since contribution counts are not sensitive data. Other players seeing leaderboard-like contribution data enhances social engagement.

5. **Threshold-race events: who calls `increment_event_counter`?**
   - What we know: For villager protection, event enemies killing villagers = failure-side counter; players saving villagers = success-side counter.
   - What's unclear: How "villager death" is tracked — is it from combat resolution, a separate objective mechanic, or manual admin call?
   - Recommendation: `EventObjective` rows with `objectiveType: 'protect_npc'` track villager HP state. When an event enemy kills a villager (detected in combat resolution), call `increment_event_counter({ eventId, side: 'failure', amount: 1n })` from within the combat loop. When a player defeats enemies protecting a villager, call `increment_event_counter({ eventId, side: 'success', amount: 1n })`. The planner should treat "protect objective combat integration" as a discrete task.

---

## Sources

### Primary (HIGH confidence)

- Codebase: `spacetimedb/src/schema/tables.ts` — all existing table patterns, column types, index declarations, `Race.unlocked` column confirmed
- Codebase: `spacetimedb/src/helpers/events.ts` — `appendWorldEvent`, `requirePlayerUserId`, trim logic
- Codebase: `spacetimedb/src/helpers/renown.ts` — `awardRenown` full signature and rank-up behavior
- Codebase: `spacetimedb/src/helpers/economy.ts` — `mutateStanding` upsert pattern
- Codebase: `spacetimedb/src/helpers/items.ts` — `addItemToInventory` including stackable handling
- Codebase: `spacetimedb/src/index.ts` — DI deps object, scheduled table registration, `spacetimedb.init`
- Codebase: `spacetimedb/src/reducers/auth.ts`, `commands.ts`, `movement.ts` — reducer registration DI pattern
- Codebase: `spacetimedb/src/views/events.ts` — view with sender-based per-subscriber filtering
- Codebase: `src/composables/useGameData.ts` — `useTable()` call pattern, full existing table list
- Codebase: `src/components/ActionBar.vue` — button + emit toggle pattern, PanelKey type
- Codebase: `src/components/RenownPanel.vue` — multi-tab panel with inline styles, progress bar pattern
- Codebase: `src/App.vue` — floating panel registration, panel watcher pattern
- Codebase: `src/composables/usePanelManager.ts` — `PanelState` interface, defaults structure
- CLAUDE.md `spacetimedb-typescript.mdc` — SDK rules: view constraints, index rules, `autoInc` placeholder `0n`

### Secondary (MEDIUM confidence)

- Phase 18 CONTEXT.md — locked decisions cross-verified against codebase feasibility
- REQ-030 through REQ-035 — requirements mapped to specific table/reducer implementations above
- Admin identity guard pattern — pragmatic approach; no official SpacetimeDB docs on role-based access verified

### Tertiary (LOW confidence)

- Threshold-race combat integration — design recommendation (Open Question 5) is logical but untested; planner should scope as a discrete task with explicit verification steps.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — verified directly in codebase; no new packages
- Table Schema: HIGH — all column types traced from existing working tables and SDK CLAUDE.md rules
- Architecture Patterns: HIGH — all patterns traced from working existing code
- Pitfalls: HIGH — derived from SDK constraints in CLAUDE.md and codebase analysis
- Admin Guard: MEDIUM — no prior admin system; recommended approach is pragmatic but unverified against SDK edge cases
- Consequence Implementation: MEDIUM — `race_unlock` is trivially implementable (column exists); others depend on resolution of Open Question 1 (stable region IDs)

**Research date:** 2026-02-17
**Valid until:** 2026-03-19 (30 days — SpacetimeDB 1.11.x stable; Vue 3 stable)
