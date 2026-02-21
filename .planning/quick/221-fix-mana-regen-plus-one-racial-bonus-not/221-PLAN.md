---
phase: 221-fix-mana-regen
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [BUG-221]
must_haves:
  truths:
    - "Gnome Summoner sees 7 mana per tick out-of-combat (5 base + 1 racial + 1 gear if applicable)"
    - "Gear manaRegen affix bonuses are applied each regen tick"
    - "Racial manaRegen is applied each regen tick"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "regen_health reducer with corrected mana bonus accumulation"
      contains: "gear.manaRegen"
  key_links:
    - from: "regen_health reducer"
      to: "getEquippedBonuses().manaRegen"
      via: "gear lookup per character"
      pattern: "gear\\.manaRegen"
    - from: "regen_health reducer"
      to: "character.racialManaRegen"
      via: "direct column read"
      pattern: "racialManaRegen"
---

<objective>
Fix mana regen tick to include gear manaRegen affix bonuses, and verify racial manaRegen is applied correctly for Gnome characters.

Purpose: Gnome Summoner reports seeing 6 mana/tick instead of expected 7 (5 base + 1 racial). Investigation reveals gear `manaRegen` affix bonuses are computed by `getEquippedBonuses()` but never applied in the regen tick — only `food_mana_regen` CharacterEffects and `character.racialManaRegen` are applied. The racial column IS read correctly at line 1303 of combat.ts, so the racial bonus mechanism is structurally correct.

Root cause: Two separate gaps in `regen_health`:
1. Gear `manaRegen` affix bonuses (from `getEquippedBonuses`) are silently ignored
2. If the Gnome character was created before `racialManaRegen` column was added, the column is null — fix requires republish with clear, or an admin set command

Output: Corrected regen tick that applies gear manaRegen, matching what the stat panel would show.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/projects/uwr/spacetimedb/src/reducers/combat.ts
@C:/projects/uwr/spacetimedb/src/helpers/items.ts
@C:/projects/uwr/spacetimedb/src/helpers/character.ts
@C:/projects/uwr/spacetimedb/src/data/races.ts
@C:/projects/uwr/spacetimedb/src/schema/tables.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Apply gear manaRegen in the regen tick</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In the `regen_health` reducer (around line 1285-1309), the mana bonus accumulator currently only collects `food_mana_regen` effects and `character.racialManaRegen`. Gear manaRegen affix bonuses from `getEquippedBonuses()` are NOT applied.

Fix: call `getEquippedBonuses(ctx, character.id)` inside the loop and add `gear.manaRegen` to `manaRegenBonus`.

The import for `getEquippedBonuses` is already present at the top of combat.ts (verify with grep before adding).

Current code block to modify (approximately):
```typescript
let hpRegenBonus = 0n;
let manaRegenBonus = 0n;
let staminaRegenBonus = 0n;
for (const effect of ctx.db.characterEffect.by_character.filter(character.id)) {
  if (effect.effectType === 'food_health_regen') hpRegenBonus += effect.magnitude;
  else if (effect.effectType === 'food_mana_regen') manaRegenBonus += effect.magnitude;
  else if (effect.effectType === 'food_stamina_regen') staminaRegenBonus += effect.magnitude;
}

// Add racial regen bonuses from Character row (these persist through death, unlike CharacterEffects)
hpRegenBonus += character.racialHpRegen ?? 0n;
manaRegenBonus += character.racialManaRegen ?? 0n;
staminaRegenBonus += character.racialStaminaRegen ?? 0n;
```

Add after the racial lines:
```typescript
// Add gear manaRegen affix bonuses (getEquippedBonuses already used elsewhere in this file)
const gear = getEquippedBonuses(ctx, character.id);
manaRegenBonus += gear.manaRegen;
```

NOTE: `getEquippedBonuses` is called once per character per tick — this is acceptable since the regen tick already iterates all effects per character. Do not hoist the call above the `character.hp === 0n` guard.

