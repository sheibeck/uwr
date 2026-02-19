---
phase: quick-193
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/seeding/ensure_items.ts
  - spacetimedb/src/data/crafting_materials.ts
  - src/composables/useItemTooltip.ts
  - src/composables/useInventory.ts
  - src/composables/useCombat.ts
  - src/composables/useCrafting.ts
  - src/App.vue
autonomous: true
requirements: [DESC-01, DESC-02, DESC-03]
must_haves:
  truths:
    - "Every item in inventory/vendor/loot/crafting tooltip shows a meaningful description from the server"
    - "Resources, crafting materials, food, junk, gear, scrolls all display unique descriptions"
    - "All tooltip code paths use one shared helper instead of 5 independent builders"
    - "No client-side fallback strings for descriptions — blank server description shows blank"
  artifacts:
    - path: "spacetimedb/src/seeding/ensure_items.ts"
      provides: "description fields on all item template seeds"
    - path: "spacetimedb/src/data/crafting_materials.ts"
      provides: "description fields on MaterialDef and CraftingModifierDef"
    - path: "src/composables/useItemTooltip.ts"
      provides: "Single source of truth for building tooltip data from ItemTemplate"
  key_links:
    - from: "src/composables/useItemTooltip.ts"
      to: "src/App.vue"
      via: "import and use in tooltip rendering"
      pattern: "buildItemTooltip|useItemTooltip"
    - from: "spacetimedb/src/data/crafting_materials.ts"
      to: "spacetimedb/src/seeding/ensure_items.ts"
      via: "MATERIAL_DEFS.description consumed during ensureGearMaterialItemTemplates"
      pattern: "mat\\.description"
---

<objective>
Add descriptions to all item templates on the server and unify the client tooltip pipeline.

Purpose: Every item in the game (resources, crafting materials, food, gear, junk, scrolls, modifiers) currently shows no description or a computed fallback string. The server ItemTemplate.description field exists but is never populated during seeding. On the client, there are 5 separate tooltip data construction code paths — inventory, equipped slots, vendor, loot, and crafting — each building description/stats/affixes independently with inconsistent logic.

Output:
- All ~140+ item templates seeded with meaningful description text
- One shared `useItemTooltip.ts` composable that all 5 code paths delegate to
- No duplicate WELL_FED_BUFF_LABELS maps or inline stat-building logic
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/seeding/ensure_items.ts
@spacetimedb/src/data/crafting_materials.ts
@src/composables/useInventory.ts
@src/composables/useCombat.ts
@src/composables/useCrafting.ts
@src/App.vue
@src/components/LootPanel.vue
@src/components/VendorPanel.vue
@src/components/CraftingPanel.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add description field to all server-side item data constants and seeding</name>
  <files>
    spacetimedb/src/data/crafting_materials.ts
    spacetimedb/src/seeding/ensure_items.ts
  </files>
  <action>
**1a. Add `description` field to `MaterialDef` interface and all `MATERIAL_DEFS` entries in crafting_materials.ts:**

Add `description?: string` to the `MaterialDef` interface (optional to not break existing uses). Then add description strings to every entry:

Tier 1 materials:
- Copper Ore: "Raw copper ore mined from rocky deposits. Used in basic metalworking recipes."
- Rough Hide: "Untreated animal hide stripped from beasts. A staple leather-working material."
- Bone Shard: "Splintered bone fragments scavenged from the dead. Used to reinforce armor and accessories."

Tier 2 materials:
- Iron Ore: "Dense iron ore found deep in mountain veins. Smelts into sturdy ingots for advanced crafting."
- Tanned Leather: "Cured animal leather, supple and durable. Essential for mid-tier armor crafting."
- Spirit Essence: "Concentrated spiritual residue harvested from otherworldly creatures. Channels arcane properties into crafted items."

Tier 3 materials:
- Darksteel Ore: "Rare dark-veined ore infused with residual magic. The finest metallic crafting material."
- Moonweave Cloth: "Gossamer fibers gathered under moonlight from enchanted flora. Prized by cloth-working artisans."
- Shadowhide: "Supernaturally tough hide from shadow-touched beasts. Near-impervious when worked properly."
- Void Crystal: "A crystalline shard pulsing with void energy. Amplifies magical resistance when embedded in gear."

