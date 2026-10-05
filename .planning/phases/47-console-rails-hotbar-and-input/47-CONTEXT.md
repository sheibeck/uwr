# Phase 47: Console, Rails, Hotbar and Input - Context

**Gathered:** 2026-10-05
**Status:** Ready for planning

<domain>
## Phase Boundary

The new client becomes playable for exploring. A player with an existing character can do the following:
- read a labelled feed built from the Phase 46 segments
- act on soft accent keywords and on the rail actions
- see vitals, effects, party, routes out, Nearby, tracked quests and the active world event
- use and switch hotbars
- type natural sentences without command words hijacking them, while exact command forms still run

The phase fills the Phase 45 frame shells (FeedShell, VitalsRail and VitalsStrip, ContextRail, the mobile strip and tab bar), and it must work at 390×844. Requirements: CON-01 to CON-06, INP-01, INP-02.

Out of scope:
- the round-based combat UI (Phase 48, after 46.1)
- character creation (Phase 49)
- the Ledger screens' content (Phases 50 and 51)
- hotbar editing (Phase 50)

Run order (owner, 2026-10-05): Phase 47 runs before 46.1. After Phase 47 the run pauses so the owner can try the playable UX with an existing local character.

</domain>

<decisions>
## Implementation Decisions

### Feed (CON-01, CON-06)
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

### Keywords, rails and Nearby (CON-02, CON-03, CON-04)
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

### Input routing (INP-01, INP-02)
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

### Hotbar and vitals (CON-03, CON-05)
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

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 45 frame, `src/frame/`:**
  - `AppFrame`
  - `FeedShell` (the feed placeholder this phase fills)
  - `VitalsRail`, `VitalsStrip` and `vitals.ts` (bars, clamp and bigint helpers)
  - `ContextRail` (the rail shell)
  - `LocationRow`, `HeaderBar`, `TabBar`, `tabs.ts`, `MoreSheet`, `Sheet`, `Drawer`, `useScreens`, `useBreakpoint`, `focusTrap`
- **Phase 45 connection, `src/net/`:**
  - `connection.ts` (controller, reconnect, `createDefaultSession`)
  - `bindTable.ts` (rows kept through reconnect)
  - `backoff.ts`
  - `src/session/useSession.ts`
- **Styles.**
  - `src/styles/nocturne.css` (Nocturne tokens)
  - `src/styles/tokens.client.css` (rarity and difficulty tokens)
  - `src/styles/frame.css`
  - `src/styles/cssContract.ts`
  - The guards forbid literal colors, require the 4/8/16/24/32/48/64 spacing scale, allow Phosphor icons only and Inter only, and ban `v-html`.
- **Phase 46 segment contract.**
  - `KeeperSegment {kind, speaker, text, speakerNpcId?}` is an optional `segments` column on `event_private`, `event_location` and `event_creation`.
  - `message` always equals `flattenSegments(segments)`.
  - The constants live in `spacetimedb/src/helpers/segments.ts`. The client imports constants through the `@game-data` alias (the server is the source of truth) or reads the bindings' types.
- **Bindings (`src/module_bindings/`).**
  - Tables and views: `event_private`, `event_location`, `event_world`, `event_group`, `my_llm_jobs`, `my_character_effects`, `my_quests`, `my_group_members`, `my_friends`, `npc`, `location`, `location_connection`, `resource_node`, `region`, `world_event`, `event_contribution`, `faction`, `my_faction_standings`, `hotbar`, `hotbar_slot`, `ability_template`, `ability_cooldown`, `item_cooldown`, `character`.
  - Reducers: `submit_intent`, `submit_command`, `talk_to_npc`, `hail_npc`, `whisper`, `group_message`, `invite_to_group`, `accept_group_invite`, `reject_group_invite`, `leave_group`, `kick_group_member`, `promote_group_leader`, `send_friend_request_to_character`, `switch_hotbar`, `use_ability`, `use_ability_realtime`, `move_character`, `start_gather_resource`, `end_combat`.

### Established Patterns
- Plain composables, no router. Drawers and sheets are app state. Tests run under the root Vitest, with a per-file `// @vitest-environment happy-dom` docblock, `@vue/test-utils`, and postcss static CSS contracts.
- `String.replaceAll` is not in the tsconfig lib.
- Under happy-dom, resolve source files from `process.cwd()`, not `new URL(..., import.meta.url)`.
- Reducer calls use object syntax (`conn.reducers.submitIntent({ characterId, text })`), and table handles are camelCase.

### Integration Points
- `FeedShell` (feed and input), `ContextRail` (routes, Nearby, quests, event), `VitalsRail` and `VitalsStrip` (vitals, effects, party), and the mobile tab bar (Story, Map, Bag, Party, More) with sheets.
- The old client at tag `v2.2-client` is a behavior reference only: `src/App.vue` (`onNarrativeSubmit`, keyword click handler), `src/composables/useCommands.ts`, and the old narrative console components.

</code_context>

<specifics>
## Specific Ideas

- **Design source.** Re-import from the claude_design MCP during the UI-SPEC step (never cached): Ledger 2i/2j and Console & Combat 1a (exploring), desktop and mobile.
- **Target feed lines** (Ledger console mock):
  - "The Keeper": "You peer into the well. It is deep, dark and wet..."
  - `The Ferryman says, "Mind the current, traveller."`
- **Phase 46 deferred check.** The owner's console read-through of the new Keeper lines (46-UAT item 5) becomes possible once this phase lands.

</specifics>

<deferred>
## Deferred Ideas

- **Hotbar editing** (create or delete hotbars, assign slots) goes to Phase 50, the Character screen.
- **Round-based combat UI** goes to Phase 48, after Phase 46.1.
- **The server's "You say to X: …" echo** (46 OQ5) is shown as the server sends it. Changing that is a later decision.
- **Persisted feed history** across reloads would need a server table. It is not planned.

</deferred>
