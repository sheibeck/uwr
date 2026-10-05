# Phase 47: Console, Rails, Hotbar and Input - Research

**Researched:** 2026-10-05
**Domain:** Vue 3 client on SpacetimeDB 2.10 TS SDK: event-table feed, scoped subscriptions, client-side input routing, hotbar, rails
**Confidence:** HIGH on server facts (read from source and bindings), MEDIUM on three design calls flagged below (S1, S3, S5)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Feed (CON-01, CON-06)**
- **History and reload.** Event tables do not persist rows, so the feed keeps events received since the client connected, in memory and capped at about 300 lines. When the frame opens for the active character, the client sends an automatic `look` through `submit_intent`, the same as the old client, so the scene is always present after a reload. No server change and no persisted feed log.
- **Rendering.**
  - Each segment is its own labelled line: "The Keeper" for narration, and `<NPC> says, "…"` for dialogue, using `speaker` and `speakerNpcId`.
  - Whisper, party chat, system, quest update and ripple / world event lines each get their own labelled style per the Ledger mock.
  - Rows without `segments` (static server lines, older rows) render from `message` with a label for their kind.
  - Text is rendered as text nodes only, never `v-html` (Phase 46 contract A6).
- **Input while an LLM job runs.**
  - The player can keep typing.
  - Narrative sends (`submit_intent`, `talk_to_npc`) wait while that character has a pending LLM job (`my_llm_jobs`), and the Keeper's progress lines (the Phase 43 indicator lines) show in the feed.
  - Commands and chat (`who`, whisper, party chat, group commands) still go through.
  - Staged reveals (world, class) land in the feed as they arrive.
- **Scrolling.** The feed stays pinned to the newest line unless the player has scrolled up. In that case a "New lines ↓" pill appears and returns to the bottom.

**Keywords, rails and Nearby (CON-02, CON-03, CON-04)**
- **Keyword detection is client-side.** The client matches names it already knows from subscribed tables in the line text: NPCs at the location, connected locations, resource nodes, and players here. Dialogue lines also use `speakerNpcId`. There is no server markup or schema change. Keywords render as soft accent spans built with text nodes.
- **Click actions.**
  - NPC: hail, which enters conversation mode.
  - Connected place: travel.
  - Resource node or object: examine, sent as `look at <name>` through `submit_intent`.
  - Player: pre-fills a whisper.
