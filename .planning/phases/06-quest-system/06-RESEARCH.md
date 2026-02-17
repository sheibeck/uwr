# Phase 6: Quest System - Research

**Researched:** 2026-02-16
**Domain:** SpacetimeDB TypeScript SDK 1.12.0, faction-gated quest system, Vue 3 quest UI, LLM text generation integration
**Confidence:** HIGH (all claims verified against live codebase)

---

## Summary

Phase 6 extends the existing `QuestTemplate`/`QuestInstance` schema with faction-gating, reward expansion (gold + faction standing), and LLM-generated quest descriptions. The existing schema is a "kill quest only" system built around NPCs and enemy templates. Phase 6 must decide whether to **extend** the existing tables or **augment** them with new fields. After examining the codebase, the correct approach is **extension**: add `factionId`, `requiredStanding`, `rewardGold`, and `rewardFactionStanding` fields to `QuestTemplate`, and add a new `FactionQuest` table for the 8 renown-gated faction quests (keeping the existing NPC-quest system intact).

The critical constraint is that **Phase 4 (LLM Architecture) has NOT been implemented**. No `LlmConfig`, `GeneratedQuestText`, `LlmCircuit`, or `generate_content` procedure exists. Phase 6 must either (a) implement Phase 4's LLM tables/procedure inline, or (b) design the quest description system to work without LLM first (fallback text only), with LLM as an enhancement. The quest system itself should NOT be blocked by LLM availability.

The client-side architecture is Vue 3 with `useTable()` composable for all data access. The existing `QuestPanel.vue` only shows active quest instances — it must be replaced with a full panel showing available quests (faction-gated), active quests with LLM descriptions, and a quest log. Views have unreliable reactivity in this codebase, so the `available_quests` view should be replaced by client-side filtering of `factionStanding` + `questTemplate` public tables.

**Primary recommendation:** Extend QuestTemplate with 4 new fields. Create a separate `FactionQuest` table for the 8 faction quests that carries faction/standing metadata. Track per-player quest state in a new `PlayerFactionQuest` table (distinct from NPC-quest `QuestInstance`). Use client-side filtering instead of a view. Make LLM descriptions optional with hardcoded fallback text from the start.

---

## Codebase Findings (Pre-existing State)

### What already exists

| Item | Location | State |
|------|----------|-------|
| `QuestTemplate` table | `spacetimedb/src/schema/tables.ts:149` | Public, 8 fields, NPC+kill-quest only. No faction gating, no reward gold, no reward standing |
| `QuestInstance` table | `spacetimedb/src/schema/tables.ts:170` | Public, per-character quest tracking with `progress`, `completed`, `completedAt` |
| `my_quests` view | `spacetimedb/src/views/quests.ts` | Returns `QuestInstance` rows for active character via `by_character` index |
| `FactionStanding` table | `spacetimedb/src/schema/tables.ts:1211` | Public, single `by_character` index, `standing: t.i64()` |
| `Faction` table | `spacetimedb/src/schema/tables.ts:1201` | Public, includes `rivalFactionId` |
| `mutateStanding()` | `spacetimedb/src/helpers/economy.ts:6` | Core helper for changing faction standing |
| `grantFactionStandingForKill()` | `spacetimedb/src/helpers/economy.ts:16` | Kill-based standing with rival penalty |
| `updateQuestProgressForKill()` | `spacetimedb/src/reducers/combat.ts:331` | Kill tracking hook in combat loop |
| `hailNpc()` / quest turn-in | `spacetimedb/src/reducers/commands.ts:35` | Turns in completed quests on NPC hail |
| `ensureQuestTemplates()` | `spacetimedb/src/seeding/ensure_world.ts:192` | Seeds 11 kill quests via NPC name + enemy name |
| `QuestPanel.vue` | `src/components/QuestPanel.vue` | Shows active quests only; no accept/complete UI |
| FACTION_RANKS constant | `src/components/RenownPanel.vue:322` | Neutral(0), Friendly(1000), Honored(3000), Revered(6000), Exalted(9000) |
| `SyncNpcQuestContent` reducer | `src/module_bindings/` (bindings exist) | Exists but is a no-op stub — LLM not implemented |

### What does NOT exist yet

