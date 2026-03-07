import { SenderError } from 'spacetimedb/server';
import { findItemTemplateByName, STARTER_ARMOR, STARTER_WEAPONS } from '../helpers/items';
import { ItemTemplate } from '../schema/tables';
import { MATERIAL_DEFS, CONSUMABLE_RECIPES, GEAR_RECIPES, GEAR_RECIPE_NAMES, CRAFTING_MODIFIER_DEFS } from '../data/crafting_materials';
import {
  ARMOR_ALLOWED_CLASSES,
  STARTER_ARMOR_DESCS,
  STARTER_WEAPON_DEFS,
  STARTER_ACCESSORY_DEFS,
  JUNK_DEFS,
  RESOURCE_DEFS,
  WORLD_DROP_GEAR_DEFS,
  WORLD_DROP_JEWELRY_DEFS,
  CRAFTING_BASE_GEAR_DEFS,
} from '../data/item_defs';
import { BOSS_DROP_DEFS } from '../data/named_enemy_defs';

/** Unified recipe template upsert helper — replaces addRecipe and addGearRecipe */
function addRecipeTemplate(ctx: any, args: {
  key: string;
  name: string;
  output: any;
  outputCount: bigint;
  req1: any;
  req1Count: bigint;
  req2: any;
  req2Count: bigint;
  req3?: any;
  req3Count?: bigint;
  recipeType?: string;
  materialType?: string;
}) {
  if (!args.output || !args.req1 || !args.req2) return;
  const existing = [...ctx.db.recipe_template.iter()].find((row: any) => row.key === args.key);
  if (existing) {
    ctx.db.recipe_template.id.update({
      ...existing,
      key: args.key,
      name: args.name,
      outputTemplateId: args.output.id,
      outputCount: args.outputCount,
      req1TemplateId: args.req1.id,
      req1Count: args.req1Count,
      req2TemplateId: args.req2.id,
      req2Count: args.req2Count,
      req3TemplateId: args.req3?.id,
      req3Count: args.req3Count,
      recipeType: args.recipeType ?? existing.recipeType ?? 'consumable',
      materialType: args.materialType ?? existing.materialType,
    });
    return;
  }
  ctx.db.recipe_template.insert({
    id: 0n,
    key: args.key,
    name: args.name,
    outputTemplateId: args.output.id,
    outputCount: args.outputCount,
    req1TemplateId: args.req1.id,
    req1Count: args.req1Count,
    req2TemplateId: args.req2.id,
    req2Count: args.req2Count,
    req3TemplateId: args.req3?.id,
    req3Count: args.req3Count,
    recipeType: args.recipeType ?? 'consumable',
    materialType: args.materialType,
  });
}

