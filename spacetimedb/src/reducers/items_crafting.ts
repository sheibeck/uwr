import { buildDisplayName, findItemTemplateByName } from '../helpers/items';
import { getMaterialForSalvage, SALVAGE_YIELD_BY_TIER, getCraftQualityStatBonus, CRAFTING_MODIFIER_DEFS, planCraft } from '../data/crafting_rules';
import { statOffset, INT_SALVAGE_BONUS_PER_POINT, SALVAGE_SCROLL_CHANCE_BASE } from '../data/combat_scaling.js';
import { areaLevel, recipeCandidates, generatedOutput, MAX_NEW_RECIPES_PER_DISCOVER } from '../data/recipe_rules';
import type { BagMaterial } from '../data/recipe_rules';
import { isQuestItemTemplate } from '../data/item_rules';

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
    // The area level of the station: the same band and default as computeLocationTargetLevel.
    const region = ctx.db.region.id.find(location.regionId);
    const level = areaLevel(region?.dangerMultiplier ?? 100n, location.levelOffset ?? 0n);

    // The bag: non-equipped quantities summed per template, joined to their templates.
    const held = new Map<bigint, bigint>();
    for (const instance of ctx.db.item_instance.by_owner.filter(character.id)) {
      if (instance.equippedSlot) continue;
      held.set(instance.templateId, (held.get(instance.templateId) ?? 0n) + (instance.quantity ?? 1n));
    }
    const bag: BagMaterial[] = [];
    for (const [templateId, count] of held) {
      const template = ctx.db.item_template.id.find(templateId);
      if (!template) continue;
      // Only a real material counts, never a quest item, gear or junk that shares a material's name
      // (materials are matched by name). Otherwise craft_recipe would consume it, and the first
      // holder's template id would be stored in a recipe every later discoverer shares.
      if (template.slot !== 'material' || isQuestItemTemplate(template)) continue;
      bag.push({
        templateId,
        name: template.name,
        tier: template.tier,
        vendorValue: template.vendorValue,
        count,
      });
    }
    const candidates = recipeCandidates(bag, level);

    // Snapshot before any insert: the strict mock returns the live array from iter().
    const recipesByKey = new Map<string, any>();
    const takenNames = new Set<string>();
    for (const recipe of [...ctx.db.recipe_template.iter()]) {
      recipesByKey.set(recipe.key, recipe);
      takenNames.add(recipe.name.toLowerCase());
    }
    for (const template of [...ctx.db.item_template.iter()]) takenNames.add(template.name.toLowerCase());
    const discovered = new Set(
      [...ctx.db.recipe_discovered.by_character.filter(character.id)].map((row) =>
        row.recipeTemplateId.toString()
      )
    );

    let found = 0;
    for (const candidate of candidates) {
      if (found >= MAX_NEW_RECIPES_PER_DISCOVER) break;
      let recipe = recipesByKey.get(candidate.key);
      if (recipe && discovered.has(recipe.id.toString())) continue;
      if (!recipe) {
        // Stored once per key: the recipe and its output are shared by every later discoverer.
        const made = generatedOutput(candidate, (name: string) => takenNames.has(name.toLowerCase()));
        const outputTemplate = ctx.db.item_template.insert({ id: 0n, ...made.itemTemplate });
        takenNames.add(outputTemplate.name.toLowerCase());
        recipe = ctx.db.recipe_template.insert({
          id: 0n,
          ...made.recipe,
          outputTemplateId: outputTemplate.id,
        });
        recipesByKey.set(candidate.key, recipe);
      }
      ctx.db.recipe_discovered.insert({
        id: 0n,
        characterId: character.id,
        recipeTemplateId: recipe.id,
        discoveredAt: ctx.timestamp,
      });
      discovered.add(recipe.id.toString());
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        `You discover ${recipe.name} because you have ${candidate.primary.name} and ${candidate.secondary.name}.`
      );
      found += 1;
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
      // --- Plan first: every refusal is decided before anything is consumed or added ---
      const output = ctx.db.item_template.id.find(recipe.outputTemplateId);
      const req1Template = ctx.db.item_template.id.find(recipe.req1TemplateId);
      const catalystTemplate = args.catalystTemplateId
        ? ctx.db.item_template.id.find(args.catalystTemplateId)
        : null;
      const modifierTemplates = [args.modifier1TemplateId, args.modifier2TemplateId, args.modifier3TemplateId]
        .filter((id): id is bigint => id != null)
        .map((id) => ({ templateId: id, name: ctx.db.item_template.id.find(id)?.name ?? null }));
      const plan = planCraft({
        recipe,
        primaryMaterialName: req1Template?.name ?? null,
        catalyst: args.catalystTemplateId
          ? { templateId: args.catalystTemplateId, name: catalystTemplate?.name ?? '' }
          : null,
        modifiers: modifierTemplates,
        countOf: (templateId: bigint) => getItemCount(ctx, character.id, templateId),
      });
      if (!plan.ok) {
        if (plan.reason === 'materials') {
          appendPrivateEvent(
            ctx,
            character.id,
            character.ownerUserId,
            'system',
            plan.message
          );
          return;
        }
        return failItem(ctx, character, plan.message);
      }

      // --- Mutate: the plan passed, so nothing below refuses ---
      removeItemFromInventory(ctx, character.id, recipe.req1TemplateId, recipe.req1Count);
      removeItemFromInventory(ctx, character.id, recipe.req2TemplateId, recipe.req2Count);
      if (recipe.req3TemplateId != null && recipe.req3Count != null) {
        removeItemFromInventory(ctx, character.id, recipe.req3TemplateId, recipe.req3Count);
      }
      // The row the craft itself produced: a bag can already hold older plain copies of the output.
      const newInstance = addItemToInventory(ctx, character.id, recipe.outputTemplateId, recipe.outputCount);

      // --- Gear recipe affix application (catalyst + modifier system) ---
      let craftedDisplayName = output?.name ?? recipe.name;
      if (plan.gear && output) {
        const craftQuality = plan.quality ?? 'standard';
        const qualityTier = 'common';

        // newInstance is the instance created above, never the first plain copy in the bag.
        if (newInstance) {
          const appliedAffixes: { affixType: string; affixKey: string; affixName: string; statKey: string; magnitude: bigint }[] = [];

          // --- Catalyst (Essence) + reagents: already validated by planCraft ---
          if (plan.usesCatalyst && args.catalystTemplateId) {
            removeItemFromInventory(ctx, character.id, args.catalystTemplateId, 1n);
            for (const reagent of plan.reagents) {
              removeItemFromInventory(ctx, character.id, reagent.templateId, 1n);
              appliedAffixes.push({
                affixType: 'suffix',
                affixKey: `crafted_${reagent.statKey}`,
                affixName: statKeyToAffix(reagent.statKey),
                statKey: reagent.statKey,
                magnitude: reagent.magnitude,
              });
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

            craftedDisplayName = buildDisplayName(output.name, appliedAffixes);
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

    // The recipe that makes this item, if any: salvage may never return more than it consumed.
    const matchingRecipe = [...ctx.db.recipe_template.iter()].find(
      (r) => r.outputTemplateId === instance.templateId
    );

    // --- Material yield ---
    // The tier table gives the base count, then two caps keep salvage from beating the craft:
    //   - value: the materials returned are never worth more than the item (vendorValue), and
    //   - recipe: never more of a material than the recipe consumed of it.
    // Without them a crafted Void Crystal Pendant (2 Void Crystal in) paid back 3 Void Crystal.
    const materialName = getMaterialForSalvage(template.slot, template.armorType, tier);
    if (materialName) {
      const materialTemplate = findItemTemplateByName(ctx, materialName);
      if (materialTemplate) {
        let yieldCount: bigint = SALVAGE_YIELD_BY_TIER[Number(tier)] ?? 2n;
        const materialValue: bigint = materialTemplate.vendorValue ?? 0n;
        if (materialValue > 0n) {
          const byValue = (template.vendorValue ?? 0n) / materialValue;
          if (byValue < yieldCount) yieldCount = byValue;
        }
        if (matchingRecipe) {
          let consumed = 0n;
          if (matchingRecipe.req1TemplateId === materialTemplate.id) consumed += matchingRecipe.req1Count ?? 0n;
          if (matchingRecipe.req2TemplateId === materialTemplate.id) consumed += matchingRecipe.req2Count ?? 0n;
          if (matchingRecipe.req3TemplateId === materialTemplate.id) consumed += matchingRecipe.req3Count ?? 0n;
          if (consumed > 0n && consumed < yieldCount) yieldCount = consumed;
        }
        if (yieldCount > 0n) {
          addItemToInventory(ctx, character.id, materialTemplate.id, yieldCount);
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
            `You salvaged ${itemName} and received ${yieldCount}x ${materialTemplate.name}.`);
        } else {
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
            `You salvaged ${itemName}, but nothing usable was left.`);
        }
      }
    }

    // --- Bonus modifier reagent yield (12% chance, affix-constrained) ---
    // Collect the unique statKey set from this item's real affixes. The implicit craft-quality
    // affixes every tier 2 and 3 craft carries are not reagent sources: counting them gave a free
    // Iron Ward (armorClassBonus) for every crafted piece of armor.
    // Affix deletion happens later, so rows still exist here.
    const affixStatKeys = new Set(
      [...ctx.db.item_affix.by_instance.filter(instance.id)]
        .filter(a => a.affixType !== 'implicit')
        .map(a => a.statKey)
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
    // matchingRecipe (the recipe that outputs this item type) was found above
    if (matchingRecipe) {
      // Compute INT-boosted chance (on 100n scale)
      const intOffset = statOffset(character.int, INT_SALVAGE_BONUS_PER_POINT);
      const rawChance = SALVAGE_SCROLL_CHANCE_BASE + intOffset;
      // Clamp to [5n, 95n]
      const scrollChance = rawChance < 5n ? 5n : rawChance > 95n ? 95n : rawChance;
      const roll = (ctx.timestamp.microsSinceUnixEpoch + character.id) % 100n;
      if (roll < scrollChance) {
        // A generated recipe has no scroll item (it is learned through Discover), so a missing
        // scroll template is normal and stays silent.
        const scrollTemplate = findItemTemplateByName(ctx, `Scroll: ${matchingRecipe.name}`);
        if (scrollTemplate) {
          addItemToInventory(ctx, character.id, scrollTemplate.id, 1n);
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
            `You found a recipe: ${matchingRecipe.name}.`);
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
