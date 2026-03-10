---
phase: quick-395
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
  - src/composables/useCommands.ts
  - src/components/NarrativeInput.vue
  - spacetimedb/src/reducers/groups.ts
  - spacetimedb/src/reducers/intent.ts
autonomous: true
requirements: [Q395]
must_haves:
  truths:
    - "All non-admin player commands work without / prefix (who, accept, leave, invite, decline, kick, promote, whisper, friend, endcombat, group)"
    - "Group invite messages show clickable [accept] and [decline] keywords"
    - "Clicking a player name in who list or narrative shows context menu with [invite to group] [whisper] options"
    - "Bare 'group' command shows group status with members, pending invites, and follow toggle"
    - "Item click context menus continue working (already implemented)"
  artifacts:
    - path: "src/App.vue"
      provides: "Expanded command routing and group/who narrative handlers"
    - path: "src/composables/useCommands.ts"
      provides: "Bare group command handler"
    - path: "spacetimedb/src/reducers/groups.ts"
      provides: "Rich invite message with clickable accept/decline"
    - path: "spacetimedb/src/reducers/intent.ts"
      provides: "who command on server-side with clickable player names"
  key_links:
    - from: "src/App.vue"
      to: "src/composables/useCommands.ts"
      via: "onNarrativeSubmit routes bare commands to submitCommand"
      pattern: "clientHandledCommands.*includes"
    - from: "spacetimedb/src/reducers/groups.ts"
      to: "clickNpcKeyword"
      via: "Bracketed [accept] [decline] keywords in invite message"
      pattern: "\\[accept\\].*\\[decline\\]"
---

<objective>
Remove the slash prefix requirement from all non-admin commands, add clickable narrative prompts for group invites and player interactions, and add a bare `group` command that shows group status.

Purpose: Make the game feel more natural by letting players type commands without / prefix, and add helpful clickable menus for social interactions.
Output: Updated command routing, enriched narrative messages with clickable keywords.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.vue
@src/composables/useCommands.ts
@src/composables/useGroups.ts
@src/components/NarrativeInput.vue
@spacetimedb/src/reducers/groups.ts
@spacetimedb/src/reducers/intent.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Route all player commands without slash prefix and add group/who narrative handlers</name>
  <files>src/App.vue, src/composables/useCommands.ts, src/components/NarrativeInput.vue</files>
  <action>
**1. Expand command routing in `onNarrativeSubmit` (App.vue ~line 1278)**

Replace the narrow `infoCommands` check with a comprehensive list of all client-handled commands. The pattern: if the bare lowercase text (or the first word of the text) matches a known client command, route to `submitCommand` instead of the server intent reducer.

```typescript
// Replace:
const infoCommands = ['renown', 'factions', 'faction', 'events'];
if (text.startsWith('/') || infoCommands.includes(text.trim().toLowerCase())) {

// With:
const clientHandledCommands = [
  'who', 'accept', 'decline', 'leave', 'invite', 'kick', 'promote',
  'whisper', 'w', 'friend', 'endcombat', 'end', 'endc', 'group',
  'renown', 'factions', 'faction', 'events',
];
const firstWord = text.trim().toLowerCase().split(/\s/)[0];
if (text.startsWith('/') || clientHandledCommands.includes(firstWord)) {
```

This ensures `who`, `accept`, `leave`, `invite PlayerName`, `kick PlayerName`, `promote PlayerName`, `whisper Name msg`, `friend Name`, `endcombat`, `group`, etc. all route to the useCommands handler without needing `/`.

**2. Add bare `group` command in useCommands.ts**

In `submitCommand()`, add a handler for bare `group` (no arguments) BEFORE the existing `group <msg>` handler (~line 183). When bare `group` is typed, render a rich narrative display:

