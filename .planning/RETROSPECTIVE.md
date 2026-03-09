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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~30 | 23 | Established GSD workflow, phase/plan pattern |
| v2.0 | ~10 | 7 | Heavy quick task usage (60), LLM integration patterns |

### Top Lessons (Verified Across Milestones)

1. Quick tasks handle polish and bug fixes more efficiently than full phases
2. Clean breaks from legacy systems avoid migration debt
3. Data-driven patterns (config tables, dispatch maps) scale better than hardcoded switches