- No `LlmConfig`, `GeneratedQuestText`, `LlmCircuit` tables (Phase 4 not done)
- No `generate_content` procedure
- No `accept_quest` reducer
- No `complete_quest` reducer
- No faction-gated quest table
- No `PlayerFactionQuest` (or equivalent) per-character faction quest tracker
- No available quests panel UI
- No quest description (LLM or fallback)
- No faction standing reward from quest completion
- No gold reward from quest completion

### Faction Standing Thresholds (VERIFIED from RenownPanel.vue)

| Rank Name | Min Standing | Quest Gate Used In Phase 6 |
|-----------|-------------|---------------------------|
| Neutral   | 0           | Yes — 4 quests gated here |
| Friendly  | 1000        | Yes — 3 quests gated here |
| Honored   | 3000        | Yes — 1 quest gated here  |
| Revered   | 6000        | No                        |
| Exalted   | 9000        | No                        |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `spacetimedb` (server) | 1.12.x | Table/reducer definitions | Already in use |
| `spacetimedb/vue` | 1.12.x | `useTable()` for all data | Established pattern in this codebase |
| Vue 3 Composition API | 3.x | Component and computed logic | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `spacetimedb` procedures | 1.12.x (beta) | LLM text generation | Only when Phase 4 tables are implemented first |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side filtering of public tables | `available_quests` view | Views have unreliable reactivity per prior decisions; client filtering is the established pattern |
| Extending `QuestTemplate` | New `FactionQuest` table | New table avoids breaking existing NPC-quest seeding and reduces migration risk |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Schema Design

The cleanest approach is a **new `FactionQuest` table** distinct from `QuestTemplate` to avoid breaking the existing NPC-kill-quest system. The existing `QuestTemplate`/`QuestInstance` system handles NPC quests. Faction quests are conceptually different: they are faction-gated, have faction standing rewards, and have LLM descriptions.

```
FactionQuest table — the 8 phase 6 faction quests (seeded)
PlayerFactionQuest table — per-character status tracker
GeneratedQuestText table — optional LLM descriptions (Phase 4 dependency)
```

### Pattern 1: FactionQuest Table Definition

```typescript
// File: spacetimedb/src/schema/tables.ts
// Source: Verified SpacetimeDB SDK table pattern from tables.ts

export const FactionQuest = table(
  {
    name: 'faction_quest',
    public: true,
    indexes: [
      { name: 'by_faction', algorithm: 'btree', columns: ['factionId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    description: t.string(),          // Hardcoded fallback description
    factionId: t.u64(),                // Which faction offers this quest
    requiredStanding: t.i64(),         // 0 = Neutral, 1000 = Friendly, 3000 = Honored
    questType: t.string(),             // 'kill' | 'retrieve' | 'travel'
    targetEnemyTemplateId: t.u64().optional(),  // For kill quests
    requiredCount: t.u64().optional(), // For kill quests
    targetLocationId: t.u64().optional(), // For travel quests
    rewardXp: t.u64(),
    rewardGold: t.u64(),
    rewardFactionStanding: t.u64(),    // Standing granted to quest's faction on completion
    rivalFactionPenalty: t.u64(),      // Standing penalty to rival faction on completion
  }
);
```

### Pattern 2: PlayerFactionQuest Table Definition

```typescript
// File: spacetimedb/src/schema/tables.ts
// Source: QuestInstance pattern (tables.ts:170) adapted for faction quests

export const PlayerFactionQuest = table(
  {
    name: 'player_faction_quest',
    public: true,
    indexes: [
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    factionQuestId: t.u64(),
    status: t.string(),              // 'active' | 'completed'
    progress: t.u64(),               // For kill quests: kills so far
    acceptedAt: t.timestamp(),
    completedAt: t.timestamp().optional(),
  }
);
```

### Pattern 3: accept_quest Reducer

