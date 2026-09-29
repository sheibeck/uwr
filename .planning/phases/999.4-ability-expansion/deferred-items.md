# Deferred Items — Phase 36 Ability Expansion

## Pre-existing TypeScript Errors (out of scope for Plan 01)

Discovered during Task 2 verification (`npx tsc --noEmit`). These errors existed before any Plan 01 changes were made (confirmed via git stash). They are not caused by Plan 01 edits.

Files with pre-existing TS errors:
- `src/helpers/combat.ts` — TS2367 unintentional comparison ('dot' vs 'regen')
- `src/helpers/combat.test.ts` — TS18048 possibly undefined
- `src/helpers/corpse.ts` — TS2339 Property 'id'/'characterId'/'locationId' missing on RowBuilder
- `src/helpers/location.ts` — TS2322, TS2339, TS2365 (multiple columns missing on RowBuilder, bigint/number mismatch)
- `src/reducers/items.ts`, `items_crafting.ts`, `items_gathering.ts`, `items_trading.ts` — TS7006 implicit 'any' types
- `src/reducers/social.ts` — TS7006 implicit 'any' types
- `src/data/races.ts` — various errors

These are likely caused by an untracked/uncommitted SpacetimeDB SDK upgrade that changed the RowBuilder type signatures. Should be addressed in a dedicated cleanup task.
