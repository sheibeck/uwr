import { SenderError } from 'spacetimedb/server';

export function ensureResourceItemTemplates(ctx: any) {
  const resources = [
    { name: 'Flax', slot: 'resource', vendorValue: 1n },
    { name: 'Herbs', slot: 'resource', vendorValue: 1n },
    { name: 'Wood', slot: 'resource', vendorValue: 1n },
    { name: 'Resin', slot: 'resource', vendorValue: 1n },
    { name: 'Copper Ore', slot: 'resource', vendorValue: 2n },
    { name: 'Stone', slot: 'resource', vendorValue: 1n },
    { name: 'Raw Meat', slot: 'resource', vendorValue: 1n },
    { name: 'Salt', slot: 'resource', vendorValue: 1n },
    { name: 'Clear Water', slot: 'resource', vendorValue: 1n },
    { name: 'Sand', slot: 'resource', vendorValue: 1n },
    { name: 'Dry Grass', slot: 'resource', vendorValue: 1n },
    { name: 'Bitter Herbs', slot: 'resource', vendorValue: 1n },
    { name: 'Peat', slot: 'resource', vendorValue: 1n },
    { name: 'Mushrooms', slot: 'resource', vendorValue: 1n },
    { name: 'Murky Water', slot: 'resource', vendorValue: 1n },
    { name: 'Iron Shard', slot: 'resource', vendorValue: 2n },
    { name: 'Ancient Dust', slot: 'resource', vendorValue: 2n },
    { name: 'Scrap Cloth', slot: 'resource', vendorValue: 1n },
    { name: 'Lamp Oil', slot: 'resource', vendorValue: 1n },
    { name: 'Wild Berries', slot: 'resource', vendorValue: 1n },
    { name: 'Root Vegetable', slot: 'resource', vendorValue: 1n },
  ];
  for (const resource of resources) {
    if (findItemTemplateByName(ctx, resource.name)) continue;
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: resource.name,
      slot: resource.slot,
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: resource.vendorValue,
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
    });
  }
  if (!findItemTemplateByName(ctx, 'Bandage')) {
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: 'Bandage',
      slot: 'consumable',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 2n,
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
    });
  }
  const craftItems = [
    { name: 'Simple Rations', slot: 'consumable', vendorValue: 2n },
    { name: 'Torch', slot: 'utility', vendorValue: 2n },
    { name: 'Basic Poultice', slot: 'consumable', vendorValue: 2n },
    { name: 'Travelers Tea', slot: 'consumable', vendorValue: 2n },
    { name: 'Whetstone', slot: 'utility', vendorValue: 2n },
    { name: 'Kindling Bundle', slot: 'utility', vendorValue: 1n },
    { name: 'Rough Rope', slot: 'utility', vendorValue: 2n },
    { name: 'Charcoal', slot: 'resource', vendorValue: 1n },
    { name: 'Crude Poison', slot: 'consumable', vendorValue: 3n },
  ];
  for (const item of craftItems) {
    if (findItemTemplateByName(ctx, item.name)) continue;
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: item.name,
      slot: item.slot,
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: item.vendorValue,
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
    });
  }
}

