# Phase 12: Overall Renown System - Research

**Researched:** 2026-02-14
**Domain:** Character progression system (SpacetimeDB + Vue 3)
**Confidence:** HIGH

## Summary

Phase 12 implements a character-wide prestige progression system (renown) separate from faction standing. The system features 15 named ranks across 5 tiers with varying threshold scaling, permanent perk choices from pools at each rank, and renown gain from server-first/personal-first activities (boss kills, achievements, event participation, quest completion).

The technical domain spans SpacetimeDB tables/reducers/views for backend storage and progression logic, Vue 3 components for UI presentation, and integration hooks into existing combat, achievement, and event systems. The project uses a pure SpacetimeDB + Vue 3 stack with no toast notification libraries, relying on inline UI state for rank-up notifications.

**Primary recommendation:** Use SpacetimeDB tables for renown progression state and perk selections, implement server-first tracking with world event announcements, design stepped threshold curve with exponential scaling within tiers, and leverage existing panel architecture for dedicated Renown UI.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Rank structure and thresholds:**
- 15 named ranks (deep progression system for long-term engagement)
- Stepped curve with 5 tiers: ranks 1-3, 4-6, 7-9, 10-12, 13-15
- Each tier has different threshold scaling (frequent difficulty shifts, varied pacing)
- Named ranks (e.g., Initiate, Veteran, Legend) - not numbered ranks

**Perk system design:**
- Mix of passive stat bonuses and active abilities (cooldown-based special abilities)
- Choice from pool: each rank offers 2-3 perk options, player picks one (builds variety)
- Unlimited active perks - all chosen perks are active simultaneously
- Permanent choices - no respec system (choices matter, creates alt character value)

**Renown gain sources:**

*Sources:*
- World events participation
- World boss kills
- Achievement milestones
- Quest completion

*Reward structure (prestige-oriented):*
- Server-first bonuses: first player(s) to kill a boss, complete a quest, or discover something get large renown bonuses
- Diminishing returns: subsequent players get reduced rewards (2nd place < 1st, 3rd < 2nd, etc.)
- Event participation-based rewards: contribution-scaled renown from world events
- Baseline personal-first rewards: players get modest renown for their own first-time boss kill or quest completion (casual-friendly)
- Mostly one-time rewards: achievements and first kills are finite, not grindable

*Server-first tracking:*
- Global announcements in event log: "[Player] was first to slay [Boss]!" visible to all players
- Hall of Fame / Leaderboard: dedicated UI showing who achieved server-firsts and when

**UI presentation:**
- Dedicated Renown panel (separate floating window, not integrated into Character panel)
- Perk selection flow: notification appears immediately on rank up, but player can dismiss and choose from Renown panel later (not forced choice)
- Progress visualization: linear progress bar with current rank name displayed
- Perk display format: Claude's discretion (choose based on unlimited active perks model)

**Test content scope:**
- Include minimal test content within Phase 12:
  - 1 test achievement (manually triggerable or auto-granted for validation)
  - Boss kill hook (integrate with existing combat system to grant renown)
  - Event participation stub (minimal hook for testing, full event system is Phase 18)
- Purpose: validates renown system works end-to-end with minimal test cases
- Full boss/event systems built in Phases 17 and 18

### Claude's Discretion

- Exact threshold values for each of the 5 tiers (design stepped curve for engagement pacing)
- Specific rank names (15 names fitting the Shadeslinger tone)
- Perk pool size and variety (how many perks to offer per rank)
- Specific perk effects and balance (stat bonus values, active ability designs)
- Perk display UI layout (list, grid, or tree structure)
- Exact renown point amounts for each source type
- Diminishing returns curve formula (how quickly bonus drops from 1st to 2nd to 3rd place)
- Leaderboard structure and filtering (all-time, by category, etc.)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SpacetimeDB TypeScript SDK | 1.12.0 | Backend tables, reducers, views | Project's chosen backend architecture |
| Vue 3 | 3.5.13 | Frontend UI framework | Project's established frontend framework |
| TypeScript | 5.6.2 | Type-safe development | Project standard across backend and frontend |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | N/A | No external libraries needed | Pure SpacetimeDB + Vue 3 implementation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SpacetimeDB tables | Client-side state | SpacetimeDB provides authoritative server state, multiplayer sync, and persistence - essential for server-first tracking |
| Inline notification UI | vue3-toastify | Project has no toast library; inline UI state (like death modal) matches existing patterns |
| Exponential curve | Linear curve | Exponential provides better engagement pacing with "walls" between tiers as user decided |

