---
phase: 38-platform-upgrade
plan: 07
subsystem: docs-tooling
tags: [pnpm, engines, docs, claude-md, spacetimedb-2.10]
requires: [38-06]
provides:
  - engines.node >=22.12 in root, spacetimedb/, llm-proxy/
  - README/PROJECT.md tech stack and setup facts for 2.10.1 / TS 6.0 / Vue 3.5.43 + Vite 8.3.1
  - CLAUDE.md/AGENTS.md SpacetimeDB 2.10 rules
affects: [README.md, .planning/PROJECT.md, CLAUDE.md, AGENTS.md, package.json, spacetimedb/package.json, llm-proxy/package.json]
tech-stack:
  added: []
  patterns: [pnpm-only, standalone pnpm projects per directory]
key-files:
  created: []
  modified: [package.json, spacetimedb/package.json, llm-proxy/package.json, README.md, .planning/PROJECT.md, CLAUDE.md, AGENTS.md]
decisions:
  - "CLAUDE.md views `.iter()` rule and all-languages header kept unchanged (unverified, per RESEARCH A1)"
metrics:
  tasks: 2
  files: 7
completed: 2026-09-29
status: complete
---

# Phase 38 Plan 07: pnpm-only state, Node 22.12 engines, docs refresh Summary

Declared the Node >=22.12 engine floor in all three projects, confirmed pnpm-only lockfiles with passing frozen installs, refreshed README/PROJECT.md tech facts, and surgically updated CLAUDE.md's stale SpacetimeDB rules to 2.10 with AGENTS.md kept byte-identical.

## Commits

- 3dcd5126: chore(38-07): engines node >=22.12, pnpm-only, refresh README/PROJECT tech stack
- cd4d3e61: docs(38-07): update SpacetimeDB rules in CLAUDE.md/AGENTS.md for 2.10

## Task 1 results

- `engines: { node: ">=22.12" }` added to `package.json`, `spacetimedb/package.json`, `llm-proxy/package.json`. No dependency range changed (acceptance grep printed 0).
- Frozen installs (pnpm 11.23.0, Node 22.23.2): root, `spacetimedb/`, `llm-proxy/` all exit 0 ("Already up to date").
- `git ls-files '*package-lock.json'` = 0; the three `pnpm-lock.yaml` files are tracked (3). No stray npm lockfiles.
- README: tech rows now SpacetimeDB 2.10.1, TypeScript 6.0, Vue 3.5.43 + Vite 8.3.1; Node.js 22.12+; pnpm 11+; setup step 1 gains `pnpm --dir spacetimedb install` and `pnpm --dir llm-proxy install`.
- PROJECT.md: same three rows plus new `Package manager | pnpm 11 (...)` row. Line 85 and procedure-HTTP claims untouched.

## Task 2: CLAUDE.md spots changed (old gist -> new gist)

1. Tested-with header: runtime/npm 1.11.x -> 2.10.x; last updated 2026-01-06 -> 2026-09-29 (SDK section only; line 4 header unchanged).
2. Errors-table row: "Multi-column index .filter() BROKEN" -> works on 2.7+, only older SDKs panic.
3. Index literals (3 places): `name:` -> `accessor:`; naming-convention bullet now says indexes are accessed by declared `accessor` (required since 2.0.4).
4. Multi-column section: all-caps BROKEN heading/PANIC example -> "Multi-column indexes (fixed in 2.7 / 2.8)" with prefix-scan example and manual-filter alternative. No new filter syntax introduced.
5. Scheduled Tables: string reducer name -> `scheduled: () => runCleanup` and `export const runCleanup = spacetimedb.reducer(...)`.
6. Project structure: `spacetimedb` dependency `^1.11.0` -> `^2.10.1`.
7. Section 10: "Procedures (Beta)" -> "Procedures"; beta warning -> stable since 2.5.0, `ctx.sender` fixed since 2.6.1.
8. Added camelCase client-handle bullet (2.7.0, deprecated snake_case aliases, `foo?:` optional fields since 2.6.1).

Diff size: 20 added / 17 deleted lines (within the 45/40 cap). Views `.iter()` rule kept (grep = 1).

## AGENTS.md parity

`cp CLAUDE.md AGENTS.md`; `cmp CLAUDE.md AGENTS.md` reports identical. All verify greps pass (BROKEN=0, "1.11"=0, `name: 'by_`=0, `accessor: 'by_owner'` >= 4).

## Deviations from Plan

None to the plan's intent. One incidental note: on disk both files were mostly CRLF (git index is LF via `.gitattributes eol=lf`); after the edit CLAUDE.md is pure LF and AGENTS.md was copied from it, so both are now LF on disk and identical. Git-level content is unaffected.

## Known Stubs

None.

## Self-Check: PASSED

- Commits 3dcd5126 and cd4d3e61 exist; all modified files present; verify commands exit 0.
