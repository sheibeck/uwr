# Phase 3: Renown Foundation - Research

**Researched:** 2026-02-11
**Domain:** SpacetimeDB TypeScript SDK 1.12.0, faction standing system, Vue 3 UI panel
**Confidence:** HIGH (all findings verified from live codebase)

---

## Summary

Nothing related to factions, standing, or renown exists in the codebase yet. Every piece of this phase must be created from scratch. However, every sub-problem maps cleanly onto existing, well-established patterns in this project.

The core backend challenge is the FactionStanding table, which requires a **composite primary key** (characterId + factionId). SpacetimeDB TypeScript SDK does not support composite PKs via `primaryKey()` on multiple columns — the standard workaround for this project is a single auto-increment `id` PK with a multi-column lookup index. However, multi-column indexes are confirmed BROKEN in this SDK version (they cause PANIC or silent empty results). The correct approach is: single `id: t.u64().primaryKey().autoInc()`, single-column index on `characterId` for the view lookup, and enforce uniqueness in the mutation reducer. This is the same pattern already used for `QuestInstance` (which also has a logical composite key of `characterId + questTemplateId` but uses a single auto-inc PK).

The Faction table requires an optional self-referencing `rivalFactionId` field to support cross-faction standing penalties. The `t.u64().optional()` type handles this. The 4 factions will be seeded via `ensureFactions(ctx)` following the `ensureRaces` / `RACE_DATA` pattern exactly. The `my_faction_standings` view follows the `my_quests` view pattern exactly — look up `activeCharacterId` from player, filter `factionStanding.by_character`, return array.

The standing mutation helper will be a private function in `reducers/combat.ts` (for combat-based grants) following the same dependency-injection `deps` pattern as `updateQuestProgressForKill`. The client-side `FACTION_RANKS` constant is computed client-side (Vue computed property), not stored server-side — this avoids any server-side recomputation per REQ-022.

The RenownPanel is a new Vue component following the QuestPanel pattern. It receives `factionStandings` and `factions` as props, computes rank from a client-side constant, and renders a progress bar per faction. It gets wired in through ActionBar, App.vue, and useGameData following the exact same pattern as every other panel.

**Primary recommendation:** Follow the QuestInstance + my_quests pattern for the FactionStanding table and view. Follow the ensureRaces pattern for faction seeding. Follow the updateQuestProgressForKill pattern for the standing mutation callback in combat. Never use multi-column indexes — single-column `by_character` index + manual filter in the view.

---

## Codebase Findings (Pre-existing State)

### What already exists

| Item | Location | State |
|------|----------|-------|
| `create_character` reducer | `spacetimedb/src/reducers/characters.ts:100` | Inserts character, grants starter items — NO FactionStanding rows yet |
| `updateQuestProgressForKill` | `spacetimedb/src/reducers/combat.ts:319` | Kill-based reward hook pattern to follow |
| `ensureRaces` / RACE_DATA pattern | `spacetimedb/src/data/races.ts` | Seeding pattern to follow exactly |
| `syncAllContent` | `spacetimedb/src/index.ts:4334` | Calls all ensure* functions — add `ensureFactions` here |
| `reducerDeps` object | `spacetimedb/src/index.ts:5662` | Deps passed to all reducers — add faction helpers here |
| `registerViews` / views/index.ts | `spacetimedb/src/views/index.ts` | Add `registerFactionViews` here |
| `ViewDeps` type | `spacetimedb/src/views/types.ts` | Add `FactionStanding` and `Faction` table vars here |
| `my_quests` view | `spacetimedb/src/views/quests.ts` | Exact pattern for `my_faction_standings` |
| `useGameData.ts` | `src/composables/useGameData.ts` | Add `factionStandings` and `factions` table hooks |
| `ActionBar.vue` PanelKey type | `src/components/ActionBar.vue:65` | Add `'renown'` to PanelKey union |
| `App.vue` panel switch | `src/App.vue` | Add `v-else-if="activePanel === 'renown'"` case |
| `QuestInstance` table | `spacetimedb/src/index.ts:195` | Reference for FactionStanding table pattern |
| Combat kill resolution loop | `spacetimedb/src/reducers/combat.ts:1805` | Call faction standing grant here |

### What does NOT exist yet

- No `Faction` table
- No `FactionStanding` table
- No `faction_data.ts` file
- No `ensureFactions` function
- No faction standing mutation logic
- No `my_faction_standings` view
- No `registerFactionViews` function
- No `RenownPanel.vue` component
- No `FACTION_RANKS` constant
- No `factionId` field on `EnemyTemplate` (needs to be added for combat-based standing)

