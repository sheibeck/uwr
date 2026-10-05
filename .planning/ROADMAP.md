# Roadmap: UWR

## Milestones

- ✅ **v1.0 MVP** -- Phases 1-23 (shipped 2026-02-25)
- ✅ **v2.0 The Living World** -- Phases 24-30 (shipped 2026-03-09)
- ✅ **v2.1 Project Cleanup** -- Phases 31, 32, 38 (shipped 2026-09-29; 33-37 parked in Backlog)
- ✅ **v2.2 LLM — Claude Engine** -- Phases 39-44 (shipped 2026-10-05; 41, 43, 44 human verification deferred)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-23) -- SHIPPED 2026-02-25</summary>

See `.planning/milestones/v1.0-ROADMAP.md` for full details (if archived).

- Phases 1-23: Character creation, combat, inventory, crafting, quests, NPCs, world events, renown, travel, death/corpse, config tables, auth, subscription optimization

</details>

<details>
<summary>✅ v2.0 The Living World (Phases 24-30) -- SHIPPED 2026-03-09</summary>

- [x] Phase 24: LLM Pipeline Foundation (3/3 plans) -- completed 2026-03-07
- [x] Phase 25: Narrative UI Shell (3/3 plans) -- completed 2026-03-07
- [x] Phase 26: Narrative Character Creation (3/3 plans) -- completed 2026-03-07
- [x] Phase 27: Procedural World Generation (3/3 plans) -- completed 2026-03-07
- [x] Phase 28: Dynamic Skill Generation (3/3 plans) -- completed 2026-03-07
- [x] Phase 29: NPC & Quest Generation (3/3 plans) -- completed 2026-03-07
- [x] Phase 30: Narrative Combat (4/4 plans) -- completed 2026-03-09

See `.planning/milestones/v2.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.1 Project Cleanup (Phases 31, 32, 38) -- SHIPPED 2026-09-29</summary>

- [x] Phase 31: Test Infrastructure (3/3 plans) -- completed 2026-03-09
- [x] Phase 32: Dead Code Removal (3/3 plans) -- completed 2026-03-09
- [x] Phase 38: Platform Upgrade (8/8 plans) -- completed 2026-09-29

Phases 33-37 parked in the Backlog as 999.1-999.5. See `.planning/milestones/v2.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.2 LLM — Claude Engine (Phases 39-44) -- SHIPPED 2026-10-05</summary>

- [x] Phase 39: Procedure-to-Claude Spike (11/11 plans) -- completed 2026-09-29
- [x] Phase 40: Claude Request Layer and Job Seam (10/10 plans) -- completed 2026-09-30
- [x] Phase 41: Executor and Domain Cutover (18/18 plans) -- code complete; human verification deferred
- [x] Phase 42: Client Cutover and Legacy Removal (7/7 plans) -- completed 2026-09-30
- [x] Phase 43: Latency Tuning, Staged Generation and Budget (15/15 plans) -- code complete; human verification deferred
- [x] Phase 44: Live Verification and Tone Eval (10/10 plans) -- QUAL-03 proven; QUAL-01 and QUAL-02 deferred by the owner

Known gaps (QUAL-01, QUAL-02, Phase 41/43 live checks, maincloud) are listed in `.planning/MILESTONES.md`. See `.planning/milestones/v2.2-ROADMAP.md` for full details.

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-23 | v1.0 | All | Complete | 2026-02-25 |
| 24-30 | v2.0 | 22/22 | Complete | 2026-03-09 |
| 31, 32, 38 | v2.1 | 14/14 | Complete | 2026-09-29 |
| 39-44 | v2.2 | 71/71 | Shipped (3 phases human verification deferred) | 2026-10-05 |

## Backlog

### Phase 999.1: Combat Improvements (BACKLOG)

