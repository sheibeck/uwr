---
status: resolved
phase: 33-combat-improvements
source: [33-01-SUMMARY.md, 33-02-SUMMARY.md]
started: 2026-03-09T23:45:00Z
updated: 2026-03-10T01:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. DoT Tick Narrative Messages
expected: Enter combat and get hit by an enemy that applies a DoT effect. On subsequent rounds, the combat log should show narrative messages like "You suffer X damage from [ability name]" with the correct ability name.
result: issue
reported: "My dot casts, but I don't see any of the ticks of it go off in the combat log. I also still don't see any indicator in the enemy hud at the bottom of the screen."
severity: major

### 2. HoT Tick Narrative Messages
expected: Use or receive a heal-over-time ability. On subsequent rounds, the combat log should show narrative messages like "[Ability] soothes you for X HP" with the ability name.
result: issue
reported: "Rot Ward is tagged as heal (HoT) but deals damage to the enemy instead of healing. No HoT ticks appear in combat log. No HoT indicator on character in group window."
severity: major

### 3. Buff/Debuff Application Events
expected: When a buff or debuff is applied (from an ability), the combat log shows an event with stat name, magnitude, and duration info (e.g., "+5 Strength for 3 rounds").
result: issue
reported: "No indication that buffs/debuffs/hots/dots are doing anything"
severity: major

### 4. Buff/Debuff Color Coding
expected: In the combat log, buff events appear in blue (#74c0fc) and debuff events appear in orange (#ffa94d), visually distinct from damage (red) and heal (green) messages.
result: issue
reported: "Nothing in the combat log at all for dots/hots/buffs/debuffs"
severity: major

### 5. Ability Damage Reduced (Longer Fights)
expected: Ability damage should be noticeably lower than before — roughly halved compared to previous values. Fights should last longer as a result. Auto-attacks should be unaffected.
result: pass

### 6. Mana Abilities Cost More
expected: Mana-based abilities should cost 50% more mana than before. Check an ability's mana cost — it should be higher than the base formula would suggest.
result: pass

### 7. Mana Abilities Have Minimum 1s Cast Time
expected: Any mana-based ability should have at least a 1-second cast time. Even if the ability was previously instant, the cast bar should show at least 1 second.
result: pass

### 8. Any Group Member Can Pull
expected: In a group, any member (not just the designated puller) should be able to initiate combat by pulling an enemy. No "must be puller" error message.
result: skipped
reason: Unable to log into second account or find another character to group with

### 9. Mid-Combat Enemy Pulling
expected: While already in combat, a group member pulls another enemy. Instead of getting "Already in combat" error, the new enemy is added to the existing fight. A message appears in the combat feed about the new enemy joining.
result: issue
reported: "Clicking on another enemy in the narrative just tries to target selected enemy instead of allowing me to pull it."
severity: major

## Summary

total: 9
passed: 3
issues: 5
pending: 0
skipped: 1

## Gaps

- truth: "DoT ticks should appear in combat log with narrative messages like 'You suffer X damage from [ability name]'"
  status: resolved
  reason: "User reported: My dot casts, but I don't see any of the ticks of it go off in the combat log. I also still don't see any indicator in the enemy hud at the bottom of the screen."
  severity: major
  test: 1
  root_cause: "CREATION_ABILITY_SCHEMA uses field 'effect' but creation.ts reads 'chosen.kind || chosen.type || damage' — never reads 'chosen.effect'. All creation abilities stored as kind:'damage', so DoT effects are never created and no ticks fire."
  artifacts:
    - path: "spacetimedb/src/data/llm_prompts.ts"
      issue: "CREATION_ABILITY_SCHEMA uses 'effect' field instead of 'kind'"
    - path: "spacetimedb/src/reducers/creation.ts"
      issue: "Line 216 reads chosen.kind which is undefined from LLM output, falls back to 'damage'"
  missing:
    - "Align CREATION_ABILITY_SCHEMA field names with SKILL_GENERATION_SCHEMA (use 'kind' not 'effect')"
  debug_session: ".planning/debug/effect-system-combat-log.md"

- truth: "HoT ability should heal the caster/ally and show tick messages in combat log"
  status: resolved
  reason: "User reported: Rot Ward is tagged as heal (HoT) but deals damage to the enemy instead of healing. No HoT ticks appear in combat log. No HoT indicator on character in group window."
  severity: major
  test: 2
  root_cause: "Same CREATION_ABILITY_SCHEMA mismatch — 'effect: heal' from LLM is never read. Ability stored as kind:'damage', so resolveAbility damages enemy instead of healing caster. No regen effect created."
  artifacts:
    - path: "spacetimedb/src/data/llm_prompts.ts"
      issue: "CREATION_ABILITY_SCHEMA uses 'effect' field instead of 'kind'"
    - path: "spacetimedb/src/reducers/creation.ts"
      issue: "Line 216 reads chosen.kind which is undefined from LLM output"
  missing:
    - "Align CREATION_ABILITY_SCHEMA field names with SKILL_GENERATION_SCHEMA"
  debug_session: ".planning/debug/effect-system-combat-log.md"

- truth: "Buff/debuff application should show stat, magnitude, and duration info in combat log"
  status: resolved
  reason: "User reported: No indication that buffs/debuffs/hots/dots are doing anything"
  severity: major
  test: 3
  root_cause: "Same root cause — creation abilities with 'effect: buff/debuff' stored as kind:'damage'. addCharacterEffect never called with buff/debuff types, so no application events emitted."
  artifacts:
    - path: "spacetimedb/src/data/llm_prompts.ts"
      issue: "CREATION_ABILITY_SCHEMA field name mismatch"
  missing:
    - "Align CREATION_ABILITY_SCHEMA field names with SKILL_GENERATION_SCHEMA"
  debug_session: ".planning/debug/effect-system-combat-log.md"

- truth: "Buff events render blue and debuff events render orange in combat log"
  status: resolved
  reason: "User reported: Nothing in the combat log at all for dots/hots/buffs/debuffs"
  severity: major
  test: 4
  root_cause: "Client color mappings for buff (#74c0fc) and debuff (#ffa94d) in NarrativeMessage.vue are correct but never exercised because no buff/debuff events are emitted due to the schema mismatch."
  artifacts:
    - path: "src/components/NarrativeMessage.vue"
      issue: "Color mappings correct but untriggered"
  missing:
    - "Fix upstream schema mismatch so events are actually emitted"
  debug_session: ".planning/debug/effect-system-combat-log.md"

- truth: "Mid-combat pulling should add new enemies to existing fight instead of just targeting"
  status: resolved
  reason: "User reported: Clicking on another enemy in the narrative just tries to target selected enemy instead of allowing me to pull it."
  severity: major
  test: 9
  root_cause: "Server-side mid-combat pull logic exists in resolve_pull but client has 3 blocks: (1) clickNpcKeyword in App.vue has !isInCombat guard, (2) pendingPullTargetId never set during combat, (3) combat UI hides all pull-related buttons/actions."
  artifacts:
    - path: "src/App.vue"
      issue: "clickNpcKeyword has !isInCombat guard blocking enemy-click-to-pull during combat"
    - path: "src/components/NarrativeInput.vue"
      issue: "Combat UI hides context action bar, no pull UI during combat"
    - path: "src/composables/useContextActions.ts"
      issue: "Returns empty actions during combat"
  missing:
    - "Allow enemy clicks to route to pull during combat when clicked enemy is not already in fight"
    - "Show pull option in combat UI for zone enemies not yet in fight"
  debug_session: ".planning/debug/mid-combat-pull-targets-instead.md"
