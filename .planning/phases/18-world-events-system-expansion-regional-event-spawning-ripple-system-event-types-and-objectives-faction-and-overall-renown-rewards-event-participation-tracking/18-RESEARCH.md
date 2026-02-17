# Phase 18: World Events System Expansion - Research

**Researched:** 2026-02-17
**Domain:** World events, regional spawning, event participation tracking, renown/faction rewards (SpacetimeDB TypeScript server + Vue 3 client)
**Confidence:** HIGH

## Summary

Phase 18 builds the full world events system on top of the existing foundation from Phases 3, 12, and 17. The codebase already has event logging infrastructure (`EventWorld`, `EventLocation`, `EventPrivate`, `EventGroup` tables and their helper functions), a complete renown system with `awardRenown`/`awardServerFirst` helpers, faction standing with `mutateStanding`, and boss renown via `RENOWN_GAIN`. What is NOT yet built: a `WorldEvent` record table (distinct from the log table), global stat trackers, event objectives, event participation tracking, and the "Ripple" regional cascade system.

The requirements (REQ-030 through REQ-035) define a `WorldEvent` table as a persistent record of fired events (not just a log entry). This is different from the existing `EventWorld` table which is purely an event log for the UI. The phase must add: `WorldEvent` (persistent record), `WorldStatTracker` (threshold counters), `WorldEventParticipant` (who joined), and `RegionAdjacency` (ripple map). The LLM consequence text (REQ-034) requires the `generateContent` procedure, which does not exist in the codebase yet.

The "Ripple system" for regional cascading events means: when one region's event resolves, it can spawn follow-up events in neighboring regions. The world currently has exactly 3 regions seeded in `ensure_world.ts`: `Hollowmere Vale` (starter, dangerMultiplier 100), `Embermarch Fringe` (border, dangerMultiplier 160), and `Embermarch Depths` (dungeon, dangerMultiplier 200). Natural adjacency: Vale -> Fringe -> Depths. In SpacetimeDB terms, ripple is synchronous chaining — a resolution reducer inserts new `WorldEvent` rows for adjacent regions using a seeded `RegionAdjacency` table (name-based lookup avoids hardcoded IDs).

**Primary recommendation:** Add `WorldEvent`, `WorldStatTracker`, `WorldEventParticipant`, and `RegionAdjacency` tables. Use the existing `Region` table for regional scoping. Wire rewards into `awardRenown` and `mutateStanding` which already exist. Implement the Ripple cascade as synchronous chaining within the resolve reducer. Stub the `generateContent` procedure (REQ-034) with a static placeholder string first to validate the procedure API works before wiring up real LLM calls.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SpacetimeDB TypeScript SDK | 1.12.0 | Backend tables, reducers, views, scheduled tables | Project's chosen server architecture |
| Vue 3 | 3.5.13 | Frontend UI | Project's established frontend framework |
| TypeScript | ~5.6.2 | Type-safe code | Project standard throughout |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | N/A | No external libraries needed | Pure SpacetimeDB + Vue 3 implementation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Synchronous ripple chaining | Scheduled table cascade | Synchronous is simpler, avoids timing issues; use scheduled only if delay between ripple waves is desired |
| RegionAdjacency table | Hardcoded ID map in data file | Table is ID-stable across republish; hardcoded IDs break on `--clear-database` |

**Installation:**

No new dependencies required.

## Architecture Patterns

### Recommended Project Structure

New files to create:

```
spacetimedb/src/
├── schema/
│   └── tables.ts              # Add WorldEvent, WorldStatTracker, WorldEventParticipant, RegionAdjacency
├── data/
│   └── world_event_data.ts    # Event type definitions, threshold configs, region adjacency seed data
├── helpers/
│   └── world_events.ts        # fireWorldEvent(), incrementWorldStat(), resolveWorldEvent(), rippleToNeighbors()
└── reducers/
    └── world_events.ts        # fire_world_event, resolve_world_event, join_world_event reducers

src/components/
└── WorldEventPanel.vue        # New panel for active/resolved events
```

Existing files to modify:

```
spacetimedb/src/schema/tables.ts          # Add new tables, export from schema()
spacetimedb/src/index.ts                  # Import and register world event reducers
spacetimedb/src/reducers/combat.ts        # Hook: incrementWorldStat on enemy kill
spacetimedb/src/reducers/quests.ts        # Hook: incrementWorldStat on quest completion
spacetimedb/src/seeding/ensure_world.ts   # Add seedRegionAdjacency() call
src/composables/useGameData.ts            # Add useTable calls for new tables
src/App.vue                               # Wire WorldEventPanel into panel system
```

