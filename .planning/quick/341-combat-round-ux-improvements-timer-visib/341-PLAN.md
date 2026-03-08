---
quick: 341
type: execute
files_modified:
  - src/components/CombatHud.vue
  - src/components/NarrativeConsole.vue
  - src/composables/useCombat.ts
  - src/App.vue
autonomous: true
---

<objective>
Replace the broken static-text injection of combat prompts and HP bars with a live reactive CombatHud component rendered inside NarrativeConsole. This fixes three problems: the timer always showing "0s remaining" (frozen snapshot), HP bars never appearing between rounds (resolved round never current), and unclear action flow (actions mixed into narrative log).

Purpose: Combat is the core gameplay loop and currently unplayable due to these UX bugs.
Output: A CombatHud.vue component that renders live during combat, plus cleanup of the broken watcher injection system.
</objective>

<context>
@src/composables/useCombat.ts
@src/components/NarrativeConsole.vue
@src/components/NarrativeMessage.vue
@src/App.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create CombatHud component and wire into NarrativeConsole</name>
  <files>src/components/CombatHud.vue, src/components/NarrativeConsole.vue</files>
  <action>
Create `src/components/CombatHud.vue` — a live reactive panel that renders above the narrative input area (bottom of scroll, or pinned above input) during active combat. This replaces the broken static event injection.

The component receives these props:
- `roundState: string | null` — current round state ('action_select', 'resolving', 'resolved', null)
- `roundNumber: number` — current round number
- `roundTimeRemaining: number` — live countdown seconds (reactive ref from RAF loop)
- `hasSubmittedAction: boolean` — whether player already submitted
- `actionPromptData: { abilities: Array<{name: string, onCooldown: boolean, cooldownSecs: number, manaCost: string}>, enemies: Array<{name: string, level: bigint}> } | null` — structured data for action choices (NOT the pre-built string)
- `combatEnemiesList: Array<{name: string, level: bigint, hp: bigint, maxHp: bigint, conClass: string}>` — live enemy HP data
- `combatRoster: Array<{name: string, hp: bigint, maxHp: bigint, isYou: boolean}>` — live player HP data

Layout (render as a pinned panel between scroll area and input, NOT injected into the event stream):
1. **HP Bars section** (always visible during combat): Show enemy HP bars (colored by health percentage: green >50%, yellow >25%, red <=25%) and player HP bars below a divider. Use unicode block chars or CSS width bars. Monospace font, gray (#adb5bd) text, colored bars.
2. **Action prompt section** (visible only during `action_select` when `!hasSubmittedAction`): Show "Round N — Choose your action (Xs remaining)" with live timer. List abilities as clickable [brackets] (blue #60a5fa, underline). Abilities on cooldown shown as strikethrough with seconds. Show [Auto-attack] and [Flee] options. Show target list below. Use `window.clickNpcKeyword(name)` for click handling (same pattern as NarrativeMessage).
3. **Waiting state** (visible during `action_select` when `hasSubmittedAction`): Show "Action submitted. Waiting for round to resolve..." in gray italic.
4. **Resolving state** (visible during `resolving`): Show "Round resolving..." in yellow italic pulse animation.

Style: Dark background (rgba(10, 10, 18, 0.95)), border-top 1px solid #333, padding 12px 16px, max-height 40vh with overflow-y auto.

Update `NarrativeConsole.vue`:
- Add new props: `combatHudProps: { roundState, roundNumber, roundTimeRemaining, hasSubmittedAction, actionPromptData, combatEnemiesList, combatRoster } | null`
- Import and render `<CombatHud v-if="combatHudProps" v-bind="combatHudProps" />` between the scroll area div and the NarrativeInput component.
- Adjust scrollAreaStyle paddingBottom to account for CombatHud height when combat is active (increase from 90px to dynamic based on whether combatHudProps is non-null).
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>CombatHud renders live HP bars and action prompts reactively during combat. Timer counts down in real time. HP bars update as damage occurs. Action list shows clickable abilities.</done>
</task>

<task type="auto">
  <name>Task 2: Wire CombatHud props from App.vue and remove broken watchers</name>
  <files>src/App.vue, src/composables/useCombat.ts</files>
  <action>
In `useCombat.ts`:
- Add a new computed `actionPromptData` that returns structured data (not a string) when `roundState === 'action_select' && !hasSubmittedAction`. Return object with:
  - `abilities`: array of `{name, onCooldown, cooldownSecs, manaCost}` from abilityTemplates filtered by charId
  - `enemies`: array of `{name, level}` from living combatEnemies with template lookup
- Keep `actionPromptMessage` and `roundSummaryMessage` for now (backward compat) but they are no longer injected.
- Export `actionPromptData` from the composable return.

In `App.vue`:
- Remove the three watchers at lines 1026-1052 (the `watch(actionPromptMessage, ...)`, `watch(roundSummaryMessage, ...)`, and `watch(activeCombat, ...)` that manage `lastPromptRound`/`lastSummaryRound`). Also remove the `lastPromptRound` and `lastSummaryRound` variables.
- Destructure `actionPromptData` from `useCombat()`.
- Create a computed `combatHudProps` that returns null when not in combat, or returns the structured props object when `activeCombat` is truthy:
  ```
  {
    roundState: roundState.value,
    roundNumber: Number(currentRound.value?.roundNumber ?? 0),
    roundTimeRemaining: roundTimeRemaining.value,
    hasSubmittedAction: hasSubmittedAction.value,
    actionPromptData: actionPromptData.value,
    combatEnemiesList: combatEnemiesList.value (already has name, level, hp, maxHp, conClass),
    combatRoster: combatRoster.value (already has name, hp, maxHp, isYou),
  }
  ```
- Pass `:combat-hud-props="combatHudProps"` to the game-world NarrativeConsole (line 59, NOT the creation one at line 34).
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>Combat HUD shows live timer counting down each second. HP bars update reactively when damage is dealt. Action prompt appears only during action_select and disappears after submission. No more frozen "0s remaining" text. No more missing HP bars between rounds.</done>
</task>

</tasks>

<verification>
1. `npx vue-tsc --noEmit` passes with no type errors
2. Start combat in-game: CombatHud appears with enemy and player HP bars
3. During action_select: timer counts down live (not frozen at 0), abilities are clickable
4. After submitting action: prompt replaced with "waiting" message
5. After round resolves: HP bars update to reflect damage dealt
6. When combat ends: CombatHud disappears entirely
</verification>

<success_criteria>
- Timer displays live countdown during action_select (updates every frame via RAF)
- HP bars visible throughout entire combat (not just on round resolve)
- Clear visual separation between action choices and narrative history
- Action prompt disappears after submission, shows waiting state
- No regression: combat narration events (gold italic) still render in narrative stream
</success_criteria>