```typescript
} else if (lower === '/group' || lower === 'group') {
  // Bare group command — show group status
  const char = selectedCharacter.value;
  if (!char) return;

  const groupId = char.groupId;
  if (!groupId) {
    // No group — show pending invites or "not in a group"
    const invites = inviteSummaries?.value ?? [];
    if (invites.length > 0) {
      let msg = '{{color:#fbbf24}}Group Invites:{{/color}}\n';
      for (const inv of invites) {
        msg += `  ${inv.fromName} — [accept ${inv.fromName}] [decline ${inv.fromName}]\n`;
      }
      addLocalEvent?.('look', msg);
    } else {
      addLocalEvent?.('look', 'You are not in a group. Use [invite <name>] to start one.');
    }
  } else {
    // In a group — show members, leader, pending invites, follow toggle
    const members = characters?.value?.filter(c => c.groupId?.toString() === groupId.toString()) ?? [];
    let msg = '{{color:#fbbf24}}Group:{{/color}}\n';
    for (const m of members) {
      const isLeader = m.id === char.id ? '' : ''; // We need leader info
      msg += `  [${m.name}] Lv ${m.level} ${m.className}\n`;
    }
    msg += '\n[leave] — Leave the group';
    // Show pending invites
    const invites = inviteSummaries?.value ?? [];
    if (invites.length > 0) {
      msg += '\n\n{{color:#fbbf24}}Pending Invites:{{/color}}';
      for (const inv of invites) {
        msg += `\n  ${inv.fromName} — [accept ${inv.fromName}] [decline ${inv.fromName}]`;
      }
    }
    addLocalEvent?.('look', msg);
  }
```

To get leader info, the `useCommands` args needs access to groups data. Add to `UseCommandsArgs`:
- `groups?: Ref<any[]>` (to look up leader)

Then in the group display, mark the leader:
```typescript
const group = groups?.value?.find(g => g.id?.toString() === groupId.toString());
const leaderCharId = group?.leaderCharacterId;
// For each member:
const leaderTag = m.id === leaderCharId ? ' {{color:#fbbf24}}(Leader){{/color}}' : '';
msg += `  [${m.name}] Lv ${m.level} ${m.className}${leaderTag}\n`;
```

Pass `groups` from App.vue when constructing useCommands (around line 1230).

**3. Add `who` command with clickable player names**

The existing `who` handler in useCommands.ts (~line 240) renders plain text names. Update it to wrap player names in brackets so they become clickable:

```typescript
// Change from:
`  ${c.name} — Level ${c.level} ${c.className} — ${locName}`
// To:
`  [${c.name}] — Level ${c.level} ${c.className} — ${locName}`
```

**4. Add player name click handler in clickNpcKeyword (App.vue)**

After the existing item/craft/gather handlers and before the final fallthrough (section 14, ~line 1686), add a player name click handler:

```typescript
// 13.5. Player name click — show social context menu
const clickedPlayer = characters.value?.find(
  (c: any) => c.name.toLowerCase() === kwLower && c.id !== selectedCharacter.value?.id
);
if (clickedPlayer) {
  const options: string[] = [];
  // Check if already in same group
  const sameGroup = clickedPlayer.groupId && selectedCharacter.value?.groupId &&
    clickedPlayer.groupId.toString() === selectedCharacter.value.groupId.toString();
  if (!sameGroup) {
    options.push(`[invite ${clickedPlayer.name}]`);
  }
  options.push(`[whisper ${clickedPlayer.name} ]`);
  options.push(`[consider ${clickedPlayer.name}]`);
  addLocalEvent('system', `${clickedPlayer.name}: ${options.join('  ')}`, 'private');
  return;
}
```

**5. Handle `whisper <name> ` click (with trailing space)**

When player clicks `[whisper PlayerName ]`, the clickNpcKeyword handler will receive `whisper PlayerName `. Add handling before section 14:

```typescript
if (kwLower.startsWith('whisper ') || kwLower.startsWith('w ')) {
  // Pre-fill the whisper command in the input — route to command handler
  commandText.value = kw.endsWith(' ') ? kw : `${kw} `;
  // Don't submit yet — let user type message
  // We need to focus the input... but we can just populate commandText
  // Actually, just route through the submit path
  onNarrativeSubmit(kw.trimEnd());
  return;
}
```

