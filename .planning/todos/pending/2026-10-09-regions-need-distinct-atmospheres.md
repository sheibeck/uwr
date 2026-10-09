---
created: 2026-10-09T18:00:00.000Z
title: Each region needs its own culture and atmosphere, distinct from its neighbours
area: general
files:
  - spacetimedb/src/data/llm_layers.ts:397 (WORLD_NAMING_RULES) and :760-770 (worldCharacterLines: neighbouring regions' name, biome, threats)
  - spacetimedb/src/helpers/world_gen.ts:175-215 (buildRegionContext: neighbours of the source region only)
---

## Problem

Owner, 2026-10-09: "this goes along with region names. Regions should be unique amongst each other as well. So two regions next to each other both shouldn't have the same atmosphere. Right now we seem to have a world that is very oriented toward ships, brine, salt, water, etc. That's fine for a single region, or even two regions that are far away from each other. But we want diverse cultures and atmospheres for each new region."

Today the world-start prompt lists the neighbouring regions (name, biome, threats) but no rule tells the model to make the new region different, and nothing checks it. The local world drifted into one theme: Kesterlane Basin, Tessarine Shelf, Orrowmere Teeth, Sennet Basin and Kestrane Saltpans are largely salt, brine, tides, wharves and ships.

## Solution

Folded into Phase 51.3.2.1 Region Discovery (success criterion 4), alongside the distinct-names rule. Ideas for its discuss:
- Give each region a short stored theme (culture and atmosphere tags, for example "salt marsh fishers", "high desert caravan towns") from the same call, so later regions can be compared.
- The prompt lists the themes of nearby regions (and the world's most used ones) and asks for something clearly different: another culture, climate, economy and mood.
- A server check: a new region whose theme or biome repeats a neighbour's (or one within two crossings) is flagged; pick from alternates returned in the same call (as for names), no extra paid call.
- Maybe a deterministic nudge: the server suggests a biome or culture family not yet used nearby, and the prompt builds on it.
- Prompt wording needs the owner's explicit approval; tests with no paid calls.
Only new generation is affected (the world is regenerated later).
