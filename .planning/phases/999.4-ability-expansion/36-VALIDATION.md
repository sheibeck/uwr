---
phase: 36
slug: ability-expansion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.1 |
| **Config file** | `spacetimedb/package.json` scripts.test |
| **Quick run command** | `cd spacetimedb && npm test` |
| **Full suite command** | `cd spacetimedb && npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd spacetimedb && npm test`
- **After every plan wave:** Run `cd spacetimedb && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | ABIL-01 | unit | `cd spacetimedb && npm test -- mechanical_vocabulary` | ❌ W0 | ⬜ pending |
| 36-01-02 | 01 | 1 | ABIL-02 | unit | `cd spacetimedb && npm test -- combat.test` | ✅ add cases | ⬜ pending |
| 36-01-03 | 01 | 1 | ABIL-03 | unit | `cd spacetimedb && npm test -- skill_gen` | ❌ W0 | ⬜ pending |
| 36-02-01 | 02 | 1 | ABIL-05 | unit | `cd spacetimedb && npm test -- combat.test` | ✅ add cases | ⬜ pending |
| 36-02-02 | 02 | 1 | ABIL-06 | unit | `cd spacetimedb && npm test -- race_ability` | ❌ W0 | ⬜ pending |
| 36-02-03 | 02 | 1 | ABIL-07 | unit | `cd spacetimedb && npm test -- combat_rewards` | ❌ W0 | ⬜ pending |
| 36-02-04 | 02 | 1 | ABIL-10 | unit | `cd spacetimedb && npm test -- ability_source` | ❌ W0 | ⬜ pending |
| 36-03-01 | 03 | 2 | ABIL-08 | unit | `cd spacetimedb && npm test -- renown` | ❌ W0 | ⬜ pending |
| 36-03-02 | 03 | 2 | ABIL-09 | unit | `cd spacetimedb && npm test -- renown` | ❌ W0 | ⬜ pending |
| 36-03-03 | 03 | 2 | ABIL-11 | unit | `cd spacetimedb && npm test -- llm_prompts` | ✅ add case | ⬜ pending |
| 36-04-01 | 04 | 2 | ABIL-04 | manual | N/A | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `spacetimedb/src/data/mechanical_vocabulary.test.ts` — stubs for ABIL-01 (validates ABILITY_KINDS contains all new entries)
- [ ] `spacetimedb/src/helpers/skill_gen.test.ts` — stubs for ABIL-03 (parseSkillGenResult handles new kinds)
- [ ] `spacetimedb/src/helpers/combat_rewards.test.ts` — stubs for ABIL-07 (computeRacialAtLevelFromRow every level)
- [ ] `spacetimedb/src/helpers/race_ability.test.ts` — stubs for ABIL-06 (grantRaceAbility inserts correct row)
- [ ] `spacetimedb/src/reducers/renown.test.ts` — stubs for ABIL-08, ABIL-09 (pending_renown_perk + choose_renown_perk)
- [ ] Add cases to `spacetimedb/src/helpers/combat.test.ts` — ABIL-02 (new kind dispatch), ABIL-05 (pure buff/debuff), ABIL-10 (source field)
- [ ] Add case to `spacetimedb/src/data/llm_prompts.test.ts` — ABIL-11 (buildRenownPerkSystemPrompt)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Client ability dispatch renders new kinds | ABIL-04 | Client rendering requires visual verification | Cast each new ability kind, verify UI shows cast animation and effect |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