export function ensureStarterItemTemplates(ctx: any) {
  const upsertItemTemplateByName = (row: any) => {
    const fullRow = {
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
      weaponType: '',
      magicResistanceBonus: 0n,
      ...row,
    };
    const existing = findItemTemplateByName(ctx, fullRow.name);
    if (existing) {
      ctx.db.item_template.id.update({
        ...existing,
        ...fullRow,
        id: existing.id,
      });
      return existing;
    }
    return ctx.db.item_template.insert({
      id: 0n,
      ...fullRow,
    });
  };

  for (const [armorType, pieces] of Object.entries(STARTER_ARMOR)) {
    const armorDesc = STARTER_ARMOR_DESCS[armorType] ?? '';
    upsertItemTemplateByName({
      name: pieces.chest.name,
      slot: 'chest',
      armorType,
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 2n,
      requiredLevel: 1n,
      allowedClasses: ARMOR_ALLOWED_CLASSES[armorType] ?? 'any',
      description: armorDesc,
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: pieces.chest.ac,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      stackable: false,
    });
    upsertItemTemplateByName({
      name: pieces.legs.name,
      slot: 'legs',
      armorType,
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 2n,
      requiredLevel: 1n,
      allowedClasses: ARMOR_ALLOWED_CLASSES[armorType] ?? 'any',
      description: armorDesc,
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: pieces.legs.ac,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      stackable: false,
    });
    upsertItemTemplateByName({
      name: pieces.boots.name,
      slot: 'boots',
      armorType,
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 2n,
      requiredLevel: 1n,
      allowedClasses: ARMOR_ALLOWED_CLASSES[armorType] ?? 'any',
      description: armorDesc,
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: pieces.boots.ac,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      stackable: false,
    });
  }

  // Starter weapon stats scaled inversely with weapon speed for DPS parity
  // Formula: rawWeaponDamage = 5 + level + baseDamage + (dps / 2)
  // Effective DPS = rawWeaponDamage / speed_seconds
  const STARTER_WEAPON_STATS: Record<string, { baseDamage: bigint; dps: bigint }> = {
    dagger:     { baseDamage: 2n, dps: 3n },  // Fast 3.0s  — raw: 5+1+2+1 = 9,  DPS: 3.0
    rapier:     { baseDamage: 2n, dps: 3n },  // Fast 3.0s  — raw: 5+1+2+1 = 9,  DPS: 3.0
    sword:      { baseDamage: 3n, dps: 4n },  // Normal 3.5s — raw: 5+1+3+2 = 11, DPS: 3.14
    blade:      { baseDamage: 3n, dps: 4n },  // Normal 3.5s — raw: 5+1+3+2 = 11, DPS: 3.14
    mace:       { baseDamage: 3n, dps: 4n },  // Normal 3.5s — raw: 5+1+3+2 = 11, DPS: 3.14
    axe:        { baseDamage: 4n, dps: 5n },  // Medium 4.0s — raw: 5+1+4+2 = 12, DPS: 3.0
    staff:      { baseDamage: 7n, dps: 8n },  // Slow 5.0s  — raw: 5+1+7+4 = 17, DPS: 3.4 (2H)
    bow:        { baseDamage: 7n, dps: 8n },  // Slow 5.0s  — raw: 5+1+7+4 = 17, DPS: 3.4 (2H)
    greatsword: { baseDamage: 8n, dps: 9n },  // Slow 5.0s  — raw: 5+1+8+4 = 18, DPS: 3.6 (2H)
  };

  for (const weapon of STARTER_WEAPON_DEFS) {
    const stats = STARTER_WEAPON_STATS[weapon.weaponType] ?? { baseDamage: 3n, dps: 5n };
    upsertItemTemplateByName({
      name: weapon.name,
      slot: 'mainHand',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 3n,
      requiredLevel: 1n,
      allowedClasses: weapon.allowed,
      description: weapon.description,
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: stats.baseDamage,
      weaponDps: stats.dps,
      weaponType: weapon.weaponType,
      stackable: false,
    });
  }

  for (const template of STARTER_ACCESSORY_DEFS) {
    upsertItemTemplateByName({
      name: template.name,
      slot: template.slot,
      armorType: 'none',
      rarity: template.rarity,
      tier: 1n,
      isJunk: false,
      vendorValue: template.rarity === 'uncommon' ? 8n : 5n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      description: template.description,
      strBonus: template.stat.strBonus ?? 0n,
      dexBonus: template.stat.dexBonus ?? 0n,
      chaBonus: template.stat.chaBonus ?? 0n,
      wisBonus: template.stat.wisBonus ?? 0n,
      intBonus: template.stat.intBonus ?? 0n,
      hpBonus: template.stat.hpBonus ?? 0n,
      manaBonus: template.stat.manaBonus ?? 0n,
      armorClassBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      stackable: false,
    });
  }

  for (const junk of JUNK_DEFS) {
    upsertItemTemplateByName({
      name: junk.name,
      slot: 'junk',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: true,
      vendorValue: junk.vendorValue,
      requiredLevel: 1n,
      allowedClasses: 'any',
      description: junk.description,
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      stackable: true,
    });
  }
}

