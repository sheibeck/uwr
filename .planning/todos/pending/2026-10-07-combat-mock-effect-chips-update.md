---
created: 2026-10-07T00:00:00Z
title: Implement the updated UWR Combat mock (effect chips for players and enemies)
area: ui
files:
  - src/combat/
  - src/combat/effectChipsGuards.test.ts
  - src/frame/VitalsStrip.vue
---

## Problem

The owner, 2026-10-07 (verbatim): "here is an updated combat mock. It updates how we handle our effect chits for both players and enemies"

Design source (re-import fresh when planned; never cached): claude_design MCP (`https://api.anthropic.com/v1/design/mcp`, auth via `/design-login`), project "Unwritten Realms" (id `1a7a975f-7b14-488b-9a38-188bc56294cf`): https://claude.ai/design/p/1a7a975f-7b14-488b-9a38-188bc56294cf?file=UWR+Combat.dc.html
- Focus file: `UWR Combat.dc.html`
- Also read: `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/_ds_bundle.js`, `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/styles.css`, `support.js`
- Implement `UWR Combat.dc.html`.

## Solution

- The same file is the design source of Phase 51.4 Loot Rails (backlog 999.23). Fold the effect-chip changes into Phase 51.4: its fresh import covers both the loot rails and the new effect chips (players and enemies), and its UI-SPEC and plans include both. Update the 51.4 roadmap entry when it is discussed.
- Existing code: the combat encounter rail and chips from Phase 48 (`src/combat/`, the effect chip guard test `src/combat/effectChipsGuards.test.ts`, the mobile vitals strip chips in `src/frame/VitalsStrip.vue`).
- Design guards apply (tokens only, no svg outside src/map/, Phosphor and Inter, sizes 10/12/14/20, weights 400/500, spacing scale).
