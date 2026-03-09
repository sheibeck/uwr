---
phase: 28-dynamic-skill-generation
plan: 03
subsystem: client
tags: [skill-generation, hotbar, abilityTemplateId, pending-skill, hud-indicator, keyword-click]

# Dependency graph
requires:
  - phase: 28-01
    provides: AbilityTemplate with characterId and vocabulary columns, HotbarSlot/AbilityCooldown/CharacterCast with abilityTemplateId, PendingSkill table
  - phase: 28-02
    provides: prepare_skill_gen reducer, choose_skill reducer, skill_gen LlmTask domain handler, level-up narrative hints
provides:
  - Regenerated client bindings with PendingSkill table, abilityTemplateId schema, and new reducers
  - useSkillChoice composable for watching pending skills and triggering generation
  - useHotbar fully migrated to abilityTemplateId (u64) from abilityKey (string)
  - NarrativeHud pending skill indicator
  - Keyword click routing for skill choice
  - pending_skill subscription in useCoreData
affects: [client-hotbar, client-combat-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [bigint-keyed-hotbar, skill-choice-keyword-routing]

key-files:
  created:
    - src/composables/useSkillChoice.ts
  modified:
    - src/module_bindings/ (regenerated)
    - src/composables/useHotbar.ts
    - src/composables/data/useCoreData.ts
    - src/composables/useContextActions.ts
    - src/composables/useTooltip.ts
    - src/components/NarrativeHud.vue
    - src/components/NarrativeConsole.vue
    - src/components/CharacterInfoPanel.vue
    - src/App.vue

key-decisions:
  - "All hotbar/cooldown/cast tracking uses bigint abilityTemplateId instead of string abilityKey"
  - "Item-on-hotbar support removed (incompatible with abilityTemplateId schema)"
  - "Keyword click handler checks pending skill names before routing to creation or intent"
  - "Kind-based combat state checks replace old combatState field (utility = out-of-combat)"

patterns-established:
  - "idKey(bigint) helper for stable Map keys from bigint abilityTemplateId"
  - "useSkillChoice auto-triggers requestSkillGen on level-up via character level watcher"

requirements-completed: [SKILL-01, SKILL-02]

# Metrics
duration: 12min
completed: 2026-03-07
---

# Phase 28 Plan 03: Client Skill Choice Integration Summary

**Client-side skill generation flow with useSkillChoice composable, hotbar migrated to abilityTemplateId, keyword-based skill selection, and HUD pending skill indicator**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-07T19:20:37Z
- **Completed:** 2026-03-07T19:33:00Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Complete client-side skill generation flow: level-up auto-triggers prepare_skill_gen, LLM proxy handles skill_gen domain, pending skills appear in narrative with clickable [bracket] names, choosing a skill calls choose_skill reducer
- Full useHotbar migration from string abilityKey to bigint abilityTemplateId across all composables and components
- NarrativeHud shows pulsing "NEW SKILL" indicator when pending skills exist
- All client composables (except useCombat enemy abilities which correctly retain abilityKey) are migrated

## Task Commits

Each task was committed atomically:

1. **Task 1: Regenerate bindings and create useSkillChoice composable** - `8a1e71e` (feat)
2. **Task 2: Update hotbar, combat composables, and add HUD indicator** - `892122a` (feat)

## Files Created/Modified
- `src/composables/useSkillChoice.ts` - Watches PendingSkill table, auto-triggers skill gen, provides chooseSkill/requestSkillGen
- `src/composables/useHotbar.ts` - Fully rewritten for abilityTemplateId (bigint) instead of abilityKey (string)
- `src/composables/data/useCoreData.ts` - Added pending_skill subscription and reactive data
- `src/composables/useContextActions.ts` - Updated HotbarSlotInfo type to abilityTemplateId
- `src/composables/useTooltip.ts` - Updated context menu and tooltip to use abilityTemplateId lookup
- `src/components/NarrativeHud.vue` - Added pending skill indicator with pulse animation
- `src/components/NarrativeConsole.vue` - Added hasPendingSkills prop passthrough
- `src/components/CharacterInfoPanel.vue` - Updated ability display and hotbar assignment to new schema
- `src/App.vue` - Wired useSkillChoice, keyword click routing, updated hotbar template
- `src/module_bindings/` - Regenerated with PendingSkill, abilityTemplateId schema, new reducers

## Decisions Made
- All hotbar/cooldown/cast tracking uses bigint abilityTemplateId with `idKey()` helper for Map keys
- Item-on-hotbar support removed since the server schema only accepts abilityTemplateId (u64), not the old `item:${id}` string pattern
- Keyword click handler checks pending skill names first, then falls through to creation or intent routing
- Kind-based combat state checks used instead of old combatState field (utility kind = out of combat only, server enforces)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated useTooltip.ts for new schema**
- **Found during:** Task 2
- **Issue:** useTooltip.ts referenced `slot.abilityKey` and `ability.resource` from old schema
- **Fix:** Updated to use `slot.abilityTemplateId` with string conversion for lookup and `ability.resourceType`
- **Files modified:** src/composables/useTooltip.ts
- **Committed in:** 892122a (Task 2 commit)

**2. [Rule 3 - Blocking] Updated useContextActions.ts for new schema**
- **Found during:** Task 2
- **Issue:** HotbarSlotInfo type used `abilityKey: string` and checked `slot.itemCount`
- **Fix:** Changed to `abilityTemplateId: bigint`, removed item slot references
- **Files modified:** src/composables/useContextActions.ts
- **Committed in:** 892122a (Task 2 commit)

**3. [Rule 3 - Blocking] Updated CharacterInfoPanel.vue for new AbilityTemplate schema**
- **Found during:** Task 2
- **Issue:** Template referenced `ability.key`, `ability.level`, `ability.resource` which no longer exist
- **Fix:** Changed to `ability.id`, `ability.levelRequired`, `ability.resourceType`; updated emit and context menu types
- **Files modified:** src/components/CharacterInfoPanel.vue
- **Committed in:** 892122a (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 3 - blocking)
**Impact on plan:** All auto-fixes necessary for compilation with the new abilityTemplateId schema. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full client-to-server skill generation flow is complete
- Level-up triggers skill gen, LLM generates 3 skills, player clicks to choose, skill added to ability_template and hotbar
- All pre-existing TypeScript errors are unrelated to this plan's changes

---
*Phase: 28-dynamic-skill-generation*
*Completed: 2026-03-07*

## Self-Check: PASSED
- useSkillChoice.ts: FOUND
- pending_skill_table.ts: FOUND
- prepare_skill_gen_reducer.ts: FOUND
- choose_skill_reducer.ts: FOUND
- Commit 8a1e71e (Task 1): FOUND
- Commit 892122a (Task 2): FOUND
