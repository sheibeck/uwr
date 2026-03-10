---
phase: 34
slug: narrative-ui-integration
status: draft
nyquist_compliant: true
wave_0_complete: true
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
| **Client test command** | `cd C:/projects/uwr && npx vitest run src/composables/useHotbar.test.ts --reporter=verbose` |
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
| 34-01-01 | 01 | 1 | NARR-01, NARR-02 | unit | `npx vitest run src/reducers/intent.test.ts` | tdd inline | pending |
| 34-01-02 | 01 | 1 | NARR-05 | unit | `npx vitest run src/components/NarrativeMessage.test.ts` | tdd inline | pending |
| 34-02-01 | 02 | 2 | NARR-04 | unit | `npx vitest run src/reducers/items.test.ts` | tdd inline | pending |
| 34-03-01 | 03 | 3 | NARR-03 | unit | `npx vitest run src/composables/useHotbar.test.ts` | tdd inline | pending |
| 34-03-02 | 03 | 3 | NARR-03 | manual | visual inspection | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Tests are written inline via `tdd="true"` tasks in each plan. No separate Wave 0 stubs needed.

- `spacetimedb/src/reducers/intent.test.ts` — sell command tests (Plan 01 Task 1)
- `spacetimedb/src/reducers/items.test.ts` — hotbar reducer tests (Plan 02 Task 2)
- `src/components/NarrativeMessage.test.ts` — KIND_COLORS key assertions (Plan 01 Task 2)
- `src/composables/useHotbar.test.ts` — hotbar composable behavioral tests (Plan 03 Task 1)

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hotbar always visible | NARR-03 | UI layout | Verify hotbar renders outside combat |
| Arrow navigation between hotbars | NARR-03 | UI interaction | Click arrows, verify hotbar switches |
| Cooldown overlay rendering | NARR-03 | Visual CSS | Verify cooldown fill animates on slots |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or tdd inline tests
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covered by tdd inline tasks
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
