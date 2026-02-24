import { buildDisplayName, findItemTemplateByName } from '../helpers/items';
import { getMaterialForSalvage, SALVAGE_YIELD_BY_TIER, MATERIAL_DEFS, materialTierToCraftQuality, getCraftQualityStatBonus, CRAFTING_MODIFIER_DEFS, AFFIX_SLOTS_BY_QUALITY, ESSENCE_MAGNITUDE, ESSENCE_QUALITY_GATE, getModifierMagnitude } from '../data/crafting_materials';
import { statOffset, INT_SALVAGE_BONUS_PER_POINT, SALVAGE_SCROLL_CHANCE_BASE } from '../data/combat_scaling.js';

export const registerItemCraftingReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    requireCharacterOwnedBy,
    appendPrivateEvent,
    getItemCount,
    removeItemFromInventory,
    addItemToInventory,
    EQUIPMENT_SLOTS,
    fail,
  } = deps;

  const failItem = (ctx: any, character: any, message: string) =>
    fail(ctx, character, message, 'system');

  spacetimedb.reducer('research_recipes', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const location = ctx.db.location.id.find(character.locationId);
    if (!location?.craftingAvailable) {
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        'Crafting is only available at locations with crafting stations.'
      );
      return;
    }
    const discovered = new Set(
      [...ctx.db.recipe_discovered.by_character.filter(character.id)].map((row) =>
        row.recipeTemplateId.toString()
      )
    );
    let found = 0;
    for (const recipe of ctx.db.recipe_template.iter()) {
      if (discovered.has(recipe.id.toString())) continue;
      // Skip gear recipes — only consumables are auto-discoverable
      // Gear recipes require salvaging or recipe scrolls
      const isGearRecipe = recipe.recipeType && recipe.recipeType !== 'consumable';
      if (isGearRecipe) continue;
      const req1Count = getItemCount(ctx, character.id, recipe.req1TemplateId);
      const req2Count = getItemCount(ctx, character.id, recipe.req2TemplateId);
      const req3Count =
        recipe.req3TemplateId != null
          ? getItemCount(ctx, character.id, recipe.req3TemplateId)
          : 0n;
      const meetsReq3 = recipe.req3TemplateId == null || req3Count >= (recipe.req3Count ?? 0n);
      if (req1Count >= recipe.req1Count && req2Count >= recipe.req2Count && meetsReq3) {
        ctx.db.recipe_discovered.insert({
          id: 0n,
          characterId: character.id,
          recipeTemplateId: recipe.id,
          discoveredAt: ctx.timestamp,
        });
        const req1 = ctx.db.item_template.id.find(recipe.req1TemplateId);
        const req2 = ctx.db.item_template.id.find(recipe.req2TemplateId);
        const req3 = recipe.req3TemplateId
          ? ctx.db.item_template.id.find(recipe.req3TemplateId)
          : null;
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'system',
          `You discover ${recipe.name} because you have ${req1?.name ?? 'materials'} and ${req2?.name ?? 'materials'}${req3 ? ` and ${req3.name}` : ''}.`
        );
        found += 1;
      }
    }
    if (found === 0) {
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        'You discover nothing new.'
      );
    }
  });

  // Maps stat key → readable affix suffix name for crafted items
  const statKeyToAffix = (statKey: string): string => {
    const map: Record<string, string> = {
      strBonus: 'of Strength',
      dexBonus: 'of Dexterity',
      intBonus: 'of Intelligence',
      wisBonus: 'of Wisdom',
      chaBonus: 'of Charisma',
      hpBonus: 'of Vitality',
      manaBonus: 'of the Arcane',
      armorClassBonus: 'of Warding',
      magicResistanceBonus: 'of Magic Resistance',
    };
    return map[statKey] ?? 'of Power';
  };

  spacetimedb.reducer(
    'craft_recipe',
    {
      characterId: t.u64(),
      recipeTemplateId: t.u64(),
      catalystTemplateId: t.u64().optional(),
      modifier1TemplateId: t.u64().optional(),
      modifier2TemplateId: t.u64().optional(),
      modifier3TemplateId: t.u64().optional(),
    },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const location = ctx.db.location.id.find(character.locationId);
      if (!location?.craftingAvailable) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'system',
          'Crafting is only available at locations with crafting stations.'
        );
        return;
      }
      const recipe = ctx.db.recipe_template.id.find(args.recipeTemplateId);
      if (!recipe) return failItem(ctx, character, 'Recipe not found');
      const discovered = [...ctx.db.recipe_discovered.by_character.filter(character.id)].find(
        (row) => row.recipeTemplateId === recipe.id
      );
      if (!discovered) return failItem(ctx, character, 'Recipe not discovered');
      const req1Count = getItemCount(ctx, character.id, recipe.req1TemplateId);
      const req2Count = getItemCount(ctx, character.id, recipe.req2TemplateId);
      const req3Count =
        recipe.req3TemplateId != null
          ? getItemCount(ctx, character.id, recipe.req3TemplateId)
          : 0n;
      if (
        req1Count < recipe.req1Count ||
        req2Count < recipe.req2Count ||
        (recipe.req3TemplateId != null && req3Count < (recipe.req3Count ?? 0n))
      ) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'system',
          'Missing materials to craft this recipe.'
        );
        return;
      }
      removeItemFromInventory(ctx, character.id, recipe.req1TemplateId, recipe.req1Count);
      removeItemFromInventory(ctx, character.id, recipe.req2TemplateId, recipe.req2Count);
      if (recipe.req3TemplateId != null && recipe.req3Count != null) {
        removeItemFromInventory(ctx, character.id, recipe.req3TemplateId, recipe.req3Count);
      }
      addItemToInventory(ctx, character.id, recipe.outputTemplateId, recipe.outputCount);
      const output = ctx.db.item_template.id.find(recipe.outputTemplateId);

      // --- Gear recipe affix application (catalyst + modifier system) ---
      let craftedDisplayName = output?.name ?? recipe.name;
      const isGearRecipe = recipe.recipeType && recipe.recipeType !== 'consumable';
      if (isGearRecipe && output) {
        // Determine craft quality from primary material tier
        const req1Template = ctx.db.item_template.id.find(recipe.req1TemplateId);
        const materialKey = req1Template
          ? req1Template.name.toLowerCase().replace(/\s+/g, '_')
          : '';
        const materialDef = MATERIAL_DEFS.find((m) => m.key === materialKey);
        const materialTier = materialDef ? materialDef.tier : 1n;
        const craftQuality = materialTierToCraftQuality(materialTier);
        const qualityTier = 'common';

        // Find the newly created ItemInstance
        const newInstance = [...ctx.db.item_instance.by_owner.filter(character.id)].find(
          (i) => i.templateId === recipe.outputTemplateId && !i.equippedSlot && !i.qualityTier && !i.craftQuality
        );

        if (newInstance) {
          const appliedAffixes: { affixType: string; affixKey: string; affixName: string; statKey: string; magnitude: bigint }[] = [];

          // --- Catalyst (Essence) + Modifier logic ---
          if (args.catalystTemplateId) {
            const catalystTemplate = ctx.db.item_template.id.find(args.catalystTemplateId);
            const catalystKey = catalystTemplate
              ? catalystTemplate.name.toLowerCase().replace(/\s+/g, '_')
              : '';
            const magnitude = ESSENCE_MAGNITUDE[catalystKey] ?? 1n;
            const slotsAvailable = AFFIX_SLOTS_BY_QUALITY[craftQuality] ?? 1;
            const allowedQualities = ESSENCE_QUALITY_GATE[catalystKey] ?? [];

            if (!allowedQualities.includes(craftQuality)) {
              return failItem(ctx, character, 'Essence tier too low for this craft quality');
            }
            if (getItemCount(ctx, character.id, args.catalystTemplateId) < 1n) {
              return failItem(ctx, character, 'Missing catalyst (Essence)');
            }
            removeItemFromInventory(ctx, character.id, args.catalystTemplateId, 1n);

            // Collect modifier IDs up to available slots
            const modifierIds = [args.modifier1TemplateId, args.modifier2TemplateId, args.modifier3TemplateId]
              .filter((id): id is bigint => id != null)
              .slice(0, slotsAvailable);

            for (const modId of modifierIds) {
              const modTemplate = ctx.db.item_template.id.find(modId);
              if (!modTemplate) continue;
              const modKey = modTemplate.name.toLowerCase().replace(/\s+/g, '_');
              const modDef = CRAFTING_MODIFIER_DEFS.find((d) => d.key === modKey);
              if (!modDef) continue;

              if (getItemCount(ctx, character.id, modId) < 1n) {
                return failItem(ctx, character, `Missing modifier: ${modTemplate.name}`);
              }
              removeItemFromInventory(ctx, character.id, modId, 1n);

              const modMagnitude = getModifierMagnitude(catalystKey, modDef.statKey);
              appliedAffixes.push({
                affixType: 'suffix',
                affixKey: `crafted_${modDef.statKey}`,
                affixName: statKeyToAffix(modDef.statKey),
                statKey: modDef.statKey,
                magnitude: modMagnitude,
              });
            }

            // Both Essence and at least one valid reagent are required to apply affixes
            if (appliedAffixes.length === 0) {
              return failItem(ctx, character, 'Must provide at least one reagent when using an Essence');
            }

            // Insert affix rows for modifier-based affixes
            for (const affix of appliedAffixes) {
              ctx.db.item_affix.insert({
                id: 0n,
                itemInstanceId: newInstance.id,
                affixType: affix.affixType,
                affixKey: affix.affixKey,
                affixName: affix.affixName,
                statKey: affix.statKey,
                magnitude: affix.magnitude,
              });
            }

            if (appliedAffixes.length > 0) {
              craftedDisplayName = buildDisplayName(output.name, appliedAffixes);
            }
          }

          // --- Implicit craft quality base stat bonus (unchanged) ---
          const statBonus = getCraftQualityStatBonus(craftQuality);
          if (statBonus > 0n) {
            if (output.armorClassBonus > 0n) {
              ctx.db.item_affix.insert({
                id: 0n,
                itemInstanceId: newInstance.id,
                affixType: 'implicit',
                affixKey: 'craft_quality_ac',
                affixName: 'Quality',
                statKey: 'armorClassBonus',
                magnitude: statBonus,
              });
            }
            if (output.weaponBaseDamage > 0n) {
              ctx.db.item_affix.insert({
                id: 0n,
                itemInstanceId: newInstance.id,
                affixType: 'implicit',
                affixKey: 'craft_quality_dmg',
                affixName: 'Quality',
                statKey: 'weaponBaseDamage',
                magnitude: statBonus,
              });
              ctx.db.item_affix.insert({
                id: 0n,
                itemInstanceId: newInstance.id,
                affixType: 'implicit',
                affixKey: 'craft_quality_dps',
                affixName: 'Quality',
                statKey: 'weaponDps',
                magnitude: statBonus,
              });
            }
          }

          ctx.db.item_instance.id.update({
            ...newInstance,
            qualityTier,
            craftQuality,
            displayName: appliedAffixes.length > 0 ? craftedDisplayName : undefined,
          });
        }
      }

      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'reward',
        `You craft ${craftedDisplayName}.`
      );
    }
  );

  spacetimedb.reducer(
    'learn_recipe_scroll',
    { characterId: t.u64(), itemInstanceId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);

      // Find the scroll item
      const instance = ctx.db.item_instance.id.find(args.itemInstanceId);
      if (!instance) return failItem(ctx, character, 'Item not found');
      if (instance.ownerCharacterId !== character.id) return failItem(ctx, character, 'Not your item');

      const template = ctx.db.item_template.id.find(instance.templateId);
      if (!template) return failItem(ctx, character, 'Template not found');

      // Verify it's a recipe scroll
      if (!template.name.startsWith('Scroll:')) return failItem(ctx, character, 'Not a recipe scroll');

      // Extract recipe name from scroll name: "Scroll: Longsword" → "Longsword"
      const recipeName = template.name.replace('Scroll: ', '').trim();
      const recipe = [...ctx.db.recipe_template.iter()].find((r) => r.name === recipeName);
      if (!recipe) return failItem(ctx, character, 'No recipe found for this scroll');

      // Check if already known
      const alreadyKnown = [...ctx.db.recipe_discovered.by_character.filter(character.id)]
        .some((r) => r.recipeTemplateId === recipe.id);

      if (alreadyKnown) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          `You already know: ${recipe.name}`);
      } else {
        ctx.db.recipe_discovered.insert({
          id: 0n,
          characterId: character.id,
          recipeTemplateId: recipe.id,
          discoveredAt: ctx.timestamp,
        });
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          `You have learned: ${recipe.name}`);
      }

      // Consume the scroll (remove 1 from stack)
      removeItemFromInventory(ctx, character.id, instance.templateId, 1n);
    }
  );

  spacetimedb.reducer('salvage_item', { characterId: t.u64(), itemInstanceId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const instance = ctx.db.item_instance.id.find(args.itemInstanceId);
    if (!instance) return failItem(ctx, character, 'Item not found');
    if (instance.ownerCharacterId !== character.id) return failItem(ctx, character, 'Not your item');
    if (instance.equippedSlot) return failItem(ctx, character, 'Unequip item first');

    const template = ctx.db.item_template.id.find(instance.templateId);
    if (!template) return failItem(ctx, character, 'Item template not found');

    // Only gear in equipment slots can be salvaged
    if (template.isJunk) return failItem(ctx, character, 'Cannot salvage junk items');
    const nonSalvageSlots = ['consumable', 'food', 'resource', 'quest', 'junk'];
    if (nonSalvageSlots.includes(template.slot)) {
      return failItem(ctx, character, 'Cannot salvage this item type');
    }
    if (!EQUIPMENT_SLOTS.has(template.slot)) {
      return failItem(ctx, character, 'Cannot salvage this item type');
    }

    const itemName = instance.displayName ?? template.name;
    const tier = template.tier ?? 1n;

    // --- Material yield ---
    const materialName = getMaterialForSalvage(template.slot, template.armorType, tier);
    if (materialName) {
      const materialTemplate = findItemTemplateByName(ctx, materialName);
      if (materialTemplate) {
        const yieldCount = SALVAGE_YIELD_BY_TIER[Number(tier)] ?? 2n;
        addItemToInventory(ctx, character.id, materialTemplate.id, yieldCount);
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
          `You salvaged ${itemName} and received ${yieldCount}x ${materialTemplate.name}.`);
      }
    }

    // --- Bonus modifier reagent yield (12% chance, affix-constrained) ---
    // Collect the unique statKey set from this item's actual ItemAffix rows.
    // Affix deletion happens later, so rows still exist here.
    const affixStatKeys = new Set(
      [...ctx.db.item_affix.by_instance.filter(instance.id)].map(a => a.statKey)
    );
    // Only yield reagents whose statKey matches one of the item's actual affixes.
    const filteredModDefs = CRAFTING_MODIFIER_DEFS.filter(d => affixStatKeys.has(d.statKey));
    if (filteredModDefs.length > 0) {
      const modifierRoll = (ctx.timestamp.microsSinceUnixEpoch + args.itemInstanceId * 13n) % 100n;
      if (modifierRoll < 12n) {
        const modIdx = Number((args.itemInstanceId + character.id) % BigInt(filteredModDefs.length));
        const modDef = filteredModDefs[modIdx];
        const modifierTemplate = findItemTemplateByName(ctx, modDef.name);
        if (modifierTemplate) {
          addItemToInventory(ctx, character.id, modifierTemplate.id, 1n);
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
            `You also found 1x ${modDef.name} while salvaging.`);
        }
      }
    }

    // --- INT-boosted recipe scroll drop (replaces auto-learn) ---
    // Find a recipe that outputs this item type
    const matchingRecipe = [...ctx.db.recipe_template.iter()].find(
      (r) => r.outputTemplateId === instance.templateId
    );
    if (matchingRecipe) {
      // Compute INT-boosted chance (on 100n scale)
      const intOffset = statOffset(character.int, INT_SALVAGE_BONUS_PER_POINT);
      const rawChance = SALVAGE_SCROLL_CHANCE_BASE + intOffset;
      // Clamp to [5n, 95n]
      const scrollChance = rawChance < 5n ? 5n : rawChance > 95n ? 95n : rawChance;
      const roll = (ctx.timestamp.microsSinceUnixEpoch + character.id) % 100n;
      if (roll < scrollChance) {
        const scrollTemplate = findItemTemplateByName(ctx, `Scroll: ${matchingRecipe.name}`);
        if (scrollTemplate) {
          addItemToInventory(ctx, character.id, scrollTemplate.id, 1n);
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
            `You found a recipe: ${matchingRecipe.name}.`);
        } else {
          // Template missing — log for debugging but don't crash
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
            `[Debug] No scroll template found for: ${matchingRecipe.name}.`);
        }
      }
    }

    // Delete associated ItemAffix rows first
    for (const affix of ctx.db.item_affix.by_instance.filter(instance.id)) {
      ctx.db.item_affix.id.delete(affix.id);
    }

    // Delete the item instance
    ctx.db.item_instance.id.delete(instance.id);
  });
};
