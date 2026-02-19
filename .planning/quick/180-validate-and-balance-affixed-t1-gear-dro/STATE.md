# Quick Task 180 - State

**Status:** COMPLETE
**Completed:** 2026-02-18

## Tasks

- [x] Task 1: Add level-scaled uncommon chance for T1 creatures in rollQualityTier
- [x] Task 2: Add inline rate documentation comment to rollQualityTier

## Commits

- c61eba7: feat(quick-180): add level-scaled affixed drop chance for T1 creatures

## Summary

Both tasks executed in a single commit (same file). The `rollQualityTier` function in `spacetimedb/src/helpers/items.ts` now correctly handles T1 creatures with a level-and-danger-scaled uncommon drop chance instead of always returning 'common'.
