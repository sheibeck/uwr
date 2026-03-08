---
phase: quick-342
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
  - src/components/NarrativeConsole.vue
  - src/composables/useCombat.ts
  - src/components/CombatHud.vue
autonomous: true
requirements: [INLINE-COMBAT-UI]
must_haves:
  truths:
    - "HP bars for enemies and players appear inline as narrative messages after round resolution"
    - "Enemy names in status bars are clickable for targeting"
    - "Action prompt with clickable abilities appears inline during action_select phase"
    - "CombatHud floating panel no longer renders"
    - "Mana bars shown for characters with mana > 0"
  artifacts:
    - path: "src/composables/useCombat.ts"
      provides: "Enhanced roundSummaryMessage with clickable enemy names and mana bars"
    - path: "src/App.vue"
      provides: "Watchers that inject combat_status and combat_prompt local events; combatHudProps removed"
    - path: "src/components/NarrativeConsole.vue"
      provides: "CombatHud removed from template and imports"
  key_links:
    - from: "src/App.vue"
      to: "useEvents.addLocalEvent"
      via: "watch on roundState/actionPromptMessage"
      pattern: "addLocalEvent.*combat_status"
---

<objective>
Replace the floating CombatHud component with inline narrative messages. Combat HP bars and action prompts become part of the narrative stream using addLocalEvent with combat_status and combat_prompt event kinds.

Purpose: All combat UI lives in the narrative flow -- no floating panels, unified experience.
Output: Inline combat status bars with clickable targeting, inline action prompts, CombatHud deleted.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/useCombat.ts
@src/App.vue
@src/components/NarrativeConsole.vue
@src/components/NarrativeMessage.vue
@src/composables/useEvents.ts

<interfaces>
From src/composables/useEvents.ts:
```typescript
const addLocalEvent = (kind: string, message: string, scope: string = 'client') => { ... };
// kind values: 'combat_status', 'combat_prompt', 'combat_narration', 'system', 'command', etc.
```

From src/components/NarrativeMessage.vue (already supports these kinds):
```typescript
combat_prompt: '#e9ecef',      // white for action selection prompts
combat_status: '#adb5bd',      // gray for round summary with HP bars
// combat_status renders with monospace font (isCombatStatus computed)
```

Clickable bracket syntax in NarrativeMessage.renderLinks():
```
[text]                              -> clickable blue span (triggers window.clickNpcKeyword)
{{color:#HEX}}[text]{{/color}}     -> clickable colored span
{{color:#HEX}}text{{/color}}       -> colored non-clickable span
```

From src/composables/useCombat.ts:
```typescript
roundSummaryMessage: Computed<string | null>  // built after round resolves
actionPromptMessage: Computed<string | null>   // built during action_select
roundState: Computed<'action_select' | 'resolving' | 'resolved' | null>
hasSubmittedAction: Computed<boolean>
setCombatTarget(enemyId: bigint | null): void
```

From src/App.vue keyword handler (lines 1468-1498):
- `[Auto-attack]` -> submitAutoAttack(firstLivingEnemy)
- `[Flee]` -> submitFlee()
- Ability name bracket click -> submitAbility(abilityId, firstLivingEnemy)
- Enemy name bracket click -> setCombatTarget(matchedEnemy.id)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Enhance useCombat messages and inject as local events in App.vue</name>
  <files>src/composables/useCombat.ts, src/App.vue</files>
  <action>
**In useCombat.ts — enhance `roundSummaryMessage` (lines 350-403):**

1. Make enemy names clickable by wrapping in brackets: change the enemy line from:
   `{{color:${color}}}[${bar}]{{/color}} ${hp}/${maxHp} HP  ${name} (L${level})`
   to:
   `{{color:${color}}}${bar}{{/color}} ${hp}/${maxHp} HP  [${name}] (L${level})`
   Note: the bar itself should NOT be in brackets (not clickable), only the name. Remove the `[` `]` around bar chars.

2. Add mana bar for player characters that have mana > 0. After each player HP line, if `character.mana > 0n`, add:
   `{{color:#4dabf7}}${manaBar}{{/color}} ${mana}/${maxMana} MP`
   Use same BAR_WIDTH=18, filled/empty logic with `\u2588`/`\u2591`.

3. Also make player names clickable (brackets) for party targeting scenarios. For the current player's own line, no brackets needed -- just the name plain.