### Pattern 1: WorldEvent Table (Persistent Record vs. Log)

**What:** `WorldEvent` stores a persistent record of an event's lifecycle (fired, active, resolved). This is SEPARATE from `EventWorld` which is just a log message for the UI.

**When to use:** Any time you need to query "what events are currently active" or "has event X been resolved", use `WorldEvent`. Use `EventWorld` only for appending log messages the player sees.

**Critical naming distinction:**
- `event_world` (existing) = UI log table, trimmed after 1 hour/200 rows. Only for display.
- `world_event` (new) = persistent state record. Use for game logic.

**Example:**

```typescript
// spacetimedb/src/schema/tables.ts
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
    eventType: t.string(),          // e.g., 'race_unlock', 'invasion', 'ritual'
    targetId: t.string(),           // Polymorphic: race name, region name, etc.
    triggerCondition: t.string(),   // 'admin' | 'kills_threshold' | 'ripple'
    status: t.string(),             // 'fired' | 'resolved'
    regionId: t.u64().optional(),   // null = global, set = regional event
    firedAt: t.timestamp(),
    resolvedAt: t.timestamp().optional(),
    objectiveTarget: t.u64().optional(),  // e.g., kill 50 enemies
    objectiveCurrent: t.u64().optional(), // progress counter
    rewardRenown: t.u64().optional(),     // renown per participant on resolve
    rewardFactionId: t.u64().optional(),  // faction to reward
    rewardFactionStanding: t.i64().optional(), // standing delta per participant
  }
);
```

**Source:** REQ-030 defines the base fields. Regional and reward fields are additions for Phase 18 scope.

### Pattern 2: WorldStatTracker Table (Threshold-Triggered Events, REQ-032)

**What:** Server-wide stat counters. When a threshold is crossed, `fireWorldEvent` is called automatically. Each tracker has a key, a running value, and a next-threshold that triggers an event.

**Example:**

```typescript
// spacetimedb/src/schema/tables.ts
export const WorldStatTracker = table(
  { name: 'world_stat_tracker', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    statKey: t.string(),        // 'total_enemies_killed' | 'total_quests_completed'
    currentValue: t.u64(),
    nextThreshold: t.u64(),     // fire event when currentValue >= nextThreshold
    eventType: t.string(),      // event type to fire
    targetId: t.string(),       // targetId for the fired event
    thresholdStep: t.u64(),     // increment nextThreshold by this after each fire
  }
);
```

**Key insight from REQ-032:** After firing, increment `nextThreshold` by `thresholdStep` so the event repeats on future crossings. Example: threshold 1000, step 1000 -> fires at 1000, 2000, 3000, etc.

Seed trackers during `syncAllContent`:

```typescript
// spacetimedb/src/seeding/ensure_content.ts
function ensureWorldStatTrackers(ctx: any) {
  const trackers = [
    { statKey: 'total_enemies_killed', nextThreshold: 1000n, thresholdStep: 1000n,
      eventType: 'invasion', targetId: 'Embermarch Fringe' },
    { statKey: 'total_quests_completed', nextThreshold: 50n, thresholdStep: 50n,
      eventType: 'ritual', targetId: 'global' },
  ];
  for (const def of trackers) {
    const exists = [...ctx.db.worldStatTracker.iter()].some(r => r.statKey === def.statKey);
    if (!exists) {
      ctx.db.worldStatTracker.insert({
        id: 0n, currentValue: 0n, ...def,
      });
    }
  }
}
```

The `incrementWorldStat` helper (called in combat/quest reducers):

```typescript
// spacetimedb/src/helpers/world_events.ts
export function incrementWorldStat(ctx: any, statKey: string, delta: bigint) {
  for (const tracker of ctx.db.worldStatTracker.iter()) {
    if (tracker.statKey !== statKey) continue;
    const newValue = tracker.currentValue + delta;
    if (newValue >= tracker.nextThreshold) {
      ctx.db.worldStatTracker.id.update({
        ...tracker,
        currentValue: newValue,
        nextThreshold: tracker.nextThreshold + tracker.thresholdStep,
      });
      fireWorldEvent(ctx, tracker.eventType, tracker.targetId, 'kills_threshold');
    } else {
      ctx.db.worldStatTracker.id.update({ ...tracker, currentValue: newValue });
    }
    return;
  }
}
```