**Installation:**

No new dependencies required - uses existing project stack.

## Architecture Patterns

### Recommended Project Structure

```
spacetimedb/src/
├── schema/
│   └── tables.ts              # Add Renown, RenownPerk, RenownServerFirst tables
├── data/
│   └── renown_data.ts         # Rank definitions, threshold curves, perk templates
├── reducers/
│   └── renown.ts              # award_renown, choose_perk, test_grant_achievement
├── helpers/
│   └── renown.ts              # calculateRank, checkRankUp, awardServerFirst
└── views/
    └── renown.ts              # my_renown, renown_leaderboard views

src/components/
└── RenownPanel.vue            # Overwrite existing stub with full implementation
```

### Pattern 1: Renown State Storage

**What:** Character-wide renown points and perk selections stored in SpacetimeDB tables

**When to use:** Core progression data requiring authoritative server state and multiplayer visibility

**Example:**

```typescript
// spacetimedb/src/schema/tables.ts
export const Renown = table(
  {
    name: 'renown',
    public: true,
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    points: t.u64(),           // Total renown points earned
    currentRank: t.u64(),      // Current rank (1-15)
    updatedAt: t.timestamp(),
  }
);

export const RenownPerk = table(
  {
    name: 'renown_perk',
    public: true,
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    rank: t.u64(),             // Rank at which this perk was chosen
    perkKey: t.string(),       // Identifier for the perk (e.g., 'veteran_armor')
    chosenAt: t.timestamp(),
  }
);
```

**Source:** Existing project patterns in schema/tables.ts (Character, FactionStanding tables)

### Pattern 2: Server-First Tracking

**What:** Global tracking of who achieved milestones first, with diminishing returns for subsequent players

**When to use:** Prestige-oriented rewards requiring server-wide state and announcements

**Example:**

```typescript
// spacetimedb/src/schema/tables.ts
export const RenownServerFirst = table(
  {
    name: 'renown_server_first',
    public: true,
    indexes: [
      { name: 'by_category_key', algorithm: 'btree', columns: ['category', 'achievementKey'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    category: t.string(),        // 'boss_kill', 'achievement', 'quest'
    achievementKey: t.string(),  // e.g., 'kill_dragon_boss', 'quest_12'
    characterId: t.u64(),
    characterName: t.string(),
    achievedAt: t.timestamp(),
    position: t.u64(),           // 1st, 2nd, 3rd, etc.
  }
);

// spacetimedb/src/helpers/renown.ts
export function awardServerFirst(
  ctx: any,
  character: any,
  category: string,
  achievementKey: string,
  baseRenown: bigint
) {
  // Check if anyone has achieved this yet
  const existing = [...ctx.db.renownServerFirst.by_category_key.filter(category, achievementKey)];
  const position = BigInt(existing.length + 1);

  // Diminishing returns: 100%, 50%, 25%, 12.5%, etc.
  const multiplier = 1.0 / (2 ** Number(position - 1n));
  const renownAwarded = BigInt(Math.floor(Number(baseRenown) * multiplier));

  // Record server-first position
  ctx.db.renownServerFirst.insert({
    id: 0n,
    category,
    achievementKey,
    characterId: character.id,
    characterName: character.name,
    achievedAt: ctx.timestamp,
    position,
  });

  // Announce if top 3
  if (position <= 3n) {
    const ordinal = position === 1n ? 'first' : position === 2n ? 'second' : 'third';
    appendWorldEvent(ctx, 'renown', `${character.name} was ${ordinal} to ${category} ${achievementKey}!`);
  }

  return renownAwarded;
}
```

