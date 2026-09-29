---
phase: 19-npc-interactions
plan: 01
subsystem: npc-relationships
tags: [backend, foundation, affinity, dialogue, npc-personality]
dependency_graph:
  requires: [faction-system, renown-system]
  provides: [npc-affinity-tracking, dialogue-tree-foundation, personality-system]
  affects: [npc-interactions, quest-system, vendor-system]
tech_stack:
  added: [npc-affinity-helper, dialogue-seed-data]
  patterns: [affinity-multiplier, tier-based-dialogue, personality-archetypes]
key_files:
  created:
    - spacetimedb/src/data/npc_data.ts
    - spacetimedb/src/helpers/npc_affinity.ts
    - spacetimedb/src/data/dialogue_data.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/seeding/ensure_world.ts
    - spacetimedb/src/seeding/ensure_content.ts
decisions:
  - key: affinity-range
    choice: "-100 to +100 with 7 tiers (Hostile, Unfriendly, Wary, Stranger, Acquaintance, Friend, Close Friend, Devoted)"
    rationale: "Wide range allows granular progression while tiers provide meaningful breakpoints for dialogue/rewards"
  - key: personality-multiplier
    choice: "NPC personality traits stored as JSON with affinityMultiplier field (0.8 to 1.2 range)"
    rationale: "Friendly NPCs build affinity 20% faster, grumpy NPCs 20% slower - adds character variety"
  - key: conversation-cooldown
    choice: "1-hour per-NPC cooldown stored on NpcAffinity.lastInteraction timestamp"
    rationale: "Prevents affinity grinding while allowing multi-NPC engagement in same session"
  - key: dialogue-gating
    choice: "Dialogue options filtered by affinity, faction standing, and renown rank (all optional)"
    rationale: "Flexible gating system supports simple affinity progression and complex unlock chains"
  - key: tier-change-notification
    choice: "System message (Log panel) only when crossing tier boundary, not on every affinity change"
    rationale: "Reduces spam while highlighting meaningful progression milestones"
metrics:
  duration: 3min
  completed_at: "2026-02-14T14:36:17Z"
  tasks: 2
  files: 6
  commits: 2
  lines_added: 533
---

# Phase 19 Plan 01: NPC Relationship Backend Foundation Summary

**One-liner:** NPC affinity tracking with personality-modified progression, tier-gated dialogue trees, and seed data for 3 NPCs across 4 affinity tiers.

## Overview

Created the backend foundation for NPC relationship system: `NpcAffinity` table for per-character per-NPC affinity tracking (-100 to +100 range), expanded `Npc` table with personality/faction/mood fields, `NpcDialogueOption` table for threshold-gated dialogue trees, affinity helper module with personality multipliers and tier-change detection, and dialogue seed data covering 14 options across 4 tiers for Marla, Soren, and Jyn.

## What Was Built

### Tables

1. **NpcAffinity** (public)
   - Fields: `characterId`, `npcId`, `affinity` (i64, -100 to +100), `lastInteraction`, `giftsGiven`, `conversationCount`
   - Indexes: `by_character`, `by_npc` (btree)
   - Purpose: Per-character per-NPC affinity tracking with conversation history

2. **NpcDialogueOption** (public)
   - Fields: `npcId`, `parentOptionId`, `optionKey`, `playerText`, `npcResponse`, `requiredAffinity`, `requiredFactionId`, `requiredFactionStanding`, `requiredRenownRank`, `affinityChange`, `sortOrder`
   - Indexes: `by_npc` (btree)
   - Purpose: Dialogue tree with multi-requirement gating and affinity rewards

3. **Npc table expansion** (3 new optional columns)
   - `factionId` (u64, optional): NPC faction affiliation
   - `personalityJson` (string, optional): JSON personality traits with `affinityMultiplier`
   - `baseMood` (string, optional): 'cheerful', 'grumpy', 'neutral', 'contemplative', 'brisk', 'focused', etc.

### Data Constants

**`spacetimedb/src/data/npc_data.ts`:**
- `AFFINITY_TIERS`: Constants for 7 tiers (-50, -25, 0, 25, 50, 75, 100)
- `AFFINITY_TIER_NAMES`: Display names for each tier
- `getAffinityTierName()`: Tier resolution function
- `CONVERSATION_COOLDOWN_MICROS`: 1 hour (3,600,000,000 microseconds)
- `MAX_GIFTS_PER_DAY`: 3 gifts
- `GIFT_COOLDOWN_MICROS`: 24 hours
- `NPC_PERSONALITIES`: 4 archetypes (friendly_merchant: 1.2x, grumpy_guard: 0.8x, wise_elder: 1.0x, veteran_scout: 1.1x)

### Helpers

**`spacetimedb/src/helpers/npc_affinity.ts`:**
- `getAffinityForNpc()`: Returns current affinity (default 0 if no row exists)
- `getAffinityRow()`: Returns full NpcAffinity row or null
- `awardNpcAffinity()`: Awards affinity with personality multiplier, -100..100 clamping, tier-change detection, system message on tier change
- `canConverseWithNpc()`: Checks 1-hour cooldown (first conversation always allowed)
- `getAvailableDialogueOptions()`: Filters dialogue by affinity/faction/renown, returns sorted array

### Dialogue Seed Data

**`spacetimedb/src/data/dialogue_data.ts`:**
14 dialogue options across 3 NPCs:

