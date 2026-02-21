---
phase: quick-229
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/class_stats.ts
  - spacetimedb/src/helpers/character.ts
  - spacetimedb/src/data/abilities/paladin_abilities.ts
  - spacetimedb/src/data/abilities/reaver_abilities.ts
  - spacetimedb/src/data/abilities/cleric_abilities.ts
  - spacetimedb/src/data/abilities/wizard_abilities.ts
  - spacetimedb/src/data/abilities/druid_abilities.ts
  - spacetimedb/src/data/abilities/bard_abilities.ts
  - spacetimedb/src/data/abilities/enchanter_abilities.ts
  - spacetimedb/src/data/abilities/spellblade_abilities.ts
  - spacetimedb/src/data/abilities/ranger_abilities.ts
  - spacetimedb/src/data/abilities/shaman_abilities.ts
  - spacetimedb/src/data/abilities/necromancer_abilities.ts
  - spacetimedb/src/data/abilities/beastmaster_abilities.ts
autonomous: true
requirements: [QUICK-229]

must_haves:
  truths:
    - "Paladin maxMana is lower than a same-level wizard or cleric"
    - "Ranger and reaver maxMana are lower than full casters"
    - "Paladin's two physical melee attacks (Holy Strike, Radiant Smite) cost stamina, not mana"
    - "Reaver's Blood Rend (physical self-leeching melee) costs stamina, not mana"
    - "Paladin has a secondary stat (STR) feeding into mana pool via manaStatForClass blending"
    - "All mana abilities have castSeconds >= 1n (no instant mana abilities)"
    - "All stamina abilities have castSeconds = 0n (all stamina abilities are instant)"
  artifacts:
    - path: "spacetimedb/src/data/class_stats.ts"
      provides: "HYBRID_MANA_CLASSES set, HYBRID_MANA_MULTIPLIER constant, paladin secondary STR"
    - path: "spacetimedb/src/helpers/character.ts"
      provides: "maxMana uses HYBRID_MANA_MULTIPLIER for hybrid classes"
    - path: "spacetimedb/src/data/abilities/paladin_abilities.ts"
      provides: "holy_strike and radiant_smite on stamina resource"
    - path: "spacetimedb/src/data/abilities/reaver_abilities.ts"
      provides: "blood_rend on stamina resource"
  key_links:
    - from: "class_stats.ts HYBRID_MANA_CLASSES"
      to: "character.ts maxMana formula"
      via: "import and conditional multiplier check"
    - from: "paladin_abilities.ts resource fields"
      to: "seeding/ensure_items.ts ensureAbilityTemplates"
      via: "resource field propagates to abilityTemplate DB rows on publish"
---

<objective>
Make paladin, ranger, and reaver feel like hybrid classes by reducing their mana pools and splitting their ability costs between mana and stamina.

Purpose: Full casters (wizard, cleric, etc.) should have substantially more mana than melee hybrids who also spend stamina. Paladin currently uses 100% mana abilities despite being plate-wearing melee; reaver has only 1 stamina ability out of 6.

Output: Three files changed — class_stats.ts (hybrid pool constants + paladin secondary), character.ts (conditional mana multiplier), two ability files (resource field flips).
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/data/class_stats.ts
@spacetimedb/src/helpers/character.ts
@spacetimedb/src/data/abilities/paladin_abilities.ts
@spacetimedb/src/data/abilities/reaver_abilities.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add hybrid mana constants and paladin secondary stat to class_stats.ts</name>
  <files>spacetimedb/src/data/class_stats.ts</files>
  <action>
Make the following changes to class_stats.ts:

1. In CLASS_CONFIG, update paladin to add secondary 'str':
   ```
   paladin: { primary: 'wis', secondary: 'str' },
   ```

2. After the BASE_MANA constant (line 31), add two new exports:
   ```typescript
   export const MANA_MULTIPLIER = 6n;
   export const HYBRID_MANA_MULTIPLIER = 4n;
   ```

3. Add a new exported set after MANA_CLASSES:
   ```typescript
   export const HYBRID_MANA_CLASSES = new Set([
     'paladin',
     'ranger',
     'reaver',
   ]);
   ```

