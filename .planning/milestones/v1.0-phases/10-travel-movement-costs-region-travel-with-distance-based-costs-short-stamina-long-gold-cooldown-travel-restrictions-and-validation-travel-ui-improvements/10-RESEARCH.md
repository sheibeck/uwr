# Phase 10: Travel & Movement Costs - Research

**Researched:** 2026-02-13
**Domain:** Graph traversal, distance-based game mechanics, cooldown systems, UI feedback patterns
**Confidence:** HIGH

## Summary

This phase implements a distance-based travel cost system where short-distance travel consumes stamina while long-distance travel costs gold and applies a cooldown. The system requires calculating shortest path distances in an unweighted graph (location connections), implementing dual-resource costs with validation, adding time-based cooldowns, and enhancing the UI to communicate costs and restrictions clearly.

The codebase already has all necessary infrastructure: location graph with bidirectional connections, stamina system with regeneration, gold currency, cooldown table patterns, and a Vue-based travel UI. The primary work involves adding BFS distance calculation, defining distance thresholds, implementing the cost/cooldown logic, and updating the UI to show costs before travel.

**Primary recommendation:** Use BFS to calculate unweighted shortest path distances between connected locations at reducer runtime. Define clear thresholds (e.g., distance 1-2 = stamina only, distance 3+ = gold + cooldown). Validate resources before movement and show costs in the UI using color-coded indicators.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SpacetimeDB TypeScript SDK | 1.11.x | Server-side reducers, tables, scheduled tasks | Project's existing database runtime |
| Vue 3 | Latest | Client UI components | Project's existing frontend framework |
| TypeScript | Latest | Type-safe code for both server/client | Project language standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | - | Built-in graph algorithms | BFS is simple to implement inline |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Runtime BFS | Pre-computed distance matrix | Pre-computation faster but requires regeneration when graph changes |
| Inline BFS | External graph library | External library adds dependency, overkill for simple unweighted BFS |
| Cooldown table | Scheduled table | Scheduled tables auto-delete; cooldowns need active state for UI feedback |

**Installation:**
No new packages required. Use existing SpacetimeDB SDK and Vue setup.

## Architecture Patterns

### Recommended Project Structure
```
spacetimedb/src/
├── schema/tables.ts              # Add TravelCooldown table
├── reducers/movement.ts          # Extend move_character with costs
├── helpers/location.ts           # Add BFS distance calculation
└── data/travel_config.ts         # Distance thresholds and costs

src/components/
└── TravelPanel.vue               # Add cost indicators and feedback
```

### Pattern 1: BFS Distance Calculation
**What:** Breadth-first search on location graph to find shortest path distance
**When to use:** Every time travel cost needs to be calculated (reducer validation and UI preview)
**Example:**
```typescript
// spacetimedb/src/helpers/location.ts
export function calculateDistance(
  ctx: any,
  fromLocationId: bigint,
  toLocationId: bigint
): number | null {
  if (fromLocationId === toLocationId) return 0;

  const visited = new Set<string>();
  const queue: { id: bigint; distance: number }[] = [
    { id: fromLocationId, distance: 0 }
  ];
  visited.add(fromLocationId.toString());

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Check all connections from current location
    for (const conn of ctx.db.locationConnection.by_from.filter(current.id)) {
      if (conn.toLocationId === toLocationId) {
        return current.distance + 1;
      }

      const toIdStr = conn.toLocationId.toString();
      if (!visited.has(toIdStr)) {
        visited.add(toIdStr);
        queue.push({
          id: conn.toLocationId,
          distance: current.distance + 1
        });
      }
    }
  }

  return null; // No path exists
}
```

