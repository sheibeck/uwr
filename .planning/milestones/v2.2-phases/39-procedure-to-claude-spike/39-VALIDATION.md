---
phase: 39
slug: procedure-to-claude-spike
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-29
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 |
| **Config file** | none in `spacetimedb/`: defaults apply and tests are `src/**/*.test.ts`. The live harness uses a temporary `scripts/spike/vitest.spike.config.ts`, deleted at cleanup |
| **Quick run command** | `pnpm --dir spacetimedb exec vitest run src/helpers/measurement.test.ts` |
| **Full suite command** | `pnpm --dir spacetimedb test` |
| **Estimated runtime** | ~30 seconds (unit suite). The live harness takes minutes and is not part of the per-commit loop |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --dir spacetimedb exec vitest run src/helpers/measurement.test.ts`.
- **After every plan wave:**
  - Run `pnpm --dir spacetimedb test`.
  - Once the spike module exists, also run `spacetime build -p spacetimedb`.
- **Before `/gsd-verify-work`:** All of these must pass:
  - the full suite is green, with both recorded results files validated (local under the full profile, maincloud under the gate profile)
  - the leak scan (local, and maincloud including its server log) finds no `sk-ant-` pattern and no key value
  - cleanup verification passes, and the maincloud `uwr-spike-925iv` database is gone (user-deleted, guarded describe fails)
  - the user has confirmed the maincloud verdict
- **Max feedback latency:** 60 seconds.

---

## Per-Task Verification Map

Task IDs are filled in by the planner. The requirement-level map, taken from 39-RESEARCH.md §Validation Architecture:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| SPIKE-04 | Percentile math: nearest-rank (n=50 → p95 is the 48th value), n=1, p0/p100, unsorted and duplicate inputs, empty input throws, input not mutated | unit | `pnpm --dir spacetimedb exec vitest run src/helpers/measurement.test.ts -t percentile` | ❌ W0 | ⬜ pending |
| SPIKE-04 | `evaluateGate`: go / go_with_cap (cap = highest passing, min 2) / no_go / incomplete; dispatch-p95 boundary at 250; region-schema workaround; drills excluded from reliability; `noiseFloorMs` | unit | `pnpm --dir spacetimedb exec vitest run src/helpers/measurement.test.ts -t gate` | ❌ W0 | ⬜ pending |
| SPIKE-01 | Ladder complete: 10/10 public URL, 10/10 `/v1/models` (list contains `claude-sonnet-5-5`), 30/30 small calls; server-log excerpt saved | live + evidence | `ladder` section of `39-spike-results.json`, reliability check by `evaluateGate` | ❌ W2 | ⬜ pending |
| SPIKE-02 | Structured matrix: skill/region × low/medium × 5; thinking-off × 3; drills × 2 each with observed shape; header visibility; region compile result | live + evidence | `results.structured`, `results.drills`, `results.headers` populated (checked by the results test) | ❌ W2 | ⬜ pending |
| SPIKE-03 | Dispatch p95 over 50 no-ops; `ctx.sender` findings; baseline vs load ping and tick p95 | live + evidence | `results.dispatch`, `results.sender`, `results.load[]` populated; verdict recomputed | ❌ W3 | ⬜ pending |
| SPIKE-04 | Both results files are well-formed with no key material, and each recorded verdict equals `evaluateGate`, recomputed from the raw samples (local: full profile, provisional verdict; maincloud: gate profile, decisive verdict) | unit (kept) | `pnpm --dir spacetimedb exec vitest run src/helpers/measurement.results.test.ts` | ❌ W0 | ⬜ pending |
| SPIKE-04 (revised 2026-09-29) | Gate evaluated on maincloud `uwr-spike-925iv`: rungs 1-3 (at least 30 rung-3 calls), 50 no-op dispatches plus ctx.sender, sanity pair, idle baseline, load 8/4/2 (all three always), baseline2 | live + evidence | `39-maincloud-results.json` populated (39-11 T3 node check); verdict recomputed by the kept test under the gate profile | ❌ W9 | ⬜ pending |
| SPIKE-04 | Decision logged | doc check | `grep -c "Decision" .planning/phases/39-procedure-to-claude-spike/39-SPIKE-RECORD.md`; `grep -n "Phase 39" .planning/PROJECT.md .planning/STATE.md` | ❌ W10 | ⬜ pending |
| Cleanup | Production files reverted; no spike remnants; no spike database on either server | shell | `git diff <start-sha> --stat -- spacetimedb/src/index.ts spacetimedb/src/schema/tables.ts` is empty; whole-src diff against the start SHA (spike dir and kept helpers excluded) is empty; the cleanup identifier-pattern grep (see note below) over `spacetimedb/src` is empty; `pnpm --dir spacetimedb test`; `spacetime describe --json uwr-spike --server local --no-config -y` fails while `probe-uwr` succeeds; `SPIKE_TARGET=maincloud node scripts/spike/cli.mjs describe` fails not-found while `spacetime server ping maincloud` succeeds | ❌ W11 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Task-level map (filled by the planner)

| Task | Requirement | Automated verify |
|------|-------------|------------------|
| 39-01 T1 | SPIKE-04 | `pnpm --dir spacetimedb exec vitest run src/helpers/measurement.test.ts` (`-t percentile`, `-t gate`) |
| 39-01 T2 | SPIKE-04 | `pnpm --dir spacetimedb exec vitest run src/helpers/measurement.test.ts` (`-t "failure classes"`, `-t cost`, `-t secrets`) |
| 39-01 T3 | SPIKE-04 | `pnpm --dir spacetimedb exec vitest run src/helpers/measurement.results.test.ts` |
| 39-02 T1 | SPIKE-02 | `pnpm --dir spacetimedb exec vitest run src/spike/spike_bodies.test.ts` |
| 39-02 T2 | SPIKE-01/03 | `pnpm --dir spacetimedb exec vitest run src/spike/` |
| 39-02 T3 | SPIKE-01 | `pnpm --dir spacetimedb run build && pnpm --dir spacetimedb test` |
| 39-03 T1 | SPIKE-01 | `node --check` on the three scripts + `node scripts/spike/leak-scan.mjs` |
| 39-03 T2 | SPIKE-04 | `pnpm exec vitest run --config scripts/spike/vitest.spike.config.ts scripts/spike/guards.live.ts` |
| 39-03 T3 | (non-gate baseline) | `git diff --quiet -- llm-proxy/src/index.ts` + results `hop` check + leak scan |
| 39-04 T1 | SPIKE-01 | `node scripts/spike/cli.mjs server-up && node scripts/spike/cli.mjs probe-uwr` + bindings present |
| 39-04 T2 | SPIKE-03 | `... vitest ... scripts/spike/smoke.live.ts` |
| 39-04 T3 | SPIKE-01 | `... vitest ... scripts/spike/canary.live.ts && node scripts/spike/leak-scan.mjs --require-server` |
| 39-05 T1 | SPIKE-01/02/03 | `... vitest ... scripts/spike/free.live.ts` + leak scan |
| 39-05 T2 | SPIKE-03 | `... vitest ... scripts/spike/baseline.live.ts` + leak scan |
| 39-06 T1 | manual (key) | `node scripts/spike/set-key.mjs --dry-run` |
| 39-06 T2 | SPIKE-01 | `node scripts/spike/set-key.mjs --dry-run && node scripts/spike/leak-scan.mjs --require-server` |
| 39-06 T3 | SPIKE-01 | `... vitest ... scripts/spike/ladder.live.ts` + leak scan |
| 39-07 T1 | SPIKE-02 | `... vitest ... scripts/spike/structured.live.ts` + leak scan |
| 39-07 T2 | SPIKE-02 (also captured) | `pnpm --dir spacetimedb exec vitest run src/spike/` + `... extras.live.ts` + leak scan |
| 39-08 T1 | SPIKE-03 | `SPIKE_LOAD_DRY_RUN=1 ... scripts/spike/load.live.ts` |
| 39-08 T2 | SPIKE-03 | `... load.live.ts && ... measurement.results.test.ts && leak scan` |
| 39-11 T1 | SPIKE-04 (guard) | `... vitest ... scripts/spike/guards.live.ts` (both targets) + maincloud delete/probe-uwr refused + bogus target refused + `leak-scan.mjs` scans both results files |
| 39-11 T2 | SPIKE-04 | `... measurement.results.test.ts` (gate profile, multi-file discovery) + `pnpm --dir spacetimedb test` + kept-helper word/pattern greps empty + `vitest list` of load.live.ts and sanity.live.ts |
| 39-11 T3 | SPIKE-01/02/03/04 (maincloud) | maincloud results node check + `... measurement.results.test.ts` + `SPIKE_TARGET=maincloud node scripts/spike/leak-scan.mjs --require-server` |
| 39-09 T1 | SPIKE-04 | `... verdict.live.ts` (local, provisional) and `SPIKE_TARGET=maincloud ... verdict.live.ts` (decisive) + `... measurement.results.test.ts` + both leak scans |
| 39-09 T2 | manual (verdict) | user reply recorded |
| 39-09 T3 | SPIKE-04 | results test (maincloud confirmation present, both verdicts reproducible) + both leak scans + `Phase 39` in PROJECT.md and STATE.md; spike dirs still present |
| 39-10 T1 | manual (maincloud delete) | user replied "maincloud-deleted" (the guard refuses delete on maincloud) |
| 39-10 T2 | cleanup | maincloud confirmation present, `spacetime server ping maincloud` ok, guarded maincloud `describe` fails, `probe-uwr` prints `uwr spike tables: absent`, `spacetime describe` of local `uwr-spike` fails |
| 39-10 T3 | cleanup | start-SHA diffs empty (two files + whole src minus kept helpers and spike dir), identifier-pattern grep empty, dirs gone, llm-proxy/bindings unchanged, build + full suite |

Note: the cleanup gate (39-10 T2) uses a case-sensitive identifier pattern, not the bare-word `-il spike` grep. The bare word already matches the unrelated, pre-existing `summoner_conjured_spike: 'int'` key in `spacetimedb/src/data/combat_scaling.ts`, so that grep could never pass. The pattern, run as `git grep --untracked -nE '<pattern>' -- spacetimedb/src`, is:

`[Ss]pike[_A-Z/]|SPIKE_|registerSpike|llm_spike|uwr-spike|runSpec|validateSpec|buildRequest|parseResponse|toAnthropicSchema|cutBeforeJsonInstruction|_JSON_SCHEMA|BAD_KEY_VALUE|MAX_TOKENS|DEFAULT_TIMEOUT_MS|ANTHROPIC_VERSION|MODELS_URL|CLI_IDENTITY|SPEND_CAP_MICRO_USD|c200252497b98fff`

On 2026-09-29 it matched all 52 identifier forms from 39-02 and 39-07 (tables, procedures, reducers, types, exports, import paths, the build tag, the CLI identity and the registration call) and nothing in the tree. Its `uwr-spike` alternative also covers the maincloud database name `uwr-spike-925iv`.

The kept helpers are checked against the same pattern in 39-01 T3 and again in 39-11 T2. They also contain no occurrence of the word at all (the per-file `grep -ci spike` gates from 39-01). 39-11 T2 rewords the one comment that the partial 39-09 commit d023526c added in `measurement_results.ts`.

The kept `measurement.results.test.ts` finds results files by the `39-` folder prefix and the `-results.json` suffix, and validates every match. A name containing `maincloud` is validated under the gate profile; any other name under the full profile.

Maincloud is reachable only through `scripts/spike/cli.mjs` with `SPIKE_TARGET=maincloud`, and only for `uwr-spike-925iv`. Claude publishes there under the user's 2026-09-29 grant; publishing is the only maincloud write. Deleting the database is the user's action (39-10 T1).

---

## Wave 0 Requirements

- [ ] `spacetimedb/src/helpers/measurement.ts` and `measurement.test.ts`: pure code that can be built and tested before any server exists
- [ ] `spacetimedb/src/helpers/measurement.results.test.ts`: results schema, no-secrets scan, verdict reproducibility. It is skipped when the results file is absent
- [ ] Smoke checks, with no spend:
  - the server is up
  - `spike_whoami` returns the CLI identity
  - bindings are generated
  - the live Vitest file connects and pings
  - the canary-key leak scan is clean
- [ ] Framework install: none needed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Anthropic key provisioned in a dedicated workspace with a spend limit | SPIKE-01/02 | Requires the user's Anthropic Console account | The user creates the workspace and key, then writes `ANTHROPIC_API_KEY=` to `spacetimedb/.env.local` |
| Verdict confirmation before Phase 40 | SPIKE-04 | User decision (CONTEXT: "you confirm the verdict"; REVISED 2026-09-29: maincloud decides) | Claude presents the side-by-side gate table, with the maincloud verdict decisive and the local verdict provisional. The user confirms it or overrides it with a reason |
| Maincloud publish grant recorded before the guarded publish | SPIKE-04 | User permission (2026-09-29, publish to `uwr-spike-925iv` only) | 39-11 T3 step 1 checks that 39-CONTEXT.md records the grant; without it the user runs the publish |
| Maincloud spike database deleted | Cleanup | User-only action (the grant covers publishing only) | The user runs `spacetime delete uwr-spike-925iv --server maincloud --no-config` (or uses the dashboard). 39-10 T2 verifies through the guarded describe |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
