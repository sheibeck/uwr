---
phase: 31
slug: test-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 (declared ^3.2.1) |
| **Config file** | No vitest.config.ts — uses defaults with tsconfig.json |
| **Quick run command** | `cd spacetimedb && npx vitest run` |
| **Full suite command** | `cd spacetimedb && npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd spacetimedb && npx vitest run`
- **After every plan wave:** Run `cd spacetimedb && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 31-01-01 | 01 | 1 | TEST-01 | unit | `npx vitest run helpers/test-utils.test.ts` | ❌ W0 | ⬜ pending |
| 31-02-01 | 02 | 1 | TEST-02 | unit | `npx vitest run helpers/combat.test.ts` | ❌ W0 | ⬜ pending |
| 31-02-02 | 02 | 1 | TEST-02 | unit | `npx vitest run helpers/combat_enemies.test.ts` | ❌ W0 | ⬜ pending |
| 31-03-01 | 03 | 1 | TEST-03, TEST-05 | unit | `npx vitest run helpers/items.test.ts` | ❌ W0 | ⬜ pending |
| 31-04-01 | 04 | 1 | TEST-04 | unit | `npx vitest run reducers/intent.test.ts` | ✅ partial | ⬜ pending |
| 31-05-01 | 05 | 1 | TEST-06 | unit | `npx vitest run helpers/events.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `helpers/test-utils.ts` — shared mock DB utility (TEST-01)
- [ ] `helpers/combat.test.ts` — combat regression stubs (TEST-02)
- [ ] `helpers/combat_enemies.test.ts` — armor/variance test stubs (TEST-02)
- [ ] `helpers/items.test.ts` — inventory + equipment gen stubs (TEST-03, TEST-05)
- [ ] `helpers/events.test.ts` — event logging stubs (TEST-06)
- [ ] Refactor `helpers/world_gen.test.ts` to import from `test-utils.ts`
- [ ] Expand `reducers/intent.test.ts` to use shared mock + add routing tests (TEST-04)

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
