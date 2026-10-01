# Phase 43 deferred items

Out-of-scope discoveries, logged and not fixed (scope boundary).

## 1. RESOLVED (commit d094d5c0): `time` command panics: `getWorldState` is not imported in intent.ts

- **Found during:** Plan 43-15, post-publish log check (`spacetime logs --server local uwr`).
- **Where:** `spacetimedb/src/reducers/intent.ts` line 108 (`const ws = getWorldState(ctx);` in the `time` command). The file does not import `getWorldState`; it is exported from `spacetimedb/src/helpers/location.ts`.
- **Symptom:** four `PANIC: submit_intent ... Uncaught ReferenceError: getWorldState is not defined` lines at 2026-10-01T01:02 (typing `time` in game). Typing `time` aborts that reducer call.
- **Origin:** pre-existing, not caused by Phase 43 (no Phase 43 plan touches the `time` branch). The Phase 43 publish did not change it.
- **Suggested fix:** add `import { getWorldState } from '../helpers/location';` to `intent.ts` and a regression test that runs the `time` intent. A quick task.
