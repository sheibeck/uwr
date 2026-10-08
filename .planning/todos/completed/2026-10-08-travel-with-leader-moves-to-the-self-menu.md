---
created: 2026-10-08T11:30:00.000Z
title: Travel with leader moves to the self menu; follow icon beside your name
area: ui
files:
  - src/social/TravelSwitch.vue
  - src/frame/VitalsRail.vue (TravelSwitch under the self block)
  - src/rails/PartyBlock.vue (sheet variant renders the switch)
  - src/social/playerMenu.ts:124-126 (travelWithLeader / stopTravelWithLeader self entries already exist)
  - src/social/FollowIcon.vue
---
## Problem

The owner, 2026-10-08, verbatim: "As for the Travel with Leader panel, we really want to save that left bar realestate for party view, let's have the Travel with leader show up in the right-click context menu on your own character panel. Then add the icon next to your name to show if you are travelling with leader or not as a hint."

Phase 51.1 put a `Travel with leader` switch (TravelSwitch) under the self block in the desktop vitals rail. It also appears in the mobile Party sheet. On the desktop rail it takes space the owner wants for the party list.

## Solution

- Remove the TravelSwitch from the desktop vitals rail.
- The self menu (⋯ and right-click on your own block) already offers `Travel with leader` / `Stop travelling with leader` (`playerMenu.ts` self entries). Make sure it shows whenever you are a non-leader party member, out of combat.
- Show a FollowIcon beside your own name in the self block when you are in a party and not the leader: footprints means travelling with the leader, person-simple means staying. Give it a tooltip and a screen-reader phrase (`followPhrase`).
- Mobile Party sheet: decide whether the switch stays there (the sheet has room) or moves to the self card's ⋯ too. Default: keep the sheet as built and change only the desktop rail. Confirm with the owner.
- Update the 51.1 UI-SPEC "Travel with leader" section and the VitalsRail/TravelSwitch tests. Leave the server and `set_follow_leader` unchanged.
