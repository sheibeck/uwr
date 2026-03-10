---
phase: quick-398
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/helpers/combat_rewards.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/commands.ts
  - src/composables/useSkillChoice.ts
  - src/components/NarrativeHud.vue
  - src/components/NarrativeConsole.vue
  - src/App.vue
autonomous: true
requirements: [QUICK-398]
must_haves:
  truths:
    - "When a character earns enough XP to level, the level does NOT auto-increase"
    - "A pending level count is stored on the character and visible to the client"
    - "NarrativeHud top bar shows race and class alongside name and level"
    - "NarrativeHud shows a clickable LEVEL UP indicator when pendingLevels > 0"
    - "Clicking LEVEL UP opens the character panel with a level-up link"
    - "Character panel shows a Level Up link when pendingLevels > 0"
    - "Clicking Level Up shows a confirmation message about ability picking and Keeper narration"
    - "After confirmation, the apply_level_up reducer processes one level (stats + skill gen)"
    - "Multiple pending levels are processed one at a time through repeated level-up actions"
  artifacts:
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "pendingLevels column on Character table"
      contains: "pendingLevels"
    - path: "spacetimedb/src/helpers/combat_rewards.ts"
      provides: "Modified awardXp that increments pendingLevels instead of leveling"
    - path: "spacetimedb/src/index.ts"
      provides: "apply_level_up reducer"
      contains: "apply_level_up"
  key_links:
    - from: "spacetimedb/src/helpers/combat_rewards.ts"
      to: "Character.pendingLevels"
      via: "awardXp increments pendingLevels instead of level"
    - from: "src/components/NarrativeHud.vue"
      to: "Character.pendingLevels"
      via: "shows LEVEL UP indicator and emits event"
    - from: "src/App.vue"
      to: "spacetimedb/src/index.ts"
      via: "calls apply_level_up reducer on user confirmation"
---

<objective>
Defer character level-ups so they happen at the player's discretion rather than automatically mid-combat. When XP crosses a level threshold, increment a `pendingLevels` counter instead of immediately leveling up. Add UI indicators and a confirmation flow so players can level up when ready (since it involves LLM narration and ability picking).

Also add race and class display to the NarrativeHud top bar.

Purpose: Prevent disruptive level-up narration during combat; give players control over when to engage with the level-up process.
Output: Modified schema, awardXp logic, new reducer, updated UI components.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/schema/tables.ts (Character table definition, lines 277-347)
@spacetimedb/src/helpers/combat_rewards.ts (awardXp function)
@spacetimedb/src/index.ts (prepare_skill_gen and choose_skill reducers, lines 645-730)
@spacetimedb/src/data/xp.ts (XP thresholds and level constants)
@spacetimedb/src/data/class_stats.ts (computeBaseStatsForGenerated, detectPrimarySecondary)
@src/composables/useSkillChoice.ts (auto-trigger skill gen on level watch)
@src/components/NarrativeHud.vue (top bar with name, level, combat, skill indicators)
@src/components/NarrativeConsole.vue (passes hasPendingSkills to NarrativeHud)
@src/components/CharacterInfoPanel.vue (character panel with tabs)
@src/App.vue (wiring: useSkillChoice, onOpenPanel, panel system, clickNpcKeyword)
@spacetimedb/src/reducers/commands.ts (quest XP awards that call awardXp)

<interfaces>
From spacetimedb/src/helpers/combat_rewards.ts:
```typescript
export function awardXp(ctx: any, character: any, enemyLevel: bigint, baseXp: bigint): { xpGained: bigint; leveledUp: boolean; newLevel?: bigint }
```

From spacetimedb/src/data/xp.ts:
```typescript
export const MAX_LEVEL = 10n;
export const XP_TOTAL_BY_LEVEL: bigint[];
export function xpRequiredForLevel(level: bigint): bigint;
```

From spacetimedb/src/data/class_stats.ts:
```typescript
export function computeBaseStatsForGenerated(primary: string, secondary: string, level: bigint): Record<string, bigint>;
export function detectPrimarySecondary(character: any): { primary: string; secondary: string };
```

From src/composables/useSkillChoice.ts:
```typescript
export function useSkillChoice({ selectedCharacter, pendingSkills, connActive }): {
  myPendingSkills, hasPendingSkills, chooseSkill, requestSkillGen
}
```

