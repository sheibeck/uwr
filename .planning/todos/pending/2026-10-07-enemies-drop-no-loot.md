---
created: 2026-10-07T02:00:00Z
title: Killed enemies drop no loot (no loot tables exist)
area: gameplay
files:
  - spacetimedb/src/reducers/combat.ts:700-770
  - spacetimedb/src/reducers/combat.ts:2050-2140
---

## Problem

On 2026-10-07 the owner reported: "Killed enemies do not appear to be dropping any kind of loot."

Root cause (checked on the local database):
- `loot_table` has **0 rows**, and `combat_loot` and `corpse` are empty too.
- After a kill, `findLootTable` (`combat.ts:700-730`) finds no table, so `combat.ts:751-752` returns no items, and gold falls back to the no-table path.
- The seeded loot tables were removed in v2.0 ("nothing pre-seeded"), and nothing generates them since. Recipes and vendor stock had the same gap (fixed in 50-24 and 50-25).

There is also a second gap: the new client has no loot UI. The designed loot rails are Phase 52 (999.23).

## Solution

**Server: rule-based loot tables, with no LLM.**
- **Selection.** Follow the 50-24 vendor stock and 50-25 recipe rules. Each enemy template gets a deterministic loot table, built lazily at first kill or when the template is created.
  - It draws from item templates that already exist and suit the enemy's level band and terrain.
  - Materials and consumables are weighted most; gear is rarer.
- **Gold.** Use a gold range by level.
- **Determinism.** Rolls use ctx-based seeds only.
- **Later.** 999.26 sub-region types will later steer loot tables, so keep the selection rule in one shared place.
- **Shipping.** Additive only, with real-handler tests, published locally with the key check.

**Client.** Show loot, either through the Phase 52 loot rails or a smaller interim step. The owner decides.

## Owner decision (2026-10-07)

- "I actually want LLM generated loot so we don't have to manage loot tables, can we come up with loot rules where the LLM fills our loot table for us?"
- **The AI fills the flavour; the server owns the numbers.** The AI picks fitting item names, kinds and descriptions. The server sets the entry count, rarity mix, gold, drop chances and all stats. A rule-based fallback is used until the job lands.
- **A separate AI job per enemy type,** not inside world generation.
- **Built in the new Phase 51.3 Loot,** together with the designed loot rails (999.23, moved out of Phase 52). The prompt wording needs the owner's approval.
