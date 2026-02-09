# Project State (Unwritten Realms)

Last updated: 2026-02-08

## Overview
- Text-based MMORPG using SpacetimeDB (TypeScript server) + Vue 3 client.
- Local/standalone SpacetimeDB (no maincloud).
- Core loop: create character, move between locations, submit commands, combat, event log.
- Event streams are segmented: world, location, private, group.

## Architecture
- Server: `C:\projects\uwr\spacetimedb\src\index.ts` (schema + helpers) and `C:\projects\uwr\spacetimedb\src\reducers\` (feature reducers).
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
  - Group and combat member lists show the current player first.
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
  - Combat auto-opens for all group members.
  - Dead characters cannot act; combat ends if all active participants are dead.
  - Dead characters revive at half HP after combat ends.
  - Enemy respawns after death; new spawns created as new groups/solos arrive.
  - Combat results screen shown after combat; leader dismisses to return to enemy list.
- **Characters:**
  - Max 3 character slots per account (MVP).
  - Character deletion with confirmation + full cleanup.
- **Regen:**
  - HP/Mana/Stamina regen every 3s.
  - Out of combat: full rate. In combat: half rate (every other tick).
  - No regen while dead; revive after combat at 1/4 of max HP/Mana/Stamina.
## UI State (Current)
- **Layout:**
  - Centered log window; floating windows around it.
  - Floating windows are draggable and persist positions in localStorage.
  - Group panel is always visible (floating, compact width).
  - Region/Locations + Inhabitants are combined into one floating panel on the right.
  - Action bar panels open as floating windows (closable with X).
  - Travel and Combat buttons removed from action bar.
  - Hotbar is a vertical, draggable floating dock left of the log; always visible with 10 slots.
- **Log:**
  - Command input with `/` autocomplete and keyboard navigation.
  - Session-only logs (filter by `player.sessionStartedAt`).
- **Inhabitants Panel:**
  - Accordion sections: Characters, NPCs, Enemies.
  - Characters list moved from log to this panel.
  - Enemies section handles combat actions; enemy list is con-colored.
- **Travel Mini-map:**
  - Shows current region in header, connected locations with arrows, region names, and target level con colors.
- **Hotbar:**
  - Configuration via Hotbar panel; combat-use via vertical dock.
  - Hotbar selections highlight when chosen for a combat round.
  - Empty slots shown.

## Ability Plan (MVP, Lv1–Lv5)
- Rules:
  - Combat abilities at levels 1, 3, 5.
  - Non-combat abilities at levels 2, 4 (usable in or out of combat).
  - Spells use Mana; techniques use Stamina.
- **Bard**
  - Lv1: Discordant Note (Mana) — 6 dmg + Weaken (-2 enemy dmg) for 2 rounds.
  - Lv2: Song of Ease (Mana) — Party regen +1 HP/round for 3 rounds.
  - Lv3: Echoed Chord (Mana) — 8 dmg +1 per ally.
  - Lv4: Harmony (Mana) — Party +2 attack for 3 rounds.
  - Lv5: Crushing Crescendo (Mana) — 12 dmg, +4 if target debuffed.
- **Enchanter**
  - Lv1: Mind Lash (Mana) — 5 dmg + DOT 2 for 2 rounds.
  - Lv2: Clarity (Mana) — Restore 5 mana to target ally.
  - Lv3: Slow (Mana) — Enemy damage -3 for 2 rounds.
  - Lv4: Clarity II (Mana) — Restore 8 mana to target ally.
  - Lv5: Charm Fray (Mana) — 10 dmg, enemy damage -3 for 3 rounds.
- **Cleric**
  - Lv1: Minor Heal (Mana) — Heal ally for 8.
  - Lv2: Blessing (Mana) — Target ally +5 max HP for 5 mins.
  - Lv3: Smite (Mana) — 9 holy damage.
  - Lv4: Sanctuary (Mana) — Party +2 AC for 3 rounds.
  - Lv5: Heal (Mana) — Heal ally for 15.
- **Warrior**
  - Lv1: Slam (Stamina) — 7 dmg + taunt (aggro +10).
  - Lv2: Shout (Stamina) — Party +2 attack for 3 rounds.
  - Lv3: Cleave (Stamina) — 10 dmg.
  - Lv4: Rally (Stamina) — Party +2 AC for 3 rounds.
  - Lv5: Crushing Blow (Stamina) — 14 dmg.
- **Rogue**
  - Lv1: Backstab (Stamina) — 9 dmg if enemy has aggro on another ally.
  - Lv2: Smoke Step (Stamina) — Reduce your aggro by 50%.
  - Lv3: Bleed (Stamina) — 6 dmg + DOT 3 for 2 rounds.
  - Lv4: Evasion (Stamina) — +10 dodge for 3 rounds.
  - Lv5: Shadow Strike (Stamina) — 12 dmg, +4 if target debuffed.
- **Paladin**
  - Lv1: Holy Strike (Mana) — 8 dmg.
  - Lv2: Prayer (Mana) — Party +5 max HP for 5 mins.
  - Lv3: Shield of Faith (Mana) — +4 AC for 3 rounds.
  - Lv4: Devotion (Mana) — Party +2 damage for 3 rounds.
  - Lv5: Radiant Smite (Mana) — 13 dmg.
- **Ranger**
  - Lv1: Aimed Shot (Stamina) — 8 dmg.
  - Lv2: Track (Mana) — Reveal nearest higher-level enemy in location.
  - Lv3: Rapid Shot (Stamina) — 6 dmg twice.
  - Lv4: Nature’s Balm (Mana) — Heal self for 8.
  - Lv5: Piercing Arrow (Stamina) — 12 dmg, ignores 2 AC.
- **Necromancer**
  - Lv1: Shadow Bolt (Mana) — 7 dmg.
  - Lv2: Siphon Vitality (Mana) — Regen 1 HP/round for 3 rounds.
  - Lv3: Wither (Mana) — 6 dmg + DOT 3 for 2 rounds.
  - Lv4: Bone Ward (Mana) — +3 AC for 3 rounds.
  - Lv5: Grave Surge (Mana) — 12 dmg.
- **Spellblade**
  - Lv1: Arcane Slash (Mana) — 8 dmg.
  - Lv2: Focus (Stamina) — +2 attack for 3 rounds.
  - Lv3: Runic Strike (Mana) — 10 dmg, +2 if target debuffed.
  - Lv4: Ward (Mana) — +3 AC for 3 rounds.
  - Lv5: Spellstorm (Mana) — 14 dmg.
- **Shaman**
  - Lv1: Spirit Bolt (Mana) — 7 dmg.
  - Lv2: Totem of Vigor (Mana) — Party +1 HP/round for 3 rounds.
  - Lv3: Hex (Mana) — 6 dmg, enemy damage -2 for 3 rounds.
  - Lv4: Ancestral Ward (Mana) — +2 AC for 3 rounds.
  - Lv5: Stormcall (Mana) — 12 dmg.
- **Beastmaster**
  - Lv1: Call Companion (Stamina) — Summon a beast strike for 8 dmg.
  - Lv2: Pack Bond (Stamina) — Party +2 attack for 3 rounds.
  - Lv3: Beast Fang (Stamina) — Summoned beast rends for 10 dmg.
  - Lv4: Wild Howl (Stamina) — Party +2 damage for 3 rounds.
  - Lv5: Alpha Assault (Stamina) — Beast charges for 14 dmg.
- **Monk**
  - Lv1: Kick (Stamina) — 7 dmg, enemy skips next attack.
  - Lv2: Meditation (Stamina) — Regen 2 HP/round for 3 rounds.
  - Lv3: Palm Strike (Stamina) — 10 dmg.
  - Lv4: Inner Focus (Stamina) — +2 dodge for 3 rounds.
  - Lv5: Tiger Flurry (Stamina) — 6 dmg twice.
- **Druid**
  - Lv1: Thorn Lash (Mana) — 6 dmg.
  - Lv2: Regrowth (Mana) — Heal ally for 6.
  - Lv3: Bramble (Mana) — 7 dmg + DOT 2 for 2 rounds.
  - Lv4: Nature’s Gift (Mana) — Party +2 damage for 3 rounds.
  - Lv5: Wild Surge (Mana) — 12 dmg.
- **Reaver**
  - Lv1: Dark Cut (Mana) — 8 dmg.
  - Lv2: Blood Pact (Stamina) — +4 max HP for 5 mins.
  - Lv3: Soul Rend (Mana) — 10 dmg, +2 if target debuffed.
  - Lv4: Dread Aura (Mana) — Enemy damage -2 for 3 rounds.
  - Lv5: Oblivion (Mana) — 14 dmg.
- **Summoner**
  - Lv1: Arcane Bolt (Mana) — 7 dmg.
  - Lv2: Familiar (Mana) — +1 mana/round for 3 rounds.
  - Lv3: Conjured Spike (Mana) — 9 dmg.
  - Lv4: Empower (Mana) — Party +2 damage for 3 rounds.
  - Lv5: Spectral Lance (Mana) — 13 dmg.

## Tables / Views (Server)
- Player: `userId`, `activeCharacterId`, `sessionStartedAt`, etc.
- User: email (unique via lookup).
- Character: `ownerUserId`, `groupId`, stats, location.
- Group/GroupMember/GroupInvite.
- Friend/FriendRequest.
- Combat:
  - `enemy_template`, `location_enemy_template`, `enemy_spawn`.
  - `combat_encounter`, `combat_participant`, `combat_enemy`, `aggro_entry`, `combat_round_tick`.
  - `combat_result`, `health_regen_tick`.
- Events: `event_world`, `event_location`, `event_private`, `event_group`.
- Views: `my_player`, `my_private_events`, `my_group_events`, `my_location_events`,
  `my_friend_requests`, `my_friends`, `my_group_invites`, `my_group_members`, `my_combat_results`.

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
- HP bars (green), mana bars (blue), stamina bars (yellow) in combat/group panels.

## Known Behaviors / Notes
- Character names are globally unique (case-insensitive).
- `/accept` or `/decline` without a name works if exactly one pending invite exists.
- Command autocomplete appears when input starts with `/`, supports keyboard navigation.
- Group invite alerts invitee via private event.
- Friend request success/failure messages emitted via private events.
- **Stamina/Mana migration pending:** schema changes require publishing with `--delete-data`.
- **Region/Location migration pending:** schema changes require publishing with `--delete-data`.
- **Item/Enemy schema expansion pending:** schema changes require publishing with `--delete-data`.

## Required Commands
- Publish local module: `spacetime publish uwr --project-path spacetimedb --server local`
- Publish with data deletion (for stamina/mana schema): `spacetime publish uwr --project-path spacetimedb --server local --delete-data`
- Generate bindings: `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb`
- Start local server: `spacetime start`
- Dev server: `npm run dev`

## Open Items / TODO
- Upgrade auth to email verification (magic link / OTP).
- Optional: add outgoing invite list in group UI.
- Optional: add friend request notifications in UI beyond log.