Essences:
- Lesser Essence: "A faint spark of elemental power extracted from slain creatures. Used to imbue crafted gear with minor enchantments."
- Essence: "A concentrated elemental force drawn from formidable foes. Enables moderate gear enchantments."
- Greater Essence: "A potent wellspring of elemental might. Unlocks the strongest gear enchantments."
- (If Essence IV exists in MATERIAL_DEFS): "An overwhelming surge of primordial power from the most dangerous enemies. Reserved for masterwork enchanting."

**1b. Add `description` to `ensureCraftingModifierItemTemplates` so it writes `mod.description` to ItemTemplate.description:**

In `ensureCraftingModifierItemTemplates`, add `description: mod.description` to the `fullRow` object. The CRAFTING_MODIFIER_DEFS already have description strings (e.g., "Adds Strength to the crafted item.").

**1c. Add `description` to `ensureGearMaterialItemTemplates` so it writes `mat.description` to ItemTemplate.description:**

In `ensureGearMaterialItemTemplates`, add `description: mat.description` to the `fullRow` object.

**1d. Add descriptions to all resources in `ensureResourceItemTemplates`:**

Change the `resources` array from `{ name, slot, vendorValue }` to include `description`:
- Flax: "Long fibrous stalks used to weave cloth and rope."
- Herbs: "Common medicinal plants gathered from wild growth."
- Wood: "Rough-cut timber suitable for torches and simple tools."
- Resin: "Sticky tree sap that serves as a natural adhesive and fuel."
- Stone: "A chunk of sturdy rock used for grinding and sharpening."
- Raw Meat: "Uncooked animal flesh. Cook it before eating or it may cause illness."
- Salt: "Coarse mineral salt used to preserve food and season rations."
- Clear Water: "Fresh water drawn from a clean spring."
- Sand: "Fine-grained sand useful for polishing and abrasion."
- Dry Grass: "Brittle dried grass that catches fire easily."
- Bitter Herbs: "Pungent wild herbs with toxic properties. Handle with care."
- Peat: "Dense organic soil that burns slowly. Used in crude fire-starting."
- Mushrooms: "Earthy fungi foraged from damp places."
- Murky Water: "Brackish water from a stagnant source. Not fit for drinking as-is."
- Iron Shard: "A small fragment of rusted iron. Retains enough metal for minor crafting."
- Ancient Dust: "Fine powder sifted from old ruins. Carries faint traces of enchantment."
- Scrap Cloth: "Torn fabric scraps salvaged from the wilds."
- Lamp Oil: "Rendered animal fat that burns cleanly in lanterns."
- Wild Berries: "Tart wild berries picked from roadside bushes. Edible raw or cooked."
- Root Vegetable: "A starchy tuber dug from soft earth. Filling when roasted."

Pass `description` through in the upsert call: add `description: resource.description` to the row passed to `upsertResourceByName`.

**1e. Add descriptions to crafted consumable items:**

In the `craftItems` array within `ensureResourceItemTemplates`, add descriptions:
- Bandage: "Strips of clean cloth used to bind wounds. Restores a small amount of health."
- Simple Rations: "Basic preserved food. Staves off hunger but grants no special effects."
- Torch: "A wooden shaft wrapped in oil-soaked cloth. Provides light in dark places."
- Basic Poultice: "A moist herbal compress that speeds natural healing."
- Travelers Tea: "A warm herbal infusion that restores stamina on the road."
- Whetstone: "A coarse grinding stone used to sharpen blades before battle."
- Kindling Bundle: "A bundle of dry twigs and bark. Starts campfires quickly."
- Rough Rope: "Braided plant fibers twisted into a sturdy rope."
- Charcoal: "Blackened wood remnants. Burns hotter than raw timber."
- Crude Poison: "A noxious paste distilled from bitter herbs. Applied to weapon edges."

**1f. Add descriptions to food items in `ensureFoodItemTemplates`:**

