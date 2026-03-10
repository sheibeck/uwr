---
phase: 34
slug: narrative-ui-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | spacetimedb/vitest.config.ts |
| **Quick run command** | `cd spacetimedb && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd spacetimedb && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd spacetimedb && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd spacetimedb && npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 34-01-01 | 01 | 1 | NARR-01 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 34-01-02 | 01 | 1 | NARR-02 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 34-02-01 | 02 | 1 | NARR-03 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 34-02-02 | 02 | 1 | NARR-04 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 34-03-01 | 03 | 1 | NARR-05 | manual | visual inspection | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `spacetimedb/tests/sell.test.ts` — stubs for NARR-01, NARR-02
- [ ] `spacetimedb/tests/hotbar.test.ts` — stubs for NARR-03, NARR-04

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Event feed color coding | NARR-05 | Visual CSS styling | Verify combat=red, reward=gold, system=gray, social=blue in browser |
| Hotbar always visible | NARR-03 | UI layout | Verify hotbar renders outside combat |
| Arrow navigation between hotbars | NARR-03 | UI interaction | Click arrows, verify hotbar switches |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
