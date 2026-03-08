# Quick Task 361: Fix loot links not clickable in combat narrative

## Summary

Fixed two bugs with loot display and one bug with combat UI timing:

### Bug 1: Combat loot not clickable
**Root cause:** `combat.ts:2108` announced loot as plain text (`Loot generated: Item1, Item2`) instead of using clickable `{{color}}[Take X]{{/color}}` format.

**Fix:** Replaced plain-text announcement with rarity-colored clickable links. Also now includes ALL loot types (gear, essences, reagents) not just gear templates.

### Bug 2: `loot` command queried wrong table
**Root cause:** The `loot` command in `intent.ts` searched the `corpse` table (used for player death corpses), not the `combat_loot` table where enemy kill loot is stored.

**Fix:** Changed to query `combat_loot.by_character` instead.

### Bug 3: Combat UI appeared before intro narration
**Root cause:** The watcher that gates combat UI until "The System settles in to watch." used `{ immediate: true }` and scanned ALL historical events. A leftover event from a previous combat would instantly satisfy the check.

**Fix:** Track event count baseline when combat starts, only scan events arriving AFTER that baseline.

## Commits
- `e8653d5` - fix(quick-361): make combat loot clickable and fix loot command
- `e660472` - fix(quick-361): gate combat UI until intro narration for current combat

## Files Modified
- `spacetimedb/src/reducers/combat.ts` — Clickable loot announcement with rarity colors
- `spacetimedb/src/reducers/intent.ts` — Loot command uses combat_loot table
- `src/App.vue` — Combat UI gating uses event baseline tracking