Add a `description` field to each food entry object:
- Herb Broth: "A fragrant broth steeped with wild herbs. Boosts mana regeneration while Well Fed."
- Roasted Roots: "Hearty roasted tubers seasoned with salt. Boosts strength while Well Fed."
- Traveler's Stew: "A thick stew of meat and vegetables. Boosts stamina regeneration while Well Fed."
- Forager's Salad: "A crisp mix of berries and greens. Boosts dexterity while Well Fed."
- Healer's Porridge: "A soothing oat porridge infused with restorative herbs. Boosts health regeneration while Well Fed."

Pass `description: food.description` in both the update and insert paths.

**1g. Add descriptions to junk items in `ensureStarterItemTemplates`:**

Change the `junkTemplates` array to include descriptions:
- Rat Tail: "A scaly rat tail. Worthless except to a vendor."
- Torn Pelt: "A ragged piece of animal skin. Too damaged for leatherworking."
- Cracked Fang: "A broken tooth from some creature. Might fetch a coin or two."
- Ashen Bone: "A charred bone fragment. Only a vendor would want this."

Pass `description: junk.description` in the upsert call.

**1h. Add descriptions to starter gear:**

For starter armor, compute description from armor type:
- Cloth starter: "Threadbare cloth garments offering minimal protection. Standard issue for new adventurers."
- Leather starter: "Scuffed leather armor worn thin by previous owners. Better than nothing."
- Chain starter: "Dented chain mail that still turns a blade. Issued to melee recruits."
- Plate starter: "Battered plate armor, dented but functional. Heavy protection for frontline fighters."

Add `description` to each `upsertItemTemplateByName` call in the starter armor loops. Generate the description based on armorType using a simple lookup:
```
const STARTER_ARMOR_DESC: Record<string, string> = {
  cloth: 'Threadbare cloth garments offering minimal protection. Standard issue for new adventurers.',
  leather: 'Scuffed leather armor worn thin by previous owners. Better than nothing.',
  chain: 'Dented chain mail that still turns a blade. Issued to melee recruits.',
  plate: 'Battered plate armor, dented but functional. Heavy protection for frontline fighters.',
};
```

For starter weapons, add to the `weaponTemplates` objects:
- Training Sword: "A blunt practice sword. Barely adequate for real combat."
- Training Mace: "A weighted training mace. Clumsy but functional."
- Training Staff: "A worn wooden staff. Channels magic adequately for beginners."
- Training Bow: "A simple shortbow with fraying string. Accurate enough at short range."
- Training Dagger: "A dull practice dagger. Quick in the right hands."
- Training Axe: "A notched training axe. Heavy enough to do damage."
- Training Blade: "A thin practice blade balanced for dual-discipline fighting."
- Training Rapier: "A flexible practice rapier. Light and swift."

For starter accessories:
- Rough Band: "A crude copper ring. Mildly enhances agility."
- Worn Cloak: "A tattered traveling cloak. Provides slight warmth and protection."
- Traveler Necklace: "A simple cord with a polished stone. Said to bring wisdom."
- Glimmer Ring: "A ring set with a tiny glowing crystal. Faintly enhances focus."
- Shaded Cloak: "A dark hooded cloak favored by scouts. Improves nimbleness."

**1i. Add descriptions to world-drop gear in `ensureWorldDropGearTemplates`:**

For EACH weapon, generate a brief description. For brevity and consistency, use a pattern: "[adjective] [weapon type]. [brief mechanical/flavor note]."

T1 weapons:
- Iron Shortsword: "A serviceable iron blade. Reliable in close quarters."
- Hunting Bow: "A sturdy bow designed for woodland game. Pulls smoothly."
- Gnarled Staff: "A twisted wooden staff thrumming with latent energy."
- Worn Mace: "A heavy flanged mace showing signs of hard use."
- Rusty Axe: "A broad axe dulled by rust but still fearsome."
- Notched Rapier: "A slender rapier with a chipped edge. Fast and precise."
- Chipped Dagger: "A small blade with a nicked edge. Quick draw, quick strike."
- Cracked Blade: "A fractured sword that channels both steel and sorcery."

