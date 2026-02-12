---
phase: quick
plan: 6
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/items.ts
  - src/composables/useHotbar.ts
  - src/module_bindings/ability_template_type.ts
autonomous: true

must_haves:
  truths:
    - "All abilities automatically derive combat state guards from their data, not hardcoded key lists"
    - "Pet summon abilities are blocked outside combat without client hardcoding"
    - "Out-of-combat-only abilities are blocked in combat without client hardcoding"
    - "No regression in existing ability behavior"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "AbilityTemplate table with combatState column; ensureAbilityTemplates populates combatState"
      contains: "combatState"
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "use_ability reducer uses combatState from AbilityTemplate instead of hardcoded petSummons set"
    - path: "src/composables/useHotbar.ts"
      provides: "onHotbarClick uses ability.combatState from template data instead of PET_SUMMON_KEYS and OUT_OF_COMBAT_ONLY_KEYS"
  key_links:
    - from: "spacetimedb/src/index.ts"
      to: "src/module_bindings/ability_template_type.ts"
      via: "spacetime generate"
      pattern: "combatState.*string"
    - from: "src/composables/useHotbar.ts"
      to: "abilityLookup"
      via: "slot.abilityKey -> abilityLookup.value.get() -> combatState field"
      pattern: "combatState"
---

<objective>
Generalize combat state validation for all abilities by adding a `combatState` field to the AbilityTemplate table, replacing hardcoded ability key lists on both server and client.

Purpose: Eliminate the maintenance burden of hardcoded `PET_SUMMON_KEYS`, `OUT_OF_COMBAT_ONLY_KEYS` (client) and `petSummons` (server) sets. New abilities automatically get correct combat state guards from their data without code changes.

Output: AbilityTemplate has a `combatState` field ('any', 'combat_only', 'out_of_combat_only'). Server and client both read this field instead of maintaining parallel hardcoded key sets.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/index.ts (AbilityTemplate table at line ~496, ensureAbilityTemplates at line ~3812)
@spacetimedb/src/reducers/items.ts (use_ability reducer at line ~356, petSummons set at line ~364)
@spacetimedb/src/data/ability_catalog.ts (ABILITIES catalog - does NOT need modification)
@src/composables/useHotbar.ts (PET_SUMMON_KEYS at line ~45, OUT_OF_COMBAT_ONLY_KEYS at line ~52, onHotbarClick at line ~281)
@src/module_bindings/ability_template_type.ts (generated type - will be regenerated)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add combatState column to AbilityTemplate and populate it in ensureAbilityTemplates</name>
  <files>spacetimedb/src/index.ts, spacetimedb/src/reducers/items.ts</files>
  <action>
**1. AbilityTemplate table (spacetimedb/src/index.ts ~line 496):**
Add `combatState: t.string()` column to the AbilityTemplate table definition, after `kind`.

**2. ensureAbilityTemplates (spacetimedb/src/index.ts ~line 3812):**
- Add a `combatOnlyKeys` set containing the 4 pet summon keys: `'shaman_spirit_wolf'`, `'necromancer_bone_servant'`, `'beastmaster_call_beast'`, `'summoner_earth_familiar'`. Place it next to the existing `utilityKeys` set.
- Add an `outOfCombatOnlyKeys` set containing: `'druid_natures_mark'`. Place it next to `combatOnlyKeys`.
- Create a helper: `const combatStateFor = (key: string) => combatOnlyKeys.has(key) ? 'combat_only' : outOfCombatOnlyKeys.has(key) ? 'out_of_combat_only' : 'any';`
- In the update path (~line 3939-3962), add `combatState: combatStateFor(key)` to both the `ctx.db.abilityTemplate.id.update()` call and the `seenByKey.set()` call (alongside existing fields).
- In the insert path (~line 3965-3977), add `combatState: combatStateFor(key)` to the `ctx.db.abilityTemplate.insert()` call.

**3. use_ability reducer (spacetimedb/src/reducers/items.ts ~line 356):**
- After the cooldown check (~line 382) and before the `castMicros` line (~line 383), look up the ability template to get its combatState:
  ```
  const abilityRow = [...ctx.db.abilityTemplate.by_key.filter(abilityKey)][0];
  const combatState = abilityRow?.combatState ?? 'any';
  ```
- Replace the hardcoded `petSummons` set and its guard (lines 364-394) with a generalized check:
  ```
  if (combatState === 'combat_only' && !combatId) {
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability', 'This ability can only be used in combat.');
    return;
  }
  if (combatState === 'out_of_combat_only' && combatId) {
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability', 'This ability cannot be used in combat.');
    return;
  }
  ```
