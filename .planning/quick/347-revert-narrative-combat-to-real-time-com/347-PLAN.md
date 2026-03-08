---
phase: quick-347
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/CombatActionBar.vue
  - src/components/EnemyHud.vue
  - src/components/NarrativeInput.vue
  - src/components/NarrativeConsole.vue
  - src/App.vue
autonomous: true
requirements: [COMBAT-UI-REVERT]
must_haves:
  truths:
    - "During combat, the bottom action bar shows Flee button + one button per character ability"
    - "Clicking an ability button shows a cast bar filling on that button, then shows cooldown timer counting down"
    - "Enemy HUD elements appear above the action bar showing each enemy name, level, and HP bar"
    - "Enemy HUD does not get hidden behind the command input area"
    - "Outside combat, the normal context action bar appears as before"
    - "Narrative text stream (LLM pulling) continues during combat — only the action mechanism changes from bracket keywords to buttons"
    - "Enemy HUD highlights the currently targeted enemy with a distinct border/glow"
    - "First enemy is auto-targeted when combat begins"
  artifacts:
    - path: "src/components/CombatActionBar.vue"
      provides: "Combat-specific action bar with Flee + ability buttons, cast bars, cooldowns"
    - path: "src/components/EnemyHud.vue"
      provides: "Enemy HP bars displayed above the input area"
  key_links:
    - from: "src/components/NarrativeInput.vue"
      to: "CombatActionBar.vue + EnemyHud.vue"
      via: "conditional rendering based on isInCombat prop"
      pattern: "v-if.*isInCombat"
    - from: "src/App.vue"
      to: "NarrativeConsole.vue"
      via: "props passing combat data (abilities, enemies, cooldowns, cast state)"
      pattern: ":combat-abilities"
---

<objective>
Revert combat UI from narrative/turn-based inline text to a real-time action bar with ability buttons, cast bars, cooldowns, and an enemy HUD.

Purpose: The narrative combat flow (clicking bracket keywords in the text stream) is clunky. Return to a tactile real-time combat feel with dedicated ability buttons that show cast progress and cooldown timers, plus enemy HP bars always visible at the bottom.

Output: CombatActionBar.vue, EnemyHud.vue, updated NarrativeInput.vue and NarrativeConsole.vue, wired through App.vue.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.vue
@src/components/NarrativeInput.vue
@src/components/NarrativeConsole.vue
@src/components/NarrativeHud.vue
@src/composables/useCombat.ts
@src/composables/useHotbar.ts
@src/composables/useContextActions.ts

<interfaces>
<!-- Key types the executor needs -->

From src/module_bindings/types.ts:
```typescript
export type AbilityTemplate = {
  id: bigint;
  characterId: bigint;
  name: string;
  description: string;
  kind: string;
  targetRule: string;
  resourceType: string;
  resourceCost: bigint;
  castSeconds: bigint;
  cooldownSeconds: bigint;
  // ...plus scaling, value1, value2, damageType, effectType, effectMagnitude, effectDuration, levelRequired, isGenerated
};
```

From src/composables/useCombat.ts (already exposed):
```typescript
// combatEnemiesList returns array of:
{
  id: bigint; name: string; level: bigint;
  hp: bigint; maxHp: bigint; conClass: string;
  isTarget: boolean; effects: [...]; castLabel: string;
  castProgress: number; isCasting: boolean;
  targetName: string | null; isBoss: boolean;
}

// Already available from useCombat:
submitAbility(abilityTemplateId: bigint, targetEnemyId: bigint)
submitFlee()
isInCombat: ComputedRef<boolean>
roundState: ComputedRef<string | null>
hasSubmittedAction: ComputedRef<boolean>
roundTimeRemaining: Ref<number>
combatEnemiesList: ComputedRef<[...]>
```

From src/composables/useHotbar.ts (already exposed):
```typescript
// castingState, isCasting, castProgress, activeCastId already available
// abilityCooldowns tracked per character
// useAbility(abilityTemplateId, targetCharacterId?) fires the reducer
// onHotbarClick(slot) handles all validation + prediction
```