**Warning:** `.iter()` is valid in reducers (NOT in views). Calling `ctx.db.worldStatTracker.iter()` inside a reducer is correct and allowed.

### Pattern 3: WorldEventParticipant Table

**What:** Tracks which characters explicitly joined an event, when, and their contribution (for scaled rewards on resolution).

**Example:**

```typescript
// spacetimedb/src/schema/tables.ts
export const WorldEventParticipant = table(
  {
    name: 'world_event_participant',
    public: true,
    indexes: [
      { name: 'by_event', algorithm: 'btree', columns: ['worldEventId'] },
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    worldEventId: t.u64(),
    characterId: t.u64(),
    joinedAt: t.timestamp(),
    contribution: t.u64(),  // incremented by kills/actions during the event
  }
);
```

**Participation tracking flow:**

1. Character calls `join_world_event` reducer -> inserts `WorldEventParticipant` row
2. While event is `'fired'`, combat kills in that event's region increment `contribution` on the participant row (only for joined participants)
3. On `resolveWorldEvent`, iterate `by_event` participants, compute scaled renown, call `awardRenown` per participant

**Contribution increment hook in combat:**

```typescript
// spacetimedb/src/helpers/world_events.ts
export function creditEventContribution(ctx: any, characterId: bigint, regionId: bigint, delta: bigint) {
  // Find any active events in this region
  for (const event of ctx.db.worldEvent.by_region.filter(regionId)) {
    if (event.status !== 'fired') continue;
    // Check if character is a participant
    for (const participant of ctx.db.worldEventParticipant.by_character.filter(characterId)) {
      if (participant.worldEventId !== event.id) continue;
      ctx.db.worldEventParticipant.id.update({
        ...participant,
        contribution: participant.contribution + delta,
      });
      // Auto-resolve if objective complete
      if (event.objectiveTarget && event.objectiveCurrent !== undefined) {
        const updatedEvent = ctx.db.worldEvent.id.find(event.id);
        if (updatedEvent && updatedEvent.objectiveCurrent >= updatedEvent.objectiveTarget) {
          resolveWorldEvent(ctx, updatedEvent);
        }
      }
    }
  }
}
```

### Pattern 4: Ripple System (Regional Cascade)

**What:** When an event resolves in one region, it triggers related events in neighboring regions. Ripple is synchronous chaining — the resolution reducer creates new `WorldEvent` rows for adjacent regions.

**Known world layout (from `spacetimedb/src/seeding/ensure_world.ts`):**
- `Hollowmere Vale` — starter region (dangerMultiplier 100)
- `Embermarch Fringe` — border region (dangerMultiplier 160)
- `Embermarch Depths` — dungeon region (dangerMultiplier 200)

Natural ripple direction: Vale -> Fringe -> Depths (escalating danger).

**Why NOT hardcode IDs:** Auto-increment IDs change on `spacetime publish --clear-database`. Use name-based seeding instead.

**RegionAdjacency table:**

```typescript
// spacetimedb/src/schema/tables.ts
export const RegionAdjacency = table(
  {
    name: 'region_adjacency',
    public: true,
    indexes: [{ name: 'by_region', algorithm: 'btree', columns: ['regionId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    regionId: t.u64(),
    neighborRegionId: t.u64(),
  }
);
```

**Seed adjacency in `ensureWorldLayout`:**

```typescript
// spacetimedb/src/seeding/ensure_world.ts
function seedRegionAdjacency(ctx: any) {
  const regions = [...ctx.db.region.iter()];
  const byName = new Map(regions.map(r => [r.name, r.id]));
  // Bidirectional adjacency for the 3 known regions
  const adjacencyDef = [
    { a: 'Hollowmere Vale', b: 'Embermarch Fringe' },
    { a: 'Embermarch Fringe', b: 'Embermarch Depths' },
  ];
  for (const { a, b } of adjacencyDef) {
    const aId = byName.get(a);
    const bId = byName.get(b);
    if (!aId || !bId) continue;
    // Check if already seeded to avoid duplicates
    const exists = [...ctx.db.regionAdjacency.by_region.filter(aId)]
      .some(r => r.neighborRegionId === bId);
    if (!exists) {
      ctx.db.regionAdjacency.insert({ id: 0n, regionId: aId, neighborRegionId: bId });
      ctx.db.regionAdjacency.insert({ id: 0n, regionId: bId, neighborRegionId: aId });
    }
  }
}
```