T2 weapons:
- Steel Longsword: "Forged steel with a keen edge. A significant upgrade over iron."
- Yew Bow: "A flexible yew bow with superior range and draw weight."
- Oak Staff: "A dense oak staff carved with faint runes."
- Flanged Mace: "A reinforced mace with protruding flanges for armor-piercing strikes."
- Hardened Axe: "A tempered axe head on an ironwood haft. Cleaves deep."
- Stiletto: "A needle-thin blade designed for finding gaps in armor."
- Dueling Rapier: "An elegant thrusting sword favored by duelists."
- Tempered Blade: "A balanced blade forged for hybrid combat styles."

T1 armor (cloth/leather/chain/plate for chest/legs/boots): Use pattern "[Quality descriptor] [armorType] [slot]. [Brief note]."
- Worn Robe: "A faded cloth robe. Offers little physical protection."
- Worn Trousers: "Patched cloth leggings. Light and breathable."
- Worn Slippers: "Thin-soled cloth shoes. Quiet on stone floors."
- Scuffed Jerkin: "A leather vest scarred by use. Decent protection for light fighters."
- Scuffed Leggings: "Leather leggings with reinforced knees."
- Scuffed Boots: "Sturdy leather boots built for rough terrain."
- Dented Hauberk: "Chain mail with bent links. Still deflects slashing blows."
- Dented Greaves: "Chain leggings with dented rings. Functional leg protection."
- Dented Sabatons: "Chain boots that clank with every step."
- Battered Cuirass: "Heavy plate chest armor, dented but intact."
- Battered Greaves: "Plate leg guards battered from many battles."
- Battered Boots: "Thick plate boots that absorb heavy impacts."

T2 armor (all entries on compact lines):
- Silken Robe: "Fine silk woven for comfort and moderate protection."
- Silken Trousers: "Light silk leggings tailored for mobility."
- Silken Slippers: "Soft silk shoes that barely make a sound."
- Ranger Jerkin: "Supple leather armor favored by woodsmen."
- Ranger Leggings: "Reinforced leather leggings for wilderness travel."
- Ranger Boots: "Leather boots with thick soles for rough trails."
- Riveted Hauberk: "Chain mail reinforced with riveted links. Sturdy protection."
- Riveted Greaves: "Riveted chain leggings that resist cutting blows."
- Riveted Sabatons: "Heavy chain boots with reinforced toe caps."
- Forged Cuirass: "Expertly forged plate armor. Superior physical defense."
- Forged Greaves: "Thick forged plate leggings. Absorbs punishing blows."
- Forged Boots: "Plate boots forged from high-quality steel."

**1j. Add descriptions to world-drop jewelry in `ensureWorldDropJewelryTemplates`:**

T1 jewelry:
- Copper Band: "A simple copper ring. Lends a touch of might."
- Iron Signet: "A plain iron ring stamped with an unknown crest. Sharpens reflexes."
- Tarnished Loop: "A tarnished silver loop. Hums faintly with arcane resonance."
- Stone Pendant: "A smooth river stone on a leather cord. Calms the mind."
- Bone Charm: "A carved bone talisman said to fortify the body."
- Frayed Cord: "A braided cord set with a pale bead. Draws mana to the wearer."

T2 jewelry:
- Silver Band: "A polished silver ring. Channels physical power."
- Arcane Loop: "A ring inscribed with glowing sigils. Amplifies magical focus."
- Ember Pendant: "A pendant holding a warm ember crystal. Sharpens intuition."
- Vitality Cord: "A thick cord woven with life-thread. Bolsters constitution."

Cloaks (T1):
- Rough Cloak: "A coarse woolen cloak. Keeps the chill off."
- Wool Cloak: "A thick wool cloak. Warmth and slight protection."
- Drifter Cloak: "A road-worn cloak patched many times over."

Cloaks (T2):
- Reinforced Cloak: "A cloak with leather panels sewn into the lining."
- Stalker Cloak: "A dark cloak designed to blend into shadows."

**1k. Add descriptions to crafting base gear in `ensureCraftingBaseGearTemplates`:**

