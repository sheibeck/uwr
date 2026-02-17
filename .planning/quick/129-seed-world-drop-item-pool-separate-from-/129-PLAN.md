---
phase: quick-129
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/seeding/ensure_items.ts
  - spacetimedb/src/seeding/ensure_enemies.ts
  - spacetimedb/src/seeding/ensure_content.ts
  - src/composables/useInventory.ts
  - src/components/InventoryPanel.vue
autonomous: true

must_haves:
  truths:
    - "Starter items (Training Sword, Scout Jerkin, etc.) never appear as world drops"
    - "World drops include swords, bows, staves, maces, axes, rapiers, daggers, chest/legs/boots across cloth/leather/chain/plate — real gear to find"
    - "Equipped items display name in quality color (green=uncommon, blue=rare, purple=epic, orange=legendary, white=common)"
    - "Equipped slots show NO rarity label text — name color communicates quality"
  artifacts:
    - path: "spacetimedb/src/seeding/ensure_items.ts"
      provides: "ensureWorldDropGearTemplates function with 20+ gear items across slots and tiers"
    - path: "spacetimedb/src/seeding/ensure_enemies.ts"
      provides: "gearTemplates filter excludes starter item names via STARTER_ITEM_NAMES set"
    - path: "spacetimedb/src/seeding/ensure_content.ts"
      provides: "ensureWorldDropGearTemplates called before ensureLootTables in syncAllContent"
    - path: "src/composables/useInventory.ts"
      provides: "EquippedSlot type includes qualityTier field, populated from instance.qualityTier"
    - path: "src/components/InventoryPanel.vue"
      provides: "Equipped name uses rarityStyle(slot.qualityTier), rarity text span removed"
  key_links:
    - from: "spacetimedb/src/seeding/ensure_items.ts"
      to: "spacetimedb/src/seeding/ensure_content.ts"
      via: "ensureWorldDropGearTemplates exported and called in syncAllContent after ensureFoodItemTemplates, before ensureLootTables"
    - from: "src/composables/useInventory.ts"
      to: "src/components/InventoryPanel.vue"
      via: "EquippedSlot.qualityTier field passed as prop; InventoryPanel reads slot.qualityTier for rarityStyle"
---

<objective>
Two targeted fixes to the loot and gear display systems:
1. Seed world-drop gear separate from starter gear so Training Sword and Scout Jerkin stop appearing in enemy loot. Add a real pool of world-droppable weapons and armor with meaningful stats.
2. Fix equipped slot display: remove the "(common)" / "(uncommon)" rarity text label and show the item name in the quality color instead.

Purpose: Starters appearing as loot is confusing and immersion-breaking. Color-coded equipped names communicate quality at a glance without redundant text.
Output: Backend world-drop gear seeded, ensureLootTables filter updated, useInventory.ts qualityTier wired, InventoryPanel.vue rarity span removed.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/seeding/ensure_items.ts
@spacetimedb/src/seeding/ensure_enemies.ts
@spacetimedb/src/seeding/ensure_content.ts
@spacetimedb/src/helpers/items.ts
@src/composables/useInventory.ts
@src/components/InventoryPanel.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Seed world-drop gear and fix loot table filter</name>
  <files>
    spacetimedb/src/seeding/ensure_items.ts
    spacetimedb/src/seeding/ensure_enemies.ts
    spacetimedb/src/seeding/ensure_content.ts
  </files>
  <action>
**In `spacetimedb/src/seeding/ensure_items.ts`:**

Add a new exported function `ensureWorldDropGearTemplates` after `ensureStarterItemTemplates`. This function seeds gear items that are appropriate as world drops — NOT Training/Scout/Apprentice/Warden/Vanguard starter names.

Inline the upsertByName helper at the top of the function:
```typescript
const upsertByName = (row: any) => {
  const fullRow = { wellFedDurationMicros: 0n, wellFedBuffType: '', wellFedBuffMagnitude: 0n, weaponType: '', magicResistanceBonus: 0n, ...row };
  const existing = findItemTemplateByName(ctx, fullRow.name);
  if (existing) { ctx.db.itemTemplate.id.update({ ...existing, ...fullRow, id: existing.id }); return existing; }
  return ctx.db.itemTemplate.insert({ id: 0n, ...fullRow });
};
```

