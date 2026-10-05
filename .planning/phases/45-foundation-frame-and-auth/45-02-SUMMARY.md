---
phase: 45-foundation-frame-and-auth
plan: 02
subsystem: ui
tags: [css, design-system, nocturne, static-tests]
requires: ["45-01"]
provides:
  - "tokens.client.css: 20 pinned rarity, difficulty, craft and resource-bar tokens"
  - "frame.css: type-scale overrides, .spin, .session-ground"
  - "cssContract.ts scanner helpers for later contract tests (45-08, 45-10)"
  - "Static guards: no literal colors, token pin, var() definitions, design contract"
affects: [45-07, 45-08, 45-10, 45-11]
tech-stack:
  added: []
  patterns: ["postcss + vue/compiler-sfc static scanning instead of computed-style tests"]
key-files:
  created:
    - src/styles/tokens.client.css
    - src/styles/frame.css
    - src/styles/cssContract.ts
    - src/styles/colors.guard.test.ts
    - src/styles/tokens.client.test.ts
    - src/styles/designContract.test.ts
  modified:
    - src/main.ts
key-decisions:
  - "textColorOffenders ignores comments, because PR numbers such as #5707 parse as hex colors"
  - "Negative px spacing values are flagged (strict reading of the 0/4/8/16/24/32/48/64 scale)"
requirements-completed: [FND-02]
duration: 15min
completed: 2026-10-05
status: complete
---

# Phase 45 Plan 02: Client tokens, frame overrides and design-contract guards Summary

Twenty pinned client color tokens and frame-level type-scale overrides layered after Nocturne, with three static test files (58 tests) that fail on any literal color, undefined var(), off-scale size, weight or spacing, non-Inter font, non-Phosphor icon, heading skip, raw-HTML sink or removed focus outline.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Client token file, frame overrides, import order | 0416ba88 |
| 2 | Scanner helper, no-literal-color guard, token pin | c74b172d |
| 3 | Design contract test | 23dd5d4f |

## Verification

- `pnpm vitest run src/styles`: 3 files, 58 tests pass.
- `pnpm vitest run src --maxWorkers=1`: only the baseline `spacetimedb/src/helpers/measurement.results.test.ts` fails (pre-existing); no new failures.
- `pnpm build` (includes vue-tsc and bundle guard) passed after Task 1; `pnpm exec vue-tsc -b` clean at the end.

## Deviations from Plan

**1. [Rule 1 - Bug] Comment text produced a false color offender**
- Found during: Task 2. `src/connectionLogging.ts` cites "PR #5707", which matched the hex pattern.
- Fix: `textColorOffenders` strips block, line and HTML comments before scanning; fixture test added.
- Commit: c74b172d.

**2. [Rule 3 - Blocking] `String.replaceAll` not in the tsconfig lib**
- Found during: final `vue-tsc -b`. Replaced with `split('\\').join('/')` in the three test files.
- Commit: 23dd5d4f.

**3. Scope note**
- The plan's `ClientFiles` includes the helper `readText` export beyond the listed interface; harmless extra.

## Known Stubs

None.

## Threat Flags

None. T-45-08 mitigated by the XSS-sink guard in designContract.test.ts.

## Self-Check: PASSED

Files and commits (0416ba88, c74b172d, 23dd5d4f) verified present.
