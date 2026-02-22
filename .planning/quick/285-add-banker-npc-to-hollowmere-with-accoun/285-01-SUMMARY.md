---
phase: 285-bank
plan: "01"
subsystem: bank
tags: [bank, npc, backend, spacetimedb]
dependency_graph:
  requires: []
  provides: [BankSlot table, my_bank_slots view, deposit_to_bank reducer, withdraw_from_bank reducer, Thurwick NPC]
  affects: [item inventory system, NPC seeding]
tech_stack:
  added: []
  patterns: [private-table-with-view pattern, ownerCharacterId=0n sentinel for banked items]
key_files:
  created:
    - spacetimedb/src/reducers/bank.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/reducers/index.ts
    - spacetimedb/src/seeding/ensure_world.ts
decisions:
  - "Used ownerCharacterId=0n as sentinel for banked items — ItemInstance row stays but is orphaned from any character"
  - "Used bank_slot (snake_case) in view body as required by SpacetimeDB TypeScript SDK db access pattern"
metrics:
  duration_minutes: 15
  tasks_completed: 2
  files_changed: 4
  completed_date: "2026-02-22"
---

# Phase 285 Plan 01: Bank Backend Summary

**One-liner:** BankSlot private table with my_bank_slots view, deposit/withdraw reducers with 40-slot cap, and Thurwick banker NPC at Hollowmere.

## What Was Built

### BankSlot Table + View (Task 1)

Added `BankSlot` table to `spacetimedb/src/schema/tables.ts`:
- Columns: `id` (u64 auto-inc PK), `ownerUserId` (u64), `slot` (u64, 0-39 index), `itemInstanceId` (u64)
- Indexes: `by_owner` (btree on ownerUserId), `by_item` (btree on itemInstanceId)
- Table is private (no `public: true`)

Added `my_bank_slots` view that returns only the calling user's bank slots:
- Looks up player by `ctx.sender`, filters `bank_slot.by_owner` by `player.userId`
- Returns empty array if player not found or has no userId

### Bank Reducers (Task 2)

Created `spacetimedb/src/reducers/bank.ts` with two reducers:

**deposit_to_bank** (args: `characterId`, `instanceId`):
1. Validates character ownership via `requireCharacterOwnedBy`
2. Gets userId via `requirePlayerUserId`
3. Validates item exists, belongs to character, and is unequipped
4. Checks bank has fewer than 40 slots used
5. Finds first free slot index (0-39)
6. Sets `ownerCharacterId = 0n` on ItemInstance (sentinel for "in bank")
7. Inserts BankSlot row
8. Appends private event message

**withdraw_from_bank** (args: `characterId`, `bankSlotId`):
1. Validates character ownership and userId
2. Validates bank slot exists and belongs to this user
3. Checks ItemInstance exists (cleans up orphaned slot if not)
4. Checks stackable match or inventory has space (< MAX_INVENTORY_SLOTS)
5. Restores `ownerCharacterId` to character, clears `equippedSlot`
6. Deletes BankSlot row
7. Appends private event message

### Thurwick NPC (Task 2)

Added to `spacetimedb/src/seeding/ensure_world.ts` after Quartermaster Jyn:
- Name: Thurwick
- npcType: `banker`
- Location: Hollowmere
- Personality: shrewd_trader
- Mood: composed

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: BankSlot table + view | f4f324a | spacetimedb/src/schema/tables.ts |
| Task 2: Bank reducers + Thurwick NPC | c658708 | spacetimedb/src/reducers/bank.ts, reducers/index.ts, seeding/ensure_world.ts |

## Deviations from Plan

None - plan executed exactly as written.

The only minor adjustment: the view body uses `ctx.db.bank_slot` (snake_case) instead of `ctx.db.bankSlot` (camelCase) because SpacetimeDB TypeScript SDK uses the declared table name directly for `ctx.db` access in view context. TypeScript compiler confirmed `bankSlot` does not exist, `bank_slot` is correct.

## Verification

- Module published to local SpacetimeDB without errors
- Logs show: `Creating table bank_slot` and `Database updated`
- Generated bindings include: `bank_slot_table.ts`, `my_bank_slots_table.ts`, `deposit_to_bank_reducer.ts`, `withdraw_from_bank_reducer.ts`
- TypeScript compilation: no new errors introduced by our changes

## Self-Check

- [x] `spacetimedb/src/schema/tables.ts` exists and contains BankSlot
- [x] `spacetimedb/src/reducers/bank.ts` exists with registerBankReducers
- [x] `spacetimedb/src/reducers/index.ts` imports and calls registerBankReducers
- [x] `spacetimedb/src/seeding/ensure_world.ts` contains Thurwick
- [x] Commits f4f324a and c658708 exist in git log
- [x] Module published successfully (no panic in logs)
- [x] Bindings regenerated with bank types

## Self-Check: PASSED