Seed weapons (slot: 'mainHand') with real weaponBaseDamage and weaponDps stats. All tier:1n items have requiredLevel:1n, all tier:2n have requiredLevel:11n:
- 'Iron Shortsword' — weaponType:'sword', allowedClasses:'warrior,paladin,bard,spellblade,reaver', weaponBaseDamage:6n, weaponDps:9n, tier:1n
- 'Hunting Bow' — weaponType:'bow', allowedClasses:'ranger', weaponBaseDamage:5n, weaponDps:8n, tier:1n
- 'Gnarled Staff' — weaponType:'staff', allowedClasses:'enchanter,necromancer,summoner,druid,shaman,monk,wizard', weaponBaseDamage:4n, weaponDps:7n, tier:1n
- 'Worn Mace' — weaponType:'mace', allowedClasses:'paladin,cleric', weaponBaseDamage:6n, weaponDps:8n, tier:1n
- 'Rusty Axe' — weaponType:'axe', allowedClasses:'beastmaster', weaponBaseDamage:7n, weaponDps:9n, tier:1n
- 'Notched Rapier' — weaponType:'rapier', allowedClasses:'bard', weaponBaseDamage:5n, weaponDps:8n, tier:1n
- 'Chipped Dagger' — weaponType:'dagger', allowedClasses:'rogue', weaponBaseDamage:4n, weaponDps:7n, tier:1n
- 'Cracked Blade' — weaponType:'blade', allowedClasses:'spellblade,reaver', weaponBaseDamage:5n, weaponDps:8n, tier:1n
- 'Steel Longsword' — weaponType:'sword', allowedClasses:'warrior,paladin,bard,spellblade,reaver', weaponBaseDamage:9n, weaponDps:13n, tier:2n, requiredLevel:11n
- 'Yew Bow' — weaponType:'bow', allowedClasses:'ranger', weaponBaseDamage:8n, weaponDps:12n, tier:2n, requiredLevel:11n
- 'Oak Staff' — weaponType:'staff', allowedClasses:'enchanter,necromancer,summoner,druid,shaman,monk,wizard', weaponBaseDamage:7n, weaponDps:11n, tier:2n, requiredLevel:11n

Seed armor — chest/legs/boots for cloth, leather, chain, plate. allowedClasses follows ARMOR_ALLOWED_CLASSES:
- plate: 'warrior,paladin,bard,cleric'
- chain: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver'
- leather: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid'
- cloth: 'any'

Tier 1 armor (requiredLevel:1n):
- Cloth: 'Worn Robe' (chest, ac:3n), 'Worn Trousers' (legs, ac:2n), 'Worn Slippers' (boots, ac:1n)
- Leather: 'Scuffed Jerkin' (chest, ac:4n), 'Scuffed Leggings' (legs, ac:3n), 'Scuffed Boots' (boots, ac:2n)
- Chain: 'Dented Hauberk' (chest, ac:5n), 'Dented Greaves' (legs, ac:4n), 'Dented Sabatons' (boots, ac:3n)
- Plate: 'Battered Cuirass' (chest, ac:6n), 'Battered Greaves' (legs, ac:5n), 'Battered Boots' (boots, ac:4n)

Tier 2 armor (requiredLevel:11n, tier:2n):
- 'Silken Robe' — cloth chest, ac:5n, intBonus:1n
- 'Ranger Jerkin' — leather chest, ac:6n, dexBonus:1n

All armor: weaponBaseDamage:0n, weaponDps:0n, strBonus:0n, dexBonus:0n (unless specified), chaBonus:0n, wisBonus:0n, intBonus:0n (unless specified), hpBonus:0n, manaBonus:0n, rarity:'common', isJunk:false, stackable:false.

**In `spacetimedb/src/seeding/ensure_enemies.ts`:**

At the top of `ensureLootTables`, replace the existing `gearTemplates` filter (lines 8-10) with:

```typescript
const STARTER_ITEM_NAMES = new Set([
  // Starter weapons
  'Training Sword', 'Training Mace', 'Training Staff', 'Training Bow',
  'Training Dagger', 'Training Axe', 'Training Blade', 'Training Rapier',
  // Starter cloth armor
  'Apprentice Robe', 'Apprentice Trousers', 'Apprentice Boots',
  // Starter leather armor
  'Scout Jerkin', 'Scout Pants', 'Scout Boots',
  // Starter chain armor
  'Warden Hauberk', 'Warden Greaves', 'Warden Boots',
  // Starter plate armor
  'Vanguard Cuirass', 'Vanguard Greaves', 'Vanguard Boots',
]);

const gearTemplates = [...ctx.db.itemTemplate.iter()].filter(
  (row) => !row.isJunk && row.tier <= 1n && row.requiredLevel <= 9n && !STARTER_ITEM_NAMES.has(row.name)
);
```

This ensures only world-drop gear (Worn Robe, Iron Shortsword, etc.) appears in loot tables, not starter Training/Scout/etc. items.

**In `spacetimedb/src/seeding/ensure_content.ts`:**

1. Add `ensureWorldDropGearTemplates` to the import from `./ensure_items`:
```typescript
import {
  ensureStarterItemTemplates,
  ensureWorldDropGearTemplates,   // add this
  ensureResourceItemTemplates,
  ...
} from './ensure_items';
```

