---
phase: quick-120
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/hunger.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/seeding/ensure_items.ts
autonomous: true
must_haves:
  truths:
    - "Group panel shows 'Well Fed' as buff name, not 'food_buff' or raw effectType"
    - "Log message when eating food says readable stat name (e.g. 'mana regeneration') not 'MANA_REGEN'"
    - "Food buffs increase per-tick regen rate instead of granting periodic heal ticks"
    - "Eating a new food removes any existing food buff regardless of type (one food buff at a time)"
  artifacts:
    - path: "spacetimedb/src/reducers/hunger.ts"
      provides: "eat_food reducer with corrected display names, one-at-a-time enforcement, and regen-bonus effect types"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "regen_health tick that reads food regen bonus effects and adds to per-tick regen"
  key_links:
    - from: "spacetimedb/src/reducers/hunger.ts"
      to: "CharacterEffect table"
      via: "insert with sourceAbility='Well Fed' and effectType='food_mana_regen' or 'food_stamina_regen'"
      pattern: "sourceAbility.*Well Fed"
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "CharacterEffect by_character index"
      via: "filter for food regen bonus effects in regen_health tick"
      pattern: "food_mana_regen|food_stamina_regen"
---

<objective>
Fix four bugs in the food buff system: display names showing raw constants, log messages showing enum keys, regen food using periodic heal instead of regen rate bonus, and multiple food buffs stacking simultaneously.