### Key codebase patterns

**Single-column index pattern for "composite key" tables (QuestInstance is the exact model):**
```typescript
// spacetimedb/src/index.ts:195
const QuestInstance = table(
  {
    name: 'quest_instance',
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
      { name: 'by_template', algorithm: 'btree', columns: ['questTemplateId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    questTemplateId: t.u64(),
    // ...
  }
);
```

**View pattern (my_quests is the exact model for my_faction_standings):**
```typescript
// spacetimedb/src/views/quests.ts
spacetimedb.view(
  { name: 'my_quests', public: true },
  t.array(QuestInstance.rowType),
  (ctx: any) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player?.activeCharacterId) return [];
    return [...ctx.db.questInstance.by_character.filter(player.activeCharacterId)];
  }
);
```

**Kill-based reward hook (the model for faction standing on kill):**
```typescript
// spacetimedb/src/reducers/combat.ts:1805-1811
for (const p of participants) {
  const character = ctx.db.character.id.find(p.characterId);
  if (!character) continue;
  for (const template of enemyTemplates) {
    updateQuestProgressForKill(ctx, character, template.id);
    // ADD: grantFactionStandingForKill(ctx, character, template.id)
  }
}
```

**deps injection pattern (how new helpers get passed to combat.ts):**
```typescript
// spacetimedb/src/index.ts:5662 — reducerDeps object
const reducerDeps = {
  spacetimedb, t, SenderError, // ... all current deps
  // ADD: grantFactionStanding, Faction, FactionStanding
};
```

---

## Architecture Patterns

### Recommended Project Structure (Phase 3 additions)

```
spacetimedb/src/
├── data/
│   └── faction_data.ts           NEW — FACTION_DATA constant + ensureFactions function
├── index.ts                      MODIFIED — add Faction + FactionStanding table defs, schema export, ensureFactions in syncAllContent, registerFactionViews call, add to reducerDeps
└── views/
    ├── faction.ts                NEW — registerFactionViews, my_faction_standings view
    ├── index.ts                  MODIFIED — import + call registerFactionViews
    └── types.ts                  MODIFIED — add Faction + FactionStanding to ViewDeps

src/
├── composables/
│   └── useGameData.ts            MODIFIED — add factions + factionStandings useTable calls
├── components/
│   ├── RenownPanel.vue           NEW — faction list, standing bars, rank display
│   └── ActionBar.vue             MODIFIED — add 'renown' to PanelKey, add Renown button
└── App.vue                       MODIFIED — import RenownPanel, add panel case, pass props
```

### Pattern 1: Faction Table (follows Race table pattern)

**What:** Static game data seeded via `ensureFactions` called from `syncAllContent`.

**Example:**
```typescript
// spacetimedb/src/index.ts — table definition
const Faction = table(
  { name: 'faction', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    description: t.string(),
    rivalFactionId: t.u64().optional(),
  }
);

// spacetimedb/src/data/faction_data.ts
export const FACTION_DATA = [
  { name: 'Iron Compact',   description: '...', rivalName: 'Verdant Circle' },
  { name: 'Verdant Circle', description: '...', rivalName: 'Iron Compact' },
  { name: 'Ashen Order',    description: '...', rivalName: 'Free Blades' },
  { name: 'Free Blades',    description: '...', rivalName: 'Ashen Order' },
];

export function ensureFactions(ctx: any) {
  // Phase 1: upsert rows without rivalFactionId (can't self-reference until all rows exist)
  for (const data of FACTION_DATA) {
    const existing = [...ctx.db.faction.iter()].find((row: any) => row.name === data.name);
    if (existing) {
      ctx.db.faction.id.update({ ...existing, name: data.name, description: data.description });
    } else {
      ctx.db.faction.insert({ id: 0n, name: data.name, description: data.description, rivalFactionId: undefined });
    }
  }
  // Phase 2: wire up rivalFactionId now that all rows exist
  for (const data of FACTION_DATA) {
    if (!data.rivalName) continue;
    const row = [...ctx.db.faction.iter()].find((r: any) => r.name === data.name);
    const rival = [...ctx.db.faction.iter()].find((r: any) => r.name === data.rivalName);
    if (row && rival && row.rivalFactionId !== rival.id) {
      ctx.db.faction.id.update({ ...row, rivalFactionId: rival.id });
    }
  }
}
```

