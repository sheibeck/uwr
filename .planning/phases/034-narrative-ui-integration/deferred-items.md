# Deferred Items - Phase 034

## Pre-existing Test Failures (Out of Scope)

### buildLookOutput tests in intent.test.ts (2 failures)
- **File:** spacetimedb/src/reducers/intent.test.ts
- **Tests:**
  - `buildLookOutput > returns array containing location name and description` — fails because `parts[0]` now contains `{{color:#fbbf24}}Town{{/color}}` instead of bare `Town`
  - `buildLookOutput > still works when no quest_item table data exists` — same issue
- **Root cause:** `buildLookOutput` in helpers/look.ts now wraps location names in color tags, but tests expect bare strings
- **Pre-existing:** Confirmed failing before phase 034 work began
- **Recommended fix:** Update test assertions to strip color tags or check `includes('Town')`
