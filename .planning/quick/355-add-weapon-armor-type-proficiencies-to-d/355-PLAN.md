---
phase: quick-355
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/data/llm_prompts.ts
  - spacetimedb/src/reducers/creation.ts
  - spacetimedb/src/reducers/items.ts
  - spacetimedb/src/index.ts
autonomous: true
requirements: [QUICK-355]

must_haves:
  truths:
    - "LLM class generation produces weapon and armor proficiency arrays"
    - "Character table stores weapon and armor proficiencies as comma-separated strings"
    - "Equipping a weapon checks character's weapon proficiencies"
    - "Equipping armor checks character's armor proficiencies"
  artifacts:
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "weaponProficiencies and armorProficiencies fields on Character table"
      contains: "weaponProficiencies"
    - path: "spacetimedb/src/data/llm_prompts.ts"
      provides: "Updated CLASS_GENERATION_SCHEMA with proficiency arrays"
      contains: "weaponProficiencies"
  key_links:
    - from: "spacetimedb/src/reducers/creation.ts"
      to: "Character table"
      via: "Stores proficiencies from LLM-generated classStats during finalization"
      pattern: "weaponProficiencies"
    - from: "spacetimedb/src/reducers/items.ts"
      to: "Character table"
      via: "Reads proficiencies to validate equip_item"
      pattern: "weaponProficiencies"
---

<objective>
Add weapon and armor type proficiencies to the dynamic class creation pipeline.

Purpose: When the LLM generates a class during character creation, it should also specify which weapon types (dagger, sword, staff, bow, etc.) and armor types (cloth, leather, chain, plate) the class can use. These proficiencies are stored on the character and enforced when equipping items.

Output: Characters have proficiency restrictions that match their dynamically-generated class identity. A mystic Voidcaller might get staves/wands + cloth/leather, while a warrior Ironbreaker gets swords/axes/maces + chain/plate.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/schema/tables.ts (Character table at line 275)
@spacetimedb/src/data/llm_prompts.ts (CLASS_GENERATION_SCHEMA at line 109, COMBINED_CREATION_SCHEMA at line 159)
@spacetimedb/src/data/mechanical_vocabulary.ts (WEAPON_TYPES and ARMOR_TYPES)
@spacetimedb/src/reducers/creation.ts (character finalization at line 354)
@spacetimedb/src/reducers/items.ts (equip_item at line 446)
@spacetimedb/src/index.ts (submit_llm_result class handling at line 807)

<interfaces>
From spacetimedb/src/data/mechanical_vocabulary.ts:
```typescript
export const ARMOR_TYPES = ['cloth', 'leather', 'chain', 'plate', 'shield'] as const;
export type ArmorType = (typeof ARMOR_TYPES)[number];

export const WEAPON_TYPES = [
  'dagger', 'rapier', 'sword', 'blade', 'mace', 'axe',
  'bow', 'staff', 'greatsword', 'wand',
] as const;
export type WeaponType = (typeof WEAPON_TYPES)[number];
```

From spacetimedb/src/helpers/character.ts:
```typescript
export function isClassAllowed(allowedClasses: string, className: string): boolean;
```

