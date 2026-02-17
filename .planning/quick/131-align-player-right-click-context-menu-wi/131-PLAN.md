---
phase: quick-131
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/LocationGrid.vue
  - src/components/GroupPanel.vue
  - src/App.vue
autonomous: true

must_haves:
  truths:
    - "Right-clicking a player in the Location panel shows an inline context menu with all player actions (Trade, Invite/Kick/Promote, Friend Request, Message, Target)"
    - "Right-clicking a group member in the Group panel shows the same inline context menu"
    - "No separate CharacterActions floating panel opens for player interactions"
    - "Context menu items are conditionally shown based on friend/group/leader status, matching CharacterActionsPanel logic"
  artifacts:
    - path: "src/components/LocationGrid.vue"
      provides: "Inline player context menu with all actions"
      contains: "openCharacterContextMenu"
    - path: "src/components/GroupPanel.vue"
      provides: "Inline context menu for group members"
      contains: "ContextMenu"
    - path: "src/App.vue"
      provides: "Props/handlers wired to LocationGrid and GroupPanel for player actions"
  key_links:
    - from: "src/components/LocationGrid.vue"
      to: "src/App.vue"
      via: "emit events for invite, kick, trade, friend, message, promote"
      pattern: "emit\\('(invite|kick|trade|friend|message|promote)"
---

<objective>
Replace the player right-click "Actions" context menu entry (which opens a separate CharacterActionsPanel window) with an inline context menu listing all available player actions directly, matching the pattern used by NPCs, enemies, resources, and corpses.

Purpose: Consistent UX -- all right-click context menus show inline options, no special case for players.
Output: Modified LocationGrid.vue, GroupPanel.vue, and App.vue with inline player action context menus.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/LocationGrid.vue
@src/components/GroupPanel.vue
@src/components/CharacterActionsPanel.vue
@src/components/ContextMenu.vue
@src/App.vue (lines 218-223 CharacterActions panel, 276-326 LocationGrid usage, 340-370 GroupPanel usage, 1276-1293 openCharacterActions/inviteToGroup/sendFriendRequest/sendWhisperTo, 1628-1651 actionTarget computeds, 1762-1764 setDefensiveTarget)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Expand LocationGrid player context menu with all inline actions</name>
  <files>src/components/LocationGrid.vue, src/App.vue</files>
  <action>
**LocationGrid.vue changes:**

1. Add new props for player action context:
   - `myFriendUserIds: string[]` -- array of ownerUserId hex strings that are friends
   - `groupMemberIds: string[]` -- array of character ID strings currently in user's group
   - `isLeader: boolean` -- whether selected character is group leader
   - `leaderId: bigint | null` -- current group leader ID

2. Add new emits to replace the single `character-action` emit:
   - `(e: 'player-invite', targetName: string): void`
   - `(e: 'player-kick', targetName: string): void`
   - `(e: 'player-friend', targetName: string): void`
   - `(e: 'player-promote', targetName: string): void`
   - `(e: 'player-trade', targetName: string): void`
   - `(e: 'player-message', targetName: string): void`
   Keep the existing `select-character` emit for Target action.

3. Rewrite `openCharacterContextMenu` to build the full action list inline (matching CharacterActionsPanel.vue logic):
   - Determine `isFriend` by checking `props.myFriendUserIds.includes(character.ownerUserId.toHexString())`
   - Determine `isInGroup` by checking `props.groupMemberIds.includes(character.id.toString())`
   - Determine `isTargetLeader` by checking `character.id.toString() === props.leaderId?.toString()`
   - Always show: "Target" (emits select-character with character.id), "Trade" (emits player-trade with character.name), "Send Message" (emits player-message with character.name)
   - Show "Invite to Group" only if `!isInGroup` (emits player-invite)
   - Show "Friend Request" only if `!isFriend` (emits player-friend)
   - Show "Promote to Leader" only if `props.isLeader && isInGroup && !isTargetLeader` (emits player-promote)
   - Show "Kick" only if `props.isLeader && isInGroup && !isTargetLeader` (emits player-kick)

4. Remove the `character-action` emit declaration (no longer needed from LocationGrid).

**App.vue changes:**

1. Add new props to LocationGrid usage (around line 296-326):
   - `:my-friend-user-ids="myFriendUserIds"` -- computed: `friends.value.map(f => f.friendUserId.toHexString())`
   - `:group-member-ids="groupMemberIdStrings"` -- computed: `groupCharacterMembers.value.map(m => m.id.toString())`
   - `:is-leader="isLeader"`
   - `:leader-id="leaderId"`

2. Add the two new computeds `myFriendUserIds` and `groupMemberIdStrings` near the existing friend/group code (around line 1628).

3. Replace `@character-action="openCharacterActions"` on LocationGrid with the 6 new event handlers:
   - `@player-invite="inviteToGroup"`
   - `@player-kick="kickMember"`
   - `@player-friend="sendFriendRequest"`
   - `@player-promote="promoteLeader"`
   - `@player-trade="startTrade"`
   - `@player-message="sendWhisperTo"`