```typescript
// File: spacetimedb/src/reducers/quests.ts (new file)
// Source: Pattern from npc_interaction.ts choose_dialogue_option reducer

spacetimedb.reducer('accept_faction_quest', {
  characterId: t.u64(),
  factionQuestId: t.u64(),
}, (ctx, { characterId, factionQuestId }) => {
  const character = requireCharacterOwnedBy(ctx, characterId);

  // Validate quest exists
  const quest = ctx.db.factionQuest.id.find(factionQuestId);
  if (!quest) throw new SenderError('Quest not found');

  // Validate faction standing requirement (single-column index + manual filter)
  const standings = [...ctx.db.factionStanding.by_character.filter(characterId)];
  const standing = standings.find(s => s.factionId === quest.factionId);
  const currentStanding = standing?.standing ?? 0n;
  if (currentStanding < quest.requiredStanding) {
    return fail(ctx, character, 'Your standing with this faction is too low.');
  }

  // Check not already accepted/active
  const existing = [...ctx.db.playerFactionQuest.by_character.filter(characterId)];
  const alreadyActive = existing.find(
    q => q.factionQuestId === factionQuestId && q.status === 'active'
  );
  if (alreadyActive) return fail(ctx, character, 'You already have this quest active.');

  // Create quest row
  ctx.db.playerFactionQuest.insert({
    id: 0n,
    characterId,
    factionQuestId,
    status: 'active',
    progress: 0n,
    acceptedAt: ctx.timestamp,
    completedAt: undefined,
  });

  appendPrivateEvent(ctx, characterId, character.ownerUserId, 'quest',
    `Quest accepted: ${quest.name}.`);
});
```

### Pattern 4: complete_quest Reducer

```typescript
// File: spacetimedb/src/reducers/quests.ts
// Source: quest turn-in pattern from commands.ts hailNpc(), mutateStanding from economy.ts

spacetimedb.reducer('complete_faction_quest', {
  characterId: t.u64(),
  playerQuestId: t.u64(),
}, (ctx, { characterId, playerQuestId }) => {
  const character = requireCharacterOwnedBy(ctx, characterId);

  const playerQuest = ctx.db.playerFactionQuest.id.find(playerQuestId);
  if (!playerQuest || playerQuest.characterId !== characterId) {
    throw new SenderError('Quest not found');
  }
  if (playerQuest.status !== 'active') {
    return fail(ctx, character, 'Quest is not active.');
  }

  const quest = ctx.db.factionQuest.id.find(playerQuest.factionQuestId);
  if (!quest) throw new SenderError('Quest template not found');

  // Validate completion (kill quests: check progress)
  if (quest.questType === 'kill') {
    if (playerQuest.progress < (quest.requiredCount ?? 0n)) {
      return fail(ctx, character, `You need to slay more enemies first. (${playerQuest.progress}/${quest.requiredCount})`);
    }
  }
  // Travel quests: verify character is at target location
  if (quest.questType === 'travel') {
    if (quest.targetLocationId !== undefined && character.locationId !== quest.targetLocationId) {
      return fail(ctx, character, 'You must reach the destination first.');
    }
  }

  // Mark complete
  ctx.db.playerFactionQuest.id.update({
    ...playerQuest,
    status: 'completed',
    completedAt: ctx.timestamp,
  });

  // Reward: XP
  ctx.db.character.id.update({ ...character, xp: character.xp + quest.rewardXp, gold: character.gold + quest.rewardGold });
  appendPrivateEvent(ctx, characterId, character.ownerUserId, 'reward', `Quest complete: ${quest.name}. You gain ${quest.rewardXp} XP and ${quest.rewardGold} gold.`);

  // Reward: faction standing to quest faction
  if (quest.rewardFactionStanding > 0n) {
    mutateStanding(ctx, characterId, quest.factionId, quest.rewardFactionStanding);
    const faction = ctx.db.faction.id.find(quest.factionId);
    appendPrivateEvent(ctx, characterId, character.ownerUserId, 'faction',
      `You gained ${quest.rewardFactionStanding} standing with ${faction?.name ?? 'the faction'}.`);
  }

  // Penalty: rival faction standing
  if (quest.rivalFactionPenalty > 0n) {
    const faction = ctx.db.faction.id.find(quest.factionId);
    if (faction?.rivalFactionId) {
      mutateStanding(ctx, characterId, faction.rivalFactionId, -(quest.rivalFactionPenalty));
      const rival = ctx.db.faction.id.find(faction.rivalFactionId);
      appendPrivateEvent(ctx, characterId, character.ownerUserId, 'faction',
        `You lost ${quest.rivalFactionPenalty} standing with ${rival?.name ?? 'a rival faction'}.`);
    }
  }
});
```

