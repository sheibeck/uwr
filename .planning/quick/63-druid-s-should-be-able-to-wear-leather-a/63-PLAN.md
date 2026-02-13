---
phase: quick-63
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/class_stats.ts
  - spacetimedb/src/index.ts
autonomous: true
must_haves:
  truths:
    - "Druid characters can equip leather armor items"
    - "Druid characters can still equip cloth armor items"
    - "Leather armor seed data lists druid in allowedClasses"
  artifacts:
    - path: "spacetimedb/src/data/class_stats.ts"
      provides: "CLASS_ARMOR map with druid including leather"
      contains: "druid: ['leather', 'cloth']"
    - path: "spacetimedb/src/index.ts"
      provides: "ARMOR_ALLOWED_CLASSES seed data with druid in leather"
      contains: "druid"
  key_links:
    - from: "spacetimedb/src/data/class_stats.ts"
      to: "spacetimedb/src/reducers/items.ts"
      via: "isArmorAllowedForClass uses CLASS_ARMOR"
      pattern: "isArmorAllowedForClass"
---

<objective>
Allow druids to wear leather armor in addition to cloth.

Purpose: Druids are a nature-themed class and should logically be able to wear leather armor, not just cloth. This aligns them with other nature/hybrid classes like beastmaster.
Output: Updated CLASS_ARMOR map and seed data so druids can equip leather.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/data/class_stats.ts
@spacetimedb/src/index.ts (ARMOR_ALLOWED_CLASSES around line 3729)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add leather to druid armor proficiency and update seed data</name>
  <files>spacetimedb/src/data/class_stats.ts, spacetimedb/src/index.ts</files>
  <action>
Two changes needed:

1. In `spacetimedb/src/data/class_stats.ts`, update the CLASS_ARMOR map entry for druid:
   - Change: `druid: ['cloth']`
   - To: `druid: ['leather', 'cloth']`
   - This controls the server-side `isArmorAllowedForClass` check used by the equip_item reducer.

2. In `spacetimedb/src/index.ts`, update the ARMOR_ALLOWED_CLASSES seed data map (around line 3729-3734):
   - Add `druid` to the leather entry.
   - Current leather line: `leather: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster'`
   - Updated leather line: `leather: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid'`
   - This controls the allowedClasses field on seeded leather armor ItemTemplates, which drives the client-side "Classes:" tooltip display and the classAllowed check.

No client-side changes needed. The client equipable flag checks allowedClasses from the ItemTemplate (server-seeded), and armor proficiency is validated server-side only (comment in useInventory.ts line 126 confirms this).
  </action>
  <verify>
1. Grep CLASS_ARMOR in class_stats.ts and confirm druid entry includes 'leather'
2. Grep ARMOR_ALLOWED_CLASSES in index.ts and confirm leather entry includes 'druid'
3. Run `npx vue-tsc --noEmit --project spacetimedb/tsconfig.json` to verify no TypeScript errors introduced
  </verify>
  <done>
- CLASS_ARMOR['druid'] is ['leather', 'cloth']
- ARMOR_ALLOWED_CLASSES leather entry includes 'druid'
- TypeScript compilation passes
- After republish + clear-database, druids can equip leather armor and leather armor tooltips show druid in allowed classes
  </done>
</task>

</tasks>

<verification>
- Grep confirms druid has leather in CLASS_ARMOR
- Grep confirms druid listed in ARMOR_ALLOWED_CLASSES leather entry
- Module compiles without errors
</verification>

<success_criteria>
Druid characters can equip leather armor items. Leather armor tooltips list druid as an allowed class. No regression to other class armor proficiencies.
</success_criteria>

<output>
After completion, create `.planning/quick/63-druid-s-should-be-able-to-wear-leather-a/63-SUMMARY.md`
</output>
