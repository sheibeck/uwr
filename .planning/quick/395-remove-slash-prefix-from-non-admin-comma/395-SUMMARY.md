---
phase: quick-395
plan: "01"
subsystem: client-commands, server-groups
tags: [commands, ux, social, groups]
dependency_graph:
  requires: []
  provides: [slash-free-commands, clickable-who-names, bare-group-status, enriched-invite-messages]
  affects: [src/App.vue, src/composables/useCommands.ts, spacetimedb/src/reducers/groups.ts, spacetimedb/src/reducers/intent.ts]
tech_stack:
  added: []
  patterns: [client-command-routing, clickable-narrative-keywords, social-context-menus]
key_files:
  modified:
    - src/App.vue
    - src/composables/useCommands.ts
    - spacetimedb/src/reducers/groups.ts
    - spacetimedb/src/reducers/intent.ts
decisions:
  - Removed groupMembers from UseCommandsArgs since it was not referenced in the group status handler
  - Whisper click with no message shows a hint rather than pre-filling input (simpler, no input ref dependency)
  - Player context menu uses addLocalEvent('system', ..., 'private') consistent with other private messages
metrics:
  duration: "~10 minutes"
  completed: "2026-03-10"
  tasks_completed: 2
  files_modified: 4
---

# Quick-395: Remove Slash Prefix from Non-Admin Commands Summary

All non-admin player commands now work without the / prefix. Group invite messages include clickable accept/decline keywords. Player names in the who list are clickable and show a social context menu.

## Tasks Completed

### Task 1: Route all player commands without slash prefix and add group/who narrative handlers
**Commit:** 641b267

- Expanded `clientHandledCommands` list in `onNarrativeSubmit` (App.vue) to route `who`, `accept`, `decline`, `leave`, `invite`, `kick`, `promote`, `whisper`, `w`, `friend`, `endcombat`, `end`, `endc`, `group`, `renown`, `factions`, `faction`, `events` to `submitCommand` without requiring `/` prefix
- Added `groups?: Ref<any[]>` to `UseCommandsArgs` and passed `groups` computed from App.vue
- Added bare `group` command handler in `useCommands.ts` — shows group members with leader tag, leave option, and pending invites with clickable `[accept Name]` / `[decline Name]` links
- Updated `who` command output to wrap names in `[Name]` brackets making them clickable keywords
- Added player name click handler (section 13.5) in `clickNpcKeyword` — when a player name from the who list is clicked, shows a context menu with `[invite Name]`, `[whisper Name ]`, `[consider Name]` options
- Added whisper hint handler for `whisper Name ` (no message body) clicks — shows "Type: whisper Name <your message>"

### Task 2: Enrich server-side group invite message with clickable accept/decline
**Commit:** 4ea2b89

- Group invite message in `groups.ts` now reads: `"${inviter.name} invited you to a group. Type [accept ${inviter.name}] to join or [decline ${inviter.name}] to refuse."`
- Added `[group] — View group status, members, and pending invites.` to help text in `intent.ts` (alphabetical order between `go` and `hail`)
- Published module locally: `spacetime publish uwr -p spacetimedb` — succeeded with no schema changes

## Verification

- TypeScript compilation passes with no new errors (pre-existing unused-variable warnings unaffected)
- Server module published successfully to local SpacetimeDB

## Deviations from Plan

### Auto-removed unused parameter

**Found during:** Task 1 implementation
**Issue:** `groupMembers` was added to `UseCommandsArgs` per the plan spec but was not referenced in the bare group handler (members are retrieved directly from `characters` filtered by `groupId`)
**Fix:** Removed `groupMembers` from the interface and destructuring to avoid a TypeScript `TS6133: declared but never read` error
**Files modified:** `src/composables/useCommands.ts`, `src/App.vue`

## Self-Check

### Files exist
- [x] `src/App.vue` — modified
- [x] `src/composables/useCommands.ts` — modified
- [x] `spacetimedb/src/reducers/groups.ts` — modified
- [x] `spacetimedb/src/reducers/intent.ts` — modified

### Commits exist
- [x] 641b267 — feat(quick-395-01)
- [x] 4ea2b89 — feat(quick-395-02)

## Self-Check: PASSED
