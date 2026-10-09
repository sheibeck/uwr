---
created: 2026-10-09T16:30:00.000Z
title: Name the region's discoverer in the World event announcement, with credit and renown
area: general
files:
  - spacetimedb/src/helpers/world_gen.ts:98-152 (WORLD_EVENT_TEMPLATES, DISCOVERY_TEMPLATES, pickWorldEventMessage, pickDiscoveryMessage)
  - spacetimedb/src/helpers/llm_apply.ts:589-593 (the World event line, written when stage 2a lands)
  - spacetimedb/src/helpers/world_gen.ts finishRegionFill (the private discovery line at COMPLETE)
  - spacetimedb/src/helpers/renown.ts:12 awardRenown, :257 awardServerFirst (renown_server_first table)
  - spacetimedb/src/data/renown_data.ts:492 RENOWN_GAIN
---

## Problem

Owner, 2026-10-09: "When a player explores a new region for the first time, the world event anouncement should make much of their name ... sarcastically so. And they should get credit for the discovery + renown! The world event anouncment should anounce their name."

Today:
- The World event line for a new region (`pickWorldEventMessage`, written in `llm_apply.ts` when the places land) names only the region it lies beyond, never the player: for example "The map trembles at its borders. {sourceRegion} is no longer the edge of things." It does not even name the new region.
- The discoverer gets only a private line (`DISCOVERY_TEMPLATES`, for example "You step into {regionName}. It has always been here. You were simply the first to notice.").
- No renown and no recorded credit. The server-first machinery already exists (`awardServerFirst` writes `renown_server_first` with the character's name and position; boss kills use it), so a region discovery can be a server first with category `region_discovery` and key `region_{id}`.

## Solution

Decided by the owner: the announcement names the discoverer and makes much of them, sarcastically; it also names the new region (owner, 2026-10-09: "And it should also anounce the name of the new Region"); the discoverer gets credit and renown. Moved into its own Phase 51.3.2.1 Region Discovery (owner: "Let's add a new phase for that discovery anouncement. Not just a small task.").

Build notes:
1. **Announcement:** new World event templates with `{playerName}`, `{regionName}` and `{sourceRegion}`; send it when the region is COMPLETE (finishRegionFill), not when the places land, so the name and the region arrive together with the crossing opening (7c). Static templates (no LLM call, deterministic pick as today). No first person, never "ripple", no pronouns for the player (use the name). **Exact wording needs the owner's approval.** Drafts to react to:
   - "Hear ye: {playerName} has wandered past the edge of {sourceRegion} and found {regionName}. We are told this is a great achievement."
   - "Let it be written in very large letters: {playerName} discovered {regionName}. The land was there all along, but who are we to spoil the moment."
   - "Trumpets, please. {playerName} the Intrepid has stumbled into {regionName}, beyond {sourceRegion}. Mapmakers weep with gratitude, or possibly at the handwriting."
   - "The world grows past {sourceRegion}, and {playerName} would like everyone to know who got there first. {regionName} has been discovered, and so, apparently, has greatness."
   - "Somewhere beyond {sourceRegion}, {playerName} has found {regionName} and is already insufferable about it."
2. **Credit:** record the discoverer on the region (a defaulted `discoveredByCharacterId` / name column, additive) or read it from `renown_server_first`; show "Discovered by {name}" where the region is shown (Map region chip/detail, World events history). Decide which.
3. **Renown:** `awardServerFirst(ctx, character, 'region_discovery', 'region_{id}', RENOWN_GAIN.REGION_DISCOVERY_BASE, 'Discovered {regionName}')` then `awardRenown`, with a new named constant (amount for discuss, for example 100; tuning waits for 52.5). A private reward line with the renown gained.
4. **Who counts:** the character whose travel started the generation (`world_gen_state.playerId`). Decide: does the party waiting at the crossing share the credit; does a race's starter region (made at character creation, sourceRegionId 0) count as a discovery (probably not, it is a starting home).
5. Tests: the template pick names player, region and source; one award per region (never twice on a retry or a HELD join); renown and server-first rows written; starter regions excluded (if so decided); the announcement sent once at COMPLETE.