Purpose: Food buffs should display readable names, log proper stat labels, correctly modify regen rates, and enforce one-food-at-a-time.
Output: Corrected eat_food reducer, updated regen_health tick, proper display names throughout.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/hunger.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/ui/effectTimers.ts
@spacetimedb/src/seeding/ensure_items.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix eat_food reducer - display names, log messages, regen mechanic, and stacking</name>
  <files>spacetimedb/src/reducers/hunger.ts</files>
  <action>
  Modify the `eat_food` reducer in `spacetimedb/src/reducers/hunger.ts` with four changes:

  **1. Fix display name (Bug 1):** Change `sourceAbility: 'food_buff'` to `sourceAbility: 'Well Fed'` in the characterEffect.insert call (line 62). The `effectLabel()` function in `effectTimers.ts` returns `effect.sourceAbility` when it exists, so "Well Fed" will display in the Group panel instead of "food_buff".

  **2. Fix log message (Bug 2):** Replace the raw `template.wellFedBuffType.toUpperCase()` in the appendPrivateEvent message (line 69) with a display label map:
  ```
  const BUFF_TYPE_LABELS: Record<string, string> = {
    'str': 'strength',
    'dex': 'dexterity',
    'mana_regen': 'mana regeneration',
    'stamina_regen': 'stamina regeneration',
  };
  ```
  Use `BUFF_TYPE_LABELS[template.wellFedBuffType] || template.wellFedBuffType` in the log string instead of `template.wellFedBuffType.toUpperCase()`.

  **3. Fix regen mechanic (Bug 3):** Change the effectType mapping for mana_regen and stamina_regen food buffs. Instead of mapping to `'mana_regen'` / `'stamina_regen'` (which the `tick_effects` reducer treats as periodic heals), use new effect types `'food_mana_regen'` and `'food_stamina_regen'`. These will be read by the `regen_health` tick (Task 2) as regen rate bonuses. The existing `tick_effects` reducer will ignore them (they don't match any effectType case), but will still decrement roundsRemaining and delete them when expired. The stat bonus types (str_bonus, dex_bonus) stay unchanged since they already work correctly via `tick_effects`.

  Updated effectType mapping:
  ```
  if (template.wellFedBuffType === 'str') effectType = 'str_bonus';
  else if (template.wellFedBuffType === 'dex') effectType = 'dex_bonus';
  else if (template.wellFedBuffType === 'mana_regen') effectType = 'food_mana_regen';
  else if (template.wellFedBuffType === 'stamina_regen') effectType = 'food_stamina_regen';
  ```

  **4. Fix stacking (Bug 4):** Change the existing food buff removal filter from checking `effect.sourceAbility === 'food_buff' && effect.effectType === effectType` to just `effect.sourceAbility === 'Well Fed'`. This ensures eating ANY food removes ALL existing food buffs regardless of type, enforcing one-food-at-a-time. Move this deletion loop BEFORE the effectType mapping so it always runs.
  </action>
  <verify>Read the modified file and confirm: (a) sourceAbility is 'Well Fed', (b) log message uses BUFF_TYPE_LABELS map, (c) effectType for mana_regen maps to 'food_mana_regen' and stamina_regen maps to 'food_stamina_regen', (d) deletion loop checks only sourceAbility === 'Well Fed' without effectType filter.</verify>
  <done>eat_food reducer inserts CharacterEffect with sourceAbility='Well Fed', logs human-readable stat names, uses food-specific regen effectTypes, and removes all existing food buffs before applying new one.</done>
</task>

<task type="auto">
  <name>Task 2: Add food regen bonus to regen_health tick</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
  In the `regen_health` reducer in `spacetimedb/src/reducers/combat.ts` (starting around line 1150), modify the per-character regen calculation to include food regen bonuses.

  After computing `manaRegen` and `staminaRegen` (around line 1167-1168), add a loop over the character's active effects to find food regen bonuses:

  ```typescript
  let manaRegenBonus = 0n;
  let staminaRegenBonus = 0n;
  for (const effect of ctx.db.characterEffect.by_character.filter(character.id)) {
    if (effect.effectType === 'food_mana_regen') manaRegenBonus += effect.magnitude;
    else if (effect.effectType === 'food_stamina_regen') staminaRegenBonus += effect.magnitude;
  }
  ```

  Then add these bonuses to the regen amounts before computing next values:
  - Change `character.mana + manaRegen` to `character.mana + manaRegen + manaRegenBonus`
  - Change `character.stamina + staminaRegen` to `character.stamina + staminaRegenBonus + staminaRegen`

  This means the food buff magnitude (+4 for Herb Broth or Traveler's Stew) adds directly to the per-tick regen amount. With MANA_REGEN_OUT=5 and food bonus of 4, total would be 9 mana per tick out of combat.

  Do NOT modify the tick_effects reducer section. The food_mana_regen and food_stamina_regen effectTypes are intentionally unhandled there — they will still get their roundsRemaining decremented and be cleaned up when expired. The tick_effects decrement and cleanup logic at the bottom of the tick_effects reducer (around line 1271: `const remaining = effect.roundsRemaining - 1n`) handles all effect types regardless of whether they match a specific case.
  </action>
  <verify>Read the modified regen_health reducer section and confirm: (a) food_mana_regen and food_stamina_regen effects are read from by_character index, (b) their magnitudes are added to manaRegen and staminaRegen respectively in the next-value calculations, (c) no changes to tick_effects reducer.</verify>
  <done>regen_health tick applies food regen bonuses as per-tick rate increases. A character with Herb Broth active gains +4 mana per regen tick on top of the base rate. Food regen effects still expire naturally via tick_effects roundsRemaining decrement.</done>
</task>

<task type="auto">
  <name>Task 3: Publish module, generate bindings, verify</name>
  <files>spacetimedb/src/reducers/hunger.ts, spacetimedb/src/reducers/combat.ts</files>
  <action>
  Publish the SpacetimeDB module and regenerate client bindings:
  1. Run: `spacetime publish uwr --clear-database -y --project-path spacetimedb`
  2. Run: `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb`
  3. Run: `npm run build` in the client directory to confirm no TypeScript errors.

  No client code changes needed because:
  - The `effectLabel()` function in `effectTimers.ts` already returns `sourceAbility` when present ("Well Fed" now instead of "food_buff")
  - The new effectTypes (food_mana_regen, food_stamina_regen) don't require any client display changes — they show via sourceAbility label
  - The effect badge coloring uses `effectIsNegative()` which checks magnitude sign — food buffs have positive magnitude, so they'll show as positive buffs correctly
  </action>
  <verify>Module publishes without errors. Client builds without errors. Check spacetime logs for any runtime errors.</verify>
  <done>Module published with fixed food buff system. Client builds cleanly. No runtime errors in logs.</done>
</task>

</tasks>

<verification>
1. Module compiles and publishes without errors
2. Client builds without TypeScript errors
3. In hunger.ts: sourceAbility is 'Well Fed', not 'food_buff'
4. In hunger.ts: log uses readable labels like 'mana regeneration', not 'MANA_REGEN'
5. In hunger.ts: mana_regen/stamina_regen food buffs use food_mana_regen/food_stamina_regen effectTypes
6. In hunger.ts: stacking removal checks only sourceAbility === 'Well Fed' (not effectType)
7. In combat.ts: regen_health sums food_mana_regen and food_stamina_regen effects into per-tick regen
</verification>

<success_criteria>
- Food buffs display as "Well Fed" in Group panel, not "food_buff" or raw effectType
- Eating food logs readable stat name (e.g., "mana regeneration"), not "MANA_REGEN"
- Food regen buffs increase per-tick regen rate in regen_health, not periodic heal via tick_effects
- Eating any food removes all existing food buffs (one food buff at a time)
- Module publishes and client builds cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/120-fix-food-buff-display-names-regen-mechan/120-SUMMARY.md`
</output>
</task>