**Ripple helper:**

```typescript
// spacetimedb/src/helpers/world_events.ts
export function rippleToNeighbors(ctx: any, resolvedEvent: any, rippleEventType: string) {
  if (!resolvedEvent.regionId) return; // global events don't ripple
  for (const adj of ctx.db.regionAdjacency.by_region.filter(resolvedEvent.regionId)) {
    // Don't re-fire in same region
    if (adj.neighborRegionId === resolvedEvent.regionId) continue;
    fireWorldEvent(ctx, rippleEventType, String(adj.neighborRegionId), 'ripple', adj.neighborRegionId);
  }
}
```

### Pattern 5: fireWorldEvent Helper

**What:** Central function to insert a `WorldEvent` row and append the required `EventWorld` log entry (REQ-033).

**Example:**

```typescript
// spacetimedb/src/helpers/world_events.ts
import { appendWorldEvent } from './events';

export function fireWorldEvent(
  ctx: any,
  eventType: string,
  targetId: string,
  triggerCondition: string,
  regionId?: bigint,
  options?: {
    objectiveTarget?: bigint;
    rewardRenown?: bigint;
    rewardFactionId?: bigint;
    rewardFactionStanding?: bigint;
  }
) {
  const event = ctx.db.worldEvent.insert({
    id: 0n,
    eventType,
    targetId,
    triggerCondition,
    status: 'fired',
    regionId,
    firedAt: ctx.timestamp,
    resolvedAt: undefined,
    objectiveTarget: options?.objectiveTarget,
    objectiveCurrent: options?.objectiveTarget ? 0n : undefined,
    rewardRenown: options?.rewardRenown,
    rewardFactionId: options?.rewardFactionId,
    rewardFactionStanding: options?.rewardFactionStanding,
  });

  // REQ-033: append EventWorld log entry visible to all players
  const regionLabel = regionId ? ` in a nearby region` : '';
  appendWorldEvent(ctx, 'EventWorld', `A world event has begun${regionLabel}: ${eventType}`);

  return event;
}
```

### Pattern 6: Admin-Only fire_world_event Reducer (REQ-031)

**What:** Admin-triggered world events. No existing admin mechanism in the codebase — must be introduced.

**Codebase fact:** Searching all reducers finds no existing admin check. The `User` table has `id`, `email`, `createdAt` — no role field. The `Player` table has no role field either.

**Recommended approach:** Add a config constant `ADMIN_IDENTITY` in a new `src/config.ts` file (or existing location). During testing, set it to the admin player's SpacetimeDB identity hex. This avoids schema changes.

```typescript
// spacetimedb/src/data/world_event_data.ts
// Admin identity hex — set to the admin player's identity (from `spacetime identity list`)
export const ADMIN_IDENTITY = 'YOUR_ADMIN_IDENTITY_HEX_HERE';

// spacetimedb/src/reducers/world_events.ts
spacetimedb.reducer('fire_world_event', {
  eventType: t.string(),
  targetId: t.string(),
  regionId: t.u64().optional(),
}, (ctx: any, { eventType, targetId, regionId }: any) => {
  const senderHex = ctx.sender.toHex();
  if (senderHex !== ADMIN_IDENTITY) {
    throw new SenderError('Admin only');
  }
  fireWorldEvent(ctx, eventType, targetId, 'admin', regionId);
});
```

**Alternative (simpler for testing):** Skip the admin guard entirely for initial implementation and add it as a follow-up hardening task. Use `grant_test_renown` pattern (no auth check) as precedent.

### Pattern 7: race_unlock Event Consequence (REQ-035)

**What:** When `eventType === 'race_unlock'`, on resolution set `Race.unlocked = true` for the race named in `targetId`.

**Example:**

```typescript
// spacetimedb/src/helpers/world_events.ts
export function applyEventConsequence(ctx: any, event: any) {
  if (event.eventType === 'race_unlock') {
    // targetId is the race name (more stable than ID across republish)
    for (const race of ctx.db.race.iter()) {
      if (race.name === event.targetId) {
        ctx.db.race.id.update({ ...race, unlocked: true });
        appendWorldEvent(ctx, 'world', `The ${race.name} race is now unlocked!`);
        break;
      }
    }
  }
  // Extend here for future eventType consequences
}
```

