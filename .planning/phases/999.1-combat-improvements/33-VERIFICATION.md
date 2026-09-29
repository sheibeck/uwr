---
phase: 33-combat-improvements
verified: 2026-03-09T22:55:00Z
status: human_needed
score: 14/15 must-haves verified
re_verification: false
human_verification:
  - test: "COMB-05 — Enemy HUD effect tags visual appearance"
    expected: "Colored tags (red for DoT/debuffs, green for HoT/buffs, yellow for own effects) appear below enemy HP bars during combat, with uppercase label and remaining seconds countdown. Many effects wrap with flex-wrap."
    why_human: "Vue component rendering cannot be verified programmatically — requires live combat session to confirm effect tags appear and countdown updates in real time."
  - test: "COMB-06 — Any group member can pull (not just designated puller)"
    expected: "In a group, any member (not only the puller) can initiate combat by clicking an enemy name or issuing pull commands. No 'must be puller' error message appears."
    why_human: "Multi-account group scenario cannot be automated — UAT confirmed skipped due to single-account test environment. Code inspection confirms the restriction is removed."
  - test: "DoT/HoT/buff/debuff kinds correct for new characters (post-schema fix)"
    expected: "Characters created AFTER the Plan 04 fix have abilities with kind:'dot', 'hot', 'buff', or 'debuff' stored correctly in ability_template. DoTs should tick, HoTs should heal, buffs/debuffs should apply visible effects in combat."
    why_human: "Requires creating a new character via LLM flow and entering combat to confirm the full end-to-end pipeline works with the corrected CREATION_ABILITY_SCHEMA. Unit tests verify the code path; runtime verification requires a live session."
---

# Phase 33: Combat Improvements Verification Report

**Phase Goal:** Improve combat experience with better narrative logging, rebalanced scaling, and multi-enemy pulling
**Verified:** 2026-03-09T22:55:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | DoT ticks emit narrative-style damage messages with effect name ("You suffer X damage from Y") | VERIFIED | `combat.ts:2508-2509` — `appendPrivateEvent(..., 'damage', \`You suffer ${dmg} damage from ${effect.sourceAbility ?? 'a lingering effect'}.\`)` |
| 2 | HoT ticks emit narrative-style heal messages with effect name ("Y soothes you for X HP") | VERIFIED | `combat.ts:2502-2503` — `appendPrivateEvent(..., 'heal', \`${effect.sourceAbility ?? 'Regeneration'} soothes you for ${effect.magnitude} HP.\`)` |
| 3 | Buff/debuff application emits log entry with stat, magnitude, and duration | VERIFIED | `helpers/combat.ts:227-231` — buff/debuff application events emitted with effect type, magnitude, and round count |
| 4 | Buff/debuff expiration emits enriched log entry with ability name and stat info | VERIFIED | `combat.ts:2535-2536` — `\`The effect of ${effect.sourceAbility ?? effect.effectType} (${effectLabel}) has worn off.\`` |
| 5 | Ability damage is scaled down to roughly double combat duration | VERIFIED | `ABILITY_DAMAGE_SCALER = 50n` in `combat_scaling.ts:80`; applied in `helpers/combat.ts:478` — `power = (power * ABILITY_DAMAGE_SCALER) / 100n; if (power < 1n) power = 1n;` |
| 6 | Mana ability costs are increased relative to stamina costs | VERIFIED | `MANA_COST_MULTIPLIER = 150n` in `combat_scaling.ts:86`; applied in `helpers/combat.ts:81` — `cost = (cost * MANA_COST_MULTIPLIER) / 100n` when `resourceType === 'mana'` |
| 7 | Mana abilities enforce a minimum cast time floor at resolution time | VERIFIED | `MANA_MIN_CAST_SECONDS = 1n` in `combat_scaling.ts:92`; enforced in `helpers/combat.ts:113` and `scaledPower()` at `helpers/combat.ts:472-473` |
| 8 | New event kinds 'buff' and 'debuff' render in correct colors on client | VERIFIED | `NarrativeMessage.vue:86-87` — `buff: '#74c0fc'` and `debuff: '#ffa94d'` added to `KIND_COLORS` |
| 9 | Any group member can initiate a pull (no puller role restriction) | VERIFIED | `combat.ts` — `requirePullerOrLog` calls removed from all 3 combat paths (start_combat, start_tracked_combat, start_pull); replaced with direct `group_member.by_character.filter()` lookup. No matches for `requirePullerOrLog` in combat.ts |
| 10 | Pulling while already in combat adds new enemies to the existing fight | VERIFIED | `combat.ts:1018-1035` — `activeCombatIdForCharacter` check; if in combat, calls `addEnemyToCombat(deps, ctx, combat, spawn, existingParticipants)` and logs result |
| 11 | No duplicate combat participants when adding enemies to existing combat | VERIFIED | `addEnemyToCombat` only inserts aggro entries per participant, not new `combat_participant` rows (design confirmed in SUMMARY-02) |
| 12 | Enemy HUD shows colored effect tags below each enemy's HP bar | VERIFIED (code) | `EnemyHud.vue:23-31` renders tags with `sortedEffects()` and `effectTagColor()`; effects flow from `useCombat.ts:521-593` → `App.vue:70` → `NarrativeInput.vue:110` → `EnemyHud.vue:6` |
| 13 | CREATION_ABILITY_SCHEMA uses "kind" field matching SKILL_GENERATION_SCHEMA | VERIFIED | `llm_prompts.ts:104` — `"kind": "damage|dot|heal|hot|buff|debuff|stun"` present; old "effect" field removed |
| 14 | creation.ts reads kind and damageType correctly from LLM output | VERIFIED | `creation.ts:216` — `chosen.kind \|\| chosen.effect \|\| chosen.type \|\| 'damage'` (backward-compatible fallback chain); `creation.ts:225` — `damageType: chosen.damageType \|\| 'physical'` |
| 15 | Clicking an enemy name in narrative during combat initiates pull for available enemies | VERIFIED | `App.vue:1420-1427` — `pullableSpawn = availableEnemies.value.find(e => e.name?.toLowerCase() === kwLower)` checked after `combatEnemiesList` match; calls `startPull(pullableSpawn.id, 'body')` |

