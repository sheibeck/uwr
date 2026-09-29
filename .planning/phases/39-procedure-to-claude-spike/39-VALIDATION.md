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
  - the full suite is green
  - the results JSON leak scan finds no `sk-ant-` pattern and no key value
  - cleanup verification passes
  - the user has confirmed the verdict
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
| SPIKE-04 | Results file is well-formed with no key material, and the recorded verdict equals `evaluateGate`, recomputed from the raw samples | unit (kept) | `pnpm --dir spacetimedb exec vitest run src/helpers/measurement.results.test.ts` | ❌ W0 | ⬜ pending |
| SPIKE-04 | Decision logged | doc check | `grep -c "Decision" .planning/phases/39-procedure-to-claude-spike/39-SPIKE-RECORD.md`; `grep -n "Phase 39" .planning/PROJECT.md .planning/STATE.md` | ❌ W4 | ⬜ pending |
| Cleanup | Production files reverted; no spike remnants | shell | `git diff <start-sha> --stat -- spacetimedb/src/index.ts spacetimedb/src/schema/tables.ts` is empty; `git grep -il spike -- spacetimedb/src` is empty; `pnpm --dir spacetimedb test`; `spacetime list` shows no `uwr-spike` | ❌ W4 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

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
| Verdict confirmation before Phase 40 | SPIKE-04 | User decision (CONTEXT: "you confirm the verdict") | Claude presents the gate table and verdict. The user confirms it or overrides it with a reason |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