### Pattern 5: Kill Progress Tracking for Faction Quests

The existing `updateQuestProgressForKill()` in `combat.ts` only checks `QuestInstance` rows. A parallel function `updateFactionQuestProgressForKill()` must be added to the combat kill resolution loop.

```typescript
// File: spacetimedb/src/reducers/combat.ts (add alongside updateQuestProgressForKill)
// Source: updateQuestProgressForKill pattern (combat.ts:331)

const updateFactionQuestProgressForKill = (
  ctx: any,
  character: any,
  enemyTemplateId: bigint
) => {
  for (const playerQuest of ctx.db.playerFactionQuest.by_character.filter(character.id)) {
    if (playerQuest.status !== 'active') continue;
    const quest = ctx.db.factionQuest.id.find(playerQuest.factionQuestId);
    if (!quest || quest.questType !== 'kill') continue;
    if (quest.targetEnemyTemplateId !== enemyTemplateId) continue;

    const required = quest.requiredCount ?? 1n;
    const nextProgress = playerQuest.progress + 1n > required ? required : playerQuest.progress + 1n;
    const isComplete = nextProgress >= required;

    ctx.db.playerFactionQuest.id.update({ ...playerQuest, progress: nextProgress });

    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
      `Faction quest progress: ${quest.name} (${nextProgress}/${required}).`);

    if (isComplete) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
        `Faction quest ready to complete: ${quest.name}. Return to claim your reward.`);
    }
  }
};
```

### Pattern 6: Faction Quest Seeding

```typescript
// File: spacetimedb/src/data/faction_quest_data.ts (new file)
// Source: ensureQuestTemplates pattern from ensure_world.ts:192

export const FACTION_QUEST_DATA = [
  {
    name: 'The Lost Shipment',
    description: 'Recover stolen Iron Compact goods from bandits in the Hollowmere Vale.',
    factionName: 'Iron Compact',
    requiredStanding: 0n,
    questType: 'kill',
    targetEnemyName: 'Bandit',
    requiredCount: 5n,
    rewardXp: 120n,
    rewardGold: 50n,
    rewardFactionStanding: 150n,
    rivalFactionPenalty: 50n,
  },
  {
    name: 'Clearing the Route',
    description: 'Eliminate Cinder Sentinels blocking the Iron Compact trade route through the Fringe.',
    factionName: 'Iron Compact',
    requiredStanding: 1000n,
    questType: 'kill',
    targetEnemyName: 'Cinder Sentinel',
    requiredCount: 4n,
    rewardXp: 200n,
    rewardGold: 100n,
    rewardFactionStanding: 250n,
    rivalFactionPenalty: 75n,
  },
  // ... etc. for all 8 quests
];

export function ensureFactionQuests(ctx: any) {
  for (const data of FACTION_QUEST_DATA) {
    // Resolve factionId, targetEnemyTemplateId, etc.
    // Upsert by name (same pattern as ensureQuestTemplates)
  }
}
```

### Pattern 7: Client-Side Available Quest Filtering

Do NOT use a view. Use client-side filtering of `factionStanding` + `factionQuest` tables.

```typescript
// File: src/App.vue (add computed alongside characterFactionStandings)
// Source: characterFactionStandings pattern already in App.vue:1011

const availableFactionQuests = computed(() => {
  if (!selectedCharacter.value) return [];
  return factionQuests.value.filter(quest => {
    const standing = characterFactionStandings.value.find(
      s => s.factionId.toString() === quest.factionId.toString()
    );
    return (standing?.standing ?? 0n) >= quest.requiredStanding;
  });
});
```

### Pattern 8: LLM Description Integration (Optional/Deferred)

Since Phase 4 is not implemented, quest descriptions must work with fallback text. When Phase 4 tables exist, the flow is:

1. Client calls `accept_faction_quest` reducer
2. Client immediately calls `conn.procedures.generateContent({ contentType: 'quest', contentId: questId, contextJson: ... })`
3. `GeneratedQuestText` table row appears with `status: 'ready'`
4. Quest panel shows generated text; falls back to `FactionQuest.description` if pending/failed

For Phase 6, `FactionQuest.description` is the hardcoded fallback. LLM is wired in only if Phase 4 tables exist.

### Recommended Project Structure