### Pattern 2: Dual-Resource Cost System
**What:** Different resource costs based on distance threshold
**When to use:** When action costs vary by magnitude (short/long travel, weak/strong abilities)
**Example:**
```typescript
// spacetimedb/src/data/travel_config.ts
export const TRAVEL_CONFIG = {
  SHORT_DISTANCE_MAX: 2,
  STAMINA_COST_PER_STEP: 3n,
  LONG_DISTANCE_GOLD: 10n,
  LONG_DISTANCE_COOLDOWN_MICROS: 30_000_000n, // 30 seconds
};

// In reducer
const distance = calculateDistance(ctx, fromId, toId);
if (distance === null) throw new SenderError('Location not reachable');

if (distance <= TRAVEL_CONFIG.SHORT_DISTANCE_MAX) {
  const cost = BigInt(distance) * TRAVEL_CONFIG.STAMINA_COST_PER_STEP;
  if (character.stamina < cost) {
    throw new SenderError(`Not enough stamina (need ${cost})`);
  }
  // Deduct stamina after validation passes
} else {
  if (character.gold < TRAVEL_CONFIG.LONG_DISTANCE_GOLD) {
    throw new SenderError('Not enough gold for long-distance travel');
  }
  // Check cooldown, deduct gold, apply cooldown
}
```

### Pattern 3: Cooldown Table Pattern
**What:** Track time-based restrictions using timestamp comparison
**When to use:** Actions that should be limited by time (travel, abilities, item usage)
**Example:**
```typescript
// spacetimedb/src/schema/tables.ts
export const TravelCooldown = table(
  {
    name: 'travel_cooldown',
    public: true,
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    readyAtMicros: t.u64(),
  }
);

// Validation pattern
const existingCooldown = [...ctx.db.travelCooldown.by_character.filter(characterId)][0];
if (existingCooldown && existingCooldown.readyAtMicros > ctx.timestamp.microsSinceUnixEpoch) {
  const remainingSec = Number(
    (existingCooldown.readyAtMicros - ctx.timestamp.microsSinceUnixEpoch) / 1_000_000n
  );
  throw new SenderError(`Travel cooldown active (${remainingSec}s remaining)`);
}

// After successful travel
if (existingCooldown) {
  ctx.db.travelCooldown.id.update({
    ...existingCooldown,
    readyAtMicros: ctx.timestamp.microsSinceUnixEpoch + COOLDOWN_MICROS,
  });
} else {
  ctx.db.travelCooldown.insert({
    id: 0n,
    characterId: character.id,
    readyAtMicros: ctx.timestamp.microsSinceUnixEpoch + COOLDOWN_MICROS,
  });
}
```

### Pattern 4: UI Cost Preview
**What:** Show action costs before user commits to action
**When to use:** Any resource-consuming action where user should make informed decision
**Example:**
```vue
<!-- TravelPanel.vue -->
<template>
  <button
    :disabled="!canAfford(location) || isOnCooldown"
    @click="travel(location.id)"
  >
    <span v-if="getCost(location).type === 'stamina'">
      Go ({{ getCost(location).amount }} stamina)
    </span>
    <span v-else>
      Go ({{ getCost(location).amount }} gold + 30s cooldown)
    </span>
  </button>
</template>

<script setup>
const getCost = (location) => {
  const distance = calculateUIDistance(currentLocation, location);
  if (distance <= 2) {
    return { type: 'stamina', amount: distance * 3 };
  }
  return { type: 'gold', amount: 10, cooldown: 30 };
};

const canAfford = (location) => {
  const cost = getCost(location);
  if (cost.type === 'stamina') {
    return character.stamina >= cost.amount;
  }
  return character.gold >= cost.amount && !isOnCooldown.value;
};
</script>
```

### Anti-Patterns to Avoid
- **Calculating distance on client only:** Distance must be calculated on server in reducer for validation; client preview is just UX enhancement
- **Forgetting bidirectional edges in BFS:** LocationConnection has bidirectional entries but BFS must track visited nodes globally, not per-direction
- **Partial resource deduction on error:** Use SpacetimeDB transactional guarantees - validate ALL conditions before ANY mutations
- **Magic number thresholds:** Define distance thresholds and costs in a config constant, don't scatter magic numbers

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph shortest path | Custom pathfinding algorithm | Standard BFS implementation | BFS for unweighted graphs is O(V+E), simple, well-understood |
| Cooldown management | Custom timestamp tracking | Existing cooldown table pattern | Project already has ItemCooldown, AbilityCooldown patterns |
| Resource validation | Complex nested conditionals | Validate-then-mutate pattern | SpacetimeDB transactions rollback on error, use SenderError early |
| Client-side cost calculation | Duplicated logic | BFS helper callable from both contexts | TypeScript functions work in both SpacetimeDB and client if pure |

