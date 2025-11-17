# Unwritten Realms — System Overview

## Vision
Unwritten Realms is a living text MMORPG inspired by Kyle Kirrin's *Shadeslinger*. Players converse with an AI game master through a Vue 3 interface, while SpaceTimeDB maintains an authoritative, low-latency world graph. Every command can reshape zones, NPCs, quests, and factions in real time, yet the experience remains coherent through deterministic validators, lore guardrails, and operational tooling.

## Experience pillars
1. **Conversational adventuring** — A natural-language loop where players issue commands or prose and receive AI-driven prose plus structured outcomes.
2. **Collaborative world-building** — The AI can introduce regions, factions, and events while obeying canon tags and balance budgets.
3. **Persistent stakes** — Character progress, renown, and world states persist across sessions with rollback-safe audits.
4. **Transparent systems** — Players can inspect state (combat logs, quest branches, faction standings) without breaking immersion.

## High-level architecture
| Layer | Responsibilities | Key tech |
| --- | --- | --- |
| Client (Vue 3 + Vite) | Auth, chat/command console, event log, inspectors (world map, zones, characters, quests, renown dashboards) | TypeScript, Pinia/Query, Tailwind | 
| Edge/API | Auth providers, rate limiting, webhook ingest, file uploads, feature flags | Auth0/Supabase, Cloudflare Workers/AWS Lambda |
| AI Orchestrator | Prompt templating, function-calling schema, response validation, moderation, action batching | Node/TS or Rust service, OpenAI/Anthropic APIs |
| Data fabric | Authoritative state, transactional mutations, changefeeds, scheduled jobs | SpaceTimeDB modules + TypeScript bindings |
| Ops & Tooling | Observability, content moderation, replay/rollback, load testing | OpenTelemetry, Grafana, internal admin UI |

### Core data flow
1. Player submits text via Vue client.  
2. Client sends payload + session context to AI Orchestrator.  
3. Orchestrator builds prompt: last N messages, relevant lore, current DB snapshot.  
4. LLM returns JSON actions (e.g., `character.level`, `npc.create`).  
5. Validator ensures schema + policy compliance, resolves references, assigns trace IDs.  
6. Validated actions invoke SpaceTimeDB stored procedures.  
7. Changefeeds stream deltas to all subscribed clients; audit logs persist for replay.  

## Fundamental modules
- **World graph** — World → Regions → Zones hierarchy with biome tags, instancing rules, travel costs, and event hooks.  
- **Entity systems** — Characters, NPCs, factions, items, quests, encounters, rituals. Each entity has canonical IDs plus AI-authored metadata bound to lore tags.  
- **Progression & renown** — XP, attributes, abilities, gear, renown ledgers, faction unlocks, titles, and spirit-tech attunements.  
- **AI governance** — Function schemas, confidence scoring, cooldown budgets per action type, human review queues.  
- **Operations** — Moderation dashboard, rollback tooling, telemetry & alerting, content pipelines for narrative staff.  

## Security & trust
- JWT-authenticated sessions; SpaceTimeDB access rules enforce per-account visibility.  
- Action throttles per character/zone to prevent AI or player exploits.  
- Structured audit tables (`ai_command_log`, `player_action_log`) with trace + span IDs for observability.  
- Automated lore compliance tests verifying that entity tags map to canonical Shadeslinger references.

## Success metrics
- <500 ms P95 from player command to visible world update under 2k concurrent users.
- 99% of AI actions validated without manual intervention (remaining 1% routed to moderation).
- 0 unresolved lore conflicts per release (tracked via validation suite).
- At least 5 concurrent narrative arcs evolving via live events without downtime.