### Pattern 2: FactionStanding Table (follows QuestInstance pattern)

**What:** Per-character, per-faction standing row. No composite PK — uses auto-inc id + single-column index.

**CRITICAL: Do NOT attempt composite PK — multi-column indexes are BROKEN in this SDK version.**

```typescript
// spacetimedb/src/index.ts — table definition
const FactionStanding = table(
  {
    name: 'faction_standing',
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    factionId: t.u64(),
    standing: t.i64(),
  }
);
```

**Uniqueness enforcement in reducer (not in schema):**
```typescript
// In grantFactionStanding helper:
const existing = [...ctx.db.factionStanding.by_character.filter(characterId)]
  .find((row) => row.factionId === factionId);
if (existing) {
  ctx.db.factionStanding.id.update({ ...existing, standing: newStanding });
} else {
  ctx.db.factionStanding.insert({ id: 0n, characterId, factionId, standing: 0n });
}
```

### Pattern 3: FactionStanding rows initialized at character creation

**What:** After `ctx.db.character.insert(...)`, loop all factions and insert FactionStanding rows at 0.

**Location:** `spacetimedb/src/reducers/characters.ts` in `create_character` reducer.

```typescript
// After character insert — add FactionStanding initialization
const allFactions = [...ctx.db.faction.iter()];
for (const faction of allFactions) {
  ctx.db.factionStanding.insert({
    id: 0n,
    characterId: character.id,
    factionId: faction.id,
    standing: 0n,
  });
}
```

**Note:** `FactionStanding` table variable must be passed via `reducerDeps` to `registerCharacterReducers`.

### Pattern 4: my_faction_standings View (follows my_quests exactly)

```typescript
// spacetimedb/src/views/faction.ts
export const registerFactionViews = ({ spacetimedb, t, FactionStanding }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_faction_standings', public: true },
    t.array(FactionStanding.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player?.activeCharacterId) return [];
      return [...ctx.db.factionStanding.by_character.filter(player.activeCharacterId)];
    }
  );
};
```

### Pattern 5: Faction Standing Grant Helper (follows updateQuestProgressForKill)

**Location:** New helper in `reducers/combat.ts` (or a shared `reducers/faction.ts`), injected via `deps`.

```typescript
// Called at end of combat when all enemies die, for each participant + each enemy template
const grantFactionStandingForKill = (ctx: any, character: any, enemyTemplateId: bigint) => {
  const template = ctx.db.enemyTemplate.id.find(enemyTemplateId);
  if (!template || !template.factionId) return;  // enemy has no faction association — skip

  const faction = ctx.db.faction.id.find(template.factionId);
  if (!faction) return;

  const STANDING_PER_KILL = 10n;  // configurable constant

  // Grant standing to primary faction
  mutateStanding(ctx, character.id, faction.id, STANDING_PER_KILL);

  // Apply rival penalty if faction has a rival
  if (faction.rivalFactionId) {
    const RIVAL_PENALTY_RATIO = 2n;  // rival loses half as much
    mutateStanding(ctx, character.id, faction.rivalFactionId, -(STANDING_PER_KILL / RIVAL_PENALTY_RATIO));
  }

  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
    `Your standing with ${faction.name} increases.`);
};

// Internal standing mutation (upsert pattern)
const mutateStanding = (ctx: any, characterId: bigint, factionId: bigint, delta: bigint) => {
  const existing = [...ctx.db.factionStanding.by_character.filter(characterId)]
    .find((row) => row.factionId === factionId);
  if (existing) {
    ctx.db.factionStanding.id.update({ ...existing, standing: existing.standing + delta });
  } else {
    ctx.db.factionStanding.insert({ id: 0n, characterId, factionId, standing: delta });
  }
};
```

### Pattern 6: EnemyTemplate factionId Field

**What:** Add `factionId: t.u64().optional()` to the existing `EnemyTemplate` table definition.

**Impact:** Non-breaking — optional field, existing enemies have no faction by default. The `ensureEnemyTemplatesAndRoles` function in index.ts will need to set `factionId` for faction-associated enemies.

### Pattern 7: Client FACTION_RANKS Constant (client-side, REQ-022)

**What:** Standing threshold → rank name mapping. Per requirement, computed client-side. No server involvement.

