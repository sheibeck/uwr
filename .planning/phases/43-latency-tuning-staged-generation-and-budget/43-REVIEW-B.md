---
phase: 43-latency-tuning-staged-generation-and-budget
part: B
reviewed: 2026-10-01T09:23:52Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - spacetimedb/src/data/llm_indicator_lines.ts
  - spacetimedb/src/data/llm_indicator_lines.test.ts
  - spacetimedb/src/data/llm_layers.ts
  - spacetimedb/src/data/llm_layers.test.ts
  - spacetimedb/src/data/llm_schemas.ts
  - spacetimedb/src/data/llm_schemas.test.ts
  - spacetimedb/src/helpers/llm_inputs.ts
  - spacetimedb/src/helpers/llm_inputs.test.ts
  - spacetimedb/src/helpers/creation_generation.ts
  - spacetimedb/src/helpers/creation_generation.test.ts
  - spacetimedb/src/helpers/llm_apply.ts
  - spacetimedb/src/helpers/llm_apply.test.ts
  - spacetimedb/src/helpers/llm_apply.characterization.test.ts
  - spacetimedb/src/helpers/llm_sweeper.ts
  - spacetimedb/src/helpers/llm_sweeper.test.ts
  - spacetimedb/src/helpers/world_gen.ts
  - spacetimedb/src/helpers/world_gen.test.ts
  - spacetimedb/src/helpers/renown_llm.test.ts
  - spacetimedb/src/reducers/creation.ts
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/reducers/llm_cutover.test.ts
  - src/composables/generationLocks.test.ts
  - src/composables/useCharacterCreation.ts
  - src/composables/useLlmStatus.ts
  - src/composables/useLlmStatus.test.ts
  - src/composables/useWorldGeneration.ts
findings:
  critical: 0
  warning: 3
  info: 6
  total: 9
status: issues_found
---

# Phase 43 (Part B): Code Review Report

**Reviewed:** 2026-10-01T09:23:52Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Part B covers staged world generation (`world_gen_start` then the `world_gen` fill), the staged class reveal (`creation_class_reveal` then the `creation_class` fill), the step machines and the sweeper holder sets, the rotating Keeper progress lines, and the client input locks. The review used `git diff a991aa30..HEAD`. It also ran `tsc --noEmit` on the module and the 13 reviewed test files (`vitest --maxWorkers=1`). All 1021 tests pass.

What holds up under adversarial tracing:
- **Step guards.** Every apply and failure path is gated on the state's own step: GENERATING or FILLING for world gen, and GENERATING_CLASS or CLASS_FILLING for the class. A late, stale or duplicate stage result cannot overwrite a newer state.
- **Go-back.** Go-back is blocked during GENERATING_CLASS and CLASS_FILLING. From CLASS_FILL_ERROR it can only run when no fill job is active.
- **Retries.** A fill retry re-reads its input from stored rows. The stage-1 and stage-2 routes use separate dedupe keys because the route is part of the key.
- **Sweeper.** Holder sets are split by stage: `world_gen_start` holds PENDING/GENERATING, `world_gen` holds FILLING, and `creation_class` holds CLASS_FILLING. Each stage degrades to its own error step.
- **Prompt input.** The new volatile builders pass every stored string through `sanitizeWorldData` (`w`/`wm`).
- **Pronouns.** New copy and prompts follow the rule: the Keeper is he, NPCs are male or female, the player is "you".
- **`intent.ts`.** It has no other undefined identifiers. `tsc` reports no "Cannot find name" there. Every name destructured from `deps` and every `deps.X` exists in `reducerDeps` in `index.ts`. The only `tsc` errors in the file are bigint/number typing noise at lines 989-991. They predate this phase and are safe at runtime because `vendorSellBonus` values are whole numbers.

The defects found are about the player getting stuck or being told the wrong thing. None corrupts data:
- The stage-1 job counts against its own successor's per-player cap.
- A starter region whose fill failed is a one-room dead end that new same-race characters are also placed into.
- A refused class fill tells the player "Patience" when only their input can retry it.

## Warnings

### WR-B01: The stage-1 job counts against its own stage-2 enqueue, so the fill is refused 'busy'

**File:** `spacetimedb/src/helpers/world_gen.ts:560-575`, `spacetimedb/src/helpers/creation_generation.ts:173-181` (called from `spacetimedb/src/helpers/llm_apply.ts:378` and `:546`)
**Issue:** The executor runs `deps.apply` while the stage-1 job is still `status: 'received'`. It marks the job `completed` only after apply returns (`llm_executor.ts:558-559`).
- `enqueueLlmJob` for the fill calls `countActiveCappedJobs`. That count includes every active job, including the `received` stage-1 job that is being applied.
- `LLM_PLAYER_MAX_ACTIVE_JOBS` is 3, and neither `world_gen` nor `creation_class` is in `LLM_CAP_EXEMPT_ROUTES`.

