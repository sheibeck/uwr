---
phase: quick-93
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/reducers/corpse.ts
  - spacetimedb/src/helpers/corpse.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/data/abilities/cleric_abilities.ts
  - spacetimedb/src/data/abilities/necromancer_abilities.ts
  - spacetimedb/src/data/abilities/summoner_abilities.ts
autonomous: true
must_haves:
  truths:
    - "PendingResurrect and PendingCorpseSummon tables are replaced by a single PendingSpellCast table"
    - "Resurrect remains on Cleric at level 6 but Corpse Summon moves to Necromancer and Summoner at level 6"
    - "Neither ability has a cooldown (cooldownSeconds: 0n)"
    - "Resurrect costs 50 mana and Corpse Summon costs 60 mana (flat, not formula-based)"
    - "Both abilities have 10-second cast time (castSeconds: 10n)"
    - "All 6 reducers (initiate/accept/decline for resurrect and corpse summon) work with PendingSpellCast table"
  artifacts:
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "PendingSpellCast table replacing PendingResurrect and PendingCorpseSummon"
      contains: "PendingSpellCast"
    - path: "spacetimedb/src/reducers/corpse.ts"
      provides: "Updated reducers using PendingSpellCast, new mana costs, no cooldowns, class checks for necromancer/summoner"
    - path: "spacetimedb/src/data/abilities/necromancer_abilities.ts"
      provides: "necromancer_corpse_summon ability at level 6"
    - path: "spacetimedb/src/data/abilities/summoner_abilities.ts"
      provides: "summoner_corpse_summon ability at level 6"
  key_links:
    - from: "spacetimedb/src/reducers/corpse.ts"
      to: "spacetimedb/src/schema/tables.ts"
      via: "ctx.db.pendingSpellCast"
      pattern: "pendingSpellCast"
    - from: "spacetimedb/src/index.ts"
      to: "spacetimedb/src/schema/tables.ts"
      via: "PendingSpellCast import and schema registration"
      pattern: "PendingSpellCast"
---

<objective>
Refactor resurrection and corpse summon spell system: merge two pending tables into one, move Corpse Summon from Cleric to Necromancer/Summoner, remove cooldowns, add heavy mana costs and 10s cast times.

Purpose: Simplify the pending spell architecture (two near-identical tables into one), rebalance class abilities so Cleric keeps Resurrect but Corpse Summon becomes a Necromancer/Summoner ability, and make both abilities resource-gated (mana) rather than cooldown-gated.

Output: Updated schema, reducers, helpers, and ability catalog entries ready for publish + generate.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/schema/tables.ts
@spacetimedb/src/reducers/corpse.ts
@spacetimedb/src/helpers/corpse.ts
@spacetimedb/src/index.ts
@spacetimedb/src/data/abilities/cleric_abilities.ts
@spacetimedb/src/data/abilities/necromancer_abilities.ts
@spacetimedb/src/data/abilities/summoner_abilities.ts
@spacetimedb/src/data/ability_catalog.ts (first 36 lines - AbilityMetadata interface)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Merge PendingResurrect + PendingCorpseSummon into PendingSpellCast and update ability catalog</name>
  <files>
    spacetimedb/src/schema/tables.ts
    spacetimedb/src/data/abilities/cleric_abilities.ts
    spacetimedb/src/data/abilities/necromancer_abilities.ts
    spacetimedb/src/data/abilities/summoner_abilities.ts
    spacetimedb/src/index.ts
  </files>
  <action>
**In `spacetimedb/src/schema/tables.ts`:**
1. Remove the `PendingResurrect` table definition (lines ~1342-1358).
2. Remove the `PendingCorpseSummon` table definition (lines ~1360-1375).
3. Add a new `PendingSpellCast` table that unifies both:
   ```typescript
   export const PendingSpellCast = table(
     {
       name: 'pending_spell_cast',
       public: true,
       indexes: [
         { name: 'by_target', algorithm: 'btree', columns: ['targetCharacterId'] },
         { name: 'by_caster', algorithm: 'btree', columns: ['casterCharacterId'] },
       ],
     },
     {
       id: t.u64().primaryKey().autoInc(),
       spellType: t.string(),  // 'resurrect' | 'corpse_summon'
       casterCharacterId: t.u64(),
       targetCharacterId: t.u64(),
       corpseId: t.u64().optional(),  // Only set for resurrect
       createdAtMicros: t.u64(),
     }
   );
   ```
