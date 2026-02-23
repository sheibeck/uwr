---
phase: quick-286
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/GroupPanel.vue
  - src/App.vue
autonomous: true
requirements: [QUICK-286]
must_haves:
  truths:
    - "Group members in a different location appear grayed out"
    - "Group members in a different location show their location name under their name"
    - "Group members in the same location do NOT show a location label"
    - "Clicking a grayed-out group member does NOT set them as defensive target"
    - "Context menu on grayed-out member disables Target/Trade actions"
  artifacts:
    - path: "src/components/GroupPanel.vue"
      provides: "Gray-out styling, location label, click prevention for remote members"
  key_links:
    - from: "src/App.vue"
      to: "src/components/GroupPanel.vue"
      via: "locations prop"
      pattern: ":locations="
---

<objective>
Gray out group members who are in a different location than the player, show their location name, and prevent targeting them.

Purpose: Players should have clear visual feedback that remote group members cannot be targeted until they are co-located.
Output: Updated GroupPanel.vue with location-aware member rendering; App.vue passes locations data.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/GroupPanel.vue
@src/composables/useGroups.ts
@src/App.vue (lines 386-420 — GroupPanel usage, lines 1996-1999 — defensiveTarget)
@src/module_bindings/character_type.ts (Character has locationId: u64)
@src/module_bindings/location_type.ts (Location has id, name)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pass locations to GroupPanel and implement location-aware rendering</name>
  <files>src/components/GroupPanel.vue, src/App.vue</files>
  <action>
**In App.vue:**
- Add `:locations="locations"` prop to the GroupPanel component instance (around line 391, alongside existing props like `:group-members`, `:styles`, etc.)
- Add `:my-location-id="selectedCharacter?.locationId ?? null"` prop to GroupPanel

**In GroupPanel.vue:**
1. Add to props interface:
   - `locations: { id: bigint; name: string }[]` — the full location list
   - `myLocationId: bigint | null` — the current player's locationId

2. Add a helper function `isRemote(member)`:
   ```ts
   const isRemote = (member: CharacterRow) => {
     if (!props.myLocationId) return false;
     return member.locationId !== props.myLocationId;
   };
   ```

3. Add a helper function `locationName(member)`:
   ```ts
   const locationName = (member: CharacterRow) => {
     const loc = props.locations.find(l => l.id === member.locationId);
     return loc?.name ?? 'Unknown';
   };
   ```

4. **Gray out remote members** — In the `v-for="member in sortedMembers"` loop, add a conditional style to the `<li>` element. Currently it has:
   ```
   :style="[styles.memberCard, selectedTargetId === member.id ? styles.memberCardTargeted : {}]"
   ```
   Change to:
   ```
   :style="[
     styles.memberCard,
     selectedTargetId === member.id && !isRemote(member) ? styles.memberCardTargeted : {},
     isRemote(member) ? { opacity: '0.45', filter: 'grayscale(0.7)' } : {},
   ]"
   ```

5. **Prevent targeting remote members** — Change the `@click` on the member `<li>`:
   From: `@click="$emit('target', member.id)"`
   To: `@click="!isRemote(member) && $emit('target', member.id)"`
   Also add `cursor: 'default'` to the remote style object (instead of the default pointer from memberCard).

6. **Show location name for remote members** — Add a `<div>` right after the first `<span>` (the name/level/class line, around line 19-21), inside the `<li>`:
   ```html
   <div v-if="isRemote(member)" style="font-size: 11px; color: rgba(180, 180, 200, 0.6); margin-top: 1px;">
     {{ locationName(member) }}
   </div>
   ```

7. **Disable Target/Trade in context menu for remote members** — In `openMemberContextMenu`, when building the `items` array for non-self members, check `isRemote(member)`. If remote, add `disabled: true` to the Target and Trade items:
   ```ts
   const remote = isRemote(member);
   const items = [
     { label: 'Target', disabled: remote, action: () => emit('target', member.id) },
     { label: 'Trade', disabled: remote, action: () => emit('player-trade', member.name) },
     { label: 'Send Message', action: () => emit('player-message', member.name) },
   ];
   ```
   (Send Message stays enabled since you can still whisper to remote group members.)

8. **Clear defensive target if it becomes remote** — This is NOT needed. The server already validates location match (combat.ts line 410-412: "Target is not at your location"). If someone travels away while targeted, the server rejects the ability use. The client visual graying is sufficient UX feedback.

Note: Do NOT skip the player's own row from isRemote — the player's own row will always have `member.locationId === myLocationId` (same location), so it is inherently never remote.
  </action>
  <verify>
Run `npm run build` from `C:/projects/uwr` to confirm no TypeScript errors. Visually inspect GroupPanel.vue to confirm:
- `locations` and `myLocationId` props exist
- `isRemote` and `locationName` helpers exist
- The `<li>` style includes gray-out for remote members
- A location name `<div>` renders for remote members only
- Click handler prevents targeting remote members
- Context menu disables Target/Trade for remote members
  </verify>
  <done>
Group members in a different location appear grayed out with reduced opacity and grayscale. Their location name displays below their name. Clicking them does not set a defensive target. Context menu Target/Trade actions are disabled for remote members. Members in the same location render normally with no location label.
  </done>
</task>

</tasks>

<verification>
- `npm run build` passes with no errors
- GroupPanel renders remote members with opacity 0.45 and grayscale
- Remote members show location name in subtle text below their name
- Same-location members show no location label
- Clicking remote members does not emit target event
- Server-side protection already exists (combat.ts line 410: "Target is not at your location")
</verification>

<success_criteria>
- Group members in different locations are visually grayed out
- Location name appears under remote member names
- Location name does NOT appear for co-located members
- Remote members cannot be click-targeted
- Context menu Target/Trade disabled for remote members
- No TypeScript build errors
</success_criteria>

<output>
After completion, create `.planning/quick/286-group-members-gray-out-when-in-different/286-SUMMARY.md`
</output>
