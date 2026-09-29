---
phase: 01-races
verified: 2026-02-11T00:00:00Z
status: human_needed
score: 10/10 must-haves verified
re_verification: false
human_verification:
  - test: Race picker shows 4 races and stat bonuses display correctly in browser
    expected: Dropdown shows Human Eldrin Ironclad Wyldfang. Each race shows correct stat bonuses.
    why_human: Requires live SpacetimeDB connection. Visual rendering cannot be verified from source code.
  - test: Class filtering works end-to-end and backend rejects invalid combos
    expected: Ironclad shows 7 classes. Human shows all 16. Switching race clears invalid class.
    why_human: Reactive filtering and live reducer calls require a browser session.
  - test: Racial stat bonuses visible in character stats panel after creation
    expected: Ironclad Warrior STR is 2 higher than Human Warrior STR.
    why_human: Requires creating two characters and comparing stats panel display.
---

# Phase 1: Races Verification Report

**Phase Goal:** Players can select a race at character creation. Race restricts available classes and grants stat bonuses.
**Verified:** 2026-02-11
**Status:** human_needed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Race table exists with 4 unlocked starter races after syncAllContent | VERIFIED | spacetimedb/src/index.ts:1178 Race table public:true; index.ts:4335 ensureRaces(ctx) in syncAllContent; races.ts 4 entries all unlocked:true |
| 2 | create_character accepts raceId validates race and class and applies bonuses | VERIFIED | characters.ts:101 raceId:t.u64(); lines 113-120 validate; lines 129-136 apply racial bonuses |
| 3 | Invalid race-class combos rejected with SenderError | VERIFIED | characters.ts:118-120 isClassAllowed check throws SenderError |
| 4 | Racial stat bonuses baked into character base stats at creation | VERIFIED | characters.ts:129-136 classStats merged with raceRow bonuses into baseStats before all derived stat calculations |
| 5 | Race picker dropdown shows 4 unlocked races | VERIFIED | CharacterPanel.vue:268-270 unlockedRaces computed filters props.races by r.unlocked |
| 6 | Selecting a race shows description and stat bonuses | VERIFIED | CharacterPanel.vue:29-41 v-if=selectedRaceRow block with description and conditional bonus spans |
| 7 | Class dropdown filters to classes allowed by selected race | VERIFIED | CharacterPanel.vue:272-277 displayedClassOptions computed; useCharacterCreation.ts:44-53 computes allowed list |
| 8 | Switching race clears invalid class selection | VERIFIED | CharacterPanel.vue:128-145 onRaceChange checks new race availableClasses and clears className if invalid |
| 9 | Creating character sends raceId bigint to createCharacter reducer | VERIFIED | useCharacterCreation.ts:73 raceId: BigInt(newCharacter.value.raceId) |
| 10 | Character list displays race name from Character row | VERIFIED | CharacterPanel.vue:83 character.race; characters.ts:145 race: raceRow.name stored at creation |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| spacetimedb/src/data/races.ts | RACE_DATA constant and ensureRaces function | VERIFIED | Exports RACE_DATA (4 races) and ensureRaces upsert. Human availableClasses is empty string - correct sentinel. |
| spacetimedb/src/index.ts | Race table definition schema export syncAllContent wiring | VERIFIED | Race table at line 1178 public:true; in schema() at line 1212; ensureRaces(ctx) at line 4335; RACE_DATA+isClassAllowed in reducerDeps lines 5711-5712 |
| spacetimedb/src/reducers/characters.ts | create_character with raceId validation and bonuses | VERIFIED | raceId at line 101; validation lines 113-120; bonuses lines 129-136; race:raceRow.name at line 145 |
| src/module_bindings/race_type.ts | Generated Race row type | VERIFIED | Exists with all 10 columns matching schema |
| src/module_bindings/race_table.ts | Generated race table accessor | VERIFIED | Exists with primaryKey on id |
| src/module_bindings/create_character_type.ts | Updated reducer type with raceId:u64 | VERIFIED | Contains raceId: __t.u64() - replaced race:string |
| src/module_bindings/create_character_reducer.ts | Updated reducer signature | VERIFIED | Contains raceId: __t.u64(), name, className |
| src/composables/useGameData.ts | races reactive data from useTable(tables.race) | VERIFIED | Line 57: const [races] = useTable(tables.race); line 112: races in return object |
| src/composables/useCharacterCreation.ts | newCharacter with raceId and class filtering logic | VERIFIED | raceId field; selectedRaceRow and filteredClassOptions computed and returned; BigInt(raceId) in reducer call |
| src/components/CharacterPanel.vue | Race picker info display filtered class dropdown | VERIFIED | Race select at line 14; info block lines 29-41; displayedClassOptions lines 272-277; onRaceChange with class-clear lines 128-145 |
| src/App.vue | Passes races selectedRaceRow filteredClassOptions to CharacterPanel | VERIFIED | Line 635 races from useGameData; line 755 races to useCharacterCreation; lines 134-136 all three props to CharacterPanel |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| spacetimedb/src/data/races.ts | spacetimedb/src/index.ts | import RACE_DATA ensureRaces | WIRED | index.ts line 32 |
| spacetimedb/src/index.ts | syncAllContent | ensureRaces(ctx) inside syncAllContent | WIRED | index.ts line 4335 - first call in syncAllContent |
| spacetimedb/src/index.ts | spacetimedb/src/reducers/characters.ts | RACE_DATA+isClassAllowed in reducerDeps | WIRED | index.ts lines 5711-5712 |
| spacetimedb/src/reducers/characters.ts | ctx.db.race | ctx.db.race.id.find(raceId) | WIRED | characters.ts line 113 |
| src/composables/useGameData.ts | src/module_bindings | useTable(tables.race) | WIRED | useGameData.ts line 57 |
| src/composables/useCharacterCreation.ts | reducers.createCharacter | raceId: BigInt(raceId) | WIRED | useCharacterCreation.ts line 73 |
| src/components/CharacterPanel.vue | useGameData races | races prop via App.vue | WIRED | App.vue line 134 :races=races |
| src/components/CharacterPanel.vue | CLASS_OPTIONS filtering | filteredClassOptions drives displayedClassOptions | WIRED | CharacterPanel.vue lines 272-277 |

