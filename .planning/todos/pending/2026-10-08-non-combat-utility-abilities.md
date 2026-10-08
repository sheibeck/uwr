---
created: 2026-10-08T11:16:03.011Z
title: Non-combat utility abilities that actually work
area: general
files:
  - spacetimedb/src/data/mechanical_vocabulary.ts:84-129 (utility, travel, craft_boost, gather_boost kinds)
  - spacetimedb/src/helpers/skill_budget.ts (BASE_BUDGET per kind)
---
## Problem

The owner wants abilities that are not just for combat (2026-10-08): "abilities that improve crafting, travel or travel speed, invisibility, lull, gathering, etc. Utility spells that aren't just for combat."

The mechanical vocabulary already lists the kinds `utility` (out-of-combat only), `travel` (movement speed boost or location reveal), `craft_boost` (next crafting quality), `gather_boost` (next gathering yield), plus travel cost effects (`travel_cost_increase`, `travel_cost_discount`). Each has a power budget in `skill_budget.ts`. It is not known whether skill generation offers them, whether casting them out of combat works end to end, or whether any system reads their effects:
- travel speed against the cross-region travel timer
- crafting quality
- gathering yield

There are no kinds for invisibility or stealth (avoid aggro or pulls) or lull (calm an enemy or reduce the chance of adds).

## Solution

TBD. Start with an audit:
1. For each existing non-combat kind, check whether it is generated, castable out of combat, and wired to the system it should affect.
2. Fix the gaps.
3. Then add new kinds (invisibility or stealth, lull) through the mechanical vocabulary with budgets, server rules and tests.

This ties into 51.3.1 Combat Dials (lull and invisibility interact with pull size and aggro), Phase 51.3 (gather and craft rates read the economy dials) and Phase 51.5 (new skill flow). Any new or changed generation prompt wording needs the owner's approval.
