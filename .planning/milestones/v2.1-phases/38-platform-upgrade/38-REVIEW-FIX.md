---
phase: 38-platform-upgrade
fixed_at: 2026-09-29T00:00:00Z
review_path: .planning/phases/38-platform-upgrade/38-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 38: Code Review Fix Report

**Fixed at:** 2026-09-29
**Source review:** .planning/phases/38-platform-upgrade/38-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (WR-01, WR-02, WR-03; Info items IN-01..IN-05 out of scope for this run)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: smoke.sh prints upstream error text with only heuristic redaction

**Files modified:** `llm-proxy/scripts/smoke.sh`
**Commit:** f25cf670
**Applied fix:** Removed the `redact()` helper and the code that extracted and printed the proxy `error` body. A failed `--real` call now prints only the status line plus a fixed hint ("upstream error body suppressed; inspect the wrangler dev output for details"). The secret-safety properties are unchanged: the secret is written only to the `chmod 600` header temp file, the EXIT trap removes both temp files, and `SECRET` is unset after use. `bash -n` passes. A grep found no line that prints `$SECRET`, `$PROXY_SECRET`, or the response body. The only matches are static messages that mention the variable name.

### WR-02: smoke.sh `.dev.vars` parsing is brittle and fails confusingly

**Files modified:** `llm-proxy/scripts/smoke.sh`
**Commit:** 1086c11f
**Applied fix:** The `PROXY_SECRET` line match now tolerates leading whitespace, an optional `export`, and spaces around `=`. The value extraction strips CR, trailing whitespace, and both single and double surrounding quotes. It uses `sed -E 's/^[^=]*=...'`, so `=` characters inside the secret survive. A `case` guard exits 2 with a clear message if the value still starts or ends with a quote. Inline trailing comments remain unsupported, since they are ambiguous with legitimate secret characters. I checked the parsing pipeline offline against four fake `.dev.vars` variants (`abc=def`, single-quoted, `export X = "..."` with trailing spaces, CRLF double-quoted). All parsed correctly. No wrangler process was started and no network calls were made.

### WR-03: A unit test asserts on the source text of main.ts

**Files modified:** `src/connectionLogging.test.ts`
**Commit:** af7f7f39
**Applied fix:** Deleted the `wires main.ts through contextually typed inline lambdas` test, which regex-matched `main.ts` source text. Also removed its now-unused `readFileSync` and `fileURLToPath` imports. The three behavioral tests for `logDisconnect` and `logConnectError` are kept. `pnpm exec vitest run src/connectionLogging.test.ts` passes (3/3) and `pnpm run build` (`vue-tsc -b && vite build`) passes. The type check remains the guard for the `main.ts` wiring.

## Notes

- Fixes were made in an isolated git worktree. `node_modules` was junctioned in for verification and the junction was removed afterward. The three commits were fast-forwarded onto `master`. The worktree, temp branch, and recovery sentinel are cleaned up. Nothing was pushed.
- Line endings: the working copy uses CRLF via `core.autocrlf` and the index stores LF (`text=auto`). The commits are normalized by git, so the diffs are limited to the intended lines.
- REVIEW-FIX.md is not committed; the orchestrator handles that.

---

_Fixed: 2026-09-29_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