```
spacetimedb/src/
├── schema/tables.ts         -- Add FactionQuest, PlayerFactionQuest tables
├── reducers/
│   ├── quests.ts            -- NEW: accept_faction_quest, complete_faction_quest reducers
│   └── index.ts             -- Add registerQuestReducers
├── data/
│   └── faction_quest_data.ts  -- NEW: FACTION_QUEST_DATA seed array, ensureFactionQuests
├── seeding/
│   └── ensure_content.ts    -- Add ensureFactionQuests() call in syncAllContent
└── helpers/
    └── combat.ts            -- Add updateFactionQuestProgressForKill call in kill loop

src/
├── components/
│   └── QuestPanel.vue       -- Replace with full quest panel (available, active, log tabs)
└── App.vue                  -- Add factionQuests + playerFactionQuests to useGameData
```

### Anti-Patterns to Avoid

- **Using `available_quests` view with faction join:** Views cannot use `.iter()`, multi-column indexes are broken, and views have unreliable reactivity. Use client-side filtering instead.
- **Adding faction gating to existing QuestTemplate:** The existing `QuestTemplate` system is NPC-centric; mixing faction logic there breaks the seeding pattern and risks the existing working quest system.
- **Blocking quest accept on LLM completion:** LLM generation is async and can fail. The quest must be accepted immediately; text generation is a separate fire-and-forget action.
- **Checking `standing >= requiredStanding` with BigInt comparisons on client:** Use `Number()` conversion for comparisons in Vue computed properties (the client stores standings as bigint but comparing requires care).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Faction standing lookup per character | Nested loop | `ctx.db.factionStanding.by_character.filter(characterId)` + `.find()` | Single-column index already indexed on `characterId` |
| Standing mutation | Manual update logic | `mutateStanding()` from `helpers/economy.ts` | Already handles upsert, used for kill rewards |
| Rival faction penalty | Custom penalty code | `grantFactionStandingForKill()` pattern from `helpers/economy.ts` | Pattern proven; replicate for quest completion |
| Quest seeding | Runtime inserts in reducer | `ensureFactionQuests()` called from `syncAllContent()` | Established seeding pattern for all world content |
| Faction rank label (Neutral/Friendly/Honored) | Server-side computation | Client-side `FACTION_RANKS` constant already in `RenownPanel.vue:322` | Pattern already exists — reuse in QuestPanel |
| Progress tracking on kill | Custom combat hook | `updateFactionQuestProgressForKill()` modeled on existing `updateQuestProgressForKill()` | The combat kill loop already calls this pattern |

**Key insight:** Every problem has a pattern already in the codebase. The faction quest system is a composition of existing patterns: `QuestInstance` (tracking), `mutateStanding` (economy), `ensureQuestTemplates` (seeding), `updateQuestProgressForKill` (combat hooks), and `hailNpc` quest turn-in (reward granting).

---

## Common Pitfalls

### Pitfall 1: Views for Available Quest Filtering
**What goes wrong:** Building an `available_quests` view that joins `FactionQuest` with `FactionStanding`. Views cannot use `.iter()`, and the join would require a multi-column index (which is broken in SpacetimeDB).
**Why it happens:** The spec mentions a view — but the codebase has a prior decision that SpacetimeDB views have unreliable reactivity.
**How to avoid:** Make `FactionQuest` a public table. Subscribe to `factionQuest` and `factionStanding` tables. Filter client-side in a Vue computed property.
**Warning signs:** View returns empty results or doesn't update when standing changes.

### Pitfall 2: Multi-Column Index for Quest Lookup
**What goes wrong:** Creating a `by_character_quest` index on `(characterId, factionQuestId)` to find a specific player quest.
**Why it happens:** Natural desire to look up by composite key.
**How to avoid:** Use `by_character` single-column index + manual `.find()` in TypeScript. This is the established pattern for `QuestInstance`.
**Warning signs:** SpacetimeDB PANIC on deploy, or silent empty results from the index.

### Pitfall 3: LLM Generation Blocking Quest Accept
**What goes wrong:** Awaiting LLM generation before confirming quest acceptance to the player.
**Why it happens:** Natural desire to show the generated description immediately.
**How to avoid:** `accept_faction_quest` reducer completes immediately. Client calls `generate_content` procedure separately as fire-and-forget after accepting. Quest shows fallback text until generation completes.
**Warning signs:** Quest accept takes 5-30+ seconds (Anthropic API latency).

