---
phase: 41-executor-and-domain-cutover
plan: 18
subsystem: npc-gender-and-pronoun-rule
tags: [spacetimedb, llm, prompts, npc, gender, pronouns, keeper-bible, guard-test, bindings]
status: complete
requires:
  - phase: 41-14 (world-gen cutover; startWorldGeneration and writeGeneratedRegion)
  - phase: 41-15 (legacy purge; live-proof harness)
provides:
  - "data/npc_gender.ts: NPC_GENDERS, genderFromName, inferGenderFromText, resolveNpcGender, npcGender, npcPronouns, npcNoticeLine, npcRegardLine"
  - "npc.gender column (last column, migration default '') and region schema gender enum after name"
  - "Bible pronoun rule (Keeper is he, people he or she, beasts may be it, the player is you) and second-person route blocks"
  - "Gender line in the npc_conversation volatile text, gender snapshotted by talk_to_npc"
  - "pronoun_rules.test.ts static guard (Keeper, name-interpolation, reflexive, no gender on Character)"
affects: [41-16, 41-17]
tech-stack:
  added: []
  patterns:
    - "Every NPC reader goes through npcGender(row); every NPC insert goes through resolveNpcGender"
    - "Prompt lines print only the clamped two-word gender, never the raw stored value"
key-files:
  created:
    - spacetimedb/src/data/npc_gender.ts
    - spacetimedb/src/data/npc_gender.test.ts
    - spacetimedb/src/data/pronoun_rules.test.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/data/llm_schemas.ts
    - spacetimedb/src/data/keeper_bible.ts
    - spacetimedb/src/data/llm_layers.ts
    - spacetimedb/src/data/llm_prompts.ts
    - spacetimedb/src/helpers/world_gen.ts
    - spacetimedb/src/helpers/llm_apply.ts
    - spacetimedb/src/helpers/llm_inputs.ts
    - spacetimedb/src/helpers/skill_offer.ts
    - spacetimedb/src/helpers/creation_generation.ts
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/intent.ts
    - spacetimedb/src/reducers/npc_interaction.ts
    - spacetimedb/src/reducers/groups.ts
    - src/App.vue
    - src/module_bindings/npc_table.ts
    - src/module_bindings/types.ts
key-decisions:
  - "Gender resolution order: valid model value, then pronouns in the NPC's own description and greeting, then FNV-1a of the lowercased name (even hash male, odd female)"
  - "Column default '' keeps the publish non-destructive; no local clear was needed"
  - "Humanoid enemies store no gender; fixed enemy and pet lines are pronoun-free; player characters have no gender"
metrics:
  tasks: 3
  files: 32
  tests_added: "server 2028 -> 2077 (+49); root client 2109 -> 2158"
  suite: "server 52 files, 2077 passed; root 57 files, 2158 passed; spacetime build finished successfully; pnpm build exits 0"
  bible_length: 7872
completed: 2026-09-30
---

# Phase 41 Plan 18: NPC Gender and the In-Game Pronoun Rule Summary

Every NPC the world creates is stored as male or female by a deterministic clamp, the Keeper is he in the Bible and every fixed line, the player's own character is addressed as you, and a static guard test keeps it that way; the column is published locally without a clear and the bindings and build are green.

## What was built

### Task 1: gender vocabulary, column, schema, world-gen writes, NPC lines (commit f0444793)
- `data/npc_gender.ts` (pure, no imports): FNV-1a `genderFromName`, whole-word `inferGenderFromText`, `resolveNpcGender` (only male or female leave it), `npcGender(row)` as the single reader (covers pre-column rows), `npcPronouns`, `npcNoticeLine` (he or she for one NPC, "someone here" for several), `npcRegardLine` (the eight consider lines, same thresholds, NPC pronouns). 24 tests.
- `npc.gender: t.string().default('')` appended as the last Npc column.
- Region schema npc item has `gender: enumOf(NPC_GENDERS)` right after `name`; still lints clean, 0 optional, 0 union parameters. RACE_SCHEMA raceName says "If the player said".
- `writeGeneratedRegion`: model NPCs get `resolveNpcGender(npc.gender, storedName, description + greeting)`; safety-net vendor (The Reluctant Merchant, male) and banker (The Ledger Keeper, female) get a resolved gender. 5 new tests.
- Arrival notice in `startWorldGeneration` (starter reuse) and `applyWorldGenResult` uses `npcNoticeLine`. `intent.ts` consider uses `npcRegardLine`; the quest turn-in fallback is "<his or her> post".

