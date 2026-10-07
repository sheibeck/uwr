---
created: 2026-10-06T23:30:00Z
title: Show the bind stone in Nearby with a Bind action
area: ui
files:
  - src/frame/ContextRail.vue
  - src/rails/nearby.ts
  - spacetimedb/src/reducers/characters.ts:122-137
---

## Problem

The owner asked on 2026-10-06 for a bind stone to appear in the right rail's Nearby list, with a standing-stone style icon and a "Bind" action. Today a place's bind stone is only a flag on the location (`location.bindStone`). Players have to know to type `bind`.

## Solution

**Folded into Phase 51.** The rail work there already adds Examine buttons to every Nearby row.

- **When it shows.** When the current location has `bindStone`, Nearby shows a bind stone row.
- **Icon.** Use the closest Phosphor icon; `@phosphor-icons/vue` 2.2.1 has no exact standing stone. The UI-SPEC names the icon.
- **Bind action.** It calls the existing `bind_location` reducer (`spacetimedb/src/reducers/characters.ts:122-137`), which already refuses places without a bind stone.
- **Bound state.** When `character.boundLocationId` is the current place, show "Bound here" instead of the action.
- **Examine.** The row has the Examine eye button like the other rows.
- **Tests.** The row appears only at bind stone locations, Bind calls the reducer, and the bound state shows.
