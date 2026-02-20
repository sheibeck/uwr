---
phase: quick-219
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/ROADMAP.md
  - .planning/STATE.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "ROADMAP.md has a new Phase 21 (Race Expansion) section before the old Phase 21"
    - "Old Phase 21 (Class Ability Balancing) is renumbered to Phase 22 throughout ROADMAP.md"
    - "Phase Overview table reflects the new phase and renumbering"
    - "Dependency Graph shows Phase 22 depends on Phase 21"
    - "STATUS.md Phase Status table has new Phase 21 row (Pending) and old Phase 21 renamed Phase 22"
  artifacts:
    - path: ".planning/ROADMAP.md"
      provides: "Updated roadmap with Phase 21 Race Expansion inserted"
    - path: ".planning/STATE.md"
      provides: "Updated phase status table with new Phase 21 and renamed Phase 22"
  key_links:
    - from: "Phase 22 (Class Ability Balancing)"
      to: "Phase 21 (Race Expansion)"
      via: "Depends on entry in Phase 22 section"
---

<objective>
Insert new Phase 21 (Race Expansion) into ROADMAP.md before the current Phase 21 (Class Ability Balancing), renumber the old Phase 21 to Phase 22, and update all cross-references including the Phase Overview table, Dependency Graph, status legend, and STATE.md Phase Status table.

Purpose: Document the Race Expansion phase so it is correctly ordered and tracked before Class Ability Balancing can begin.
Output: Updated ROADMAP.md and STATE.md with accurate phase numbering and the new Phase 21 definition.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Insert Phase 21 Race Expansion and renumber old Phase 21 to Phase 22 in ROADMAP.md</name>
  <files>.planning/ROADMAP.md</files>
  <action>
Make the following edits to ROADMAP.md:

**1. Phase Overview table** — add new row for Phase 21 Race Expansion and update old Phase 21 row to Phase 22:

Replace:
```
| 21 | Class Ability Balancing & Progression | ABILITY-01–06 | Phase 20 | Pending |
```
With:
```
| 21 | Race Expansion | RACE-EXP-01–05 | Phase 20 | Pending |
| 22 | Class Ability Balancing & Progression | ABILITY-01–06 | Phase 21 | Pending |
```

**2. Dependency Graph** — append Phase 21 and Phase 22 lines after the Phase 20 line. The graph currently ends with Phase 20 (no Phase 21 line in the graph). Add:
```
Phase 21 (Race Expansion) <- Phase 20
Phase 22 (Class Ability Balancing) <- Phase 21 (races must be expanded first)
```

**3. Status legend** — update the legend line to include Phase 21 as Pending:

Current: `**Status legend:** Phases 1, 3, 3.1, 3.1.1, 3.1.2, 3.1.3, 4, 6, 10, 11, 12, 13, 13.1, 14, 15, 18, 19, 20 = Complete. Phases 5, 7, 8, 9 = Pending. Phases 16, 17 = Pending (not yet planned).`

Replace with: `**Status legend:** Phases 1, 3, 3.1, 3.1.1, 3.1.2, 3.1.3, 4, 6, 10, 11, 12, 13, 13.1, 14, 15, 18, 19, 20 = Complete. Phases 5, 7, 8, 9 = Pending. Phases 16, 17, 21, 22 = Pending (not yet planned).`

**4. Rename the old Phase 21 section header and update its dependency** — find:
```
### Phase 21: Class Ability Balancing & Progression
```
Replace with:
```
### Phase 22: Class Ability Balancing & Progression
```

Find within that section:
```
**Depends on:** Phase 20
```
Replace with:
```
**Depends on:** Phase 21 (Race Expansion must be complete so class abilities can reference fully-defined racial bonus system)
```

Find within that section:
```
- [ ] TBD (run /gsd:plan-phase 21 to break down)
```
Replace with:
```
- [ ] TBD (run /gsd:plan-phase 22 to break down)
```

**5. Insert new Phase 21 section** — insert the following block immediately BEFORE the `### Phase 21: Class Ability Balancing & Progression` section header (which is now renamed to Phase 22, so insert before that renamed section):

