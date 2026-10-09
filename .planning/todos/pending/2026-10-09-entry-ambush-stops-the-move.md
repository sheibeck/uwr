---
created: 2026-10-09T12:00:00.000Z
title: An ambush on entering a place stops the move, like an ambush on leaving
area: general
files:
  - spacetimedb/src/helpers/travel.ts (~L380-420, the enter roll after the move; ~L200-226, the leave roll that already returns before moving)
  - spacetimedb/src/data/density_lines.ts (~L212-216, ambushLeadIn 'enter')
  - spacetimedb/src/data/density_lines.ts encounterSource ('ambush_enter': "Ambushed on the way in.")
---

## Problem

Owner, 2026-10-09: "when travelling out of a region, if you get attacked, you should not also travel. The attack prevents you from leaving. ... Do not allow the travel to happen. That's what makes travel dangerous."

Today the leave roll already stops the move (travel.ts returns false after the ambush), but the enter roll runs after the traveller has arrived: the party moves into the destination and then fights there. The feed reads "As you cross into Mother Pan Undercroft, one skitterer bursts out of the dark!" and the character is already at Mother Pan Undercroft.

## Solution

- Roll the enter encounter (against the destination's pools, as today) BEFORE the move. On a hit, the traveller and the whole travelling party stay at the place they were leaving and the fight starts there; the move does not happen. No hit: move as today (the quiet travel line).
- Lead-in wording. Owner's text: "As attempt to cross into Mother Pan Undercroft, one skitterer bursts out of the dark!" (missing "you"). Proposed exact lines for the owner to approve:
  - solo: `As you attempt to cross into {Place name}, ` (owner's wording with "you" added)
  - party: `As your party attempts to cross into {Place name}, `
- Check the knock-on effects: the encounter source line "Ambushed on the way in." (still true?), the encounter foot `{Place name} · {Rating}` (now the origin place), the Map closing on combat, party follow, the crossing hold of 51.3.1.2 (an uncharted crossing never rolls), and the tests that pin arrival-then-fight (`travel` and `pool_text` integration tests).
- Server change plus one approved copy change; local publish with the key check. Candidate home: a quick task, or alongside Phase 51.3.1.2's travel work (D-15 hold also edits travel.ts).