**Key insight:** The location graph is already bidirectional (connectLocations creates both directions), stamina/gold systems exist, and cooldown patterns are proven. Don't reinvent - extend existing patterns.

## Common Pitfalls

### Pitfall 1: Bidirectional Edge Double-Counting in BFS
**What goes wrong:** In undirected graphs, visiting a node from its parent and immediately revisiting the parent looks like a cycle.
**Why it happens:** LocationConnection stores bidirectional edges as separate rows (from→to and to→from). BFS must track visited nodes globally.
**How to avoid:** Use a `visited` Set with node IDs as strings (BigInt requires toString() for Set operations). Mark nodes visited when enqueued, not when dequeued.
**Warning signs:** BFS returns distance 2 for adjacent locations, or infinite loops.

**Example:**
```typescript
// WRONG - revisits parent
const queue = [{ id: startId, distance: 0 }];
while (queue.length > 0) {
  const current = queue.shift()!;
  for (const conn of ctx.db.locationConnection.by_from.filter(current.id)) {
    queue.push({ id: conn.toLocationId, distance: current.distance + 1 });
    // Will push parent back into queue!
  }
}

// RIGHT - tracks visited
const visited = new Set<string>();
visited.add(startId.toString());
const queue = [{ id: startId, distance: 0 }];
while (queue.length > 0) {
  const current = queue.shift()!;
  for (const conn of ctx.db.locationConnection.by_from.filter(current.id)) {
    const toStr = conn.toLocationId.toString();
    if (!visited.has(toStr)) {
      visited.add(toStr);
      queue.push({ id: conn.toLocationId, distance: current.distance + 1 });
    }
  }
}
```

### Pitfall 2: Validating Cost After Deducting Resources
**What goes wrong:** Reducer deducts stamina, then checks cooldown and throws error. Stamina loss commits despite travel failing.
**Why it happens:** Misunderstanding SpacetimeDB transaction scope - errors rollback the ENTIRE reducer, but validation order matters for clear error messages.
**How to avoid:** Follow validate-ALL-then-mutate pattern. Check all conditions (distance reachable, resources sufficient, no cooldown, not in combat) BEFORE any database writes.
**Warning signs:** Error messages like "Not enough gold" after stamina was consumed; players report resource loss without benefit.

**Example:**
```typescript
// WRONG - mutates then validates
ctx.db.character.id.update({ ...character, stamina: character.stamina - cost });
if (travelCooldown) throw new SenderError('On cooldown'); // Rollback loses stamina deduction

// RIGHT - validate fully then mutate
if (distance > SHORT_MAX && travelCooldown?.readyAtMicros > ctx.timestamp.microsSinceUnixEpoch) {
  throw new SenderError('Travel cooldown active');
}
if (cost.stamina && character.stamina < cost.stamina) {
  throw new SenderError('Not enough stamina');
}
if (cost.gold && character.gold < cost.gold) {
  throw new SenderError('Not enough gold');
}
// All validations passed - now safe to mutate
ctx.db.character.id.update({ ...character, stamina: character.stamina - cost.stamina });
```

### Pitfall 3: Using BigInt in Set/Map Keys Without toString()
**What goes wrong:** `new Set([1n, 1n]).size === 2` because BigInt objects are compared by reference, not value.
**Why it happens:** JavaScript Set/Map use SameValueZero comparison; BigInts are objects in SpacetimeDB SDK.
**How to avoid:** Always convert BigInt to string for Set/Map keys: `visited.add(locationId.toString())`.
**Warning signs:** BFS visits same node multiple times; Set.has() returns false for value that was added.

### Pitfall 4: Forgetting Cooldown Cleanup on Success
**What goes wrong:** Cooldown table grows unbounded with expired entries.
**Why it happens:** Cooldowns are checked on reducer entry but never deleted after expiration.
**How to avoid:** Either clean up expired cooldowns opportunistically during validation, OR query only active cooldowns (readyAtMicros > now).
**Warning signs:** TravelCooldown table grows indefinitely; performance degrades over time.