**Marla the Guide** (veteran_scout personality, 1.1x multiplier):
- Tier 0 (Stranger): 2 options (area info, directions) +1 affinity each
- Tier 25 (Acquaintance): 1 option (backstory) +3 affinity
- Tier 50 (Friend): 1 option (secret path) +5 affinity
- Tier 75 (Close Friend): 1 option (trauma reveal) +5 affinity

**Elder Soren** (wise_elder personality, 1.0x multiplier):
- Tier 0: 2 options (town history, factions) +1 affinity each
- Tier 25: 1 option (pre-Ashfall lore) +3 affinity
- Tier 50: 1 option (warning about tremors) +5 affinity
- Tier 75: 1 option (Archive access) +5 affinity

**Quartermaster Jyn** (friendly_merchant personality, 1.2x multiplier, Iron Compact faction):
- Tier 0: 1 option (vendor greeting) +1 affinity
- Tier 25: 1 option (supply troubles) +3 affinity
- Tier 50: 1 option (friend discount) +3 affinity
- Tier 75: 1 option (missing sister quest hook) +5 affinity

### Seeding

**`ensureNpcs()` updated:**
- Accepts `factionId`, `personalityJson`, `baseMood` optional parameters
- Marla: `baseMood='focused'`, veteran_scout personality (1.1x)
- Soren: `baseMood='contemplative'`, wise_elder personality (1.0x)
- Jyn: `baseMood='brisk'`, friendly_merchant personality (1.2x), Iron Compact faction

**`ensureDialogueOptions()` created:**
- Resolves `npcName` to `npcId` via iteration
- Resolves `parentOptionKey` to `parentOptionId` (for future branching)
- Upserts dialogue options by `optionKey` (update existing or insert new)
- Called after `ensureNpcs()` in `syncAllContent()`

## Deviations from Plan

None - plan executed exactly as written.

## Technical Notes

1. **Affinity clamping**: `awardNpcAffinity()` clamps to -100..100 range to prevent overflow
2. **Tier change detection**: Compares old tier vs new tier, only logs message when crossing boundary
3. **Personality multiplier**: Applied via `Math.round(Number(baseChange) * multiplier)` to preserve BigInt precision
4. **First conversation**: `canConverseWithNpc()` returns `true` if no affinity row exists (allows initial greeting)
5. **Dialogue filtering**: `getAvailableDialogueOptions()` supports multi-requirement gating (affinity + faction + renown) all optional
6. **Index usage**: Uses `by_character` and `by_npc` single-column btree indexes (multi-column indexes broken per CLAUDE.md)
7. **Public tables**: Both NpcAffinity and NpcDialogueOption are public for client-side filtering (no views)
8. **Schema export order**: NpcAffinity and NpcDialogueOption added at end of schema export to avoid migration issues

## Verification Results

- TypeScript compiles without errors (pre-existing errors in other files unchanged)
- NpcAffinity table has `by_character` and `by_npc` indexes
- NpcDialogueOption table has `by_npc` index
- Npc table has 3 new optional columns (factionId, personalityJson, baseMood)
- awardNpcAffinity applies personality multiplier and clamps to -100..100
- canConverseWithNpc enforces 1-hour cooldown via timestamp comparison
- getAvailableDialogueOptions filters by affinity, faction, and renown
- All 3 NPCs seeded with personality archetypes (Marla: veteran_scout, Soren: wise_elder, Jyn: friendly_merchant)
- 14 dialogue options seeded across 4 affinity tiers (0, 25, 50, 75)
- ensureDialogueOptions called after ensureNpcs in syncAllContent

## Self-Check: PASSED

**Created files verified:**
```bash
FOUND: spacetimedb/src/data/npc_data.ts
FOUND: spacetimedb/src/helpers/npc_affinity.ts
FOUND: spacetimedb/src/data/dialogue_data.ts
```

**Commits verified:**
```bash
FOUND: 4bf7ffb (feat(19-01): add NpcAffinity and NpcDialogueOption tables, expand Npc table)
FOUND: 15ac086 (feat(19-01): create affinity helper, dialogue data, update NPC seeding)
```

**Schema export verified:**
- NpcAffinity present in schema export
- NpcDialogueOption present in schema export

## Dependencies

**Provides:**
- `getAffinityForNpc()` - queried by future dialogue/gift reducers
- `awardNpcAffinity()` - called by conversation/gift reducers
- `getAvailableDialogueOptions()` - queried by dialogue UI
- NpcAffinity table - read by UI for affinity display
- NpcDialogueOption table - read by UI for dialogue trees

**Consumed by (future plans):**
- Plan 02: NPC greeting reducers (will call `getAffinityForNpc()`)
- Plan 03: Gift-giving reducers (will call `awardNpcAffinity()`)
- Plan 04: Dialogue UI (will read NpcDialogueOption table)
- Plan 05: Dynamic NPC reactions (will query affinity tier)

## Next Steps

Plan 02 will build on this foundation by:
1. Creating `conversewithNpc` reducer to select dialogue options and award affinity
2. Creating `giveGiftToNpc` reducer for item-based affinity gain
3. Updating `hailNpc` reducer to show affinity tier in greeting message
4. Adding affinity-based greeting variations (different text for Stranger vs Close Friend)
5. Client-side UI to display current affinity tier and available dialogue options

All backend infrastructure is now in place for dynamic NPC relationship progression.