**Score:** 14/15 truths verified automatically (1 requires human for visual confirmation)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `spacetimedb/src/reducers/combat.ts` | Narrative DoT/HoT tick messages, enriched expiry messages, mid-combat pull via addEnemyToCombat | VERIFIED | Contains "You suffer", "soothes you", "worn off", "addEnemyToCombat" with mid-combat path at line 1018 |
| `spacetimedb/src/helpers/combat.ts` | Buff/debuff application event emission, mana cast time floor, ABILITY_DAMAGE_SCALER in scaledPower | VERIFIED | appendPrivateEvent for buff/debuff, MANA_MIN_CAST_SECONDS enforcement, ABILITY_DAMAGE_SCALER applied |
| `spacetimedb/src/data/combat_scaling.ts` | ABILITY_DAMAGE_SCALER, MANA_COST_MULTIPLIER, MANA_MIN_CAST_SECONDS exports | VERIFIED | All three constants exported at lines 80, 86, 92 with correct values (50n, 150n, 1n) |
| `src/components/NarrativeMessage.vue` | Color entries for buff and debuff event kinds | VERIFIED | `buff: '#74c0fc'` and `debuff: '#ffa94d'` at lines 86-87 |
| `src/components/EnemyHud.vue` | Effect tag rendering below HP bars | VERIFIED | Lines 22-31 render effect tags; `sortedEffects()` sorts own effects first; `effectTagColor()` returns yellow/red/green |
| `src/components/NarrativeInput.vue` | CombatEnemyEntry type includes effects array | VERIFIED | Line 100 — `effects: { id: bigint; label: string; seconds: number; isNegative: boolean; isOwn: boolean }[]` |
| `spacetimedb/src/data/llm_prompts.ts` | CREATION_ABILITY_SCHEMA with 'kind' field | VERIFIED | Line 104 — `"kind": "damage\|dot\|heal\|hot\|buff\|debuff\|stun"` |
| `spacetimedb/src/reducers/creation.ts` | Ability insertion reading kind and damageType from LLM output | VERIFIED | Lines 216, 225 — backward-compatible kind fallback chain + damageType read |
| `src/App.vue` | Mid-combat enemy click routes to pull for available enemies | VERIFIED | Lines 1420-1427 — pullableSpawn check after combatEnemiesList match |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `combat.ts` tickEffectsForRound | `events.ts` appendPrivateEvent | Narrative phrasing "You suffer", "soothes", "worn off" | WIRED | Lines 2502-2509 and 2535-2536 match narrative patterns |
| `helpers/combat.ts` addCharacterEffect | `combat_scaling.ts` ABILITY_DAMAGE_SCALER | ABILITY_DAMAGE_SCALER applied in scaledPower() | WIRED | `helpers/combat.ts:478` — `power = (power * ABILITY_DAMAGE_SCALER) / 100n` |
| `combat.ts` start_pull / resolve_pull | addEnemyToCombat | Mid-combat pull adds enemies to existing combat | WIRED | `combat.ts:1027` — `addEnemyToCombat(deps, ctx, combat, spawn, existingParticipants)` inside `if (existingCombatId)` block |
| `llm_prompts.ts` CREATION_ABILITY_SCHEMA | `creation.ts` ability insert | LLM JSON "kind" field matches code destructuring `chosen.kind` | WIRED | `creation.ts:216` reads `chosen.kind` which now matches schema field name |
| `useCombat.ts` combatEnemiesList | `EnemyHud.vue` effect tags | effects data flows through App.vue and NarrativeInput.vue | WIRED | `App.vue:70` `:combat-enemies="combatEnemiesList"` → `NarrativeInput.vue:6-7` passes to `EnemyHud` |
| `App.vue` clickNpcKeyword | startPull | availableEnemies name check during in-combat narrative click | WIRED | `App.vue:1421-1426` — `pullableSpawn` check + `startPull(pullableSpawn.id, 'body')` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| COMB-01 | 33-01, 33-04 | Combat log shows DoT tick damage per tick with effect name | SATISFIED | `combat.ts:2508-2509` narrative DoT tick message; `llm_prompts.ts:104` schema fix ensures DoT abilities created correctly |
| COMB-02 | 33-01, 33-04 | Combat log shows HoT tick healing per tick with effect name | SATISFIED | `combat.ts:2502-2503` narrative HoT tick message; schema fix ensures HoT abilities get correct kind |
| COMB-03 | 33-01, 33-04 | Combat log shows buff/debuff application with stat, magnitude, and duration | SATISFIED | `helpers/combat.ts:227-231` emits buff/debuff events; creation.ts now stores correct kind |
| COMB-04 | 33-01, 33-04 | Combat log shows buff/debuff expiration | SATISFIED | `combat.ts:2535-2536` enriched expiry message with ability name and effect type label |
| COMB-05 | 33-03 | Enemy HUD displays active DoT/HoT/debuff indicators with remaining duration | NEEDS HUMAN | Code fully implemented (EnemyHud.vue lines 22-31, effects wired from useCombat); visual confirmation required in live session. REQUIREMENTS.md still shows Pending — update needed |
| COMB-06 | 33-02, 33-05 | Multi-enemy pull system — engage multiple groups simultaneously | SATISFIED | requirePullerOrLog removed from all 3 combat paths; resolve_pull adds to existing combat; App.vue clickNpcKeyword pulls available enemies during combat |
| COMB-07 | 33-01 | Combat balance pass — tuned damage/healing constants validated via tests | SATISFIED | `ABILITY_DAMAGE_SCALER=50n`, `MANA_COST_MULTIPLIER=150n`, `MANA_MIN_CAST_SECONDS=1n`; 317 tests pass including 8 combat_scaling tests and 9 combat narrative tests |