From src/App.vue panel system:
```typescript
openPanel(panelId: string): void
setPanelTab(panelId: string, tab: string): void
togglePanel(panelId: string): void
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Server-side delayed level-up (schema + awardXp + reducer)</name>
  <files>
    spacetimedb/src/schema/tables.ts
    spacetimedb/src/helpers/combat_rewards.ts
    spacetimedb/src/index.ts
    spacetimedb/src/reducers/commands.ts
  </files>
  <action>
**1. Add `pendingLevels` column to Character table** in `spacetimedb/src/schema/tables.ts`:
- Add `pendingLevels: t.u64().default(0n)` after the `xp` field (line ~293).
- This is a schema change so `--clear-database` will be needed on next publish.

**2. Modify `awardXp()` in `spacetimedb/src/helpers/combat_rewards.ts`:**
- Keep the XP accumulation logic (computing `newXp` from `baseXp * mod`).
- Instead of immediately computing new stats and updating level, calculate how many new levels were earned (`newLevel - character.level`).
- If levels were earned, increment `pendingLevels` by the number of new levels earned. Do NOT update `character.level`, stats, or racial bonuses.
- Update only the `xp` field on the character row.
- Return `{ xpGained, pendingLevels: levelsEarned }` instead of `{ xpGained, leveledUp, newLevel }`. Keep backward compat: also return `leveledUp: levelsEarned > 0n` so callers can still log "you have levels pending".
- Remove the stat recomputation, racial bonus application, and `recomputeCharacterDerived` call from awardXp (those move to the new reducer).
- Remove the "heritage grows stronger" private event from awardXp (will happen during apply_level_up instead).

**3. Update callers of `awardXp` in `spacetimedb/src/reducers/commands.ts`:**
- Lines ~128-134 and ~166-176: Change the level-up messages from "You reached level X!" to "You have leveled up! Type [level up] or click the Level Up indicator when ready." Include `xpResult.pendingLevels` in the message if useful (e.g., "You have N level(s) pending!").

**4. Update callers in `spacetimedb/src/reducers/combat.ts`:**
- Lines ~2152-2176: Same change — replace "reached level X" messages with "has level(s) pending" notification.

**5. Create `apply_level_up` reducer in `spacetimedb/src/index.ts`** (add after the `choose_skill` reducer, around line 760):
```
spacetimedb.reducer('apply_level_up', { characterId: t.u64() }, (ctx, { characterId }) => {
```
- Validate ownership (same pattern as prepare_skill_gen).
- Check `character.pendingLevels > 0n`, else throw SenderError.
- Check character is NOT in combat (look up combat_participant by character — if found and combat is active, reject with message "Cannot level up during combat").
- Process exactly ONE level:
  - `newLevel = character.level + 1n`
  - Compute new base stats via `computeBaseStatsForGenerated(detectPrimarySecondary(character), newLevel)`
  - Compute racial bonuses at newLevel via the same `computeRacialAtLevelFromRow` logic (extract that function or import it from combat_rewards.ts — it's currently not exported, so export it).
  - Update character: `level: newLevel`, new stats, new racial bonuses, `pendingLevels: character.pendingLevels - 1n`.
  - Call `recomputeCharacterDerived(ctx, updated)`.
  - If `newLevel % 2n === 0n` and race exists, send the "heritage grows stronger" private event.
  - Send private event: "You have reached level {newLevel}!" and if pendingLevels > 1: "You have {remaining} more level(s) to claim."
- After stat update, automatically trigger skill generation (same logic as prepare_skill_gen: check for existing pending skills, budget, create LLM task). Copy the relevant logic from prepare_skill_gen or extract a shared helper. This means each level-up produces one ability choice round.

**Export `computeRacialAtLevelFromRow`** from combat_rewards.ts so apply_level_up can use it.
  </action>
  <verify>
    <automated>cd spacetimedb && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    - Character table has `pendingLevels` column
    - awardXp no longer auto-levels; it increments pendingLevels
    - apply_level_up reducer exists and processes one level at a time
    - All awardXp callers updated to show "level pending" messages
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Client-side level-up UI (NarrativeHud + CharacterInfoPanel + wiring)</name>
  <files>
    src/composables/useSkillChoice.ts
    src/components/NarrativeHud.vue
    src/components/NarrativeConsole.vue
    src/components/CharacterInfoPanel.vue
    src/App.vue
  </files>
  <action>
**1. Update `useSkillChoice.ts`:**
- Remove the `watch` on `selectedCharacter.level` that auto-triggers `requestSkillGen()` (lines 52-65). Level-up is now manual — the apply_level_up reducer handles skill gen triggering server-side.
- Add a `pendingLevels` computed that reads `selectedCharacter.value?.pendingLevels ?? 0n`.
- Add a `hasPendingLevels` computed: `pendingLevels.value > 0n`.
- Add an `applyLevelUp` function that calls `conn.reducers.applyLevelUp({ characterId })`.
- Return `pendingLevels`, `hasPendingLevels`, `applyLevelUp` from the composable.

**2. Update `NarrativeHud.vue`:**
- Add race and class to the left section after name and level: `{{ character.name }} Lv {{ character.level }} - {{ character.race }} {{ character.className }}`
- Add a new prop: `pendingLevels: number` (default 0).
- Add a clickable "LEVEL UP" indicator (similar style to "NEW SKILL" but with a gold/amber color like `#ffa500`). Show when `pendingLevels > 0`. Display count if > 1: "LEVEL UP (2)".
- Make the LEVEL UP indicator emit `@click` -> `$emit('level-up-click')`.
- Add the new emit to defineEmits.
- Use `cursor: 'pointer'` on the indicator and a pulsing animation similar to skillPulse.

**3. Update `NarrativeConsole.vue`:**
- Pass the new `pendingLevels` prop through to NarrativeHud (similar to how `hasPendingSkills` is passed).
- Add the `@level-up-click` event forwarding.

**4. Update `CharacterInfoPanel.vue`:**
- Add a new prop: `pendingLevels: number` (default 0).
- At the top of the component (above the tab bar), when `pendingLevels > 0`, show a prominent banner/link:
  - Text: "[Level Up]" (clickable, styled like a gold link).
  - If pendingLevels > 1: "[Level Up] (3 levels pending)"
  - Clicking it emits `'level-up'` event.
- Add `(e: 'level-up'): void` to defineEmits.

**5. Wire everything in `App.vue`:**
- From `useSkillChoice`, also destructure `pendingLevels`, `hasPendingLevels`, `applyLevelUp`.
- Pass `pendingLevels` (as `Number(pendingLevels)`) to NarrativeConsole and CharacterInfoPanel.
- Handle `@level-up-click` from NarrativeConsole: open the character panel to the 'abilities' tab (`setPanelTab('characterInfo', 'abilities'); openPanel('characterInfo');`).
- Handle `@level-up` from CharacterInfoPanel: Show a confirmation via `addLocalEvent` that says something like:
  "Ready to level up? The Keeper will guide you through ability selection. This involves narration and may take a moment. Click [Confirm Level Up] to proceed."
- In `clickNpcKeyword`, handle "Confirm Level Up" keyword: call `applyLevelUp()`.
- Also handle "level up" as a typed command in `clickNpcKeyword` or the keyword handler: if `hasPendingLevels`, show the same confirmation. This way typing "level up" also works.
- Remove the "Choose Ability" keyword handler at line ~1685-1689 (the old flow where user manually triggers skill gen is replaced by the level-up flow which triggers it automatically).

**6. Regenerate client bindings** after server changes:
- Run `spacetime generate --lang typescript --out-dir src/module_bindings -p spacetimedb` to pick up the new `pendingLevels` field and `applyLevelUp` reducer.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    - NarrativeHud shows race and class in the top bar
    - NarrativeHud shows clickable LEVEL UP indicator when pendingLevels > 0
    - Clicking LEVEL UP opens character panel to abilities tab
    - Character panel shows Level Up link with confirmation flow
    - Auto skill-gen watch removed from useSkillChoice
    - Typing "level up" also triggers the confirmation flow
    - Client compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 3: Publish, generate bindings, and verify end-to-end</name>
  <files>
    src/module_bindings/
  </files>
  <action>
**1. Publish with --clear-database** (schema change — new column on Character):
```bash
spacetime publish uwr -p spacetimedb --clear-database -y
```

**2. Generate client bindings:**
```bash
spacetime generate --lang typescript --out-dir src/module_bindings -p spacetimedb
```

**3. Verify TypeScript compilation:**
```bash
npx vue-tsc --noEmit
```

**4. Fix any type errors** from the new `pendingLevels` field or `applyLevelUp` reducer in generated bindings. The Character type in module_bindings should now include `pendingLevels: bigint`. The reducers should include `applyLevelUp`.

**5. Verify the AppHeader.vue XP bar** still works correctly — it uses its own `XP_TOTAL_BY_LEVEL` array (duplicated from server, lines 82-89). The XP bar should still show progress since we still accumulate XP in awardXp, we just don't bump the displayed level until the player clicks Level Up. Note: the XP bar will show XP beyond current level threshold which is correct — it shows the player has enough XP to level.

**6. Run dev server** (`npm run dev`) to confirm it starts without errors.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
    - Module published with new schema
    - Client bindings regenerated with pendingLevels field and applyLevelUp reducer
    - Full TypeScript compilation passes
    - Dev server starts without errors
  </done>
</task>

</tasks>

<verification>
1. TypeScript compilation passes for both server and client
2. Module publishes successfully with the new schema
3. Client bindings include `pendingLevels` on Character and `applyLevelUp` reducer
4. NarrativeHud shows race, class, name, and level
5. When XP is gained and a level threshold is crossed, pendingLevels increments but level stays the same
6. LEVEL UP indicator appears in the HUD
7. Clicking it opens character panel with Level Up link
8. Confirmation flow warns about narration time
9. After confirming, one level is processed (stats updated, skill gen triggered)
</verification>

<success_criteria>
- Characters no longer auto-level on XP gain
- pendingLevels field tracks earned-but-unprocessed levels
- Top bar shows name, level, race, and class
- Clickable LEVEL UP indicator appears when levels are pending
- Full confirmation flow before processing level-up
- Each level-up processes one level and triggers ability choice via LLM
- No regression in XP accumulation or combat rewards
</success_criteria>

<output>
After completion, create `.planning/quick/398-delayed-level-up-save-level-ups-for-manu/398-SUMMARY.md`
</output>
