---
phase: quick-222
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/combat_scaling.ts
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [QUICK-222]

must_haves:
  truths:
    - "When a summoner summons a pet mid-combat, only the targeted enemy receives initial aggro — not all enemies"
    - "When combat starts and a pre-summoned pet is brought in, only the single initial enemy receives pet aggro"
    - "The summoner's own threat multiplier is 75n (0.75x), causing summoners to be targeted more often relative to the pet"
  artifacts:
    - path: "spacetimedb/src/data/combat_scaling.ts"
      provides: "SUMMONER_THREAT_MULTIPLIER constant"
      contains: "SUMMONER_THREAT_MULTIPLIER = 75n"
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "summonPet — single-target initial aggro"
      contains: "enemy!.id"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "startCombatForSpawn — single-target initial aggro"
  key_links:
    - from: "spacetimedb/src/helpers/combat.ts summonPet"
      to: "ctx.db.aggroEntry.insert"
      via: "single enemy! reference, not loop over all enemies"
      pattern: "enemyId: enemy\\.id"
    - from: "spacetimedb/src/reducers/combat.ts startCombatForSpawn"
      to: "ctx.db.aggroEntry.insert"
      via: "one insert against the single combat enemy, not a loop"
---

<objective>
Revise summoner pet aggro mechanics in two ways:
1. Pet initial taunt becomes single-target only (no AoE aggro against all enemies).
2. Summoner's own threat multiplier raised from 25n to 75n so summoners are targeted more often.

Purpose: Summoner pets should taunt only what they are attacking, not every enemy in combat. Simultaneously, the summoner themselves should be at meaningful risk (75% threat generation) to create tension and tactical decisions around protecting the summoner.
Output: Updated constants and aggro-insertion logic in three files. No schema changes, no bindings regeneration required.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/data/combat_scaling.ts
@spacetimedb/src/helpers/combat.ts
@spacetimedb/src/reducers/combat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Raise SUMMONER_THREAT_MULTIPLIER from 25n to 75n</name>
  <files>spacetimedb/src/data/combat_scaling.ts</files>
  <action>
    At line 118, change the constant value and update its JSDoc comment:

    OLD:
    ```
    /**
     * Summoner threat multiplier (25n = 0.25x on 100n scale).
     * Summoners rely on pets as their primary combat presence — their own spells
     * should not pull aggro off pets.
     */
    export const SUMMONER_THREAT_MULTIPLIER = 25n;
    ```

    NEW:
    ```
    /**
     * Summoner threat multiplier (75n = 0.75x on 100n scale).
     * Summoners generate significant threat themselves so they are at meaningful risk
     * in combat — pets handle single-target taunt but the summoner is far from safe.
     */
    export const SUMMONER_THREAT_MULTIPLIER = 75n;
    ```

    No other changes to this file.
  </action>
  <verify>
    grep -n "SUMMONER_THREAT_MULTIPLIER" spacetimedb/src/data/combat_scaling.ts
    — must show `= 75n`
  </verify>
  <done>SUMMONER_THREAT_MULTIPLIER is 75n with updated comment explaining the design intent.</done>
</task>

