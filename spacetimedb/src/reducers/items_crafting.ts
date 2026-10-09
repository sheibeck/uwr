import { buildDisplayName, findItemTemplateByName } from '../helpers/items';
import { getMaterialForSalvage, getCraftQualityStatBonus, planCraft, recipeRequirements, MAX_CRAFT_COUNT, rollSalvage, salvageComponents, salvageReagentDefs, salvageRoll, salvageSeed, SALVAGE_REAGENT_CHANCE_PCT, SALVAGE_REAGENT_ROLL_INDEX } from '../data/crafting_rules';
import { writeActionResult } from '../helpers/action_result';
import type { ResultLine } from '../data/action_result';
import { areaLevel, recipeCandidates, generatedOutput, MAX_NEW_RECIPES_PER_DISCOVER } from '../data/recipe_rules';
import type { BagMaterial, MaterialKind } from '../data/recipe_rules';
import { isQuestItemTemplate } from '../data/item_rules';
import { craftBatchFits } from '../data/inventory_rules';
import { QUALITY_TIERS } from '../data/mechanical_vocabulary';
import { refuseWhileDead } from '../helpers/character';

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
    if (refuseWhileDead(ctx, character)) return;
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
      const entry: BagMaterial = {
        templateId,
        name: template.name,
        tier: template.tier,
        vendorValue: template.vendorValue,
        count,
      };
      // Phase 51.3: a regional material carries its economy_item kind, so a name outside
      // MATERIAL_KINDS still joins the rule recipes (recipe_rules checks the kind is a real one).
      const economyKind = ctx.db.economy_item.itemTemplateId.find(templateId)?.kind;
      if (typeof economyKind === 'string' && economyKind !== '') entry.kind = economyKind as MaterialKind;
      bag.push(entry);
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
    const foundLines: ResultLine[] = [];
    // One discovery: the recipe_discovered row, the result line and the feed line.
    const discoverRecipe = (recipe: any, primaryName: string, secondaryName: string) => {
      ctx.db.recipe_discovered.insert({
        id: 0n,
        characterId: character.id,
        recipeTemplateId: recipe.id,
        discoveredAt: ctx.timestamp,
      });
      discovered.add(recipe.id.toString());
      foundLines.push({
        kind: 'recipe',
        templateId: recipe.outputTemplateId,
        name: recipe.name,
        quantity: 1n,
        total: 0n,
        instanceId: null,
      });
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        `You discover ${recipe.name} because you have ${primaryName} and ${secondaryName}.`
      );
      found += 1;
    };

    // Phase 51.3: regional recipes first. Only the research tiers (common, uncommon: region_recipe
    // learnBy 'research'); rare and better are learned from scrolls. A recipe is discovered only when
    // the bag holds every requirement in full (merged per template, as craft_recipe checks), in
    // recipe id order, inside the shared limit.
    const regionalRecipes = [...ctx.db.region_recipe.iter()]
      .filter((row: any) => row.learnBy === 'research')
      .sort((a: any, b: any) => (a.recipeTemplateId < b.recipeTemplateId ? -1 : a.recipeTemplateId > b.recipeTemplateId ? 1 : 0));
    for (const regional of regionalRecipes) {
      if (found >= MAX_NEW_RECIPES_PER_DISCOVER) break;
      if (discovered.has(regional.recipeTemplateId.toString())) continue;
      const recipe = ctx.db.recipe_template.id.find(regional.recipeTemplateId);
      if (!recipe) continue;
      const needs = new Map<bigint, bigint>();
      for (const req of recipeRequirements(recipe)) {
        needs.set(req.templateId, (needs.get(req.templateId) ?? 0n) + req.count);
      }
      let covered = true;
      for (const [templateId, count] of needs) {
        if ((held.get(templateId) ?? 0n) < count) covered = false;
      }
      if (!covered) continue;
      const primaryName = ctx.db.item_template.id.find(recipe.req1TemplateId)?.name ?? 'Unknown material';
      const secondaryName = ctx.db.item_template.id.find(recipe.req2TemplateId)?.name ?? 'Unknown material';
      discoverRecipe(recipe, primaryName, secondaryName);
    }

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
          // Rule recipes have two or three requirements; 0n means no 4th (Phase 51.3 column).
          req4TemplateId: 0n,
          req4Count: 0n,
        });
        recipesByKey.set(candidate.key, recipe);
      }
      discoverRecipe(recipe, candidate.primary.name, candidate.secondary.name);
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
    // What the server found, for the result card: quantity is the number of recipes, one line each.
    writeActionResult(ctx, character.id, {
      kind: 'discover',
      itemName: '',
      rarity: 'common',
      quantity: BigInt(found),
      craftCount: 0n,
      lines: foundLines,
    });
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

  // The decoration a crafted gear instance gets, in one place so craft_recipe and craft_recipe_count
  // share it: suffix affixes from the reagents (when an Essence is used), the implicit craft quality
  // affixes, then the instance update. Returns the display name.
  // The instance keeps the output template's own rarity (review A WR-03): a legendary regional recipe
  // makes a legendary item. Rule recipe outputs are stored 'common', so nothing changes for them; an
  // unknown rarity string reads as 'common'.
  const decorateCrafted = (ctx: any, instance: any, output: any, plan: any): string => {
    const craftQuality = plan.quality ?? 'standard';
    const qualityTier: string = (QUALITY_TIERS as readonly string[]).indexOf(output?.rarity) !== -1 ? output.rarity : 'common';
    let craftedDisplayName: string = output.name;
    const appliedAffixes: { affixType: string; affixKey: string; affixName: string; statKey: string; magnitude: bigint }[] = [];

    // Reagent suffixes: the essence and reagents were validated and consumed with the plan.
    if (plan.usesCatalyst) {
      for (const reagent of plan.reagents) {
        appliedAffixes.push({
          affixType: 'suffix',
          affixKey: `crafted_${reagent.statKey}`,
          affixName: statKeyToAffix(reagent.statKey),
          statKey: reagent.statKey,
          magnitude: reagent.magnitude,
        });
      }
      for (const affix of appliedAffixes) {
        ctx.db.item_affix.insert({
          id: 0n,
          itemInstanceId: instance.id,
          affixType: affix.affixType,
          affixKey: affix.affixKey,
          affixName: affix.affixName,
          statKey: affix.statKey,
          magnitude: affix.magnitude,
        });
      }
      craftedDisplayName = buildDisplayName(output.name, appliedAffixes);
    }

    // Implicit craft quality base stat bonus.
    const statBonus = getCraftQualityStatBonus(craftQuality);
    if (statBonus > 0n) {
      if (output.armorClassBonus > 0n) {
        ctx.db.item_affix.insert({
          id: 0n,
          itemInstanceId: instance.id,
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
          itemInstanceId: instance.id,
          affixType: 'implicit',
          affixKey: 'craft_quality_dmg',
          affixName: 'Quality',
          statKey: 'weaponBaseDamage',
          magnitude: statBonus,
        });
        ctx.db.item_affix.insert({
          id: 0n,
          itemInstanceId: instance.id,
          affixType: 'implicit',
          affixKey: 'craft_quality_dps',
          affixName: 'Quality',
          statKey: 'weaponDps',
          magnitude: statBonus,
        });
      }
    }

    ctx.db.item_instance.id.update({
      ...instance,
      qualityTier,
      craftQuality,
      displayName: appliedAffixes.length > 0 ? craftedDisplayName : undefined,
    });
    return craftedDisplayName;
  };

  type CraftArgs = {
    characterId: bigint;
    recipeTemplateId: bigint;
    catalystTemplateId?: bigint;
    modifier1TemplateId?: bigint;
    modifier2TemplateId?: bigint;
    modifier3TemplateId?: bigint;
  };

  // One craft or a whole batch, all or nothing: every refusal is decided before the first write.
  // Order: owner, station, count below 1, count above the cap, recipe, discovered, output template,
  // then planCraft with the count (materials, essence tier, essence, reagents), then the backpack:
  // the batch must fit the 50 slots after the inputs are removed (craftBatchFits in
  // data/inventory_rules.ts, the same rule that bounds the client stepper through maxCraftCount).
  const craftBatch = (ctx: any, args: CraftArgs, count: bigint) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (refuseWhileDead(ctx, character)) return;
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
    if (count < 1n) return failItem(ctx, character, 'Choose at least one to craft.');
    if (count > MAX_CRAFT_COUNT) return failItem(ctx, character, `You can craft up to ${MAX_CRAFT_COUNT} at once.`);
    const recipe = ctx.db.recipe_template.id.find(args.recipeTemplateId);
    if (!recipe) return failItem(ctx, character, 'Recipe not found');
    const discovered = [...ctx.db.recipe_discovered.by_character.filter(character.id)].find(
      (row) => row.recipeTemplateId === recipe.id
    );
    if (!discovered) return failItem(ctx, character, 'Recipe not discovered');
    // --- Plan first: every refusal is decided before anything is consumed or added ---
    const output = ctx.db.item_template.id.find(recipe.outputTemplateId);
    if (!output) return failItem(ctx, character, 'Recipe output not found');
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
      // A regional primary (not in MATERIAL_DEFS) sets the quality by its rarity (Phase 51.3).
      primaryMaterialRarity: req1Template?.rarity ?? null,
      catalyst: args.catalystTemplateId
        ? { templateId: args.catalystTemplateId, name: catalystTemplate?.name ?? '' }
        : null,
      modifiers: modifierTemplates,
      countOf: (templateId: bigint) => getItemCount(ctx, character.id, templateId),
      count,
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
    // The backpack: a stack merge is free, otherwise one row for a stackable batch or one row per
    // non-stackable craft, less the rows the inputs are sure to empty. Refused before any write.
    const fits = craftBatchFits(
      [...ctx.db.item_instance.by_owner.filter(character.id)],
      plan.consumes,
      { templateId: output.id, stackable: output.stackable ?? false },
      count
    );
    if (!fits) {
      return failItem(
        ctx,
        character,
        count === 1n ? 'Your backpack is full.' : `Your backpack has no room for ${count} more.`
      );
    }

    // --- Mutate: the plan passed, so nothing below refuses. plan.consumes are the batch totals:
    // the materials, plus the Essence and each reagent when an Essence is used. ---
    for (const c of plan.consumes) {
      removeItemFromInventory(ctx, character.id, c.templateId, c.count);
    }
    // The row the craft itself produced: a bag can already hold older plain copies of the output.
    let lastRow: any;
    let craftedDisplayName: string = output.name ?? recipe.name;
    if (output.stackable ?? false) {
      lastRow = addItemToInventory(ctx, character.id, recipe.outputTemplateId, recipe.outputCount * count);
      if (plan.gear && lastRow) craftedDisplayName = decorateCrafted(ctx, lastRow, output, plan);
    } else {
      for (let i = 0n; i < count; i += 1n) {
        lastRow = addItemToInventory(ctx, character.id, recipe.outputTemplateId, recipe.outputCount);
        if (plan.gear && lastRow) craftedDisplayName = decorateCrafted(ctx, lastRow, output, plan);
      }
    }
    const made = recipe.outputCount * count;

    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'reward',
      count === 1n ? `You craft ${craftedDisplayName}.` : `You craft ${made}x ${craftedDisplayName}.`
    );

    const lines: ResultLine[] = plan.consumes.map((c: { templateId: bigint; count: bigint }) => ({
      kind: 'used' as const,
      templateId: c.templateId,
      name: ctx.db.item_template.id.find(c.templateId)?.name ?? 'Unknown material',
      quantity: c.count,
      total: getItemCount(ctx, character.id, c.templateId),
      instanceId: null,
    }));
    writeActionResult(ctx, character.id, {
      kind: 'craft',
      templateId: output.id,
      itemInstanceId: lastRow?.id,
      itemName: craftedDisplayName,
      rarity: lastRow?.qualityTier ?? output.rarity ?? 'common',
      craftQuality: plan.gear ? plan.quality ?? undefined : undefined,
      quantity: made,
      recipeTemplateId: recipe.id,
      craftCount: count,
      lines,
    });
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
    (ctx, args) => craftBatch(ctx, args, 1n)
  );

  // A new reducer, because reducer arguments are positional: adding a count to craft_recipe would
  // break every client built on the old bindings, which keep calling craft_recipe for one.
  spacetimedb.reducer(
    'craft_recipe_count',
    {
      characterId: t.u64(),
      recipeTemplateId: t.u64(),
      count: t.u64(),
      catalystTemplateId: t.u64().optional(),
      modifier1TemplateId: t.u64().optional(),
      modifier2TemplateId: t.u64().optional(),
      modifier3TemplateId: t.u64().optional(),
    },
    (ctx, args) => craftBatch(ctx, args, args.count)
  );

  spacetimedb.reducer(
    'learn_recipe_scroll',
    { characterId: t.u64(), itemInstanceId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      if (refuseWhileDead(ctx, character)) return;

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
    if (refuseWhileDead(ctx, character)) return;
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

    // Every recipe that makes this item, lowest id first. The first is the one the components come
    // from; all of them cap the amounts.
    const makingRecipes = [...ctx.db.recipe_template.iter()]
      .filter((r: any) => r.outputTemplateId === instance.templateId)
      .sort((x: any, y: any) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));

    // --- Components: a chance at a smaller return, never a guaranteed one ---
    // Owner, 2026-10-07: "Salvaging should always return less materials. A salvage should never return
    // enough parts to just infinitely remake it over and over." and "Salvage should never be a guaranteed
    // return. Just a chance for some lesser amount of some components. Rare components have rarer chance
    // to be returned." The shared rule (data/crafting_rules.ts salvageComponents) names what can come
    // back (the inputs of the recipe that makes the item, else its slot material), at half the amount
    // and strictly below what every recipe consumes, so even full luck loses material. rollSalvage rolls
    // each component on its own from a seed of the server timestamp and the instance and character ids
    // (no source of chance outside it). The client preview calls the same rule.
    const resultLines: ResultLine[] = [];
    const recipeParts = makingRecipes.map((r: any) => {
      const parts: { templateId: bigint; name: string; count: bigint; vendorValue: bigint }[] = [];
      // Every requirement in slot order (the shared rule; a legendary regional recipe has a 4th).
      for (const req of recipeRequirements(r)) {
        const partTemplate = ctx.db.item_template.id.find(req.templateId);
        if (!partTemplate) continue;
        parts.push({
          templateId: partTemplate.id,
          name: partTemplate.name,
          count: req.count,
          vendorValue: partTemplate.vendorValue ?? 0n,
        });
      }
      return { id: r.id, outputCount: r.outputCount, parts };
    });
    const materialName = getMaterialForSalvage(template.slot, template.armorType, tier);
    const materialTemplate = materialName ? findItemTemplateByName(ctx, materialName) : null;
    const components = salvageComponents({
      slot: template.slot,
      armorType: template.armorType,
      tier,
      itemValue: template.vendorValue ?? 0n,
      recipes: recipeParts,
      slotMaterial: materialTemplate
        ? { templateId: materialTemplate.id, name: materialTemplate.name, vendorValue: materialTemplate.vendorValue ?? 0n }
        : null,
    });
    // One seed for every roll of this salvage: the components at their positions and the reagent at
    // its own fixed index, so no roll decides another.
    const seed = salvageSeed(ctx.timestamp.microsSinceUnixEpoch, instance.id, character.id);
    const returned = rollSalvage(components, seed);
    const receivedNames: string[] = [];
    for (const component of returned) {
      if (component.templateId === null) continue;
      addItemToInventory(ctx, character.id, component.templateId, component.amount);
      receivedNames.push(`${component.amount}x ${component.name}`);
      resultLines.push({
        kind: 'received',
        templateId: component.templateId,
        name: component.name,
        quantity: component.amount,
        total: 0n,
        instanceId: null,
      });
    }
    // The feed's main line is written once the bonus is known (below).
    const feedLines: string[] = [];

    // --- Bonus modifier reagent yield (SALVAGE_REAGENT_CHANCE_PCT, affix-constrained) ---
    // salvageReagentDefs keeps the CRAFTING_MODIFIER_DEFS whose statKey matches one of this item's
    // real affixes. The implicit craft-quality affixes every tier 2 and 3 craft carries are not
    // reagent sources: counting them gave a free Iron Ward for every crafted piece of armor.
    // Affix deletion happens later, so rows still exist here.
    const filteredModDefs = salvageReagentDefs([...ctx.db.item_affix.by_instance.filter(instance.id)]);
    if (filteredModDefs.length > 0) {
      const modifierRoll = salvageRoll(seed, SALVAGE_REAGENT_ROLL_INDEX);
      if (modifierRoll < SALVAGE_REAGENT_CHANCE_PCT) {
        const modIdx = Number((args.itemInstanceId + character.id) % BigInt(filteredModDefs.length));
        const modDef = filteredModDefs[modIdx];
        const modifierTemplate = findItemTemplateByName(ctx, modDef.name);
        if (modifierTemplate) {
          addItemToInventory(ctx, character.id, modifierTemplate.id, 1n);
          feedLines.push(`You also found 1x ${modDef.name} while salvaging.`);
          resultLines.push({
            kind: 'bonus',
            templateId: modifierTemplate.id,
            name: modDef.name,
            quantity: 1n,
            total: 0n,
            instanceId: null,
          });
        }
      }
    }

    // Salvage never returns a recipe scroll (owner decision, Phase 51.3 review A WR-02): scrolls come only
    // from bosses and named foes in their region, at the 10% drop chance. A salvage roll here was a
    // faucet (craft, salvage, repeat) that bypassed that rule for every recipe with a scroll item.

    // The feed, main line first: what came back, "You salvaged {item}." when only a bonus did,
    // or the nothing usable sentence when nothing at all did.
    const listOf = (names: string[]): string =>
      names.length <= 1 ? names.join('') : `${names.slice(0, names.length - 1).join(', ')} and ${names[names.length - 1]}`;
    if (receivedNames.length > 0) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
        `You salvaged ${itemName} and received ${listOf(receivedNames)}.`);
    } else if (feedLines.length > 0) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward', `You salvaged ${itemName}.`);
    } else {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
        `You salvaged ${itemName}, but nothing usable was left.`);
    }
    for (const line of feedLines) appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward', line);

    // Delete associated ItemAffix rows first
    for (const affix of ctx.db.item_affix.by_instance.filter(instance.id)) {
      ctx.db.item_affix.id.delete(affix.id);
    }

    // Delete the item instance
    ctx.db.item_instance.id.delete(instance.id);

    // The result row: only what was granted above, each total the bag count after every grant.
    const lines: ResultLine[] = resultLines.map((line) => ({
      ...line,
      total: getItemCount(ctx, character.id, line.templateId),
    }));
    writeActionResult(ctx, character.id, {
      kind: 'salvage',
      templateId: instance.templateId,
      itemInstanceId: undefined,
      itemName,
      rarity: instance.qualityTier ?? template.rarity ?? 'common',
      craftQuality: instance.craftQuality ?? undefined,
      quantity: instance.quantity ?? 1n,
      recipeTemplateId: undefined,
      craftCount: 0n,
      lines,
    });
  });
};