- **Routes out.** Each connected location shows its level range, derived from its danger level (floor(dangerMultiplier/100) as the base level plus the location's levelOffset, the same rule as the old client), or "safe" for safe locations.
- **Nearby players** get Whisper and Invite actions.
- **Vitals rail Invite button** pre-fills `invite ` in the input.
- **Party members** show health bars.
- **Context rail** also shows tracked quests with progress and the active world event with its faction split. The data comes from the existing `my_quests`, `world_event`, `event_contribution` and `faction` tables.

**Input routing (INP-01, INP-02)**
- **Command rule.** Typed text runs as a command only if one of these holds:
  - (a) It starts with `/`.
  - (b) Its first word is a command word AND the rest matches that command's exact shape:
    - `who`, `accept`, `decline`, `leave`, `end`, `endc`, `endcombat`, `renown`, `factions`, `events` and `group` with nothing after them
    - `invite`, `kick`, `promote` and `friend` followed by a single name
    - `w` and `whisper` followed by a name and a message
    - `faction` followed by a name

  Everything else goes to the conversation or intent path. For example, "Who is that over there?", "Leave him alone", "End this now" and "Accept my apology" all reach intent, while `who`, `/who` and `invite Bob` run the command.
- **Routing lives in a pure client module** (`routeInput()`), with a tested matrix covering every command word in both sentence form and exact form. It calls the existing reducers: `submit_command`, `whisper`, `invite_to_group`, `accept_group_invite`, `reject_group_invite`, `leave_group`, `kick_group_member`, `promote_group_leader`, `end_combat`, `send_friend_request_to_character` and `group_message`. Otherwise it calls `submit_intent` or `talk_to_npc`. No server change.
  - The command list and its behavior take the old routing at tag `v2.2-client` (`onNarrativeSubmit`, `useCommands`) as a behavior reference. That code is not ported.
- **Conversation mode** keeps the old behavior:
  - Entering: hailing an NPC (keyword click, `hail X`, `talk to X`) or typing the NPC's bare name starts a conversation.
  - Free text: goes to `talk_to_npc`.
  - Ending: a farewell word (bye, farewell, leave, goodbye, end, quit, exit, back) or a game action (go, look, attack, gather, craft and so on) ends the conversation.
  - Display: a "Talking with <NPC> ✕" chip sits above the input.
- **Input history.** ↑/↓ recall the last 50 sent lines for the session.

**Hotbar and vitals (CON-03, CON-05)**
- **Hotbar placement.**
  - Desktop: a row of iconed ability slots between the feed and the input.
  - Mobile: the same row above the input, scrolling sideways.
  - Exact sizes follow the design import.
- **Using a slot.**
  - Click or tap, plus the number keys 1–0 when the input box is not focused.
  - A slot calls the existing ability reducer the old client used.
  - Cooldowns show as a sweep with the seconds left, from `ability_cooldown` and `item_cooldown`.
  - The round-based combat UI arrives in Phase 48. Until 46.1 the combat engine stays as it is.
- **Hotbar scope.** Switching between the player's existing hotbars (`switch_hotbar`) through a small selector. Creating and deleting hotbars and assigning slots wait for the Character screen (Phase 50).
- **Vitals rail.**
  - HP, MP, SP and XP bars.
  - Each active effect shows its icon, its name and the time remaining, counting down, from `my_character_effects`. Buffs and debuffs are styled differently.
  - Party members show health and an Invite button.
- **Mobile.** The compact strip and the tab bar reach the vitals, routes, Nearby, quests and the active event, at 390×844.

### Claude's Discretion
- Component and file layout inside `src/` (for example `src/console/`, `src/input/`, `src/rails/`).
- How the feed store is built (a composable with a capped array).
- The exact keyword-matching algorithm, provided it is total, case-insensitive on whole words, prefers the longest name, and never throws.
- Exact cooldown animation, and how the progress lines are styled within the Ledger design.

### Deferred Ideas (OUT OF SCOPE)
- **Hotbar editing** (create or delete hotbars, assign slots) goes to Phase 50, the Character screen.
- **Round-based combat UI** goes to Phase 48, after Phase 46.1.
- **The server's "You say to X: …" echo** (46 OQ5) is shown as the server sends it. Changing that is a later decision.
- **Persisted feed history** across reloads would need a server table. It is not planned.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CON-01 | Feed renders labelled lines by kind (Keeper narration, NPC speech, whisper, party chat, system, quest update, ripple / world event) | Q5 (whisper and party-chat formats), event tables section, S4 (markup in no-segment rows), line-kind classification table |
| CON-02 | NPCs, places, objects show as soft accent keywords that hail, examine, travel | Q11 (matcher design and pitfalls), Q3 (no object source), hail path in Q10 |
| CON-03 | Vitals rail: HP, MP, SP, XP, effects with time remaining, party with health and Invite | Q2 (effect time), XP semantics, party data source (S12), `my_character_effects` includes party members |
| CON-04 | Context rail: routes out (levels or safe), Nearby with actions, tracked quests, active world event with split | Q6 (route rule), Q3, Q4 (no faction split exists), quests and `my_quests` semantics, subscription plan Q8 |
| CON-05 | Hotbar with iconed slots, cooldowns, hotbar switching | Q1 (`use_ability`), cooldown semantics, `item_cooldown` has no ability mapping (S9), `switch_hotbar` args |
| CON-06 | While an LLM job runs, progress lines show; staged reveals land in the feed | Q9 (indicator module, priority, rotation, scope), S1, S2, S3 |
| INP-01 | A natural sentence starting with a command word reaches intent/conversation | Q10 (old routing, why it hijacked), routing precedence, matrix |
| INP-02 | Exact command forms still run; every command word tested in both forms | Q10 (reducer arg names), S5 (words with no server handler), Validation Architecture |
</phase_requirements>

## Summary

Phase 47 is almost entirely client work, and the server already carries everything it needs except four things the planner must handle explicitly: (1) the four event tables are `public` and `event: true`, so the SDK never caches them and `iter()` is empty; the feed must be built from `onInsert` callbacks on a **filtered** subscription, which the Phase 45 `bindTable` cannot do; (2) the server's static lines (`look`, quests, stats, help, invites) still contain old `{{color:#hex}}...{{/color}}` and `[bracket]` markup, so rows without `segments` need a cleaning step even though segment text must stay literal; (3) `submit_command` only inserts a `command` row and echoes `> text` (nothing consumes the row), so `who`, `renown`, `factions`, `events` and bare `group` must be answered by the client (the old client rendered them locally) or by `submit_intent`; (4) there is no faction split, no object table and no ability-to-item cooldown mapping, so three UI-SPEC assumptions (A7, A10, and the `item_cooldown` clause) resolve to "not available" and are specified below with the smallest honest fallback.

The hotbar calls `use_ability { characterId, abilityTemplateId, targetCharacterId? }` in and out of combat. That is what the old hotbar did; `use_ability_realtime` is combat-only, was reached only from the old keyword path, and ignores its `targetEnemyId`. Effect time (`roundsRemaining`) is decremented only inside the combat loop; the old `tick_effects` and `tick_hot` schedulers are no-ops, so out of combat the value is frozen and the chip must hide its time (UI-SPEC checker note). The client can tell "in combat" from `character.combatTargetEnemyId != null`, the same signal the server uses in `talk_to_npc`.

Scoped subscriptions are the main architectural work: event tables by `ownerUserId` (private), `locationId`, `groupId`; views (`my_*`) without filters; tables by `characterId`, `locationId`, `id`. All of them are indexed server-side. Typed `where(...)` on event tables generates valid SQL in the installed SDK (verified by running the query builder), and the SpacetimeDB blog documents the same pattern for an event table. Everything else is pure functions with table-driven tests (routing, keywords, line classification, cooldown, level range, XP, polarity, split, time formatting), which is where the Nyquist tests belong.

**Primary recommendation:** Add a small data layer (`bindEventTable` plus keyed bindings with swap-on-applied) next to `bindTable`, expose it to the frame through provide/inject with an inert default so the 45 shell tests keep passing, build every behavior as a pure module first (`routeInput`, `findKeywords`, `classifyLine`, `cleanServerText`, `cooldownRemaining`, `routeLevelRange`, `xpProgress`, `effectView`, `worldEventSplit`), and only then wire the Vue components.

## Settled questions (answers with evidence)

| # | Question | Answer | Evidence |
|---|----------|--------|----------|
| 1 | Hotbar reducer | `use_ability { characterId: bigint, abilityTemplateId: bigint, targetCharacterId?: bigint }` for every state. Pass no target in 47. `use_ability_realtime { characterId, abilityTemplateId, targetEnemyId?, targetCharacterId? }` fails with "Not in combat" outside combat and ignores `targetEnemyId` (it forwards only `targetCharacterId`; enemy choice is `character.combatTargetEnemyId`). The old hotbar always called `use_ability`; `useAbilityRealtime` was called only from the old keyword-click path in `App.vue:1336`. Cooldown row is written by both. | [VERIFIED: spacetimedb/src/reducers/items.ts:779, combat.ts:2624-2700; `git show v2.2-client:src/composables/useHotbar.ts` lines 78, 279-285, 455] |
| 2 | Does `roundsRemaining` decrement outside combat? | No. `tick_effects` and `tick_hot` are no-ops ("effects tick per-round in resolveRound"). The only decrement is `tickEffectsForRound` called from `combat_loop` (1 s interval) for combat participants. Out of combat the value is frozen (Well Fed is inserted with 99 and never counts down; bandage and poultice rows likewise). Show the time only while `character.combatTargetEnemyId != null`. Also: `my_character_effects` returns **the whole party's effects** (`ids` includes every group member), so filter `characterId === activeCharacter.id` for the rail chips. | [VERIFIED: combat.ts:1591-1599, 2495-2552, 2782; combat_constants.ts:5; hunger.ts:59-71; views/effects.ts:9-24] |
| 3 | Nearby "objects" source (A7) | None. No subscribed or public table lists named, examinable objects. Closest data: `location.bindStone` and `location.craftingAvailable` booleans, NPC types `vendor` and `banker`, per-character `quest_item` rows (looted via `loot_quest_item`, not examined), `corpse` rows. Old "objects" were `[bind]`, `[craft]`, `[shop]`, `[bank]` bracket words in the `look` text. Ship the Object row type behind an `objects: []` input and render none. No server change proposed (owner may later want a `location_object` table). | [VERIFIED: grep of every public table with a `locationId`; helpers/look.ts:27-45] |
| 4 | Faction split source (A10) | There is no faction split. `world_event` has `successCounter`/`failureCounter` (+ thresholds) and `failureConditionType` `'time'` or `'threshold_race'`. `faction` appears only inside reward and consequence payloads (`factionId` for faction standing rewards), not as two competing sides. Worse, the counters are only changed by the unguarded admin-style `increment_event_counter` reducer; kills move `event_objective.currentCount` instead. In practice the bar will read 0% / 0% (50/50). See S7. | [VERIFIED: reducers/world_events.ts:118-155, helpers/world_events.ts:70-76, 183-216, combat_rewards.ts:46-56, data/world_event_data.ts] |
| 5 | Whisper and party-chat echo (A13) | Yes, both echo to the sender. `whisper` writes two `event_private` rows kind `whisper`: sender `You whisper to ${target.name}: "${message}"`, target `${sender.name} whispers: "${message}"` (straight quotes, colon). `group_message` writes one `event_group` row, kind `group`, message `${character.name}: ${text}` to the whole group including the sender. `say` writes `event_location` kind `say` `${name} says, "${text}"` with no exclude, so the sender sees it. `talk_to_npc` writes `event_private` kind `say` `You say to ${npc.name}: "${message}"`. Failures use `fail(..., 'whisper')` or `'group'`. No local echo needed for these. | [VERIFIED: commands.ts:310-319, 568-574, 686-722; intent.ts:1554-1575; npc_interaction.ts:136-139] |
| 6 | Route level range and "safe" | Old client rule (MapPanel, region level): `base = floor(region.dangerMultiplier / 100)`; for the locations of that region `minLv = max(1, base + min(levelOffset))`, `maxLv = max(1, base + max(levelOffset))`; label collapses when equal. Server spawn rule per location (what the player actually meets): `target = max(1, base + levelOffset)`; offset 0 means exactly that level, offset != 0 means target-1 to target+1 (min 1). "Safe" = `location.isSafe`: no enemy spawns or combat there. Note the uncharted boundary location is `isSafe: true`, `terrainType: 'uncharted'`, and travelling there starts world generation. Recommendation: S6. | [VERIFIED: v2.2-client MapPanel.vue:216-224; location.ts:26-35, 270-285, 405-418; world_gen.ts:887-905; travel.ts:264-280] |
| 7 | Event-table subscription in SDK 2.10.1 | Event rows are never stored: `TableCache.applyOperations` fires only `insert` callbacks for `isEvent` tables and returns; update messages carry `EventTable` rows as inserts only. `iter()` yields nothing, no `onDelete`/`onUpdate` exist on the type. Subscribing is the same `subscriptionBuilder().subscribe([...])`; a filtered subscription works with the typed builder. No history is delivered at subscribe time, so rows written before `onApplied` or during a disconnect are gone. | [VERIFIED: node_modules/spacetimedb/src/sdk/table_cache.ts:269-283, db_connection_impl.ts:660-690, client_table.ts:144-165] [CITED: spacetimedb.com/docs/tables/event-tables/] [CITED: spacetimedb.com/blog/video-conferencing-over-a-database-with-spacetimedb for `tables.<event>.where(r => r.to.eq(identity))`] |
| 8 | Subscriptions | See "Subscription plan" below. The old client subscribed to whole tables (`player`, `character`, `group`, `group_member`, `hotbar`, `ability_template`, ...) and to `SELECT * FROM event_private` etc. unfiltered, then filtered in memory. The new client scopes everything. | [VERIFIED: v2.2-client useCoreData/useWorldData/useSocialData/useGameData] |
| 9 | Indicator lines | Not a table. `spacetimedb/src/data/llm_indicator_lines.ts` (import-free, safe for `@game-data`) exports `LLM_INDICATOR_LINES`, `LLM_INDICATOR_POOLS` (rotating lines), `LLM_PROGRESS_ROTATE_MS = 5000`, `LLM_INDICATOR_PRIORITY`, `LLM_INDICATOR_ACTIVE_STATUSES`, `LLM_INDICATOR_SILENT_ROUTES`, `LLM_CREATION_CONSOLE_ROUTES`, `LLM_CREATION_ONLY_ROUTES`, `LLM_INDICATOR_FALLBACK_LINE`. The input is the `my_llm_jobs` view (per identity; columns `id, route, status, createdAt, errorCode, userMessage`). The old composable `useLlmStatus.ts` holds the selection logic. Staged reveals for an existing character arrive as ordinary `event_private` rows (kinds `narrative`, `npc`, `system`) with `segments`; the creation-time class reveal uses `event_creation` (Phase 49, not 47). | [VERIFIED: data/llm_indicator_lines.ts; views/llm.ts:95-111; helpers/llm_apply.ts:84-86, 224-260, 550-661; `git show v2.2-client:src/composables/useLlmStatus.ts`] |
| 10 | Old command words and reducers | Table below. | [VERIFIED: v2.2-client App.vue onNarrativeSubmit; useCommands.ts; src/module_bindings/*_reducer.ts] |
| 11 | Keyword matching | Manual leftmost-longest scanner over code points with a per-code-point case fold that preserves string length; no regex built from names. Pitfalls in "Keyword matcher". | [ASSUMED design, reasoned from the JS spec behavior listed] |

### Q10 table: old routing and reducer argument names

Old gate (`App.vue onNarrativeSubmit`): `text.startsWith('/') || firstWord in [who, accept, decline, leave, invite, kick, promote, whisper, w, friend, endcombat, end, endc, group, renown, factions, faction, events]` sent the line to `useCommands.submitCommand`, which matched on `startsWith`, not on shape. That is exactly why "Accept my apology" became `accept_group_invite({fromName: 'my apology'})` and "Who is that over there?" fell through to `submit_command` (an echo only). Everything after the gate went to the conversation/intent path.

| Word | Old behavior | Target in the new client (reducer args are generated-binding names) |
|------|--------------|----------------------------------------------------------------------|
| `who` / `/who` | local list of all online characters (needed whole `player` and `character` tables) | `submit_intent { characterId, text: 'who' }`. The server answers "Players at this location" (intent.ts:730). Behavior change: location, not global. Slash form maps to the same call (a slash line sent to the server only echoes `> /who`). |
| `accept`, `decline` | `accept_group_invite` / `reject_group_invite { characterId, fromName }`; bare form used the single pending invite's `fromName` | same reducers. Bare form: sole pending inviter's name from `my_group_invites` + `character`; otherwise pass `''` and let the server answer "Inviter not found" (no client copy). See S6 for `accept <name>`. |
| `leave` | `leave_group { characterId }` | same |
| `end`, `endc`, `endcombat` | `end_combat { characterId }` | same |
| `invite <name>` | `invite_to_group { characterId, targetName }` | same |
| `kick <name>` | `kick_group_member { characterId, targetName }` | same |
| `promote <name>` | `promote_group_leader { characterId, targetName }` | same |
| `friend <name>` | `send_friend_request_to_character { characterId, targetName }` | same |
| `w` / `whisper <name> <msg>` | `whisper { characterId, targetName, message }` (message outer quotes stripped) | same |
| `/say <msg>`, `say <msg>` | `say { characterId, message }` | not a command word in CONTEXT; `say x` goes to `submit_intent` (server handles it, intent.ts:1546) |
| `/hail <name>` | `hail_npc { characterId, npcName }` | treat like `hail <name>` (below) |
| `group` | local group status text | local formatter (S5) |
| `/group <msg>` | `group_message { characterId, message }` | same (slash form only; bare `group <msg>` is not an exact shape) |
| `renown`, `factions`, `faction`, `events` | local formatters from subscribed data | local formatters (S5) |
| other `/...` | `submit_command { characterId, text }` | same (admin `/llm...`, `/unlockrace`, `/synccontent` are handled inside `submit_command`) |
| dev slashes `/level /grantrenown /spawncorpse /createitem /createscroll /endevent /setappversion /recomputeracial` | mapped to admin reducers | not in CONTEXT; they would silently do nothing through `submit_command`. Open Question 4. |

Hail and conversation (old): `talk|hail|speak [to] <name>` with a known NPC at the location called `enterConversation(npc.id)` then `submit_intent { text }`; a bare NPC name did the same; in conversation any free text went to `talk_to_npc { characterId, npcId, message }` unless the old game-action regex matched (`^(go |look$|attack |gather |craft |bind$|inventory$|backpack$|quests?$|bank$|vendor$|shop$|buy |sell |who$)`) or a farewell word matched (`^(bye|farewell|leave|goodbye|end|quit|exit|back)$`). The old order checked the command gate first, so a bare `leave` always ran `leave_group` even in conversation; CONTEXT now lists `leave` and `end` as farewells, so precedence must be decided (see Routing).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Event rows, scenes, replies, whisper/party echo | API / Backend (SpacetimeDB reducers write event tables) | Browser | Server is source of truth; client only subscribes and renders |
| Feed history, pinning, queue, input history | Browser | — | In memory by decision; nothing persists |
| Keyword detection | Browser | — | Decided: names come from subscribed tables; no server markup |
| Input routing (`routeInput`) | Browser | API (reducers execute) | Decided: pure client module |
| Cooldown, effect, XP, level-range, split math | Browser | Database (rows) | Derived display from rows; server stays authoritative |
| Ability use, travel, gather, hotbar switch, invite | API / Backend | Browser (trigger) | Existing reducers |
| `who`/`renown`/`factions`/`events`/`group` output | Browser (formatters) except `who` | API (`submit_intent` for `who`) | No server handler exists for the four; see S5 |
| Event privacy (who receives which rows) | Database (subscription filters) | Browser | Tables are `public`; the client filter is the only scoping (Security Domain) |
| Layout, mobile compaction, sheets | Browser | — | Phase 45 frame |

## Standard Stack

No new dependency. Phase 47 uses what is installed.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vue | ^3.5.43 | Components, composables, provide/inject | Project stack [VERIFIED: package.json] |
| spacetimedb | 2.10.1 installed (^2.10.1) | SDK: `subscriptionBuilder`, typed `tables.*.where`, `toSql`, generated reducers | Project stack [VERIFIED: node_modules/spacetimedb/package.json] |
| @phosphor-icons/vue | 2.2.1 | All icons (regular weight; fill for the crown) | Only allowed icon set (45 guard) [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^5.0.2 | Unit and component tests | All tests; per-file `// @vitest-environment happy-dom` docblock for components |
| @vue/test-utils | 2.5.1 | Mounting components | Component tests |
| happy-dom | 20.14.5 | DOM for component tests | Resolve source files from `process.cwd()`, not `import.meta.url` |
| postcss | 8.5.28 | Static CSS contract scans | Existing guards (colors, scale) scan new files automatically |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `bindEventTable` | `bindTable` on event tables | `bindTable.refresh()` re-reads `iter()`, which is always empty for event tables. Do not reuse. |
| Whole-table subscriptions like the old client | Scoped `where` subscriptions | Whole tables leak and scale poorly; every table used here has the needed index |
| Regex keyword matching | Manual scanner | Regex from names can throw or backtrack and `\b` is ASCII-only |

**Installation:** none. **Version verification:** `pnpm exec vitest --version` prints 5.0.2 in this repo; `node --version` v22.23.2; `pnpm --version` 11.23.0 [VERIFIED: shell]. The client suite baseline is `pnpm exec vitest run --dir src --maxWorkers=2`: 35 files, 469 tests, all passing, about 70 s [VERIFIED: run today].

## Package Legitimacy Audit

No external package is installed in this phase (UI-SPEC "Registry Safety": none beyond `@phosphor-icons/vue`, already in the project). Audit not applicable.

**Packages removed due to [SLOP] verdict:** none. **Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
                      SpacetimeDB 2.10 (module "uwr")
   reducers -> event_private / event_location / event_group / event_world   (event tables: public, not stored client side)
   views    -> my_character_effects, my_quests, my_llm_jobs, my_group_invites, my_faction_standings
   tables   -> character, npc, resource_node, location(+connection), region, world_event, hotbar*, ability_*, group*, ...
                         |  WebSocket (Phase 45 ConnectionController: conn ShallowRef, reconnect, backoff)
                         v
   src/net/bindTable.ts (persisted tables, keeps rows through reconnect)      src/game/bindEventTable.ts (NEW: onInsert only)
        |  keyed bindings: byUserId | byCharacterId | byLocationId | byGroupId | byIds   (swap-on-applied)
        v                                                                          |
   src/game/gameData.ts (NEW: derives characterHere, nearby, routes, party, quests, event, hotbar, cooldowns)
        |   provide/inject (inert default so 45 shells still mount in tests)         |
        v                                                                          v
   Rails (pure derivations -> VitalsRail, VitalsStrip, ContextRail, Map/Social sheet bodies)     Feed store (cap 300, dedupe, sort, pinned)
                                                                                         |  classifyLine -> segments/kinds -> cleanServerText -> findKeywords
   Composer: input -> routeInput(text, ctx) ----------------------------------------------+--> Feed (echo lines, keyword buttons, progress line)
        |            |-> Narrative queue (gated by my_llm_jobs)  |-> reducers (submit_intent | talk_to_npc | whisper | invite_to_group | ...)
        '-> Hotbar row: slot -> use_ability{characterId, abilityTemplateId}; sweeps from ability_cooldown + shared 250 ms ticker
```

### Recommended Project Structure (discretionary)

```
src/game/            bindEventTable.ts, keyedBinding.ts, gameData.ts, context.ts (provide/inject + inert default), serverClock.ts
src/console/         lines.ts (classify + segment mapping), cleanServerText.ts, whisper.ts, keywords.ts, feedStore.ts,
                     indicator.ts (port of selectLlmIndicator), FeedView.vue, FeedLine.vue, KeeperProgress.vue
src/input/           routeInput.ts, commands.ts (word table), conversation.ts, narrativeQueue.ts, history.ts, Composer.vue
src/hotbar/          hotbar.ts (slots, kind->icon, cooldown math/format), HotbarRow.vue, HotbarSelector.vue
src/rails/           effects.ts, levelRange.ts, party.ts, nearby.ts, quests.ts, worldEvent.ts, xp.ts, *.vue
```
`FeedShell.vue`, `VitalsRail.vue`, `VitalsStrip.vue`, `ContextRail.vue`, `MapScreen.vue`, `SocialScreen.vue` keep their 45 entry points and import the new components.

### Pattern 1: Event-table binding (new)

**What:** attach `onInsert` on the event table handle, subscribe with a typed `where`, expose `applied`, remove listeners with the same function reference on detach. Rows are pushed to a callback (the feed store), not into a `shallowRef` of `iter()`.
**When to use:** `eventPrivate`, `eventLocation`, `eventGroup`, `eventWorld` (`eventCreation` is Phase 49).
```typescript
// Source: modeled on src/net/bindTable.ts (45-04); SDK semantics from node_modules/spacetimedb/src/sdk/table_cache.ts
export function bindEventTable<C extends ConnLike, Row>(opts: {
  table(conn: C): { onInsert(cb: (...a: any[]) => void): void; removeOnInsert(cb: (...a: any[]) => void): void };
  sql: string[];
  onRow(row: Row): void;
}) {
  const applied = ref(false);
  let conn: C | null = null, handle: SubscriptionHandleLike | null = null, table: ReturnType<typeof opts.table> | null = null;
  const listener = (_ctx: unknown, row: Row) => opts.onRow(row);   // SDK passes (ctx, row)
  const detach = () => { table?.removeOnInsert(listener); try { if (handle?.isActive()) handle.unsubscribe(); } catch {} table = null; handle = null; conn = null; applied.value = false; };
  return {
    applied,
    attach(next: C | null) {
      if (next === conn) return;
      detach();
      if (!next) return;
      conn = next; table = opts.table(next); table.onInsert(listener);
      handle = next.subscriptionBuilder().onApplied(() => { if (conn === next) applied.value = true; })
        .onError((...a: unknown[]) => console.warn('[bindEventTable]', opts.sql, ...a)).subscribe(opts.sql);
    },
    dispose: detach,
  };
}
```
Queries (verified to generate valid SQL in the installed SDK):
```typescript
toSql(tables.eventPrivate.where((r) => r.ownerUserId.eq(userId)));   // SELECT * FROM "event_private" WHERE "event_private"."owner_user_id" = 7
toSql(tables.eventLocation.where((r) => r.locationId.eq(locationId)));
toSql(tables.eventGroup.where((r) => r.groupId.eq(groupId)));
toSql(tables.eventWorld);                                           // global, low volume
```

### Pattern 2: Keyed binding with swap-on-applied (new)

The 45 session watchers `dispose()` the old binding and create the new one when the key changes, which empties the rows until the new subscription applies. That is acceptable for `characters` but shows a flash of "No one is nearby" on every move. For location, group, id-list and character keys, keep the old binding's rows until the new binding reports `applied`, then dispose the old one (the old client used subscribe-before-unsubscribe for the same reason). Use `flush: 'sync'` watchers as 45 does.

### Pattern 3: Pure module first, component second

Every behavior in the UI-SPEC test list is a pure function over plain data. Write and table-test the pure module, then keep each `.vue` file a thin renderer. This matches 45 (`vitals.ts`, `frameView.ts`, `deriveScreen.ts`).

### Pattern 4: provide/inject with an inert default

`FeedShell`, `ContextRail` and `VitalsRail` are mounted with no props in the 45 tests (`railsShell.test.ts` mounts `ContextRail` and `FeedShell` bare). Use `inject(GAME_KEY, INERT_GAME)` so those mounts keep working, then update the assertions the new content changes (`railsShell.test.ts`, `VitalsRail.test.ts`, `AppFrame.layout.test.ts`, `frameContract.test.ts`, `tokens.client.test.ts` for 23 tokens). `useScreens()` lives inside `AppFrame`; rails and the feed need `closeScreen()`, `openScreen('vendor'|'events')` and `activeScreen` (hotbar keys, Enter-to-focus, "any action closes the sheet"), so provide those from `AppFrame` too.

### Anti-Patterns to Avoid
- **`bindTable` on an event table:** rows stay empty. Use `bindEventTable`.
- **Unfiltered event subscriptions** (`SELECT * FROM event_private`): receives every player's private lines. Always `where`.
- **Awaiting nothing before the automatic `look`:** the `look` scene row is an event; if the subscription is not `applied` yet the row is lost. Send it after the private-event binding reports `applied`, once per active character id.
- **Regex built from names, `\b`, `toLowerCase()` index reuse:** see Keyword matcher.
- **`v-html`, `innerHTML`:** banned by the 45 guard and by A6.
- **Literal colors, off-scale spacing, negative px margins:** the 45 guards scan every new file. Use `calc()` for the chip-row end button's negative margin (`margin-block: calc((32px - 44px) / 2)`); the scanner strips function groups, a bare `-6px` is flagged.
- **`String.replaceAll`, `Array.prototype.at`, `Object.hasOwn`:** not in the tsconfig `lib` (ES2020). No regex `v` flag.

## Subscription plan (Q8)

All filters below hit an existing index [VERIFIED: schema/tables.ts]. SQL generated with the installed typed builder.

| Scope | Key | Subscribe | Notes |
|-------|-----|-----------|-------|
| Static (45 already) | — | `my_player`, `world_state`, `app_version`, `region`, `location`, own `character`s, own `pending_skill` | `region` and `location` are fully subscribed, so route ranges need no extra query |
| Views, once per connection | — | `my_character_effects`, `my_quests`, `my_llm_jobs`, `my_group_invites`, `my_faction_standings` | views follow `player.activeCharacterId` server-side; no re-key. `my_llm_jobs` is per identity (no character id) and has no primary key (status change = delete + insert, `onUpdate` absent). Filter `my_character_effects` client side to own `characterId` |
| By `userId` | `userId` | `event_private where ownerUserId` | NOT `characterId`: the server writes `presence` rows as `appendPrivateEvent(ctx, character.id, friendId, 'presence', ...)` (characterId is the friend's character, ownerUserId is the recipient). Client filter: `kind === 'presence' \|\| characterId === activeCharacterId`. Stable across character switches. [VERIFIED: reducers/auth.ts:68-78]. The old client also filtered by `ownerUserId` |
| By character | `activeCharacterId` | `hotbar`, `hotbar_slot`, `ability_template`, `ability_cooldown`, `event_contribution` each `where characterId`; `renown`, `renown_perk` if the `renown` command is implemented (S5) | `item_cooldown`: skip (S9) |
| By location | `character.locationId` | `npc`, `resource_node`, `character`, `location_connection where fromLocationId`, `event_location` | client filters: `character.id !== me`; `resource_node` shared (`characterId == null`) or `characterId === me` (old rule); `event_location` drop `excludeCharacterId === me` (old rule). Nearby players include logged-out characters (the server `look` does too; `player` is public but heavy, skip) |
| By group | `character.groupId` | `group where id`, `group_member where groupId`, `event_group where groupId` | party member rows via id list below. `my_group_members` is only the player's OWN membership rows (`by_owner_user`), not the group roster |
| By id list | sorted ids | `character where id = a or id = b ...` for party members and pending inviters; `quest_template where id` per active quest | verified: `.or()` chain emits `(... = 5) OR (... = 6)`. Rebuild when the id set changes |
| Region | region of current location | `world_event where status = 'active'` (client filter `regionId`) | `event_objective` only if the planner adds objective lines (S7) |
| Global | — | `event_world` | ripples; low volume |
| Later phases | — | `event_creation` (49), combat tables (48) | not in 47 |

`quest_template` is public and carries `name`, `description`, `requiredCount`, `characterId?` (per-player quests). Subscribing per id avoids pulling every generated quest.

## Feed

### Row classification (one pure function `classifyLine(row)` returning view models)

| Source | Rule |
|--------|------|
| Any row with `segments` (non-empty) | one line per segment: `kind === 'dialogue'` -> NPC speech; anything else -> Keeper narration. Speaker label comes from `segment.speaker`. Text is a plain string; no cleaning, no markup interpretation (A6). Known row kinds with segments: `narrative`, `npc`, `combat_narration` (private), `creation_*` (Phase 49) |
| No `segments`, kind in `narrative, llm, creation, combat_narration, class, character_created` | Keeper narration from `message` |
| no segments, `npc` | NPC speech from the whole message. The server writes `Name says, "greeting"` (intent hail, quest turn-in) and `Name: response` (`hail_npc`). Parse `^(.+?) says, "([\s\S]*)"$`; else render whole message in the NPC hue |
| `whisper` | parse sender and text with `^You whisper to (.+?): "([\s\S]*)"$` and `^(.+?) whispers: "([\s\S]*)"$`; no match -> whole message in the whisper hue (this also covers `fail(..., 'whisper')` lines) |
| `event_group` kind `group` and message starts with `<name>: ` where name is a known member name | party chat; other `group` rows (joined, left, leader) -> System |
| `look` | scene block (title = first line when >= 2 lines) |
| `quest`, `reward`, `faction` | quest-style line |
| `world`, `renown` (event_world) | Ripple; `world_event` kind -> World event |
| `say`, `emote` (location, private) | player-authored: render literal in the plain text color, **never keyword-scan** (they are not in the UI-SPEC table; falling into "unknown -> System" would make them keyword-eligible and let a player plant a clickable travel control by saying a place name) |
| `command` (server echo `> text`), `system`, `move`, `movement`, `presence`, `day_night`, `avoid`, `server_first`, unknown | System |
| `creation_error`, `blocked` | Error |
| `damage`, `heal`, `ability`, `buff`, `debuff`, `combat`, `combat_prompt`, `combat_status`, `combat_round_header`, `combat_resolving` | interim combat styles (Phase 48 regroups) |

### Cleaning static server text (S4, required)

66 sites in `look.ts`, `intent.ts` and `combat.ts` build `message` with `{{color:#hex}}text{{/color}}` and `[bracket]` words (`look`, `quests`, `help`, `inventory`, group invites: "Type [accept Bob] to join"). 46 research said the new client does not use that markup; the server still writes it. For rows **without** `segments` and of server-authored kinds, apply `cleanServerText`: remove color open and close tokens, unwrap `[x]` to `x`, keep newlines. Do not clean player-authored kinds (`say`, `whisper`, `group`, `emote`) or segment text. Write the token regex so it contains no `#hex` literal (the colors guard scans source text for `#rrggbb`): `/\{\{\/?color(?::[^}]*)?\}\}/g`. Render multi-line blocks with `white-space: pre-wrap` (list indentation) and `overflow-wrap: anywhere`.

### Store behavior

- Ordering: `onInsert` callbacks fire per table in message order, not chronologically. Buffer rows and flush in a microtask sorted by `createdAt.microsSinceUnixEpoch` then `id` (old client also tie-broke by scope).
- Dedupe key `(table, id)`; event ids are autoInc per table.
- `event_group` duplicates: `logPrivateAndGroup` writes the actor a private row and a group row with the same text, and many `appendGroupEvent(..., kind != 'group', ...)` rows carry the actor's own action. Drop `event_group` rows whose `characterId === me` unless `kind === 'group'` (chat, roster). [ASSUMED rule; verify in the owner's try-out]
- Cap 300 lines; the progress line is outside the history.
- Clear history when the active character id changes; the automatic `look` then repopulates.
- Same-batch hazard: a `look` reply may arrive before the echo; append echoes locally at send time (they sort by client clock; echoes use `Date.now()*1000` micros only for ordering inside the batch, never compared with server rows beyond the same flush).

### Server clock

Cooldowns (`startedAtMicros`) and event deadlines (`deadlineAtMicros`) are server times. Sample skew from live event rows: `skew = row.createdAt - Date.now()*1000` on each live insert (the automatic `look` gives the first sample). Use `serverNow = Date.now()*1000 + skew` and clamp remaining to `[0, durationMicros]` (the old client defended skew by clamping to `cooldownSeconds`). Fallback skew 0. [ASSUMED design; clamping is the safety net UI-SPEC A17 already requires]

## Input

### `routeInput(text, ctx)` contract (pure)

Context: `characterId`, `conversationNpc`, `npcsHere` (id, name), `connectedLocationNames`, `pendingInviterNames`, `memberNames`. Result is a descriptor, not a side effect: `{ kind: 'reducer', name, args, echo }`, `{ kind: 'intent', text, echo }`, `{ kind: 'talk', npcId, message }`, `{ kind: 'hail', npc, text }` (enter conversation, then intent), `{ kind: 'local', renderer }`, `{ kind: 'endConversation' }`.

Precedence (document and test it):
1. Trim; empty -> nothing.
2. Starts with `/` -> command. Known words map as the Q10 table with all remaining text as the argument (so `/invite Bob Smith` works for names with spaces); `/hail X` -> hail path; unknown -> `submit_command { characterId, text }`. A `/` line also ends conversation (game action).
3. First token lower-case is a command word AND the rest has that command's exact shape -> command. In conversation, the bare farewell words `leave` and `end` end the conversation instead (CONTEXT lists them as farewells; use `/leave` for the group command). [decision for planner; test both]
4. In conversation: farewell word -> end conversation (no send). Game-action -> end conversation and fall through. Otherwise `talk_to_npc { characterId, npcId, message }`.
5. `talk|hail|speak [to] <name>` and the name matches an NPC here -> hail path. Bare text equal (case-insensitive) to an NPC name here -> hail path. Hail path = enter conversation, then `submit_intent { text: 'hail <Name>' }` (server prints the greeting, no job).
6. Everything else -> `submit_intent { characterId, text }`.

Exact shapes (token split on whitespace): zero args for `who accept decline leave end endc endcombat renown factions events group`; exactly one token for `invite kick promote friend faction`; `w`/`whisper`: one name token then at least one token of message. "Accept my apology", "Leave him alone", "End this now", "Who is that over there?" all have extra tokens, so they fall to intent. Matrix to pin: every word in both forms, plus `WHO`, leading/trailing whitespace, `/who`, `/WHO`, `who?` (not a command: first token is `who?`), `invite` with no name, `invite Bob Smith` (intent), `whisper Bob` (no message -> intent), and the conversation precedence cases.

Game actions that end a conversation: the old regex is anchored loosely (`go `, `attack `, `gather `... prefixes), so "Go away, fool" ended the conversation and ran a `go` intent. Prefer shape-checked actions: bare `look|l|inventory|inv|i|backpack|bp|bag|stats|abilities|ab|quests|quest|bank|vendor|shop|store|craft|recipes|bind|camp|rest|flee|run|loot|enemies|mobs|players|who|help|time|skills|explore|hotbars|hotbar`; `look at <anything>`; `go|travel [to] <known connected location>`; `attack|fight|kill [..]`; `gather <known node>`; `buy|sell <..>`. [ASSUMED list, derived from server intent verbs at intent.ts:123-1700 and the old regex; planner may trim]

### Words with no server handler (S5)

`submit_command` inserts a `command` row and a `> text` echo; no code reads `command` rows [VERIFIED: grep `db.command` only inserts and deletes]. `submit_intent('renown'|'factions'|'events'|'group')` falls to the sardonic "means nothing here" line (intent.ts:1737). The old client rendered these locally. Recommendation: four small pure formatters over data already subscribed or cheap to add (`world_event`+region names for `events`; party data + `my_group_invites` for `group`; `my_faction_standings` + `faction` (small public table) for `factions` and `faction <name>`; `renown` + `renown_perk` + `RENOWN_RANKS` from `@game-data/renown_data` for `renown`), appended as local System lines. Minimal fallback if the planner wants to cut scope: route them to `submit_command` (echo only) and record the gap.

### Narrative queue

Gate = active job in `my_llm_jobs` (`status` in `LLM_INDICATOR_ACTIVE_STATUSES`) on a non-silent route. Recommended refinement (S3): exclude the two fill routes `world_gen` and `creation_class`, because the Phase 43 module states "the fill routes run after the reveal and do not lock input". Queue max 3, FIFO, release one at a time when the gate clears, decide `talk` vs `intent` at release time (the NPC may have left), drop on character change, disconnect or logout and append the System line (checker copy: `Your queued lines were not sent. Send them again.`). Rail and keyword actions that call reducers directly (`move_character`, `start_gather_resource`, `invite_to_group`, `switch_hotbar`, `use_ability`) are not narrative sends and go through. Keyword examine (`look at X`) and hail use `submit_intent`, so they queue.

Server guard worth knowing: `talk_to_npc` itself refuses a duplicate in-flight job with "The Keeper is already considering something. Patience." [VERIFIED: npc_interaction.ts:131-133]; the queue keeps players from hitting it.

### Echo rules (avoid doubles)

Local echo `› text` for: `submit_intent` non-slash sends, reducer-based commands (`invite`, `kick`, `leave`, `accept`, ...), keyword and rail actions. No local echo for: automatic look, `talk_to_npc` (server `say` echo), `whisper` (server echo), `group_message` (server echo), anything sent to `submit_command` or as a `/` line to `submit_intent` (server writes `> text`, kind `command`). `say` (`/say`, `say x`): the location event includes the sender, no local echo.

### Misc input facts

- `PLAYER_INPUT_MAX_CHARS = 1000` is in `llm_layers.ts`, which imports server helpers; do not import it into the client bundle. Use `maxlength="1000"` and a parity test that reads the server constant in the test file.
- Whisper reducer matches the first token as the target; names with spaces need the slash form for other commands, and whisper pre-fill is `whisper {name} ` (A14).

## Hotbar and effects

- Slots: `hotbar_slot` rows of the active hotbar (`hotbar.isActive`), `slot` is `u8` 1..10, key `0` is slot 10. Abilities from `ability_template` (per character). Fallback if no row is `isActive`: first by `sortOrder` (old rule).
- `switch_hotbar { characterId, hotbarName }` (by name). Rows update through `hotbar` `onUpdate` (primary key present).
- Cooldown remaining = `clamp(startedAtMicros + durationMicros - serverNow, 0, durationMicros)`. Rows are never deleted on expiry, so stale rows simply compute 0. `abilityCooldownMicros` is `max(cooldownSeconds, 1.5 s)`, so every use shows at least a 1.5 s sweep. Fraction for the sweep: `remaining / durationMicros`. One shared ticker: 250 ms (1 s with `prefers-reduced-motion`), stop when nothing is cooling.
- `item_cooldown` is keyed by `itemKey` (snake-cased item name) and written only by `use_item` for consumables; hotbar slots reference only `abilityTemplateId`, and no mapping exists (S9). Do not subscribe in 47 and note it in the summary.
- Old hotbar special cases not carried into 47: `resurrect` (needs a corpse target), `corpse_summon`, `track` (opened a panel), and client pre-checks for mana and stamina. In 47 every slot calls `use_ability`; the server answers refusals in the feed (UI-SPEC "Unaffordable ... still clickable"). Server note: `use_ability` refuses `utility` kinds in combat and says "Already casting." while a cast row exists.
- Ability kinds in the DB can include `track` and `corpse_summon`, which are not in `ABILITY_KINDS`; the icon table's `PhSparkle` fallback covers them.
- In combat signal: `character.combatTargetEnemyId != null` (server uses the same in `talk_to_npc`; set at combat start, cleared at end).
- Effect polarity: vocabulary lives in `@game-data/mechanical_vocabulary` (`EFFECT_TYPES`, `CC_TYPES`); polarity is a client table keyed by effect type per the UI-SPEC list plus negative `magnitude` on stat types. Effect types seen in code but absent from the vocabulary (`travel_discount`, `pull_veil`) fall through to "buff" + `PhSparkle`. Chip name: `sourceAbility` else `effectType` with `_` replaced by a space. Per-effect time is rounds (`{n} rounds`, `1 round`) shown only in combat; `0` shows nothing.
- XP: `character.xp` is **cumulative total** and `xpRequiredForLevel(L)` is the total to reach level L (`@game-data/xp`, pure, exports `MAX_LEVEL = 10n`). Progress into level = `xp - req(level)` over `req(level+1) - req(level)`; at `level >= MAX_LEVEL` show "Max level". `xpRequiredForLevel(11)` clamps to the level-10 value, so a naive formula gives need 0 at max level. XP can exceed the level's need while `pendingLevels > 0n`: clamp the numerator.
- Quests: a row is tracked when `completedAt` is undefined. `completed && !completedAt` = ready to turn in (the intent path deletes the row on turn-in; the `hail_npc` path sets `completedAt` and leaves the row, so those must be hidden). Name, description, `requiredCount` from `quest_template`.

## Route level range and Safe (Q6, S6)

Recommended pure function `routeLevelRange(destination: Location, regions, locations)`:
1. `destination.isSafe` -> `{ safe: true }` (renders `Safe`).
2. Else old-client rule on the destination's region: base = `floor(Number(region.dangerMultiplier) / 100)`; over locations of that region lo = `max(1, base + min(levelOffset))`, hi = `max(1, base + max(levelOffset))`; equal -> `Lv N`, else `Lv lo-hi` (en dash).

This matches CONTEXT ("same rule as the old client") and UI-SPEC's `Lv 6–9`. A per-location variant (`max(1, base + offset)` +/- 1 when offset != 0) would match what the server spawns at one location but is not what the old client showed; pick the region rule unless the owner prefers the other. `levelOffset` is `i64` (bigint, can be negative); use `Number()` only after the bigint is bounded (-10..10 per world_gen clamps).

## Keyword matcher (Q11)

Properties required: total (never throws), whole word, case-insensitive, longest first, non-overlapping, leftmost, every occurrence.

Algorithm (no regex built from data):
1. Vocabulary entries `{ text, kind: 'npc' | 'place' | 'node' | 'player', target }` from NPCs here, connected locations, resource nodes, other players here (not the active character). Drop empty/whitespace names. Dedupe by folded text with priority npc > place > node > player. Cap at 200 entries.
2. Fold per code point: `ch.toLowerCase()`, but if the result length differs from `ch.length` (for example `İ`) keep `ch`; also map `’` (U+2019) and `‘` to `'` so a typographic apostrophe in LLM prose matches a straight one in the stored name. Both text and names use the same fold, so UTF-16 indices stay aligned with the original text.
3. Boundary: a name edge needs a non-word neighbor only if that edge character is a word character (`/[\p{L}\p{N}_]/u`). Names like `(Lost)`, `'Tis` or `St.` still match. `Ferryman's` matches `Ferryman` (apostrophe is non-word).
4. Scan left to right; at each index try candidates starting with that code point, longest first; on a hit emit text before, the keyword (original substring), and jump past it.
5. Output parts `{ text } | { text, entry }`; render parts with `{{ }}` interpolation only. Empty text, no vocabulary, lone surrogates, 5k-character input, regex metacharacters in names (`C++`, `Mara (the Elder)`) must all return without throwing.
6. Scope per UI-SPEC: narration, dialogue text, scene, ripple, quest and server system lines; never whispers, party chat, `say`, `emote`, echoes. A dialogue speaker with `speakerNpcId` is a keyword only if that NPC row is still in the `npc` binding.

Pitfalls: `\b` is ASCII-only in JS; `toLowerCase()` can change length so slicing the original with indices from the lowered copy misaligns; common-word names (a node called "Stone") will highlight every occurrence, which UI-SPEC accepts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Indicator selection | A new priority/rotation scheme | Port the pure `selectLlmIndicator` / `indicatorLineFor` / `routeInConsoleScope` from `git show v2.2-client:src/composables/useLlmStatus.ts` over `@game-data/llm_indicator_lines` | Phase 43 tuned it (priority, 5 s pool rotation, creation-only scope, silent routes); its tests are in the old tag |
| XP thresholds, level cap, renown ranks | Client tables | `@game-data/xp`, `@game-data/renown_data`, `@game-data/mechanical_vocabulary` | Server is source of truth (project rule) |
| Table mirroring through reconnect | A second mirror | `src/net/bindTable.ts` | Already handles stale-through-reconnect, applied/failed, listener hygiene |
| Segment kind constants | Copying `'narration'/'dialogue'` silently | Compare `kind === 'dialogue'` and add a parity test reading `spacetimedb/src/helpers/segments.ts` `SEGMENT_KINDS` | `helpers/segments.ts` is outside the `@game-data` alias and pulls `llm_layers.ts` (heavy, server helpers); do not bundle it |
| Icons | Inline SVG or glyph icons | `@phosphor-icons/vue` | 45 guard fails otherwise |
| Escaping | Manual HTML escaping | Vue text interpolation | No raw HTML anywhere |

**Key insight:** every "clever" shortcut here (regex keywords, `v-html` for server markup, whole-table subscriptions, local copies of server constants) is something an existing guard or the project rules already forbid.

## Common Pitfalls

### Pitfall 1: Event rows never appear, or appear for everyone
**What goes wrong:** `bindTable` on an event table shows nothing; an unfiltered subscription shows other players' lines. **Why:** event rows are not cached and the tables are `public`. **Avoid:** `bindEventTable` with `where`. **Warning signs:** empty feed with a connected session; whispers from strangers.

### Pitfall 2: Lost first scene
**What goes wrong:** the automatic `look` reply is missed. **Why:** event subscriptions deliver only inserts after `onApplied`. **Avoid:** send the look after the private-event binding is `applied`, once per character id; consider repeating it after a reconnect (events during the gap are gone) [ASSUMED improvement, not in CONTEXT].

### Pitfall 3: Literal `{{color:#fbbf24}}` in the scene title
**Why:** static server lines keep the old markup (S4). **Avoid:** `cleanServerText` for no-segment, server-authored kinds only.

### Pitfall 4: Commands that "run" but do nothing
**Why:** `submit_command` only echoes. **Avoid:** map each word to its reducer or formatter (Q10 table, S5). `/who` must not go to the server as a slash line.

### Pitfall 5: Hijack by prefix match
**Why:** the old gate matched the first word and `startsWith`. **Avoid:** exact shapes; the matrix is the guard.

### Pitfall 6: Party effects shown as mine
**Why:** `my_character_effects` includes every group member's effects. **Avoid:** filter by `characterId`.

### Pitfall 7: Frozen effect timers
**Why:** `roundsRemaining` only moves in combat. **Avoid:** show time only when `combatTargetEnemyId != null`.

### Pitfall 8: Presence lines missing
**Why:** subscribing `event_private` by `characterId` misses rows addressed by `ownerUserId` (friend presence). **Avoid:** subscribe by `ownerUserId`, filter in the client.

### Pitfall 9: Duplicate group lines
**Why:** `logPrivateAndGroup` writes both rows. **Avoid:** drop own non-chat `event_group` rows.

### Pitfall 10: Queue blocks the whole game during world fill
**Why:** CONTEXT says "pending LLM job", and `world_gen` (fill) can run for minutes while the server allows play. **Avoid:** S3 exclusion of fill routes; silent routes (`combat_narration`) never gate.

### Pitfall 11: Failed-job line duplicates the server's own failure line
**Why:** `applyLlmFailure` already writes an in-voice line for every non-silent route; the view's `userMessage` is a different generic line. **Avoid:** S1.

### Pitfall 12: Keyword index misalignment and regex throws
See Keyword matcher.

### Pitfall 13: Guards trip on new files
`textColorOffenders` rejects `#hex` in any client source (including regex literals); spacing guard rejects negative px; font sizes limited to 10/12/14/20 and weights to 400/500. The pin test in `tokens.client.test.ts` must move to 23 tokens (UI-SPEC). `.vue` files may not contain `<svg`, `<h1|h2|h3|h5>` or `v-html`.

### Pitfall 14: iOS focus zoom (checker note A9)
A 14px input zooms on iOS focus and the viewport meta may not use `maximum-scale`. Recommendation: allow one 16px exception for the mobile composer input (one selector, one documented allowance in the font-size guard, UI-SPEC amendment). The alternative is to accept the zoom and record it. [ASSUMED: iOS behavior; unverified here, owner UAT]

## Code Examples

### Cooldown remaining and label
```typescript
export function cooldownRemainingMicros(row: { startedAtMicros: bigint; durationMicros: bigint } | undefined, serverNowMicros: number): number {
  if (!row) return 0;
  const end = Number(row.startedAtMicros) + Number(row.durationMicros);
  return Math.min(Number(row.durationMicros), Math.max(0, end - serverNowMicros));
}
export function cooldownLabel(remainingMicros: number): string {
  const s = Math.ceil(remainingMicros / 1_000_000);
  if (s >= 3600) return `${Math.floor(s / 3600)}h`;
  if (s >= 60) return `${Math.floor(s / 60)}m`;
  return String(s);
}
```

### Route level range
```typescript
export function routeLevel(dest: { isSafe: boolean; regionId: bigint }, locations: readonly { regionId: bigint; levelOffset: bigint }[], regions: readonly { id: bigint; dangerMultiplier: bigint }[]) {
  if (dest.isSafe) return { safe: true as const };
  const region = regions.find((r) => r.id === dest.regionId);
  const base = region ? Math.floor(Number(region.dangerMultiplier) / 100) : 1;
  const offsets = locations.filter((l) => l.regionId === dest.regionId).map((l) => Number(l.levelOffset));
  const lo = Math.max(1, base + Math.min(...(offsets.length ? offsets : [0])));
  const hi = Math.max(1, base + Math.max(...(offsets.length ? offsets : [0])));
  return { safe: false as const, lo, hi };            // label: lo === hi ? `Lv ${lo}` : `Lv ${lo}–${hi}`
}
```

### XP into level
```typescript
import { MAX_LEVEL, xpRequiredForLevel } from '@game-data/xp';
export function xpProgress(c: { xp: bigint; level: bigint }) {
  if (c.level >= MAX_LEVEL) return { max: true as const, value: 1, need: 1 };
  const base = xpRequiredForLevel(c.level);
  const need = xpRequiredForLevel(c.level + 1n) - base;
  const into = c.xp > base ? c.xp - base : 0n;
  return { max: false as const, value: Number(into > need ? need : into), need: Number(need) };
}
```

### Whisper parse
```typescript
const SENT = /^You whisper to (.+?): "([\s\S]*)"$/;
const RECEIVED = /^(.+?) whispers: "([\s\S]*)"$/;
export function parseWhisper(message: string) {
  const sent = SENT.exec(message); if (sent) return { dir: 'sent' as const, name: sent[1], text: sent[2] };
  const got = RECEIVED.exec(message); if (got) return { dir: 'received' as const, name: got[1], text: got[2] };
  return null;
}
```

### World event split and time left
```typescript
export function eventSplit(e: { successCounter: bigint; failureCounter: bigint }) {
  const s = Number(e.successCounter), f = Number(e.failureCounter), t = s + f;
  return t === 0 ? { lead: 50, trail: 50, leadPct: 0, trailPct: 0 } : { lead: (s / t) * 100, trail: (f / t) * 100, leadPct: Math.round((s / t) * 100), trailPct: Math.round((f / t) * 100) };
}
```
(For two `Math.round` percentages that may not sum to 100, derive the second as `100 - first`.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Subscribe to whole tables and filter in memory | Typed `where` subscriptions, per-key | New client (Phase 45 pattern) | Smaller, private-by-filter |
| Event tables unfiltered, `SELECT * FROM event_private` | Filtered event subscriptions + `onInsert` | This phase | See Security Domain |
| `useSpacetimeDB()` Vue hook per composable | Phase 45 `ConnectionController` + injected `bind` | Phase 45 | Tests use fakes (see `bindTable.test.ts`) |
| Round-based "30 s rounds" experiments | Rounds return in 46.1 | Later | `roundsRemaining` semantics change; keep chips data-driven |

**Deprecated/outdated:** snake_case table handles (`conn.db.ability_cooldown`) are deprecated aliases since 2.7; use camelCase (`conn.db.abilityCooldown`) [CITED: CLAUDE.md]. `tick_effects`/`tick_hot` schedulers are dead code.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Typed `where` on an event table is accepted by the live server (SQL generation verified locally; server acceptance documented only in the SpacetimeDB blog example, not the reference docs) | Event subscription | If rejected, fall back to unfiltered + client filter (privacy regression); first local try-out catches it |
| A2 | Skew sampling from live event `createdAt` is good enough for cooldown and deadline display | Server clock | Wrong sweeps by seconds; clamping bounds the damage |
| A3 | Drop own non-chat `event_group` rows to avoid duplicates | Store behavior | Might hide a line that has no private twin; cheap to relax |
| A4 | The shape-checked game-action list for ending a conversation | Input | Over/under-ends conversation; planner may trim |
| A5 | Region-wide level range (old-client rule) is what the owner means by "level range" on a route row | Q6 | Rows in one region show the same range; swap to the per-location variant is one function |
| A6 | 16px mobile input exception fixes iOS zoom | Pitfall 14 | Zoom persists or guard allowance too broad |
| A7 | Re-running the automatic `look` after reconnect is desirable | Pitfall 2 | Extra scene line after each reconnect |
| A8 | Nearby players listing logged-out characters is acceptable (server `look`/`who` do the same) | Subscription plan | Players see stale people; fix needs `player` table access |
| A9 | `/hail X` should behave like `hail X` (intent + conversation) rather than call `hail_npc` | Q10 | `hail_npc` handles legacy dialogue-option greeting and quest auto-turn-in; v2.0 removed dialogue trees, intent greeting is the live path |

## Spec conflicts and discrepancies to settle in planning

- **S1. Failed-job Error line (UI-SPEC "Error: LLM job failed").** `applyLlmFailure` already writes an in-voice Keeper line for each non-silent route, and the old client deliberately showed nothing from `userMessage`. A client line would double it. Recommendation: do not append it; `my_llm_jobs` only clears the progress line. If the owner wants it, gate it to jobs seen active in this session (the view returns historical rows at subscribe time, so a naive "failed rows" scan would replay old failures) and dedupe by job id. Adjust UI-SPEC test 4 accordingly.
- **S2. Indicator selection.** UI-SPEC says "if more than one job is active, the oldest is shown". The Phase 43 module defines priority, pools that rotate every 5 s, creation-only scoping and silent routes. Recommendation: port the old selection logic (game scope) and rotate through the pool; the UI-SPEC sentence is a subset.
- **S3. What counts as a pending job for the queue.** See Narrative queue: non-silent routes, excluding the two fill routes. `my_llm_jobs` is per identity, so "that character" cannot be filtered; document it.
- **S4. Markup in static server lines.** See Cleaning static server text.
- **S5. Words without a server handler** (`renown`, `factions`, `faction <name>`, `events`, bare `group`): client formatters, or accept an echo-only result. `who` goes to `submit_intent`.
- **S6. `accept <name>` / `decline <name>`.** The server's invite line tells the player to type `[accept Bob]`, but CONTEXT lists `accept` and `decline` only bare. Recommendation: also treat `accept|decline <one token>` as exact when the token equals a pending inviter's name (known from `my_group_invites` + `character`), so the server's own instruction works and "Accept my apology" still reaches intent.
- **S7. Event "faction split".** No faction data exists (Q4). Ship the UI-SPEC bar over `successCounter`/`failureCounter` with `For`/`Against` labels (A10 fallback) and say clearly in the plan summary that it will read 0%/0% until counters move. Smallest server change if the owner wants a live bar: have kill handling increment `successCounter` (and the protect objective `failureCounter`), or surface `event_objective` progress (`currentCount/targetCount`) in the card. Not part of 47.
- **S8. Effect time.** Hide time out of combat (Q2); in combat the value is really seconds today (1 s loop) and becomes rounds in 46.1. The label `{n} rounds` follows the UI-SPEC.
- **S9. `item_cooldown`.** CONTEXT lists it for sweeps; there is no ability-to-item mapping and it only tracks consumables used through `use_item`. No subscription, no UI.
- **S10. Checker notes resolved by this research:** Send `aria-label="Send action"`; queued-lines copy `Your queued lines were not sent. Send them again.`; `text-underline-offset: 4px`; the negative block margin via `calc()` (guard-safe); spacing exceptions justified only by "assumption" need one-line rationales; focal-points sentence softened; iOS zoom per Pitfall 14.

## Open Questions

1. **Owner: world event bar.** Accept 0%/0% (S7) or schedule a tiny server change later?
   - Known: counters do not move in play. Recommendation: ship as specified, flag in the Phase 47 summary.
2. **Owner: `who` scope.** Location-only via `submit_intent` (no server change) versus the old global online list (needs whole `player`/`character` subscriptions).
   - Recommendation: location-only.
3. **Planner: renown/factions/events/group formatters in or out of 47.**
   - Recommendation: in (INP-02 says the command runs); cut-down fallback described in S5.
4. **Owner: dev slash commands** (`/level`, `/grantrenown`, `/spawncorpse`, `/createitem`, `/createscroll`, `/endevent`, `/setappversion`, `/recomputeracial`) used to be mapped to admin reducers and will silently do nothing through `submit_command`.
   - Recommendation: add a table-driven map (reducers exist; admin checks are server-side) so the owner's try-out tooling keeps working, or state they are dropped.
5. **Planner: objects.** Leave `objects` empty (A7) or surface `location.bindStone` / `craftingAvailable` as pseudo-objects with new copy.
   - Recommendation: empty; no new copy.
6. **Owner (pre-existing server issue, out of scope):** `event_private`, `event_group`, `event_location` are `public: true`, so any client can subscribe unfiltered and read other players' private lines and whispers. The new client filters, but that is not enforcement. A server-side fix (RLS or a per-sender projection) belongs to a later hardening phase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build, tests | yes | v22.23.2 (>= 22.12 required) | — |
| pnpm | scripts | yes | 11.23.0 | — |
| vitest / happy-dom / @vue/test-utils | tests | yes | 5.0.2 / 20.14.5 / 2.5.1 | — |
| Local SpacetimeDB + published `uwr` module | manual try-out only | not started by this research (by constraint) | — | Unit and component tests need no server; owner try-out uses the `run-local` skill after Phase 47 |
| Git tag `v2.2-client` | behavior reference | yes | `git show v2.2-client:src/...` works | — |

**Missing dependencies with no fallback:** none for automated work.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 5.0.2 (root config is `vite.config.ts`; no separate vitest config) |
| Config file | none; per-file `// @vitest-environment happy-dom` docblock for component tests; `@game-data` alias comes from `vite.config.ts` |
| Quick run command | `pnpm exec vitest run src/<dir>/<file>.test.ts` (about 5 s per file; ~1.4 s worker startup each) |
| Full suite command | `pnpm exec vitest run --dir src --maxWorkers=2` (35 files, 469 tests, ~70 s baseline) plus `pnpm exec vue-tsc -b` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CON-01 | classify by kind: segments (narration label, dialogue quotes, `speakerNpcId` present/absent), no-segment kinds, unknown kind, whisper/chat parsing, `<b>` and `{{color:#fff}}` literal in segments, `cleanServerText` on server lines, `say` not keyword-eligible | unit | `pnpm exec vitest run src/console/lines.test.ts src/console/cleanServerText.test.ts src/console/whisper.test.ts` | Wave 0 |
| CON-01 | feed store: cap 300, dedupe `(table,id)`, same-batch sort, character-change clear, own-group-row drop | unit | `pnpm exec vitest run src/console/feedStore.test.ts` | Wave 0 |
| CON-01 | event binding: attach/detach, `onInsert` only, same listener reference removed, applied flag, reconnect re-attach, no `iter()` use | unit (fake conn as in `bindTable.test.ts`) | `pnpm exec vitest run src/game/bindEventTable.test.ts` | Wave 0 |
| CON-01 | feed component: pinned vs unpinned, New lines pill show/hide, send re-pins, progress line, no `v-html`, `role="log"` | component | `pnpm exec vitest run src/console/FeedView.test.ts` | Wave 0 |
| CON-02 | matcher: whole word, case, longest, non-overlap, Unicode boundary, apostrophe fold, `İ` length change, metacharacters, empty/hostile, scope exclusions; click actions per kind | unit + component | `pnpm exec vitest run src/console/keywords.test.ts src/console/FeedLine.test.ts` | Wave 0 |
| CON-03 | effects: polarity table, chip text, +n overflow, combat-only time, own-character filter; XP progress and max level; party derivation, leader first, health percent | unit | `pnpm exec vitest run src/rails/effects.test.ts src/rails/xp.test.ts src/rails/party.test.ts` | Wave 0 |
| CON-03 | rails render: bars, chips, party cards, Invite pre-fill, mobile strip chip row | component | `pnpm exec vitest run src/frame/VitalsRail.test.ts src/frame/VitalsStrip.test.ts` | exists, extend |
| CON-04 | `routeLevelRange`, Nearby ordering and actions (vendor Trade, depleted, in use), quest bar vs description, ready state, event split, time-left format | unit | `pnpm exec vitest run src/rails/levelRange.test.ts src/rails/nearby.test.ts src/rails/quests.test.ts src/rails/worldEvent.test.ts` | Wave 0 |
| CON-04 | Map sheet body holds Here, Nearby, Tracking, event; Social sheet holds Party; actions close the sheet | component | `pnpm exec vitest run src/frame/AppFrame.screens.test.ts src/frame/railsShell.test.ts` | exists, extend |
| CON-05 | hotbar: ten slots in key order, kind-to-icon, empty slot inert, cooldown math/labels, ignored while cooling, number keys only when no field focused and no screen open, selector wrap/disabled, `use_ability` args | unit + component | `pnpm exec vitest run src/hotbar/hotbar.test.ts src/hotbar/HotbarRow.test.ts` | Wave 0 |
| CON-06 | indicator: ported selection (priority, silent, scope, pool rotation), progress line show/clear, queue gating set, queue FIFO, route-at-release, 4th line refused, drop on disconnect | unit | `pnpm exec vitest run src/console/indicator.test.ts src/input/narrativeQueue.test.ts` | Wave 0 |
| INP-01 | sentence forms reach intent: "Who is that over there?", "Leave him alone", "End this now", "Accept my apology" and one per command word | unit (table) | `pnpm exec vitest run src/input/routeInput.test.ts` | Wave 0 |
| INP-02 | exact forms per word and slash forms map to the right reducer and argument names; precedence in conversation; `/` unknown -> `submit_command`; `accept <inviter>` | unit (table) | `pnpm exec vitest run src/input/routeInput.test.ts` | Wave 0 |
| INP | history (50, draft restore, dedupe), IME Enter, pre-fill replaces and records draft, placeholders per mode, disabled offline | unit + component | `pnpm exec vitest run src/input/history.test.ts src/input/Composer.test.ts` | Wave 0 |
| All | design guards: no literal colors, scale, Phosphor only, Inter only, 23 tokens, no `v-html`, computed sizes/weights on a populated mount | static | `pnpm exec vitest run src/styles` | exists; `tokens.client.test.ts` must change to 23 |
| All | parity: client literals vs server (`'dialogue'`, `maxlength` 1000) | unit | `pnpm exec vitest run src/console/serverParity.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** the quick command for the touched module (single file, ~5 s) plus `pnpm exec vitest run src/styles` when a `.vue` or `.css` file changed.
- **Per wave merge:** `pnpm exec vitest run --dir src --maxWorkers=2` and `pnpm exec vue-tsc -b`.
- **Phase gate:** full suite green plus `pnpm build` (includes the bundle guard) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/game/bindEventTable.test.ts`, `keyedBinding.test.ts`, `gameData.test.ts` (fake `bind` injection like `useSession.test.ts`)
- [ ] `src/console/{lines,cleanServerText,whisper,keywords,feedStore,indicator,serverParity}.test.ts`, `FeedView.test.ts`, `FeedLine.test.ts`
- [ ] `src/input/{routeInput,narrativeQueue,history}.test.ts`, `Composer.test.ts`
- [ ] `src/hotbar/{hotbar}.test.ts`, `HotbarRow.test.ts`
- [ ] `src/rails/{effects,xp,party,levelRange,nearby,quests,worldEvent}.test.ts`
- [ ] Update existing: `tokens.client.test.ts` (23 tokens), `railsShell.test.ts`, `VitalsRail.test.ts`, `VitalsStrip.test.ts`, `AppFrame.layout.test.ts`, `AppFrame.screens.test.ts`, `frameContract.test.ts`
- [ ] Fixtures: a shared builder for rows with bigint ids, `Timestamp`-shaped `createdAt`, and a fake connection with event-table listeners (kept inside test files; production-file guards must not scan helpers, as in 45-10)
- [ ] Framework install: none

Hands-on checks stay deferred to the end-of-milestone UAT by owner decision; the visual backstops in the UI-SPEC (900px, 390px, keyboard-open) are held-out tests for that pass.

## Security Domain

> `security_enforcement` is not set to `false`; treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (45 owns SpacetimeAuth) | existing PKCE flow |
| V3 Session Management | no | existing controller |
| V4 Access Control | yes (client side scope only) | `ctx.sender` is authoritative on the server; the client sends only `characterId` and the server enforces ownership via `requireCharacterOwnedBy`; filtered subscriptions limit what is rendered |
| V5 Input Validation | yes | `maxlength`, trim, exact-shape routing, text-node rendering, `cleanServerText` regex without data-derived patterns |
| V6 Cryptography | no | none used |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LLM or player text rendered as HTML (segments, `say`, whispers, NPC names) | Tampering | Vue interpolation only; 45 guard bans `v-html`/`innerHTML`; test with `<img onerror>` and `{{color}}` strings |
| Player plants a clickable travel/hail control by typing a place name | Spoofing | Keyword scope excludes player-authored kinds (`say`, `emote`, `whisper`, `group`, echoes) |
| ReDoS or throw from names used in a regex | DoS | Manual scanner, entry cap, input length bounded by the 600-code-point segment clamp and server line sizes |
| Reading other players' private events | Information disclosure | Filtered subscriptions; **not enforced server-side** (tables are `public`): Open Question 6 |
| Command hijack of natural speech | Tampering (of intent) | Exact-shape routing matrix |
| Name-based reducers (`kick`, `promote`, `whisper`) act on whatever string is sent | Tampering | Server resolves by exact case-insensitive name and rejects duplicates (`findCharacterByName`); the client never invents names |
| Bundle leaks server prompt text | Information disclosure | Do not import `llm_layers.ts` or `helpers/*` into client source; the bundle guard scans `dist/` after build |

## Project Constraints (from CLAUDE.md and memory)

- Reducer calls use object syntax with generated argument names (`conn.reducers.useAbility({ characterId, abilityTemplateId })`); never positional; table handles camelCase (`conn.db.abilityCooldown`); timestamps are objects (`row.createdAt.microsSinceUnixEpoch`); `useTable` hooks are not used in this client (plain composables and `bindTable`).
- Do not edit generated `src/module_bindings`; no new SpacetimeDB APIs invented (everything above was checked against the installed SDK and bindings).
- Make the smallest change; do not touch unrelated files. Server stays source of truth: import constants through `@game-data`, never duplicate (parity test where the module is not importable).
- Prefer `fail()` for server-side validation messages; client invents no refusal copy (UI-SPEC).
- Every phase and quick task includes unit tests that enforce the rules (memory: testing requirements).
- Never `spacetime publish` to maincloud; no `--clear-database` unless schema changes need it; this phase plans no server change.
- Keeper voice: second-person scene narrator, no first person, he/his for the Keeper, every NPC male or female; the client's own copy follows the UI-SPEC copywriting contract (no pronoun for the Keeper).
- Defer UAT to milestone end; compact near 65% context; do not run ui-phase for console/copy changes.
- `String.replaceAll` is not in the tsconfig lib; resolve source files from `process.cwd()` in happy-dom tests.

## Sources

### Primary (HIGH confidence)
- Local source read this session: `spacetimedb/src/reducers/{items,combat,commands,intent,groups,movement,npc_interaction,quests,world_events,auth,characters,hunger,items_gathering}.ts`, `helpers/{events,combat,look,location,travel,world_gen,llm_apply,llm_status,segments,scheduling}.ts`, `views/*.ts`, `schema/tables.ts`, `data/{llm_indicator_lines,mechanical_vocabulary,xp,world_event_data,renown_data}.ts`
- `src/module_bindings/*` (reducer argument names, table columns), `src/net/*`, `src/session/*`, `src/frame/*`, `src/styles/*` guards
- `node_modules/spacetimedb/src/sdk/{table_cache,client_table,db_connection_impl,subscription_builder_impl}.ts`, `src/lib/query.ts` (installed 2.10.1)
- Old client via `git show v2.2-client:src/...` (`App.vue`, `composables/{useCommands,useHotbar,useLlmStatus,useEvents,useGameData}.ts`, `composables/data/*`, `components/{MapPanel,NarrativeMessage}*`)
- A throwaway vitest run (deleted) that printed the SQL for the typed event-table, view, `or` and `where` queries listed in Pattern 1 and the Subscription plan

### Secondary (MEDIUM confidence)
- [Event Tables](https://spacetimedb.com/docs/tables/event-tables/): rows not stored, `count()` 0, `iter()` empty, insert callbacks only
- [Video conferencing over a database with SpacetimeDB](https://spacetimedb.com/blog/video-conferencing-over-a-database-with-spacetimedb): `tables.audio_frame_event.where(r => r.to.eq(identity))`

### Tertiary (LOW confidence)
- iOS focus-zoom behavior and the 16px workaround: training knowledge, not verified in this session

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no change from installed project
- Architecture: HIGH for subscriptions and event semantics (SDK source read); MEDIUM for the provide/inject split (design choice)
- Pitfalls: HIGH for the server-derived ones (cited lines); MEDIUM for A3, A4, A6 style calls

**Research date:** 2026-10-05
**Valid until:** about 2026-11-05, or until Phase 46.1 changes combat tables and effect semantics (re-check S8, `use_ability`, in-combat signal then)
