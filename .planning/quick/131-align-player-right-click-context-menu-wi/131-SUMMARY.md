---
phase: quick-131
plan: 01
subsystem: ui
tags: [vue, context-menu, player-actions, LocationGrid, GroupPanel]

requires: []
provides:
  - Inline player context menu in LocationGrid with Target, Trade, Send Message, Invite, Friend Request, Promote, Kick options
  - Inline member context menu in GroupPanel with same action set
  - CharacterActionsPanel floating panel removed from UI
affects: [ui, player-interactions]

tech-stack:
  added: []
  patterns:
    - "Inline context menu pattern extended to player interactions (matching NPC/enemy/corpse pattern)"
    - "Granular player-* emits replace single character-action emit for fine-grained action routing"

key-files:
  created: []
  modified:
    - src/components/LocationGrid.vue
    - src/components/GroupPanel.vue
    - src/App.vue

key-decisions:
  - "friendUserId in FriendRow is u64 (bigint), not Identity - use .toString() not .toHexString() for friend membership checks"
  - "GroupPanel emits replaced: character-action removed, player-trade/friend/promote/kick/message added; kick no longer emitted from GroupPanel directly"
  - "CharacterActionsPanel floating panel fully removed (panel div, import, openCharacterActions function, actionTarget computeds, panel defaults entry)"

duration: 10min
completed: 2026-02-17
---

# Quick Task 131: Align Player Right-Click Context Menu Summary

**Replaced single-entry player 'Actions' context menu with full inline menus in LocationGrid and GroupPanel, matching the NPC/enemy/corpse right-click pattern throughout the app**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-17T13:30:34Z
- **Completed:** 2026-02-17T13:41:03Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- LocationGrid player right-click now shows inline Target, Trade, Send Message always; Invite to Group (if not in group), Friend Request (if not friend), Promote to Leader and Kick (if viewer is leader and target is not leader)
- GroupPanel member right-click shows same action set; right-clicking self shows disabled "You" item
- CharacterActionsPanel floating panel completely removed - no more separate window for player interactions
- All player action functions (inviteToGroup, kickMember, sendFriendRequest, promoteLeader, startTrade, sendWhisperTo) reused directly via new event emissions

## Task Commits

1. **Task 1: Expand LocationGrid player context menu with all inline actions** - `769c48d` (feat)
2. **Task 2: Add inline context menu to GroupPanel for group member right-click** - `2c67145` (feat)

## Files Created/Modified
- `src/components/LocationGrid.vue` - Added myFriendUserIds/groupMemberIds/isLeader/leaderId props, rewrote openCharacterContextMenu with full inline action list, replaced character-action emit with 6 granular player-* emits
- `src/components/GroupPanel.vue` - Added ContextMenu component, contextMenu ref, openMemberContextMenu function, myFriendUserIds/myCharacterId props, replaced character-action emit with granular player-* emits
- `src/App.vue` - Removed CharacterActionsPanel panel div, import, openCharacterActions, and actionTarget computeds; added myFriendUserIds and groupMemberIdStrings computeds; wired new event handlers on LocationGrid and GroupPanel

## Decisions Made
- `friendUserId` in FriendRow is `u64` (bigint), not `Identity` - use `.toString()` comparison instead of `.toHexString()` for friend membership checks in myFriendUserIds computed
- Removed `kick` emit from GroupPanel's emit contract (was `character-action` → now `player-kick` inline from context menu)
- `const emit = defineEmits` placed before `openMemberContextMenu` to avoid `const` temporal dead zone at runtime

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed friendUserId toHexString() call on bigint**
- **Found during:** Task 1 (App.vue myFriendUserIds computed)
- **Issue:** Plan specified `f.friendUserId.toHexString()` but friendUserId is u64 (bigint), not Identity - bigint has no toHexString() method; caused TS2551 error
- **Fix:** Changed to `.toString()` in myFriendUserIds computed, and updated LocationGrid/GroupPanel checks to use `.toString()` consistently
- **Files modified:** src/App.vue, src/components/LocationGrid.vue, src/components/GroupPanel.vue
- **Verification:** `npx vue-tsc --noEmit` - TS2551 error gone, no new errors introduced
- **Committed in:** 769c48d, 2c67145

**2. [Rule 3 - Blocking] Moved `const emit = defineEmits` before openMemberContextMenu**
- **Found during:** Task 2 (GroupPanel.vue implementation)
- **Issue:** `openMemberContextMenu` was placed before `const emit = defineEmits` - `const` is not hoisted in JS so emit would be in temporal dead zone when function executes
- **Fix:** Moved `const emit = defineEmits` declaration to before the context menu functions
- **Files modified:** src/components/GroupPanel.vue
- **Committed in:** 2c67145

---

**Total deviations:** 2 auto-fixed (1 bug - wrong method on bigint, 1 blocking - temporal dead zone)
**Impact on plan:** Both fixes essential for correctness. No scope creep.

## Issues Encountered
- Pre-existing TS2749 errors in LocationGrid and GroupPanel (`CharacterRow` used as type vs value from module_bindings classes) - these are not new and match the existing error baseline of 267 errors unchanged

## Next Phase Readiness
- Player right-click UX is now consistent with all other entity types (NPCs, enemies, corpses, resources)
- CharacterActionsPanel.vue file still exists but is unused - can be deleted as cleanup if desired
- All player interaction actions still route through existing App.vue handler functions

---
*Phase: quick-131*
*Completed: 2026-02-17*