Current CLASS_GENERATION_SCHEMA stats block:
```json
"stats": {
  "primaryStat": "str|dex|int|wis|cha",
  "secondaryStat": "str|dex|int|wis|cha|none",
  "bonusHp": "number (0-20)",
  "bonusMana": "number (0-30)",
  "armorProficiency": "cloth|leather|chain|plate",
  "usesMana": "boolean"
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add proficiency fields to schema and update LLM prompts</name>
  <files>spacetimedb/src/schema/tables.ts, spacetimedb/src/data/llm_prompts.ts</files>
  <action>
1. In `spacetimedb/src/schema/tables.ts`, add two new optional string fields to the Character table (after `lastCombatEndAt`):
   - `weaponProficiencies: t.string().optional()` — comma-separated list of weapon types (e.g., "sword,axe,mace")
   - `armorProficiencies: t.string().optional()` — comma-separated list of armor types (e.g., "chain,plate")
   Optional so existing characters don't break (they'll have undefined = all allowed, like before).

2. In `spacetimedb/src/data/llm_prompts.ts`, update `CLASS_GENERATION_SCHEMA` (line 109):
   - Replace the single `"armorProficiency": "cloth|leather|chain|plate"` with:
     - `"weaponProficiencies": ["array of allowed weapon types from: dagger, rapier, sword, blade, mace, axe, bow, staff, greatsword, wand — pick 2-4 that fit the class fantasy"]`
     - `"armorProficiencies": ["array of allowed armor types from: cloth, leather, chain, plate — pick 1-2 tiers, warriors get heavier, mystics get lighter"]`
   - Do the same for `COMBINED_CREATION_SCHEMA` (line 159) which has the same stats block.

3. Update `buildClassGenerationUserPrompt` (line 143) — add a sentence to the prompt reminding the LLM to pick proficiencies that match the class fantasy. Warriors should get heavier armor and melee weapons, mystics should get lighter armor and magical weapons (staves, wands).
  </action>
  <verify>
    <automated>cd C:/projects/uwr && grep -c "weaponProficiencies" spacetimedb/src/schema/tables.ts spacetimedb/src/data/llm_prompts.ts</automated>
  </verify>
  <done>Character table has weaponProficiencies and armorProficiencies fields. LLM schemas request arrays of allowed weapon/armor types.</done>
</task>

<task type="auto">
  <name>Task 2: Store proficiencies on character creation and enforce on equip</name>
  <files>spacetimedb/src/reducers/creation.ts, spacetimedb/src/reducers/items.ts, spacetimedb/src/index.ts</files>
  <action>
1. In `spacetimedb/src/reducers/creation.ts`, in the AWAITING_NAME finalization block (around line 354), after building the character insert:
   - Parse `weaponProficiencies` and `armorProficiencies` from `state.classStats` JSON (they'll be arrays from the LLM).
   - Convert arrays to comma-separated strings and include in the `ctx.db.character.insert(...)` call.
   - Fallback: if classStats doesn't have them, use archetype defaults:
     - warrior: weaponProficiencies = "sword,axe,mace,greatsword,dagger", armorProficiencies = "leather,chain,plate"
     - mystic: weaponProficiencies = "staff,wand,dagger", armorProficiencies = "cloth,leather"

2. In `spacetimedb/src/index.ts`, in the `submit_llm_result` class processing block (around line 807-815), the `classStats` JSON is already stored via `JSON.stringify(data.stats || {})`. The LLM will now return `weaponProficiencies` and `armorProficiencies` arrays inside `stats`, so they'll automatically be preserved in the JSON. No change needed here.

3. In `spacetimedb/src/reducers/items.ts`, in the `equip_item` reducer (around line 446):
   - After the existing `isClassAllowed` check (line 464), add proficiency checks:
   - For weapon slots (mainHand, offHand): if `character.weaponProficiencies` is defined and `template.weaponType` exists, check that `template.weaponType` is in the character's `weaponProficiencies` list. If not, fail with `'Your class cannot wield this weapon type'`.
   - For armor slots (head, chest, legs, boots, hands, wrists, belt): if `character.armorProficiencies` is defined and `template.armorType` exists, check that `template.armorType` is in the character's `armorProficiencies` list. If not, fail with `'Your class cannot wear this armor type'`.
   - IMPORTANT: If `character.weaponProficiencies` or `character.armorProficiencies` is undefined/empty, allow all (backward compat for existing characters).
   - Remove or update the line 468 comment about armor not being class-gated — it IS now proficiency-gated.

4. In the class reveal display in `spacetimedb/src/index.ts` (around line 818-840), add weapon/armor proficiency info to the class reveal message shown to the player. After the `armorLine` (line 820), add:
   - `const weaponLine = stats.weaponProficiencies ? \`Weapons: \${stats.weaponProficiencies.join(', ')}\` : '';`
   - `const armorLine = stats.armorProficiencies ? \`Armor: \${stats.armorProficiencies.join(', ')}\` : \`Armor: \${stats.armorProficiency || 'cloth'}\`;`
   (Replace the existing armorLine that just reads `stats.armorProficiency`.)
   - Include weaponLine in the appendCreationEvent output.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && grep -c "weaponProficiencies" spacetimedb/src/reducers/creation.ts spacetimedb/src/reducers/items.ts spacetimedb/src/index.ts</automated>
  </verify>
  <done>Character creation stores proficiencies from LLM output (with archetype fallbacks). Equip reducer enforces weapon and armor proficiencies. Class reveal shows proficiencies to the player.</done>
</task>

</tasks>

<verification>
1. `grep -r "weaponProficiencies" spacetimedb/src/` shows hits in schema, prompts, creation, items, and index
2. `grep -r "armorProficiencies" spacetimedb/src/` shows hits in same files
3. Schema has both fields as optional strings on Character table
4. LLM prompt schemas include proficiency arrays
5. equip_item checks proficiencies (with undefined = allow all fallback)
</verification>

<success_criteria>
- Character table has weaponProficiencies and armorProficiencies optional string fields
- LLM class generation schema requests weapon and armor proficiency arrays
- Character creation finalizer stores proficiencies (with archetype fallbacks)
- equip_item enforces proficiency restrictions with backward-compatible undefined = allow all
- Class reveal message shows weapon and armor proficiencies to the player
- Requires --clear-database publish due to schema change (new columns)
</success_criteria>

<output>
After completion, create `.planning/quick/355-add-weapon-armor-type-proficiencies-to-d/355-SUMMARY.md`
</output>
