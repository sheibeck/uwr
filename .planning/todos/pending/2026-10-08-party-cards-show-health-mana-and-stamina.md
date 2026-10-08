---
created: 2026-10-08T13:00:00.000Z
title: Every party card shows health, mana (if any) and stamina bars
area: ui
files:
  - src/social/MemberCard.vue (out-of-combat rail card and mobile sheet card)
  - src/social/CombatMemberCard.vue (desktop combat card; already HP + mana-if-any + stamina)
  - src/frame/VitalsStrip.vue (mobile combat grid card; HP only)
  - src/rails/party.ts (PartyMemberView: hp, resource, stamina fields)
---
## Problem

The owner, 2026-10-08, verbatim: "the party ux should show each party members mana and stamina. (unless they don't have mana at all) Everyone has stamina, so every group member should see every other party members resources - health, mana, stamina."

What Phase 51.1 built:

| Surface | Bars today |
|---|---|
| Desktop rail card, in combat (`CombatMemberCard`) | Health, mana (mana users only), stamina. Already right. |
| Desktop rail card, out of combat (`MemberCard`) | Health, plus one "resource" bar: mana for mana users, otherwise stamina. A mana user's stamina appears only as the text `{n} st`. |
| Mobile Party sheet card (`MemberCard` sheet variant) | Health only. Stamina appears as text. |
| Mobile combat grid card (`VitalsStrip`) | Health only. |

## Solution

- Every party member card, on every surface, shows a health bar, then a mana bar only when the member uses mana (`maxMana > 0`, i.e. `resourceKind === 'mana'`), then a stamina bar. Use the same recipe as `CombatMemberCard` (COMBAT3: 4px health, 3px mana, 3px stamina).
- Keep the low-stamina warning: the warning icon and the screen-reader "too low to travel".
- Give each bar its own progressbar semantics and tooltip. The card's accessible name carries all three values.
- The data is already client-side. `partyMembers` has hp, resource and stamina; a separate mana field may be needed if `resource` is mana-or-stamina. Check `party.ts`.
- On mobile, the 3-column combat grid card gets thin mana and stamina bars under the HP bar. Keep the 44px card. Snap sizes to the scale.
- Update the 51.1 UI-SPEC and the MemberCard, PartyBlock, PartySheet and VitalsStrip tests. Client only. Design guards apply.