4. In the `schema(...)` call at the bottom, replace `PendingResurrect, PendingCorpseSummon` with `PendingSpellCast`.

**In `spacetimedb/src/data/abilities/cleric_abilities.ts`:**
1. Update `cleric_resurrect`: set `cooldownSeconds: 0n`, `castSeconds: 10n`. Update description to mention 50 mana cost and 10s cast time.
2. Remove `cleric_corpse_summon` entirely from the cleric abilities.

**In `spacetimedb/src/data/abilities/necromancer_abilities.ts`:**
1. Add `necromancer_corpse_summon` at level 6:
   ```typescript
   necromancer_corpse_summon: {
     name: 'Corpse Summon',
     description: "Summons all of a target character's corpses to the caster's location, merging them into one. The target must confirm before the summon proceeds. Costs 60 mana.",
     className: 'necromancer',
     resource: 'mana',
     level: 6n,
     power: 0n,
     cooldownSeconds: 0n,
     castSeconds: 10n,
     damageType: 'none' as DamageType,
     combatState: 'out_of_combat',
   },
   ```

**In `spacetimedb/src/data/abilities/summoner_abilities.ts`:**
1. Add `summoner_corpse_summon` at level 6 (identical structure to necromancer but with className 'summoner' and key `summoner_corpse_summon`).

**In `spacetimedb/src/index.ts`:**
1. In the imports from `./schema/tables`, replace `PendingResurrect, PendingCorpseSummon` with `PendingSpellCast`.
2. In the `reducerDeps` object, replace `PendingResurrect` and `PendingCorpseSummon` properties with `PendingSpellCast`.
3. Remove the imports of `PendingResurrect` and `PendingCorpseSummon` from `./helpers/corpse` if they were imported there (they are not - they come from tables).
  </action>
  <verify>Run `grep -r "PendingResurrect\|PendingCorpseSummon" spacetimedb/src/` and confirm zero results (only PendingSpellCast should exist). Verify `PendingSpellCast` appears in tables.ts schema call and index.ts imports/deps.</verify>
  <done>PendingResurrect and PendingCorpseSummon tables fully replaced by PendingSpellCast. Cleric loses corpse_summon, Necromancer and Summoner gain it at level 6. Both abilities have 0 cooldown and 10s cast time in catalog.</done>
</task>

<task type="auto">
  <name>Task 2: Update corpse reducers to use PendingSpellCast with new mana costs and no cooldowns</name>
  <files>
    spacetimedb/src/reducers/corpse.ts
  </files>
  <action>
**Refactor all 6 spell-cast reducers to use `PendingSpellCast` instead of the two separate tables.**

The `deps` destructuring at the top should replace `PendingResurrect` and `PendingCorpseSummon` with `PendingSpellCast` (though deps are only used for type reference and passed through - the actual table access is via `ctx.db`).

**`initiate_resurrect` reducer:**
1. Replace `ctx.db.pendingResurrect` with `ctx.db.pendingSpellCast` throughout.
2. Change mana cost from formula `4n + 6n * 2n + 0n` (=16) to flat `50n`.
3. Change class check to: `caster.className !== 'cleric' || caster.level < 6n` (keep as-is, already correct).
4. When inserting, use: `ctx.db.pendingSpellCast.insert({ id: 0n, spellType: 'resurrect', casterCharacterId: caster.id, targetCharacterId: target.id, corpseId: corpse.id, createdAtMicros: nowMicros })`.
5. For expired cleanup, iterate `ctx.db.pendingSpellCast.iter()` and filter by timeout.
6. For duplicate check, iterate `ctx.db.pendingSpellCast.by_target.filter(target.id)` and check `pending.spellType === 'resurrect'`.

**`accept_resurrect` reducer:**
1. Replace `ctx.db.pendingResurrect` with `ctx.db.pendingSpellCast`.
2. After finding the pending row, verify `pending.spellType === 'resurrect'` (throw SenderError if not).
3. Change mana cost to flat `50n`.
4. Remove the cooldown insertion block entirely (lines 231-240 in current file). No cooldown for resurrect.

**`decline_resurrect` reducer:**
1. Replace `ctx.db.pendingResurrect` with `ctx.db.pendingSpellCast`.
2. After finding, verify `pending.spellType === 'resurrect'`.