4. Remove the CharacterActionsPanel floating panel div (lines 218-223), the `openCharacterActions` function (line 1276-1279), the `actionTargetCharacterId` ref and the 4 related computeds (`actionTargetCharacter`, `actionTargetIsFriend`, `actionTargetInGroup`, `actionTargetIsLeader` at lines 1628-1651), and the CharacterActionsPanel import. Also remove `characterActions` from the panel defaults object (line 1881).

5. Keep the `characterActions` panel position entry for now if removing it causes issues with the panel manager -- if it does, just leave the entry but never open the panel. Prefer clean removal.
  </action>
  <verify>
    Run `npx vue-tsc --noEmit 2>&1 | head -30` to check for TypeScript errors. Right-clicking a player name in the Location panel should show a context menu with Trade, Invite to Group, Friend Request, Send Message, Target options (and conditionally Promote/Kick).
  </verify>
  <done>
    Right-clicking a player in LocationGrid shows an inline context menu with all available player actions. No CharacterActions floating panel opens. All actions (trade, invite, friend, message, kick, promote) work from the inline menu.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add inline context menu to GroupPanel for group member right-click</name>
  <files>src/components/GroupPanel.vue, src/App.vue</files>
  <action>
**GroupPanel.vue changes:**

1. Import ContextMenu component: `import ContextMenu from './ContextMenu.vue';`

2. Add contextMenu reactive ref (same pattern as LocationGrid):
   ```
   const contextMenu = ref<{ visible: boolean; x: number; y: number; title: string; subtitle: string; items: Array<{ label: string; disabled?: boolean; action: () => void }> }>({ visible: false, x: 0, y: 0, title: '', subtitle: '', items: [] });
   ```

3. Add `closeContextMenu` function.

4. Add new props:
   - `myFriendUserIds: string[]`
   - `myCharacterId: bigint | null` -- to exclude self from right-click actions

5. Replace `@contextmenu.prevent="$emit('character-action', member.id)"` with `@contextmenu.prevent="openMemberContextMenu($event, member)"`.

6. Create `openMemberContextMenu(event: MouseEvent, member: CharacterRow)` that builds the inline menu:
   - Skip if `member.id.toString() === props.myCharacterId?.toString()` (no self-actions) -- show a simple "You" disabled item
   - Otherwise show same items as LocationGrid context menu: Target, Trade, Send Message, Friend Request (if not friend), Promote (if leader and not target leader), Kick (if leader and not target leader)
   - Use emit events matching the new names from LocationGrid (player-invite, player-kick, etc.) -- OR keep existing emit names since GroupPanel already has `character-action`. Actually, replace the `character-action` emit with the same set of granular emits used in LocationGrid for consistency.

7. Add new emits: `player-trade`, `player-friend`, `player-promote`, `player-kick`, `player-message`. Keep existing `target` emit for targeting.

8. Remove the `character-action` emit.

9. Add `<ContextMenu ... />` to the template (inside the root div, at the bottom).

**App.vue changes:**

1. Pass new props to GroupPanel (around line 340-370):
   - `:my-friend-user-ids="myFriendUserIds"` (reuse same computed from Task 1)
   - `:my-character-id="selectedCharacter?.id ?? null"`

2. Replace `@character-action="openCharacterActions"` on GroupPanel with the new event handlers:
   - `@player-trade="startTrade"`
   - `@player-friend="sendFriendRequest"`
   - `@player-promote="promoteLeader"`
   - `@player-kick="kickMember"`
   - `@player-message="sendWhisperTo"`
   - `@target` stays as `@target="setDefensiveTarget"`

3. Remove the CharacterActionsPanel component import from App.vue if not already removed in Task 1.
  </action>
  <verify>
    Run `npx vue-tsc --noEmit 2>&1 | head -30` to check for TypeScript errors. Right-clicking a group member in GroupPanel should show an inline context menu. Right-clicking yourself should show a disabled "You" item or nothing actionable.
  </verify>
  <done>
    Right-clicking a group member in GroupPanel shows an inline context menu with Trade, Friend Request, Message, Promote, Kick options (conditionally). No CharacterActions panel opens from either LocationGrid or GroupPanel. CharacterActionsPanel.vue is no longer used (can be deleted as cleanup but not required).
  </done>
</task>

</tasks>

<verification>
1. `npx vue-tsc --noEmit` passes with no errors
2. Right-clicking a player in LocationGrid shows inline context menu with all options
3. Right-clicking a group member in GroupPanel shows inline context menu with appropriate options
4. No CharacterActions floating panel appears anywhere in the UI
5. All actions (trade, invite, kick, promote, friend, message, target) work correctly from the inline menus
</verification>

<success_criteria>
- Player right-click context menu in LocationGrid shows inline options matching the NPC/enemy/corpse pattern
- Group member right-click context menu in GroupPanel shows inline options
- CharacterActionsPanel floating panel is removed from the UI
- All player interaction actions still function correctly
</success_criteria>

<output>
After completion, create `.planning/quick/131-align-player-right-click-context-menu-wi/131-SUMMARY.md`
</output>