Rationale:
- Paladin is a plate-wearing holy warrior — STR secondary makes sense and feeds into the 70/30 manaStatForClass blend, naturally reducing raw mana stat vs pure WIS classes.
- HYBRID_MANA_MULTIPLIER = 4n (vs 6n for full casters) gives hybrids ~33% less mana per mana stat point.
- Ranger and reaver already have secondaries so their manaStatForClass is already blended; the multiplier reduction is the main lever.
- Bard and spellblade are excluded: bard is all-mana (no stamina abilities), spellblade is a full arcane class thematically.
  </action>
  <verify>No TypeScript errors in class_stats.ts — run: spacetime publish uwr --project-path C:/projects/uwr/spacetimedb 2>&1 | head -30</verify>
  <done>CLASS_CONFIG paladin has secondary 'str'; MANA_MULTIPLIER, HYBRID_MANA_MULTIPLIER, and HYBRID_MANA_CLASSES exported from class_stats.ts</done>
</task>

<task type="auto">
  <name>Task 2: Apply hybrid mana multiplier in character.ts maxMana formula</name>
  <files>spacetimedb/src/helpers/character.ts</files>
  <action>
In character.ts, update the maxMana calculation (currently line 89-91):

1. Add HYBRID_MANA_CLASSES and HYBRID_MANA_MULTIPLIER to the import from '../data/class_stats':
   ```typescript
   import {
     BASE_HP,
     HP_STR_MULTIPLIER,
     BASE_MANA,
     MANA_MULTIPLIER,
     HYBRID_MANA_MULTIPLIER,
     HYBRID_MANA_CLASSES,
     baseArmorForClass,
     manaStatForClass,
     usesMana,
     normalizeClassName,
   } from '../data/class_stats';
   ```

2. Replace the maxMana line:
   ```typescript
   // Before:
   const maxMana = usesMana(character.className)
     ? BASE_MANA + manaStat * 6n + gear.manaBonus + racialMaxMana
     : 0n;

   // After:
   const manaMultiplier = HYBRID_MANA_CLASSES.has(normalizeClassName(character.className))
     ? HYBRID_MANA_MULTIPLIER
     : MANA_MULTIPLIER;
   const maxMana = usesMana(character.className)
     ? BASE_MANA + manaStat * manaMultiplier + gear.manaBonus + racialMaxMana
     : 0n;
   ```

This keeps the formula identical for pure casters (wizard, cleric, etc.) and reduces it for paladin/ranger/reaver.
  </action>
  <verify>Compile succeeds: spacetime publish uwr --project-path C:/projects/uwr/spacetimedb 2>&1 | grep -E "error|warning|success"</verify>
  <done>character.ts maxMana uses HYBRID_MANA_MULTIPLIER (4n) for paladin/ranger/reaver and MANA_MULTIPLIER (6n) for all other mana classes</done>
</task>

<task type="auto">
  <name>Task 3: Convert physical melee abilities to stamina for paladin and reaver</name>
  <files>
    spacetimedb/src/data/abilities/paladin_abilities.ts
    spacetimedb/src/data/abilities/reaver_abilities.ts
  </files>
  <action>
These changes flip the resource field so physical melee strikes spend stamina instead of mana.

**paladin_abilities.ts — change 2 abilities:**

- `paladin_holy_strike`: change `resource: 'mana'` to `resource: 'stamina'`
  (Holy Strike is an instant weapon strike — fits stamina as physical exertion)

- `paladin_radiant_smite`: change `resource: 'mana'` to `resource: 'stamina'`
  (Radiant Smite is a physical weapon attack with a cast time — physical effort, not pure spellcasting)

Keep on mana: shield_of_faith (protection spell), lay_on_hands (divine channeling), devotion (party buff), consecrated_ground (divine ritual)

Result: Paladin = 2 stamina / 4 mana abilities

**reaver_abilities.ts — change 1 ability:**

- `reaver_blood_rend`: change `resource: 'mana'` to `resource: 'stamina'`
  (Blood Rend is a physical flesh-rending attack that leeches HP — pure physical exertion)

