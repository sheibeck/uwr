# Quick Task 357: Summary

## What Changed
- Updated character name validation in `spacetimedb/src/reducers/creation.ts`
- Names must be 3-20 characters, single word, letters only (a-zA-Z)
- Duplicate check was already in place (case-insensitive)
- Each validation failure has a sardonic System error message

## Files Modified
- `spacetimedb/src/reducers/creation.ts` — AWAITING_NAME validation block