### Anti-Patterns to Avoid

- **Querying EventWorld for active events:** `EventWorld` is trimmed after 1 hour/200 rows. It is not a state store. Use `WorldEvent` for state.
- **iter() in views:** Views cannot use `.iter()`. Make `WorldEvent` table `public: true` and let the client filter active events in Vue computed properties.
- **Multi-column indexes:** Do not create `[regionId, status]` composite indexes — broken in this SDK. Use single-column indexes (`by_status`, `by_region`) and filter the second dimension in TypeScript.
- **Storing participant contribution in EventWorld:** EventWorld is ephemeral. Use `WorldEventParticipant` for durable per-character data.
- **Return values from reducers:** `fire_world_event` cannot return the new event ID to the client. The client reads the newly inserted row via subscription.
- **LLM in reducers:** `generateContent` (REQ-034) requires a procedure. Reducers cannot make HTTP calls. See Pitfall 5.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Renown award on participation | Custom renown logic | `awardRenown(ctx, character, points, reason)` from `helpers/renown.ts` | Already built in Phase 12 |
| Faction standing award | Custom standing logic | `mutateStanding(ctx, characterId, factionId, delta)` from `helpers/economy.ts` | Already built in Phase 3 |
| World log messages | Custom event logging | `appendWorldEvent(ctx, kind, message)` from `helpers/events.ts` | Already built, handles trimming |
| Server-first bonus | Custom position tracking | `awardServerFirst(ctx, character, category, key, baseRenown)` from `helpers/renown.ts` | Already built in Phase 12 |
| Scheduled event ticks | Custom timer logic | SpacetimeDB scheduled table + `ScheduleAt` | Platform-native, avoids external timers |
| HTTP in reducers | Calling LLM from reducer | `spacetimedb.procedure` with `ctx.http.fetch` | Only procedures support HTTP; reducers must be deterministic |

**Key insight:** The reward infrastructure (renown, faction standing, world log) is already built. Phase 18 wires new event lifecycle into existing helpers. The delta from Phase 12 is primarily: new tables + new reducers + combat/quest hook additions.

## Common Pitfalls

### Pitfall 1: Confusing EventWorld (log) with WorldEvent (record)

**What goes wrong:** Querying `ctx.db.eventWorld` for active events — it's an append-only log, trimmed to 200 rows and 1 hour. State disappears.

**Why it happens:** Both names contain "World" and "Event". The distinction is subtle.

**How to avoid:** Use `ctx.db.worldEvent` for game state queries. Use `appendWorldEvent(ctx, kind, msg)` only to emit UI messages.

**Warning signs:** "Active events" show nothing after 1 hour. State lost on server restart if relying on log.

### Pitfall 2: iter() in Views

**What goes wrong:** A view returning all active world events via `.iter()` throws.

**Why it happens:** Views can only access data via index lookups, not full table scans.

**How to avoid:** Make `WorldEvent` public and let the client filter:

```typescript
// ❌ WRONG — view cannot iter
spacetimedb.view({ name: 'active_events', public: true }, t.array(WorldEvent.rowType), (ctx) => {
  return [...ctx.db.worldEvent.iter()].filter(e => e.status === 'fired'); // FORBIDDEN
});

// ✅ RIGHT — public table, client filters in Vue
// tables.ts: WorldEvent with public: true
// useGameData.ts: const [worldEvents] = useTable(tables.worldEvent);
// Component: const activeEvents = computed(() => worldEvents.value.filter(e => e.status === 'fired'));
```

### Pitfall 3: Multi-Column Index on WorldEvent

**What goes wrong:** `indexes: [{ name: 'by_region_status', columns: ['regionId', 'status'] }]` causes PANIC.

**Why it happens:** Multi-column indexes are broken in the SpacetimeDB TypeScript SDK (documented in CLAUDE.md).

**How to avoid:** Use separate single-column indexes. Filter second dimension in TypeScript:

```typescript
// ❌ WRONG
ctx.db.worldEvent.by_region_status.filter(regionId, 'fired');

// ✅ RIGHT
for (const event of ctx.db.worldEvent.by_region.filter(regionId)) {
  if (event.status !== 'fired') continue;
  // process event
}
```

### Pitfall 4: Region ID Hardcoding in Adjacency Map