**Orphaned requirements check:** COMB-08 (Group info panel font size) is mapped to Phase 33 in REQUIREMENTS.md but was NOT claimed by any Plan in this phase. It remains Pending and is correctly marked for Phase 37 in the tracking table — no orphan issue.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `spacetimedb/src/helpers/combat.ts` | 990 | `// TODO: Clean up remaining old code references in future plan` | Info | Pre-existing comment from earlier work; `_oldCodeRemoved = true` const is harmless dead code. Does not affect functionality. |
| `spacetimedb/src/reducers/combat.ts` | 835 | `// placeholder` comment (in buffer code comment, not implementation) | Info | Comment describes intent correctly — not a stub. Surrounding code is substantive. |

No blocker or warning anti-patterns found. Both items are pre-existing notes without functional impact.

### Human Verification Required

#### 1. Enemy HUD Effect Tags (COMB-05)

**Test:** Enter combat with a character that has DoT/HoT abilities. Use an ability that applies a DoT on an enemy.
**Expected:** Colored text tags appear below the enemy's HP bar showing the effect label in uppercase and remaining seconds (e.g., "DOT 9s"). Own effects should appear in yellow and sorted first. Multiple effects should wrap to new lines with flex-wrap.
**Why human:** Vue component visual rendering cannot be verified programmatically. The code is fully implemented and wired, but live combat is required to confirm the countdown updates in real time and tags are visually correct.

#### 2. Any Group Member Can Pull (COMB-06 partial)

**Test:** With two accounts in a group, have the NON-puller member click an enemy name or issue a pull command.
**Expected:** The pull initiates successfully without any "must be puller" or permission error message.
**Why human:** UAT was skipped due to single-account test environment. Code inspection confirms `requirePullerOrLog` is removed from all three combat paths (`start_combat`, `start_tracked_combat`, `start_pull`), but multi-account group play cannot be automated.

#### 3. New Character Abilities Get Correct Kinds (COMB-01 through COMB-04 end-to-end)

**Test:** Create a new character after the Plan 04 fix. Pick an ability that the LLM describes as a DoT (burns, poisons, bleeds). Enter combat and use it.
**Expected:** The DoT ticks should appear in the combat log per round with "You suffer X damage from [ability name]". The enemy HUD should show a DoT indicator. If a HoT is selected, it should heal rather than damage.
**Why human:** Unit tests confirm the schema fix and creation.ts code path are correct, but the full pipeline (LLM generating "kind":"dot" → creation.ts storing it → combat ticking it → log showing messages) requires a live session to validate end-to-end. Previously created characters will still have incorrect kinds — only new characters benefit from this fix.

### Gaps Summary

No automated verification gaps were found. All 15 observable truths have implementation evidence in the codebase. The 3 human verification items are behavioral/visual checks that require live runtime confirmation. The REQUIREMENTS.md checkbox for COMB-05 remains unchecked (still shows `[ ]`) despite the code being complete — this is a documentation gap, not an implementation gap.

---

_Verified: 2026-03-09T22:55:00Z_
_Verifier: Claude (gsd-verifier)_
