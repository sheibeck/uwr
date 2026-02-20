---
phase: quick-218
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/ROADMAP.md
  - .planning/STATE.md
autonomous: true
requirements: [QUICK-218]

must_haves:
  truths:
    - "Phase 21 entry appears in the ROADMAP.md phase overview table"
    - "Phase 21 has a full section with goal, scope, success criteria, and dependency"
    - "STATE.md lists Phase 21 as Pending in the phase status table"
  artifacts:
    - path: ".planning/ROADMAP.md"
      provides: "Phase 21 entry"
      contains: "Phase 21"
    - path: ".planning/STATE.md"
      provides: "Updated phase status table"
      contains: "21"
  key_links:
    - from: ".planning/ROADMAP.md"
      to: "Phase 21 section"
      via: "Phase overview table row + detailed section"
      pattern: "Phase 21"
---

<objective>
Add Phase 21 (Class Ability Balancing and Progression) to ROADMAP.md as a new pending phase, and update STATE.md to reflect it.

Purpose: The game has class abilities defined only up to level 5, with 15 classes needing full audit, fleshing out, and extension to level 10. This phase captures that work formally in the roadmap so it can be planned and executed.

Output: Updated ROADMAP.md with Phase 21 entry (overview table row + full section), updated STATE.md phase status table.
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
  <name>Task 1: Add Phase 21 to ROADMAP.md</name>
  <files>.planning/ROADMAP.md</files>
  <action>
Make two additions to ROADMAP.md:

1. Add a row to the Phase Overview table (after Phase 20 row):
```
| 21 | Class Ability Balancing & Progression | ABILITY-01–06 | Phase 20 | Pending |
```

2. Append a full Phase 21 section after the Phase 20 section (before the `---` separator leading to Milestone Success Criteria). Use this content:

```markdown
### Phase 21: Class Ability Balancing & Progression

**Goal:** Every class has a fully designed, mechanically distinct ability set covering levels 1–10, with clear class identity enforced through ability choice, stat scaling, and resource usage. The unlock curve is deliberately paced — abilities arrive at meaningful moments, not one-per-level automatically. All referenced mechanics (DoT, HoT, AoE, debuffs, aggro) have backend support.

**Depends on:** Phase 20

**Requirements:** ABILITY-01, ABILITY-02, ABILITY-03, ABILITY-04, ABILITY-05, ABILITY-06

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 21 to break down)

**Scope:**

- Audit all 15 class ability files (`warrior`, `cleric`, `wizard`, `rogue`, `ranger`, `druid`, `bard`, `monk`, `paladin`, `shaman`, `necromancer`, `beastmaster`, `enchanter`, `reaver`, `spellblade`, `summoner`) — verify each existing ability has correct damage values, descriptions, debuff magnitudes, and mechanical backing
- Extend all classes from level 5 to level 10: design 5 additional abilities per class (up to 75 new abilities total), preserving class identity and avoiding cross-class homogeneity
- Redesign the unlock curve: evaluate whether 1-ability-per-level is optimal or whether some levels grant utility, upgrades, or passive modifiers instead of active abilities; produce a progression design document as a CONTEXT file before implementation
- Enforce class identity pillars: each class should have a distinct primary niche (e.g. Warrior = damage + armor shred, Cleric = group healing + resurrection, Wizard = burst magic + mana management, Rogue = single-target burst + evasion) that is consistently expressed across all 10 levels
- Build any missing backend systems that existing abilities reference but do not have reducer support for: e.g. taunt/aggro for `warrior_intimidating_presence`, group morale for `warrior_rally`, AoE damage distribution for `cleave`-type abilities
- Balance check: validate that power values scale appropriately with level and that no class is dominant or useless in group combat

**Requirements Detail:**

- ABILITY-01: All 15 classes have abilities defined for levels 1–10 in their respective data files
- ABILITY-02: Each class has a documented identity pillar (1-sentence description of primary role and playstyle)
- ABILITY-03: Every ability with a mechanic tag (DoT, HoT, AoE, debuff, aggro) has corresponding backend reducer support that implements the tag's effect
- ABILITY-04: The unlock curve (which levels grant abilities vs. passives vs. upgrades) is explicitly designed and applied consistently across all classes
- ABILITY-05: Power values are reviewed and balanced relative to level — no ability at level 6+ should be weaker than a level 2 ability of the same class
- ABILITY-06: New abilities are human-verified in-game: cast animations, damage numbers, buff/debuff applications all observable

**Success Criteria:**

- [ ] All 15 class ability files contain entries for levels 1–10
- [ ] A CONTEXT.md or design note covers the unlock curve decision and class identity pillars for all 15 classes
- [ ] No ability references a debuffType, aoeTargets, or mechanic tag that is unimplemented in `reducers/combat.ts`
- [ ] Power scaling passes sanity check: level N ability power >= level (N-3) ability power for same class (no regression)
- [ ] Human verification: player can level a character to 10 and observe distinct, functional abilities at each unlock point
```

Do not modify any existing section. Insert the section immediately before the `---` separator that precedes `## Milestone Success Criteria`.
  </action>
  <verify>Grep ROADMAP.md for "Phase 21" — must appear in at least 2 locations (overview table + section header)</verify>
  <done>ROADMAP.md contains a Phase 21 overview table row and a full Phase 21 section with goal, scope, requirements, and success criteria</done>
</task>

<task type="auto">
  <name>Task 2: Update STATE.md phase status table</name>
  <files>.planning/STATE.md</files>
  <action>
In STATE.md, add a new row to the Phase Status table (after the Phase 20 row):

```
| 21 | Class Ability Balancing & Progression | Pending (not yet planned) |
```

Also update the "Next action" line in the Current Position section. Change:
```
**Next action:** Plan Phase 5 (LLM Architecture) when ready, or continue quick tasks for balance/polish
```
To:
```
**Next action:** Plan Phase 5 (LLM Architecture) when ready, or plan Phase 21 (Class Ability Balancing), or continue quick tasks for balance/polish
```
  </action>
  <verify>Grep STATE.md for "21" — must find it in the phase status table</verify>
  <done>STATE.md phase status table includes Phase 21 row as Pending</done>
</task>

</tasks>

<verification>
- `ROADMAP.md` contains "Phase 21" in the overview table
- `ROADMAP.md` contains "### Phase 21:" section with goal, scope, requirements, and success criteria
- `STATE.md` phase status table has a row for Phase 21
- No existing content was removed or modified (only additions)
</verification>

<success_criteria>
Phase 21 is fully registered in ROADMAP.md and STATE.md. A developer running `/gsd:plan-phase 21` would have sufficient context to produce a proper plan from the section content.
</success_criteria>

<output>
After completion, create `.planning/quick/218-add-phase-for-class-ability-balancing-an/218-SUMMARY.md` using the summary template.
</output>