```typescript
// src/components/RenownPanel.vue or src/constants/factionRanks.ts
export const FACTION_RANKS = [
  { name: 'Hostile',    min: -Infinity, max: -5001 },
  { name: 'Unfriendly', min: -5000, max: -1 },
  { name: 'Neutral',    min: 0,     max: 999 },
  { name: 'Friendly',   min: 1000,  max: 2999 },
  { name: 'Honored',    min: 3000,  max: 5999 },
  { name: 'Revered',    min: 6000,  max: 8999 },
  { name: 'Exalted',    min: 9000,  max: Infinity },
];

export function getRankForStanding(standing: bigint): typeof FACTION_RANKS[0] {
  const n = Number(standing);
  return FACTION_RANKS.findLast((r) => n >= r.min) ?? FACTION_RANKS[0];
}
```

**Note:** `standing` from SpacetimeDB is `i64` — on client it arrives as a `bigint`. Convert to `Number` for comparison since standing values fit safely within Number.MAX_SAFE_INTEGER range.

### Pattern 8: RenownPanel Vue Component

**Follows QuestPanel / StatsPanel pattern — receives data as props, no direct table access.**

```vue
<!-- src/components/RenownPanel.vue -->
<template>
  <div :style="styles.panelBody">
    <div v-if="!selectedCharacter" :style="styles.subtle">Select a character.</div>
    <div v-else-if="factionRows.length === 0" :style="styles.subtle">No faction data.</div>
    <div v-else>
      <div v-for="row in factionRows" :key="row.factionId" :style="styles.rosterClickable">
        <div>{{ row.factionName }}</div>
        <div :style="styles.subtleSmall">{{ row.rank.name }} ({{ row.standing }})</div>
        <!-- Standing bar: (standing - rank.min) / (rank.max - rank.min) -->
        <div :style="{ background: '#333', height: '6px', borderRadius: '3px' }">
          <div :style="{ background: '#8af', width: `${row.progress}%`, height: '100%', borderRadius: '3px' }" />
        </div>
        <div :style="styles.subtleSmall">Next: {{ row.nextRank?.name ?? 'Exalted (max)' }}</div>
      </div>
    </div>
  </div>
</template>
```

### Pattern 9: Adding Renown to ActionBar

```typescript
// src/components/ActionBar.vue — add 'renown' to PanelKey union
type PanelKey = 'none' | 'character' | 'inventory' | 'hotbar' | 'friends'
  | 'group' | 'stats' | 'crafting' | 'journal' | 'quests' | 'travel'
  | 'combat' | 'renown';  // ADD renown
```

```vue
<!-- Add button in ActionBar.vue template, inside v-if="hasActiveCharacter" -->
<button @click="emit('toggle', 'renown')" :style="actionStyle('renown')" :disabled="isLocked('renown')">
  Renown
</button>
```

### Anti-Patterns to Avoid

- **Composite PK via primaryKey() on both characterId + factionId:** SpacetimeDB TypeScript SDK does not support this. Multi-column indexes are BROKEN. Use auto-inc id + single-column `by_character` index only.
- **Standing computation server-side:** FACTION_RANKS is a client-side constant per REQ-022. Do not add rank computation to server.
- **Storing rivalFactionId before all factions exist:** The two-phase seeding approach (insert all, then update rivalFactionId) avoids the self-reference chicken-and-egg problem.
- **Standing decay:** REQ-026 explicitly forbids it. No scheduled tick, no decay logic.
- **Using `.iter()` in the my_faction_standings view:** Views cannot use `.iter()`. Use `.by_character.filter(activeCharacterId)` only.
- **Putting FACTION_RANKS in the server schema:** It's a display-only constant. Client-only.
- **Skipping the delete_character cleanup:** When a character is deleted, their FactionStanding rows must be cleaned up. The `delete_character` reducer in `characters.ts` already deletes rows from all related tables — add the FactionStanding cleanup there.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Faction seeding | One-off init reducer | `ensureFactions(ctx)` in `syncAllContent` | Survives `/synccontent` republish, matches all other static data |
| Standing uniqueness enforcement | DB constraint / composite PK | Reducer-level upsert (find + update or insert) | Composite PK not supported; multi-column indexes BROKEN |
| Rank computation | Server-side field | Client-side `FACTION_RANKS` constant + computed | Per REQ-022, client-side only; no server overhead |
| FactionStanding view filtering | Public table + client filter | Private table + `my_faction_standings` view | Privacy: character standing should not be visible to other players |
| Rival penalty logic | Percent-based multipliers | Simple integer delta (half the primary grant, negated) | Simpler is better for first implementation |

---

## Common Pitfalls