- Iron Helm: "A basic iron helm. Protects the skull from overhead blows."
- Leather Bracers: "Simple leather wrist guards. Deflect glancing strikes."
- Iron Gauntlets: "Heavy iron hand protection. Adds weight behind punches."
- Rough Girdle: "A leather belt reinforced with metal studs."
- Wooden Shield: "A round wooden shield banded with iron."
- Simple Cloak: "A plain travelling cloak offering minimal coverage."
- Cloth Hood / Cloth Wraps / Cloth Gloves / Cloth Sash: "Basic cloth [slot] for apprentice casters." (customize per slot)
- Leather Cap: "A molded leather cap. Lightweight head protection."
- Leather Gloves: "Fitted leather gloves for grip and protection."
- Chain Coif / Chain Bracers / Chain Gauntlets / Chain Girdle: "Standard chain [slot] for martial fighters." (customize per slot)
- Plate Vambraces: "Plate wrist guards. Heavy but nearly impenetrable."
- Plate Girdle: "A broad plate belt protecting the midsection."

Specific descriptions for each:
- Cloth Hood: "A simple cloth hood. Keeps sun and rain at bay."
- Cloth Wraps: "Strips of cloth wound around the wrists. Barely protective."
- Cloth Gloves: "Thin cloth gloves. Dexterous but fragile."
- Cloth Sash: "A cloth belt tied at the waist. Decorative more than defensive."
- Chain Coif: "A chain mail hood covering head and neck."
- Chain Bracers: "Chain mail wrist guards. Sturdy against slashing attacks."
- Chain Gauntlets: "Chain mail gloves offering good hand protection."
- Chain Girdle: "A chain mail belt reinforcing the midsection."

**1l. Add descriptions to recipe scroll templates in `ensureRecipeScrollItemTemplates`:**

Add `description: \`Teaches the ${recipeName} crafting recipe when used.\`` to the fullRow in `ensureRecipeScrollItemTemplates`.

