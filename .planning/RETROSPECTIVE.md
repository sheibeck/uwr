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

## Milestone: v2.2 — LLM — Claude Engine

**Shipped:** 2026-10-05 (override closeout)
**Phases:** 6 (39-44) | **Plans:** 71

### What Was Built
- A spike that measured scheduled SpacetimeDB procedures calling Claude on maincloud and chose that executor (go: dispatch p95 3 ms, 0 failures, 8 in flight)
- One tested Claude layer (Keeper Bible, route layers, request builder, private job tables, retry by failure class, apply keyed on the player)
- Every LLM domain cut over server-side, the browser proxy and client-trusted result reducer deleted, and a bundle guard against credentials
- A global daily ceiling, kill switch and /llm console; measured tuning and staged world and class reveals
- Live verification tooling: a 27-item golden set with mechanical rules, 364 offline drills plus 4 live drills, scratch-database harnesses and Console reconciliation math

### What Worked
- Spike first: measuring on maincloud before building settled the executor question with evidence, not opinion
- Dry-by-default harnesses with explicit cost checkpoints: every paid run (spike, sweep, golden, drills) stayed far under its cap and only ran on the owner's approval
- A separate scratch database (uwr-verify) kept the owner's key, ceiling and characters untouched during live work
- Mutation and boundary tests on every rule proved each check could fail, so green meant something
- Sequential executors on the main tree with --maxWorkers=1 kept a memory-constrained host stable

### What Was Inefficient
- Live verification was deferred three times (41, 43, 44), so the milestone closed with QUAL-01 and QUAL-02 open
- The golden set exposed a prompt contract gap (route prompts never state numeric budgets; the server clamps 20 values silently) that earlier phases could have caught
- A hard-drive failure interrupted Phase 44 mid-plan; an emergency WIP commit saved the work but needed a careful resume
- milestone.complete dumped raw SUMMARY lines (including deviation notes) as accomplishments

### Patterns Established
- Cost checkpoint before every live call, with defer or decline recorded and never reported as passed
- Owner review pages published as private artifacts with a db capability, read back as untrusted data
- Response-shape and voice decisions belong with the UX design, not with the prompt layer

### Key Lessons
1. State the server's numeric budgets in generation prompts, or the model guesses and the server silently rewrites its output
2. Tone is a product decision: the owner wants the Keeper in the first person, reading like a book; capture voice targets before writing the Bible
3. Schedule live verification as its own small, early checkpoint; deferring it to the last phase lets it slide out of the milestone

### Cost Observations
- Model mix: opus (orchestrator, planner), sonnet (executors, verifier); in-game Claude Sonnet 5.5
- Paid Claude spend this milestone: about $3.3 across spike, sweep and golden runs, all owner-approved
- Notable: the 27-call golden run cost $0.26 against a $0.57 worst-case bound

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~30 | 23 | Established GSD workflow, phase/plan pattern |
| v2.0 | ~10 | 7 | Heavy quick task usage (60), LLM integration patterns |
| v2.1 | n/a | 3 (+5 parked) | Test-first cleanup, wave-based platform upgrade, Backlog parking |
| v2.2 | n/a | 6 | Spike-first decision, cost-checkpointed live runs, owner review artifacts |

### Top Lessons (Verified Across Milestones)

1. Quick tasks handle polish and bug fixes more efficiently than full phases
2. Clean breaks from legacy systems avoid migration debt
3. Data-driven patterns (config tables, dispatch maps) scale better than hardcoded switches
4. Tests before large removals or upgrades make them safe (v2.1 Phases 31 → 32/38)
5. SUMMARY.md one_liner fields must be filled in for milestone tooling (v2.0, v2.1, v2.2)
6. Live verification slides when it is left to the end; schedule it early and small (v2.1, v2.2)
