# Phase 51: Ledger Screens: World and People - Context

**Gathered:** 2026-10-06
**Status:** Ready for UI-SPEC and planning
**Mode:** Smart discuss. The owner answered all four areas in chat on 2026-10-06. Area 1 Q4 was changed by the owner; everything else was accepted as recommended.

<domain>
## Phase Boundary

Players see and travel the world, play with other people, and follow world events. The screens are Ledger drawers on desktop and full-height sheets on mobile, built on the Phase 45 shells and the `src/screens/` placeholders (`MapScreen.vue`, `SocialScreen.vue`, `WorldEventsScreen.vue`).

| Surface | Requirements | What it covers |
|---|---|---|
| Map | LDG-04, LDG-05 | Route graph of a region's known places with a legend (here, visited, heard of, bind point); region list with level ranges; node detail (description, danger, travel cost, services, players there, related quests) with Travel and Travel with party |
| Social | LDG-06, LDG-07 | Party table (class, where, health) with invite, leave, remove, promote; loot shown as personal; pending invites; party chat; friends with online status and location; who's-online count; friend requests |
| World events | LDG-12, LDG-13, LDG-14 | Active, upcoming and recently resolved events with region and timers; detail with description, For/Against bar, objectives, timeline; contribution and percentile, party contribution, reward tiers, Travel there, Track in the sidebar |
| Party and player menus (backlog 999.22) | — | Context menus on party members and players, acting by role, sharing action helpers with the Social screen. Player trade is Phase 52 |
| Examine button (backlog 999.20) | — | An eye button on rail rows that looks at the thing, like typing `look at <name>` |

Mobile (390×844): Map, Party and World events open as full-height sheets above the tab bar (Map tab, Party tab, More → Events).

**Out of scope:** player trade (Phase 52); the Journal and its redesigned tracking block (999.16, Phase 52); loot modes; vote-to-remove; stored party chat; menus on names inside feed text; LLM-generated world events; prompt and Keeper text changes.

</domain>

<decisions>
## Implementation Decisions

