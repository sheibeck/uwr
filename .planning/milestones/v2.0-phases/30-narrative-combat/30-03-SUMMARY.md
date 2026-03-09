---
phase: 30-narrative-combat
plan: 03
subsystem: combat-ui
tags: [round-based, narrative-stream, combat-ui, vue, spacetimedb]

# Dependency graph
requires:
  - phase: 30-narrative-combat
    provides: CombatRound, CombatAction, CombatNarrative tables and submit_combat_action reducer
provides:
  - Round-based combat state in useCombat (currentRound, roundState, hasSubmittedAction, roundTimeRemaining)
  - Action submission functions (submitAction, submitAbility, submitAutoAttack, submitFlee)
  - Inline action prompt building with hotbar abilities, cooldown status, and target list
  - Round summary with textual HP bars and color coding
  - combat_narration/combat_prompt/combat_status event rendering in narrative stream
  - Context action bar hiding during active combat
affects: [30-04-integration-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Combat actions shown inline in narrative stream via [bracket] keyword click system"
    - "Round timer countdown via requestAnimationFrame loop"
    - "Textual HP bars with Unicode block chars and color-tagged markup"
    - "combat_narration kind triggers typewriter animation like other LLM content"

key-files:
  created: []
  modified:
    - src/composables/useCombat.ts
    - src/composables/useContextActions.ts
    - src/composables/data/useCombatData.ts
    - src/components/NarrativeMessage.vue
    - src/components/NarrativeConsole.vue
    - src/App.vue
  deleted:
    - src/components/CombatPanel.vue

key-decisions:
  - "CombatPanel deleted entirely -- all combat UI now lives in narrative stream"
  - "Context action bar returns empty array during active combat (abilities shown inline)"
  - "Round timer uses requestAnimationFrame for smooth countdown display"
  - "HP bars use 18-char width with Unicode block characters and color thresholds (green >50%, yellow 25-50%, red <25%)"
  - "combatNarratives table subscribed but rendering deferred to server-side event emission"

patterns-established:
  - "Combat event kinds: combat_narration (gold italic typewriter), combat_prompt (white clickable), combat_status (gray monospace)"
  - "Action prompt built as computed string with [bracket] keywords for click handling"

requirements-completed: [COMBAT-01, COMBAT-02]

# Metrics
duration: 8min
completed: 2026-03-08
---

# Phase 30 Plan 03: Narrative Combat UI Summary

**Inline narrative combat UI replacing CombatPanel with round-based action prompts, textual HP bars, and combat_narration typewriter rendering in the story stream**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-08T02:01:12Z
- **Completed:** 2026-03-08T02:09:46Z
- **Tasks:** 2
- **Files modified:** 10 (+ 1 deleted)

## Accomplishments
- Rewrote useCombat.ts with round-based state tracking (currentRound, roundState, hasSubmittedAction, roundTimeRemaining)
- Added action submission functions that call submit_combat_action reducer with object syntax
- Built inline action prompt with hotbar abilities (cooldown-aware), auto-attack, flee, and target list
- Built round summary with textual HP bars using Unicode block characters and color-coded thresholds
- Added combat_narration, combat_prompt, combat_status event kinds to NarrativeMessage rendering
- Deleted CombatPanel.vue and all references -- combat UI entirely in narrative stream
- Hidden context action bar during active combat
- Regenerated client bindings for CombatRound, CombatAction, CombatNarrative tables

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite useCombat for round-based state and action submission** - `54460f3` (feat)
2. **Task 2: Update narrative components for combat events and delete CombatPanel** - `aa03684` (feat)

## Files Created/Modified
- `src/composables/useCombat.ts` - Added round-based state, action submission, prompt/summary building
- `src/composables/useContextActions.ts` - Returns empty actions during active combat
- `src/composables/data/useCombatData.ts` - Added CombatRound, CombatAction, CombatNarrative subscriptions
- `src/components/NarrativeMessage.vue` - Added combat event KIND_COLORS, isNarrative includes combat_narration, monospace for combat_status
- `src/components/NarrativeConsole.vue` - Added combat_narration to typewriter animation trigger list
- `src/App.vue` - Removed CombatPanel, added round-based state destructuring, passed new tables to useCombat
- `src/components/CombatPanel.vue` - DELETED
- `src/module_bindings/combat_round_table.ts` - Generated binding
- `src/module_bindings/combat_action_table.ts` - Generated binding
- `src/module_bindings/combat_narrative_table.ts` - Generated binding
- `src/module_bindings/submit_combat_action_reducer.ts` - Generated binding

## Decisions Made
- CombatPanel deleted entirely rather than hidden -- clean break to narrative-only combat UI
- Context action bar returns empty array during combat instead of combat-specific actions (abilities shown inline via bracket keywords)
- Round timer uses requestAnimationFrame for smooth countdown without setInterval
- HP bars use 18-char Unicode block characters with green/yellow/red color thresholds via existing color tag system
- combatNarratives table subscribed in useCombatData but rendering handled via server event emission (combat_narration events sent to EventPrivate)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Regenerated client bindings for new round-based tables**
- **Found during:** Task 1
- **Issue:** CombatRound, CombatAction, CombatNarrative tables and submit_combat_action reducer had no client bindings
- **Fix:** Published module locally and ran spacetime generate to create bindings
- **Files modified:** src/module_bindings/ (4 new files + index.ts, types.ts, types/reducers.ts)
- **Verification:** TypeScript compilation passes
- **Committed in:** 54460f3 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed AbilityCooldown field access for cooldown remaining calculation**
- **Found during:** Task 1
- **Issue:** Used non-existent `expiresAtMicros` field; actual fields are `startedAtMicros` + `durationMicros`
- **Fix:** Changed to `startedAtMicros + durationMicros - nowMicros` for remaining calculation
- **Files modified:** src/composables/useCombat.ts
- **Verification:** TypeScript compilation passes
- **Committed in:** 54460f3 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both essential for functionality. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Client combat UI is fully narrative-based with inline action prompts and HP bars
- Round-based engine (Plan 01) + narrative UI (Plan 03) are wired together
- Plan 02 (LLM narration layer) will emit combat_narration events that render with gold typewriter styling
- Keyword click system handles combat action selection via existing bracket pattern

---
*Phase: 30-narrative-combat*
*Completed: 2026-03-08*
