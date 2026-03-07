---
phase: 336-character-creation-ux-fixes
plan: 01
subsystem: character-creation
tags: [ux, llm-prompts, click-handler, creation-flow]
dependency_graph:
  requires: []
  provides: [click-to-select-creation, short-class-names, short-ability-names, go-back-hints, race-suggestions]
  affects: [spacetimedb-creation-reducers, llm-prompt-templates, client-click-handler]
tech_stack:
  added: []
  patterns: [clickable-keyword-suggestions, constrained-llm-naming]
key_files:
  created: []
  modified:
    - src/App.vue
    - spacetimedb/src/reducers/creation.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/data/llm_prompts.ts
decisions:
  - Go-back hint uses sardonic System voice consistent with narrator personality
  - Race suggestions use 7 diverse examples including both classic and invented races
  - Click handler adds return after submitCreationInput to prevent fall-through to game intent
metrics:
  duration: 4min
  completed: "2026-03-07"
---

# Quick Task 336: Character Creation UX Fixes Summary

Fixed 5 character creation UX issues: click-to-select with diagnostic logging and fall-through prevention, go-back hints at archetype and class steps, race suggestions with clickable keywords, and LLM prompt constraints for 1-2 word class names and 2-3 word ability names.

## Task Completion

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix click-to-select and add go-back hints + race suggestions | 3a20c0a | src/App.vue, spacetimedb/src/reducers/creation.ts, spacetimedb/src/index.ts |
| 2 | Constrain LLM prompts for shorter class and ability names | 9a308ce | spacetimedb/src/data/llm_prompts.ts |

## What Changed

### Click-to-Select (src/App.vue)
- Added diagnostic `console.log` to `clickNpcKeyword` handler tracing keyword, isInCreation state, and hasPendingSkills state
- Added `return` after `submitCreationInput(keyword)` to prevent the handler from falling through to the game intent branch during creation
- Code analysis confirmed the reactive chain (shallowRef -> computed -> handler closure) is structurally correct

### Go-Back Hints (spacetimedb/src/index.ts, spacetimedb/src/reducers/creation.ts)
- AWAITING_ARCHETYPE messages (both initial and resume) now include: "(If you're already regretting your choices, type "go back." The System does not judge... much.)"
- CLASS_REVEALED messages (both initial and resume) include the same hint
- AWAITING_RACE: no hint (first step, nowhere to go back)
- AWAITING_NAME: no hint (go-back not supported per determineGoBackTarget)

### Race Suggestions (spacetimedb/src/reducers/creation.ts)
- GREETING_MESSAGE now includes clickable race examples: [Elves], [Dwarves], [Goblins], [Dragonborn], [Shadelings], [Myconids], [Crystalborn]
- Resume message for AWAITING_RACE also includes race examples
- All race names are bracketed [keywords] making them clickable via the existing NarrativeMessage keyword renderer

### LLM Prompt Constraints (spacetimedb/src/data/llm_prompts.ts)
- CLASS_GENERATION_SCHEMA className: "1-2 words, no adjective phrases"
- COMBINED_CREATION_SCHEMA className: same constraint
- Both schemas' ability name field: "2-3 words max, punchy action name"
- SKILL_GENERATION_SCHEMA ability name: "2-3 words max"
- buildClassGenerationUserPrompt: explicit good/bad examples for class and ability names
- buildCombinedCreationUserPrompt: same constraints
- buildSkillGenSystemPrompt: replaced "Echoing Spite of the Hollow King" as good example with "Hollow Spite"
- buildCharacterCreationPrompt: updated system prompt class name guidance

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- Server TypeScript compiles (pre-existing errors in corpse.ts and location.ts are unrelated)
- GREETING_MESSAGE contains race suggestions with [bracketed] keywords
- Go-back hints present in archetype and class reveal messages (both initial and resume)
- LLM schemas specify word count limits for class and ability names
- All user prompt builder functions reference shorter name constraints