**What goes wrong:** Hardcoding region IDs like `{ 1: [2, 3] }`. After `spacetime publish --clear-database`, IDs change and the map is wrong.

**Why it happens:** Auto-increment IDs are not stable across republish (gaps are normal per CLAUDE.md).

**How to avoid:** Use the `RegionAdjacency` table seeded by name during `ensureWorldLayout`. The seed function looks up IDs dynamically each time.

### Pitfall 5: LLM in a Reducer Context (REQ-034)

**What goes wrong:** Calling `generateContent` from a reducer throws because HTTP is not available.

**Why it happens:** Reducers must be deterministic. HTTP calls are non-deterministic.

**How to avoid:** Implement `generateContent` as a `spacetimedb.procedure`, not a reducer. The procedure uses `ctx.withTx` for all DB writes.

```typescript
// ✅ Pattern for LLM consequence text (beta API — stub first)
spacetimedb.procedure('generate_event_consequence', { worldEventId: t.u64() }, t.string(), (ctx, { worldEventId }) => {
  // Stub: return placeholder until LLM is wired
  const placeholder = `The world trembles as event ${worldEventId} reshapes fate.`;
  ctx.withTx(tx => {
    tx.db.eventWorld.insert({ id: 0n, kind: 'EventWorld', message: placeholder, createdAt: tx.timestamp });
  });
  return placeholder;
});
```

**Deferral recommendation:** Stub first. The world event system works fully without LLM text. Add real LLM call in a follow-up task after validating the procedure API compiles and runs.

### Pitfall 6: Admin Identity Without Mechanism

**What goes wrong:** Any player can call `fire_world_event` because no admin check exists.

**Why it happens:** No existing admin mechanism in the codebase.

**How to avoid:** For initial implementation, hardcode admin identity hex from `spacetime identity list` in a config constant. Gate the reducer on `ctx.sender.toHex() === ADMIN_IDENTITY`.

Alternative for rapid development: use the `grant_test_renown` pattern (no guard) and gate it with a "testing only" note, adding proper auth as a hardening task.

### Pitfall 7: Objective Completion Race Conditions

**What goes wrong:** Two simultaneous reducers both see `objectiveCurrent < objectiveTarget`, both call `resolveWorldEvent`, event is resolved twice and rewards are doubled.

**Why it happens:** SpacetimeDB reducers are transactional but if two fire simultaneously, both read the old state before either writes.

**How to avoid:** Check `status === 'fired'` at the start of `resolveWorldEvent` and bail if already `'resolved'`:

```typescript
export function resolveWorldEvent(ctx: any, event: any) {
  const current = ctx.db.worldEvent.id.find(event.id);
  if (!current || current.status !== 'fired') return; // idempotent guard
  // ... proceed with resolution
}
```

### Pitfall 8: WorldEventParticipant by_event vs by_character Index Direction

**What goes wrong:** Using `by_character` to find a participant's contribution for an event, iterating ALL events for that character, slow and error-prone.

**Why it happens:** When resolving, you need "all participants for event X" — use `by_event`. When checking "did character Y join event Z" — use `by_character` then filter by worldEventId manually (single-column index limitation).

**How to avoid:**
- Resolution loop: `ctx.db.worldEventParticipant.by_event.filter(event.id)` — correct
- Join check: `[...ctx.db.worldEventParticipant.by_character.filter(characterId)].find(p => p.worldEventId === eventId)` — correct

## Code Examples

Verified patterns from existing codebase:

### Inserting a WorldEvent and Logging It (REQ-033)

```typescript
// spacetimedb/src/helpers/world_events.ts
// Source: appendWorldEvent pattern from helpers/events.ts (line 66)
export function fireWorldEvent(ctx: any, eventType: string, targetId: string, triggerCondition: string, regionId?: bigint) {
  const event = ctx.db.worldEvent.insert({
    id: 0n,
    eventType,
    targetId,
    triggerCondition,
    status: 'fired',
    regionId,
    firedAt: ctx.timestamp,
    resolvedAt: undefined,
  });
  appendWorldEvent(ctx, 'EventWorld', `World event fired: ${eventType} (${triggerCondition})`);
  return event;
}
```

### Resolving an Event and Awarding Rewards