**Pattern from codebase:**
```typescript
// Existing pattern in combat.ts - cleanup during validation
for (const cd of ctx.db.abilityCooldown.by_character.filter(character.id)) {
  if (cd.readyAtMicros <= ctx.timestamp.microsSinceUnixEpoch) {
    ctx.db.abilityCooldown.id.delete(cd.id);
  }
}
```

### Pitfall 5: Client-Server Distance Calculation Mismatch
**What goes wrong:** UI shows "3 stamina" but server charges 6 stamina.
**Why it happens:** Client calculates distance differently (wrong algorithm, missing connections) than server.
**How to avoid:** If sharing BFS logic between client/server, make it a pure function with explicit graph input. Otherwise, accept client is "best effort preview" and server is source of truth.
**Warning signs:** Players report unexpected costs; error messages contradict UI.

### Pitfall 6: Not Handling Unreachable Locations
**What goes wrong:** BFS returns null for disconnected graph components, code crashes or shows NaN distance.
**Why it happens:** Not all locations may be reachable (disconnected regions, future content).
**How to avoid:** BFS should return `number | null`. Handle null by hiding unreachable locations in UI or showing "Cannot reach" message.
**Warning signs:** UI shows "undefined stamina"; reducer crashes with "Cannot read property of null".

## Code Examples

Verified patterns from existing codebase and standard algorithms:

### Stamina Deduction Pattern
```typescript
// Source: spacetimedb/src/helpers/combat.ts (ability resource costs)
if (ability.resource === 'stamina') {
  if (character.stamina < resourceCost) throw new SenderError('Not enough stamina');
}
// ... later after all validations
if (ability.resource === 'stamina') {
  ctx.db.character.id.update({ ...character, stamina: character.stamina - resourceCost });
}
```

### Cooldown Validation Pattern
```typescript
// Source: spacetimedb/src/reducers/items.ts (item cooldown check)
const existingCooldown = [...ctx.db.itemCooldown.by_character.filter(character.id)].find(
  (row) => row.itemKey === itemKey
);
if (existingCooldown && existingCooldown.readyAtMicros > nowMicros) {
  throw new SenderError('Item is on cooldown.');
}
// ... after action completes
if (existingCooldown) {
  ctx.db.itemCooldown.id.update({
    ...existingCooldown,
    readyAtMicros: nowMicros + cooldownMicros,
  });
} else {
  ctx.db.itemCooldown.insert({
    id: 0n,
    characterId: character.id,
    itemKey,
    readyAtMicros: nowMicros + cooldownMicros,
  });
}
```

### Stamina Regeneration Pattern
```typescript
// Source: spacetimedb/src/reducers/combat.ts (health regen tick)
const STAMINA_REGEN_OUT = 5n;
const STAMINA_REGEN_IN = 2n;
const REGEN_TICK_MICROS = 8_000_000n; // 8 seconds

const inCombat = !!activeCombatIdForCharacter(ctx, character.id);
const staminaRegen = inCombat ? STAMINA_REGEN_IN : STAMINA_REGEN_OUT;

const nextStamina =
  character.stamina >= character.maxStamina
    ? character.stamina
    : character.stamina + staminaRegen;

ctx.db.character.id.update({
  ...character,
  stamina: nextStamina > character.maxStamina ? character.maxStamina : nextStamina,
});
```

