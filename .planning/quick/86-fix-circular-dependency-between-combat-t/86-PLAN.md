---
phase: quick-86
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/location.ts
autonomous: true

must_haves:
  truths:
    - "No circular dependency warning between combat.ts and location.ts"
    - "Schema extraction succeeds (no EOF parsing error)"
    - "Client bindings can be generated via spacetime generate"
  artifacts:
    - path: "spacetimedb/src/helpers/location.ts"
      provides: "Location helper functions with corrected imports"
      contains: "from '../data/combat_constants'"
  key_links:
    - from: "spacetimedb/src/helpers/location.ts"
      to: "spacetimedb/src/data/combat_constants.ts"
      via: "direct import (no longer through combat.ts)"
      pattern: "import.*GROUP_SIZE.*from.*combat_constants"
---

<objective>
Fix the circular dependency between combat.ts and location.ts that prevents schema extraction and client binding generation.

Purpose: The circular import cycle (combat.ts -> location.ts -> combat.ts) causes SpacetimeDB's schema extraction to fail with "EOF while parsing a value", blocking all client binding generation and development.

Output: Module builds cleanly without circular dependency warnings and schema extraction succeeds.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/combat.ts
@spacetimedb/src/helpers/location.ts
@spacetimedb/src/data/combat_constants.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Break circular dependency by redirecting imports</name>
  <files>spacetimedb/src/helpers/location.ts</files>
  <action>
In `spacetimedb/src/helpers/location.ts`, change line 4 from:

```typescript
import { GROUP_SIZE_DANGER_BASE, GROUP_SIZE_BIAS_RANGE, GROUP_SIZE_BIAS_MAX } from './combat';
```

to:

```typescript
import { GROUP_SIZE_DANGER_BASE, GROUP_SIZE_BIAS_RANGE, GROUP_SIZE_BIAS_MAX } from '../data/combat_constants';
```

This breaks the cycle because:
- combat.ts imports getGatherableResourceTemplates from ./location (this stays)
- location.ts was importing GROUP_SIZE constants from ./combat (creates cycle)
- combat.ts re-exports these from ../data/combat_constants (the original source)
- Importing directly from combat_constants eliminates the cycle

Do NOT remove the re-export in combat.ts (lines 44-51) because index.ts imports these constants from ./helpers/combat and that import path must remain valid.

Do NOT change any other imports or code in either file.
  </action>
  <verify>
1. Run `cd spacetimedb && npx spacetimedb-server build` and confirm:
   - No "Circular dependency" warning in output
   - Build succeeds
   - Schema extraction succeeds (no "could not extract schema" or "EOF while parsing" error)
2. Run `spacetime generate --lang typescript --out-dir ../src/module_bindings --project-path .` and confirm bindings are generated successfully.
  </verify>
  <done>
Module builds without circular dependency warning. Schema extraction completes successfully. Client bindings are generated without errors.
  </done>
</task>

</tasks>

<verification>
- `npx spacetimedb-server build` in spacetimedb/ directory produces no circular dependency warnings
- Schema extraction succeeds (the "could not extract schema" / "EOF while parsing" error is gone)
- `spacetime generate` produces fresh client bindings in src/module_bindings/
</verification>

<success_criteria>
- Zero circular dependency warnings during build
- Schema extraction succeeds
- Client binding generation completes successfully
- No runtime behavior changes (only import path changed, same constants used)
</success_criteria>

<output>
After completion, create `.planning/quick/86-fix-circular-dependency-between-combat-t/86-SUMMARY.md`
</output>
