# API Coverage — SpacetimeDB client bindings (module `uwr`)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
>
> The detector fired on the roadmap's design-source note (the claude_design MCP). The surface that matters for Phase 47 is the generated SpacetimeDB bindings in `src/module_bindings/` (reducers called and tables or views subscribed). The bindings are generated and are not edited; no server or schema change is planned (client-only phase).

| capability | decision | reason |
|---|---|---|
| reducer submit_intent | INTEGRATE | |
| reducer submit_command | INTEGRATE | |
| reducer talk_to_npc | INTEGRATE | |
| reducer whisper | INTEGRATE | |
| reducer group_message | INTEGRATE | |
| reducer invite_to_group | INTEGRATE | |
| reducer accept_group_invite | INTEGRATE | |
| reducer reject_group_invite | INTEGRATE | |
| reducer leave_group | INTEGRATE | |
| reducer kick_group_member | INTEGRATE | |
| reducer promote_group_leader | INTEGRATE | |
| reducer end_combat | INTEGRATE | |
| reducer send_friend_request_to_character | INTEGRATE | |
| reducer switch_hotbar | INTEGRATE | |
| reducer use_ability | INTEGRATE | |
| reducer move_character | INTEGRATE | |
| reducer start_gather_resource | INTEGRATE | |
| reducer hail_npc | OPT-OUT | not needed: hail runs through submit_intent 'hail <Name>' (research A9; dialogue trees were removed in v2.0) |
| reducer use_ability_realtime | OPT-OUT | explicitly out of scope: combat-only and ignores targetEnemyId; the round-based combat UI is Phase 48 |
| reducer say | OPT-OUT | not needed: 'say x' and '/say x' go through submit_intent, which writes the same location line |
| reducer create_hotbar | OPT-OUT | explicitly out of scope: hotbar editing is Phase 50 (CONTEXT deferred) |
| reducer delete_hotbar | OPT-OUT | explicitly out of scope: hotbar editing is Phase 50 (CONTEXT deferred) |
| reducer set_hotbar_slot | OPT-OUT | explicitly out of scope: slot assignment is Phase 50 (CONTEXT deferred) |
| reducer use_item | OPT-OUT | explicitly out of scope: inventory is Phase 50; no hotbar slot references an item (research S9) |
| reducer flee_combat | OPT-OUT | explicitly out of scope: combat UI is Phase 48 (after 46.1) |
| admin dev reducers | OPT-OUT | explicitly out of scope: dev slash commands (level, grant renown, create item, spawn corpse, end event, set app version) wait for the Phase 52 parity checklist (owner decision) |
| table event_private (filtered by owner_user_id) | INTEGRATE | |
| table event_location (filtered by location_id) | INTEGRATE | |
| table event_group (filtered by group_id) | INTEGRATE | |
| table event_world | INTEGRATE | |
| view my_character_effects | INTEGRATE | |
| view my_quests | INTEGRATE | |
| view my_llm_jobs | INTEGRATE | |
| view my_group_invites | INTEGRATE | |
| view my_faction_standings | INTEGRATE | |
| table faction | INTEGRATE | |
| table npc (by location) | INTEGRATE | |
| table resource_node (by location) | INTEGRATE | |
| table character (by location and by id list) | INTEGRATE | |
| table location_connection (from location) | INTEGRATE | |
| table hotbar | INTEGRATE | |
| table hotbar_slot | INTEGRATE | |
| table ability_template | INTEGRATE | |
| table ability_cooldown | INTEGRATE | |
| table event_contribution | INTEGRATE | |
| table renown | INTEGRATE | |
| table renown_perk | INTEGRATE | |
| table group | INTEGRATE | |
| table group_member | INTEGRATE | |
| table quest_template (by id list) | INTEGRATE | |
| table world_event (status active) | INTEGRATE | |
| table event_objective (by event id list) | INTEGRATE | |
| table event_creation | OPT-OUT | explicitly out of scope: creation-time reveals belong to Phase 49 |
| table item_cooldown | OPT-OUT | not needed: no column links a hotbar slot to an item key (research S9) |
| combat tables | OPT-OUT | explicitly out of scope: combat_encounter, combat_enemy, combat_enemy_cast, combat_round, combat_action (and the private aggro_entry) belong to the Phase 48 combat UI |
| view my_group_members | OPT-OUT | not needed: it holds only the player's own membership rows; the roster comes from group_member by group_id |
| friend tables (my_friends, my_friend_requests) | OPT-OUT | explicitly out of scope: the Social screen content is Phase 51 |
| table player | OPT-OUT | not needed: Nearby players come from character by location (research A8); the player table is heavy |