Already on stamina: blood_pact
Keep on mana: soul_rend (soul magic), oblivion (heavy dark strike with cast = mental focus), dread_aura (aura magic), deaths_embrace (dark pact spell)

Result: Reaver = 2 stamina / 4 mana abilities

**Note on balance:** Stamina cost is always 3 per ability (from helpers/combat.ts line 359: `3n`). Mana cost formula is `4n + level * 2n + power`. At level 1 with power 3, holy_strike mana cost was 4+2+3=9. Moving to stamina costs 3 stamina instead — cheaper but from a separate pool that doesn't regenerate via mana regen. This is appropriate for the hybrid identity.

After editing the .ts files, the seeding system (ensureAbilityTemplates) will update the abilityTemplate DB rows on next publish, because it reads `entry.resource` from the ability catalog and updates existing rows via `.id.update(...)`.
  </action>
  <verify>
1. Publish succeeds: spacetime publish uwr --project-path C:/projects/uwr/spacetimedb
2. Check logs show no errors: spacetime logs uwr 2>&1 | tail -20
3. Verify resource fields in DB: spacetime sql uwr "SELECT key, resource FROM ability_template WHERE class_name IN ('paladin','reaver') ORDER BY class_name, level"
  </verify>
  <done>
- paladin_holy_strike and paladin_radiant_smite have resource='stamina' in DB
- reaver_blood_rend has resource='stamina' in DB
- paladin and reaver each have 2 stamina / 4 mana abilities
- No publish errors
  </done>
</task>


<task type="auto">
  <name>Task 4: Enforce cast time rules — mana abilities min 1s, stamina abilities instant</name>
  <files>
    spacetimedb/src/data/abilities/cleric_abilities.ts
    spacetimedb/src/data/abilities/wizard_abilities.ts
    spacetimedb/src/data/abilities/druid_abilities.ts
    spacetimedb/src/data/abilities/bard_abilities.ts
    spacetimedb/src/data/abilities/paladin_abilities.ts
    spacetimedb/src/data/abilities/enchanter_abilities.ts
    spacetimedb/src/data/abilities/reaver_abilities.ts
    spacetimedb/src/data/abilities/spellblade_abilities.ts
    spacetimedb/src/data/abilities/ranger_abilities.ts
    spacetimedb/src/data/abilities/shaman_abilities.ts
    spacetimedb/src/data/abilities/necromancer_abilities.ts
    spacetimedb/src/data/abilities/beastmaster_abilities.ts
  </files>
  <action>
The rule: mana abilities must have castSeconds >= 1n. Stamina abilities must have castSeconds = 0n.

Read each file and make the following precise changes (only castSeconds field):

**cleric_abilities.ts** (3 changes — mana 0n → 1n):
- cleric_blessing_of_might: castSeconds: 0n → 1n
- cleric_sanctify: castSeconds: 0n → 1n
- cleric_holy_nova: castSeconds: 0n → 1n

**wizard_abilities.ts** (1 change — mana 0n → 1n):
- wizard_mana_shield: castSeconds: 0n → 1n

**druid_abilities.ts** (3 changes — mana 0n → 1n):
- druid_natures_mark: castSeconds: 0n → 1n
- druid_natures_gift: castSeconds: 0n → 1n
- druid_shapeshifter_form: castSeconds: 0n → 1n

**bard_abilities.ts** (6 changes — all bard abilities are mana 0n → 1n):
- bard_discordant_note: castSeconds: 0n → 1n
- bard_melody_of_mending: castSeconds: 0n → 1n
- bard_chorus_of_vigor: castSeconds: 0n → 1n
- bard_march_of_wayfarers: castSeconds: 0n → 1n
- bard_battle_hymn: castSeconds: 0n → 1n
- bard_finale: castSeconds: 0n → 1n

**paladin_abilities.ts** (5 changes — mana 0n → 1n + stamina 1n → 0n):
- paladin_shield_of_faith: castSeconds: 0n → 1n  (stays mana)
- paladin_lay_on_hands: castSeconds: 0n → 1n  (stays mana)
- paladin_devotion: castSeconds: 0n → 1n  (stays mana)
- paladin_consecrated_ground: castSeconds: 0n → 1n  (stays mana)
- paladin_radiant_smite: castSeconds: 1n → 0n  (was mana, Task 3 moved it to stamina — stamina must be instant)
NOTE: paladin_holy_strike was mana with 0n, Task 3 moved it to stamina; it's already 0n so no castSeconds change needed.

