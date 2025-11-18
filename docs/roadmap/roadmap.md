# Unwritten Realms Delivery Roadmap

## Phase 0 — Foundations (Weeks 0-4)
- Stand up mono-repo (PNPM workspaces) with packages: `apps/web`, `services/orchestrator`, `packages/spacetime-modules`, `packages/shared-schema` — all in TypeScript.
- Implement lint/test scaffolding (ESLint, Vitest, biome for formatting) with strict TS (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- Create base `tsconfig.base.json` (target ES2022, module NodeNext, path aliases: `@shared/*`, `@schema/*`, `@spacetime/*`). Each package extends it.
- Integrate auth provider (Supabase/Auth0) and create bare `accounts`, `sessions` tables in SpaceTimeDB (TypeScript module bindings).
- Ship Vue shell with authentication, chat console, and static lore viewer.
- Deliver AI prompt templates + lore knowledge base (YAML/JSON) checked into repo.
- Establish shared schema/types package exporting Zod + JSON Schema for orchestrator & client reuse.

## Phase 1 — AI ↔ DB loop (Weeks 5-8)
- Build orchestrator service (TypeScript) with:
  - Prompt builder + function calling schema registry.
  - Validator service (Zod/JSON schema + business rule engine).
  - Action dispatcher calling SpaceTimeDB stored procedures.
- Implement event log + entity inspector panels in the client.
- Add moderation dashboard + rollback tooling for admins.
- Load-test AI action throughput (goal: 500 actions/min sustained).

## Phase 2 — Core Gameplay (Weeks 9-16)
- Flesh out world/region/zone/character/NPC/faction tables per specs.
- Implement travel, combat resolver (turn-based), loot tables, inventory UI.
- Add character creation flow: account holders create one or more playable characters (name, race, class, appearance, starter inventory); wire client UI + reducers + subscriptions.
- Add renown ledger, faction unlock logic, quest journal with branching states.
- Introduce crafting/economy stub plus marketplace UI.
- Build automated scenario tests that replay scripted conversations.

## Phase 3 — Shadeslinger Flavor & Scale (Weeks 17-24)
- Implement rituals/spirit-tech mechanics, multi-faction politics, coordinated world events.
- Add co-op party system, guilds, shared quest progression.
- Localization pass + accessibility options (screen reader friendly chat, high-contrast mode).
- Scale testing to 2k concurrent, chaos testing for orchestrator + SpaceTimeDB resilience.

## Phase 4 — Live Ops & Content (Weeks 25+)
- Tooling for narrative staff: content submission, lore validation, scheduled events.
- Analytics dashboards (retention, AI error rate, renown distribution).
- Monetization hooks (cosmetic unlocks, supporter tiers) respecting lore.
- Continuous balancing + feature flag rollouts.

## Risks & mitigation
| Risk | Impact | Mitigation |
| --- | --- | --- |
| AI hallucinations break canon | High | Strict schema guardrails, lore knowledge graph validation, human-in-loop queue |
| SpaceTimeDB bottlenecks | Medium | Partition world by region, cache read-heavy queries client-side, profile stored procedures |
| Player safety/moderation gaps | High | Content filters, reporting tools, rapid rollback mechanism |
| Scope creep | Medium | Feature gates per phase, weekly roadmap reviews, MVP definitions per system |

## Next steps (actionable)

Priority A — ship and stabilize
1. Add phrase-pattern boosts for combat & crafting idioms and cover them with unit tests (examples: "I charge into battle, my sword raised!", "Craft a healing potion at the alchemy workbench").
2. Document the AJV runtime fallback behavior in `docs/`.
3. Implement subscription lifecycle/eviction policy and add small integration tests against the local Spacetime host.
4. Add structured inference telemetry: log low-confidence inputs with matched cues (verb/noun/phrase) to a dev sink for iterative tuning.

Priority B — reliability & observability
5. Add structured logs/metrics for reducer dispatch results and inference suggestion rates; build a small dashboard or endpoint for quick inspection.
6. Add a basic load-testing harness (orchestrator validation + dispatch) and run ramps to establish a baseline (initial target: 500 actions/min).
7. Harden admin auth and restrict admin UI to local/dev by default.

Priority C — gameplay foundations
8. Flesh out core world tables and reducers: regions, NPCs, inventory, quests, crafting/workbench reducers (Phase 2 work).
9. Add character creation and management: tables/reducers for `characters`, reducers for create/update/delete, client UI and targeted subscriptions so players can select and manage their avatars.
10. Add scenario-based replay tests to validate reducers and end-to-end flows under schema changes.

Status update — current (Nov 2025)
- Prompt schema package implemented; generated JSON schemas are present under `generated/schemas`.
- Orchestrator loads generated schemas at runtime and validates model outputs with AJV; a runtime import fallback is in place.
- BigInt & Spacetime timestamp serialization fixed in API responses; unit tests added.
- Human-in-the-loop hold queue implemented; admin review tools added (CLI + small admin server).
- POC inference (`inferAction`) implemented and expanded to include MMO and crafting/gathering actions; client UI adjusted to surface suggestions inline.
- Unit test coverage added for serialization, inference, and hold flow; local Vitest run is green.

If you'd like, I can start on Priority A.1 (phrase boosts + unit tests) now — provide a short list of failing sentences you want to lock into tests (I'll start with your "I charge into battle, my sword raised!" example unless you prefer others).
