---
status: resolved
trigger: "Effect system events not appearing in combat log (Tests 1-4)"
created: 2026-03-09T00:00:00Z
updated: 2026-03-10T01:00:00Z
---

## Current Focus

hypothesis: CREATION_ABILITY_SCHEMA field names don't match the creation reducer's field mapping, causing all creation abilities to default to kind='damage'
test: Compare schema fields to reducer field reads
expecting: Schema uses different field names than code expects
next_action: Report diagnosis

## Symptoms

expected: DoT ticks, HoT ticks, buff/debuff application/expiry events visible in combat log with color coding
actual: No effect lifecycle events appear; HoT abilities deal damage instead of healing
errors: None (silent misbehavior)
reproduction: Create a character with a heal/dot/buff ability, use it in combat
started: Since character creation system was wired up

## Eliminated

- hypothesis: Client-side filtering removes effect events
  evidence: useEvents.ts has no kind-based filtering; all event_private rows are displayed. NarrativeMessage.vue has color entries for 'buff' (#74c0fc) and 'debuff' (#ffa94d) kinds.
  timestamp: 2026-03-09

- hypothesis: Server doesn't emit events for DoT/HoT ticks
  evidence: tickEffectsForRound (combat.ts:2498-2509) explicitly calls appendPrivateEvent with kind 'heal' for regen and kind 'damage' for dot ticks. Code is correct.
  timestamp: 2026-03-09

- hypothesis: Server doesn't emit buff/debuff application events
  evidence: addCharacterEffect (combat.ts:222-232) emits 'buff' and 'debuff' kind events via appendPrivateEvent. Code is correct.
  timestamp: 2026-03-09

- hypothesis: Subscription not set up for event_private
  evidence: useGameData.ts:43 subscribes to 'SELECT * FROM event_private' and line 54 wires onInsert handler. Client pipeline is correct.
  timestamp: 2026-03-09

## Evidence

- timestamp: 2026-03-09
  checked: CREATION_ABILITY_SCHEMA (llm_prompts.ts:101-111)
  found: Schema uses field "effect" (values: none|dot|heal|buff|debuff|stun) — NOT "kind"
  implication: LLM returns {effect: "heal"} but creation code reads chosen.kind which is undefined

- timestamp: 2026-03-09
  checked: creation.ts:216 — kind field mapping
  found: `kind: chosen.kind || chosen.type || 'damage'` — never reads chosen.effect
  implication: ALL creation abilities get kind='damage' regardless of LLM intent

- timestamp: 2026-03-09
  checked: CREATION_ABILITY_SCHEMA field "baseDamage" vs creation.ts:222
  found: Schema uses "baseDamage" but code reads `chosen.value1 || chosen.damage || chosen.healAmount || 15`
  implication: value1 always defaults to 15 for creation abilities (baseDamage is never read)

- timestamp: 2026-03-09
  checked: CREATION_ABILITY_SCHEMA field "manaCost" vs creation.ts:219
  found: Schema uses "manaCost" but code reads `chosen.resourceCost || 10`
  implication: resourceCost always defaults to 10 for creation abilities

- timestamp: 2026-03-09
  checked: SKILL_GENERATION_SCHEMA (llm_prompts.ts:237-257) vs skill insert (index.ts:657-667)
  found: Skill generation uses "kind" field which matches the insert code; skill generation path works correctly
  implication: Bug is isolated to CHARACTER CREATION abilities, not leveling-up abilities

- timestamp: 2026-03-09
  checked: resolveAbility dispatch (combat.ts:498-720)
  found: kind='damage' routes to damage branch, not heal/hot/buff/debuff branches
  implication: Creation abilities with intended effect="heal" deal damage because kind is always 'damage'

- timestamp: 2026-03-09
  checked: tickEffectsForRound (combat.ts:2490-2543) and addCharacterEffect (combat.ts:194-252)
  found: Regen/dot effects ARE logged correctly IF they exist, but they're never created because resolveAbility's 'damage' branch doesn't create effects
  implication: No ticks appear because no effects are applied in the first place

## Resolution

root_cause: |
  CREATION_ABILITY_SCHEMA in llm_prompts.ts uses different field names than
  the creation reducer in creation.ts expects. Specifically:

  1. Schema field "effect" (heal/dot/buff/debuff/stun) is never mapped to the
     ability_template "kind" column. The creation code reads chosen.kind (undefined),
     then chosen.type (undefined), then defaults to 'damage'. This means ALL
     character creation abilities are stored as kind='damage' regardless of
     the LLM's intended effect type.

  2. Schema field "baseDamage" is never read — code looks for value1/damage/healAmount.

  3. Schema field "manaCost" is never read — code looks for resourceCost.

  This is a pure field-name mismatch between the LLM schema and the server-side
  reducer that consumes the LLM's JSON output. The SKILL_GENERATION_SCHEMA
  (used for leveling-up abilities) uses the correct field name "kind" and works fine.

  Impact on all 4 reported issues:
  - Issue 1 (DoT ticks not appearing): If a creation ability intended as "dot" is
    stored as kind='damage', resolveAbility uses the damage branch (single hit),
    never calls addCharacterEffect/addEnemyEffect, so no DoT is ever created,
    and no ticks ever fire.
  - Issue 2 (HoT deals damage): A creation ability like "Rot Ward" with effect="heal"
    gets kind='damage', so resolveAbility routes it to damage the enemy instead of
    healing the caster. No regen effect is created, so no HoT ticks.
  - Issue 3 (Buff/debuff events missing): Creation abilities with effect="buff" or
    effect="debuff" are stored as kind='damage'. They never enter the buff/debuff
    branches of resolveAbility, so addCharacterEffect is never called with buff/debuff
    effectTypes, and no buff/debuff events are emitted.
  - Issue 4 (No color-coded buff/debuff): Since no buff/debuff events are emitted
    (issue 3), the NarrativeMessage.vue color mapping for 'buff' (#74c0fc) and
    'debuff' (#ffa94d) is never exercised. The colors ARE defined correctly; there's
    just no data to render.

fix: empty
verification: empty
files_changed: []