**Parked:** 2026-09-29 from v2.1 Phase 33 — on hold while core project concepts are re-imagined. Artifacts kept in `.planning/phases/999.1-*/` (files retain their original `33-` prefixes).
**State when parked:** all 5 plans' code landed; 33-03 (enemy HUD effect tags, commit 4dacfd1b) has no SUMMARY; 33-VERIFICATION.md is `human_needed` and predates gap plans 33-04/33-05 — needs 33-03 reconcile + re-verification

**Goal**: Players see complete, informative combat feedback and encounter balanced difficulty
**Originally depended on**: Phase 31 (combat tests enable safe rebalancing), Phase 32 (clean codebase) (backlog items are unsequenced)
**Requirements**: COMB-01, COMB-02, COMB-03, COMB-04, COMB-05, COMB-06, COMB-07
**Success Criteria** (what must be TRUE):

  1. Player sees per-tick damage/healing entries in the combat log with effect name and amount for every DoT and HoT
  2. Player sees buff/debuff application and expiration entries in the combat log with stat, magnitude, and duration
  3. Enemy HUD shows active DoT, HoT, and debuff icons with remaining duration countdown
  4. Player can engage multiple enemy groups simultaneously without combat state corruption
  5. Damage and healing constants are tuned and validated by passing test assertions

**Plans**: 5 plans

Plans:

- [ ] 33-01-PLAN.md -- Combat log narrative messages, buff/debuff lifecycle events, balance tuning
- [ ] 33-02-PLAN.md -- Multi-enemy pull fixes, remove puller role restriction
- [ ] 33-03-PLAN.md -- Enemy HUD effect indicators with color coding and duration countdown
- [ ] 33-04-PLAN.md -- Gap closure: fix CREATION_ABILITY_SCHEMA field mismatch (effect -> kind)
- [ ] 33-05-PLAN.md -- Gap closure: enable mid-combat pull via narrative enemy clicks

Promote with /gsd-review-backlog when ready.

### Phase 999.2: Narrative UI Integration (BACKLOG)

**Parked:** 2026-09-29 from v2.1 Phase 34 — on hold while core project concepts are re-imagined. Artifacts kept in `.planning/phases/999.2-*/` (files retain their original `34-` prefixes).
**State when parked:** 34-01 and 34-02 summarized; 34-03 code landed (commits 0e809ea4, dcbaad24, e041231a, d29430ba, eb05ef49) without a SUMMARY; no CONTEXT.md; 34-UAT.md never run — needs 34-03 reconcile + verification

**Goal**: Players can sell items, manage multiple named hotbars, and use abilities outside combat entirely through the narrative console with styled event feedback
**Originally depended on**: Phase 32 (dead code removed, shared helpers exist) (backlog items are unsequenced)
**Requirements**: NARR-01, NARR-02, NARR-03, NARR-04, NARR-05
**Success Criteria** (what must be TRUE):

  1. Player can type `sell <item>` and the item is sold with correct gold calculation including perk bonuses
  2. Player can type `sell all junk` or `sell 3 <item>` for bulk sales with a summary of what was sold
  3. Hotbar is visible at all times (not just combat) showing ability slots with cooldown timers
  4. Player can create multiple named hotbars, switch between them with arrows, and manage slots via commands
  5. Event feed entries are color-coded by kind (combat=red, reward=gold, system=gray, social=blue)

**Plans**: 3 plans

Plans:

- [ ] 34-01-PLAN.md -- Fix sell perk bonus, add sell all junk and sell N commands, complete event colors
- [ ] 34-02-PLAN.md -- Hotbar schema (Hotbar parent table), server reducers, intent commands
- [ ] 34-03-PLAN.md -- Persistent hotbar UI, multi-hotbar navigation, remove bottom action bar

Promote with /gsd-review-backlog when ready.

### Phase 999.3: Dynamic Equipment Generation (BACKLOG)

