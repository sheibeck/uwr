---
phase: quick-386
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/GroupMemberBar.vue
  - src/components/NarrativeConsole.vue
  - src/App.vue
autonomous: true
requirements: [GROUP-UI-01]
must_haves:
  truths:
    - "Player sees their own character HP/mana/stamina bars at the top of the screen at all times"
    - "When in a group, all group members appear as compact cards in a horizontal strip below the NarrativeHud"
    - "Each group member card shows HP bar, mana bar (if any), stamina bar, and active buffs/debuffs"
    - "Clicking a group member card sets them as defensive target (highlighted)"
    - "If no one is targeted or target is cleared, player defaults to targeting themselves"
    - "Buffs show as green badges, debuffs show as red badges, with duration countdown"
  artifacts:
    - path: "src/components/GroupMemberBar.vue"
      provides: "Horizontal group member strip with bars and effects"
      min_lines: 80
  key_links:
    - from: "src/components/GroupMemberBar.vue"
      to: "src/App.vue"
      via: "props for character, group members, effects, defensiveTargetId"
      pattern: "GroupMemberBar"
    - from: "src/components/GroupMemberBar.vue"
      to: "src/ui/effectTimers.ts"
      via: "effectLabel, effectIsNegative, effectRemainingSeconds"
      pattern: "import.*effectTimers"
---

<objective>
Create a persistent group member UI bar at the top of the game screen showing the player's own character info (HP/mana/stamina) and all group members with their stats, buffs/debuffs, and click-to-target defensive targeting.

Purpose: Players need at-a-glance visibility of their own and group members' health/status without opening the Group floating panel. This enables tactical play (healing group members, monitoring buffs) and replaces the need to manually open panels during combat.

Output: A new GroupMemberBar.vue component rendered below NarrativeHud, wired into App.vue with existing data sources.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/NarrativeHud.vue (current top bar — 44px fixed, z-index 10000)
@src/components/GroupPanel.vue (existing group panel with targeting, effects, bars — reference for data shape)
@src/App.vue (wiring: defensiveTargetId ref, relevantEffects, groupCharacterMembers, currentGroup, nowMicros)
@src/ui/effectTimers.ts (effectLabel, effectIsNegative, effectRemainingSeconds, formatEffectDuration)
@src/composables/useGroups.ts (leaderId, pullerId, isLeader computed)

<interfaces>
<!-- Key data shapes the executor needs (from GroupPanel.vue props and App.vue) -->

From App.vue (already computed, available to pass as props):
- selectedCharacter: Character | null — the player's own character
- currentGroup: Group | null — null if solo
- groupCharacterMembers: Character[] — all characters in the group (including self)
- relevantEffects: CharacterEffect[] — effects for all group members + self
- defensiveTargetId: ref<bigint | null> — client-side targeting state
- nowMicros: ref<number> — current time in microseconds for effect countdowns
- leaderId: computed<bigint | null> — group leader character ID

From module_bindings/types (Character shape):
- id: bigint, name: string, level: bigint, className: string
- hp: bigint, maxHp: bigint, mana: bigint, maxMana: bigint
- stamina: bigint, maxStamina: bigint, groupId: bigint | null

From CharacterEffect table:
- id: bigint, characterId: bigint, effectType: string
- magnitude: bigint (i64), roundsRemaining: bigint, sourceAbility?: string

From effectTimers.ts:
- effectLabel(effect): string — display name
- effectIsNegative(effect): boolean — true for debuffs
- effectRemainingSeconds(effect, nowMicros, timerStore): number
- formatEffectDuration(seconds): string
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create GroupMemberBar component</name>
  <files>src/components/GroupMemberBar.vue</files>
  <action>
Create a new Vue 3 component `GroupMemberBar.vue` that renders a horizontal strip of character cards.