### Pitfall 1: Multi-column index on FactionStanding
**What goes wrong:** Defining `indexes: [{ name: 'by_character_faction', algorithm: 'btree', columns: ['characterId', 'factionId'] }]` causes a server PANIC or silent empty filter results.
**Why it happens:** Multi-column indexes are BROKEN in SpacetimeDB TypeScript SDK 1.11.x/1.12.x.
**How to avoid:** Single-column `by_character` index ONLY. In the view and mutation helper, use `.by_character.filter(characterId)` then manually check `row.factionId === targetFactionId`.
**Warning signs:** Server logs show PANIC; filter returns empty even when rows exist.

### Pitfall 2: FactionStanding not initialized at character creation
**What goes wrong:** New character has no FactionStanding rows, `my_faction_standings` view returns empty, RenownPanel shows nothing.
**Why it happens:** The FactionStanding insert loop inside `create_character` requires `Faction` rows to already exist. If factions haven't been seeded yet (e.g., fresh database, `init` hasn't run), the loop silently does nothing.
**How to avoid:** `ensureFactions` is called in `syncAllContent`, which is called from the `init` reducer. The `init` reducer runs before any `create_character` call is possible. Order is guaranteed.
**Warning signs:** All faction standing rows missing for newly created characters.

### Pitfall 3: delete_character missing FactionStanding cleanup
**What goes wrong:** Deleted character leaves orphaned FactionStanding rows in the database.
**Why it happens:** The `delete_character` reducer explicitly cleans up all associated rows. FactionStanding must be added to this list.
**How to avoid:** Add the cleanup loop to `delete_character`:
```typescript
for (const row of ctx.db.factionStanding.by_character.filter(characterId)) {
  ctx.db.factionStanding.id.delete(row.id);
}
```
**Warning signs:** Orphaned rows visible in database dashboard after character deletion.

### Pitfall 4: rivalFactionId self-reference during seeding
**What goes wrong:** Attempting to set `rivalFactionId` during initial insert fails because the rival faction row doesn't exist yet.
**Why it happens:** Linear insertion order means faction A's rival (faction B) may not be in the table when faction A is inserted.
**How to avoid:** Two-phase seeding: (1) insert all factions without rivalFactionId, (2) loop again and update rivalFactionId once all rows exist.
**Warning signs:** `rivalFactionId` is `undefined` for all factions after `syncAllContent`.

### Pitfall 5: Forgetting to add Faction and FactionStanding to schema() export
**What goes wrong:** Tables defined but not in `schema(...)` — SpacetimeDB won't create them.
**Why it happens:** The `schema()` call at line 1194 of `index.ts` must include every table.
**How to avoid:** Add both `Faction` and `FactionStanding` to the `schema(...)` call.
**Warning signs:** `ctx.db.faction` is undefined at runtime.

### Pitfall 6: Forgetting to regenerate bindings after schema change
**What goes wrong:** Client has no `tables.factions`, `tables.myFactionStandings` — TypeScript errors everywhere.
**How to avoid:** Run `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb` after every schema change.
**Warning signs:** TypeScript errors on `tables.faction` or `tables.myFactionStandings`.

### Pitfall 7: factionId optional field on EnemyTemplate — existing seeding breaks
**What goes wrong:** Adding `factionId: t.u64().optional()` to `EnemyTemplate` and regenerating requires all existing `ctx.db.enemyTemplate.insert(...)` calls to include the new optional field (or omit it, which is fine for optional fields).
**Why it happens:** TypeScript strict mode may flag missing optional field in existing insert calls.
**How to avoid:** Optional fields can be omitted from inserts. Existing insert calls without `factionId` are valid.
**Warning signs:** TypeScript compile errors on existing `enemyTemplate.insert` calls — fix by adding `factionId: undefined` or leaving it out.

### Pitfall 8: Standing type mismatch — i64 vs bigint
**What goes wrong:** `FactionStanding.standing` is `i64` on server (can be negative). On client it arrives as `bigint`. Converting to `Number` for rank computation is safe for the standing values in use (range -5000 to 9000+), but watch for `Number(very_large_bigint)` precision loss.
**How to avoid:** `Number(standing)` is safe for the defined range (-5000 to 9000+). Document this assumption.
**Warning signs:** Rank computation returns wrong rank for very high standing values — won't happen with defined thresholds.

---

## Code Examples

Verified patterns from live codebase:

### Faction Table Definition
```typescript
// spacetimedb/src/index.ts — add before schema() export, near Race table
const Faction = table(
  { name: 'faction', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    description: t.string(),
    rivalFactionId: t.u64().optional(),
  }
);
```

