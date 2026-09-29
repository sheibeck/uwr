---
phase: 38-platform-upgrade
reviewed: 2026-09-29T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - llm-proxy/scripts/smoke.sh
  - src/connectionLogging.test.ts
findings:
  critical: 0
  warning: 0
  info: 5
  total: 5
status: clean
---

# Phase 38: Code Review Report (iteration 2, re-review after fixes)

**Reviewed:** 2026-09-29
**Depth:** standard
**Files Reviewed:** 2 (scope limited to the files changed by fix commits `1086c11f`, `f25cf670`, `af7f7f39`; the other 24 files from the prior review are unchanged)
**Status:** clean (no Critical or Warning findings; Info-only counts as clean for the fix loop)

## Summary

WR-01, WR-02 and WR-03 are all resolved, and the fixes introduced no new Critical or Warning issues.

- **WR-01 (resolved).** The `redact()` helper and the code that printed the upstream `error` body are gone. A failed `--real` call now prints only the status code and a fixed hint. No path prints `$SECRET`, the header file, or the response body. Every `check`/`echo` prints only static text or the HTTP status. `SECRET` is written only to the header temp file (mode 600, passed to curl with `-H @file`, so it never appears in argv). It is unset immediately afterward, and the EXIT trap removes both temp files. The two early `exit 2` messages are static.
- **WR-02 (resolved).** The parser now tolerates leading whitespace, `export`, spaces around `=`, CRLF, trailing whitespace, and single or double quotes. `=` inside the secret is preserved. A `case` guard exits 2 with a clear, non-leaking message if a quote still sits at either end. I ran the script offline against a `.dev.vars` line of the form `  export PROXY_SECRET = 'a=b"c'  <CRLF>`. It parsed cleanly and reached the network checks, which fail with 000 against a dead port as expected. `bash -n` passes. Limitations, all acceptable and none leaking: inline trailing comments are unsupported (documented in the script), and an internal quote, as in `"x"y"`, passes the guard once the outer pair is stripped.
- **WR-03 (resolved).** The main.ts source-regex test and its two now-unused imports were removed. The three remaining tests are still meaningful:
  - They assert `logDisconnect()` uses `console.log` only, `logDisconnect(err)` uses `console.warn` with the error and no `console.log`, and `logConnectError(err)` calls `console.log` exactly as before.
  - They pin the 2.10 disconnect-with-error routing behavior against the real helpers, and they restore mocks in `afterEach`.
  - The main.ts wiring (`src/main.ts:33-34`) is still guarded by the `vue-tsc -b` type check.

Info items IN-01 through IN-05 were intentionally out of fix scope and are carried forward unchanged.

## Info

### IN-01: Stale TS version in the connectionLogging comment

**File:** `src/connectionLogging.ts:9-11`
**Issue:** The comment cites "TS 5.6 ... TS2589", but the phase moved the repo to TypeScript ~6.0.3.
**Fix:** Update the comment to say which TS version was verified, or drop the version reference.

### IN-02: App.vue has orphaned comments and blank-line residue from the deletions

**File:** `src/App.vue` around lines 997, 1000, 1756, 2160, 2237
**Issue:** Several section headers now sit above nothing or above unrelated code:
- `// Reducer call handlers for quest interactions`
- `// World Events: hasActiveEvents computed and banner overlay`
- `// Corpse loot handlers`
- `// Combat action bar event handlers`

The comment `// Active (non-fading) bard song key ... used to highlight hotbar slot` refers to the deleted `activeSongKey`. There are also runs of 2-5 consecutive blank lines where blocks were removed.
**Fix:** Remove the orphaned comments and collapse the blank-line runs.

### IN-03: Bare composable calls whose results are discarded

**File:** `src/App.vue:1852` (`useMovement`), `src/App.vue:2164` (`useContextActions`)
**Issue:** Both calls now do nothing useful. `useMovement` only creates a `useReducer` wrapper, and `useContextActions` only returns computeds. Leaving them in suggests to readers that they register side effects.
**Fix:** Remove the calls, and the imports if nothing else uses them. This is optional, since keeping them was a deliberate behavior-neutral choice.

### IN-04: Hotbar key handler does not guard `metaKey` or `e.repeat`

**File:** `src/App.vue:2241-2270`
**Issue:** The handler skips `ctrlKey` and `altKey` but not `metaKey`, so on macOS Cmd+1..9 (browser tab switch) also fires a hotbar slot. Holding a digit key re-fires `onHotbarClick` on every auto-repeat; server cooldowns limit the damage. This is the restored behavior, not a regression.
**Fix:** `if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;`

### IN-05: pnpm-only policy is documented but not enforced

**File:** `package.json` (also `llm-proxy/package.json`, `spacetimedb/package.json`)
**Issue:** The `package-lock.json` files were deleted and `engines.node` was added, but there is no `packageManager` field and no `preinstall: only-allow pnpm` guard. Running `npm install` would silently regenerate `package-lock.json`.
**Fix:** Add `"packageManager": "pnpm@<version>"` to each package.json. Optionally add `"preinstall": "npx only-allow pnpm"` or set `engine-strict=true` in `.npmrc`.

---

_Reviewed: 2026-09-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
