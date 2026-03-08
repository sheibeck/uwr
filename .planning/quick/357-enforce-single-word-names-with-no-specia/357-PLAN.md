# Quick Task 357: Enforce single-word names with no special characters and no duplicates

## Task 1: Add name validation rules

**Files:** `spacetimedb/src/reducers/creation.ts`
**Action:** Update AWAITING_NAME validation to enforce:
- 3-20 characters length
- Single word only (no spaces)
- Letters only (no numbers, symbols, special characters)
- Case-insensitive duplicate check (already existed)

**Done:** All validation rules applied with sardonic System error messages.