export function ensureWorldDropGearTemplates(ctx: any) {
  const upsertByName = (row: any) => {
    const fullRow = {
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
      weaponType: '',
      magicResistanceBonus: 0n,
      ...row,
    };
    const existing = findItemTemplateByName(ctx, fullRow.name);
    if (existing) {
      ctx.db.item_template.id.update({ ...existing, ...fullRow, id: existing.id });
      return existing;
    }
    return ctx.db.item_template.insert({ id: 0n, ...fullRow });
  };

  for (const item of WORLD_DROP_GEAR_DEFS) {
    upsertByName({
      ...item,
      isJunk: false,
      strBonus: item.strBonus ?? 0n,
      dexBonus: item.dexBonus ?? 0n,
      chaBonus: item.chaBonus ?? 0n,
      wisBonus: item.wisBonus ?? 0n,
      intBonus: item.intBonus ?? 0n,
      hpBonus: item.hpBonus ?? 0n,
      manaBonus: item.manaBonus ?? 0n,
      armorClassBonus: item.armorClassBonus ?? 0n,
      weaponBaseDamage: item.weaponBaseDamage ?? 0n,
      weaponDps: item.weaponDps ?? 0n,
      stackable: false,
    });
  }
}

export function ensureWorldDropJewelryTemplates(ctx: any) {
  const upsertByName = (row: any) => {
    const fullRow = {
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
      weaponType: '',
      magicResistanceBonus: 0n,
      ...row,
    };
    const existing = findItemTemplateByName(ctx, fullRow.name);
    if (existing) {
      ctx.db.item_template.id.update({ ...existing, ...fullRow, id: existing.id });
      return existing;
    }
    return ctx.db.item_template.insert({ id: 0n, ...fullRow });
  };

  for (const item of WORLD_DROP_JEWELRY_DEFS) {
    upsertByName({
      ...item,
      isJunk: false,
      strBonus: item.strBonus ?? 0n,
      dexBonus: item.dexBonus ?? 0n,
      chaBonus: item.chaBonus ?? 0n,
      wisBonus: item.wisBonus ?? 0n,
      intBonus: item.intBonus ?? 0n,
      hpBonus: item.hpBonus ?? 0n,
      manaBonus: item.manaBonus ?? 0n,
      armorClassBonus: item.armorClassBonus ?? 0n,
      weaponBaseDamage: item.weaponBaseDamage ?? 0n,
      weaponDps: item.weaponDps ?? 0n,
      stackable: false,
    });
  }
}

export function ensureBossDropTemplates(ctx: any) {
  const upsertByName = (row: any) => {
    const fullRow = {
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
      weaponType: '',
      magicResistanceBonus: 0n,
      ...row,
    };
    const existing = findItemTemplateByName(ctx, fullRow.name);
    if (existing) {
      ctx.db.item_template.id.update({ ...existing, ...fullRow, id: existing.id });
      return existing;
    }
    return ctx.db.item_template.insert({ id: 0n, ...fullRow });
  };

  for (const item of BOSS_DROP_DEFS) {
    upsertByName({
      ...item,
      isJunk: false,
      strBonus: item.strBonus ?? 0n,
      dexBonus: item.dexBonus ?? 0n,
      chaBonus: item.chaBonus ?? 0n,
      wisBonus: item.wisBonus ?? 0n,
      intBonus: item.intBonus ?? 0n,
      hpBonus: item.hpBonus ?? 0n,
      manaBonus: item.manaBonus ?? 0n,
      armorClassBonus: item.armorClassBonus ?? 0n,
      weaponBaseDamage: item.weaponBaseDamage ?? 0n,
      weaponDps: item.weaponDps ?? 0n,
      stackable: false,
    });
  }
}

export function ensureResourceItemTemplates(ctx: any) {
  const upsertResourceByName = (row: any) => {
    const fullRow = {
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      weaponType: '',
      stackable: true,
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
      ...row,
    };
    const existing = findItemTemplateByName(ctx, fullRow.name);
    if (existing) {
      ctx.db.item_template.id.update({ ...existing, ...fullRow, id: existing.id });
      return existing;
    }
    return ctx.db.item_template.insert({ id: 0n, ...fullRow });
  };

  for (const resource of RESOURCE_DEFS) {
    upsertResourceByName({ name: resource.name, slot: resource.slot, vendorValue: resource.vendorValue, description: resource.description });
  }

  for (const recipe of CONSUMABLE_RECIPES) {
    if (recipe.foodBuff) continue; // food items handled by ensureFoodItemTemplates
    upsertResourceByName({
      name: recipe.outputName,
      slot: recipe.outputSlot,
      vendorValue: recipe.outputVendorValue,
      description: recipe.description,
    });
  }
}

