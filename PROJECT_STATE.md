# Project State (Unwritten Realms)

Last updated: 2026-02-08

## Overview
- Text-based MMORPG using SpacetimeDB (TypeScript server) + Vue 3 client.
- Local/standalone SpacetimeDB (no maincloud).
- Core loop: create character, move between locations, submit commands, combat, event log.
- Event streams are segmented: world, location, private, group.

## Architecture
- Server: `C:\projects\uwr\spacetimedb\src\index.ts`
- Client: Vue 3 app with composables and UI components.
- Bindings: generated via `spacetime generate` into `C:\projects\uwr\src\module_bindings`.
- Styles: inline style objects in `src/ui/styles.ts`.

## Key Features Implemented
- **Auth (MVP):** Email login without verification.
  - Reducers: `login_email`, `logout`.
  - Player has `userId` (u64) + `sessionStartedAt`.
  - UI shows logged-in email and logout.
- **Session-only logs:** Client filters events by `player.sessionStartedAt`.
- **Presence:** Only friends see online/offline; only when a character becomes active.
- **Commands:**
  - `/look`: private location description.
  - `/say`: location chat.
  - `/w` / `/whisper`: private whisper (purple).
  - `/invite`, `/accept`, `/decline` for groups.
  - `/kick`, `/promote`, `/leave`.
  - `/friend <character>` sends friend request.
- **Groups:**
  - Invite-only; auto-create group on invite.
  - Leader can invite, kick, promote.
  - Leader movement pulls members who opted into follow and are in same location.
  - Follow leader toggle (default ON); hidden for leaders.
  - Group disband when last member leaves; leader auto-promoted when leader leaves.
  - Pending invite UI in Group panel.
- **Friends:**
  - Mutual friends + friend requests.
  - Friends panel shows incoming and outgoing requests.
  - `/friend` sends request; duplicates show message.
- **Combat (MVP):**
  - Location-based enemy spawns; one enemy per group/solo.
  - Leader-only engages for groups; solo engages for self.
  - Round-based actions: `attack`, `skip`, `flee`.
  - 10s round timer; default action is `skip`.
  - Aggro from damage only; `skip` reduces aggro.
  - Dead characters are removed from combat and respawn when combat ends.
  - Enemy respawns after death; new spawns created as new groups/solos arrive.
- **UI:**
  - Main log window, command input with `/` autocomplete and keyboard navigation.
  - Action bar with panels (Character, Inventory, Friends, Group, Stats, Travel, Combat).
  - Group button always visible; other buttons only if character selected.

## Tables / Views (Server)
- Player: `userId`, `activeCharacterId`, `sessionStartedAt`, etc.
- User: email (unique via lookup).
- Character: `ownerUserId`, `groupId`, stats, location.
- Group/GroupMember/GroupInvite.
- Friend/FriendRequest.
- Combat:
  - `enemy_template`, `location_enemy_template`, `enemy_spawn`.
  - `combat_encounter`, `combat_participant`, `combat_enemy`, `aggro_entry`, `combat_round_tick`.
- Events: `event_world`, `event_location`, `event_private`, `event_group`.
- Views: `my_player`, `my_private_events`, `my_group_events`, `my_location_events`,
  `my_friend_requests`, `my_friends`, `my_group_invites`, `my_group_members`.

## Client Structure
- Composables: 
  - `useGameData`, `usePlayer`, `useAuth`, `useCharacters`, `useEvents`,
  - `useCharacterCreation`, `useCommands`, `useCombat`, `useGroups`, `useMovement`, `useFriends`.
- Components:
  - `AppHeader`, `LogWindow`, `PanelShell`, `CharacterPanel`, `InventoryPanel`,
  - `FriendsPanel`, `GroupPanel`, `StatsPanel`, `CombatPanel`, `TravelPanel`,
  - `CommandBar`, `ActionBar`.

## Styling
- Dark theme, inline styles in `src/ui/styles.ts`.
- Whisper text purple; command text gold; presence muted gray; private slightly distinct.

## Known Behaviors / Notes
- Character names are globally unique (case-insensitive).
- `/accept` or `/decline` without a name works if exactly one pending invite exists.
- Command autocomplete appears when input starts with `/`, supports keyboard navigation.
- Group invite alerts invitee via private event.
- Friend request success/failure messages emitted via private events.

## Required Commands
- Publish local module: `spacetime publish uwr --project-path spacetimedb --server local`
- Generate bindings: `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb`
- Start local server: `spacetime start`
- Dev server: `npm run dev`

## Open Items / TODO
- Upgrade auth to email verification (magic link / OTP).
- Optional: add outgoing invite list in group UI.
- Optional: add friend request notifications in UI beyond log.