So a player with two other capped jobs running (for example an NPC conversation plus a skill offer, or a held renown offer) gets their stage 2 refused with `busy` by their own stage 1:
- World gen goes straight to FILL_ERROR with `WORLD_FILL_REFUSED_MESSAGE`, after the stage-1 call succeeded and was billed.
- The class goes to CLASS_FILL_ERROR (see WR-B03 for what the player is then told).

Stage 2 continues a request that was already admitted, so the cap should not count against it twice.
**Fix:** Pick one:
- Exempt the continuation routes:
  ```ts
  export const LLM_CAP_EXEMPT_ROUTES = Object.freeze([
    'combat_narration', 'renown_perk_gen', 'world_gen', 'creation_class',
  ] as LlmRoute[]);
  ```
- Or let the stage-2 enqueue exclude the job being applied: pass `excludeJobId` through `EnqueueArgs` and skip it in `countActiveCappedJobs`.

Either way, add a test in which the player holds two other active capped jobs when stage 1 applies, and assert FILLING / CLASS_FILLING.

### WR-B02: A starter region whose fill failed is a one-room dead end, and same-race characters are placed into it

**File:** `spacetimedb/src/helpers/world_gen.ts:423-425`, `:592-616`, `:271-327`
**Issue:**
- For a starter state (`sourceLocationId === 0n`), `writeRegionStart` connects the start location to nothing. Only `writeRegionFill` writes the uncharted boundary.
- When the fill fails or is refused (budget, kill switch, ceiling, malformed reply), the region becomes FILL_ERROR. It has exactly one safe location with no exits, no enemies and no edge.
- `reuseStarterRegion` matches any region with `starterForRace` set, which stage 1 already writes (`llm_apply.ts:484-487`). It does not check whether that region's fill finished. Every later character of that race is therefore placed in the same one-room region, with the arrival text "Try [look] ... or [travel] to move." (`world_gen.ts:324`). `[travel]` then answers "There is nowhere to go from here."

`[explore]` recovers this only when the explorer's own budget allows. If the cause was the daily cost limit, the ceiling or the kill switch, these players are walled in until it lifts. The "stage-1 region stays playable" decision holds for non-starter regions, which keep the passage back, but not for starter regions.
**Fix:** Either:
- Have `failWorldFill` give an incomplete starter region a way out: write the uncharted boundary (connected to the start location) when the region has none, so `travel` can trigger generation; or
- Skip reuse of a starter region whose generating state is not COMPLETE: look up the state by `generatedRegionId` in `reuseStarterRegion` and fall through to a fresh `world_gen_start` when it is FILLING or FILL_ERROR.

Also stop promising `[travel]` in the reuse arrival text when the home location has no connections.

### WR-B03: A refused class fill tells the player to wait, but nothing will retry without input

**File:** `spacetimedb/src/helpers/creation_generation.ts:159-164`, `:181`; `spacetimedb/src/helpers/llm_apply.ts:370-378`
**Issue:** When `startClassFill` is refused, `toError(llmRefusalMessage(result.refused))` posts the bare refusal line and parks the state at CLASS_FILL_ERROR.
- For `busy` that line is "The Keeper is already considering something for you. Patience." For `halted`/`ceiling` it is "The Keeper is resting. Return later."
- It comes right after the reveal's milestone line, "...so do not touch anything." (`CLASS_REVEAL_MILESTONE_LINE`).
- CLASS_FILL_ERROR only retries on the player's next input. A player who follows the "Patience" instruction waits forever: no job exists and the sweeper never touches CLASS_FILL_ERROR.

The world-gen counterpart (`failWorldFill`) appends "Type [explore] to try again."; this path appends nothing. Only the `start_creation` resume line (`creation.ts:350`) explains that any input retries, and the player sees it only after a reload.
**Fix:** Append the retry instruction on every refusal into CLASS_FILL_ERROR:
```ts
if (result.refused) {
  return toError(`${llmRefusalMessage(result.refused)} Say anything when you want him to try the rest again.`);
}
```
The same suffix belongs on the `applyLlmFailure` resting branch for `creation_class` (`llm_apply.ts:180`). There, `LLM_RESTING_LINE` is posted without it.

## Info

