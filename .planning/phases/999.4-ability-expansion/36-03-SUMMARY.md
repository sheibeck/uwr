---
phase: 36-ability-expansion
plan: 03
subsystem: combat-engine, ability-system, character-creation
tags: [ability-dispatch, pure-debuff, race-abilities, llm-prompts, tdd]
dependency_graph:
  requires: [36-01, 36-02]
  provides: [new-kind-dispatch, pure-debuff-fix, grantRaceAbility, expanded-llm-schema]
  affects: [combat resolution, character creation, skill generation]
tech_stack:
  added: []
  patterns: [TDD-red-green, if-else-dispatch, pure-function-extraction]
key_files:
  created:
    - spacetimedb/src/helpers/race_ability.test.ts
    - spacetimedb/src/helpers/skill_gen.test.ts
  modified:
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/helpers/combat.test.ts
    - spacetimedb/src/helpers/character.ts
    - spacetimedb/src/data/llm_prompts.ts
    - spacetimedb/src/reducers/creation.ts
    - spacetimedb/src/index.ts
decisions:
  - "fear kind requires combatId — throws SenderError outside combat (consistent with cc, taunt)"
  - "song/aura: aura always targets self; song can target all_party if targetRule matches"
  - "bandage/potion use HEALING_POWER_SCALER for consistent heal scaling with heal/hot"
  - "grantRaceAbility injected via reducerDeps pattern — avoids circular imports with creation.ts"
  - "LLM-generated custom races get no race ability — only RACE_DATA entries qualify"
  - "Pre-existing TS error at combat.ts:241 (dead code regen check inside dot block) is out of scope"
metrics:
  duration: ~9 minutes
  completed_date: 2026-03-10
  tasks_completed: 2
  files_changed: 8
---

# Phase 36 Plan 03: New Ability Kinds Dispatch and Race Abilities Summary

Full dispatch coverage for 12 new ability kinds in resolveAbility, pure debuff fix (value1=0n skips damage), expanded LLM skill generation schema with all 27 kinds, and grantRaceAbility wired into character creation.

## What Was Built

### Task 1: Add dispatch cases for new ability kinds and fix pure buff/debuff (TDD)

**combat.ts** - Added 12 new dispatch handlers in resolveAbility:

| Kind | Behavior |
|------|----------|
| `song` | Long-duration buff to self (or party if all_party targetRule), default 180s duration |
| `aura` | Long-duration buff to self, default 180s duration |
| `fear` | Applies stun/flee effect to enemy — requires combatId |
| `group_heal` | Heals all party members at caster's location using HEALING_POWER_SCALER |
| `bandage` | Self-heal without combat restriction + optional buff effect |
| `potion` | Self-heal without combat restriction + optional buff effect |
| `travel` | Applies travel buff to self, no combat restriction |
| `craft_boost` | Applies loot_bonus (or custom) effect to self |
| `gather_boost` | Applies loot_bonus (or custom) effect to self |
| `food_summon` | Placeholder — logs "You conjure sustenance", applies optional buff |
| `resurrect` | Placeholder — logs message, full mechanics deferred |
| `pet_command` | Placeholder — logs message, full pet system deferred |

**Pure debuff fix:**
```typescript
const isPureDebuff = ability.value1 === 0n;
const directDamage = isPureDebuff ? 0n : (power * 75n) / 100n;
```
- Pure debuffs (value1=0) apply effect without damage
- Existing debuffs with value1 > 0 still deal 75% direct damage (backward compat)

**combat.test.ts** - Added 15 new tests:
- 11 tests for each new ability kind dispatch path
- 2 tests for pure buff (no damage) and pure debuff (no damage)
- 1 test confirming debuff with value1>0 still deals damage

### Task 2: Expand LLM schema and grant race abilities at creation (TDD)

**character.ts** - New `grantRaceAbility` function:
- Takes ctx, character, raceData
- Checks RACE_DATA for known races (skips LLM-generated custom races)
- Idempotent: checks existing ability_template by abilityKey before inserting
- Inserts with source='Race', isGenerated=false, resourceType='none', resourceCost=0n

**llm_prompts.ts** - SKILL_GENERATION_SCHEMA updated in 3 places:
1. Kind string literal in schema template
2. buildSkillGenResponseFormat() enum array
3. "Valid Enum Values" section in system prompt

**creation.ts** - `finalizeCharacter` now calls `grantRaceAbility`:
```typescript
const raceAbilityData = RACE_DATA?.find((r: any) => r.name === characterRace);
if (raceAbilityData && grantRaceAbility) {
  grantRaceAbility(ctx, character, raceAbilityData);
}
```

**index.ts** - Added `grantRaceAbility` to imports and reducerDeps

**race_ability.test.ts** - 6 tests:
- Correct insertion (source=Race, abilityKey, characterId, kind)
- Hot kind (Troll Regeneration)
- Idempotency (no duplicate on re-call)
- Skip custom races not in RACE_DATA
- Correct resource type/cost (none, 0n)
- Correct cooldown from race data (300n)

**skill_gen.test.ts** - 12 tests (one per new kind):
- Confirms each new kind is preserved through parseSkillGenResult without defaulting to 'damage'

## Verification

- `npm test -- combat.test`: 74/74 tests passing
- `npm test -- race_ability`: 6/6 tests passing
- `npm test -- skill_gen`: 12/12 tests passing
- grep "kind === 'song'" in combat.ts: line 930
- grep "kind === 'fear'" in combat.ts: line 953
- grep "isPureDebuff" in combat.ts: line 685
- grep "grantRaceAbility" in character.ts: line 229
- TypeScript: no new errors in modified files (pre-existing error at combat.ts:241 is pre-existing dead code)

## Deviations from Plan

None - plan executed exactly as written.

## Commits

- `ff78db0` — feat(36-03): add dispatch for 12 new ability kinds and fix pure debuff
- `102c5aa` — feat(36-03): expand LLM skill schema, add grantRaceAbility, wire into creation

## Self-Check: PASSED
