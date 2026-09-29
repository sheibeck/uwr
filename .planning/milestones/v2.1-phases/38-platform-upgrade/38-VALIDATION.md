---
phase: 38
slug: platform-upgrade
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-29
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (root 4.0.18 and `spacetimedb/` 3.2.x today; 5.x after the phase) |
| **Config file** | none in either package (defaults) |
| **Quick run command** | `pnpm exec vitest run` (root; collects root `src/` and `spacetimedb/src/` tests: 18 files, 509 tests) |
| **Full suite command** | `pnpm build && pnpm exec vitest run && pnpm --dir spacetimedb test` |
| **Estimated runtime** | ~60 seconds (full) / ~20 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec vitest run` (and `pnpm --dir spacetimedb test` for module bumps)
- **After every plan wave:** Run the full suite command plus `spacetime build -p spacetimedb`
- **Before `/gsd-verify-work`:** Full suite must be green (0 vue-tsc errors, 509/509 tests), llm-proxy smoke passes, local publish clean
- **Max feedback latency:** 60 seconds

---

## Baseline (recorded 2026-09-29, before any change)

| Check | Result |
|-------|--------|
| Root `vitest run` | 507/509 (2 failing: `buildLookOutput` in `spacetimedb/src/reducers/intent.test.ts`) |
| `spacetimedb/` `vitest run` | 476/478 (same 2) |
| Root `vue-tsc` (`pnpm build` step 1) | 137 errors, so `pnpm build` FAILS |
| Root `vite build` alone | passes |
| `spacetimedb/` `tsc --noEmit` | 233 errors (not a gate; `spacetime publish` bundles without tsc) |

---

## Per-Task Verification Map

*Populated by the planner and executor; see each PLAN.md `<verify>` block. Success-criterion map:*

| SC | Behavior | Test Type | Automated Command | File Exists | Status |
|----|----------|-----------|-------------------|-------------|--------|
| SC-1 | CLI and SDK on 2.10.x | smoke | `spacetime --version`; version check of `node_modules/spacetimedb/package.json` in root and `spacetimedb/` | n/a | ⬜ pending |
| SC-1 | bindings regenerated | script | `pnpm spacetime:generate && git diff --stat src/module_bindings` | n/a | ⬜ pending |
| SC-1 | publish without clear | integration | `spacetime publish uwr -p spacetimedb --server local --break-clients` exits 0 | n/a | ⬜ pending |
| SC-2 | connection error handling | manual + optional unit | review `src/main.ts`; unit test if a helper is extracted | W0 optional | ⬜ pending |
| SC-2 | scheduled order-independence | unit (optional) | vitest with `createMockDb` for scheduled reducers | W0 optional | ⬜ pending |
| SC-3 | tool versions | script | `pnpm ls --depth 0` per dir | n/a | ⬜ pending |
| SC-4 | `/api/llm` under `wrangler dev` | smoke | curl sequence (health 200, 401, 400, real call 200) | W0 optional `llm-proxy/scripts/smoke.sh` | ⬜ pending |
| SC-5 | pnpm only | script | `git ls-files \| grep package-lock` is empty; `pnpm install --frozen-lockfile` passes in each dir | n/a | ⬜ pending |
| SC-6 | build and tests green | full | full suite command | requires W0 fixes | ⬜ pending |
| SC-6 | game runs end to end | manual | human checkpoint | manual | ⬜ pending |
| SC-7 | CLAUDE.md/AGENTS.md rules | script | `grep -n "1.11\|BROKEN" CLAUDE.md AGENTS.md` returns nothing; `cmp CLAUDE.md AGENTS.md` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Fix the two failing `buildLookOutput` tests (`spacetimedb/src/reducers/intent.test.ts` lines 40 and 197)
- [ ] Reach 0 `vue-tsc` errors on the current toolchain (137 today), so `pnpm build` is green BEFORE bumping tooling
- [ ] Add root `"test": "vitest run"` script
- [ ] (optional) `llm-proxy/scripts/smoke.sh` codifying the curl sequence
- [ ] (optional) idempotency tests for scheduled reducers (`disconnect_logout`, `character_logout`, `tick_day_night`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Game runs end to end on 2.10 | SC-6 | Needs OIDC login and a live browser session | Start the local server, publish, run `pnpm dev`, log in, load or create a character, then `look`, move, and fight; confirm the panels backed by `my_*` views update |
| Real `/api/llm` success | SC-4 | Needs the real OpenAI key in `llm-proxy/.dev.vars` | `pnpm --dir llm-proxy dev`, then POST `/api/llm` with the proxy secret and expect 200 with content |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
