---
phase: quick-324
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/renown.ts
  - spacetimedb/src/reducers/renown.ts
  - spacetimedb/src/data/renown_data.ts
  - spacetimedb/src/data/world_event_data.ts
  - src/components/RenownPanel.vue
autonomous: true
---

<objective>
Fix three related renown issues: (1) multi-rank perk grant skipping, (2) oversized renown rewards causing rank jumps, (3) perk log entries on rank-up.

Purpose: Players who gain enough renown to jump multiple ranks currently lose intermediate perk choices. Balance is also off — a single boss kill can jump 3-4 ranks.
Output: All three fixes applied to server and client code.
</objective>

<context>
@spacetimedb/src/helpers/renown.ts
@spacetimedb/src/reducers/renown.ts
@spacetimedb/src/data/renown_data.ts
@spacetimedb/src/data/world_event_data.ts
@src/components/RenownPanel.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix multi-rank perk availability (server + client)</name>
  <files>
    spacetimedb/src/helpers/renown.ts
    spacetimedb/src/reducers/renown.ts
    src/components/RenownPanel.vue
  </files>
  <action>
**Server — `spacetimedb/src/helpers/renown.ts` `awardRenown()`:**

When `newRank > oldRank`, loop from `oldRank + 1` through `newRank` (inclusive) and for each intermediate rank:
- Log a system message: "You have reached rank X: {rankName}! A new perk is available." (so the player sees each rank-up in their log)
- The existing single rank-up announcement (lines 41-44) should be replaced with this loop

Currently lines 40-45:
```typescript
if (newRank > oldRank) {
    const rankData = RENOWN_RANKS.find((r) => r.rank === newRank);
    const rankName = rankData ? rankData.name : `Rank ${newRank}`;
    appendSystemMessage(ctx, character, `You have achieved rank: ${rankName}!`);
    appendWorldEvent(ctx, 'renown', `${character.name} has achieved the rank of ${rankName}!`);
}
```

Replace with:
```typescript
if (newRank > oldRank) {
    for (let rank = oldRank + 1; rank <= newRank; rank++) {
        const rankData = RENOWN_RANKS.find((r) => r.rank === rank);
        const rankName = rankData ? rankData.name : `Rank ${rank}`;
        appendSystemMessage(ctx, character, `You have achieved rank: ${rankName}!`);
        // Only broadcast world event for the highest achieved rank (avoid spam)
        if (rank === newRank) {
            appendWorldEvent(ctx, 'renown', `${character.name} has achieved the rank of ${rankName}!`);
        }
        // Notify about available perk (ranks 2+ have perk pools)
        if (rank >= 2) {
            appendSystemMessage(ctx, character, `A new perk is available for rank ${rank}: ${rankName}!`);
        }
    }
}
```

**Server — `spacetimedb/src/reducers/renown.ts` `choose_perk` reducer:**

Currently line 24-28, the reducer only allows choosing a perk from `currentRank`'s pool:
```typescript
const perkPool = RENOWN_PERK_POOLS[currentRank];
```

Change this to: look up which ranks 2..currentRank still have no perk chosen (i.e., no `renown_perk` row for that rank). Let the player choose from the LOWEST unchosen rank's pool. This ensures perks are chosen in order.

Replace the perkPool lookup and validation logic (lines 24-41) with:
```typescript
// Find the lowest rank (2..currentRank) that still needs a perk choice
const chosenRanks = new Set<number>();
for (const existingPerk of ctx.db.renown_perk.by_character.filter(characterId)) {
    chosenRanks.add(Number(existingPerk.rank));
}

let targetRank: number | null = null;
for (let rank = 2; rank <= currentRank; rank++) {
    if (!chosenRanks.has(rank) && RENOWN_PERK_POOLS[rank]) {
        targetRank = rank;
        break;
    }
}

if (targetRank === null) {
    throw new SenderError('No perk choices available');
}

const perkPool = RENOWN_PERK_POOLS[targetRank];
if (!perkPool) {
    throw new SenderError(`No perk pool for rank ${targetRank}`);
}

// Validate perkKey exists in pool
const perk = perkPool.find((p: any) => p.key === perkKey);
if (!perk) {
    throw new SenderError('Invalid perk choice for this rank');
}
```

Then update the insert to use `targetRank` instead of `currentRank`:
```typescript
ctx.db.renown_perk.insert({
    id: 0n,
    characterId,
    rank: BigInt(targetRank),
    perkKey,
    chosenAt: ctx.timestamp,
});
```

Remove the old "Check if already chosen a perk for this rank" block (lines 37-41) since the new logic handles this.

**Client — `src/components/RenownPanel.vue`:**

Change `hasUnspentPerk` computed (lines 456-461) from checking only `currentRankNum` to checking ALL ranks 2..currentRankNum for missing perks:

```typescript
const hasUnspentPerk = computed(() => {
    if (!props.renownData || currentRankNum.value < 2) return false;
    // Check ALL ranks 2..currentRank for unchosen perks
    for (let rank = 2; rank <= currentRankNum.value; rank++) {
        if (!RENOWN_PERK_POOLS[rank]) continue;
        const existingPerk = props.renownPerks.find(p => Number(p.rank) === rank);
        if (!existingPerk) return true;
    }
    return false;
});
```

Change `availablePerks` computed (lines 463-466) to show perks for the LOWEST unchosen rank:

```typescript
const lowestUnchosenRank = computed(() => {
    if (!props.renownData || currentRankNum.value < 2) return null;
    for (let rank = 2; rank <= currentRankNum.value; rank++) {
        if (!RENOWN_PERK_POOLS[rank]) continue;
        const existingPerk = props.renownPerks.find(p => Number(p.rank) === rank);
        if (!existingPerk) return rank;
    }
    return null;
});

const availablePerks = computed(() => {
    if (lowestUnchosenRank.value === null) return [];
    return RENOWN_PERK_POOLS[lowestUnchosenRank.value] ?? [];
});
```

Update the heading text "Choose a Perk for {{ currentRankName }}" (line 123) to show the correct rank:
```
Choose a Perk for {{ lowestUnchosenRank ? RENOWN_RANKS.find(r => r.rank === lowestUnchosenRank)?.name ?? `Rank ${lowestUnchosenRank}` : currentRankName }}
```
  </action>
  <verify>
    Read the modified files and confirm:
    1. `awardRenown` loops through all skipped ranks on rank-up
    2. `choose_perk` finds the lowest unchosen rank, not just currentRank
    3. Client `hasUnspentPerk` checks all ranks 2..currentRank
    4. Client `availablePerks` shows perks for the lowest unchosen rank
  </verify>
  <done>
    Multi-rank jumps now surface perk choices for every intermediate rank. Perks are chosen in order from lowest unchosen rank to highest. Log entries are emitted for each rank achieved.
  </done>
</task>

<task type="auto">
  <name>Task 2: Balance renown rewards and thresholds</name>
  <files>
    spacetimedb/src/data/renown_data.ts
    spacetimedb/src/data/world_event_data.ts
  </files>
  <action>
**Analysis of the current imbalance:**

Current thresholds: Rank 2 = 100, Rank 3 = 250, Rank 4 = 500, Rank 5 = 900
Current rewards:
- Boss kill (server-first): 500 renown — jumps rank 1 to rank 4 instantly
- Boss kill (2nd): 250 — still jumps to rank 3
- World event tier 3 success: 400 — nearly rank 4
- World event tier 2 success: 150 — jumps to rank 2 or 3
- World event tier 1 success: 50 — reasonable
- Regular mob kills: ~1-8 per kill (template.level) — reasonable for grinding

**Recommendation: Reduce reward amounts (keep thresholds).**

Thresholds should stay as-is because they define the progression curve and perk unlock pacing. The issue is purely that boss and world event rewards are too generous for early ranks.

**In `spacetimedb/src/data/renown_data.ts`**, update `RENOWN_GAIN`:
```typescript
export const RENOWN_GAIN = {
    BOSS_KILL_BASE: 150n,            // Reduced from 500n — server-first boss = 150, 2nd = 75, 3rd = 37
    QUEST_COMPLETE_BASE: 50n,        // Unchanged
    ACHIEVEMENT_BASE: 200n,          // Reduced from 200n — keep as-is, achievements are one-time
    EVENT_PARTICIPATION_BASE: 100n,  // Reduced from 100n — keep as-is
    PERSONAL_FIRST_BONUS: 50n,       // Unchanged
} as const;
```

This means server-first boss kill = 150 (barely reaches rank 2), 2nd = 75, 3rd = 37. A player needs multiple boss kills + other activity to rank up meaningfully.

**In `spacetimedb/src/data/world_event_data.ts`**, reduce renown rewards for tier 2 and tier 3 world events:

For ALL event categories (monster_invasion, trade_disruption, gathering_bounty), apply these new values:

- **Tier 1 success:** Keep at current values (20-50 range) — these are fine
- **Tier 2 success:** Reduce to ~40-60% of current values:
  - monster_invasion tier 2: 150 -> 75 renown
  - trade_disruption tier 2: 100 -> 50 renown
  - gathering_bounty tier 2: 60 -> 35 renown
- **Tier 3 success:** Reduce to ~30-40% of current values:
  - monster_invasion tier 3: 400 -> 150 renown
  - trade_disruption tier 3: 250 -> 100 renown
  - gathering_bounty tier 3: 150 -> 60 renown
- **Failure rewards:** Reduce proportionally:
  - Tier 1 failure: keep as-is (5-10)
  - Tier 2 failure: halve current values (15-25 -> 8-12)
  - Tier 3 failure: halve current values (25-60 -> 12-30)

Do NOT change gold, faction, or item rewards — only renown values.
  </action>
  <verify>
    Read the modified data files and confirm:
    1. BOSS_KILL_BASE is 150n
    2. World event tier 2 success renown values are in the 35-75 range
    3. World event tier 3 success renown values are in the 60-150 range
    4. Non-renown reward fields (gold, factionId, factionAmount, itemTemplateKey) are unchanged
  </verify>
  <done>
    Server-first boss kill no longer jumps multiple ranks. A boss kill awards 150 renown (rank 2 at 100 threshold). World event tier 3 awards at most 150, requiring sustained participation for progression.
  </done>
</task>

</tasks>

<verification>
After both tasks, verify:
1. `awardRenown` with a large points value logs each intermediate rank
2. `choose_perk` reducer accepts perk choices for unchosen intermediate ranks
3. Client shows perk chooser for the lowest unchosen rank
4. Boss kill renown is 150 (server-first), not 500
5. World event tier 3 renown is capped at 150
</verification>

<success_criteria>
- Multi-rank jumps surface perk choices for ALL skipped ranks, not just the final rank
- A server-first boss kill awards 150 renown (reaches rank 2 but not rank 4)
- World event tier 3 success awards at most 150 renown
- Each rank-up produces a log entry visible in the player's Log window
- Perks are chosen in rank order (lowest unchosen first)
</success_criteria>