### Task 2: prompt layers (commit f6e134d3)
- Bible edits exactly as listed in the plan (IDENTITY, VOICE first paragraph, brevity sentence, new pronoun paragraph, NAMING, PLAYER INPUT "his rules, his output format", "Never repeat the tags in your output"). Headings, examples and banned phrases untouched. **Final Bible length: 7,872 characters** (about 2,422 tokens at 3.25 chars per token); the 5,000 to 10,000 pins are unchanged.
- Route blocks edited as listed: creation_race, creation_class, skill_gen, renown_perk_gen, npc_conversation and combat_narration each say "as you"; world_gen asks for a gender and says the traveler is you; combat_narration allows a beast to be it.
- `NpcConversationInput.npc.gender`; `buildNpcConversationVolatile` prints `Gender: female (she, her, hers)` or `Gender: male (he, him, his)` after the Role line from `resolveNpcGender`, so a hostile or missing value never reaches the text. `talk_to_npc` snapshots `gender: npcGender(npc)`; `smokeInputFor('npc_conversation').npc.gender` is 'male'.
- system[0] is still the Bible, system[1] the route block, two cache breakpoints (existing tests pass unchanged).

### Task 3: fixed strings, guard, publish, bindings (commits 17d2d594, 285ae569)
- `SKILL_OFFER_MESSAGES.alreadyTaken` and both archetype prompts (race branch in llm_apply, race-reuse branch in creation_generation) fixed; enemy shield line "<enemy> is shielded by <ability>."; group pet line "<name> commands a pet with <ability>."; kick-self "You cannot kick yourself."; App.vue summon prompt "<caster> wants to summon your corpses. Accept?"; legacy `llm_prompts.ts` "describes the character as:" (still existed).
- The incomplete-region failure line already said "his" (41-14 had done it), so nothing to change there.
- `pronoun_rules.test.ts` (10 tests): synthetic cases, then KEEPER_IT_OR_THEY over source and all .snap files under spacetimedb/src, NAME_IT_OR_THEY with the two-entry allowlist (corpse.ts "return to claim them", index.ts "You will never see them again"; each matches exactly one line, stale entries fail), the reflexive guard, and the Character-has-no-gender / Npc-has-gender table check.

## Snapshot entries changed (each file run without -u first; only the named entries failed)

**spacetimedb/src/data/__snapshots__/llm_schemas.test.ts.snap** (2): `RACE_SCHEMA serialization` (raceName description "If the player said"); `REGION_GENERATION_SCHEMA serialization` (npc item gains `gender` enum and `gender` in `required` after `name`).

**spacetimedb/src/helpers/__snapshots__/claude_request.test.ts.snap**, commit 1 (2): `creation_race body snapshot` and `world_gen body snapshot`, schema part only (race description; gender enum and required entry).
Commit 2 (7): `creation_race`, `creation_class`, `world_gen`, `skill_gen`, `npc_conversation` (new Gender line and the Response rules bullet), `combat_narration`, `renown_perk_gen` body snapshots, in route-block text and the race, skill and NPC volatile lines only. `smoke_test` did not change.

**spacetimedb/src/helpers/__snapshots__/submit_llm_result.characterization.test.ts.snap**, commit 1 (6, the world-gen success entries): `starter region`, `non-starter region`, `places the character in a non-safe home location`, `QUIRK: charges the budget to the generation state player`, `QUIRK: a missing character still gets the region written`, `accepts a code-fenced reply`. Changes: npc rows gain `gender` (female for the fixture NPCs, male for The Reluctant Merchant, female for The Ledger Keeper), and the arrival line now reads "Perhaps someone here has something to say." for the several-NPC cases.
Commit 3 (7, creation_race success entries): `applies a valid reply`, `increments an existing budget row`, `accepts a reply wrapped in a markdown code fence`, `accepts a reply with prose around the JSON object`, `does not add a second race_definition`, `Phase 41: a reply without raceName stores "Unknown"`, `Phase 41: clamped - a race reply with out-of-range bonuses`. Change: the archetype prompt "Every creature must choose a path, and you are no exception." No world-gen incomplete-region entry changed (already "his").