**In App.vue — add watchers to inject local events:**

1. Remove the `combatHudProps` computed (lines 1031-1049). Remove the `:combat-hud-props="combatHudProps"` prop from NarrativeConsole (line 68).

2. Add a watcher on `roundState` to inject combat_status events when a round resolves:
   ```typescript
   watch(roundState, (state) => {
     if (state === 'resolved' && roundSummaryMessage.value) {
       addLocalEvent('combat_status', roundSummaryMessage.value, 'private');
     }
   });
   ```

3. Add a watcher to inject combat_prompt events during action_select phase. Use `watchEffect` that fires when `actionPromptMessage` changes:
   ```typescript
   // Track last injected prompt to avoid duplicates
   const lastInjectedPromptRound = ref<string | null>(null);
   watch(actionPromptMessage, (msg) => {
     if (!msg) return;
     const roundKey = `${currentRound.value?.roundNumber}-${activeCombat.value?.id}`;
     if (lastInjectedPromptRound.value === roundKey) return;
     lastInjectedPromptRound.value = roundKey;
     addLocalEvent('combat_prompt', msg, 'private');
   });
   ```
   Note: Only inject the prompt ONCE per round (not every second as timer ticks). The timer countdown is less important as inline text -- the player sees the prompt and clicks an action.

4. Also inject a combat_status event when combat STARTS (first encounter of activeCombat becoming truthy) showing initial HP bars. Watch `activeCombat`:
   ```typescript
   watch(() => activeCombat.value?.id?.toString(), (newId, oldId) => {
     if (newId && newId !== oldId) {
       // Inject initial status bars after a short delay to let combat data populate
       setTimeout(() => {
         if (roundSummaryMessage.value) {
           addLocalEvent('combat_status', roundSummaryMessage.value, 'private');
         }
       }, 500);
     }
     // Reset prompt tracking
     lastInjectedPromptRound.value = null;
   });
   ```

5. When `setCombatTarget` is called from keyword handler (line 1496), also inject a targeting feedback event:
   ```typescript
   // After setCombatTarget(matchedEnemy.id) on line 1496, add:
   addLocalEvent('system', `Targeting ${kw}`, 'private');
   ```

6. Ensure `roundState`, `currentRound`, `roundSummaryMessage`, `actionPromptMessage` are all destructured from `useCombat` (lines 969-985 already have most of them).
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>Combat status bars and action prompts inject as local events into the narrative stream. combatHudProps computed removed. Targeting feedback message shown.</done>
</task>

<task type="auto">
  <name>Task 2: Remove CombatHud from NarrativeConsole and delete CombatHud.vue</name>
  <files>src/components/NarrativeConsole.vue, src/components/CombatHud.vue</files>
  <action>
**In NarrativeConsole.vue:**

1. Remove the CombatHud template block (lines 46-49):
   ```
   <CombatHud
     v-if="combatHudProps"
     v-bind="combatHudProps"
   />
   ```

2. Remove the CombatHud import (line 66):
   `import CombatHud from './CombatHud.vue';`

3. Remove `combatHudProps` from the props interface (line 91):
   `combatHudProps?: any;`

**Delete CombatHud.vue:**
Delete `src/components/CombatHud.vue` entirely.

**Verify no other imports of CombatHud exist** -- it should only be imported in NarrativeConsole.vue.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>CombatHud.vue deleted. NarrativeConsole no longer imports or renders it. No type errors. Combat UI is fully inline in the narrative stream.</done>
</task>

</tasks>

<verification>
1. `npx vue-tsc --noEmit` passes with no errors
2. No remaining imports of CombatHud anywhere in the codebase
3. Grep for `combatHudProps` returns zero results
</verification>

<success_criteria>
- CombatHud.vue is deleted
- HP bars with Unicode block chars appear as combat_status events in the narrative stream after each round
- Action prompt with clickable ability brackets appears as combat_prompt event during action_select
- Enemy names are clickable in status bars (wrapped in [brackets])
- Mana bars show for characters with mana > 0
- Clicking an enemy name in status bars shows "Targeting [Name]" feedback
- No floating combat panel remains
</success_criteria>

<output>
After completion, create `.planning/quick/342-inline-combat-status-bars-in-narrative-p/342-SUMMARY.md`
</output>