### IN-B01: An oversized stage-2 request throws inside the stage-1 apply and discards a good stage 1

**File:** `spacetimedb/src/helpers/world_gen.ts:551-566`, `spacetimedb/src/helpers/creation_generation.ts:166-180`
**Issue:**
- `startWorldFill` and `startClassFill` wrap the input builder in `try`, but not `enqueueLlmJob`.
- `enqueueLlmJob` throws on `requestJson.length > LLM_REQUEST_JSON_MAX_CHARS`, which is deterministic for a given input.
- In the stage-1 apply, that throw rolls back the whole apply twice (`LLM_APPLY_MAX_ATTEMPTS`). The job ends as `apply_error`, and the state drops to ERROR / AWAITING_ARCHETYPE, even though the billed stage-1 reply was valid.
- `WorldFillInput` carries model text with no length limit (start description, neighbor `threats` JSON for every neighbor region).

The limit is 64k characters, so this is unlikely but not impossible.
**Fix:** Catch the throw around `enqueueLlmJob` in both helpers and route it to `failWorldFill` / `toError(CLASS_FILL_FAILED_LINE)`. Or truncate the free-text fields of the stage-2 input, which is better.

### IN-B02: The rotation starts mid-pool, contrary to the documented "fresh indicator looks as it did before"

**File:** `src/composables/useLlmStatus.ts:159-170`, `spacetimedb/src/data/llm_indicator_lines.ts:94-96`
**Issue:** `tick` is one counter that starts when App mounts and increases forever. A job that becomes active at tick 7 opens on `pool[7 % 3]`, not `pool[0]`. The doc comment says "pool[0] is always the Phase 42 line for the route, so a fresh indicator looks as it did before". That is only true at tick 0.
**Fix:** Either reset the rotation when the winning row's id changes (keep a per-row start tick, `rotation - startTick`), or correct the comment.

### IN-B03: NPC placement uses exact-case names while location dedupe is case-insensitive

**File:** `spacetimedb/src/helpers/world_gen.ts:827`
**Issue:** Locations are deduped and `connectsTo` is resolved with `byLowerName`, but an NPC's `locationName` is looked up in `byExactName` only. An NPC whose `locationName` differs only in case, or that names a location skipped as a duplicate, silently lands at the start location.
**Fix:** `const npcLocation = byExactName.get(npc.locationName) ?? byLowerName.get(lower(npc.locationName)) ?? startLocation;`

### IN-B04: A class can reach CLASS_REVEALED with two abilities while the copy says three

**File:** `spacetimedb/src/helpers/llm_apply.ts:412`, `spacetimedb/src/reducers/creation.ts:597`
**Issue:** `applyClassFillResult` accepts a fill that adds only one ability (`cls.abilities.length < 2` is the only reject). The ability prompt then still says "I presented three abilities". It is also unclear whether a two-ability kit is acceptable given the "exactly 2 more abilities" contract.
**Fix:** Either require `cls.abilities.length >= 3` (fail the fill into CLASS_FILL_ERROR so the player can retry), or build the error line from `abilities.length`.

### IN-B05: In-flight pre-split jobs are released by the sweeper while still running

**File:** `spacetimedb/src/helpers/llm_sweeper.ts:291-301`
**Issue:** A `world_gen` or `creation_class` job queued before this deploy holds a GENERATING / GENERATING_CLASS state. The holder sets now credit those routes only to FILLING / CLASS_FILLING, so after 60 s the sweeper fails the state while the old job is still in flight. The old result is then dropped by the step guard (the call is wasted), or, for the class, picked up later as the 'duplicate' of a new fill.

This is a one-time transition effect. Per the project's greenfield rule it may be acceptable, but nothing documents it.
**Fix:** Note it in the deploy checklist, or clear active `llm_job` rows when publishing this phase.

### IN-B06: Stale or unreachable leftovers in the touched code

**File:** `spacetimedb/src/helpers/world_gen.ts:224`, `spacetimedb/src/reducers/creation.ts:30`
**Issue:**
- The `StarterRetryOutcome` doc still says "its world_gen job enqueued". It is now a `world_gen_start` job.
- `determineGoBackTarget` still maps `GENERATING_CLASS`, but go-back is gated off at GENERATING_CLASS (line 467), so that branch is dead. The new CLASS_FILL_ERROR special case sits outside the `switch` instead of being a `case` alongside it.
**Fix:** Update the comment, drop the dead `GENERATING_CLASS` case, and move the CLASS_FILL_ERROR mapping into the `switch`.

---

_Reviewed: 2026-10-01T09:23:52Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
