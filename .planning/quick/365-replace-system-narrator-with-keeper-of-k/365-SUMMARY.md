---
phase: quick-365
plan: 01
subsystem: narrator-identity
tags: [narrator, lore, ui, prompts]
dependency_graph:
  requires: []
  provides: [keeper-narrator-identity, naming-diversity-prompts]
  affects: [llm-prompts, world-gen, combat-narration, creation-flow, client-ui]
tech_stack:
  added: []
  patterns: [two-voice-narrator]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/llm_prompts.ts
    - spacetimedb/src/data/world_gen.ts
    - spacetimedb/src/helpers/combat_narration.ts
    - spacetimedb/src/reducers/creation.ts
    - spacetimedb/src/reducers/commands.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/intent.ts
    - spacetimedb/src/reducers/movement.ts
    - spacetimedb/src/reducers/npc_interaction.ts
    - spacetimedb/src/reducers/llm.ts
    - spacetimedb/src/index.ts
    - src/App.vue
    - src/components/NarrativeConsole.vue
    - src/components/NarrativeMessage.vue
decisions:
  - Two-voice narrator split -- The Keeper for commentary/guidance, the world for ambient/environmental
  - The Keeper of Knowledge for formal/first references, The Keeper for short quips
  - Naming diversity instructions added to world generation prompts
metrics:
  duration: 3min
  completed: "2026-03-08"
---

# Quick 365: Replace System Narrator with Keeper of Knowledge Summary

Replaced all player-visible "The System" references with two distinct in-world voices: "The Keeper of Knowledge" (sardonic commentary/guidance) and "the world" (ambient/environmental presence), plus added naming diversity instructions to world generation prompts.

## Task Summary

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace in LLM prompts, world gen, combat narration | a23309f | llm_prompts.ts, world_gen.ts, combat_narration.ts |
| 2 | Replace in all reducers and client files | 43d05bd | creation.ts, commands.ts, combat.ts, intent.ts, movement.ts, npc_interaction.ts, llm.ts, index.ts, App.vue, NarrativeConsole.vue, NarrativeMessage.vue |

## Key Changes

- NARRATOR_PREAMBLE identifies as "The Keeper of Knowledge" with "the world exists because you remember it"
- World generation prompt includes naming diversity rules (avoid Verge, Veil, Ashen, etc.)
- Discovery templates use Keeper voice instead of System
- Combat intro: "The world grows still around you." (ambient voice)
- Combat skip: "The Keeper of Knowledge has lost interest in your skirmish." (commentary voice)
- Creation greeting: "I am The Keeper of Knowledge"
- All reducer commentary uses "The Keeper" for guidance/quips
- Environmental messages (reality rippling) use "the world" voice
- App.vue combat UI gate string matches combat_narration.ts exactly
- Zero "The System" references remain in any .ts or .vue file

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

Full project-wide grep confirms zero occurrences of "The System" in any .ts or .vue file.
