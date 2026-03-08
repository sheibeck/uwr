---
phase: quick-360
plan: 01
subsystem: narrative-ui
tags: [narrative, commands, bank, vendor, crafting, gathering, loot, stats]
dependency_graph:
  requires: [quick-356]
  provides: [inline-narrative-commands-all-systems]
  affects: [intent-reducer, app-vue]
tech_stack:
  patterns: [inline-narrative-output, clickable-bracket-links, server-side-command-routing]
key_files:
  modified:
    - spacetimedb/src/reducers/intent.ts
    - src/App.vue
decisions:
  - "Deposit/sell logic inlined directly in intent reducer using ctx.db operations (no cross-reducer calls)"
  - "Bank display uses Withdraw keyword; vendor uses Buy keyword; crafting uses Craft keyword"
  - "Resources in look output rendered as clickable [Gather X] green links"
  - "Client keyword handlers use reactive refs (bankSlots, vendorInventory, recipeTemplates, resourceNodes) instead of window.__db_conn"
  - "Loot command shows corpse items at location (player death corpses, not combat loot)"
metrics:
  duration: 6min
  completed: "2026-03-08"
---

# Quick Task 360: Convert Existing Systems to Narrative UI Summary

Full inline narrative experience for all game systems -- stats, bank, vendor, crafting, gathering, loot, deposit, sell.

## What Changed

### Task 1: Server-Side Intent Commands (1015e52)

Added 11 new command handlers to the `submit_intent` reducer in `intent.ts`:

1. **stats** -- Full character stats display (HP/Mana/Stamina, base stats STR/DEX/INT/WIS/CHA, combat stats AC/MR/AP/SP)
2. **bank** -- Bank vault contents with clickable `[Withdraw ItemName]` links, requires banker NPC at location
3. **shop/vendor/store** -- Vendor inventory with clickable `[Buy ItemName]` links and prices, requires vendor NPC
4. **craft/recipes** -- Discovered recipes with material requirements, ready/missing status, clickable `[Craft RecipeName]` and `[Research Recipes]` links
5. **loot** -- Corpse items at current location with clickable `[Take ItemName]` links
6. **deposit <item>** -- Inline bank deposit logic (finds item by name, checks banker, handles stacking)
7. **sell <item>** -- Inline vendor sell logic (finds item by name, checks vendor, applies CHA bonus, adds to vendor inventory)
8. **Resources in look** -- Changed from plain text to clickable `[Gather ResourceName]` green links
9. **Bank hint in look** -- "A [bank] is available here." when banker NPC present
10. **Vendor hint in look** -- "A [shop] is available here." when vendor NPC present
11. **Help text** -- Added all new commands to help listing

### Task 2: Client-Side Keyword Routing (8b7457a)

Updated `clickNpcKeyword` handler in `App.vue`:

- **Removed** craft panel intercept in `onNarrativeSubmit` -- craft command now routes to server
- **Withdraw** keyword handler -- finds bank slot by item name, calls `withdrawFromBank`
- **Buy** keyword handler -- finds vendor inventory item by name, sets active vendor, calls `buyItem`
- **Research Recipes** keyword handler -- calls `researchRecipes()` composable function
- **Craft** keyword handler -- finds recipe template by name, calls `craftRecipe(id)`
- **Gather** keyword handler -- finds available resource node by name at current location, calls `startGatherResource`

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 1015e52 | Server-side narrative commands for all game systems |
| 2 | 8b7457a | Client-side keyword routing for narrative clicks |

## Self-Check: PASSED