```markdown
### Phase 21: Race Expansion

**Goal:** Expand the race roster from 4 starter races to 15+ traditional fantasy races (good and evil alignment), upgrade all races to a dual-bonus system, and introduce a level-up racial bonus mechanic that fires at character creation and every even level. Locked races require world events to unlock; starter races remain available from the start.

**Depends on:** Phase 20

**Requirements:** RACE-EXP-01, RACE-EXP-02, RACE-EXP-03, RACE-EXP-04, RACE-EXP-05

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 21 to break down)

**Scope:**

**New races to add (target 11+ new races):**
- Goblin (unlocked — cunning, small, bonus magic damage + bonus mana regen)
- Troll (unlocked — regenerating, brutish, bonus max HP + bonus physical damage)
- Dark-Elf (locked — graceful and sinister, bonus spell damage + bonus mana regen)
- Dwarf (unlocked — stout and stubborn, bonus max HP + bonus physical damage)
- Gnome (unlocked — inventive and quick, bonus mana regen + bonus max mana)
- Halfling (unlocked — nimble and lucky, bonus crit chance + bonus evasion)
- Half-Elf (unlocked — versatile and adaptable, +1 to two stats of choice at creation)
- Orc (unlocked — savage and strong, bonus physical damage + bonus max HP)
- Half-Giant (locked — massive, bonus max HP + bonus physical damage but reduced mana)
- Cyclops (locked — singular-minded brutes, bonus physical damage + bonus armor)
- Satyr (locked — wild and magical, bonus spell damage + bonus stamina regen)

**Dual-bonus system for all races (including 4 existing starter races):**
Each race grants exactly two bonuses. Bonuses are not limited to stat points. The bonus pool includes:
- +1 to a specific stat (STR, DEX, INT, WIS, CON, CHA)
- Bonus spell damage (flat, added after stat scaling)
- Bonus physical damage (flat, added after stat scaling)
- Bonus max mana (increases max mana pool)
- Bonus mana regen (restores additional mana per regen tick)
- Bonus max HP (increases max health pool)
- Bonus stamina regen (restores additional stamina per tick)
- Bonus crit chance (flat %, added to base crit)
- Bonus armor (flat, added to armor total)

**Level-up racial bonus mechanic:**
- Racial bonuses apply once at character creation (level 1)
- Bonuses apply again at every EVEN character level (2, 4, 6, 8, 10...)
- This compounds racial identity across the progression curve without overwhelming early balance
- Implementation: hook into level-up logic to re-apply racial bonus row at even levels

**Locked vs unlocked races:**
- Unlocked races: Human, Eldrin, Ironclad, Wyldfang, Goblin, Dwarf, Gnome, Halfling, Half-Elf, Orc, Troll
- Locked races (require world events): Dark-Elf, Half-Giant, Cyclops, Satyr
- Locked races show in the race picker with a lock icon but cannot be selected until unlocked
- The `Race.unlocked` field (already on the table from Phase 1) controls this

**Existing starter races — dual-bonus upgrades:**
- Human: +1 CHA + bonus stamina regen (versatile, resilient)
- Eldrin: bonus spell damage + bonus max mana (magical heritage)
- Ironclad: bonus physical damage + bonus armor (forged body)
- Wyldfang: bonus crit chance + bonus mana regen (primal instinct)

**Requirements Detail:**
- RACE-EXP-01: At least 11 new races added to RACE_DATA with unlocked/locked status and two distinct bonuses each
- RACE-EXP-02: All 4 existing starter races upgraded to dual-bonus system (not breaking existing characters)
- RACE-EXP-03: Level-up racial bonus mechanic implemented — even-level hook re-applies racial bonuses
- RACE-EXP-04: Locked races visible but unselectable in character creation UI; unlock via world event sets Race.unlocked = true
- RACE-EXP-05: Racial bonuses cover the full bonus pool (at least spell damage, physical damage, max mana, mana regen, max HP used across the roster)

**Success Criteria:**
- [ ] 15+ races defined in RACE_DATA with `unlocked` flag and exactly two bonuses each
- [ ] Character creation race picker shows all races; locked races display lock indicator
- [ ] Creating a character with any race applies both racial bonuses to stats/combat modifiers
- [ ] Leveling a character to an even level (2, 4, 6...) triggers re-application of racial bonuses
- [ ] Existing characters are not broken by the dual-bonus upgrade to starter races
- [ ] Dark-Elf, Half-Giant, Cyclops, Satyr remain locked until the corresponding world event fires

---

```
  </action>
  <verify>
    Read .planning/ROADMAP.md and confirm:
    - Phase Overview table has both row 21 (Race Expansion) and row 22 (Class Ability Balancing)
    - The new Phase 21 section exists with all scope fields filled in
    - The Phase 22 section header reads "Phase 22" and its Depends on line references Phase 21
    - Status legend mentions phases 21 and 22 as Pending
    - Dependency graph has lines for Phase 21 and Phase 22
  </verify>
  <done>
    ROADMAP.md contains the new Phase 21 Race Expansion section with full goal, requirements, scope, and success criteria. Phase 22 (Class Ability Balancing) is renumbered and depends on Phase 21. All cross-references (overview table, dependency graph, status legend) are updated.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update STATE.md Phase Status table</name>
  <files>.planning/STATE.md</files>
  <action>
