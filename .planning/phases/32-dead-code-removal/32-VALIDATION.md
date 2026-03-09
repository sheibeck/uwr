---
phase: 32
slug: dead-code-removal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.1 |
| **Config file** | spacetimedb/package.json (script) |
| **Quick run command** | `cd spacetimedb && npm test` |
| **Full suite command** | `cd spacetimedb && npm test && npx spacetime build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd spacetimedb && npm test`
- **After every plan wave:** Run `cd spacetimedb && npm test && npx spacetime build`
- **Before `/gsd:verify-work`:** Full suite + frontend build must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | CLEAN-02 | unit | `cd spacetimedb && npx vitest run` | Wave 0 | ⬜ pending |
| 32-01-02 | 01 | 1 | CLEAN-01 | build | `cd spacetimedb && npx spacetime build` | N/A | ⬜ pending |
| 32-02-01 | 02 | 1 | CLEAN-03 | unit | `cd spacetimedb && npx vitest run` | Existing | ⬜ pending |
| 32-02-02 | 02 | 1 | CLEAN-04 | build | `npm run build` | N/A | ⬜ pending |
| 32-02-03 | 02 | 1 | CLEAN-05 | build | `cd spacetimedb && npx spacetime build` | N/A | ⬜ pending |
| 32-02-04 | 02 | 1 | CLEAN-06 | build | `cd spacetimedb && npx spacetime build && npm run build` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Update existing test mocks in `helpers/items.test.ts` for relocated `STARTER_WEAPON_DEFS` path
- [ ] Update existing test mocks in `helpers/world_gen.test.ts` for relocated `computeRegionDanger` path
- [ ] Existing Phase 31 tests serve as regression guards — no new test files needed

*Existing infrastructure covers most phase requirements. Wave 0 is mock-path updates only.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Frontend panels visually removed | CLEAN-04 | Visual regression | Load app, verify no legacy panels render |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