- DELETE the `const petSummons = new Set([...])` block (lines 364-369) entirely.
- DELETE the `if (!combatId && petSummons.has(abilityKey))` guard block (lines 385-394) entirely.
- Note: the Nature's Mark in-combat check inside `executeAbilityAction` (index.ts ~line 2608-2610) can remain as a defense-in-depth check, OR be removed since use_ability now handles it generically. Prefer keeping it as defense-in-depth.

**4. Publish and regenerate bindings:**
After code changes, run:
```bash
spacetime publish uwr --clear-database -y --project-path spacetimedb
spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb
```
  </action>
  <verify>
- `npx tsc --noEmit --project spacetimedb/tsconfig.json` passes (or module compiles via spacetime publish)
- `spacetime publish` succeeds
- `spacetime generate` succeeds
- `src/module_bindings/ability_template_type.ts` now contains `combatState: __t.string()`
- `spacetime logs uwr` shows no errors after publish
  </verify>
  <done>AbilityTemplate table has combatState column populated with 'combat_only' for pet summons, 'out_of_combat_only' for Nature's Mark, and 'any' for all others. Server use_ability reducer uses combatState from the template instead of hardcoded petSummons set. Client bindings regenerated with the new field.</done>
</task>

<task type="auto">
  <name>Task 2: Refactor client useHotbar to use combatState from ability data</name>
  <files>src/composables/useHotbar.ts</files>
  <action>
**1. Delete hardcoded sets (lines 45-54):**
Remove the entire `PET_SUMMON_KEYS` constant and the entire `OUT_OF_COMBAT_ONLY_KEYS` constant.

**2. Refactor onHotbarClick (line ~281):**
Replace the two hardcoded guards:
```typescript
// DELETE these two lines:
if (!activeCombat.value && PET_SUMMON_KEYS.has(slot.abilityKey)) return;
if (activeCombat.value && OUT_OF_COMBAT_ONLY_KEYS.has(slot.abilityKey)) return;
```

With a single data-driven guard using the ability template lookup that already exists:
```typescript
const ability = abilityLookup.value.get(slot.abilityKey);
const combatState = ability?.combatState ?? 'any';
if (combatState === 'combat_only' && !activeCombat.value) return;
if (combatState === 'out_of_combat_only' && activeCombat.value) return;
```

Place this AFTER the existing `canActInCombat` guard (line 288) and BEFORE `runPrediction()`.

Note: The `ability` variable here may shadow a later lookup for `slot.kind !== 'utility'` — check that the existing `slot.kind` reference on line 288 still works (it reads from `HotbarDisplaySlot.kind` which is already resolved, so no conflict).

**3. Verify AbilityTemplateRow type:**
After regeneration (Task 1), the `AbilityTemplateRow` type imported from `module_bindings` should include `combatState: string`. Confirm the import already covers this (it imports `AbilityTemplateRow` at line 5).
  </action>
  <verify>
- `npx tsc --noEmit` passes with no type errors
- `PET_SUMMON_KEYS` does not appear in useHotbar.ts
- `OUT_OF_COMBAT_ONLY_KEYS` does not appear in useHotbar.ts
- `combatState` appears in the onHotbarClick guard logic
- Build succeeds: `npx vite build`
  </verify>
  <done>Client-side combat state guards are fully data-driven. No hardcoded ability key sets remain. Any new ability with combatState='combat_only' or 'out_of_combat_only' will automatically be guarded on the client without code changes.</done>
</task>

</tasks>

<verification>
1. `grep -r "PET_SUMMON_KEYS\|OUT_OF_COMBAT_ONLY_KEYS" src/` returns no matches
2. `grep -r "petSummons" spacetimedb/src/reducers/items.ts` returns no matches
3. `grep "combatState" spacetimedb/src/index.ts` shows the field in AbilityTemplate and ensureAbilityTemplates
4. `grep "combatState" src/composables/useHotbar.ts` shows the data-driven guard
5. `grep "combatState" src/module_bindings/ability_template_type.ts` confirms the generated binding includes it
6. `npx tsc --noEmit` passes
7. `npx vite build` succeeds
</verification>

<success_criteria>
- AbilityTemplate table has combatState column with values: 'any' (default), 'combat_only' (4 pet summons), 'out_of_combat_only' (Nature's Mark)
- Server use_ability reducer reads combatState from ability template data, not hardcoded set
- Client onHotbarClick reads combatState from abilityLookup, not hardcoded sets
- Zero hardcoded ability key sets remain for combat state validation (PET_SUMMON_KEYS, OUT_OF_COMBAT_ONLY_KEYS, petSummons all deleted)
- All existing ability behavior preserved (pet summons still require combat, Nature's Mark still requires out-of-combat)
- No type errors, build succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/6-refactor-cooldown-guards-generalize-comb/6-SUMMARY.md`
</output>