Also check whether `getEquippedBonuses` is already imported in this file. If not, add to the existing imports from `'../helpers/items'`.
  </action>
  <verify>
    1. `grep -n "getEquippedBonuses" spacetimedb/src/reducers/combat.ts` — confirm it appears in both import and regen tick body
    2. `grep -n "gear.manaRegen" spacetimedb/src/reducers/combat.ts` — confirm line added
    3. Publish to local: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb`
    4. Check logs for compile errors: `spacetime logs uwr`
  </verify>
  <done>
    - combat.ts compiles without errors
    - Regen tick applies gear.manaRegen to manaRegenBonus
    - No TypeScript compile errors from spacetime publish
  </done>
</task>

<task type="auto">
  <name>Task 2: Verify racialManaRegen is populated for existing Gnome character</name>
  <files>spacetimedb/src/reducers/commands.ts</files>
  <action>
The `character.racialManaRegen` column is optional in the schema (`t.u64().optional()`). Characters created BEFORE this column was added to the schema will have `null`/`undefined` in this field, causing `character.racialManaRegen ?? 0n` to return `0n` at tick time — silently dropping the racial bonus.

The fix is to add a `/recompute_racial` admin command (or repurpose existing admin tooling) that re-runs `computeRacialAtLevel` for all characters and updates their racial columns.

Check if an existing admin command already handles this. Search for `set_level` or `recompute` in commands.ts.

If a `/set_level` command exists and re-applies racial bonuses (confirmed: it does, see the `updated` object at line 634), use it as the repair path: running `/set_level <characterName> <currentLevel>` on the affected character will re-apply `racialManaRegen` correctly.

Add a new admin reducer `recompute_racial_all` that:
1. Iterates all characters via `ctx.db.character.iter()`
2. For each character, looks up their race row by `character.race` name
3. Calls `computeRacialAtLevelForAdmin(raceRow, character.level)` (this function already exists in commands.ts scope)
4. Updates the character row with correct racial columns (same pattern as lines 634-664)
5. Calls `recomputeCharacterDerived(ctx, updated)` after update

The reducer should be gated to admin senders (check pattern used by other admin reducers in commands.ts — look for `ADMIN_IDENTITIES` check pattern).

If `computeRacialAtLevelForAdmin` is a local function inside a closure, you may need to duplicate its logic or extract it. Check the structure of commands.ts carefully before adding.

NOTE: Do NOT auto-publish to maincloud. Publish only to local for testing.
  </action>
  <verify>
    1. `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` — compiles clean
    2. `spacetime logs uwr` — no errors
    3. Run the new reducer on the Gnome Summoner via game client or spacetime CLI
    4. Check character row: `racialManaRegen` should be `1` (bigint)
    5. Watch regen events in game — mana should increase by 7/tick out-of-combat (5 base + 1 racial + gear bonus)
  </verify>
  <done>
    - `recompute_racial_all` reducer exists and is gated to admin
    - Running it repairs existing characters missing racial regen values
    - Gnome Summoner mana regen is 7/tick out-of-combat (5 base + 1 racial, plus any gear bonus)
    - Health regen for Troll similarly works (hp_regen racial applied)
  </done>
</task>

</tasks>

<verification>
After both tasks:
1. Publish local: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb`
2. Confirm no compile errors in spacetime logs
3. Run `recompute_racial_all` on live local DB to fix existing characters
4. Log into game as Gnome Summoner, observe mana tick events in event log
5. Mana should increase by at least 6/tick (5 base + 1 racial), more if gear has manaRegen affix
6. Verify Troll character hp_regen also working (same code path — racialHpRegen)
</verification>

<success_criteria>
- Gnome Summoner recovers 7 mana/tick out-of-combat (5 base + 1 racial + 0 or more gear)
- Gear manaRegen affix stat now applies during regen tick
- Existing characters with null racialManaRegen can be repaired via admin command
- No regression in non-mana-regen paths (hp regen, stamina regen, combat regen unchanged)
</success_criteria>

<output>
After completion, create `.planning/quick/221-fix-mana-regen-plus-one-racial-bonus-not/221-SUMMARY.md`
</output>