**Parked:** 2026-09-29 from v2.1 Phase 35 — on hold while core project concepts are re-imagined. Artifacts kept in `.planning/phases/999.3-*/` (files retain their original `35-` prefixes).
**State when parked:** not started (no context, research or plans)

**Goal**: Equipment drops are unique, level-appropriate, and dynamically generated -- no more selecting from a static pool
**Originally depended on**: Phase 32 (mechanical vocabulary extracted), Phase 33 (combat math stabilized) (backlog items are unsequenced)
**Requirements**: EQUIP-01, EQUIP-02, EQUIP-03, EQUIP-04, EQUIP-05
**Success Criteria** (what must be TRUE):

  1. Defeating an enemy drops equipment with stats scaled to enemy level and world tier
  2. Generated equipment stats (AC, damage, bonuses) are computed from formulas, not looked up from hardcoded tables
  3. Quest reward equipment is dynamically generated matching the quest difficulty tier
  4. The static WORLD_DROP_GEAR_DEFS constant is gone, replaced by a generation function
  5. Generated equipment names use the existing prefix/suffix affix system

**Plans**: TBD

Plans:

- [ ] 35-01: TBD
- [ ] 35-02: TBD

Promote with /gsd-review-backlog when ready.

### Phase 999.4: Ability Expansion (BACKLOG)

**Parked:** 2026-09-29 from v2.1 Phase 36 — on hold while core project concepts are re-imagined. Artifacts kept in `.planning/phases/999.4-*/` (files retain their original `36-` prefixes).
**State when parked:** all 5 plans executed and summarized; never verified (stopped at the 36-05 human-verify checkpoint); renown-perk flow depends on working LLM calls

**Goal**: The ability system covers all game systems with diverse ability types, pure buffs/debuffs, functional race abilities, per-level heritage bonuses, and renown perks unified into the dynamic ability system
**Originally depended on**: Phase 32 (mechanical vocabulary complete), Phase 33 (combat dispatch stable) (backlog items are unsequenced)
**Requirements**: ABIL-01, ABIL-02, ABIL-03, ABIL-04, ABIL-05, ABIL-06, ABIL-07, ABIL-08, ABIL-09, ABIL-10, ABIL-11
**Success Criteria** (what must be TRUE):

  1. mechanical_vocabulary.ts includes ability kinds for combat, crafting, gathering, travel, social, songs, auras, pets, fear, and summoning
  2. Server dispatch handles all new ability kinds without hardcoded special cases
  3. Pure buff abilities (stat boosts, haste) and pure debuff abilities (slow, fear) work without damage components and are castable outside combat
  4. Race abilities are functional in-game (minor passive/active effects, not just narrative text)
  5. Heritage bonuses apply every level and are shown during character creation and level-up
  6. Renown perks use the dynamic ability system with LLM-driven selection at rank-up
  7. Abilities track source (Class, Renown, Race) for display and filtering
  8. Client ability dispatch renders and activates all new ability kinds without hardcoded special cases

**Plans**: 5 plans

Plans:

- [ ] 36-01-PLAN.md -- Vocabulary expansion (new ABILITY_KINDS), schema (source/abilityKey columns), BASE_BUDGET entries
- [ ] 36-02-PLAN.md -- Heritage bonus every-level fix, race ability data definitions
- [ ] 36-03-PLAN.md -- Server dispatch for all new kinds, pure buff/debuff fix, LLM skill gen expansion, race ability granting
- [ ] 36-04-PLAN.md -- Renown perks as dynamic abilities, PendingRenownPerk table, LLM perk generation flow
- [ ] 36-05-PLAN.md -- Client-side renown perk choice UI (header notification, perk selection in console)

Promote with /gsd-review-backlog when ready.

### Phase 999.5: UX Polish (BACKLOG)

**Parked:** 2026-09-29 from v2.1 Phase 37 — on hold while core project concepts are re-imagined. Artifacts kept in `.planning/phases/999.5-*/` (files retain their original `37-` prefixes).
**State when parked:** not started (no context, research or plans)