**IMPORTANT:** For every upsert helper that builds a `fullRow` object, ensure the `description` field is included. If a description is `undefined` (because the source data doesn't have one), that's fine — SpacetimeDB optional fields accept undefined. But DO NOT add client-side fallback strings. If the server description is blank, it shows blank.
  </action>
  <verify>
Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` (or equivalent) to verify TypeScript compiles without errors. Grep for `description:` in ensure_items.ts and crafting_materials.ts to confirm all items have descriptions. Count the number of description strings added — should be 140+.
  </verify>
  <done>
Every item template seed in ensure_items.ts passes a `description` field to the DB. MATERIAL_DEFS has description on all 14 entries. CRAFTING_MODIFIER_DEFS descriptions are passed through to ItemTemplate. All resources, consumables, food, junk, starter gear, world-drop gear, jewelry, cloaks, crafting base gear, and recipe scrolls have unique descriptive text.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create shared useItemTooltip composable and migrate all 5 tooltip code paths</name>
  <files>
    src/composables/useItemTooltip.ts
    src/composables/useInventory.ts
    src/composables/useCombat.ts
    src/composables/useCrafting.ts
    src/App.vue
  </files>
  <action>
**2a. Create `src/composables/useItemTooltip.ts` — the single source of truth for building tooltip data from an ItemTemplate row + optional ItemInstance/ItemAffix data.**

This file exports a `buildItemTooltipData` function (not a Vue composable with reactive state — just a pure function) that accepts:

```typescript
import type { ItemTemplateRow, ItemAffixRow } from '../module_bindings';

export type TooltipStatLine = { label: string; value: string };
export type TooltipAffixLine = { label: string; value: string; affixName: string };

export type ItemTooltipData = {
  name: string;
  description: string;
  slot: string;
  armorType: string;
  rarity: string;
  qualityTier: string;
  craftQuality?: string;
  tier: bigint;
  allowedClasses: string;
  stats: TooltipStatLine[];
  affixStats: TooltipAffixLine[];
  isNamed: boolean;
};

type BuildTooltipArgs = {
  template: ItemTemplateRow | null | undefined;
  instance?: {
    id: bigint;
    qualityTier?: string;
    craftQuality?: string;
    displayName?: string;
    isNamed?: boolean;
    quantity?: bigint;
  };
  affixes?: ItemAffixRow[];  // for equipped/inventory items with real affix rows
  affixDataJson?: string;    // for loot items with JSON affix data
  priceOrValue?: { label: string; value: string }; // "Price: 10 gold" or "Value: 5 gold"
};
```

The function:

1. **Name:** Uses `instance?.displayName ?? template?.name ?? 'Unknown'`. If affixDataJson is provided and has prefix/suffix, constructs affixed name (prefix + baseName + "of" + suffix). If instance?.isNamed is true, uses base template name.

2. **Description:** Uses `template?.description || ''`. NO foodDescription fallback, NO computed tier/quality/slot fallback. The server description IS the description. If blank, it's blank. (Food items now have descriptions on the server from Task 1, so the old client-side food description generation is no longer needed.)

3. **Stats:** Builds the standard stat array from template fields. If `affixes` array is provided, sums implicit affix bonuses (affixType === 'implicit') for AC/damage/DPS into the base stat values (matching current useInventory behavior). Always includes: AC, Weapon Damage, Weapon DPS, STR, DEX, CHA, WIS, INT, HP, Mana. Include the priceOrValue line at the end if provided.

4. **Affix stats:** If `affixes` is provided, filters out implicit affixes and maps to `{ label, value, affixName }` using `formatAffixStatKey` (move this helper into this file). If `affixDataJson` is provided, parses it and maps similarly.

5. **Quality/rarity:** `qualityTier = instance?.qualityTier ?? template?.rarity ?? 'common'`. craftQuality from instance if present.

6. **isNamed:** From instance if present, false otherwise.

Also export the `formatAffixStatKey` helper from this file (move it from useInventory.ts — the current `formatAffixStatKeyInv`).

**2b. Refactor `useInventory.ts` — inventoryItems computed:**

- Import `buildItemTooltipData` from `./useItemTooltip`.
- Replace the inline tooltip building (lines ~120-260) with a call to `buildItemTooltipData({ template, instance: { id, qualityTier, craftQuality, displayName, isNamed, quantity }, affixes: instanceAffixes, priceOrValue: vendorValue ? { label: 'Value', value: \`${vendorValue} gold\` } : undefined })`.
- Keep the `equipable`, `usable`, `eatable`, `quantity`, `stackable` logic that is inventory-specific (not tooltip-related).
- Remove `WELL_FED_BUFF_LABELS` constant and `foodDescription` IIFE — no longer needed.
- Remove `formatAffixStatKeyInv` — now imported from useItemTooltip.
- The InventoryItem type should spread ItemTooltipData + the inventory-specific fields (equipable, usable, eatable, quantity, stackable, instanceId, vendorValue, requiredLevel).

**2c. Refactor `useInventory.ts` — equippedSlots computed:**

- Same pattern: call `buildItemTooltipData({ template, instance: { id: instance.id, qualityTier: instance.qualityTier }, affixes: equippedAffixes, priceOrValue: vendorValue ? { label: 'Value', value: \`${vendorValue} gold\` } : undefined })`.
- The EquippedSlot type should include the tooltip data fields.

**2d. Refactor `App.vue` — vendorItems computed (around line 775):**

- Import `buildItemTooltipData` from `./composables/useItemTooltip`.
- Replace the inline tooltip building with: `const tooltipData = buildItemTooltipData({ template, priceOrValue: { label: 'Price', value: \`${row.price} gold\` } })`.
- Remove the `WELL_FED_BUFF_LABELS_VENDOR` constant and `vendorFoodDesc` IIFE — no longer needed.
- Spread tooltipData fields into the returned vendor item object.

**2e. Refactor `useCombat.ts` — pendingLoot computed (around line 257):**

- Import `buildItemTooltipData` from `./useItemTooltip`.
- Replace the inline tooltip building with: `buildItemTooltipData({ template, instance: { id: row.id, qualityTier, isNamed: row.isNamed }, affixDataJson: row.affixDataJson, priceOrValue: template?.vendorValue ? { label: 'Value', value: \`${template.vendorValue} gold\` } : undefined })`.
- Remove `formatAffixStatKey` if it was defined locally in useCombat (check — it may be imported or local).

**2f. Refactor `useCrafting.ts` — recipes outputItem (around line 202):**

- Import `buildItemTooltipData` from `./useItemTooltip`.
- Replace the inline outputItem tooltip building with: `const tooltipData = buildItemTooltipData({ template: output })`. Spread into outputItem. Add requiredLevel from output if needed.

**KEY CONSTRAINT:** Do NOT change the tooltip rendering template in App.vue (lines 508-548). The tooltip template reads `tooltip.item.name`, `tooltip.item.description`, `tooltip.item.stats`, `tooltip.item.affixStats`, `tooltip.item.allowedClasses`, `tooltip.item.armorType`, `tooltip.item.craftQuality`. The `buildItemTooltipData` return type must produce all these fields with compatible types so the existing tooltip template works unchanged.

**KEY CONSTRAINT:** The MODIFIER_DESCRIPTIONS map in useCrafting.ts is used for CraftingModifierItem objects (modifier items in the crafting dialog), NOT for general item tooltips. Leave it as-is — it's a separate code path for the crafting modal UI, not the hover tooltip pipeline. Similarly, MODIFIER_STAT_KEYS and MODIFIER_ITEM_NAMES stay.
  </action>
  <verify>
Run `npx vue-tsc --noEmit` (or the project's TypeScript check command) to verify no type errors. Test that the tooltip renders correctly: hover over an item in inventory, vendor, loot panel, crafting panel, and equipped slot — all should show the server-side description text. Verify no WELL_FED_BUFF_LABELS or foodDescription logic remains in useInventory.ts or App.vue vendorItems.
  </verify>
  <done>
One `buildItemTooltipData` function in `src/composables/useItemTooltip.ts` is the single source of truth. All 5 tooltip code paths (inventoryItems, equippedSlots, vendorItems, pendingLoot, crafting outputItem) delegate to it. No duplicate WELL_FED_BUFF_LABELS maps. No client-side description fallback strings. The tooltip template in App.vue renders all item descriptions from the server without changes.
  </done>
</task>

<task type="auto">
  <name>Task 3: Publish module, generate bindings, and verify end-to-end</name>
  <files>
    src/module_bindings/
  </files>
  <action>
1. Publish the SpacetimeDB module: `spacetime publish uwr --project-path spacetimedb` (NO --clear-database — this is content-only, all seeding uses upsert patterns, decision #154).
2. Generate fresh client bindings: `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb`.
3. Build the client to verify no TypeScript errors: `npm run build` (or the project's build command).
4. Check server logs for any seeding errors: `spacetime logs uwr`.
5. If the module is not running locally, use whatever publish target is configured (check `spacetime server list` for the default).
  </action>
  <verify>
`spacetime logs uwr` shows no errors during syncAllContent. `npm run build` succeeds with no TypeScript errors. The client compiles and the module is published.
  </verify>
  <done>
Module published with all item descriptions populated. Client bindings regenerated. Build succeeds. No runtime errors in server logs.
  </done>
</task>

</tasks>

<verification>
1. Grep ensure_items.ts for `description:` — every upsert call should include it
2. Grep crafting_materials.ts MATERIAL_DEFS for `description:` — all 14 entries should have it
3. Grep useInventory.ts, useCombat.ts, App.vue for `WELL_FED_BUFF_LABELS` — should find zero results
4. Grep useInventory.ts for `foodDescription` — should find zero results
5. Grep src/composables/ for `buildItemTooltipData` — should find imports in useInventory, useCombat, useCrafting
6. Grep App.vue for `buildItemTooltipData` — should find import for vendorItems
7. Count description strings in ensure_items.ts — should be 140+
</verification>

<success_criteria>
- Every item template in the database has a non-empty description field
- All 5 tooltip code paths use the shared buildItemTooltipData function
- No duplicate WELL_FED_BUFF_LABELS maps exist anywhere in the client
- No client-side description fallback strings (foodDescription, computed tier/quality/slot strings)
- TypeScript compiles without errors on both server and client
- Module publishes and seeds without errors
</success_criteria>

<output>
After completion, create `.planning/quick/193-add-descriptions-to-all-item-templates-r/193-01-SUMMARY.md`
</output>
