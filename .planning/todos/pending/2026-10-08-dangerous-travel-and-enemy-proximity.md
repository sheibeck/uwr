---
created: 2026-10-08T20:00:00.000Z
title: Dangerous travel - enemy proximity (near and far) and aggro on entering or leaving a place
area: combat
files:
  - spacetimedb/src/reducers/movement.ts or wherever move_character lives (arrival and departure)
  - spacetimedb/src/helpers/location.ts (spawns, groupCount, ensureSpawnsForLocation)
  - spacetimedb/src/reducers/combat.ts (startCombatForSpawn, start_combat pulls)
  - spacetimedb/src/reducers/items_gathering.ts (the existing gather ambush, ~line 85)
  - src/rails/enemies.ts, src/rails/NearbyList.vue (how enemies are listed)
---
## Problem

The owner, 2026-10-08, verbatim: "I have a question. when we travel into a location, is there any sort of an aggro check that might cause combat by entering a location? We want travel, particularly when you travel above your level to feel dangerous. So, just being able to travel freely without fear of getting jumped by enemies is boring. With a narrative game, proximity is something that we don't really have since we aren't in a 3d space. Could we devise some sort of proximity system. this is just an idea, but maybe you can have creatures that are Near and Far. Near creatures are in your aggro proximity.  I don't know, I'm still thinking about how we would interact with enemies in a zone to represent the idea of how close or far they are, groups of mobs verses just single. Something that makes travel through a location \"dangerous\" without it turning into just a bunch of sub-locations within a location. Although, that's also an idea, that you sort of have sub-locations or instances you move through. And the more dense with mobs a location is, the harder it is to travel into or out of without provoking an attack."

**Answer to the question (2026-10-08 scout): no.** Arriving at or leaving a place never starts a fight. Fights start only from:
- a pull (`start_combat`; careful pull of one Nearby enemy, quick task 261006-a0i), which may bring the spawn's group (`enemy_spawn.groupCount`, scaled by region danger);
- the gather ambush ("As you reach for {node}, {enemy} notices you and attacks!", `finish_gather`);
- quest aggro (quest item pickups, `reducers/quests.ts`) and named-enemy pulls.

So travel is safe everywhere, whatever the level gap.

## Ideas to explore (owner's thinking, plus options)

- **Near and Far enemies.** Each spawn at a place is either Near (in your aggro range) or Far. Near enemies can notice you; Far ones cannot until they drift closer or you approach. Nearby could group them under "Near" and "Far" headings.
- **Aggro checks on arrival and departure.** Entering or leaving a place rolls against the Near enemies: the chance rises with how many there are (density), how much higher their level is than yours (con), and their kind (aggressive creatures vs passive). Leaving through a crowded place is as dangerous as entering it.
- **Groups vs singles.** A Near group is more likely to notice you, and a noticed group attacks together (ties to the pull-size discussion in Phase 51.3.1).
- **Counterplay.** Sneak, invisibility and lull utility abilities (backlog 999.4), moving carefully (slower travel, lower chance), travelling with a party, or clearing the Near enemies first.
- **Sub-locations or instances.** The owner's alternative: a place has a few areas you move through, and density per area decides the risk. Keep it optional; the owner prefers danger "without it turning into just a bunch of sub-locations within a location".
- **Narration.** "A Salt-Crust Skitterer spots you as you cross the flats." Server text only (no client-made lines); any prompt wording change needs the owner's approval.

## Ties

- Phase 51.3.1 Combat Dials: dials for aggro chance by difficulty, region and enemy type, and pull size; discuss this there or right after.
- Backlog 999.4: sneak, invisibility, lull abilities; threat.
- 261008-ag8 spawn levels: the con gap is now real (spawns take the place's level), so above-level travel can be scored.

## Solution

TBD. Decide where it lives (51.3.1 discuss, a new phase after it, or backlog) and design in discuss. Unit tests required: deterministic rolls (seeded), chance by density, con and kind, no check in safe places, counterplay modifiers, party behaviour (offline members never pulled in, as CR-02).
