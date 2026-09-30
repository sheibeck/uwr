---
phase: 42-client-cutover-and-legacy-removal
plan: 02
subsystem: client-cutover
tags: [llm, indicator, security, bundle-guard, localstorage, vue-composable]
status: complete
one_liner: "Import-free Keeper indicator lines, a pure useLlmStatus mapping, a never-throwing legacy proxy-secret cleanup wired first into bootstrap, and a tested dist/ bundle guard that prints only rule ids, paths, byte offsets and a string/comment/code class"
requires:
  - phase: 41 (my_llm_jobs view and the llm_sweep sweeper that expires stuck jobs)
provides:
  - "spacetimedb/src/data/llm_indicator_lines.ts: LLM_INDICATOR_LINES, FALLBACK_LINE, PRIORITY, SILENT_ROUTES, ACTIVE_STATUSES (no imports)"
  - "src/composables/useLlmStatus.ts: selectLlmIndicator, resolveDisplayedLine, useLlmStatus"
  - "src/legacyCredentials.ts: clearLegacyLlmCredential, called first in main.ts bootstrap"
  - "scripts/check-bundle.mjs: auditBundle, locateBundleHits, collectBundleFiles, runBundleCheck and a CLI with --explain"
affects: [42-04 (wires the composable into App.vue and NarrativeConsole.vue), 42-05, 42-07 (run the bundle guard after each build)]
tech-stack:
  added: []
  patterns:
    - "Pure mapping plus a thin computed wrapper, tested in node with no DOM"
    - "Server data module imported by the client for strings only (import-free, pinned by a source test)"
    - "Guard output limited to rule id, path, byte offset and a string/comment/code class"
key-files:
  created:
    - spacetimedb/src/data/llm_indicator_lines.ts
    - spacetimedb/src/data/llm_indicator_lines.test.ts
    - src/composables/useLlmStatus.ts
    - src/composables/useLlmStatus.test.ts
    - src/legacyCredentials.ts
    - src/legacyCredentials.test.ts
    - scripts/check-bundle.mjs
    - scripts/check-bundle.test.mjs
  modified:
    - src/main.ts
key-decisions:
  - "The indicator module is import-free; key parity with LLM_ROUTE_NAMES and status parity with LLM_ACTIVE_JOB_STATUSES are pinned by a server test, so the browser receives strings only"
  - "The cleanup writes the key name as a literal directly inside removeItem(...), the only shape the bundle guard allows once"
  - "The guard blanks the first removeItem span in sorted path order and tests every rule on the rest, so a second occurrence or any getItem/setItem/bare use fails"
  - "No rule was narrowed after the calibration run"
metrics:
  tasks: 3
  commits: 3
  tests: "101 root tests (36 client, 65 script) and 51 server tests in the verified files, all passing single-worker; pnpm build passes"
completed: 2026-09-30
---

# Phase 42 Plan 02: Indicator lines, useLlmStatus, credential cleanup and bundle guard Summary

The four pure building blocks of the client cutover exist and are tested: the shared Keeper indicator lines, the `useLlmStatus` mapping, the one-time cleanup of the retired proxy secret (run on every app load), and the `dist/` guard that Plans 42-05 and 42-07 run after each build.

## What was done

**Task 1 (1edca37d): shared indicator lines.** `llm_indicator_lines.ts` has no imports. It exports the frozen lines table (one key per route, null for `combat_narration` and `smoke_test`), the fallback line (the creation_race line), the six-route priority list, the silent routes and the three active statuses. The test pins the UI-SPEC copy word for word, key parity with `LLM_ROUTE_NAMES`, status parity with `LLM_ACTIVE_JOB_STATUSES`, the Keeper voice (starts with "The Keeper", three ASCII dots, no `!`, no banned phrase), the pronoun rule (no it/its/they/them/their/she/her, no other second-person form) and that the source holds no import line.

**Task 2 (d7ee19a1): mapping and cleanup.** `selectLlmIndicator` keeps the active, non-silent row with the lowest priority rank (unknown route ranks 7th and uses the fallback), then the oldest `createdAt` (missing counts as 0), then the lowest id, comparing bigints directly. The result has exactly `active`, `route` and `indicatorLine`. `resolveDisplayedLine` returns the status line, else the fallback when locked, else null. The source never mentions `userMessage` or `errorCode` (test-pinned). `clearLegacyLlmCredential` wraps `removeItem('llm_proxy_secret')` in try/catch and is the first statement of `bootstrap` in `main.ts`, before the auth callback and `createApp(`. Tests: present, absent, throwing storage, no `localStorage` in node, called twice, never writes the value elsewhere, and a `main.ts` source guard. `pnpm build` (vue-tsc plus vite) passes.

