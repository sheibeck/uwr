---
created: 2026-09-30T04:40:00.000Z
title: Make NPC secret and per-player memory tables private
area: backend
priority: high
files:
  - spacetimedb/src/schema/tables.ts:124-159
  - spacetimedb/src/schema/tables.ts:1654-1670
---

## Problem

Phase 40 research (40-RESEARCH.md, Open Question 8) found three tables that are `public: true` and expose data that is meant to stay hidden. Any connected client can subscribe to every row:

- `npc` (`tables.ts:124`): `personalityJson` holds the NPC's hidden personality, including the secrets revealed as affinity rises. `baseMood` is exposed too.
- `npc_memory` (`tables.ts:1654`): `memoryJson` is each player's summarized conversation memory with each NPC (topics, secrets shared, gifts), for **every** player.
- `npc_dialog` (`tables.ts:145`): every player's NPC dialog lines.

REQUIREMENTS SEC-01 says "No client can read another player's prompts, **NPC secrets** or LLM outputs". Phase 40 covers only the new `llm_*` job tables, and the public `llm_task` prompt leak closes in Phase 42. These NPC tables are outside both. Making them private breaks the client, which subscribes to `npc` for names, descriptions and greetings. The change needs:
- public projection views: a public NPC view without `personalityJson`, plus per-sender views for `npc_memory` and `npc_dialog` built by index lookup on the caller's characters
- a client subscription change

## Solution

- Keep `npc` public-facing data in a public projection (id, name, npcType, locationId, description, greeting, factionId) and move `personalityJson`/`baseMood` behind a private table or column split. SpacetimeDB has no column-level privacy, so it has to be a table split or a private table plus a public view.
- Make `npc_memory` and `npc_dialog` private, and add per-sender views (`my_npc_memory`, `my_npc_dialog`) that filter by the sender's character ids via index lookup (no `.iter()`).
- Update the client subscriptions and composables to the views. Regenerate bindings.
- Private tables and views need a two-publish migration, following the Phase 42 legacy-removal pattern. Never use `--clear-database`. Publish locally only; the user deploys maincloud.
- Unit tests: a privacy recorder test asserts the three tables are not public, and the views return only the caller's rows.
- Candidate home: Phase 42 (Client Cutover and Legacy Removal) scope review, or a follow-up quick task after v2.2.