export function ensureFoodItemTemplates(ctx: any) {
  // Food items from CONSUMABLE_RECIPES (have foodBuff data)
  // Healer's Porridge is now in CONSUMABLE_RECIPES so recipeFoodItems already includes it
  const recipeFoodItems = CONSUMABLE_RECIPES
    .filter(r => r.foodBuff)
    .map(r => ({
      name: r.outputName,
      wellFedDurationMicros: r.foodBuff!.durationMicros,
      wellFedBuffType: r.foodBuff!.buffType,
      wellFedBuffMagnitude: r.foodBuff!.magnitude,
      description: r.description,
    }));

  for (const food of recipeFoodItems) {
    const existing = findItemTemplateByName(ctx, food.name);
    if (existing) {
      ctx.db.item_template.id.update({
        ...existing,
        description: food.description,
        wellFedDurationMicros: food.wellFedDurationMicros,
        wellFedBuffType: food.wellFedBuffType,
        wellFedBuffMagnitude: food.wellFedBuffMagnitude,
      });
      continue;
    }
    ctx.db.item_template.insert({
      id: 0n,
      name: food.name,
      slot: 'food',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 3n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      description: food.description,
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      weaponType: '',
      stackable: true,
      wellFedDurationMicros: food.wellFedDurationMicros,
      wellFedBuffType: food.wellFedBuffType,
      wellFedBuffMagnitude: food.wellFedBuffMagnitude,
    });
  }
}

export function ensureRecipeTemplates(ctx: any) {
  for (const recipe of CONSUMABLE_RECIPES) {
    const output = findItemTemplateByName(ctx, recipe.outputName);
    const req1 = findItemTemplateByName(ctx, recipe.req1Name);
    const req2 = findItemTemplateByName(ctx, recipe.req2Name);
    const req3 = recipe.req3Name ? findItemTemplateByName(ctx, recipe.req3Name) : undefined;
    addRecipeTemplate(ctx, {
      key: recipe.key,
      name: recipe.name,
      output,
      outputCount: recipe.outputCount,
      req1,
      req1Count: recipe.req1Count,
      req2,
      req2Count: recipe.req2Count,
      req3,
      req3Count: recipe.req3Count,
    });
  }
}


// ---------------------------------------------------------------------------
// GEAR MATERIAL ITEM TEMPLATES
// Seeds one ItemTemplate per crafting material (slot='resource', stackable=true).
// All 14 materials seeded here: 10 original (Tier 1-3) + 4 Essence variants.
// Iron Ore/Iron Shard: Iron Shard already exists. Iron Ore is a NEW separate template
// with consistent naming for the crafting system.
// ---------------------------------------------------------------------------

export function ensureGearMaterialItemTemplates(ctx: any) {
  for (const mat of MATERIAL_DEFS) {
    const fullRow = {
      name: mat.name,
      slot: 'resource',
      armorType: 'none',
      rarity: 'common',
      tier: mat.tier,
      isJunk: false,
      vendorValue: mat.vendorValue ?? 1n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      description: mat.description,
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      weaponType: '',
      stackable: true,
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
    };
    const existing = findItemTemplateByName(ctx, mat.name);
    if (existing) {
      ctx.db.item_template.id.update({ ...existing, ...fullRow, id: existing.id });
      continue;
    }
    ctx.db.item_template.insert({ id: 0n, ...fullRow });
  }
}

// ---------------------------------------------------------------------------
// BASE GEAR TEMPLATES FOR CRAFTING OUTPUT
// Seeds ItemTemplates for gear slots not covered by ensureWorldDropGearTemplates:
// head, wrists, hands, belt, offHand (shield), cloak (via neck slot).
// These are "crafting base" items — common quality, no stats, used as recipe output.
// ---------------------------------------------------------------------------