<task type="auto">
  <name>Task 2: Change pet initial aggro to single-target in summonPet and startCombatForSpawn</name>
  <files>spacetimedb/src/helpers/combat.ts, spacetimedb/src/reducers/combat.ts</files>
  <action>
    TWO LOCATIONS to fix:

    --- helpers/combat.ts (lines 459-473) ---

    The `summonPet` function currently loops over all enemies in combat and inserts an aggroEntry for each one. The `enemy` variable is already in scope (used on line 456 for `targetEnemyId: enemy!.id`). Replace the loop with a single insert against that one target.

    OLD (lines 459-473):
    ```typescript
    if (inActiveCombat && character.className?.toLowerCase() === 'summoner') {
      // Summoner pets are the primary combat presence — give them immediate aggro
      // so they draw enemy attention before the summoner's own threat builds up.
      for (const en of ctx.db.combatEnemy.by_combat.filter(combatId)) {
        if (en.currentHp <= 0n) continue;
        ctx.db.aggroEntry.insert({
          id: 0n,
          combatId,
          enemyId: en.id,
          characterId: character.id,
          petId: pet.id,
          value: SUMMONER_PET_INITIAL_AGGRO,
        });
      }
    }
    ```

    NEW:
    ```typescript
    if (inActiveCombat && character.className?.toLowerCase() === 'summoner') {
      // Single-target taunt: only generate initial aggro against the targeted enemy,
      // not an AoE taunt against every enemy in combat.
      ctx.db.aggroEntry.insert({
        id: 0n,
        combatId,
        enemyId: enemy!.id,
        characterId: character.id,
        petId: pet.id,
        value: SUMMONER_PET_INITIAL_AGGRO,
      });
    }
    ```

    --- reducers/combat.ts (lines 198-210 inside startCombatForSpawn) ---

    When combat starts and pre-summoned pets are brought in, the same loop assigns aggro against all enemies. At combat start there is exactly one initial enemy (the spawn being fought), so the loop body always ran once anyway — but the intent is now explicit: only taunt the primary target. Since `spawnToUse` is the enemy being fought, use `spawnToUse` to find the inserted enemy row, OR since there is only one enemy at this point, use the first (and only) enemy from the filter.

    OLD (lines 198-210):
    ```typescript
    if (p.className?.toLowerCase() === 'summoner') {
      for (const en of ctx.db.combatEnemy.by_combat.filter(combat.id)) {
        if (en.currentHp <= 0n) continue;
        ctx.db.aggroEntry.insert({
          id: 0n,
          combatId: combat.id,
          enemyId: en.id,
          characterId: p.id,
          petId: ap.id,
          value: SUMMONER_PET_INITIAL_AGGRO,
        });
      }
    }
    ```

    NEW:
    ```typescript
    if (p.className?.toLowerCase() === 'summoner') {
      // Single-target taunt: only generate initial aggro against the primary target
      // (the spawn combat was initiated against), not every enemy in the encounter.
      const primaryEnemy = [...ctx.db.combatEnemy.by_combat.filter(combat.id)]
        .find(en => en.spawnId === spawnToUse.id && en.currentHp > 0n);
      if (primaryEnemy) {
        ctx.db.aggroEntry.insert({
          id: 0n,
          combatId: combat.id,
          enemyId: primaryEnemy.id,
          characterId: p.id,
          petId: ap.id,
          value: SUMMONER_PET_INITIAL_AGGRO,
        });
      }
    }
    ```

    Note on `spawnToUse.id` — `addEnemyToCombat` is called on line 166 with `spawnToUse`, which creates a `combatEnemy` row storing `spawnId`. Check the `combatEnemy` schema to confirm the field name is `spawnId`. If the field name differs (e.g., `enemyTemplateId` or `npcId`), use the correct field name from the schema — do not guess. Grep `spacetimedb/src/schema/tables.ts` for the combatEnemy table definition if unsure.
  </action>
  <verify>
    1. grep -n "for.*combatEnemy.*by_combat" spacetimedb/src/helpers/combat.ts
       — should NOT find the old loop inside the summonPet block (lines ~459-473)
    2. grep -n "for.*combatEnemy.*by_combat" spacetimedb/src/reducers/combat.ts
       — the startCombatForSpawn block (lines ~198-210) should no longer have that loop
    3. grep -n "enemy!.id\|primaryEnemy" spacetimedb/src/helpers/combat.ts
       — should show the single-target insert using enemy!.id
    4. grep -n "primaryEnemy" spacetimedb/src/reducers/combat.ts
       — should show the primaryEnemy find + single insert
    5. spacetime publish uwr --project-path C:/projects/uwr/spacetimedb
       — must publish without TypeScript errors
  </verify>
  <done>
    Pet initial aggro is inserted once against the specific target only. The loop-over-all-enemies is gone from both summonPet (helpers/combat.ts) and startCombatForSpawn (reducers/combat.ts). Module publishes cleanly to local.
  </done>
</task>

</tasks>

<verification>
After both tasks:
- SUMMONER_THREAT_MULTIPLIER = 75n in combat_scaling.ts
- summonPet in helpers/combat.ts inserts one aggroEntry using enemy!.id (no loop)
- startCombatForSpawn in reducers/combat.ts inserts one aggroEntry against the primary spawn enemy (no loop)
- `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` completes without errors
</verification>

<success_criteria>
- Summoner threat multiplier is 75n — summoners will be targeted ~75% as often as normal classes, creating meaningful risk
- Summoner pet taunts only its current target on summon, not every enemy in the encounter
- No TypeScript compilation errors, module publishes to local successfully
</success_criteria>

<output>
After completion, create `.planning/quick/222-revisit-summoner-aggro-mechanics-pet-sin/222-SUMMARY.md`
</output>