Wait — actually whisper needs a message. If the click is `whisper PlayerName ` (no message), we should pre-fill the input. But we don't have direct access to the input ref from App.vue. Instead, do what the existing `sendWhisperTo` function does (line 1706): set `commandText.value = \`/w ${targetName} \``. But `commandText` is inside useCommands.

Simpler approach: when clicking `[whisper PlayerName ]`, just show a hint:
```typescript
if (kwLower.startsWith('whisper ') && kw.trim().split(/\s+/).length === 2) {
  const targetName = kw.trim().split(/\s+/)[1];
  addLocalEvent('system', `Type: whisper ${targetName} <your message>`, 'private');
  return;
}
```

**6. NarrativeInput.vue: No changes needed to suggestions list**

The existing `playerCommands` list already has commands without `/` prefix (line 136-172). The autocomplete/suggestions already work without slash. No changes needed here.

**Summary of routing fix**: The key change is in `onNarrativeSubmit` — expanding the list of commands that get routed to `useCommands` instead of the server intent reducer. The server intent router already handles `who` with the `/who` → `submit_command` path, but the client-side `who` handler in `useCommands` is better because it shows clickable names. By routing bare `who` to `useCommands`, we get the client-side rich rendering.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>All player commands (who, accept, decline, leave, invite, kick, promote, whisper, friend, endcombat, group) work without / prefix. Bare "group" command shows group status with clickable actions. Who list shows clickable player names. Clicking a player name shows social context menu with invite/whisper/consider options.</done>
</task>

<task type="auto">
  <name>Task 2: Enrich server-side group invite message with clickable accept/decline</name>
  <files>spacetimedb/src/reducers/groups.ts</files>
  <action>
In `spacetimedb/src/reducers/groups.ts`, find the invite message at ~line 332:

```typescript
`${inviter.name} invited you to a group.`
```

Replace with a message that includes clickable [accept] and [decline] keywords:

```typescript
`${inviter.name} invited you to a group. Type [accept ${inviter.name}] to join or [decline ${inviter.name}] to refuse.`
```

The brackets make these clickable via the existing `renderLinks` function in NarrativeMessage.vue. When clicked, `clickNpcKeyword` receives `accept InviterName` which routes through `onNarrativeSubmit` -> `useCommands` -> `acceptInviteReducer`.

Also update the server help text in intent.ts (~line 51) to add the group command:

```typescript
'  [group] — View group status, members, and pending invites.',
```

Add it in alphabetical order between `go` and `hail`.

After modifying groups.ts, publish the module locally:
```bash
spacetime publish uwr -p spacetimedb
```

Then regenerate client bindings:
```bash
spacetime generate --lang typescript --out-dir src/module_bindings -p spacetimedb
```

Note: Only publish if the schema changes compile. If no table/column changes, a simple publish without --clear-database should work since this is just reducer logic.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit --pretty 2>&1 | head -20</automated>
  </verify>
  <done>Group invite messages now include clickable [accept Name] and [decline Name] keywords. Help text includes group command. Server module published locally.</done>
</task>

</tasks>

<verification>
1. Type `who` (no slash) — should show online characters with clickable [names]
2. Type `group` (no slash) — should show group status or "not in a group"
3. Type `accept` (no slash) — should work for accepting group invites
4. Type `leave` (no slash) — should work for leaving groups
5. Type `invite PlayerName` (no slash) — should send group invite
6. Click a player [name] from who list — should show social context menu with [invite], [whisper], [consider]
7. When receiving a group invite, message should show clickable [accept Name] and [decline Name]
8. Admin commands like `/level`, `/spawncorpse` etc. should still require `/` prefix
9. Item click menus in backpack/inventory should continue working as before
</verification>

<success_criteria>
- All non-admin player commands work without / prefix
- Group invites display with clickable accept/decline prompts
- Player names in who list are clickable and show social context menu
- Bare group command shows group status with actionable options
- No TypeScript compilation errors
- Server module publishes successfully
</success_criteria>

<output>
After completion, create `.planning/quick/395-remove-slash-prefix-from-non-admin-comma/395-SUMMARY.md`
</output>