### Pitfall 4: Faction Standing as Unsigned vs Signed
**What goes wrong:** Comparing `requiredStanding` (stored as `t.i64()`) against a hardcoded value using wrong BigInt sign.
**Why it happens:** `FactionStanding.standing` is `t.i64()` (signed) — characters start at 0 and can go negative for rival factions.
**How to avoid:** `requiredStanding` in `FactionQuest` must also be `t.i64()` for consistency. Comparisons: `currentStanding >= quest.requiredStanding` works for non-negative gates. A character with -500 standing cannot access Neutral-gated (0) quests of that faction.
**Warning signs:** Players with negative standing can accept quests they shouldn't.

### Pitfall 5: Missing FactionQuest Table in Schema Export
**What goes wrong:** Adding `FactionQuest` and `PlayerFactionQuest` to `tables.ts` but forgetting to add them to the `schema()` export at the bottom.
**Why it happens:** The `export const spacetimedb = schema(...)` call at line 1429 of `tables.ts` is easy to miss.
**How to avoid:** Always add new tables to the `schema()` call. Also add them to the `reducerDeps` object in `index.ts` and to the `ViewDeps` type if needed in views.
**Warning signs:** Tables don't appear in generated client bindings; `ctx.db.factionQuest` is undefined at runtime.

### Pitfall 6: Character Deletion Not Cleaning Up PlayerFactionQuest
**What goes wrong:** When a character is deleted, `PlayerFactionQuest` rows are not cleaned up.
**Why it happens:** The `delete_character` reducer already cleans up `QuestInstance` rows (verified at `characters.ts`), but won't know about the new `PlayerFactionQuest` table.
**How to avoid:** Add `PlayerFactionQuest` cleanup to the `delete_character` reducer alongside the existing `QuestInstance` cleanup.
**Warning signs:** Orphaned `PlayerFactionQuest` rows accumulate for deleted characters.

### Pitfall 7: Quest Completion Double-Claiming
**What goes wrong:** Player calls `complete_faction_quest` twice for the same quest and claims rewards twice.
**Why it happens:** Network retry or double-click before server responds.
**How to avoid:** `complete_faction_quest` reducer checks `playerQuest.status !== 'active'` before processing. If status is already `'completed'`, early-return with a fail message.
**Warning signs:** Player receives duplicate XP/gold/standing rewards.

---

## Code Examples

### Verifying Faction Standing Threshold (server-side reducer pattern)

```typescript
// Source: Verified pattern from npc_interaction.ts choose_dialogue_option (line 38-48)
// Used for checking requiredFactionStanding — exact same approach

const standings = [...ctx.db.factionStanding.by_character.filter(characterId)];
const standing = standings.find(s => s.factionId === quest.factionId);
const currentStanding = standing?.standing ?? 0n;
if (currentStanding < quest.requiredStanding) {
  return fail(ctx, character, 'Your standing with this faction is too low.');
}
```

### Faction Standing Mutation (server-side reward)

```typescript
// Source: helpers/economy.ts:6 - mutateStanding function
// Already imported and used in grantFactionStandingForKill

import { mutateStanding } from '../helpers/economy';

// In complete_faction_quest:
mutateStanding(ctx, characterId, quest.factionId, quest.rewardFactionStanding);

// For rival penalty:
const faction = ctx.db.faction.id.find(quest.factionId);
if (faction?.rivalFactionId && quest.rivalFactionPenalty > 0n) {
  mutateStanding(ctx, characterId, faction.rivalFactionId, -(quest.rivalFactionPenalty));
}
```

### Client-Side Faction Rank Label

```typescript
// Source: RenownPanel.vue:322 — FACTION_RANKS already defined here
// Move to shared constant or replicate in QuestPanel.vue

const FACTION_RANKS = [
  { name: 'Hostile',    min: -Infinity, max: -1,        color: '#f55' },
  { name: 'Unfriendly', min: -999,      max: -1,        color: '#f85' },
  { name: 'Neutral',    min: 0,         max: 999,       color: '#aaa' },
  { name: 'Friendly',   min: 1000,      max: 2999,      color: '#8af' },
  { name: 'Honored',    min: 3000,      max: 5999,      color: '#5af' },
  { name: 'Revered',    min: 6000,      max: 8999,      color: '#a5f' },
  { name: 'Exalted',    min: 9000,      max: Infinity,  color: '#fa5' },
];

// Usage in QuestPanel to show lock reason:
const questStandingLabel = (requiredStanding: bigint): string => {
  const rank = FACTION_RANKS.find(r => r.min === Number(requiredStanding));
  return rank?.name ?? `${requiredStanding} standing`;
};
```

