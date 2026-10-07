---
created: 2026-10-07T01:00:00Z
title: Party UX with a pet HUD and travel-with-leader indicators (UWR Party)
area: ui
files:
  - src/rails/PartyBlock.vue
  - spacetimedb/src/schema/tables.ts:1103
  - spacetimedb/src/reducers/groups.ts
---

## Problem

On 2026-10-07 the owner sent an updated party mock that adds a **pet HUD** and **travel-with-leader indicators**, and asked to implement it. The party block in the left vitals rail does not show pets or who will follow the leader when the party travels.

## Solution

**Folded into Phase 51.** That phase already builds the party menus from `UWR Party.dc.html` (backlog 999.22), the Follow leader switch, and the one-button party travel with party stamina in the left rail.

**Design source** (re-import fresh when planning; never cached):
- claude_design MCP (`https://api.anthropic.com/v1/design/mcp`, auth via `/design-login`). Project "Unwritten Realms" (id `1a7a975f-7b14-488b-9a38-188bc56294cf`): https://claude.ai/design/p/1a7a975f-7b14-488b-9a38-188bc56294cf?file=UWR+Party.dc.html
- Focus file: `UWR Party.dc.html`. Also read `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/_ds_bundle.js`, `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/styles.css` and `support.js`.
- Import: session scratchpad `design51/party2/PARTY2-EXTRACT.md`.

**Planning notes:**
- **Pets:** the server has an `active_pet` table (`spacetimedb/src/schema/tables.ts:1103`), and combat tables have pet target columns. Research confirms who can read pet rows, whether pets exist outside combat, and what the HUD needs, such as health, owner or commands. Any server change is additive and published locally only.
- **Follow indicators:** these show which members have Follow leader on and will come along when the leader travels (`group_member.followLeader`, `set_follow_leader`), with stamina warnings.
- **Phase 51 decisions to follow:**
  - The design guards apply.
  - The real left vitals rail is used, not the mock's copy.
  - Clicking a party member in combat still sets the ally target.
  - Menus open from a ⋯ button and from right-click.
- **Tests:** a pet row per owner, the follow indicator per member, and stamina warnings.
