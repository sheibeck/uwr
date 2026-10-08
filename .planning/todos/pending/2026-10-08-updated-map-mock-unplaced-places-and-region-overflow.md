---
created: 2026-10-08T22:00:00.000Z
title: Implement the updated UWR Map mock - unplaced places and reaching more regions when the top bar runs out of room
area: ui
files:
  - .planning/phases/999.28-compass-true-map/design/UWR Map.dc.html (imported mock)
  - .planning/phases/999.28-compass-true-map/999.28-MAP-MOCK-DIFF.md (mock vs today's map)
  - src/map/MapScreen.vue, MapSheet.vue, MapMeta.vue, RegionsListbox.vue, GraphPlane.vue, MapLegend.vue
---
## Problem

The owner, 2026-10-08: "here is an updated mock for the map. It includes the unplaced icons and also addresses issues with how to view more region maps when you run out of space at the top". Design source: `UWR Map.dc.html` in the claude_design project `1a7a975f-7b14-488b-9a38-188bc56294cf` (imported into the 999.28 folder).

Two parts:
1. **Unplaced places** (icons and the Unplaced strip): part of backlog 999.28 Cartographer map, which needs server-side direction knowledge per character.
2. **Region overflow**: today the region chips across the top of the map run out of room once a player knows many regions. The mock shows how to reach the rest. This is a change to the map we already have and may not need 999.28.

## Solution

TBD. Read `999.28-MAP-MOCK-DIFF.md` (MM-xx items). Decide with the owner whether the region overflow part ships now as a quick task or a small phase, and fold the unplaced-places part into 999.28 when it is promoted. Design guards apply (tokens, scales, 44px targets, `<svg>` only under src/map). Unit tests required.