### Requirements Coverage

| Requirement | Description | Status | Notes |
|-------------|-------------|--------|-------|
| REQ-001 | Race table and definitions | SATISFIED | Race table with 4 unlocked races and unlocked bool field |
| REQ-002 | Race-class restrictions | SATISFIED | Backend SenderError on invalid combo; frontend class dropdown filtered by race |
| REQ-003 | Race stat bonuses | SATISFIED | Bonuses baked into baseStats at creation flowing into all derived stats |
| REQ-004 | Race picker in character creation UI | SATISFIED | Dropdown, description, stat bonuses, filtered class options all present |
| REQ-005 | RACE_DATA constant | SATISFIED | spacetimedb/src/data/races.ts exports RACE_DATA; seeded into Race table via ensureRaces as designed |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/components/CharacterPanel.vue | 7 | placeholder=Name HTML input attribute | Info | HTML form attribute only - not a code stub |

No blocker or warning anti-patterns found.

### Human Verification Required

#### 1. Race Picker Visual Display

**Test:** Open the app in browser with SpacetimeDB running. Navigate to Character Creation. Verify the race dropdown shows exactly 4 options: Human, Eldrin, Ironclad, Wyldfang.

**Expected:** 4 races in dropdown. Selecting each shows correct description and stat bonuses: Human (CHA +1), Eldrin (WIS +1 INT +2), Ironclad (STR +2), Wyldfang (DEX +2 WIS +1).

**Why human:** Requires live SpacetimeDB connection for race data to populate via useTable(tables.race). BigInt comparisons in v-if require live DOM rendering to confirm.

#### 2. Class Filtering Live Behavior

**Test:** Select Ironclad - verify only 7 classes (Warrior, Paladin, Monk, Beastmaster, Spellblade, Ranger, Shaman). Select Human - verify all 16 classes appear. Select Wyldfang, pick Rogue, switch to Ironclad - verify Rogue clears.

**Expected:** Restricted class list per race. Full CLASS_OPTIONS for Human (empty availableClasses maps to null filteredClassOptions which returns full list). Class auto-clears on invalid switch.

**Why human:** Reactive filtering with live data and user interaction required to confirm onRaceChange and Vue reactivity work correctly end-to-end.

#### 3. Racial Stat Bonuses in Stats Panel

**Test:** Create an Ironclad Warrior. Open Stats panel. Note STR. Create a Human Warrior. Compare STR values.

**Expected:** Ironclad Warrior STR = Human Warrior base STR + 2. Baked in at creation.

**Why human:** Requires creating two characters and reading stats panel to confirm the numeric difference.

#### 4. Backend Rejection of Invalid Combos

**Test:** Use browser console to call createCharacter reducer with an Ironclad race ID and Rogue class name.

**Expected:** SenderError: rogue is not available for Ironclad

**Why human:** Requires live SpacetimeDB reducer call to confirm server-side isClassAllowed validation fires.

### Gaps Summary

No gaps found. All 10 observable truths verified in source code. All 11 required artifacts exist, are substantive, and are fully wired. All 8 key links confirmed connected. REQ-001 through REQ-005 all satisfied.

Remaining items are human verification tests requiring a live browser session. The implementation is complete and correct in the codebase.

---

_Verified: 2026-02-11_
_Verifier: Claude (gsd-verifier)_
