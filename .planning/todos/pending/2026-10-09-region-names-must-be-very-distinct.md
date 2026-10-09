---
created: 2026-10-09T16:45:00.000Z
title: Region names must be very distinct from every other region name
area: general
files:
  - spacetimedb/src/data/llm_layers.ts:397 (WORLD_NAMING_RULES, prompt-only guidance)
  - spacetimedb/src/data/llm_layers.ts:760-770 (worldCharacterLines: the prompt sees neighbouring regions only)
  - spacetimedb/src/helpers/world_gen.ts:175-215 (buildRegionContext: neighbours of the source region only)
  - spacetimedb/src/helpers/llm_apply.ts:554 (the stage-2a apply takes data.regionName as given)
---

## Problem

Owner, 2026-10-09: "Also, Kestrane Saltpans sounds a lot like Kesterlane Basin. We want rules to make sure that Region names are distinct. Very distinct from one another."

Today (code read 2026-10-09):
- The only guard is prompt text (`WORLD_NAMING_RULES`): "location and region names MUST be diverse", a list of overused words to avoid, and "Every place name in the region is unique" (within one region only).
- The prompt sees only the regions next to the source region (`buildRegionContext`), never the full list of region names in the world, so it cannot avoid a name used two regions away.
- The server accepts `data.regionName` as given: no exact-duplicate check and no similarity check.

So "Kestrane Saltpans" next to "Kesterlane Basin" passes every rule.

## Solution

TBD (discuss; prompt wording needs the owner's explicit approval). Proposal, prevention plus a server rule:
1. **Server rule (the authority, pure and tested):** `regionNameTooClose(candidate, existingNames)` in a data rules file. Compare the distinctive word (usually the first word, ignoring "The", "Of" and the feature word such as Basin, Saltpans, Reach), lowercased with accents stripped: too close when the words are equal, share a prefix of 4+ letters ("Kest-"), or are within a small edit distance (for example a similarity ratio of 0.7 or more, "Kestrane" vs "Kesterlane"). Also flag the same feature word with a near-identical first word. Thresholds live as named constants.
2. **Prevention in the prompt:** pass the names of ALL existing regions (they are few, so it stays small) as "names already in use; the new name must not look or sound like any of them", plus a short rule in `WORLD_NAMING_RULES` (different first letter and sound from the names listed).
3. **What happens on a clash, without a paid retry:** ask the model for the region name plus 2 alternates (`regionNameAlternates`) in the same call; the server takes the first candidate that passes the rule; if none pass, keep the best one and log it (the owner's review list), or fall back to a deterministic suffix-free rename rule (discuss). No extra call.
4. **Place names too (discuss):** apply the same rule to place names across the world (or at least within a region and its neighbours) so "Kestrane Flats" and "Kesterlane Flats" never sit side by side.
5. Tests: the Kestrane/Kesterlane pair and other near-misses are rejected; clearly different names pass; the first passing alternate is used; the prompt lists every existing region name; the golden fixtures and the `claude_request` snapshot updated. No paid calls in tests.
Needed before the owner regenerates the world (memory: world-regenerated-from-scratch), since only new generation is affected. Candidate home: a small phase or quick task after 51.3.2, or fold into the next phase that touches world generation.
