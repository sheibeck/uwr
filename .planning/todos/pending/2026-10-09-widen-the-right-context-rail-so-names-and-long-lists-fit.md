---
created: 2026-10-09T15:42:09.374Z
title: Widen the right context rail so names and long lists fit
area: ui
files:
  - src/frame/ContextRail.vue:23 (width 288px, fixed)
  - src/frame/FeedShell.vue:49 (feed text capped at a 760px line, so the centre has spare width)
  - src/rails/HereCard.vue, src/rails/ExitChips.vue, src/rails/NearbyList.vue:678, src/rails/PoolCard.vue:243 (ellipsis on names)
  - src/combat/EncounterPanel.vue (shares the same rail in combat)
  - .planning/phases/45-foundation-frame-and-auth/45-UI-SPEC.md:57,177,203,407,433 (288px rail constant)
---

## Problem

Owner, 2026-10-09: "we have enough information in the right hand panel while exploring that I think it needs to be wider. Place names are sometimes getting cut-off. And when we have enough enemies, gatherables and quests we're really scrolling throug a lot of items. If we can improve that by making it wider that might be helpful. Plus that center panel is all narrative anyway, so we have a lot of space still."

The desktop context rail (Here, exits, Nearby pools, gatherables, tracked quests) is a fixed 288px, copied from the Phase 45 mock. Since Density Pools and Bigger Regions there is more in it: longer place names are cut off with an ellipsis (HereCard, ExitChips, PoolCard, NearbyList), and a busy place means a long scroll. The centre feed already caps its text at a 760px line, so on a wide screen the centre column has unused width to give.

## Solution

TBD (discuss when picked up). Ideas:
- Widen the rail (for example 340-380px), or make it fluid with a clamp (for example `clamp(288px, 24vw, 400px)`) so it grows on wide screens and keeps 288px at the 900px breakpoint.
- With the extra width, consider showing more per row (two columns of pool cards, or names wrapping to two lines instead of an ellipsis) so less scrolling is needed.
- Check that the Encounter panel (same rail in combat) and the Map screen's detail column still look right, and that the 900px desktop breakpoint still fits vitals rail + feed + context rail.
- Update the 45 UI-SPEC rail constant and any width-dependent tests.
Candidate home: Phase 51.5.1 Motion and Polish, or a quick task if the owner wants it sooner.
