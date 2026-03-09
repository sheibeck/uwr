---
phase: 30
slug: narrative-combat
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual testing (no automated test infrastructure) |
| **Config file** | none |
| **Quick run command** | `spacetime publish uwr -p spacetimedb` + manual playtest |
| **Full suite command** | Full combat flow: start -> action select -> resolve -> narration -> victory/defeat |
| **Estimated runtime** | ~60 seconds (publish + manual test) |

---

## Sampling Rate

- **After every task commit:** Run `spacetime publish uwr -p spacetimedb` + manual playtest
- **After every plan wave:** Full combat flow test (start -> action select -> resolve -> narration -> victory/defeat)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 1 | COMBAT-01 | manual | `spacetime publish uwr -p spacetimedb` + play combat | N/A | pending |
| 30-01-02 | 01 | 1 | COMBAT-02 | manual | Observe mechanical vs narration timing | N/A | pending |
| 30-02-01 | 02 | 2 | COMBAT-01 | manual | Trigger LLM narration during combat | N/A | pending |
| 30-02-02 | 02 | 2 | COMBAT-03 | manual | Read narration output for sardonic voice | N/A | pending |
| 30-03-01 | 03 | 3 | COMBAT-02 | manual | Verify narrative stream combat UI | N/A | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. No automated test framework to set up.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Round resolution triggers LLM narration | COMBAT-01 | No test framework; requires full game loop | Publish, enter combat, complete rounds, verify narration appears |
| Mechanical messages instant, narration async | COMBAT-02 | Timing observation required | Watch combat events -- damage should appear immediately, narration after delay |
| Sardonic narrator voice | COMBAT-03 | Subjective quality check | Read LLM narration output, confirm sardonic tone matches System voice |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