### Existing Travel Validation Pattern
```typescript
// Source: spacetimedb/src/reducers/movement.ts (current move_character)
if (character.locationId === location.id) return; // Already here
if (activeCombatIdForCharacter(ctx, character.id)) {
  return fail(ctx, character, 'Cannot travel while in combat');
}
const activeGather = [...ctx.db.resourceGather.by_character.filter(character.id)][0];
if (activeGather) {
  return fail(ctx, character, 'Cannot travel while gathering');
}
if (!areLocationsConnected(ctx, character.locationId, location.id)) {
  return fail(ctx, character, 'Location not connected');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed travel cost | Distance-based costs | This phase | Rewards nearby exploration, makes long travel strategic decision |
| Instant teleport | Cooldown on long travel | This phase | Prevents rapid back-and-forth exploitation |
| Single resource (stamina or gold) | Hybrid system (stamina for short, gold+cooldown for long) | This phase | Creates meaningful resource trade-offs |
| Server-only cost feedback | UI preview of costs | This phase | Better UX, informed player decisions |

**Current best practices:**
- SpacetimeDB reducers are transactional: validate all conditions before any mutations
- Cooldown pattern: store readyAtMicros timestamp, check on action attempt
- Stamina regenerates passively via scheduled reducer (8-second tick)
- BFS is O(V+E) standard for unweighted shortest path

## Open Questions

1. **Should same-region travel be free?**
   - What we know: Locations belong to regions (regionId field exists)
   - What's unclear: User preference for regional travel incentives
   - Recommendation: Start with pure distance-based costs; add regional modifiers if testing shows need

2. **Should cooldowns persist through logout?**
   - What we know: Cooldown uses timestamp (microsSinceUnixEpoch), which continues during logout
   - What's unclear: User expectation for offline cooldown decay
   - Recommendation: Keep timestamp-based (persists offline) for consistency with other cooldowns; players can spend gold to "fast travel" knowing cooldown cost

3. **Should bind stone travel bypass costs?**
   - What we know: Locations have bindStone field, characters have boundLocationId
   - What's unclear: Whether this phase includes bind stone travel or just location-to-location
   - Recommendation: Keep bind stone travel separate (future phase); this phase focuses on location connection graph only

4. **Distance threshold tuning?**
   - What we know: Need clear short/long distance cutoff
   - What's unclear: Optimal threshold (1-2 vs 1-3 steps for "short")
   - Recommendation: Start with distance ≤2 = short (stamina), ≥3 = long (gold+cooldown); tune based on actual map topology after implementation

## Sources

### Primary (HIGH confidence)
- Existing codebase patterns (spacetimedb/src/reducers/movement.ts, combat.ts, items.ts, characters.ts)
- Existing table schemas (spacetimedb/src/schema/tables.ts - Character, LocationConnection, ItemCooldown, AbilityCooldown)
- Existing UI (src/components/TravelPanel.vue)
- SpacetimeDB official documentation - [Error Handling](https://spacetimedb.com/docs/functions/reducers/error-handling/)
- SpacetimeDB official documentation - [Transactions and Atomicity](https://spacetimedb.com/docs/databases/transactions-atomicity/)

### Secondary (MEDIUM confidence)
- [Graph Algorithms Implementation with Breadth-First Search in TypeScript](https://codesignal.com/learn/courses/getting-deep-into-complex-algorithms-for-interviews-with-typescript/lessons/graph-algorithms-implementation-with-breadth-first-search-in-typescript) - BFS implementation patterns
- [Shortest Path in Unweighted Graph BFS](https://namastedev.com/blog/shortest-path-in-unweighted-graph-bfs/) - Algorithm explanation
- [Breadth First Search - Algorithms for Competitive Programming](https://cp-algorithms.com/graph/breadth-first-search.html) - BFS complexity and patterns
- [Graph Traversal Patterns](https://www.lockedinai.com/blog/graph-traversal-patterns-dfs-bfs-topological-sort) - Common pitfalls
- [Detect cycle in an undirected graph](https://www.geeksforgeeks.org/dsa/detect-cycle-undirected-graph/) - Bidirectional edge handling
- [How to Build Cool-Down Periods](https://oneuptime.com/blog/post/2026-01-30-cool-down-periods/view) - Cooldown system patterns
- [Input Feedback design pattern](https://ui-patterns.com/patterns/InputFeedback) - UI feedback patterns
- [Game UI: design principles, best practices](https://www.justinmind.com/ui-design/game) - Game UI best practices

### Tertiary (LOW confidence - general background)
- [Stamina System](https://www.larksuite.com/en_us/topics/gaming-glossary/stamina-system) - Game design context
- [UI Design Trends 2026](https://landdding.com/blog/ui-design-trends-2026) - UI trends

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All technologies already in active use in codebase
- Architecture: HIGH - BFS is well-established algorithm; cooldown/cost patterns proven in codebase
- Pitfalls: HIGH - Based on direct code analysis and documented BFS edge cases

**Research date:** 2026-02-13
**Valid until:** ~30 days (stable domain - graph algorithms and database patterns don't change rapidly)