**Task 3 (02936a74): bundle guard.** Seven rules (`proxy-key-name`, `proxy-secret`, `proxy-env`, `proxy-url`, `provider-host`, `provider-key`, `key-shaped`). One removeItem span with a double, single or backtick quote is allowed in the whole bundle. `locateBundleHits` returns `{ rule, path, offset, inside }` with UTF-8 byte offsets and a forward string/comment/code scanner (documented heuristic: no regex literals, no template substitutions). Exit codes 0 clean, 1 problem, 2 missing dist or no JavaScript. 65 tests cover the rules, file collection, temp-dir runs, the CLI and the no-echo guarantee (planted text and every 10-character slice of the text around it are absent from `--explain` output).

## Calibration run (pre-cutover `dist/`, built after Task 2)

The build still contains the old proxy composable, as planned. Only the guard's own output was used; no bundle text was opened, sliced or printed.

- Default run: **exit 1**, problems `proxy-key-name`, `proxy-secret`, `proxy-url`, all in `assets/index-DBdMCVqs.js`.
- `--explain` run: **exit 1**, five hits, all in `assets/index-DBdMCVqs.js`:

| Rule | Byte offset | Inside |
|------|-------------|--------|
| proxy-url | 617478 | string |
| proxy-key-name | 617839 | string |
| proxy-secret | 617843 | string |
| proxy-secret | 617877 | string |
| proxy-url | 617972 | string |

- Reading: research predicted `proxy-key-name` (a read of the key name) and `proxy-url` (`localhost:8787` and `/api/llm`), and both appear. The first `proxy-secret` hit is the key name itself (4 bytes after the key-name hit, because `llm_` precedes `proxy_secret`). The second `proxy-secret` hit sits 34 bytes after that, in the same chunk, inside the same proxy code region as the key-name and URL hits. That matches the research note that the build inlines the `VITE_LLM_PROXY_SECRET` fallback literal next to the key read. I could not and did not confirm it from text. No `key-shaped`, `provider-host`, `provider-key` or `proxy-env` hit appeared. The new cleanup's single `removeItem` is not reported (it is the allowed span). No rule was narrowed.
- Consequence for Plan 42-05: after the proxy composable is deleted this hit set must drop to no hits at all.

## Deviations from Plan

None. The plan was executed as written. Two test-fixture arithmetic mistakes (two byte offsets) and one offset assumption (the `proxy-secret` match starts 4 bytes after the key-name match) were fixed in the test file before the GREEN run.

## Known Stubs

None.

## Threat model

- T-42-04 (stale proxy secret in localStorage): mitigated; cleanup runs first in `bootstrap` on every load and is tested for present, absent, throwing and missing storage.
- T-42-05 (credential or proxy host baked into dist): mitigated by the seven guard rules, each covered by planted-token tests; the calibration run proves it catches today's leftovers.
- T-42-06 (guard output echoing a secret): mitigated; output is rule id and path, plus byte offset and class under `--explain`; tests assert neither planted text nor its neighbours appear. The calibration was run with no bundle text displayed.
- T-42-07 (cleanup blocks app start): mitigated by try/catch, tested.
- T-42-08 (indicator leaking job details): mitigated; mapping reads id, route, status, createdAt only, pinned by a source test.
- T-42-SC: no packages installed.

## Threat Flags

None.

## Notes for later plans

- 42-04 wires `useLlmStatus`, `resolveDisplayedLine` and the lines into `App.vue` and `NarrativeConsole.vue`; `LlmJobStatusRow` accepts the generated `my_llm_jobs` row shape (extra fields are fine).
- `dist/` currently holds the pre-cutover build; rebuild before running the guard again.
- `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were left untouched and unstaged.

## Self-Check: PASSED

- Files exist: `spacetimedb/src/data/llm_indicator_lines.ts` and test, `src/composables/useLlmStatus.ts` and test, `src/legacyCredentials.ts` and test, `scripts/check-bundle.mjs` and test.
- Commits found in git log: 1edca37d, d7ee19a1, 02936a74.
