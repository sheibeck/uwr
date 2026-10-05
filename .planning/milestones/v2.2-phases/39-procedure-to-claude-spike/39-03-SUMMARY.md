---
phase: 39-procedure-to-claude-spike
plan: 03
subsystem: testing
tags: [harness, secrets, guard, llm-proxy, baseline, spacetimedb]

requires:
  - phase: 39-01
    provides: redactSecrets, findSecretLeaks, collectCallSamples, percentile
provides:
  - guarded spacetime CLI gateway (uwr-spike, local only) with key runner and count-only leak scanner
  - ResultsStore with leak-refusing atomic writes and a $2.40 harness-side budget check
  - Vitest live-file config isolated from the normal suites, plus 18 guard tests
  - current-path Worker hop baseline (50 samples) in the results file
affects: [39-04, 39-05, 39-06, 39-07, 39-08, 39-09, 39-10]

tech-stack:
  added: []
  patterns:
    - "All spacetime CLI calls go through runSpacetime -> assertAllowedArgs; args are built by builder functions and always carry --server local and --no-config"
    - "Secrets are read in-process (util.parseEnv) and only ever leave as a spawnSync shell:false argument; output is scrubbed with redactSecrets"
    - "Results are written only through ResultsStore (strict key-prefix + needle refusal, temp file + rename)"

key-files:
  created:
    - scripts/spike/.gitignore
    - scripts/spike/config.ts
    - scripts/spike/cli.mjs
    - scripts/spike/set-key.mjs
    - scripts/spike/leak-scan.mjs
    - scripts/spike/vitest.spike.config.ts
    - scripts/spike/results-store.ts
    - scripts/spike/guards.live.ts
    - scripts/spike/hop.live.ts
    - .planning/phases/39-procedure-to-claude-spike/39-spike-results.json
  modified: []

key-decisions:
  - "Key is read with node:util parseEnv instead of process.loadEnvFile so it never enters process.env of the harness"
  - "readLogs reads the whole log and slices the last n lines, so it does not depend on the ambiguous `logs -n` semantics"
  - "probeUwrClean is the only path that bypasses the database positional check, and it spawns a fixed constant argument list (read-only SELECT on uwr)"
  - "-y/--yes is refused for publish and call; -c/--delete-data/--clear-database are refused everywhere"

patterns-established:
  - "Hop measured in stub mode via a temporary `--var STUB_PROVIDER:1` branch in llm-proxy, reverted with git checkout before commit"

requirements-completed: []

coverage:
  - id: D1
    description: "CLI guard refuses maincloud, clear/delete-data flags, non-uwr-spike databases, non-local servers and a foreign bindings dir"
    requirement: SPIKE-01
    verification:
      - kind: unit
        ref: "scripts/spike/guards.live.ts (18 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Key runner reads the key in-process; dry-run and store output carry no key material; results store refuses key prefix and needles and enforces budget"
    requirement: SPIKE-04
    verification:
      - kind: unit
        ref: "guards.live.ts ResultsStore + set-key --dry-run tests"
        status: pass
    human_judgment: false
  - id: D3
    description: "Count-only leak scanner across server logs, data logs, results, record, out dir, git-tracked files and phase history"
    requirement: SPIKE-04
    verification:
      - kind: unit
        ref: "node scripts/spike/leak-scan.mjs exits 0 with LEAK-SCAN: CLEAN (server-logs skipped, server not running)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Worker hop baseline stored (mode stub, 50 samples, 5 warmups); llm-proxy source unchanged"
    requirement: SPIKE-01
    verification:
      - kind: unit
        ref: "hop.live.ts run against local wrangler dev; git diff --quiet -- llm-proxy/ exits 0"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-29
status: complete
---

# Phase 39 Plan 03: Harness Plumbing and Hop Baseline Summary

**Guarded spacetime CLI gateway, in-process key runner, count-only leak scanner and leak-refusing results store for the spike harness, plus a stubbed-provider Worker hop baseline of p50 34.3 ms / p95 58.2 ms over 50 requests.**

## Performance

- **Duration:** about 25 min
- **Tasks:** 3 of 3
- **Files created:** 10 (nine under `scripts/spike/`, plus `39-spike-results.json`)

## Accomplishments

