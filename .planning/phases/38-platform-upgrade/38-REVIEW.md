---
phase: 38-platform-upgrade
reviewed: 2026-09-29T00:00:00Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - llm-proxy/package.json
  - llm-proxy/pnpm-workspace.yaml
  - llm-proxy/scripts/smoke.sh
  - spacetimedb/package.json
  - spacetimedb/pnpm-workspace.yaml
  - spacetimedb/src/reducers/intent.test.ts
  - src/App.vue
  - src/components/ActionBar.vue
  - src/components/AppHeader.vue
  - src/components/CharacterInfoPanel.vue
  - src/components/FriendsPanel.vue
  - src/components/GroupPanel.vue
  - src/components/NarrativeConsole.vue
  - src/components/NarrativeHotbar.vue
  - src/components/NarrativeMessage.vue
  - src/components/WorldEventPanel.vue
  - src/composables/useCombat.ts
  - src/composables/useCommands.ts
  - src/composables/useHotbar.ts
  - src/composables/useLlmProxy.ts
  - src/composables/usePanelManager.ts
  - src/composables/useSkillChoice.ts
  - src/connectionLogging.test.ts
  - src/connectionLogging.ts
  - src/main.ts
  - package.json
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 38: Code Review Report

**Reviewed:** 2026-09-29
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

The Wave 0 cleanup is behavior-preserving apart from the two user-approved changes: number-key shortcuts were restored and the dead `ranger_track` call was removed. No removed binding or composable call had a side effect. The findings below are robustness and maintainability issues, not correctness regressions.

## Warnings

### WR-01: smoke.sh prints upstream error text with only heuristic redaction

**File:** `llm-proxy/scripts/smoke.sh:73-76` (redact at 34-36)
**Issue:** When a `--real` call fails, the script prints the proxy's `error` body, which is the OpenAI SDK error message passed through by `llm-proxy/src/index.ts`. Redaction is just two regexes tuned to `sk-<16+ chars>` and `***`. An OpenAI 401 message such as `Incorrect API key provided: sk-proj-abc1********xyz9` is only redacted from the `****` onward, so the `sk-proj-abc1` key prefix still reaches the terminal or CI log. That is an OPENAI_API_KEY fragment rather than the `.dev.vars` PROXY_SECRET, but it still breaks the "never echo secrets" intent.
**Fix:** Don't print the upstream message. Print the status and a fixed hint instead, e.g. `echo "FAIL real-call (expected 200 with ok:true, got $STATUS)"` followed by `echo "  (upstream body suppressed; inspect wrangler dev output)"`. If a message is kept, allowlist known-safe error classes rather than redacting.

### WR-02: smoke.sh `.dev.vars` parsing is brittle and fails confusingly

**File:** `llm-proxy/scripts/smoke.sh:19-21`
**Issue:** The parser only matches `^PROXY_SECRET=`. It does not handle `export PROXY_SECRET=...`, spaces around `=`, single-quoted values (only double quotes are stripped), or trailing inline comments. A single-quoted value keeps its quotes, so the "auth OK" checks send the wrong bearer and the validation check reports the misleading `FAIL validation (expected 400, got 401)`. This does not leak anything.
**Fix:** Strip single quotes as well as double quotes (`sed -e "s/^[\"']//" -e "s/[\"']$//"`), and fail fast if the value still starts with a quote. Optionally tolerate `^[[:space:]]*(export[[:space:]]+)?PROXY_SECRET[[:space:]]*=`.

### WR-03: A unit test asserts on the source text of main.ts

**File:** `src/connectionLogging.test.ts:44-49`
**Issue:** The test `wires main.ts through contextually typed inline lambdas` reads `main.ts` and regex-matches the exact lambda text. Any harmless reformat breaks it: renaming `_ctx`, adding a line break, or switching to a named handler. It verifies neither the runtime wiring nor type safety, and `vue-tsc -b` already enforces the type guarantee.
**Fix:** Delete this test and rely on the type check. Alternatively, export a small `attachConnectionLogging(builder)` helper from `connectionLogging.ts` and test it with a fake builder.

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