### FactionStanding Table Definition
```typescript
// spacetimedb/src/index.ts — add before schema() export
const FactionStanding = table(
  {
    name: 'faction_standing',
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    factionId: t.u64(),
    standing: t.i64(),
  }
);
```

### schema() export additions
```typescript
// spacetimedb/src/index.ts — add both to schema() call
export const spacetimedb = schema(
  // ... all existing tables ...
  Race,
  Faction,           // ADD
  FactionStanding,   // ADD
);
```

### EnemyTemplate factionId addition
```typescript
// Modify existing EnemyTemplate definition in spacetimedb/src/index.ts
const EnemyTemplate = table(
  { name: 'enemy_template', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    // ... all existing fields ...
    xpReward: t.u64(),
    factionId: t.u64().optional(),   // ADD — which faction this enemy belongs to
  }
);
```

### faction_data.ts seeding constant
```typescript
// spacetimedb/src/data/faction_data.ts — NEW FILE
export const FACTION_DATA: Array<{
  name: string;
  description: string;
  rivalName: string | null;
}> = [
  {
    name: 'Iron Compact',
    description: 'A militaristic union of smiths, soldiers, and engineers who maintain order through strength.',
    rivalName: 'Verdant Circle',
  },
  {
    name: 'Verdant Circle',
    description: 'Druids, herbalists, and wildlands defenders who oppose industrialization and expansion.',
    rivalName: 'Iron Compact',
  },
  {
    name: 'Ashen Order',
    description: 'A secretive brotherhood of scholars devoted to ancient rituals and forbidden knowledge.',
    rivalName: 'Free Blades',
  },
  {
    name: 'Free Blades',
    description: 'An unaligned guild of mercenaries, rogues, and adventurers who answer to no authority.',
    rivalName: 'Ashen Order',
  },
];

export function ensureFactions(ctx: any) {
  // Phase 1: insert or update without rivalFactionId
  for (const data of FACTION_DATA) {
    const existing = [...ctx.db.faction.iter()].find((row: any) => row.name === data.name);
    if (existing) {
      ctx.db.faction.id.update({ ...existing, name: data.name, description: data.description });
    } else {
      ctx.db.faction.insert({ id: 0n, name: data.name, description: data.description, rivalFactionId: undefined });
    }
  }
  // Phase 2: wire rivalFactionId
  for (const data of FACTION_DATA) {
    if (!data.rivalName) continue;
    const row = [...ctx.db.faction.iter()].find((r: any) => r.name === data.name);
    const rival = [...ctx.db.faction.iter()].find((r: any) => r.name === data.rivalName);
    if (row && rival && row.rivalFactionId !== rival.id) {
      ctx.db.faction.id.update({ ...row, rivalFactionId: rival.id });
    }
  }
}
```

### syncAllContent update
```typescript
// spacetimedb/src/index.ts
import { FACTION_DATA, ensureFactions } from './data/faction_data';

function syncAllContent(ctx: any) {
  ensureRaces(ctx);
  ensureFactions(ctx);     // ADD
  ensureWorldLayout(ctx);
  // ... rest unchanged
}
```

### FactionStanding initialization in create_character
```typescript
// spacetimedb/src/reducers/characters.ts — after character insert, before appendPrivateEvent
const character = ctx.db.character.insert({ id: 0n, ... });

grantStarterItems(ctx, character);

// Initialize FactionStanding for all factions at 0
for (const faction of ctx.db.faction.iter()) {
  ctx.db.factionStanding.insert({
    id: 0n,
    characterId: character.id,
    factionId: faction.id,
    standing: 0n,
  });
}

appendPrivateEvent(...);
```

### FactionStanding cleanup in delete_character
```typescript
// spacetimedb/src/reducers/characters.ts — inside delete_character, with other cleanups
for (const row of ctx.db.factionStanding.by_character.filter(characterId)) {
  ctx.db.factionStanding.id.delete(row.id);
}
```

### my_faction_standings view
```typescript
// spacetimedb/src/views/faction.ts — NEW FILE
import type { ViewDeps } from './types';

export const registerFactionViews = ({ spacetimedb, t, FactionStanding }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_faction_standings', public: true },
    t.array(FactionStanding.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player?.activeCharacterId) return [];
      return [...ctx.db.factionStanding.by_character.filter(player.activeCharacterId)];
    }
  );
};
```