**Goal**: Players can customize text size for comfortable reading across all UI elements
**Originally depended on**: Nothing (independent of other phases) (backlog items are unsequenced)
**Requirements**: UX-01, UX-02, UX-03, COMB-08
**Success Criteria** (what must be TRUE):

  1. Player can increase and decrease the global font size of the entire application
  2. Font size preference persists across browser sessions via localStorage
  3. Group info panel text is sized for readability at all font scale settings

**Plans**: TBD

Plans:

- [ ] 37-01: TBD

Promote with /gsd-review-backlog when ready.

### Phase 999.6: Complete UX Overhaul — UWR Ledger Screens design (BACKLOG)

**Goal:** Rebuild the client UX to match the "UWR Ledger Screens" design, which uses the Nocturne design system. This is a complete UX overhaul. Captured 2026-09-29.

**Source design (import via the claude_design MCP):**

- MCP endpoint: `https://api.anthropic.com/v1/design/mcp`. Authenticate with `/design-login`.
- Project: https://claude.ai/design/p/1a7a975f-7b14-488b-9a38-188bc56294cf?file=UWR+Ledger+Screens.dc.html (the whole project is readable).
- Focus file and implementation target: `UWR Ledger Screens.dc.html`.
- Files the selection imports, which must also be read:
  - `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/_ds_bundle.js`
  - `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/styles.css`
  - `support.js`
- Design updated by the owner on 2026-10-05 (same project, same files). Re-import from the MCP when this is promoted; never work from a cached copy.

**Notes:**

- Response shape is decided here (owner, 2026-10-05). The Phase 44 tone review deferred reply-shape choices to this overhaul: speaker attribution, splitting narration from dialogue, and what highlighting and journals need. Inputs and affected routes and schemas are in `.planning/phases/44-live-verification-and-tone-eval/44-TONE-FIXES.md` ("Open question for the UX overhaul"). The Keeper's voice target is story-like prose in the first person ("I"), with speech attributed in the text.
- It overlaps parked 999.2 (Narrative UI Integration) and 999.5 (UX Polish, including UX-01–03 and COMB-08). Reconcile or supersede those when this is promoted.
- It is unsequenced relative to the v2.2 LLM milestone. Phase 43 adds staged reveals and Keeper progress lines to the console, so check for UI conflicts if both are active.

**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.7: Natural-language input is hijacked by bare command words (BACKLOG)

**Goal:** Typing a sentence that starts with a command word reaches the conversation or intent handler, not the command system.

- Example: in an NPC conversation, "Who is that over there?" does nothing, because the first word `who` routes the whole line to the `who` command.
- **Cause:** `onNarrativeSubmit` in `src/App.vue` (about lines 1181-1188) sends any input whose first word is in `clientHandledCommands` to `submitCommand()`. The list is `who`, `accept`, `decline`, `leave`, `invite`, `kick`, `promote`, `whisper`, `w`, `friend`, `endcombat`, `end`, `endc`, `group`, `renown`, `factions`, `faction` and `events`. So "Leave him alone", "End this now", "Accept my apology" and "Group up behind me" are all swallowed too.
- **Fix directions:**
  - Require the `/` prefix for these commands.
  - Or treat a bare word as a command only when the whole input matches the command's exact syntax, such as `who` alone or `invite <name>`.
  - Or always route to the conversation while the player is talking to an NPC.
  - Also check `useCommands.ts` (`/who` or `who`), and check that `NarrativeInput.vue` command hints stay consistent.
- Add tests: every listed word at the start of a natural sentence goes to the intent/conversation path, and the exact command forms still work.
- Captured 2026-09-30 by user report. It may fold into 999.5 (UX Polish) or 999.6 (UX Overhaul).

**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

---
*Last updated: 2026-09-29 after v2.2 roadmap creation (Backlog 999.1-999.5 preserved)*
