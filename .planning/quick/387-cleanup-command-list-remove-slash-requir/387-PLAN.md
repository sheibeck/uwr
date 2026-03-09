---
phase: quick-387
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/NarrativeInput.vue
  - src/components/HelpOverlay.vue
  - spacetimedb/src/reducers/intent.ts
autonomous: true
requirements: [QUICK-387]
must_haves:
  truths:
    - "Command suggestion popup only shows regular player commands, not admin/debug commands"
    - "Admin slash commands still work when typed but are hidden from autocomplete"
    - "Commands work without slash prefix (already true, ensure no regressions)"
    - "Help overlay text does not mention slash prefix requirement"
    - "Typing 'camp' in-game logs the character out after 10 seconds"
  artifacts:
    - path: "src/components/NarrativeInput.vue"
      provides: "Filtered command suggestion list without admin commands"
    - path: "src/components/HelpOverlay.vue"
      provides: "Updated help text without slash references"
    - path: "spacetimedb/src/reducers/intent.ts"
      provides: "Camp command that schedules character logout after 10s"
  key_links:
    - from: "spacetimedb/src/reducers/intent.ts"
      to: "character_logout_tick scheduled table"
      via: "camp command inserts scheduled logout row"
      pattern: "character_logout_tick\\.insert"
---

<objective>
Clean up the command system: remove admin/debug commands from the autocomplete popup (they still work when typed), update help overlay to not mention slash prefixes, and make the `camp` command actually log the character out after 10 seconds via the existing scheduled logout mechanism.

Purpose: Better new player experience -- hide debug tools, simplify help text, make camp meaningful.
Output: Cleaner command UI, functional camp logout.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/NarrativeInput.vue
@src/components/HelpOverlay.vue
@spacetimedb/src/reducers/intent.ts
@spacetimedb/src/helpers/character.ts (campCharacter function)
@spacetimedb/src/reducers/characters.ts (character_logout_tick usage)
@src/composables/useCommands.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Clean command popup and help overlay</name>
  <files>src/components/NarrativeInput.vue, src/components/HelpOverlay.vue</files>
  <action>
In NarrativeInput.vue:

1. Rename `adminCommands` to `playerCommands` and remove all admin/debug commands from it. Keep ONLY these regular player commands (no slash prefix):
   - `look` - Describe current location
   - `consider` - Assess a target's threat level
   - `attack` - Engage enemies
   - `flee` - Escape combat
   - `hail` - Greet an NPC
   - `say` - Talk nearby
   - `w` - Whisper to a character
   - `whisper` - Whisper to a character
   - `group` - Message your group
   - `invite` - Invite to group
   - `accept` - Accept group invite
   - `decline` - Decline group invite
   - `kick` - Kick group member
   - `promote` - Promote group leader
   - `leave` - Leave current group
   - `who` - List online characters
   - `friend` - Send friend request
   - `camp` - Log out your character
   - `endcombat` - Force end combat
   - `time` - Check day/night cycle
   - `stats` - View character stats
   - `abilities` - View your abilities
   - `character` - View race and class info
   - `inventory` - View equipped gear
   - `backpack` - View unequipped items
   - `quests` - View active quests
   - `travel` - List destinations
   - `bind` - Bind to location
   - `loot` - Check for loot
   - `bank` - Access bank vault
   - `shop` - Browse vendor wares
   - `craft` - View recipes

   REMOVE these admin commands from the list entirely (they still work when typed, just hidden from autocomplete):
   - `/level`, `/grantrenown`, `/spawncorpse`, `/createitem`, `/createscroll`, `/synccontent`, `/resetwindows`, `/endevent`, `/setappversion`, `/recomputeracial`

2. Update the comment from "Slash command suggestions (admin only)" to "Command suggestions"

3. Update `filteredCommands` to reference the renamed `playerCommands` array.

In HelpOverlay.vue:

4. In the "Useful Tips" section, change the line "Type commands in the command bar at the bottom (start with / for slash commands)." to "Type commands in the command bar at the bottom. Start typing to see available commands."

5. In the "Communicating" section, update the text "Start typing a command name to see available commands. Commands like look, hail, say, who, etc. work without a slash prefix." to just "Start typing a command name to see available commands."
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit --pretty 2>&1 | head -20</automated>
  </verify>
  <done>Command popup shows only player commands without slash prefixes. Admin commands hidden from autocomplete. Help overlay does not mention slash prefix.</done>
</task>

<task type="auto">
  <name>Task 2: Camp command schedules logout after 10 seconds</name>
  <files>spacetimedb/src/reducers/intent.ts</files>
  <action>
In intent.ts, find the camp/rest handler (around line 1046). Currently it just shows a message. Update it to:

1. Keep the combat check (cannot camp in combat).
2. Show the existing narrative message: "You make camp and rest briefly. The world continues without you."
3. After the message, schedule a character logout in 10 seconds using the existing `CharacterLogoutTick` table and `ScheduleAt` pattern (same as used in characters.ts for character switching):

```typescript
if (lower === 'camp' || lower === 'rest') {
  if (activeCombatIdForCharacter(ctx, character.id)) {
    return fail(ctx, character, 'You cannot rest while in combat.');
  }
  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
    'You make camp and rest briefly. The world continues without you.');

  // Schedule logout after 10 seconds
  const CAMP_LOGOUT_DELAY = 10_000_000n; // 10 seconds in microseconds
  const logoutAtMicros = ctx.timestamp.microsSinceUnixEpoch + CAMP_LOGOUT_DELAY;
  ctx.db.character_logout_tick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(logoutAtMicros),
    characterId: character.id,
    ownerUserId: character.ownerUserId,
    logoutAtMicros,
  });
  return;
}
```

Verify that `ScheduleAt` and `CharacterLogoutTick` (or the `character_logout_tick` table) are available in the intent.ts deps/imports. Check how other reducers in intent.ts access these. They should be available via the `deps` object passed to `registerIntentReducers`. If not already in the deps destructuring, add `ScheduleAt` and `CharacterLogoutTick` (or access `ctx.db.character_logout_tick` directly since table access is via ctx.db).

Note: `ScheduleAt` needs to be imported. Check the existing imports in intent.ts -- it's likely available from `spacetimedb` package. If it's passed via deps, use that. The `ctx.db.character_logout_tick` table is accessible directly from ctx.db.

Also update the help text for camp in the help command output (around line 192) from:
  `'  camp — Rest briefly.'`
to:
  `'  camp — Make camp and log out after 10 seconds.'`
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc -p spacetimedb/tsconfig.json --noEmit --pretty 2>&1 | head -20</automated>
  </verify>
  <done>Typing "camp" in-game shows the rest message and schedules a character_logout_tick 10 seconds later. Help text reflects the new behavior.</done>
</task>

</tasks>

<verification>
- Command popup shows only player commands (no `/level`, `/grantrenown`, etc.)
- Typing `/level 5` still works for admins (useCommands.ts unchanged)
- Help overlay does not mention slash prefix
- `camp` command schedules logout via character_logout_tick table
- TypeScript compiles without errors for both client and server
</verification>

<success_criteria>
- Admin/debug commands hidden from autocomplete popup
- All player commands shown without slash prefix in popup
- Help overlay updated to remove slash references
- Camp command triggers 10-second delayed logout via scheduled table
- No TypeScript compilation errors
</success_criteria>

<output>
After completion, create `.planning/quick/387-cleanup-command-list-remove-slash-requir/387-SUMMARY.md`
</output>