## Local publish

First attempt, without a flag, stopped at the prompt (no change applied):

```
Created column in table npc
    + gender: String (default: String("",))
!!! Warning: All clients will be disconnected due to breaking schema changes
The above changes will BREAK existing clients. Do you want to proceed? [y/N]Aborting
```

Second attempt with `--break-clients` (allowed locally):

```
Skipping confirmation due to --yes
Publishing module...
Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a
```

**No `--clear-database` was needed.** The string default was accepted as a migration default, so `llm_config` (the key row) was untouched and the 41-15 dry-run re-check was not required. `spacetime logs uwr --server local`: "Updated program to 2f72a2e9...", "Disconnecting all users", "Database updated", no panic. `pnpm spacetime:generate -y` added `gender` to `npc_table.ts` and `types.ts`. `spacetime sql --server local uwr "SELECT * FROM npc"` shows the `gender` column (table holds 0 rows). No command targeted maincloud.

## Verification
- Server suite `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1`: 52 files, 2077 passed (baseline 2028).
- Root client suite `CI=true pnpm exec vitest run --maxWorkers=1`: 57 files, 2158 passed (baseline 2109).
- `spacetime build -p spacetimedb` finished successfully (existing "tsc not found" warning); `pnpm build` exits 0.
- Acceptance greps: column 1; `gender: resolveNpcGender(` in world_gen 3; `gender: enumOf(NPC_GENDERS)` 1; `npcRegardLine(` in intent 1; `npcNoticeLine(` in llm_apply 1 and world_gen 1; "Perhaps they have something to say|their location" in production 0; "shakes its head|choose its path|kick themselves" in production and snapshots 0; `gender: npcGender(npc)` 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Route blocks still used singular they for the player**
- **Found during:** Task 2 (the new "no route block uses a singular they" test failed)
- **Issue:** The plan's edit list missed two lines: skill_gen "informed by their race, class, archetype and the abilities they already have" and world_gen "the region they wandered beyond". The plan's own behavior (no route block contains "their race") requires them gone.
- **Fix:** "informed by the character's race, class, archetype and the abilities already known" and "the region the character wandered beyond".
- **Files modified:** spacetimedb/src/data/llm_layers.ts (and the claude_request snapshot for skill_gen and world_gen)
- **Commit:** f6e134d3

**2. [Rule 3 - Blocking] Enemy shield line did not match the plan's described wording**
- **Found during:** Task 3. The line at combat.ts near 730 read "<enemy> shields itself with <ability>." The plan's target wording was used ("<enemy> is shielded by <ability>."). No test pinned the old text.
- **Commit:** 17d2d594

Otherwise executed as written. The guard found no hit beyond the plan's list. TDD note: tests and implementation were committed together per task (as in earlier plans), not as separate RED and GREEN commits; the characterization and schema snapshots were confirmed failing before any `-u`.

## Notes for later plans
- **41-16 (live proof):** NPC text can now be checked for he or she agreement with the stored `npc.gender`; the harness reads NPC rows in the `npc_conversation` runner. The region JSON now carries a required gender per NPC, so the first real world-gen response exercises the schema change.
- **41-17 (maincloud runbook):** a maincloud publish of this schema adds the `npc.gender` column with default `''` and will ask for `--break-clients` (clients disconnected, no data loss, no clear). Stored '' rows resolve through `npcGender`.
- `npcGender` is the only sanctioned reader; never read `npc.gender` raw in a prompt or message.

## Known Stubs
None.

## Threat Flags
None. T-41-25 mitigated (clamp plus schema enum, junk-value tests); T-41-26 mitigated (Gender line prints only the clamped word; hostile-value test); T-41-27 mitigated (no clear was needed, key untouched); T-41-14 mitigated (local commands only).

## Self-Check: PASSED
- FOUND: spacetimedb/src/data/npc_gender.ts, spacetimedb/src/data/npc_gender.test.ts, spacetimedb/src/data/pronoun_rules.test.ts, src/module_bindings/npc_table.ts (gender)
- FOUND commits: f0444793, f6e134d3, 17d2d594, 285ae569