**`initiate_corpse_summon` reducer:**
1. Replace `ctx.db.pendingCorpseSummon` with `ctx.db.pendingSpellCast`.
2. Change mana cost from formula `4n + 7n * 2n + 0n` (=18) to flat `60n`.
3. Change class/level check from `caster.className !== 'cleric' || caster.level < 7n` to:
   ```typescript
   const validCorpseSummonClass = caster.className === 'necromancer' || caster.className === 'summoner';
   if (!validCorpseSummonClass || caster.level < 6n) {
     throw new SenderError('You must be a level 6+ necromancer or summoner to summon corpses');
   }
   ```
4. Change ability template lookup from `cleric_corpse_summon` to dynamically resolve: `${caster.className}_corpse_summon` for the correct class-specific ability key.
5. Insert with `spellType: 'corpse_summon'`, `corpseId: undefined` (optional field, not needed for summon).
6. For duplicate check, filter by_target and check `pending.spellType === 'corpse_summon'`.

**`accept_corpse_summon` reducer:**
1. Replace `ctx.db.pendingCorpseSummon` with `ctx.db.pendingSpellCast`.
2. After finding, verify `pending.spellType === 'corpse_summon'`.
3. Change mana cost to flat `60n`.
4. Remove the cooldown insertion block entirely (lines 374-383 in current file). No cooldown for corpse summon.

**`decline_corpse_summon` reducer:**
1. Replace `ctx.db.pendingCorpseSummon` with `ctx.db.pendingSpellCast`.
2. After finding, verify `pending.spellType === 'corpse_summon'`.

**Also fix the existing bug:** The current cooldown inserts use `expiresAt` but AbilityCooldown table field is `readyAtMicros`. This becomes moot since we are removing cooldown inserts entirely.
  </action>
  <verify>Read through the final corpse.ts file and confirm: (1) zero references to `pendingResurrect` or `pendingCorpseSummon`, (2) all use `pendingSpellCast`, (3) resurrect costs 50n mana, (4) corpse summon costs 60n mana, (5) no abilityCooldown.insert calls remain, (6) corpse summon class check allows necromancer or summoner at level 6+.</verify>
  <done>All 6 reducers use PendingSpellCast table. Resurrect: 50 mana, cleric level 6+, no cooldown. Corpse Summon: 60 mana, necromancer/summoner level 6+, no cooldown. Both spellType-gated for safety.</done>
</task>

</tasks>

<verification>
1. `grep -r "PendingResurrect\|PendingCorpseSummon\|pending_resurrect\|pending_corpse_summon" spacetimedb/src/` returns zero matches (only PendingSpellCast/pending_spell_cast).
2. `grep "cooldownSeconds: 0n" spacetimedb/src/data/abilities/cleric_abilities.ts` shows cleric_resurrect has 0n cooldown.
3. `grep "castSeconds: 10n" spacetimedb/src/data/abilities/cleric_abilities.ts` shows 10s cast time.
4. `grep "corpse_summon" spacetimedb/src/data/abilities/necromancer_abilities.ts` shows necromancer_corpse_summon exists.
5. `grep "corpse_summon" spacetimedb/src/data/abilities/summoner_abilities.ts` shows summoner_corpse_summon exists.
6. `grep "corpse_summon" spacetimedb/src/data/abilities/cleric_abilities.ts` returns nothing (removed from cleric).
7. `grep "abilityCooldown.insert" spacetimedb/src/reducers/corpse.ts` returns nothing (no cooldowns).
8. `grep "50n" spacetimedb/src/reducers/corpse.ts` shows resurrect mana cost.
9. `grep "60n" spacetimedb/src/reducers/corpse.ts` shows corpse summon mana cost.
</verification>

<success_criteria>
- PendingResurrect and PendingCorpseSummon tables fully replaced by unified PendingSpellCast table with spellType discriminator
- Resurrect: Cleric level 6, 50 mana, 10s cast, no cooldown
- Corpse Summon: Necromancer or Summoner level 6, 60 mana, 10s cast, no cooldown
- cleric_corpse_summon removed from cleric abilities
- necromancer_corpse_summon and summoner_corpse_summon added at level 6
- All reducer logic works with new table structure
- No stale references to old table names anywhere in spacetimedb/src/
</success_criteria>

<output>
After completion, create `.planning/quick/93-refactor-resurrection-corpse-summon-merg/93-SUMMARY.md`
</output>
