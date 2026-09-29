# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v2.0 — The Living World

**Shipped:** 2026-03-09
**Phases:** 7 | **Plans:** 22 | **Quick Tasks:** 60

### What Was Built
- LLM pipeline with budget controls and graceful degradation (Anthropic Claude API via client proxy)
- Chat-first narrative UI replacing all traditional RPG panels
- Narrative character creation with freeform race, archetype, and LLM-generated class
- Procedural world generation triggered by player arrival with canonical world facts
- Dynamic skill generation (3 LLM skills per level-up, schema-validated, power-budgeted)
- NPC conversations with persistent memory/affinity and contextual quest generation
- Real-time combat with LLM intro narration and fully inline narrative UI

### What Worked
- Quick task system for rapid iteration: 60 quick tasks in 2 days polished the entire experience
- Data-driven ability dispatch (kind-based map) scales to unlimited generated abilities
- Clean break from legacy data avoided migration complexity entirely
- Client-side LLM proxy worked around SpacetimeDB procedure HTTP limitation cleanly
- Schema-constrained generation ensures mechanical validity of all generated content

### What Was Inefficient
- Round-based combat experiment (quick tasks 342-348): built full round-based system, then reverted to real-time. Wasted ~6 quick tasks
- LLM combat narration built and then removed (quick tasks 349-381): per-round narration too slow/expensive, replaced with static intro + mechanical summaries
- Progress table in ROADMAP.md not kept up to date (showed 0/3 for phases that were complete)
- SUMMARY.md files lacked one_liner field causing extraction failure during milestone completion

### Patterns Established
- LLM proxy pattern: reducer creates LlmTask -> client watches -> calls proxy -> submits result via reducer
- Keeper of Knowledge narrator voice across all generated content
- Kind-based dispatch for extensible ability resolution
- Bracket keyword `[name]` for clickable inline actions in narrative
- gpt-5-mini for fast interactive generation, Haiku for bulk generation

### Key Lessons
1. **Try real-time first for interactive systems** — round-based combat felt sluggish. Real-time with narrative overlays works better for this game
2. **LLM narration per-action is too expensive** — consolidate to intro/summary narration, use mechanical summaries for individual actions
3. **Quick tasks are the best polish tool** — 60 tasks in 2 days covered more UX ground than a full phase would have
4. **Schema-constrain LLM output** — don't trust LLM to generate valid game mechanics without explicit validation
5. **Keep SUMMARY.md fields consistent** — missing one_liner fields broke tooling during milestone completion

### Cost Observations
- Model mix: mostly sonnet (executor), opus (planner), haiku/gpt-5-mini (in-game generation)
- Sessions: ~10 across 3 days
- Notable: gpt-5-mini sufficient for NPC conversations and combat narration, saving significant cost vs Sonnet

---

## Milestone: v2.1 — Project Cleanup

**Shipped:** 2026-09-29
**Phases:** 3 (31, 32, 38) | **Plans:** 14 | **Quick tasks:** 392-405

### What Was Built
- A shared proxy-based mock DB, 101 combat regression tests, and 130 inventory, equipment-gen and intent-routing tests
- A v1.0 legacy purge: mechanical rules extracted, 11 legacy backend files, 9 orphaned Vue components and 1,916 lines of dead frontend code deleted
- A platform upgrade to SpacetimeDB 2.10.1, TS 6, Vite 8, Vitest 5 and pnpm-only, with 990 tests green
- Work inside phases 33, 34 and 36 before they were parked: combat log and pull fixes, sell commands and hotbars, ability expansion, race abilities and renown perks

### What Worked
- Test infrastructure first (Phase 31) made the dead-code purge (Phase 32) and the platform upgrade (Phase 38) safe to run
- Phase 38 upgraded in waves, one layer at a time (types clean, then SpacetimeDB, then Vitest, then proxy, then root toolchain). Almost no code changes were needed.
- Parking phases 33-37 in the Backlog kept requirements and history intact while the core concepts are rethought

### What Was Inefficient
- The milestone ran about 6.5 months from start to close. Phases 33-37 stalled partway, which left 11 requirements pending at close.
- No formal milestone audit was run before closing
- The OpenAI account ran out of credits, which blocked live LLM verification at the end of Phase 38
- Docs drifted: PROJECT.md claimed "Anthropic Claude API" while the code called OpenAI

### Patterns Established
- Backlog 999.x phases for parked work, promoted later with /gsd-review-backlog
- Skip backups for greenfield migrations (user preference)
- A consolidated success-criteria gate plus human end-to-end verification as the last plan of a large phase

### Key Lessons
1. Keep SUMMARY.md `one_liner` fields filled in. Phase 38 summaries lacked them, and milestone tooling produced a bogus accomplishment. This is a repeat of the v2.0 lesson.
2. Check the docs against the code at milestone boundaries (the provider mismatch lasted a whole milestone)
3. Close milestones promptly. A milestone left open for months collects scope that gets parked instead of shipped.

### Cost Observations
- Model mix: opus (planner), sonnet (executor/verifier); in-game LLM on gpt-5.4 and gpt-5-mini until credits ran out
- Sessions: not tracked
- Notable: the next milestone moves in-game generation to Claude Sonnet 5.5 and Haiku 4.5

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~30 | 23 | Established GSD workflow, phase/plan pattern |
| v2.0 | ~10 | 7 | Heavy quick task usage (60), LLM integration patterns |
| v2.1 | n/a | 3 (+5 parked) | Test-first cleanup, wave-based platform upgrade, Backlog parking |

### Top Lessons (Verified Across Milestones)

1. Quick tasks handle polish and bug fixes more efficiently than full phases
2. Clean breaks from legacy systems avoid migration debt
3. Data-driven patterns (config tables, dispatch maps) scale better than hardcoded switches
4. Tests before large removals or upgrades make them safe (v2.1 Phases 31 → 32/38)
5. SUMMARY.md one_liner fields must be filled in for milestone tooling (v2.0, v2.1)