### ViewDeps type update
```typescript
// spacetimedb/src/views/types.ts — add Faction + FactionStanding
export type ViewDeps = {
  spacetimedb: any;
  t: any;
  Player: any;
  // ... all existing deps ...
  QuestInstance: any;
  Faction: any;           // ADD
  FactionStanding: any;   // ADD
};
```

### views/index.ts update
```typescript
// spacetimedb/src/views/index.ts
import { registerFactionViews } from './faction';  // ADD

export const registerViews = (deps: ViewDeps) => {
  // ... existing view registrations ...
  registerFactionViews(deps);   // ADD
};
```

### registerViews call update in index.ts
```typescript
// spacetimedb/src/index.ts — update registerViews call
registerViews({
  spacetimedb,
  t,
  Player,
  // ... all existing ...
  QuestInstance,
  Faction,           // ADD
  FactionStanding,   // ADD
});
```

### reducerDeps additions
```typescript
// spacetimedb/src/index.ts — in reducerDeps object
const reducerDeps = {
  // ... all existing deps ...
  Faction,                       // ADD — needed in create_character + delete_character
  FactionStanding,               // ADD — needed in create_character + delete_character
  grantFactionStandingForKill,   // ADD — called from combat.ts kill resolution
};
```

### grantFactionStandingForKill helper (faction.ts in reducers)
```typescript
// Can be defined in spacetimedb/src/index.ts as a standalone function
// or extracted to spacetimedb/src/reducers/faction.ts

const STANDING_PER_KILL = 10n;
const RIVAL_STANDING_PENALTY = 5n;

function mutateStanding(ctx: any, characterId: bigint, factionId: bigint, delta: bigint) {
  const rows = [...ctx.db.factionStanding.by_character.filter(characterId)];
  const existing = rows.find((row) => row.factionId === factionId);
  if (existing) {
    ctx.db.factionStanding.id.update({ ...existing, standing: existing.standing + delta });
  } else {
    ctx.db.factionStanding.insert({ id: 0n, characterId, factionId, standing: delta });
  }
}

function grantFactionStandingForKill(ctx: any, character: any, enemyTemplateId: bigint) {
  const template = ctx.db.enemyTemplate.id.find(enemyTemplateId);
  if (!template?.factionId) return;

  const faction = ctx.db.faction.id.find(template.factionId);
  if (!faction) return;

  mutateStanding(ctx, character.id, faction.id, STANDING_PER_KILL);

  if (faction.rivalFactionId) {
    mutateStanding(ctx, character.id, faction.rivalFactionId, -RIVAL_STANDING_PENALTY);
  }

  appendPrivateEvent(
    ctx, character.id, character.ownerUserId, 'reward',
    `Your standing with ${faction.name} increases.`
  );
}
```

### Combat kill loop update (combat.ts)
```typescript
// spacetimedb/src/reducers/combat.ts — in the "living enemies === 0" block
for (const p of participants) {
  const character = ctx.db.character.id.find(p.characterId);
  if (!character) continue;
  for (const template of enemyTemplates) {
    updateQuestProgressForKill(ctx, character, template.id);
    deps.grantFactionStandingForKill(ctx, character, template.id);  // ADD
  }
}
```

### useGameData.ts additions
```typescript
// src/composables/useGameData.ts
const [factions] = useTable(tables.faction);                        // ADD
const [factionStandings] = useTable(tables.myFactionStandings);     // ADD (generated from view name)

return {
  // ... all existing ...
  factions,           // ADD
  factionStandings,   // ADD
};
```