### useTable subscription for new tables

```typescript
// Source: src/composables/useGameData.ts — established pattern for all tables
// Add after existing useTable calls

const [factionQuests] = useTable(tables.factionQuest);
const [playerFactionQuests] = useTable(tables.playerFactionQuest);
```

### Quest Panel Tab Structure

```vue
<!-- Source: NpcDialogPanel.vue tab pattern — consistent with existing multi-tab panels -->
<template>
  <div :style="styles.panelBody">
    <div :style="styles.tabBar">
      <button @click="tab = 'available'" :style="tab === 'available' ? styles.tabActive : styles.tab">Available</button>
      <button @click="tab = 'active'" :style="tab === 'active' ? styles.tabActive : styles.tab">Active</button>
      <button @click="tab = 'log'" :style="tab === 'log' ? styles.tabActive : styles.tab">Log</button>
    </div>
    <!-- Available tab: show quests player meets standing for, locked ones with standing requirement shown -->
    <!-- Active tab: show in-progress quests with description + progress -->
    <!-- Log tab: show completed quests -->
  </div>
</template>
```

---

## Phase 4 Dependency Assessment

Phase 6 requires `GeneratedQuestText` and `generate_content` procedure from Phase 4. Phase 4 is NOT implemented.

**Recommended approach for Phase 6:**

1. Phase 6 core (tables, reducers, seeding, UI) works WITHOUT LLM — use `FactionQuest.description` as the display text
2. Phase 6 optionally includes Phase 4 tables/procedure inline IF the planner decides to include them
3. The quest panel shows a "loading description..." state when `GeneratedQuestText` is pending, and falls back to `FactionQuest.description` when no generated text exists

**If Phase 4 is included inline:**

Follow the Phase 4 RESEARCH.md exactly:
- Add `LlmConfig`, `GeneratedQuestText`, `LlmCircuit` to `schema/tables.ts`
- Add `spacetimedb/src/procedures/llm.ts` with `generate_content` procedure
- Add `spacetimedb/src/reducers/llm.ts` with `set_llm_config`, `reset_llm_circuit`, `request_content`
- Client calls `conn.procedures.generateContent(...)` after `accept_faction_quest` returns

**If Phase 4 is deferred:**

The quest panel simply displays `FactionQuest.description` directly. No loading state needed.

---

## Quest Seed Data (Verified Against Phase Context)

| Quest | Faction | Required Standing | Type | Target | Count |
|-------|---------|-----------------|------|--------|-------|
| The Lost Shipment | Iron Compact | 0 (Neutral) | Kill | Bandit | 5 |
| Clearing the Route | Iron Compact | 1000 (Friendly) | Kill | Cinder Sentinel | 4 |
| The Overgrown Path | Verdant Circle | 0 (Neutral) | Travel | Target location TBD | — |
| The Fungal Bloom | Verdant Circle | 1000 (Friendly) | Kill | Marsh Croaker | 6 |
| The Missing Tome | Ashen Order | 0 (Neutral) | Retrieve (Kill) | Sootbound Mystic | 3 |
| A Test of Mettle | Free Blades | 0 (Neutral) | Kill | Ash Jackal | 5 |
| Contract Work | Free Blades | 1000 (Friendly) | Kill | Ashforged Revenant | 4 |
| The Debt Ledger | Iron Compact | 3000 (Honored) | Retrieve (Kill) | Vault Sentinel | 3 |

**Notes on quest type mapping:**
- "Retrieve" quests have no retrieval inventory mechanic — model as kill quests targeting the enemy guarding the item
- "Travel" quest (The Overgrown Path) requires `targetLocationId` — planner must choose a Verdant Circle-thematic location (Willowfen or Thornveil Thicket are appropriate)
- All kill targets verified to exist in `enemy_template` seeding (Bandit, Cinder Sentinel, Marsh Croaker, Sootbound Mystic, Ash Jackal, Ashforged Revenant, Vault Sentinel all confirmed in `ensure_enemies.ts`)

