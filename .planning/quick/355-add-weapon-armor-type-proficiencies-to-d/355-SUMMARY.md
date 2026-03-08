---
phase: quick-355
plan: 01
subsystem: character-creation, equipment
tags: [proficiency, weapons, armor, equip, llm-generation]
dependency_graph:
  requires: [mechanical_vocabulary, character-creation-pipeline]
  provides: [weapon-proficiency-enforcement, armor-proficiency-enforcement]
  affects: [equip_item, character-creation, class-reveal]
tech_stack:
  patterns: [comma-separated-string-proficiencies, archetype-fallback-defaults]
key_files:
  created: []
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/data/llm_prompts.ts
    - spacetimedb/src/reducers/creation.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/index.ts
decisions:
  - Proficiencies stored as comma-separated strings (optional fields for backward compat)
  - Archetype fallback defaults: warrior gets melee+heavy, mystic gets magic+light
  - Undefined proficiencies = allow all (existing characters unaffected)
metrics:
  duration: 2min
  completed: "2026-03-08T16:43:06Z"
---

# Quick 355: Add Weapon/Armor Type Proficiencies to Dynamic Class Creation

Weapon and armor proficiencies added to LLM class generation pipeline, stored on Character table, and enforced during equip_item.

## Task Summary

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add proficiency fields to schema and update LLM prompts | cfb7a09 | tables.ts, llm_prompts.ts |
| 2 | Store proficiencies on creation and enforce on equip | a3dc5f9 | creation.ts, items.ts, index.ts |

## What Changed

### Schema (tables.ts)
- Added `weaponProficiencies: t.string().optional()` and `armorProficiencies: t.string().optional()` to Character table
- Optional fields ensure existing characters are unaffected (undefined = allow all)

### LLM Prompts (llm_prompts.ts)
- Replaced single `armorProficiency` string with `weaponProficiencies` and `armorProficiencies` arrays in both CLASS_GENERATION_SCHEMA and COMBINED_CREATION_SCHEMA
- Added proficiency guidance to both buildClassGenerationUserPrompt and buildCombinedCreationUserPrompt

### Character Creation (creation.ts)
- Parse weaponProficiencies/armorProficiencies arrays from LLM classStats JSON, convert to comma-separated strings
- Archetype fallbacks: warrior = sword,axe,mace,greatsword,dagger + leather,chain,plate; mystic = staff,wand,dagger + cloth,leather

### Equipment Enforcement (items.ts)
- Weapon proficiency check on mainHand/offHand slots: validates template.weaponType against character.weaponProficiencies
- Armor proficiency check on armor slots: validates template.armorType against character.armorProficiencies
- Backward compatible: undefined proficiencies skip the check

### Class Reveal (index.ts)
- Display weaponProficiencies and armorProficiencies in the class reveal message shown to the player

## Deviations from Plan

None - plan executed exactly as written.

## Notes

- Requires `--clear-database` publish due to schema change (new columns on Character table)
- Shield is in ARMOR_TYPES but not included in LLM prompt armor options (shield is an offHand equip, not body armor)