**Source:** Design pattern from [System Design of a Real-Time Gaming Leaderboard](https://blog.algomaster.io/p/design-real-time-gaming-leaderboard), adapted for SpacetimeDB

### Pattern 3: Stepped Threshold Curve

**What:** 5-tier exponential curve with different scaling factors per tier

**When to use:** Progression pacing with distinct "walls" between tiers for engagement variety

**Example:**

```typescript
// spacetimedb/src/data/renown_data.ts
export const RENOWN_RANKS = [
  // Tier 1: Fast early progression (ranks 1-3)
  { rank: 1, name: 'Initiate', threshold: 0n },
  { rank: 2, name: 'Aspirant', threshold: 100n },      // +100
  { rank: 3, name: 'Adept', threshold: 250n },         // +150

  // Tier 2: Moderate scaling (ranks 4-6)
  { rank: 4, name: 'Proven', threshold: 500n },        // +250
  { rank: 5, name: 'Veteran', threshold: 900n },       // +400
  { rank: 6, name: 'Elite', threshold: 1500n },        // +600

  // Tier 3: Steeper climb (ranks 7-9)
  { rank: 7, name: 'Champion', threshold: 2500n },     // +1000
  { rank: 8, name: 'Paragon', threshold: 4000n },      // +1500
  { rank: 9, name: 'Exemplar', threshold: 6500n },     // +2500

  // Tier 4: Prestige territory (ranks 10-12)
  { rank: 10, name: 'Hero', threshold: 10000n },       // +3500
  { rank: 11, name: 'Exalted', threshold: 15000n },    // +5000
  { rank: 12, name: 'Ascendant', threshold: 22000n },  // +7000

  // Tier 5: Endgame legends (ranks 13-15)
  { rank: 13, name: 'Legend', threshold: 32000n },     // +10000
  { rank: 14, name: 'Mythic', threshold: 47000n },     // +15000
  { rank: 15, name: 'Eternal', threshold: 70000n },    // +23000
];

export function calculateRankFromPoints(points: bigint): number {
  for (let i = RENOWN_RANKS.length - 1; i >= 0; i--) {
    if (points >= RENOWN_RANKS[i].threshold) {
      return RENOWN_RANKS[i].rank;
    }
  }
  return 1;
}
```

**Source:** [Level Curves - The Art of Designing In Game Progression](https://www.designthegame.com/learning/courses/course/fundamentals-level-curve-design/level-curves-art-designing-game-progression) and [Example Level Curve Formulas](https://www.designthegame.com/learning/courses/course/fundamentals-level-curve-design/example-level-curve-formulas-game-progression)

### Pattern 4: Perk Choice System

**What:** Pool-based perk selection with permanent choices and unlimited active perks

**When to use:** Character customization with meaningful, irreversible decisions

**Example:**

```typescript
// spacetimedb/src/data/renown_data.ts
export const RENOWN_PERK_POOLS = {
  2: [ // Rank 2 perk pool
    { key: 'aspirant_vitality', name: 'Aspirant Vitality', type: 'passive', effect: { maxHp: 50n } },
    { key: 'aspirant_power', name: 'Aspirant Power', type: 'passive', effect: { str: 2n } },
    { key: 'aspirant_focus', name: 'Aspirant Focus', type: 'passive', effect: { int: 2n } },
  ],
  5: [ // Rank 5 perk pool
    { key: 'veteran_shield', name: 'Veteran Shield', type: 'active',
      effect: { cooldownSeconds: 300, description: 'Absorb 30% damage for 10 seconds' } },
    { key: 'veteran_critical', name: 'Veteran Critical', type: 'passive',
      effect: { critMelee: 5n, critRanged: 5n } },
  ],
  // ... pools for each rank 2-15
};

// spacetimedb/src/reducers/renown.ts
spacetimedb.reducer('choose_perk', { perkKey: t.string() }, (ctx, { perkKey }) => {
  const character = requireCharacterOwnedBy(ctx, /* get active character */);
  const renown = ctx.db.renown.by_character.find(character.id);
  if (!renown) throw new SenderError('No renown data');

  // Verify perk is valid for current rank
  const pool = RENOWN_PERK_POOLS[renown.currentRank];
  const perk = pool?.find(p => p.key === perkKey);
  if (!perk) throw new SenderError('Invalid perk for rank');

  // Verify player hasn't already chosen for this rank
  const existing = [...ctx.db.renownPerk.by_character.filter(character.id)]
    .find(p => p.rank === renown.currentRank);
  if (existing) throw new SenderError('Perk already chosen for this rank');

  // Record choice (permanent)
  ctx.db.renownPerk.insert({
    id: 0n,
    characterId: character.id,
    rank: renown.currentRank,
    perkKey,
    chosenAt: ctx.timestamp,
  });

  appendSystemMessage(ctx, character, `You have chosen: ${perk.name}`);
});
```

**Source:** Existing project pattern in reducers/characters.ts (character creation) and helpers/items.ts (item choices)

### Pattern 5: Private View with Computed State

**What:** Per-user view aggregating renown data, current perks, and rank-up eligibility

**When to use:** Character-specific data requiring aggregation across multiple tables

**Example:**

```typescript
// spacetimedb/src/views/renown.ts
export const registerRenownViews = ({ spacetimedb, t, Renown, RenownPerk }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_renown', public: true },
    t.object({
      points: t.u64(),
      currentRank: t.u64(),
      nextRankThreshold: t.u64().optional(),
      chosenPerks: t.array(t.object({
        rank: t.u64(),
        perkKey: t.string(),
      })),
      hasUnspentPerkChoice: t.bool(),
    }),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player?.activeCharacterId) return null;

      const renown = ctx.db.renown.by_character.find(player.activeCharacterId);
      if (!renown) return null;

      const chosenPerks = [...ctx.db.renownPerk.by_character.filter(player.activeCharacterId)]
        .map(p => ({ rank: p.rank, perkKey: p.perkKey }));

      const nextRank = RENOWN_RANKS.find(r => r.rank === renown.currentRank + 1);

      return {
        points: renown.points,
        currentRank: renown.currentRank,
        nextRankThreshold: nextRank?.threshold,
        chosenPerks,
        hasUnspentPerkChoice: !chosenPerks.some(p => p.rank === renown.currentRank),
      };
    }
  );
};
```

**Source:** Existing project pattern in views/faction.ts (my_faction_standings view)

### Pattern 6: Vue 3 Inline Notification

**What:** Rank-up notification as dismissible overlay in main app view

**When to use:** Important state changes requiring user acknowledgment without external toast library

**Example:**

```vue
<!-- src/App.vue -->
<template>
  <!-- Rank-up notification overlay -->
  <div v-if="rankUpNotification" :style="styles.rankUpOverlay">
    <div :style="styles.rankUpModal">
      <div :style="styles.rankUpTitle">Rank Up!</div>
      <div :style="styles.rankUpRank">{{ rankUpNotification.rankName }}</div>
      <div :style="styles.rankUpMessage">Choose a perk from the Renown panel</div>
      <button :style="styles.primaryButton" @click="dismissRankUp">Continue</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const rankUpNotification = ref<{ rankName: string } | null>(null);

watch(() => myRenown.value?.hasUnspentPerkChoice, (hasUnspent, hadUnspent) => {
  if (hasUnspent && !hadUnspent) {
    const rank = RENOWN_RANKS.find(r => r.rank === myRenown.value.currentRank);
    rankUpNotification.value = { rankName: rank?.name ?? 'Unknown' };
  }
});

const dismissRankUp = () => {
  rankUpNotification.value = null;
};
</script>
```

**Source:** Existing project pattern in App.vue (death modal at line 387)

### Anti-Patterns to Avoid

- **Client-side renown calculation:** Always compute rank on server to prevent tampering
- **Mutable perk choices:** Once chosen, perk selections are permanent - no respec system
- **Grindable server-firsts:** Each achievement/boss/quest awards server-first bonus only once per player globally
- **Forced perk selection:** Allow players to dismiss rank-up notification and choose later from Renown panel

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Leaderboard pagination | Custom pagination logic | SpacetimeDB table scan with client-side sorting | Small dataset (server-firsts are finite), simpler to fetch all and sort client-side |
| Toast notifications | Custom notification system | Inline Vue state (modals/overlays) | Project has no toast library; death modal pattern already established |
| Diminishing returns | Complex logarithmic formula | Simple exponential decay (1/2^n) | Easy to understand, tune, and communicate to players |
| Perk stat application | Runtime stat calculation | Pre-computed stat modifiers in helper | Perks modify character stats directly on selection for performance |

**Key insight:** SpacetimeDB's table indexes and views handle most "complex" data operations. Leaning on existing patterns (faction standing, death modal, combat helpers) avoids over-engineering.

## Common Pitfalls

### Pitfall 1: Multi-Column Index Filtering

**What goes wrong:** SpacetimeDB multi-column indexes are currently broken - filtering on them causes panics or empty results

**Why it happens:** Known limitation in SpacetimeDB TypeScript SDK per project's CLAUDE.md

**How to avoid:** Use single-column indexes only. For RenownServerFirst lookups by `(category, achievementKey)`, use single index on `category` and filter manually in TypeScript:

```typescript
// ❌ WRONG - multi-column index filter
const existing = [...ctx.db.renownServerFirst.by_category_key.filter(category, achievementKey)];

// ✅ RIGHT - single-column index + manual filter
for (const row of ctx.db.renownServerFirst.by_category.filter(category)) {
  if (row.achievementKey === achievementKey) {
    // ... process
  }
}
```

**Warning signs:** PANIC errors or unexpectedly empty results when filtering on multi-column indexes

### Pitfall 2: Auto-Increment ID Gaps

**What goes wrong:** Assuming auto-increment IDs are sequential for ordering or counting

**Why it happens:** SpacetimeDB auto-increment IDs are not guaranteed sequential - gaps are normal

**How to avoid:** Use explicit `position` field or `createdAt` timestamp for ordering. Never use `id` for business logic like "3rd place = id 3".

```typescript
// ❌ WRONG - using ID for position
const position = serverFirst.id; // Could be 1, 5, 12 due to gaps

// ✅ RIGHT - explicit position field
const position = serverFirst.position; // 1, 2, 3 tracked explicitly
```

**Warning signs:** Leaderboard positions don't match expected order, gaps in position numbers

### Pitfall 3: Reducer Return Values

**What goes wrong:** Attempting to return data from reducers to callers

**Why it happens:** Reducers are transactional database operations, not RPC calls

**How to avoid:** Use views to expose computed state. Reducers mutate tables; clients read via subscriptions.

```typescript
// ❌ WRONG - trying to return data from reducer
spacetimedb.reducer('award_renown', { points: t.u64() }, (ctx, { points }) => {
  // ... award logic
  return { newRank: 5 }; // This doesn't work!
});

// ✅ RIGHT - mutate table, read via view
spacetimedb.reducer('award_renown', { points: t.u64() }, (ctx, { points }) => {
  // ... award logic
  ctx.db.renown.id.update({ ...renown, points: newPoints });
  // Client reads updated rank via my_renown view subscription
});
```

**Warning signs:** Client code expecting return values from reducer calls, undefined results

### Pitfall 4: Timestamp Client-Side Conversion

**What goes wrong:** Treating Timestamp as a number instead of object with `microsSinceUnixEpoch`

**Why it happens:** TypeScript's Timestamp type is a structured object, not a primitive

**How to avoid:** Always access `.microsSinceUnixEpoch` before converting to JavaScript Date:

```typescript
// ❌ WRONG - timestamp is not a number
const date = new Date(Number(row.achievedAt));

// ✅ RIGHT - extract microsSinceUnixEpoch first
const date = new Date(Number(row.achievedAt.microsSinceUnixEpoch / 1000n));
```

**Warning signs:** Invalid Date objects, NaN timestamps in UI

### Pitfall 5: View Iteration Restrictions

**What goes wrong:** Using `.iter()` in views to scan all rows

**Why it happens:** Views can only access data via index lookups, not full table scans

**How to avoid:** Always filter views via indexes. For leaderboard, use public table and fetch client-side:

```typescript
// ❌ WRONG - views cannot use .iter()
spacetimedb.view({ name: 'renown_leaderboard' }, t.array(...), (ctx) => {
  return [...ctx.db.renownServerFirst.iter()]; // NOT ALLOWED
});

// ✅ RIGHT - use public table, filter client-side
// In tables.ts: { name: 'renown_server_first', public: true }
// Client: const [leaderboard] = useTable(tables.renownServerFirst);
```

**Warning signs:** View errors about iteration, empty view results

### Pitfall 6: Permanent Perk Validation

**What goes wrong:** Allowing multiple perk selections per rank or changing past choices

**Why it happens:** Missing validation in choose_perk reducer

**How to avoid:** Check for existing perk selection before allowing choice:

```typescript
// Check if perk already chosen for this rank
const existing = [...ctx.db.renownPerk.by_character.filter(character.id)]
  .find(p => p.rank === renown.currentRank);
if (existing) throw new SenderError('Perk already chosen for this rank');
```

**Warning signs:** Players selecting multiple perks per rank, perk changes after selection

## Code Examples

Verified patterns from official sources and existing project code:

### Renown Award with Rank-Up Check

```typescript
// spacetimedb/src/helpers/renown.ts
import { RENOWN_RANKS } from '../data/renown_data';
import { appendSystemMessage, appendWorldEvent } from './events';

export function awardRenown(ctx: any, character: any, points: bigint, reason: string) {
  // Get or create renown record
  let renown = ctx.db.renown.by_character.find(character.id);
  if (!renown) {
    renown = ctx.db.renown.insert({
      id: 0n,
      characterId: character.id,
      points: 0n,
      currentRank: 1n,
      updatedAt: ctx.timestamp,
    });
  }

  const oldRank = Number(renown.currentRank);
  const newPoints = renown.points + points;
  const newRank = calculateRankFromPoints(newPoints);

  // Update renown
  ctx.db.renown.by_character.update({
    ...renown,
    points: newPoints,
    currentRank: BigInt(newRank),
    updatedAt: ctx.timestamp,
  });

  appendSystemMessage(ctx, character, `You earned ${points} renown: ${reason}`);

  // Rank up?
  if (newRank > oldRank) {
    const rankInfo = RENOWN_RANKS.find(r => r.rank === newRank);
    appendSystemMessage(ctx, character, `🎉 You have achieved rank: ${rankInfo?.name}!`);
    appendWorldEvent(ctx, 'renown', `${character.name} achieved rank ${rankInfo?.name}!`);
  }
}

export function calculateRankFromPoints(points: bigint): number {
  for (let i = RENOWN_RANKS.length - 1; i >= 0; i--) {
    if (points >= RENOWN_RANKS[i].threshold) {
      return RENOWN_RANKS[i].rank;
    }
  }
  return 1;
}
```

**Source:** Adapted from existing helpers/character.ts XP gain pattern

### Boss Kill Integration Hook

```typescript
// spacetimedb/src/reducers/combat.ts (add to endCombat logic)
import { awardServerFirst } from '../helpers/renown';

// In endCombat victory handling, after XP award:
for (const participant of participants) {
  const character = ctx.db.character.id.find(participant.characterId);
  if (!character) continue;

  // Award renown for boss kills
  if (/* is boss enemy */) {
    const bossKey = `boss_${enemyTemplate.name.toLowerCase().replace(/\s/g, '_')}`;
    const baseRenown = 500n; // Boss base renown value

    const renownAwarded = awardServerFirst(ctx, character, 'boss_kill', bossKey, baseRenown);
    awardRenown(ctx, character, renownAwarded, `Defeating ${enemyTemplate.name}`);
  }
}
```

**Source:** Existing combat.ts endCombat reducer pattern

### Perk Stat Application Helper

```typescript
// spacetimedb/src/helpers/renown.ts
import { RENOWN_PERK_POOLS } from '../data/renown_data';

export function calculatePerkBonuses(ctx: any, characterId: bigint) {
  const perks = [...ctx.db.renownPerk.by_character.filter(characterId)];
  const bonuses = {
    maxHp: 0n,
    str: 0n,
    int: 0n,
    critMelee: 0n,
    critRanged: 0n,
    // ... other stats
  };

  for (const perk of perks) {
    const pool = RENOWN_PERK_POOLS[Number(perk.rank)];
    const perkData = pool?.find(p => p.key === perk.perkKey);
    if (!perkData || perkData.type !== 'passive') continue;

    // Accumulate passive bonuses
    for (const [stat, value] of Object.entries(perkData.effect)) {
      if (typeof value === 'bigint') {
        bonuses[stat] = (bonuses[stat] ?? 0n) + value;
      }
    }
  }

  return bonuses;
}
```

**Source:** Similar to helpers/items.ts equipment stat calculation

### Vue Renown Panel Component

```vue
<!-- src/components/RenownPanel.vue -->
<template>
  <div :style="styles.panelBody">
    <div v-if="!selectedCharacter" :style="styles.subtle">Select a character.</div>
    <div v-else-if="!renownData" :style="styles.subtle">No renown data.</div>
    <div v-else>
      <!-- Current rank display -->
      <div :style="styles.resultCard">
        <div :style="styles.recipeName">{{ currentRankInfo.name }}</div>
        <div :style="styles.subtleSmall">Rank {{ renownData.currentRank }} / 15</div>
        <div :style="styles.subtleSmall">Renown: {{ renownData.points }}</div>

        <!-- Progress bar -->
        <div v-if="renownData.nextRankThreshold" :style="progressBarContainer">
          <div :style="{ ...progressBarFill, width: `${progressPercent}%` }" />
        </div>
        <div v-if="renownData.nextRankThreshold" :style="styles.subtleSmall">
          Next: {{ nextRankInfo.name }} ({{ renownData.nextRankThreshold }})
        </div>
        <div v-else :style="styles.subtleSmall">Maximum rank achieved!</div>
      </div>

      <!-- Perk selection -->
      <div v-if="renownData.hasUnspentPerkChoice" :style="styles.panelSection">
        <div :style="styles.panelSectionTitle">Choose a Perk</div>
        <div :style="styles.gridWrap">
          <div
            v-for="perk in availablePerks"
            :key="perk.key"
            :style="styles.perkTile"
            @click="choosePerk(perk.key)"
          >
            <div :style="styles.perkName">{{ perk.name }}</div>
            <div :style="styles.perkType">{{ perk.type }}</div>
            <div :style="styles.subtle">{{ formatPerkEffect(perk.effect) }}</div>
          </div>
        </div>
      </div>

      <!-- Chosen perks history -->
      <div :style="styles.panelSection">
        <div :style="styles.panelSectionTitle">Your Perks</div>
        <div v-for="chosen in chosenPerksSorted" :key="`${chosen.rank}-${chosen.perkKey}`" :style="styles.perkRow">
          <span>Rank {{ chosen.rank }}:</span>
          <span>{{ getPerkName(chosen.rank, chosen.perkKey) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RENOWN_RANKS, RENOWN_PERK_POOLS } from '../module_bindings'; // From data file

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  selectedCharacter: CharacterRow | null;
  renownData: MyRenownRow | null;
  connActive: boolean;
}>();

const emit = defineEmits<{
  (e: 'choosePerk', perkKey: string): void;
}>();

const currentRankInfo = computed(() => {
  if (!props.renownData) return RENOWN_RANKS[0];
  return RENOWN_RANKS.find(r => r.rank === Number(props.renownData.currentRank)) ?? RENOWN_RANKS[0];
});

const nextRankInfo = computed(() => {
  if (!props.renownData?.nextRankThreshold) return null;
  return RENOWN_RANKS.find(r => r.rank === Number(props.renownData.currentRank) + 1);
});

const progressPercent = computed(() => {
  if (!props.renownData?.nextRankThreshold) return 100;
  const current = Number(props.renownData.points);
  const prev = Number(currentRankInfo.value.threshold);
  const next = Number(props.renownData.nextRankThreshold);
  return Math.min(100, Math.max(0, ((current - prev) / (next - prev)) * 100));
});

const availablePerks = computed(() => {
  if (!props.renownData) return [];
  return RENOWN_PERK_POOLS[Number(props.renownData.currentRank)] ?? [];
});

const chosenPerksSorted = computed(() => {
  if (!props.renownData) return [];
  return [...props.renownData.chosenPerks].sort((a, b) => Number(a.rank) - Number(b.rank));
});

const choosePerk = (perkKey: string) => {
  emit('choosePerk', perkKey);
};

const formatPerkEffect = (effect: any) => {
  // Format effect object for display
  return Object.entries(effect)
    .map(([key, val]) => `${key}: +${val}`)
    .join(', ');
};

const getPerkName = (rank: bigint, perkKey: string) => {
  const pool = RENOWN_PERK_POOLS[Number(rank)];
  return pool?.find(p => p.key === perkKey)?.name ?? perkKey;
};

const progressBarContainer = {
  background: 'rgba(255,255,255,0.1)',
  borderRadius: '999px',
  height: '8px',
  overflow: 'hidden',
  marginTop: '8px',
};

const progressBarFill = {
  height: '100%',
  borderRadius: '999px',
  background: 'linear-gradient(90deg, #5af, #fa5)',
  transition: 'width 0.5s ease',
};
</script>
```

**Source:** Adapted from existing RenownPanel.vue (faction standing) and CharacterPanel.vue patterns

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global leaderboards only | Tiered server-first (1st/2nd/3rd) with diminishing returns | 2024-2026 MMO design trend | Rewards both competitive and casual players |
| Grindable reputation | One-time prestige achievements | Prestige system evolution | Prevents burnout, values skill over time investment |
| Respec-able talent trees | Permanent perk choices | Classic RPG revival | Creates meaningful decisions and alt character value |
| Linear progression curves | Stepped multi-tier curves | Modern engagement design | Varied pacing prevents monotony |
| Toast notification libraries | Inline UI state (modals) | Vue 3 Composition API era | Simpler state management, fewer dependencies |

**Deprecated/outdated:**

- **Linear XP curves:** Modern MMOs use stepped curves with tier transitions for engagement variety (see [Level Curves - The Art of Designing In Game Progression](https://www.designthegame.com/learning/courses/course/fundamentals-level-curve-design/level-curves-art-designing-game-progression))
- **Redis sorted sets for leaderboards (at small scale):** For finite server-first tracking (hundreds of entries max), SpacetimeDB tables with client-side sorting are simpler than adding Redis infrastructure (see [Leaderboard System Design](https://systemdesign.one/leaderboard-system-design/))

## Open Questions

1. **Active perk ability cooldowns: global or per-encounter?**
   - What we know: Active perks have cooldown abilities, but cooldown scope is unspecified
   - What's unclear: Whether active perk cooldowns reset on combat end or persist globally like regular abilities
   - Recommendation: Use global cooldowns tracked in RenownPerkCooldown table (similar to AbilityCooldown pattern) for consistency

2. **Event participation renown formula**
   - What we know: Event participation awards renown scaled by contribution
   - What's unclear: How to measure "contribution" in Phase 12 stub without full event system (Phase 18)
   - Recommendation: Implement simple participation flag for Phase 12 test stub (binary: participated = fixed renown), defer complex contribution scoring to Phase 18

3. **Personal-first vs server-first interaction**
   - What we know: Players get both personal-first (modest) and position-based (diminishing) rewards
   - What's unclear: Are these additive or does server-first replace personal-first?
   - Recommendation: Additive system - personal-first baseline + server-first bonus if applicable (more generous, casual-friendly)

4. **Perk stat bonuses: flat or percentage?**
   - What we know: Perks grant stat bonuses like +50 HP or +2 STR
   - What's unclear: Should endgame perks scale with character level (percentage-based)?
   - Recommendation: Flat bonuses for simplicity and predictability, balance through testing (easier to tune than percentage systems)

## Sources

### Primary (HIGH confidence)

- **Project codebase:** spacetimedb/src/schema/tables.ts, src/components/RenownPanel.vue, CLAUDE.md - Existing architecture patterns for tables, views, UI components
- **SpacetimeDB official docs (via CLAUDE.md):** Table definition, reducer patterns, view restrictions - Core framework capabilities

### Secondary (MEDIUM confidence)

- [Renown Guide for the War Within - Icy Veins](https://www.icy-veins.com/wow/renown-guide) - WoW renown system design (account-wide progression, tiered unlocks)
- [Massively Overthinking: Prestige systems in MMORPGs](https://massivelyop.com/2016/09/15/massively-overthinking-prestige-systems-in-mmorpgs/) - Prestige system philosophy
- [Level Curves - The Art of Designing In Game Progression](https://www.designthegame.com/learning/courses/course/fundamentals-level-curve-design/level-curves-art-designing-game-progression) - Stepped curve design methodology
- [Example Level Curve Formulas for Game Progression](https://www.designthegame.com/learning/courses/course/fundamentals-level-curve-design/example-level-curve-formulas-game-progression) - Tier-based scaling patterns
- [Graphs for Player Progression Part II - Medium](https://medium.com/js-game-design-journals/graphs-for-player-progression-part-ii-3807b25beee5) - Progression pacing analysis
- [Diminishing Returns in Game Design: Exponential Decay](https://blog.nerdbucket.com/diminishing-returns-in-game-design-exponential-decay-and-convergent-series/article) - Diminishing returns formulas
- [System Design of a Real-Time Gaming Leaderboard](https://blog.algomaster.io/p/design-real-time-gaming-leaderboard) - Leaderboard architecture patterns
- [Leaderboard System Design](https://systemdesign.one/leaderboard-system-design/) - Scalable leaderboard approaches
- [Vue Toastification](https://vue-toastification.maronato.dev/) - Vue 3 toast library (evaluated but not using)
- [Vue3-Toastify](https://vue3-toastify.js-bridge.com/) - Alternative Vue 3 toast library (evaluated but not using)

### Tertiary (LOW confidence)

- [Keys to Meaningful Skill Trees - GDKeys](https://gdkeys.com/keys-to-meaningful-skill-trees/) - Talent tree design philosophy (general game design, not implementation)
- [Let's Spec Into Talent Trees: A Primer for Game Designers](https://gamedevelopment.tutsplus.com/lets-spec-into-talent-trees-a-primer-for-game-designers--gamedev-6691a) - Talent system theory (dated 2012)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Pure existing project dependencies (SpacetimeDB 1.12.0 + Vue 3.5.13)
- Architecture: HIGH - Patterns verified in existing codebase (tables.ts, views/*.ts, RenownPanel.vue stub)
- Pitfalls: HIGH - Documented in project CLAUDE.md (multi-column indexes, timestamp conversion, view iteration)
- Progression curves: MEDIUM - Design patterns from authoritative sources but require tuning via playtesting
- Leaderboard implementation: MEDIUM - Design patterns from system design articles, adapted for SpacetimeDB constraints
- Notification UI: HIGH - Death modal pattern exists in App.vue, direct precedent for rank-up notification

**Research date:** 2026-02-14
**Valid until:** ~2026-03-14 (30 days - stable stack, design principles evergreen)