---

## Open Questions

1. **Travel quest mechanic for "The Overgrown Path"**
   - What we know: The quest type is "Travel" — character must reach a location
   - What's unclear: Which specific location should be the target? The Verdant Circle NPCs are at Willowfen — the quest could require reaching Thornveil Thicket or Lichen Ridge
   - Recommendation: Target location = Thornveil Thicket (thematically fits Verdant Circle, is non-safe, requires traversal). The `complete_faction_quest` reducer checks `character.locationId === quest.targetLocationId`.

2. **Should Phase 4 LLM tables be included in Phase 6?**
   - What we know: Phase 4 is unimplemented; Phase 6 can work without it
   - What's unclear: The planner must decide scope
   - Recommendation: Include Phase 4's table definitions and procedure as a sub-plan within Phase 6 (not as a hard dependency, but as a parallel deliverable). The quest system works without LLM; LLM is an enhancement.

3. **Gold reward amounts**
   - What we know: `Character.gold` exists; no gold reward in existing quest system
   - What's unclear: No existing reward economy baseline to calibrate against
   - Recommendation: Neutral quests: 50 gold, Friendly quests: 100 gold, Honored quests: 200 gold

4. **Faction quest standing reward amounts**
   - What we know: Kill events grant +10 standing per kill; quest rewards should be more substantial
   - Recommendation: Neutral quests: +150 standing, Friendly quests: +250 standing, Honored quests: +400 standing. Rival penalty: 50% of the grant.

5. **Should completed faction quests be repeatable?**
   - What we know: Existing NPC quests can be re-accepted after completion (no once-per-character lock)
   - What's unclear: Phase spec doesn't specify
   - Recommendation: Non-repeatable for Phase 6 (simpler, more RPG-traditional). `complete_faction_quest` marks status as `'completed'`; `accept_faction_quest` checks `existing.status !== 'completed'` to block re-accept.

---

## Sources

### Primary (HIGH confidence)
- `/c/projects/uwr/spacetimedb/src/schema/tables.ts` — `QuestTemplate`, `QuestInstance`, `FactionStanding`, `Faction` table definitions (verified)
- `/c/projects/uwr/spacetimedb/src/helpers/economy.ts` — `mutateStanding`, `grantFactionStandingForKill` (verified)
- `/c/projects/uwr/spacetimedb/src/reducers/combat.ts:331` — `updateQuestProgressForKill` pattern (verified)
- `/c/projects/uwr/spacetimedb/src/reducers/commands.ts:35` — `hailNpc` quest turn-in and reward pattern (verified)
- `/c/projects/uwr/spacetimedb/src/reducers/npc_interaction.ts` — faction standing check pattern (verified)
- `/c/projects/uwr/spacetimedb/src/seeding/ensure_world.ts:192` — `ensureQuestTemplates` seeding pattern (verified)
- `/c/projects/uwr/src/components/RenownPanel.vue:322` — `FACTION_RANKS` constant with verified thresholds (verified)
- `/c/projects/uwr/src/composables/useGameData.ts` — `useTable` subscription pattern (verified)
- `/c/projects/uwr/.planning/phases/04-llm-architecture/04-RESEARCH.md` — Phase 4 LLM patterns (verified, not yet implemented)

### Secondary (MEDIUM confidence)
- `/c/projects/uwr/.planning/phases/03-renown-foundation/03-RESEARCH.md` — single-column index constraint documented
- `/c/projects/uwr/src/App.vue` — client-side filtering pattern for characterFactionStandings

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all patterns verified from live codebase files
- Schema design (FactionQuest + PlayerFactionQuest): HIGH — follows existing QuestTemplate/QuestInstance pattern exactly
- Reducer patterns: HIGH — modeled on existing verifiable reducers
- Client-side filtering: HIGH — exact pattern used for faction standings already
- LLM integration: MEDIUM — Phase 4 not implemented; architecture is well-understood but not yet verified in this codebase
- Quest seed data: HIGH — enemy templates verified to exist in seeding code

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (30 days — SpacetimeDB 1.12 stable for this codebase)