### RenownPanel client-side FACTION_RANKS
```typescript
// src/components/RenownPanel.vue <script setup>
const FACTION_RANKS = [
  { name: 'Hostile',    min: -Infinity, max: -5001,   color: '#c55' },
  { name: 'Unfriendly', min: -5000,     max: -1,      color: '#c85' },
  { name: 'Neutral',    min: 0,         max: 999,     color: '#aaa' },
  { name: 'Friendly',   min: 1000,      max: 2999,    color: '#8af' },
  { name: 'Honored',    min: 3000,      max: 5999,    color: '#5af' },
  { name: 'Revered',    min: 6000,      max: 8999,    color: '#a5f' },
  { name: 'Exalted',    min: 9000,      max: Infinity, color: '#fa5' },
];

function getRankIndex(standing: number): number {
  for (let i = FACTION_RANKS.length - 1; i >= 0; i--) {
    if (standing >= FACTION_RANKS[i].min) return i;
  }
  return 0;
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| No faction system | Faction + FactionStanding tables | Character standing tracked per faction |
| No kill-based standing | `grantFactionStandingForKill` hook after combat | Enemy kills grant standing |
| No rival cross-faction | `rivalFactionId` on Faction + penalty in mutation helper | Raising one faction lowers its rival |
| Rank as server field | Client-side `FACTION_RANKS` constant | Zero server overhead for rank display |

---

## Open Questions

1. **Standing amount per kill — what's the right number?**
   - What we know: REQ-023 says "killing faction-associated enemies" grants standing, but no amount is specified
   - What's unclear: Whether 10 standing per kill (reaching Friendly at 1000 kills) is intended or too slow/fast
   - Recommendation: Implement as a named constant `STANDING_PER_KILL = 10n` in the helper. Easy to tune.

2. **Which enemy templates get factionId set?**
   - What we know: EnemyTemplate needs a `factionId` field. The `ensureEnemyTemplatesAndRoles` function seeds enemies.
   - What's unclear: Which of the existing 10-15 enemy types map to which faction. The phase spec says "faction-associated enemy" but doesn't map enemies to factions.
   - Recommendation: The planner should decide which enemies map to which factions and add `factionId` wiring to `ensureEnemyTemplatesAndRoles`. This is a planning decision, not a research gap. Suggested mapping: Iron Compact = soldiers/guards, Verdant Circle = druids/nature enemies, Ashen Order = undead/cultists, Free Blades = bandits/rogues.

3. **Quest completion standing grants — REQ-023 also mentions quests**
   - What we know: REQ-023 says standing from "completing faction quests" too. The quest completion reducer is in `reducers/commands.ts` or `reducers/quests.ts`.
   - What's unclear: QuestTemplate currently has no `factionId` field.
   - Recommendation: Phase 3 should add `factionId: t.u64().optional()` to QuestTemplate and grant standing on quest completion similarly to the kill hook. This requires a `grantFactionStandingForQuestCompletion` helper and a hook in quest completion code. This is in-scope for Phase 3 per REQ-023.

4. **Tribute items for standing — REQ-023**
   - What we know: REQ-023 mentions tribute items consumed for standing.
   - What's unclear: How tribute items are identified (a new item field? item type?).
   - Recommendation: Defer detailed implementation of tribute items to a sub-task. The core mechanism (mutateStanding + reducer call) is the same. The trigger point (an "offer tribute" reducer) is what differs.

---

## Sources

### Primary (HIGH confidence)
- Live codebase at `C:/projects/uwr/spacetimedb/src/index.ts` — table definitions, schema export, `reducerDeps`, `syncAllContent`, all patterns
- `C:/projects/uwr/spacetimedb/src/reducers/characters.ts` — `create_character` and `delete_character` reducers
- `C:/projects/uwr/spacetimedb/src/reducers/combat.ts` — `updateQuestProgressForKill` hook pattern, kill resolution loop at line 1805
- `C:/projects/uwr/spacetimedb/src/data/races.ts` — `ensureRaces` / RACE_DATA seeding pattern
- `C:/projects/uwr/spacetimedb/src/views/quests.ts` — `my_quests` view pattern (direct model for `my_faction_standings`)
- `C:/projects/uwr/spacetimedb/src/views/types.ts` — `ViewDeps` type
- `C:/projects/uwr/spacetimedb/src/views/index.ts` — view registration pattern
- `C:/projects/uwr/src/composables/useGameData.ts` — `useTable` subscription pattern
- `C:/projects/uwr/src/components/ActionBar.vue` — PanelKey union, button registration
- `C:/projects/uwr/src/App.vue` — panel wiring, props passing pattern
- `C:/projects/uwr/src/components/QuestPanel.vue` — UI panel pattern for RenownPanel

### Secondary (MEDIUM confidence)
- CLAUDE.md SpacetimeDB TypeScript SDK rules — confirmed `table()` signature, composite PK constraints, multi-column index limitation, `t.i64()` type, reducer object syntax

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from live codebase (spacetimedb ^1.12.0, vue ^3.5.13)
- Architecture patterns: HIGH — every pattern derived from live code, not assumptions
- Composite PK limitation: HIGH — documented in CLAUDE.md + SDK rules, confirmed by existing QuestInstance pattern
- Standing amounts per kill: LOW — not specified in requirements, using reasonable defaults
- Enemy-to-faction mapping: LOW — not specified in requirements, requires planning decision

**Research date:** 2026-02-11
**Valid until:** 2026-03-13 (stable codebase, no external dependencies changing)