export function ensureCraftingBaseGearTemplates(ctx: any) {
  const upsertByName = (row: any) => {
    const fullRow = {
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
      weaponType: '',
      magicResistanceBonus: 0n,
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      stackable: false,
      ...row,
    };
    const existing = findItemTemplateByName(ctx, fullRow.name);
    if (existing) {
      ctx.db.item_template.id.update({ ...existing, ...fullRow, id: existing.id });
      return existing;
    }
    return ctx.db.item_template.insert({ id: 0n, ...fullRow });
  };

  for (const item of CRAFTING_BASE_GEAR_DEFS) {
    upsertByName(item);
  }
}

// ---------------------------------------------------------------------------
// GEAR RECIPE TEMPLATES
// Seeds one RecipeTemplate per gear type (weapon/armor/accessory).
// Material TYPE is chosen by the player at craft time — Plan 02 reducer handles this.
// For seeding, req1 = copper_ore (T1 metallic) with count 4n as base cost.
// req2 = rough_hide (T1 hide) as a secondary material requirement.
// ---------------------------------------------------------------------------

export function ensureGearRecipeTemplates(ctx: any) {
  for (const recipe of GEAR_RECIPES) {
    const output = findItemTemplateByName(ctx, recipe.outputName);
    const req1 = findItemTemplateByName(ctx, recipe.req1Name);
    const req2 = findItemTemplateByName(ctx, recipe.req2Name);
    const req3 = recipe.req3Name ? findItemTemplateByName(ctx, recipe.req3Name) : undefined;
    if (!req1 || !req2) continue;
    addRecipeTemplate(ctx, {
      key: recipe.key,
      name: recipe.name,
      output,
      outputCount: 1n,
      req1,
      req1Count: recipe.req1Count,
      req2,
      req2Count: recipe.req2Count,
      req3,
      req3Count: recipe.req3Count,
      recipeType: recipe.recipeType,
    });
  }
}

// ---------------------------------------------------------------------------
// CRAFTING MODIFIER ITEM TEMPLATES
// Seeds one ItemTemplate per crafting modifier (slot='material', stackable=true).
// These are consumed in the crafting dialog to add stat affixes to crafted gear.
// ---------------------------------------------------------------------------

export function ensureCraftingModifierItemTemplates(ctx: any) {
  for (const mod of CRAFTING_MODIFIER_DEFS) {
    const fullRow = {
      name: mod.name,
      slot: 'material',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 5n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      description: mod.description,
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      weaponType: '',
      stackable: true,
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
    };
    const existing = findItemTemplateByName(ctx, mod.name);
    if (existing) {
      ctx.db.item_template.id.update({ ...existing, ...fullRow, id: existing.id });
      continue;
    }
    ctx.db.item_template.insert({ id: 0n, ...fullRow });
  }
}

// ---------------------------------------------------------------------------
// RECIPE SCROLL ITEM TEMPLATES
// One scroll per gear recipe, used as a "recipe discovery" item.
// Slots: resource, stackable=true, rarity=uncommon, tier=1.
// ---------------------------------------------------------------------------

export function ensureRecipeScrollItemTemplates(ctx: any) {
  for (const recipeName of GEAR_RECIPE_NAMES) {
    const scrollName = `Scroll: ${recipeName}`;
    const fullRow = {
      name: scrollName,
      slot: 'resource',
      armorType: 'none',
      rarity: 'uncommon',
      tier: 1n,
      isJunk: false,
      vendorValue: 10n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      description: `Teaches the ${recipeName} crafting recipe when used.`,
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      weaponType: '',
      stackable: true,
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
    };
    const existing = findItemTemplateByName(ctx, scrollName);
    if (existing) {
      ctx.db.item_template.id.update({ ...existing, ...fullRow, id: existing.id });
      continue;
    }
    ctx.db.item_template.insert({ id: 0n, ...fullRow });
  }
}
