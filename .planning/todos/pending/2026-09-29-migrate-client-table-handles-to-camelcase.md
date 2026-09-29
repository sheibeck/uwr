---
created: 2026-09-29T00:00:00.000Z
title: Migrate client table handles to camelCase
area: ui
priority: low
files:
  - src/composables/
  - src/components/
---

## Problem

Since SpacetimeDB 2.7.0, generated client table handles are camelCase (`conn.db.combatEncounter`, `tables.combatEncounter`). The snake_case names still work as deprecated aliases. The client has about 273 snake_case references (e.g. `useCombatData.ts`). The connection is typed `any`, so there are no deprecation warnings to show where they are.

## Solution

This is optional cleanup, to do after Phase 38 whenever convenient:

- Rename snake_case table handle references in `src/` to camelCase
- Consider typing the connection as the generated `DbConnection` so the compiler catches deprecated handles
- Check that nothing iterates `conn.db` by key (none found at research time)