export function ensureFoodItemTemplates(ctx: any) {
  const foodItems = [
    {
      name: 'Herb Broth',
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'mana_regen',
      wellFedBuffMagnitude: 4n,
    },
    {
      name: 'Roasted Roots',
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'str',
      wellFedBuffMagnitude: 2n,
    },
    {
      name: "Traveler's Stew",
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'stamina_regen',
      wellFedBuffMagnitude: 4n,
    },
    {
      name: "Forager's Salad",
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'dex',
      wellFedBuffMagnitude: 2n,
    },
  ];

  for (const food of foodItems) {
    const existing = findItemTemplateByName(ctx, food.name);
    if (existing) {
      ctx.db.itemTemplate.id.update({
        ...existing,
        wellFedDurationMicros: food.wellFedDurationMicros,
        wellFedBuffType: food.wellFedBuffType,
        wellFedBuffMagnitude: food.wellFedBuffMagnitude,
      });
      continue;
    }
    ctx.db.itemTemplate.insert({
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
  const flax = findItemTemplateByName(ctx, 'Flax');
  const herbs = findItemTemplateByName(ctx, 'Herbs');
  const bandage = findItemTemplateByName(ctx, 'Bandage');
  const rawMeat = findItemTemplateByName(ctx, 'Raw Meat');
  const salt = findItemTemplateByName(ctx, 'Salt');
  const simpleRations = findItemTemplateByName(ctx, 'Simple Rations');
  const wood = findItemTemplateByName(ctx, 'Wood');
  const resin = findItemTemplateByName(ctx, 'Resin');
  const torch = findItemTemplateByName(ctx, 'Torch');
  const clearWater = findItemTemplateByName(ctx, 'Clear Water');
  const basicPoultice = findItemTemplateByName(ctx, 'Basic Poultice');
  const travelersTea = findItemTemplateByName(ctx, 'Travelers Tea');
  const stone = findItemTemplateByName(ctx, 'Stone');
  const sand = findItemTemplateByName(ctx, 'Sand');
  const whetstone = findItemTemplateByName(ctx, 'Whetstone');
  const dryGrass = findItemTemplateByName(ctx, 'Dry Grass');
  const kindling = findItemTemplateByName(ctx, 'Kindling Bundle');
  const roughRope = findItemTemplateByName(ctx, 'Rough Rope');
  const charcoal = findItemTemplateByName(ctx, 'Charcoal');
  const bitterHerbs = findItemTemplateByName(ctx, 'Bitter Herbs');
  const crudePoison = findItemTemplateByName(ctx, 'Crude Poison');

  const addRecipe = (args: {
    key: string;
    name: string;
    output: typeof ItemTemplate.rowType | null;
    outputCount: bigint;
    req1: typeof ItemTemplate.rowType | null;
    req1Count: bigint;
    req2: typeof ItemTemplate.rowType | null;
    req2Count: bigint;
    req3?: typeof ItemTemplate.rowType | null;
    req3Count?: bigint;
  }) => {
    if (!args.output || !args.req1 || !args.req2) return;
    const existing = [...ctx.db.recipeTemplate.iter()].find((row) => row.key === args.key);
    if (existing) {
      ctx.db.recipeTemplate.id.update({
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
      });
      return;
    }
    ctx.db.recipeTemplate.insert({
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
    });
  };

  addRecipe({
    key: 'bandage',
    name: 'Bandages',
    output: bandage,
    outputCount: 1n,
    req1: flax,
    req1Count: 1n,
    req2: herbs,
    req2Count: 1n,
  });
  addRecipe({
    key: 'simple_rations',
    name: 'Simple Rations',
    output: simpleRations,
    outputCount: 1n,
    req1: rawMeat,
    req1Count: 1n,
    req2: salt,
    req2Count: 1n,
  });
  addRecipe({
    key: 'torch',
    name: 'Torch',
    output: torch,
    outputCount: 1n,
    req1: wood,
    req1Count: 1n,
    req2: resin,
    req2Count: 1n,
  });
  addRecipe({
    key: 'basic_poultice',
    name: 'Basic Poultice',
    output: basicPoultice,
    outputCount: 1n,
    req1: herbs,
    req1Count: 1n,
    req2: flax,
    req2Count: 1n,
    req3: clearWater,
    req3Count: 1n,
  });
  addRecipe({
    key: 'travelers_tea',
    name: 'Travelers Tea',
    output: travelersTea,
    outputCount: 1n,
    req1: herbs,
    req1Count: 1n,
    req2: clearWater,
    req2Count: 1n,
  });
  addRecipe({
    key: 'whetstone',
    name: 'Whetstone',
    output: whetstone,
    outputCount: 1n,
    req1: stone,
    req1Count: 1n,
    req2: sand,
    req2Count: 1n,
  });
  addRecipe({
    key: 'kindling_bundle',
    name: 'Kindling Bundle',
    output: kindling,
    outputCount: 1n,
    req1: wood,
    req1Count: 1n,
    req2: dryGrass,
    req2Count: 1n,
  });
  addRecipe({
    key: 'rough_rope',
    name: 'Rough Rope',
    output: roughRope,
    outputCount: 1n,
    req1: flax,
    req1Count: 1n,
    req2: resin,
    req2Count: 1n,
  });
  addRecipe({
    key: 'charcoal',
    name: 'Charcoal',
    output: charcoal,
    outputCount: 1n,
    req1: wood,
    req1Count: 1n,
    req2: stone,
    req2Count: 1n,
  });
  addRecipe({
    key: 'crude_poison',
    name: 'Crude Poison',
    output: crudePoison,
    outputCount: 1n,
    req1: bitterHerbs,
    req1Count: 1n,
    req2: resin,
    req2Count: 1n,
  });

  const wildBerries = findItemTemplateByName(ctx, 'Wild Berries');
  const rootVegetable = findItemTemplateByName(ctx, 'Root Vegetable');
  const herbBroth = findItemTemplateByName(ctx, 'Herb Broth');
  const roastedRoots = findItemTemplateByName(ctx, 'Roasted Roots');
  const travelerStew = findItemTemplateByName(ctx, "Traveler's Stew");
  const foragerSalad = findItemTemplateByName(ctx, "Forager's Salad");

  addRecipe({
    key: 'herb_broth',
    name: 'Herb Broth',
    output: herbBroth,
    outputCount: 1n,
    req1: wildBerries,
    req1Count: 2n,
    req2: clearWater,
    req2Count: 1n,
  });
  addRecipe({
    key: 'roasted_roots',
    name: 'Roasted Roots',
    output: roastedRoots,
    outputCount: 1n,
    req1: rootVegetable,
    req1Count: 2n,
    req2: salt,
    req2Count: 1n,
  });
  addRecipe({
    key: 'travelers_stew',
    name: "Traveler's Stew",
    output: travelerStew,
    outputCount: 1n,
    req1: rootVegetable,
    req1Count: 1n,
    req2: rawMeat,
    req2Count: 1n,
  });
  addRecipe({
    key: 'foragers_salad',
    name: "Forager's Salad",
    output: foragerSalad,
    outputCount: 1n,
    req1: wildBerries,
    req1Count: 1n,
    req2: herbs,
    req2Count: 1n,
  });
}

export function ensureAbilityTemplates(ctx: any) {
  // Descriptions are now stored in the database (seeded from ABILITIES entries)
  const resolveDescription = (entry: { name: string; description?: string }) =>
    entry.description ?? entry.name;

  // Keep one canonical row per ability key so client-side lookups do not
  // pick stale duplicates with old cast/cooldown values.
  const seenByKey = new Map<string, any>();
  for (const row of ctx.db.abilityTemplate.iter()) {
    const existing = seenByKey.get(row.key);
    if (!existing) {
      seenByKey.set(row.key, row);
      continue;
    }
    const keep = existing.id <= row.id ? existing : row;
    const drop = keep === existing ? row : existing;
    ctx.db.abilityTemplate.id.delete(drop.id);
    seenByKey.set(row.key, keep);
  }

  const utilityKeys = new Set([
    'ranger_track',
    'druid_natures_mark',
    'cleric_sanctify',
    'wizard_arcane_reservoir',
    'paladin_lay_on_hands',
    'enchanter_veil_of_calm',
    'bard_ballad_of_resolve',
  ]);
  const combatOnlyKeys = new Set([
    'shaman_spirit_wolf',
    'necromancer_bone_servant',
    'beastmaster_call_beast',
    'summoner_earth_familiar',
  ]);
  const outOfCombatOnlyKeys = new Set([
    'druid_natures_mark',
  ]);
  const combatStateFor = (key: string) =>
    combatOnlyKeys.has(key) ? 'combat_only' :
      outOfCombatOnlyKeys.has(key) ? 'out_of_combat_only' :
        'any';
  for (const [key, ability] of Object.entries(ABILITIES)) {
    const entry = ability as {
      name: string;
      className: string;
      resource: string;
      level: bigint;
      castSeconds: bigint;
      cooldownSeconds: bigint;
      description?: string;
      power: bigint;
      damageType: string;
      dotPowerSplit?: number;
      dotDuration?: bigint;
      hotPowerSplit?: number;
      hotDuration?: bigint;
      debuffType?: string;
      debuffMagnitude?: bigint;
      debuffDuration?: bigint;
      aoeTargets?: string;
    };
    const existing = seenByKey.get(key);
    if (existing) {
      ctx.db.abilityTemplate.id.update({
        ...existing,
        key,
        name: entry.name,
        className: entry.className,
        level: entry.level,
        resource: entry.resource,
        castSeconds: entry.castSeconds,
        cooldownSeconds: entry.cooldownSeconds,
        kind: utilityKeys.has(key) ? 'utility' : 'combat',
        combatState: combatStateFor(key),
        description: resolveDescription(entry),
        power: entry.power ?? undefined,
        damageType: entry.damageType ?? undefined,
        statScaling: ABILITY_STAT_SCALING[key] ?? undefined,
        dotPowerSplit: entry.dotPowerSplit ?? undefined,
        dotDuration: entry.dotDuration ?? undefined,
        hotPowerSplit: entry.hotPowerSplit ?? undefined,
        hotDuration: entry.hotDuration ?? undefined,
        debuffType: entry.debuffType ?? undefined,
        debuffMagnitude: entry.debuffMagnitude ?? undefined,
        debuffDuration: entry.debuffDuration ?? undefined,
        aoeTargets: entry.aoeTargets ?? undefined,
      });
      seenByKey.set(key, {
        ...existing,
        key,
        name: entry.name,
        className: entry.className,
        level: entry.level,
        resource: entry.resource,
        castSeconds: entry.castSeconds,
        cooldownSeconds: entry.cooldownSeconds,
        kind: utilityKeys.has(key) ? 'utility' : 'combat',
        combatState: combatStateFor(key),
        description: resolveDescription(entry),
        power: entry.power ?? undefined,
        damageType: entry.damageType ?? undefined,
        statScaling: ABILITY_STAT_SCALING[key] ?? undefined,
        dotPowerSplit: entry.dotPowerSplit ?? undefined,
        dotDuration: entry.dotDuration ?? undefined,
        hotPowerSplit: entry.hotPowerSplit ?? undefined,
        hotDuration: entry.hotDuration ?? undefined,
        debuffType: entry.debuffType ?? undefined,
        debuffMagnitude: entry.debuffMagnitude ?? undefined,
        debuffDuration: entry.debuffDuration ?? undefined,
        aoeTargets: entry.aoeTargets ?? undefined,
      });
      continue;
    }
    const inserted = ctx.db.abilityTemplate.insert({
      id: 0n,
      key,
      name: entry.name,
      className: entry.className,
      level: entry.level,
      resource: entry.resource,
      castSeconds: entry.castSeconds,
      cooldownSeconds: entry.cooldownSeconds,
      kind: utilityKeys.has(key) ? 'utility' : 'combat',
      combatState: combatStateFor(key),
      description: resolveDescription(entry),
      power: entry.power ?? undefined,
      damageType: entry.damageType ?? undefined,
      statScaling: ABILITY_STAT_SCALING[key] ?? undefined,
      dotPowerSplit: entry.dotPowerSplit ?? undefined,
      dotDuration: entry.dotDuration ?? undefined,
      hotPowerSplit: entry.hotPowerSplit ?? undefined,
      hotDuration: entry.hotDuration ?? undefined,
      debuffType: entry.debuffType ?? undefined,
      debuffMagnitude: entry.debuffMagnitude ?? undefined,
      debuffDuration: entry.debuffDuration ?? undefined,
      aoeTargets: entry.aoeTargets ?? undefined,
    });
    seenByKey.set(key, inserted);
  }
}


