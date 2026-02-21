---
phase: quick-232
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/characters.ts
autonomous: true
requirements: [QUICK-232]

must_haves:
  truths:
    - "create_character no longer computes maxHp, maxMana, hitChance, armorClass etc inline"
    - "create_character calls recomputeCharacterDerived after insert"
    - "New characters start with hp = maxHp, mana = maxMana, stamina = maxStamina"
    - "Module publishes without errors"
  artifacts:
    - path: "spacetimedb/src/reducers/characters.ts"
      provides: "create_character using recomputeCharacterDerived as single source of truth"
      contains: "recomputeCharacterDerived(ctx, character)"
---

<objective>
Consolidate derived character stat computation into the single `recomputeCharacterDerived` function.

Root cause of the original mana pool bug (quick-231): `create_character` duplicated the derived stat calculation inline instead of calling `recomputeCharacterDerived`. Any future changes to the formula (like HYBRID_MANA_MULTIPLIER in quick-229) silently miss character creation.

The fix: strip the inline derived-stat calculations from `create_character`, insert the character with placeholder zeros for derived fields, call `recomputeCharacterDerived(ctx, character)`, then do one final update to set current hp/mana/stamina = their respective maximums (new characters start full).

`recomputeCharacterDerived` is already imported and in `reducerDeps` (index.ts line 484) — only `characters.ts` needs changes.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/reducers/characters.ts
@spacetimedb/src/helpers/character.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Simplify create_character to use recomputeCharacterDerived</name>
  <files>spacetimedb/src/reducers/characters.ts</files>
  <action>
**Step 1: Add `recomputeCharacterDerived` to the deps destructuring**

Find the block (around line 78-104) where deps are destructured. It currently contains things like `BASE_MANA`, `MANA_MULTIPLIER`, `normalizeClassName`, etc. Add `recomputeCharacterDerived` to that destructuring list.

**Step 2: Rewrite the create_character derived stat section**

The current code (lines ~261-310) computes manaStat, maxHp, maxMana, manaMultiplier, baseMaxStamina, armorClass, hitChance, dodgeChance, parryChance, critMelee/Ranged/Divine/Arcane, perception, search, ccPower, vendorBuyMod, vendorSellMod inline, then inserts them in the character row.

Replace it so that:
1. Only the identity and base stats remain in the insert (no derived stat computation)
2. Derived fields in the insert use placeholder 0n
3. After insert, call `recomputeCharacterDerived(ctx, character)`
4. Read back the updated character from the DB
5. Update hp/mana/stamina to their respective maximums

Here is the exact replacement for lines ~261 through the character insert (~line 331):

**REMOVE** these computations (they are now handled by recomputeCharacterDerived):
```typescript
const manaStat = manaStatForClass(className, baseStats);
const maxHp = BASE_HP + baseStats.str * HP_STR_MULTIPLIER + (racial.racialMaxHp || 0n);
const manaMultiplier = HYBRID_MANA_CLASSES.has(normalizeClassName(className)) ? HYBRID_MANA_MULTIPLIER : MANA_MULTIPLIER;
const maxMana = usesMana(className) ? BASE_MANA + manaStat * manaMultiplier + (racial.racialMaxMana || 0n) : 0n;
const baseMaxStamina = 20n + (racial.racialMaxStamina || 0n);
const armorClass = baseArmorForClass(className) + (racial.racialArmorBonus || 0n);
```

**KEEP** these (they provide base identity data needed before any recompute):
```typescript
const classStats = computeBaseStats(className, 1n);
const racial = computeRacialContributions(raceRow);
const baseStats = {
  str: classStats.str + racial.str,
  dex: classStats.dex + racial.dex,
  cha: classStats.cha + racial.cha,
  wis: classStats.wis + racial.wis,
  int: classStats.int + racial.int,
};
```

