---
phase: 33
slug: combat-improvements
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.1 |
| **Config file** | Inferred from spacetimedb/package.json "test" script |
| **Quick run command** | `cd spacetimedb && npm test` |
| **Full suite command** | `cd spacetimedb && npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd spacetimedb && npm test`
- **After every plan wave:** Run `cd spacetimedb && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 01 | 1 | COMB-01 | unit | `cd spacetimedb && npx vitest run src/helpers/combat.test.ts -t "DoT tick"` | Partially | ⬜ pending |
| 33-01-02 | 01 | 1 | COMB-02 | unit | `cd spacetimedb && npx vitest run src/helpers/combat.test.ts -t "HoT tick"` | Partially | ⬜ pending |
| 33-01-03 | 01 | 1 | COMB-03 | unit | `cd spacetimedb && npx vitest run src/helpers/combat.test.ts -t "buff application"` | No — Wave 0 | ⬜ pending |
| 33-01-04 | 01 | 1 | COMB-04 | unit | `cd spacetimedb && npx vitest run src/helpers/combat.test.ts -t "effect expiry"` | No — Wave 0 | ⬜ pending |
| 33-02-01 | 02 | 1 | COMB-05 | manual-only | N/A (Vue component, visual) | N/A | ⬜ pending |
| 33-03-01 | 03 | 2 | COMB-06 | unit | `cd spacetimedb && npx vitest run src/reducers/combat.test.ts -t "mid-combat pull"` | No — Wave 0 | ⬜ pending |
| 33-04-01 | 04 | 2 | COMB-07 | unit | `cd spacetimedb && npx vitest run src/data/combat_scaling.test.ts` | Yes | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] New test cases in `combat.test.ts` for DoT/HoT tick event message format (COMB-01, COMB-02)
- [ ] New test cases in `combat.test.ts` for buff/debuff application event emission (COMB-03)
- [ ] New test cases in `combat.test.ts` for effect expiry event enrichment (COMB-04)
- [ ] New test cases for mid-combat pull scenario (COMB-06)
- [ ] Updated test cases in `combat_scaling.test.ts` for balance constant changes (COMB-07)

*Existing infrastructure covers framework setup — only new test cases needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Enemy HUD effect tags render below HP bar with colors and countdown | COMB-05 | Vue component visual rendering | 1. Enter combat with DoT/HoT abilities 2. Verify colored tags appear below enemy HP 3. Verify countdown updates live 4. Verify own effects highlighted yellow and sorted first |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
