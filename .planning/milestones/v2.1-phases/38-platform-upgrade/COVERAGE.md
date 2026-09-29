# API Coverage — Phase 38 Platform Upgrade (SpacetimeDB SDK 2.10.1, openai 7, hono 4.13, wrangler 4.14x)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> This phase is a version bump of EXISTING integrations. Every capability the project already uses is INTEGRATE, meaning it must keep working on the new versions and is verified by the plans. Capabilities the project does not use are OPT-OUT with a reason. Adopting them would be feature work, which CONTEXT.md places out of scope or in deferred todos.

| capability | decision | reason |
|---|---|---|
| spacetimedb-client: DbConnection.builder (uri, database name, token) | INTEGRATE | |
| spacetimedb-client: connect/disconnect/connect-error callbacks (2.10) | INTEGRATE | |
| spacetimedb-client: generated bindings (camelCase + snake_case aliases) | INTEGRATE | |
| spacetimedb-vue: SpacetimeDBProvider / useTable / useReducer / useSpacetimeDB | INTEGRATE | |
| spacetimedb-client: reducer calls with object syntax | INTEGRATE | |
| spacetimedb-client: view subscriptions (14 my_* views, now with primary keys) | INTEGRATE | |
| spacetimedb-server: tables, indexes (accessor), reducers, lifecycle hooks | INTEGRATE | |
| spacetimedb-server: views (ViewContext) | INTEGRATE | |
| spacetimedb-server: scheduled tables (function-form scheduled, ScheduleAt.time) | INTEGRATE | |
| spacetimedb-cli: build, generate, local publish, start, sql, version | INTEGRATE | |
| spacetimedb-vue: useProcedure | OPT-OUT | explicitly out of scope: adopting new 2.10 features is a deferred idea in CONTEXT.md |
| spacetimedb-server: procedures + ctx.http.fetch | OPT-OUT | not in scope: covered by the deferred spike todo to retire llm-proxy |
| spacetimedb-server: table.clear() | OPT-OUT | explicitly out of scope: new 2.10 feature, deferred |
| spacetimedb-server: onSchedule registration form | OPT-OUT | not needed: the legacy function-form scheduled option stays supported in 2.10.1 |
| spacetimedb-client: ConnectionManager auto-reconnect | OPT-OUT | not available to the Vue provider (React/Solid/Svelte only); adding reconnect is feature work |
| spacetimedb-cli: publish to maincloud | OPT-OUT | explicitly out of scope: production deploys are manual and done by the user only |
| spacetimedb-cli: logs --level / lock / mcp | OPT-OUT | explicitly out of scope: new 2.10 CLI features, deferred |
| openai: chat.completions.create (messages, optional response_format) | INTEGRATE | |
| openai: completion usage token counts | INTEGRATE | |
| openai: Responses API | OPT-OUT | not in scope: version bump of existing usage only |
| openai: streaming | OPT-OUT | not in scope: version bump of existing usage only |
| openai: embeddings, images, audio, files, batch, moderation, realtime | OPT-OUT | not in scope: version bump of existing usage only |
| hono: routing (GET /, POST /api/llm) | INTEGRATE | |
| hono: cors middleware | INTEGRATE | |
| hono: bearer-secret auth middleware | INTEGRATE | |
| wrangler: dev (local smoke) | INTEGRATE | |
| wrangler: deploy / secret put | OPT-OUT | explicitly out of scope: never deploy from this phase; production is manual |
| cloudflare workers-types: global worker types via tsconfig types | INTEGRATE | |