Make the following edits to STATE.md:

**1. Phase Status table** — add new Phase 21 row and rename old Phase 21 row to Phase 22.

Find:
```
| 21 | Class Ability Balancing & Progression | Pending (not yet planned) |
```
Replace with:
```
| 21 | Race Expansion | Pending (not yet planned) |
| 22 | Class Ability Balancing & Progression | Pending (not yet planned) |
```

**2. Current Position paragraph** — find the text:
```
Next action:** Plan Phase 5 (LLM Architecture) when ready, or plan Phase 21 (Class Ability Balancing), or continue quick tasks for balance/polish
```
Replace with:
```
Next action:** Plan Phase 5 (LLM Architecture) when ready, or plan Phase 21 (Race Expansion), or plan Phase 22 (Class Ability Balancing) after Phase 21, or continue quick tasks for balance/polish
```

**3. Status line at top of file** — find:
```
Next formal phases: 5 (LLM), 7 (World Events LLM text), 8 (Narrative Tone), 9 (Content Expansion), 16 (Travelling NPCs), 17 (World Bosses).
```
Replace with:
```
Next formal phases: 5 (LLM), 7 (World Events LLM text), 8 (Narrative Tone), 9 (Content Expansion), 16 (Travelling NPCs), 17 (World Bosses), 21 (Race Expansion), 22 (Class Ability Balancing).
```
  </action>
  <verify>
    Read .planning/STATE.md Phase Status table and confirm row 21 is "Race Expansion | Pending (not yet planned)" and row 22 is "Class Ability Balancing & Progression | Pending (not yet planned)".
  </verify>
  <done>
    STATE.md Phase Status table has Phase 21 as Race Expansion (Pending) and Phase 22 as Class Ability Balancing (Pending). The Current Position and status line reference both phases correctly.
  </done>
</task>

</tasks>

<verification>
After both tasks complete:
1. Grep ROADMAP.md for "Phase 21" — should find both the overview row and the section header for Race Expansion
2. Grep ROADMAP.md for "Phase 22" — should find the renumbered Class Ability Balancing row and section header
3. Grep ROADMAP.md for "Depends on:" in the Phase 22 section — should reference Phase 21
4. Grep STATE.md for "Race Expansion" — should find the Phase 21 status row
</verification>

<success_criteria>
- ROADMAP.md Phase Overview table: Phase 21 = Race Expansion, Phase 22 = Class Ability Balancing
- ROADMAP.md: Complete Phase 21 Race Expansion section with goal, requirements, 11+ new races, dual-bonus system, level-up mechanic, locked/unlocked status, and success criteria
- ROADMAP.md: Phase 22 section header and dependency reference updated
- ROADMAP.md: Dependency graph and status legend reflect Phase 21 and Phase 22
- STATE.md: Phase Status table has Phase 21 (Race Expansion, Pending) and Phase 22 (Class Ability Balancing, Pending)
</success_criteria>

<output>
After completion, create `.planning/quick/219-add-phase-for-race-expansion-with-new-fa/219-SUMMARY.md` using the summary template.
</output>
```