NarrativeInput.vue currently renders context action buttons in a bar above the input. During combat, useContextActions returns [] (empty). The CombatActionBar should render in that same slot when isInCombat is true.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create CombatActionBar and EnemyHud components</name>
  <files>src/components/CombatActionBar.vue, src/components/EnemyHud.vue</files>
  <action>
Create `src/components/CombatActionBar.vue`:
- Horizontal button bar matching the existing context action bar style (same position, same height area, same dark theme)
- First button: "Flee" with red-tinted border (#5c2a2a), calls emit('flee') on click
- Then one button per ability from the `abilities` prop (array of objects with: id, name, kind, resourceType, resourceCost, castSeconds, cooldownSeconds, isCasting, castProgress, cooldownRemaining, isOnCooldown)
- Each ability button shows:
  - The ability name as label
  - If currently casting (isCasting && castingAbilityId === ability.id): a colored overlay div (blue/purple) filling left-to-right based on castProgress (0-1), text changes to "Casting..."
  - If on cooldown (cooldownRemaining > 0): a dark overlay div filling right-to-left based on (cooldownRemaining / cooldownSeconds), show cooldown seconds number overlaid
  - If neither: normal clickable state
- Disabled state: while casting any ability, or if ability is on cooldown, or if hasSubmittedAction is true (round-based combat lock)
- Emit('use-ability', abilityId: bigint) on click
- Show round timer countdown if roundTimeRemaining > 0 and roundState === 'action_select': small text on the right side like "6s" with pulse animation when <= 3s
- If hasSubmittedAction: show "Action locked in..." text instead of timer
- Style: same background (#12121a), same border top (#2a2a3a) as NarrativeInput's container. Buttons use #1a1a2e background, #2a2a3a border, #adb5bd text. Active/casting buttons get blue glow. Cooldown buttons get dimmed opacity.
- Button height ~32px, overflow-x auto for scrolling if many abilities

Create `src/components/EnemyHud.vue`:
- Renders above the CombatActionBar (or above the input container)
- Props: enemies (array from combatEnemiesList shape: id, name, level, hp, maxHp, conClass, isTarget, isBoss)
- For each enemy: a compact row showing:
  - HP bar (colored: green > 50%, yellow 25-50%, red < 25%) with HP text overlay
  - Enemy name + level, using conClass color mapping (conRed=#ff6b6b, conOrange=#f08c00, conYellow=#ffd43b, conWhite=#e9ecef, conBlue=#4dabf7, conLightGreen=#69db7c, conGray=#868e96)
  - Boss indicator (skull emoji or "BOSS" tag) if isBoss
  - Highlight border/glow if isTarget (bright border color matching conClass, or a universal gold/white glow)
- Click on enemy row emits('target-enemy', enemyId)
- The targeted enemy should be visually obvious — use a brighter border + subtle glow effect
- Compact style: each row ~24px tall, dark background matching theme
- The whole EnemyHud sits ABOVE the input area with enough margin so it never gets hidden behind anything
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>Both components exist, type-check, and render combat ability buttons with cast/cooldown states plus enemy HP bars</done>
</task>

<task type="auto">
  <name>Task 2: Wire combat UI into NarrativeInput, NarrativeConsole, and App.vue</name>
  <files>src/components/NarrativeInput.vue, src/components/NarrativeConsole.vue, src/App.vue</files>
  <action>
**NarrativeInput.vue changes:**
- Import CombatActionBar and EnemyHud
- Add props: isInCombat (boolean), combatAbilities (array - built in App.vue from abilityTemplates + abilityCooldowns + castingState for the selected character), combatEnemies (array from combatEnemiesList), castingAbilityId (bigint | null), castProgress (number), roundTimeRemaining (number), roundState (string | null), hasSubmittedAction (boolean)
- In the template, replace the context action bar section:
  - When `isInCombat` is true: render `<EnemyHud>` + `<CombatActionBar>` instead of the context action buttons
  - When `isInCombat` is false: render the existing context action buttons as before
- Forward events: @flee emits('flee'), @use-ability emits('use-ability', id), @target-enemy emits('target-enemy', id)
- Adjust scrollAreaStyle paddingBottom in NarrativeConsole.vue: increase from 90px to ~140px when in combat (to accommodate EnemyHud + CombatActionBar + input row). Pass isInCombat down.

**NarrativeConsole.vue changes:**
- Add props for the new combat data: isInCombat, combatAbilities, combatEnemies, castingAbilityId, castProgress, roundTimeRemaining (already has this), roundState (already has this), hasSubmittedAction (already has this)
- Pass these through to NarrativeInput
- Forward new events: @flee, @use-ability, @target-enemy up to App.vue
- Adjust scrollAreaStyle paddingBottom dynamically: use computed style that adds extra padding (~50px more) when isInCombat is true, so the enemy HUD + combat bar don't overlap the narrative scroll content

**App.vue changes:**
- Build `combatAbilities` computed: for selectedCharacter, map abilityTemplates where characterId matches, enriching each with cooldown data from abilityCooldowns and casting state from castingState/activeCastId/castProgress (all from useHotbar). Each entry: { id, name, kind, resourceType, resourceCost, castSeconds, cooldownSeconds, cooldownRemaining (number, seconds), isOnCooldown (boolean) }
- Pass new props to NarrativeConsole: :is-in-combat="isInCombat", :combat-abilities="combatAbilities", :combat-enemies="combatEnemiesList", :casting-ability-id="activeCastId", :cast-progress="castProgress"
- Handle new events from NarrativeConsole:
  - @flee: call submitFlee() (from useCombat)
  - @use-ability: find first living enemy from combatEnemiesList, call submitAbility(abilityId, enemyId) for round-based, OR call useAbility(abilityId) from useHotbar for real-time (check if round-based by checking currentRound existence)
  - @target-enemy: call setCombatTarget(enemyId) from useCombat
- Auto-target the first enemy when combat begins: watch isInCombat, when it becomes true, if no enemy is targeted, call setCombatTarget on the first enemy in combatEnemiesList
- Keep the existing keyword click handler for backward compatibility (bracket keywords in narrative text still work)
- KEEP the narrative text stream (LLM narrative pulling) fully intact during combat — only the action input mechanism changes from bracket keywords to ability buttons
- Remove the inline combat_prompt action text injection (lines ~1056-1058 in App.vue that inject actionPromptMessage into narrative stream) since the CombatActionBar now handles this visually. Keep the round header, status bars, and summary injections.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>During combat, the bottom of the screen shows enemy HP bars + ability buttons with cast/cooldown visuals + Flee button, replacing the narrative bracket-keyword combat prompts. Outside combat, normal context actions appear as before.</done>
</task>

</tasks>

<verification>
1. `npx vue-tsc --noEmit` passes with no errors
2. Visual check: enter combat, see enemy HUD bars above the input, see Flee + ability buttons replacing the context action bar
3. Click an ability button: cast bar fills, then cooldown timer shows
4. Enemy HUD shows correct HP, colors by con level, clickable to target
5. Outside combat: normal context actions (Look, Travel, etc.) appear as before
6. Scroll area doesn't get hidden behind the combat UI elements
</verification>

<success_criteria>
- Combat shows dedicated ability buttons with cast bars and cooldown timers at the bottom
- Enemy HUD with HP bars visible above the input area during combat
- Flee button present and functional
- No overlap/hiding issues between enemy HUD and command input
- Non-combat UI unchanged
- Narrative text stream continues during combat (LLM pulling preserved)
- Targeted enemy visually highlighted in enemy HUD
- First enemy auto-targeted on combat start
</success_criteria>

<output>
After completion, create `.planning/quick/347-revert-narrative-combat-to-real-time-com/347-SUMMARY.md`
</output>
