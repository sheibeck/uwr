---
created: 2026-10-08T11:16:03.011Z
title: Friends who start in different zones can find each other
area: general
files:
  - spacetimedb/src/helpers/world_gen.ts (reuseStarterRegion, region.starterForRace)
  - .planning/ROADMAP.md (999.11 starting zones, 999.26 world structure)
---
## Problem

Each race starts in its own starter region (`reuseStarterRegion`, matched on `region.starterForRace`). 999.11 caps the world at 20 starting zones. When two friends create characters of different races, they begin in different zones. Today there is no good way for them to meet: regions are connected only through generated border crossings and passages, and travel between regions is gated by the cross-region timer.

The owner raised this on 2026-10-08: "we might want to consider a way for friends to be able to find one another if they start in different zones."

## Solution

TBD. Ideas to weigh in discuss:
- A "travel to a friend" or "summon to party" path, for example a party invite that offers to move the invitee to the leader's region once, or a bind-stone or portal route between starter zones.
- A meeting hub that every starter zone links to.
- A "find your friend" pointer on the Map showing the route to a friend's region.
- Starting a new character in a friend's zone when it is created from an invite.

This touches 999.11 (race starting zones), 999.26 (world structure), Phase 51.1 (party invites, online status) and Phase 52.2 (friends). Keep the travel timer and the world's sense of distance intact.