**Layout:**
- Fixed position bar below NarrativeHud (top: 44px, since NarrativeHud is 44px tall)
- Full width, background matching NarrativeHud (#12121a with bottom border #2a2a3a)
- Height: auto, but compact (around 50-60px depending on content)
- z-index: 9999 (just below NarrativeHud's 10000)
- Horizontal flex layout with gap between member cards, overflow-x: auto for many members

**Self card (always shown):**
- Left-most card, slightly different styling to indicate "you" (subtle gold/amber left border)
- Shows: Name + Level, HP bar (red), Mana bar (blue, only if maxMana > 0), Stamina bar (orange)
- Bars should be thin (10px height), with current/max text overlay in tiny font
- Active effects shown as small colored badges below bars

**Group member cards (shown when in a group):**
- Same layout as self card but with a neutral border
- Clicking a card emits 'target' event with characterId
- Currently targeted card gets a highlight (glowing border or background tint, use a subtle cyan/teal glow like `box-shadow: 0 0 6px rgba(0,200,200,0.5)`)
- Leader gets a small star indicator before name

**Effects/buffs display:**
- Use effectLabel() for display name, effectIsNegative() for color coding
- Buffs: green text/badge (#51cf66), Debuffs: red text/badge (#ff6b6b)
- Show duration using effectRemainingSeconds + formatEffectDuration
- Keep a local Map<string, EffectTimerEntry> for timer tracking (same pattern as GroupPanel.vue)
- Compact: just show abbreviated effect name + duration, font-size 0.55rem

**Props (matching what App.vue already has):**
```typescript
defineProps<{
  character: Character | null;
  groupMembers: Character[];  // includes self when in group
  characterEffects: any[];    // same shape as GroupPanel receives
  defensiveTargetId: bigint | null;
  nowMicros: number;
  leaderId: bigint | null;
}>();
```

**Emits:**
```typescript
defineEmits<{
  (e: 'target', characterId: bigint): void;
}>();
```

**Bar style:** Reuse the same bar pattern from NarrativeHud (position relative container, absolute fill div, absolute centered label). Use bars that are 100px wide and 10px tall for compactness.

**When solo (no group):** Show only the self card. When in a group, show self first then other members sorted alphabetically.

Import effectLabel, effectIsNegative, effectRemainingSeconds, formatEffectDuration from '../ui/effectTimers'.
  </action>
  <verify>
    <automated>npx vue-tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>GroupMemberBar.vue exists, renders character cards with HP/mana/stamina bars, effect badges, and click-to-target emit. Type-checks clean.</done>
</task>

<task type="auto">
  <name>Task 2: Wire GroupMemberBar into NarrativeConsole and App.vue</name>
  <files>src/components/NarrativeConsole.vue, src/App.vue</files>
  <action>
**NarrativeConsole.vue changes:**
1. Import GroupMemberBar from './GroupMemberBar.vue'
2. Add new props to NarrativeConsole that it will pass through:
   - groupMembers: Character[] (default [])
   - characterEffects: any[] (default [])
   - defensiveTargetId: bigint | null (default null)
   - nowMicros: number (default 0)
   - leaderId: bigint | null (default null)
3. Add emit: (e: 'target', characterId: bigint): void
4. Render GroupMemberBar right after NarrativeHud (inside the v-if="selectedCharacter" block), passing all props through and forwarding the target emit
5. Adjust the message scroll area's top padding to account for the GroupMemberBar height. Currently NarrativeConsole has a scroll container — add extra top padding (about 60px more) so messages don't hide behind the new bar. The bar is position:fixed so it overlays; the scroll content needs padding-top to compensate. Check the existing paddingTop on the message area and increase it.

**App.vue changes:**
1. Pass new props to the game-world NarrativeConsole instance (line ~59-80 area):
   - :group-members="groupCharacterMembers"
   - :character-effects="relevantEffects"
   - :defensive-target-id="defensiveTargetId"
   - :now-micros="nowMicros"
   - :leader-id="leaderId"
2. Add @target="setDefensiveTarget" on NarrativeConsole to handle the forwarded target event
3. Do NOT add these props to the character-creation NarrativeConsole instance (it has selectedCharacter=null so GroupMemberBar won't render anyway, but keep it clean)

**Padding calculation:**
- NarrativeHud is 44px tall (fixed at top:0)
- GroupMemberBar will be ~55px tall (fixed at top:44px)
- Total top overlay: ~99px
- Find where the message list has its paddingTop set and ensure it accounts for the group bar. Look for the scroll container style in NarrativeConsole — it likely has paddingTop already for NarrativeHud. Increase by ~55px.
  </action>
  <verify>
    <automated>npx vue-tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>GroupMemberBar renders below NarrativeHud showing player character info. When in a group, all members visible with bars and effects. Clicking a member sets defensive target (highlighted). Messages scroll area properly padded so no content hidden behind bars.</done>
</task>

</tasks>

<verification>
1. `npx vue-tsc --noEmit` passes with no errors
2. Visual check: GroupMemberBar visible at top of screen below the existing HUD bar
3. Solo: shows only self with HP/mana/stamina bars
4. In group: shows all members, click to target highlights card
5. Effects display as colored badges with countdown timers
</verification>

<success_criteria>
- Player always sees their own HP/mana/stamina at the top of the screen
- Group members shown in horizontal strip when in a group
- Buffs/debuffs visible on self and group members with color coding and duration
- Click-to-target sets defensive target with visual highlight
- Default target is self when nothing selected
- No content hidden behind the bars (proper padding)
</success_criteria>

<output>
After completion, create `.planning/quick/386-add-group-member-ui-with-buffs-debuffs-d/386-SUMMARY.md`
</output>
