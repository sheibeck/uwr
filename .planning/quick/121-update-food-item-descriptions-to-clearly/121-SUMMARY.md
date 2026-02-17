---
phase: quick
plan: 121
subsystem: client-ui
tags: [food, tooltip, ux, well-fed]
key-files:
  modified:
    - src/composables/useInventory.ts
    - src/App.vue
decisions:
  - Generated food buff descriptions client-side from existing wellFedBuffType/Magnitude/Duration template fields rather than adding a new schema column (avoids migration friction, uses data already present)
metrics:
  duration: ~5min
  completed: 2026-02-17
---

# Quick Task 121: Update Food Item Descriptions Summary

Client-side food buff description generation from wellFedBuffType/Magnitude/Duration fields in both inventory and vendor tooltips.

## What Was Done

Updated item tooltip description logic in two places to generate meaningful food buff descriptions before the player eats them:

- `src/composables/useInventory.ts` — inventory panel tooltip descriptions
- `src/App.vue` — vendor panel tooltip descriptions

For food items (`slot === 'food'`), the description is now generated from the existing template fields:
- `wellFedBuffType` maps to a human-readable label (e.g., `mana_regen` → "mana regeneration per tick")
- `wellFedBuffMagnitude` shows the numeric bonus
- `wellFedDurationMicros` converts to minutes (2,700,000,000 micros = 45 minutes)

### Food Item Descriptions

| Item | Description |
|------|-------------|
| Herb Broth | Grants Well Fed: +4 mana regeneration per tick for 45 minutes. Replaces any active food buff. |
| Roasted Roots | Grants Well Fed: +2 STR for 45 minutes. Replaces any active food buff. |
| Traveler's Stew | Grants Well Fed: +4 stamina regeneration per tick for 45 minutes. Replaces any active food buff. |
| Forager's Salad | Grants Well Fed: +2 DEX for 45 minutes. Replaces any active food buff. |

### Design Decision

Adding a `description` column to `ItemTemplate` schema was attempted but rejected — SpacetimeDB requires a default value annotation for adding non-null columns to existing tables (migration blocker without `--clear-database`). The client-side generation approach uses existing `wellFedBuffType`, `wellFedBuffMagnitude`, and `wellFedDurationMicros` fields already present in every food template row, which is both cleaner and avoids schema migration.

Non-food items fall back to the original metadata-based description (`rarity • armorType • slot • Tier N`).

## Commits

- `bc6981a` feat(quick-121): display food buff descriptions in item tooltips

## Self-Check: PASSED

- `src/composables/useInventory.ts` modified — confirmed exists
- `src/App.vue` modified — confirmed exists
- Commit `bc6981a` — confirmed in git log
- Zero new TypeScript errors introduced (error count 263 before and after)