```typescript
// spacetimedb/src/helpers/world_events.ts
// Source: awardRenown from helpers/renown.ts, mutateStanding from helpers/economy.ts
export function resolveWorldEvent(ctx: any, eventIn: any) {
  // Idempotent guard
  const event = ctx.db.worldEvent.id.find(eventIn.id);
  if (!event || event.status !== 'fired') return;

  ctx.db.worldEvent.id.update({ ...event, status: 'resolved', resolvedAt: ctx.timestamp });

  // Award rewards to all joined participants
  for (const participant of ctx.db.worldEventParticipant.by_event.filter(event.id)) {
    const character = ctx.db.character.id.find(participant.characterId);
    if (!character) continue;

    if (event.rewardRenown) {
      let renownAmount = event.rewardRenown;
      if (event.objectiveTarget && event.objectiveTarget > 0n) {
        // Scale by contribution ratio, minimum 10%
        const scale = participant.contribution * 100n / event.objectiveTarget;
        renownAmount = (event.rewardRenown * (scale < 10n ? 10n : scale)) / 100n;
      }
      awardRenown(ctx, character, renownAmount, `World event: ${event.eventType}`);
    }

    if (event.rewardFactionId && event.rewardFactionStanding) {
      mutateStanding(ctx, character.id, event.rewardFactionId, event.rewardFactionStanding);
    }
  }

  applyEventConsequence(ctx, event);
  appendWorldEvent(ctx, 'EventWorld', `World event resolved: ${event.eventType}`);
  rippleToNeighbors(ctx, event, 'invasion'); // fire ripple events in adjacent regions
}
```

### Combat Hook: Stat Increment and Contribution Credit

```typescript
// spacetimedb/src/reducers/combat.ts — add after existing grantFactionStandingForKill call
// Source: grantFactionStandingForKill pattern (helpers/economy.ts, line 16)
incrementWorldStat(ctx, 'total_enemies_killed', 1n);
creditEventContribution(ctx, character.id, character_location_regionId, 1n);
```

Note: `character.locationId` links to `Location.regionId`. The combat helper must look up the character's location's regionId to call `creditEventContribution`.

### Vue Client: Subscribing to WorldEvent

```typescript
// src/composables/useGameData.ts — add alongside existing useTable calls
const [worldEventRows] = useTable(tables.worldEvent);
const [worldEventParticipants] = useTable(tables.worldEventParticipant);
const [regionAdjacencies] = useTable(tables.regionAdjacency);

// In WorldEventPanel.vue:
const activeEvents = computed(() =>
  worldEventRows.value.filter(e => e.status === 'fired')
);
const myParticipation = computed(() => {
  if (!selectedCharacter.value) return new Set<bigint>();
  const joined = worldEventParticipants.value.filter(
    p => p.characterId === selectedCharacter.value!.id
  );
  return new Set(joined.map(p => p.worldEventId));
});
```

### Calling Reducers from Client