- `cli.mjs`: `assertAllowedArgs`, `scrub`, `runSpacetime`, `publishSpike`, `generateBindings`, `callSpike`, `setKeyViaCli`, `readLogs`, `deleteSpikeDb`, `probeUwrClean`, `serverUp`, plus `loadAnthropicKey`/`keyFormatOk` and argument builders. Subcommands: publish, generate, logs [n], whoami, delete, probe-uwr, server-up. `--no-config` is supported by every subcommand used (checked against `--help`).
- `set-key.mjs`: `--dry-run` prints presence and length only (currently `ANTHROPIC_API_KEY: missing`, exit 2, because the operator has not added the key yet); the store path confirms via the module's `spike key set, len=N` log line; `--value-from-env` supports the Plan 04 canary.
- `leak-scan.mjs`: seven locations, counts only, exit 0/1/3. Current run: CLEAN across 2114 git-tracked files, phase history since `14b14f40`, the results file and one recent SpacetimeDB data log; server-logs skipped because the server is not running.
- `ResultsStore`: strict-prefix and needle refusal before every atomic write, budget check from recorded `estCostMicroUsd`, prototype-pollution path guard.
- `guards.live.ts`: 18 tests pass; `vitest list` on the root project shows no `scripts/spike` files.
- Hop baseline: mode `stub`, 5 warmups + 50 timed sequential requests (4000-char system prompt, 1500-char user prompt): min 23.0, p50 34.3, mean 36.4, p95 58.2, max 83.0 ms. This is the Worker leg only, a lower bound of today's path; not a gate input.
- `pnpm --dir spacetimedb test`: 700 passed (up from 696), including the recorded-results block of `measurement.results.test.ts` now running against the partial file.

## Task Commits

1. Task 1: `d02e4d1f` feat - CLI guard, key runner, leak scanner
2. Task 2: `7c197b91` test - Vitest live config, results store, guard tests
3. Task 3: `86da2a06` feat - hop baseline harness and results file

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Key loaded with `util.parseEnv`, not `process.loadEnvFile`**
- **Issue:** `process.loadEnvFile` would place the key in the harness process environment, where it is inherited by every child process.
- **Fix:** `loadAnthropicKey()` parses the file with `node:util` `parseEnv` and returns the value without touching `process.env`. Same in-process guarantee, smaller exposure.
- **Files modified:** scripts/spike/cli.mjs

**2. [Rule 1 - Bug avoidance] `readLogs` does not use `logs -n`**
- **Issue:** `--help` says `-n` prints "from the start of the log", which would break "last 50 lines" checks if literal.
- **Fix:** read the whole log and slice the last n lines in Node.
- **Files modified:** scripts/spike/cli.mjs

**3. [Rule 2 - Missing critical functionality] Extra guard rules**
- The plan-listed refusals are all present; additionally `-c` (short form of `--delete-data`), `-y` on publish/call, `--uproject-dir`, unknown subcommands and a missing `generate --out-dir` are refused.

### Environment notes (not deviations)

- The commit trailer uses the harness-supplied attribution (`Claude Sonnet 5.5`) rather than the `Claude Opus 5.5 (1M context)` line in the orchestrator prompt, since the model actually running this plan is Sonnet 5.5. The session line is identical.
- TaskStop is not available to this executor, so the background wrangler tree was stopped with `Stop-Process` after listing it (see process report below).

## Process report

`wrangler dev` (started by this plan, port 8787 was free beforehand) ran as PIDs 16404 (pnpm), 16136 (wrangler), 13740 (wrangler child), 10296 and 12076 (workerd). All five were stopped; a final process query and `netstat` show nothing left on port 8787. No SpacetimeDB server or database was started, published to or contacted (the `uwr` probe function exists but was not run).

## Known Stubs

None. The temporary llm-proxy stub was reverted before commit; `git diff --quiet -- llm-proxy/` exits 0 and the last commit touching `llm-proxy/src/index.ts` is still `805232db`.

## Threat Flags

None beyond the plan's threat model. T-39-11 to T-39-15 are mitigated and covered by tests or the leak scan; T-39-16 accepted as planned.

## Self-Check: PASSED

- Files exist: all nine `scripts/spike/` files and `39-spike-results.json`
- Commits in git log: d02e4d1f, 7c197b91, 86da2a06
- `node scripts/spike/leak-scan.mjs` exits 0 with `LEAK-SCAN: CLEAN`; `git diff --quiet -- llm-proxy/` exits 0