**enchanter_abilities.ts** (3 changes — mana 0n → 1n):
- enchanter_clarity: castSeconds: 0n → 1n
- enchanter_haste: castSeconds: 0n → 1n
- enchanter_bewilderment: castSeconds: 0n → 1n

**reaver_abilities.ts** (3 changes — mana 0n → 1n):
NOTE: blood_rend was moved to stamina by Task 3; it's already castSeconds: 0n so no change needed.
- reaver_soul_rend: castSeconds: 0n → 1n  (stays mana)
- reaver_dread_aura: castSeconds: 0n → 1n  (stays mana)
- reaver_deaths_embrace: castSeconds: 0n → 1n  (stays mana)

**spellblade_abilities.ts** (3 changes — mana 0n → 1n):
- spellblade_frost_armor: castSeconds: 0n → 1n
- spellblade_stone_skin: castSeconds: 0n → 1n
- spellblade_magma_shield: castSeconds: 0n → 1n

**ranger_abilities.ts** (2 changes — mana 0n → 1n):
- ranger_track: castSeconds: 0n → 1n
- ranger_natures_balm: castSeconds: 0n → 1n

**shaman_abilities.ts** (2 changes — mana 0n → 1n):
- shaman_ancestral_ward: castSeconds: 0n → 1n
- shaman_earthquake: castSeconds: 0n → 1n

**necromancer_abilities.ts** (1 change — mana 0n → 1n):
- necromancer_plague_lord_form: castSeconds: 0n → 1n

**beastmaster_abilities.ts** (1 change — stamina 5n → 0n):
- beastmaster_call_beast: castSeconds: 5n → 0n  (stamina must be instant)

Do NOT change abilities that already satisfy the rule (mana >= 1n or stamina = 0n).
Do NOT touch warrior, rogue, monk — they are pure stamina classes and all already 0n.
Do NOT touch summoner or remaining necromancer/shaman abilities with castSeconds > 1n — those already satisfy mana >= 1n.
  </action>
  <verify>
Publish the module to confirm no TypeScript errors:
  spacetime publish uwr --project-path C:/projects/uwr/spacetimedb 2>&1 | tail -5

Spot check one file:
  grep -A3 "bard_discordant_note\|cleric_blessing_of_might\|beastmaster_call_beast" spacetimedb/src/data/abilities/bard_abilities.ts spacetimedb/src/data/abilities/cleric_abilities.ts spacetimedb/src/data/abilities/beastmaster_abilities.ts
  </verify>
  <done>
All listed changes applied. No mana ability has castSeconds: 0n. No stamina ability has castSeconds > 0n. Module publishes cleanly.
  </done>
</task>

</tasks>

<verification>
After all tasks:

1. Publish the module: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb`
2. Spot-check mana pool sizes by comparing classes at level 10 via SQL or game inspection.
   - At level 10, a wizard (INT primary=8+4+(3*9)=39, no secondary) has manaStat=39, maxMana=10+39*6=244
   - A paladin (WIS primary, STR secondary — at level 10: WIS=8+4+27=39, STR=8+2+9=19) has manaStat=(39*70+19*30)/100=30.9≈30, maxMana=10+30*4=130
   - Roughly half the mana of a wizard — appropriate for a hybrid
3. Verify paladin can cast Holy Strike spending stamina (not mana) in game
4. Verify reaver Blood Rend costs stamina
</verification>

<success_criteria>
- Paladin, ranger, and reaver have noticeably smaller mana pools than wizard/cleric/druid at the same level
- Paladin's basic strike (Holy Strike) and smite (Radiant Smite) spend stamina — paladin must manage both stamina and mana
- Reaver's Blood Rend spends stamina — reaver must manage both resources
- Module publishes without errors
- No regressions in other class mana calculations
</success_criteria>

<output>
After completion, create `.planning/quick/229-paladin-hybrid-mana-stamina-pools-reaver/229-SUMMARY.md`
</output>