```typescript
// Source: CLAUDE.md object syntax pattern
// Fire world event (admin)
conn.reducers.fireWorldEvent({ eventType: 'invasion', targetId: 'Embermarch Fringe' });

// Join event
conn.reducers.joinWorldEvent({ worldEventId: event.id, characterId: character.id });

// Resolve event (admin or auto via objective completion)
conn.reducers.resolveWorldEvent({ worldEventId: event.id });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| EventWorld log only (Phases 1-17) | WorldEvent persistent record table | Phase 18 | Enables querying active events, participation tracking |
| No regional events | Ripple system cascading by region | Phase 18 | Events feel geographically grounded |
| Renown from kills only | Renown from events + kills + bosses + quests | Phase 18 completes Phase 12's design | All intended renown sources active |
| No admin GM tooling | fire_world_event with admin guard | Phase 18 | Live game-master event triggering |
| No stat tracking | WorldStatTracker with threshold events | Phase 18 | Server-wide achievements trigger events automatically |

**Deprecated/outdated:**
- **EVENT_PARTICIPATION_BASE stub from Phase 12:** `RENOWN_GAIN.EVENT_PARTICIPATION_BASE: 100n` was added as a placeholder in `renown_data.ts`. Phase 18 uses this value as the base reward in `resolveWorldEvent`.

## Open Questions

1. **Admin Identity Mechanism**
   - What we know: No existing admin check in any reducer; codebase has `User.email` but no role field
   - What's unclear: Whether to use identity hex constant, User table role field, or skip auth entirely for now
   - Recommendation: Use hardcoded identity hex constant in `world_event_data.ts`. Simple to implement, avoids schema changes. Document that the constant must be updated per deployment.

2. **generateContent Procedure Stability**
   - What we know: `spacetimedb.procedure` API exists in SDK 1.12.0 (confirmed in `node_modules/spacetimedb/dist/lib/procedures.d.ts`); marked as beta in CLAUDE.md; no existing procedure usage in this codebase
   - What's unclear: Whether the procedure compiles and runs without error in practice; what `ctx.http.fetch` return type looks like; what the Anthropic API key injection mechanism is
   - Recommendation: Build a stub procedure that returns a static string first. Verify it compiles, publishes, and the client can call it. Then add real HTTP fetch in a follow-up. Gate REQ-034 as "stub only" in the plan.

3. **Event Duration / Auto-Expiry**
   - What we know: REQ-030 specifies only `fired | resolved` status; no timeout in requirements
   - What's unclear: What happens if no players participate in an event and it stays `fired` indefinitely?
   - Recommendation: Add a scheduled table `WorldEventExpiryTick` (like `PullTick`) that fires after a configurable duration (e.g., 30 minutes). On tick: if still `fired`, auto-resolve with zero rewards. This prevents stale UI state.

4. **Contribution Tracking Scope**
   - What we know: Explicit join model is recommended; combat hook can look up character's location region
   - What's unclear: The combat reducer doesn't currently have easy access to `character.locationId -> Location.regionId` chain within the kill resolution code path
   - Recommendation: Resolve by looking up `ctx.db.location.id.find(character.locationId)?.regionId` in the combat kill handler before calling `creditEventContribution`. Verify this lookup is accessible in the combat helper context.

## Sources

### Primary (HIGH confidence)

- **Project codebase:** `spacetimedb/src/schema/tables.ts` — existing EventWorld, FactionStanding, Renown, Race, Region tables; confirmed table patterns
- **Project codebase:** `spacetimedb/src/helpers/events.ts` — `appendWorldEvent` (line 66), `EVENT_TRIM_AGE_MICROS` (line 10)
- **Project codebase:** `spacetimedb/src/helpers/economy.ts` — `mutateStanding` (line 6), `STANDING_PER_KILL` (line 3)
- **Project codebase:** `spacetimedb/src/helpers/renown.ts` — `awardRenown` (line 4), `awardServerFirst` (line 48)
- **Project codebase:** `spacetimedb/src/data/renown_data.ts` — `RENOWN_GAIN.EVENT_PARTICIPATION_BASE: 100n` (line 401)
- **Project codebase:** `spacetimedb/src/reducers/combat.ts` — boss kill renown hook (lines 2443-2454); `grantFactionStandingForKill` call site
- **Project codebase:** `spacetimedb/src/seeding/ensure_world.ts` — 3 regions: `Hollowmere Vale`, `Embermarch Fringe`, `Embermarch Depths` with seeding by name pattern
- **Project CLAUDE.md:** Multi-column index ban, view iter restriction, reducer determinism, procedure beta status, object-syntax reducer calls

### Secondary (MEDIUM confidence)

- **SpacetimeDB node_modules:** `spacetimedb/dist/lib/procedures.d.ts` — confirms `spacetimedb.procedure(name, params, ret, fn)` API and `ctx.withTx` exist in 1.12.0
- **SpacetimeDB node_modules:** `spacetimedb/dist/lib/schema.d.ts` — confirms `schema.procedure` method signature

### Tertiary (LOW confidence)

- **CLAUDE.md procedure docs:** Procedures are described as beta — API may change. Stub-first approach mitigates risk.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — same stack as all prior phases, no new dependencies
- Architecture: HIGH — patterns are direct extensions of existing Phase 3/12/17 code; all new tables follow verified project patterns
- Ripple system: HIGH — world layout confirmed (3 known regions from `ensure_world.ts`); name-based adjacency seeding is established pattern in codebase
- WorldEvent/StatTracker design: HIGH — derived directly from requirements and existing reducer/helper patterns
- LLM procedure (REQ-034): LOW — procedure API exists in SDK but is beta; no existing usage in codebase; stub-first recommended
- Admin mechanism: MEDIUM — no existing admin check, but implementation options are clear; hardcoded identity hex is viable

**Research date:** 2026-02-17
**Valid until:** ~2026-03-17 (stable stack; SpacetimeDB 1.12.x procedure beta API is main uncertainty)