2. In `syncAllContent`, call it right after `ensureFoodItemTemplates` and before `ensureAbilityTemplates`:
```typescript
ensureStarterItemTemplates(ctx);
ensureResourceItemTemplates(ctx);
ensureFoodItemTemplates(ctx);
ensureWorldDropGearTemplates(ctx);  // add this — must be before ensureLootTables
ensureAbilityTemplates(ctx);
```
  </action>
  <verify>
    `spacetime publish uwr --project-path spacetimedb` compiles and deploys without errors.
    `spacetime logs uwr` shows no seeding errors.
  </verify>
  <done>
    - `ensureWorldDropGearTemplates` function exists in ensure_items.ts with 20+ named world-drop gear items
    - STARTER_ITEM_NAMES set in ensure_enemies.ts excludes all starter gear from gearTemplates filter
    - ensure_content.ts imports and calls ensureWorldDropGearTemplates before ensureLootTables
    - Module compiles and publishes cleanly
    - `spacetime logs uwr` shows no errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix equipped slot quality color display</name>
  <files>
    src/composables/useInventory.ts
    src/components/InventoryPanel.vue
  </files>
  <action>
**In `src/composables/useInventory.ts`:**

1. Add `qualityTier: string` to the `EquippedSlot` type definition (around line 70-84 — the type block with slot, name, armorType, rarity, tier, isJunk, vendorValue, itemInstanceId, allowedClasses):
```typescript
type EquippedSlot = {
  slot: string;
  name: string;
  armorType: string;
  rarity: string;
  qualityTier: string;   // add this line
  tier: bigint;
  isJunk: boolean;
  ...
```

2. In the `equippedSlots` computed return object (around line 271-284 — the object starting with slot, name, armorType, rarity...), add qualityTier:
```typescript
return {
  slot,
  name: template?.name ?? 'Empty',
  armorType: template?.armorType ?? 'none',
  rarity: template?.rarity ?? 'common',
  qualityTier: instance?.qualityTier ?? template?.rarity ?? 'common',  // add this line
  tier,
  isJunk,
  ...
```

The `qualityTier` on ItemInstance holds the rolled quality ('uncommon', 'rare', 'epic', 'legendary') for world-drop items. Starter gear has no rolled quality (instance.qualityTier is undefined/null), so it falls back to template.rarity ('common').

**In `src/components/InventoryPanel.vue`:**

1. Add `qualityTier: string` to the equippedSlots prop type (the inline type block starting around line 105 with slot, name, armorType, rarity, tier, isJunk...):
```typescript
equippedSlots: {
  slot: string;
  name: string;
  armorType: string;
  rarity: string;
  qualityTier: string;   // add this line
  tier: bigint;
  ...
```

2. In the template (lines 19-25), remove the `({{ slot.rarity }})` span entirely and update the name div to apply quality color only when the slot has an item:

Replace:
```html
<div :style="styles.equipmentSlotLabel">{{ formatSlot(slot.slot) }}</div>
<div :style="[styles.equipmentSlotName, rarityStyle(slot.rarity)]">
  {{ slot.name }}
</div>
<span v-if="slot.name !== 'Empty'" :style="styles.subtle">
  ({{ slot.rarity }})
</span>
```

With:
```html
<div :style="styles.equipmentSlotLabel">{{ formatSlot(slot.slot) }}</div>
<div :style="[styles.equipmentSlotName, slot.name !== 'Empty' ? rarityStyle(slot.qualityTier) : {}]">
  {{ slot.name }}
</div>
```

The `<span>` with rarity text is completely removed. The item name renders in quality color: white for common, green for uncommon, blue for rare, purple for epic, orange for legendary. Empty slots show "Empty" in plain white (no color override applied).
  </action>
  <verify>
    Run `npm run build` in the client directory — must compile without TypeScript errors.
    Visual check: equip an uncommon or rare item and confirm the slot name appears in green/blue color with no "(uncommon)"/"(rare)" text beneath it.
  </verify>
  <done>
    - qualityTier field present on EquippedSlot type in useInventory.ts
    - equippedSlots computed populates qualityTier from instance.qualityTier with template.rarity fallback
    - InventoryPanel.vue equippedSlots prop type includes qualityTier
    - Template uses rarityStyle(slot.qualityTier) for name color, rarity text span removed
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. `spacetime publish uwr --project-path spacetimedb` compiles and publishes without errors
2. `spacetime logs uwr` shows no seeding panics or errors
3. `npm run build` in client compiles without TypeScript errors
4. In game: defeat enemies and confirm loot window never shows Training Sword, Scout Jerkin, Apprentice Robe, etc.
5. In game: equip an uncommon/rare/epic world-drop item — name appears in quality color (green/blue/purple), no rarity text below
6. In game: empty equipment slots show "Empty" in plain white — no color applied
</verification>

<success_criteria>
- Starter gear (Training Sword, Scout Jerkin, Apprentice Robe, etc.) never appears as world drops from enemies
- World-drop gear pool has 20+ items across weapon types and armor slots/tiers with real stat values
- Equipped slot quality communicates via name color, not text label
- No TypeScript or build errors
</success_criteria>

<output>
After completion, create `.planning/quick/129-seed-world-drop-item-pool-separate-from-/129-SUMMARY.md` using the summary template.
</output>