**CHANGE** the character insert to use 0n for all derived stat fields, and remove the derived fields from the argument (they'll be set by recomputeCharacterDerived):
```typescript
const character = ctx.db.character.insert({
  id: 0n,
  ownerUserId: userId,
  name: trimmed,
  race: raceRow.name,
  className: className.trim(),
  level: 1n,
  xp: 0n,
  gold: 0n,
  locationId: startingLocation.id,
  boundLocationId: startingLocation.id,
  // base stats — identity data, needed for recomputeCharacterDerived
  str: baseStats.str,
  dex: baseStats.dex,
  cha: baseStats.cha,
  wis: baseStats.wis,
  int: baseStats.int,
  // derived stats — placeholder zeros, recomputeCharacterDerived will set these
  hp: 0n,
  maxHp: 0n,
  mana: 0n,
  maxMana: 0n,
  stamina: 0n,
  maxStamina: 0n,
  hitChance: 0n,
  dodgeChance: 0n,
  parryChance: 0n,
  critMelee: 0n,
  critRanged: 0n,
  critDivine: 0n,
  critArcane: 0n,
  armorClass: 0n,
  perception: 0n,
  search: 0n,
  ccPower: 0n,
  vendorBuyMod: 0n,
  vendorSellMod: 0n,
  createdAt: ctx.timestamp,
  // racial columns (identity data)
  racialSpellDamage: racial.racialSpellDamage > 0n ? racial.racialSpellDamage : undefined,
  racialPhysDamage: racial.racialPhysDamage > 0n ? racial.racialPhysDamage : undefined,
  racialMaxHp: racial.racialMaxHp > 0n ? racial.racialMaxHp : undefined,
  racialMaxMana: racial.racialMaxMana > 0n ? racial.racialMaxMana : undefined,
  racialManaRegen: racial.racialManaRegen > 0n ? racial.racialManaRegen : undefined,
  racialStaminaRegen: racial.racialStaminaRegen > 0n ? racial.racialStaminaRegen : undefined,
  racialCritBonus: racial.racialCritBonus > 0n ? racial.racialCritBonus : undefined,
  racialArmorBonus: racial.racialArmorBonus > 0n ? racial.racialArmorBonus : undefined,
  racialDodgeBonus: racial.racialDodgeBonus > 0n ? racial.racialDodgeBonus : undefined,
  racialHpRegen: racial.racialHpRegen > 0n ? racial.racialHpRegen : undefined,
  racialMaxStamina: racial.racialMaxStamina > 0n ? racial.racialMaxStamina : undefined,
  racialTravelCostIncrease: racial.racialTravelCostIncrease > 0n ? racial.racialTravelCostIncrease : undefined,
  racialTravelCostDiscount: racial.racialTravelCostDiscount > 0n ? racial.racialTravelCostDiscount : undefined,
  racialHitBonus: racial.racialHitBonus > 0n ? racial.racialHitBonus : undefined,
  racialParryBonus: racial.racialParryBonus > 0n ? racial.racialParryBonus : undefined,
  racialFactionBonus: racial.racialFactionBonus > 0n ? racial.racialFactionBonus : undefined,
  racialMagicResist: racial.racialMagicResist > 0n ? racial.racialMagicResist : undefined,
  racialPerceptionBonus: racial.racialPerceptionBonus > 0n ? racial.racialPerceptionBonus : undefined,
  racialLootBonus: racial.racialLootBonus > 0n ? racial.racialLootBonus : undefined,
});

// Compute all derived stats (maxHp, maxMana, maxStamina, hitChance, armorClass, etc.)
// using the single source of truth — no duplication of formulas here.
recomputeCharacterDerived(ctx, character);

// New characters start at full hp/mana/stamina — read back the recomputed max values.
const recomputed = ctx.db.character.id.find(character.id);
if (recomputed) {
  ctx.db.character.id.update({
    ...recomputed,
    hp: recomputed.maxHp,
    mana: recomputed.maxMana,
    stamina: recomputed.maxStamina,
  });
}
```

**Step 3: Clean up unused imports from deps destructuring**

After the above change, the following are no longer used inside `create_character` (though they may be used elsewhere in the same `registerCharacterReducers` function — check before removing):
- `manaStatForClass` — only used if still referenced elsewhere in characters.ts
- `MANA_MULTIPLIER`, `HYBRID_MANA_MULTIPLIER`, `HYBRID_MANA_CLASSES`, `normalizeClassName` — only used in the now-removed mana formula
- `usesMana`, `BASE_MANA`, `BASE_HP`, `HP_STR_MULTIPLIER`, `baseArmorForClass` — check if used elsewhere in the file

Search for each constant in characters.ts before removing from destructuring. If a constant appears ONLY in the now-deleted section, remove it from the destructuring list. If it appears elsewhere in the file, keep it.
  </action>
  <verify>
1. grep -n "recomputeCharacterDerived" spacetimedb/src/reducers/characters.ts
   Expected: 2 lines — one in deps destructuring, one call after insert

2. grep -n "manaMultiplier\|HYBRID_MANA_CLASSES\|manaStat = manaStatForClass" spacetimedb/src/reducers/characters.ts
   Expected: no lines (those are removed)

3. spacetime publish uwr --project-path C:/projects/uwr/spacetimedb 2>&1 | tail -5
   Expected: clean publish
  </verify>
  <done>
create_character no longer duplicates derived stat formulas. It inserts with 0n placeholders, calls recomputeCharacterDerived, then full-heals the new character. All derived stat math lives exclusively in recomputeCharacterDerived.
  </done>
</task>

</tasks>

<verification>
After task completes:
1. spacetime publish uwr --project-path C:/projects/uwr/spacetimedb — clean build
2. grep -c "manaMultiplier\|maxHp = BASE_HP\|maxMana = usesMana" spacetimedb/src/reducers/characters.ts — should be 0
3. grep -n "recomputeCharacterDerived" spacetimedb/src/reducers/characters.ts — should appear in deps and in the call
</verification>

<success_criteria>
- No duplicate stat computation in create_character
- New characters created with correct maxHp/maxMana/maxStamina (via recomputeCharacterDerived)
- New characters start at full hp/mana/stamina
- Module publishes without TypeScript errors
- Any future change to recomputeCharacterDerived automatically applies to character creation
</success_criteria>

<output>
After completion, create `.planning/quick/232-consolidate-maxmana-and-derived-stat-cal/232-SUMMARY.md`
</output>