### Map and travel (Area 1)
- **Known places are recorded on the server.** Add a private per-character table of visited places, written on arrival (`performTravel`) and on character creation or first spawn, exposed through a `my_*` view. A place is **heard of** when it connects to a visited place; this is derived on the client from `location_connection`. The map grows as the player explores. Places neither visited nor heard of are not shown.
- **The client lays out the route graph from the connections.** Places have no coordinates and the guard bans `<svg>`. Put the region's start place on the left and arrange places by their step distance from it, deterministically (same layout every time). Edges may use SVG on the map screen only (see the second revised map mock section), in the same coordinate space as the nodes, so dots and lines never drift apart.
- **Travel buttons:** superseded by the second revised map mock: one Travel button (see that section). Members get a **Follow leader** switch on the Social screen and in the self menu (`set_follow_leader`, which exists but is unwired).
- **Neighbours only (owner decision).** Travel buttons appear only for places next to the current one. Farther places show their highlighted path but no Travel button. Owner: "Travel to a far place requires a special ability, like teleport, otherwise, you must walk step by step." Research whether a teleport-style ability exists; if not, the node detail just says so (no new ability in this phase).
- **Region list:** every generated region the player knows, with its level range from the existing rule (`routeLevel` in `src/rails/levelRange.ts`, the min to max across the region).
- **Regions lock only by travel restriction (owner, 2026-10-06):** "Regions are locked via travel restrictions only. You have a timer that simulates travelling long distances between regions. This can be reduced via special abilities like bard travel songs, or other things that affect travel speed." While the caller's cross-region cooldown (`travel_cooldown`, 5 minutes base, shortened by the renown perk `travelCooldownReduction` and travel-speed effects) is running, every other region shows the lock (the mock's dimmed `ph-lock-simple` chip) with the remaining time, and cross-region Travel is disabled with the time left. Travel within the region is unaffected. The client shows the server's remaining time and never computes reductions itself. With no timer running, nothing is locked. Research checks which effects shorten the timer today (bard songs may not exist yet).
- **Travel cost** is shown from the server rules (`data/travel_config.ts`: stamina 5 within a region, 10 across, racial and effect modifiers), plus the cross-region cooldown from `travel_cooldown` (subscribe to the caller's own row).
- **Services** come from existing data: vendor and banker NPCs (`npcType`), `location.craftingAvailable`, `location.bindStone`, and `isSafe`. Trainer and inn are not mechanics; do not show them.
- **Related quests** use `quest_template` links (target location, source location, the giver NPC's location) within what the client can see. Research what extra subscription that needs.

### Party and social (Area 2)
- **No loot modes.** Show a plain "Loot: personal" label instead of the mock's loot-mode switch. Personal loot per fight participant stays as it is (it matches the Combat mock).
- **Leader-only removal.** No vote-to-remove. The leader removes and promotes (`kick_group_member`, `promote_group_leader`).
- **Online status is added.** The server marks a character online or offline on connect, disconnect and character switch (additive, for example a defaulted column or a small table). Party rows, Nearby, friends and `who` show it, and offline characters drop out of Nearby, `look` and `who`. Parties still keep offline members, shown as offline.
- **Security fixes in this phase:**
  - The public `user` table exposes every player's email. Make it private and serve friends through per-sender views that return character name, online status and location, never emails. `send_friend_request {email}` is checked in research; the name-based request is the one the client uses.
  - `join_group` must require a pending invite.
  - The who's-online count comes from a count-only view.
- **Party chat** on the Social screen shows this session's party lines from the feed (`event_group`), as today. It is not stored.

### World events (Area 3)
- **Events start on their own, by rules, with no LLM.** Each region runs at most one event at a time from the existing event shapes (cull enemies, gather items, defend a place), filled with that region's real enemy templates and places. A scheduled table drives it, with the module-identity guard pattern. Deterministic per tick from ctx-based seeds, never `Math.random`. Event definitions that point at seeded places that no longer exist (`data/world_event_data.ts`) are replaced by generated ones.
- **Upcoming:** the starter announces the next event ahead of time with a start time, so it shows as upcoming before it begins.
- **For/Against bar from the real success and failure counters**, as the Phase 47 rail card does. No invented factions.
- **History is kept.** Resolving an event keeps the event row and its contributions instead of deleting them, so "recently resolved" and percentiles work. Spawned content is still cleaned up.
- **Timeline:** the event's own history (announced, started, objectives completed, resolved) plus any follow-up event it caused. Research picks the storage (an event log table or a caused-by column, additive).
- **Contribution:** the player's percentile comes from all contribution counts for the event; the party total adds the party members' counts.
- **Reward tiers** show the server's real bronze, silver and gold count thresholds (`rewardTiersJson`), not the mock's percentages.
- **Track in the sidebar** is stored on the server per character (private table plus view, generic kind and id), so the Phase 52 Journal can reuse it for quests. The tracked event shows in the context rail.
- **Bug fixes included:**
  - `increment_event_counter` gets `requireAdmin` (todo `2026-09-29-require-admin-for-increment-event-counter-reducer.md`).
  - Fix the status mismatch: resolve writes `'failure'` while the one-time guard checks `'failed'`.
  - `collect_event_item` calls `.toHexString()` on a bigint.

### Party and player menus, and Examine (Area 4)
- **Where menus open:** each party member in the vitals rail, each player in Nearby, and each row on the Social screen get a "⋯" button; right-click opens the same menu. Clicking a party member still sets the ally target in combat (Phase 48), so the menu has its own button. On mobile, "⋯" opens the menu as a sheet. Keyboard: opens from the button, arrow keys, Escape closes, focus returns to the opener (reuse `focusTrap.ts` and the `AccountMenu.vue` role=menu pattern).
- **Entries by role:**
  - Everyone: Whisper, Invite, Add friend, Examine.
  - The leader also gets Promote and Remove on other members.
  - On yourself: Leave party and the Follow leader switch.
  - Trade is added in Phase 52.
  - The mock's "Inspect" becomes Examine.
  - Entries the target can't use are hidden or disabled (for example Invite on someone already in your party).
- **Examine (eye) button:**
  - An eye button (Phosphor eye) sits on every enemy, player, NPC, object and place row in the right rail, with the label "Examine {name}". It sends the same intent as typing `look at <name>` (`ConsoleApi.examine`).
  - The server learns to look at neighbouring places (today `look` covers only the current place).
  - On enemy cards (`HostileCard.vue` is a single `<button>`), the eye sits beside the card, never nested inside it.
- **Invites:**
  - An incoming invite shows as a card with Accept and Decline (Party mock 6b).
  - Invites expire after 5 minutes, and the inviter can cancel a pending invite (additive). Today an invite never expires, and a stale one blocks anyone else from inviting that player.
  - Fix the solo inviter auto-creating a group when the invite then fails.

### Owner additions after discuss (2026-10-06)
- **Bind stone in Nearby (owner request):** when the current place has `location.bindStone`, Nearby shows a bind stone row. It has a standing-stone style icon (closest Phosphor icon; the UI-SPEC names it), a **Bind** action calling the existing `bind_location`, "Bound here" when `character.boundLocationId` is this place, and the Examine eye. Todo: `2026-10-06-bind-stone-in-nearby-with-bind-action.md`.
- **Chat bubble instead of "hail" (owner request):** NPC rows in Nearby get a chat bubble icon button that does the hail, labelled "Talk to {name}". The row hint drops "hail". The UI-SPEC decides whether the feed keyword label "Hail {name}" also becomes "Talk to {name}". Todo: `2026-10-06-nearby-npc-chat-bubble-instead-of-hail.md`.
- **Revised map mock (owner, 2026-10-06):** `UWR Map.dc.html`, screen 11a, extracted to the session scratchpad `design51/map/MAP-EXTRACT.md`. It supersedes Ledger 2d for the map. The drawer covers the centre feed and right rail, and the real left vitals rail stays visible (not the mock's reduced copy). Region chips sit in the title row, and the legend is a floating pill. Overrides: the locked region chip means the cross-region travel timer is running (see Region list); edges are CSS, not SVG; and the missing far-place state is added (path highlighted, no Travel buttons, a note about walking step by step or teleport abilities).

### Second revised map mock (owner, 2026-10-07): decisions
- **Source:** `UWR Map.dc.html` re-imported to the session scratchpad `design51/map2/MAP2-EXTRACT.md`. It supersedes the earlier 11a extract. It is a working prototype with terrain icons, danger rings against your level, a "Region travel: Ready / m:ss left" pill, region borders, border pills ("To Saltmarsh · Lv 4–7"), a "Region crossing" block, door icons in routes, "Cross into {Region}" and "Select first stop: {name}". It does not show sub-regions (999.26). The mock has 12 places; the 10-place cap belongs to 999.26.
- **Regions lock only by the travel timer (owner re-confirmed).** Drop the mock's level gate ("Requires level 10", "Locked until level 10"). The border pill's level range is a warning only. The lock and the time left appear only while the caller's region-travel timer runs, read from the server; the mock's hard-coded "5:00" is not used.
- **Party travel follows the mock (owner; replaces the earlier two-button decision).** There is one Travel button. When the leader travels, members with Follow leader on come along (today's server behaviour). The left vitals rail shows the party's stamina so the leader can see who is low. There is no "Travel alone" button and no new solo-travel reducer. A member's Travel moves only that member, as today.
- **SVG is allowed on the map screen only (owner).** The region border, cross-region links and route highlight may be drawn in SVG to match the mock, on desktop and mobile. The `<svg` guard gets exactly one allowed folder, the map screen's folder (for example `src/map/`). Everything else keeps the ban, and the SVG still uses tokens, never literal colors. Nodes and edges must share one coordinate space, so the mock's mobile misalignment does not come back. This replaces the earlier "CSS edges" rule.
- **Dungeons show "Dungeon" with their danger,** as normal shared places. Drop "instanced"; the game has no instances.
- The real left vitals rail stays (not the mock's cut-down copy), and it gains the party stamina the mock shows if the rail lacks it. Region chips are clickable and select the region. After travelling, the detail panel shows the new current place, not a blank. Add Swamp to the terrain legend.

### Region transitions collapse after discovery (owner, 2026-10-06)
- **Keep the uncharted "Edge Beyond {Region}" until it is explored.** It is how players find the unknown, and the map shows it as "something lies beyond".
- **After the next region is generated, the edge goes away.** Today it is renamed "The Passage to {Region}" and stays a stop of its own (`llm_apply.ts:522-531`). Instead, link its neighbour on this side directly to the new region's arrival point and delete the passage. The map draws that link as a **border crossing** showing where the regions meet, and crossing it starts the travel timer.
- **The passage stays until it is empty (owner, 2026-10-06).** Generation moves no one. The explorer and anyone else standing on the edge are still there afterwards, as today.
  - While any character stands in it, the passage stays as a stop leading both ways.
  - When the last character leaves, in either direction, it collapses into the direct border crossing.
  - A periodic sweep (a scheduled table with the module-identity guard) stops offline characters from holding it open forever. It moves any offline character still standing in a passage back to the neighbour on their own side (never across the border), then collapses the passage.
- **Edge cases:**
  - Binds, quests and events that point at a passage are re-pointed or cleared.
  - Existing passages in the local world are cleaned up once, by a guarded or admin step. Never clear the database (it wipes the key).
  - Real-handler tests cover all of these.

### World structure moves to its own milestone (owner, 2026-10-06)
- 10-place regions, typed sub-regions (no travel timer inside them), hidden places revealed by quests, type-driven creatures, gatherables and loot, the two prompt changes, and the map's layer view all move to backlog **999.26**, which becomes its own milestone after v3.0. The owner's decisions are recorded there.
- Phase 51 builds the map on today's world, with border crossings and travel-timer locks. Keep the map code ready for layers later; do not build the layer view now.
### Shared rules
- Server changes are additive (new tables, views, reducers and defaulted columns). Publish locally only: `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`, checking `admin_llm_status` key length 108 before and after; never `--clear-database`; regenerate the bindings. Real-handler tests for every rule. Prefer `fail(ctx, character, msg)` where a character exists.
- Design guards: no literal colors (the token pin stays at 23), no v-html, no `<svg`, Phosphor icons and Inter only, sizes 10/12/14/20, weights 400/500, spacing 4/8/16/24/32/48/64, text nodes only, no `replaceAll`/`.at`/`Object.hasOwn`, and never the word "ripple" (use "World event"). Map off-scale mock values to the nearest allowed ones.
- Whisper: the mock shows "/tell", but the command is `whisper` / `w`. Use the real command.

### Claude's Discretion
- The exact graph layout algorithm, provided it is deterministic and readable.
- Storage shapes for visited places, online status, tracking, the event timeline and invite expiry, provided they are additive and private where per-player.
- The scheduling interval, announcement lead time and duration of rule-based events, within sensible play values. Research proposes them and the plan states them.
- Splitting the phase into many small plans (Phase 50 used 27 and more).

</decisions>

<code_context>
## Existing Code Insights

Full scout report: session scratchpad `p51/scout.md`. Design extract: session scratchpad `design51/EXTRACT.md` (Ledger 2d Map lines 334–433, 2e Group and social 435–528, 2h World events 710–801, 2i rail 887–917; Party 6a menus 37–202, 6b invite receiver 204–290, 6c trade 292–420 for Phase 52 only; Journal 5c tracking block 219–340 for Phase 52). Re-import fresh at UI-SPEC time if the owner changes the files.

### Reusable Assets
- Server travel: `helpers/travel.ts` `performTravel` (blocks, adjacency, stamina, followers, arrival hooks), `reducers/movement.ts` `move_character`, intents in `reducers/intent.ts`, `data/travel_config.ts`, public `travel_cooldown`.
- Groups: `reducers/groups.ts` (`MAX_GROUP_SIZE=5`, invite/accept/reject/leave/kick/promote/`set_follow_leader`/`set_group_puller`), views `my_group_invites` and `my_group_members`.
- Social: `reducers/social.ts` (friend requests by name and by email, accept/reject/remove), views `my_friends` and `my_friend_requests` (unused by the client), presence lines in `characters.ts` and `auth.ts`.
- World events: `helpers/world_events.ts`, `reducers/world_events.ts`, tables `world_event`, `event_objective`, `event_contribution`, `event_spawn_*`, `world_stat_tracker`, `event_despawn_tick`.
- Look: `helpers/examine.ts` `parseLookCommand`/`describeLookTarget`, `helpers/look.ts`.
- Client: `src/ledger/*` hub pattern (`createKeyed`, queries, `actionRunner.ts`), `src/game/gameData.ts` and `src/game/queries.ts`, `src/rails/*` (PartyBlock, TrackingList, WorldEventCard, levelRange), `src/frame/ContextRail.vue`, `AccountMenu.vue` (menu pattern), `focusTrap.ts`, `FrameControls.openScreen(id, args)`.
- The old client (deleted in d86ad950, read with `git show d86ad950^:<path>`): `MapPanel.vue`, `GroupPanel.vue`, `ContextMenu.vue`, `useGroups.ts`, `FriendsPanel.vue`, `useFriends.ts`, `WorldEventPanel.vue`, `useSocialData.ts`, `useWorldEventData.ts`, for logic only.

### Established Patterns
- Private table plus `my_*` per-sender view, using primary-key or index lookups only (as with `vendor_buyback` and `my_vendor_buyback`).
- Scheduled tables with `scheduledId` and the module-identity guard (as with `restock_vendors`).
- Session-owned data hubs provided in `App.vue`, with keyed bindings filtered like the SQL.
- `screenArgs` is kept only for 'vendor' today; extend it for map (node or region), world events (event id) and social if needed.

### Integration Points
- `src/screens/screens.ts` placeholders; tabs: map → 'map', party → 'social', More → Events (`tabs.ts`, `MoreSheet.vue`). `useScreens.ts` allows only encounter and more in combat.
- Guard tests to update: `src/frame/frameContract.test.ts:92` (the 1200px folder allow-list, if new folders use the wide tier), `screens.test.ts`, `AppFrame.screens.test.ts`, `railsShell.test.ts` (exactly three rail sections), `effectChipsGuards.test.ts` (fixed file list including HostileCard, gameData, queries, context).
- `GameReducers` (`src/game/context.ts`) lacks setFollowLeader, setGroupPuller and the friend accept, reject and remove reducers.
- Subscriptions are missing for player presence, friends, `travel_cooldown`, resolved events, contributions by event, and the full connection table.

</code_context>

<specifics>
## Specific Ideas

- Owner, on far travel: "Travel to a far place requires a special ability, like teleport, otherwise, you must walk step by step."
- The Ledger mock is the layout source for Map (2d), Group and social (2e) and World events (2h); the Party mock (6a, 6b) is the source for menus and the invite card.

</specifics>

<deferred>
## Deferred Ideas

- Player trade (Party mock 6c): Phase 52.
- The Journal's redesigned tracking block (Journal mock 5c): Phase 52 with 999.16.
- Loot modes (round robin, leader decides).
- Vote-to-remove.
- Stored party chat history.
- Menus on names inside feed text.
- A teleport-style ability for far travel, if none exists.
- "Heard of" from rumours and NPC mentions (backlog 999.10). This phase uses connections only.
- World structure: 10-place regions, typed sub-regions, hidden places and the map layer view (backlog 999.26, next milestone).

</deferred>
