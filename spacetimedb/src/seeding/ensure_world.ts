import { SenderError } from 'spacetimedb/server';
import { connectLocations } from '../helpers/location';

export function ensureNpcs(ctx: any) {
  const upsertNpcByName = (args: {
    name: string;
    npcType: string;
    locationName: string;
    description: string;
    greeting: string;
  }) => {
    const location = [...ctx.db.location.iter()].find((row) => row.name === args.locationName);
    if (!location) return;
    const existing = [...ctx.db.npc.iter()].find((row) => row.name === args.name);
    if (existing) {
      ctx.db.npc.id.update({
        ...existing,
        name: args.name,
        npcType: args.npcType,
        locationId: location.id,
        description: args.description,
        greeting: args.greeting,
      });
      return;
    }
    ctx.db.npc.insert({
      id: 0n,
      name: args.name,
      npcType: args.npcType,
      locationId: location.id,
      description: args.description,
      greeting: args.greeting,
    });
  };

  upsertNpcByName({
    name: 'Marla the Guide',
    npcType: 'quest',
    locationName: 'Hollowmere',
    description: 'A veteran scout who knows every trail between the river and the emberlands.',
    greeting: 'Welcome, traveler. The road is cruel, but I can help you find your footing.',
  });
  upsertNpcByName({
    name: 'Elder Soren',
    npcType: 'lore',
    locationName: 'Hollowmere',
    description: 'A stoic town elder with a gaze that weighs every word.',
    greeting: 'Hollowmere watches over its own. Keep your blade sharp and your wits sharper.',
  });
  upsertNpcByName({
    name: 'Quartermaster Jyn',
    npcType: 'vendor',
    locationName: 'Hollowmere',
    description: 'A brisk quartermaster tallying supplies near the lantern-lit market.',
    greeting: 'Supplies are tight. If you can help keep the roads safe, the town will remember.',
  });
}

export function ensureQuestTemplates(ctx: any) {
  const upsertQuestByName = (args: {
    name: string;
    npcName: string;
    enemyName: string;
    requiredCount: bigint;
    minLevel: bigint;
    maxLevel: bigint;
    rewardXp: bigint;
  }) => {
    const npc = [...ctx.db.npc.iter()].find((row) => row.name === args.npcName);
    const enemy = findEnemyTemplateByName(ctx, args.enemyName);
    if (!npc || !enemy) return;
    const existing = [...ctx.db.questTemplate.iter()].find((row) => row.name === args.name);
    if (existing) {
      ctx.db.questTemplate.id.update({
        ...existing,
        name: args.name,
        npcId: npc.id,
        targetEnemyTemplateId: enemy.id,
        requiredCount: args.requiredCount,
        minLevel: args.minLevel,
        maxLevel: args.maxLevel,
        rewardXp: args.rewardXp,
      });
      return;
    }
    ctx.db.questTemplate.insert({
      id: 0n,
      name: args.name,
      npcId: npc.id,
      targetEnemyTemplateId: enemy.id,
      requiredCount: args.requiredCount,
      minLevel: args.minLevel,
      maxLevel: args.maxLevel,
      rewardXp: args.rewardXp,
    });
  };

  upsertQuestByName({
    name: 'Bog Rat Cleanup',
    npcName: 'Marla the Guide',
    enemyName: 'Bog Rat',
    requiredCount: 3n,
    minLevel: 1n,
    maxLevel: 3n,
    rewardXp: 40n,
  });
  upsertQuestByName({
    name: 'Thicket Wolf Cull',
    npcName: 'Marla the Guide',
    enemyName: 'Thicket Wolf',
    requiredCount: 4n,
    minLevel: 2n,
    maxLevel: 5n,
    rewardXp: 60n,
  });
}

export function ensureEnemyAbilities(ctx: any) {
  const upsertEnemyAbility = (
    templateName: string,
    abilityKey: string,
    name: string,
    kind: string,
    castSeconds: bigint,
    cooldownSeconds: bigint,
    targetRule: string
  ) => {
    const template = findEnemyTemplateByName(ctx, templateName);
    if (!template) return;
    const existing = [...ctx.db.enemyAbility.by_template.filter(template.id)].find(
      (row) => row.abilityKey === abilityKey
    );
    if (existing) {
      ctx.db.enemyAbility.id.update({
        ...existing,
        enemyTemplateId: template.id,
        abilityKey,
        name,
        kind,
        castSeconds,
        cooldownSeconds,
        targetRule,
      });
      return;
    }
    ctx.db.enemyAbility.insert({
      id: 0n,
      enemyTemplateId: template.id,
      abilityKey,
      name,
      kind,
      castSeconds,
      cooldownSeconds,
      targetRule,
    });
  };

  upsertEnemyAbility('Bog Rat', 'poison_bite', 'Poison Bite', 'dot', 3n, 20n, 'aggro');
  upsertEnemyAbility('Ember Wisp', 'ember_burn', 'Ember Burn', 'dot', 2n, 18n, 'aggro');
  upsertEnemyAbility('Bandit', 'bleeding_shot', 'Bleeding Shot', 'dot', 1n, 15n, 'aggro');
  upsertEnemyAbility('Blight Stalker', 'shadow_rend', 'Shadow Rend', 'dot', 2n, 18n, 'aggro');
  upsertEnemyAbility('Grave Acolyte', 'sapping_chant', 'Sapping Chant', 'debuff', 2n, 20n, 'aggro');
  upsertEnemyAbility('Hexbinder', 'withering_hex', 'Withering Hex', 'debuff', 2n, 20n, 'aggro');
  upsertEnemyAbility('Thicket Wolf', 'rending_bite', 'Rending Bite', 'dot', 1n, 12n, 'aggro');
  upsertEnemyAbility('Marsh Croaker', 'bog_slime', 'Bog Slime', 'dot', 1n, 12n, 'aggro');
  upsertEnemyAbility('Dust Hare', 'quick_nip', 'Quick Nip', 'dot', 1n, 10n, 'aggro');
  upsertEnemyAbility('Ash Jackal', 'scorching_snap', 'Scorching Snap', 'dot', 1n, 14n, 'aggro');
  upsertEnemyAbility('Thorn Sprite', 'thorn_venom', 'Thorn Venom', 'dot', 2n, 16n, 'aggro');
  upsertEnemyAbility('Gloom Stag', 'crushing_gore', 'Crushing Gore', 'debuff', 2n, 18n, 'aggro');
  upsertEnemyAbility('Mire Leech', 'blood_drain', 'Blood Drain', 'dot', 2n, 18n, 'aggro');
  upsertEnemyAbility('Fen Witch', 'mire_curse', 'Mire Curse', 'debuff', 2n, 20n, 'aggro');
  upsertEnemyAbility('Grave Skirmisher', 'rusty_bleed', 'Rusty Bleed', 'dot', 1n, 12n, 'aggro');
  upsertEnemyAbility('Cinder Sentinel', 'ember_slam', 'Ember Slam', 'debuff', 2n, 20n, 'aggro');
  upsertEnemyAbility('Emberling', 'ember_spark', 'Ember Spark', 'dot', 1n, 12n, 'aggro');
  upsertEnemyAbility('Frostbone Acolyte', 'chill_touch', 'Chill Touch', 'debuff', 2n, 18n, 'aggro');
  upsertEnemyAbility('Ridge Skirmisher', 'stone_cleave', 'Stone Cleave', 'dot', 1n, 14n, 'aggro');
  upsertEnemyAbility('Emberhawk', 'searing_talon', 'Searing Talon', 'dot', 2n, 18n, 'aggro');
  upsertEnemyAbility('Basalt Brute', 'quake_stomp', 'Quake Stomp', 'debuff', 2n, 22n, 'aggro');
  upsertEnemyAbility('Grave Servant', 'grave_shield_break', 'Grave Shield Break', 'debuff', 2n, 18n, 'aggro');
  upsertEnemyAbility('Alley Shade', 'shadow_bleed', 'Shadow Bleed', 'dot', 2n, 18n, 'aggro');
  upsertEnemyAbility('Vault Sentinel', 'vault_crush', 'Vault Crush', 'debuff', 2n, 20n, 'aggro');
  upsertEnemyAbility('Sootbound Mystic', 'soot_hex', 'Soot Hex', 'debuff', 2n, 18n, 'aggro');
  upsertEnemyAbility('Ember Priest', 'cinder_blight', 'Cinder Blight', 'dot', 2n, 16n, 'aggro');
  upsertEnemyAbility('Ashforged Revenant', 'molten_bleed', 'Molten Bleed', 'dot', 3n, 20n, 'aggro');

  // Heal abilities
  upsertEnemyAbility('Fen Witch', 'shaman_heal', 'Shaman Heal', 'heal', 2n, 15n, 'lowest_hp');
  upsertEnemyAbility('Grave Acolyte', 'dark_mend', 'Dark Mend', 'heal', 3n, 20n, 'lowest_hp');

  // AoE abilities
  upsertEnemyAbility('Cinder Sentinel', 'flame_burst', 'Flame Burst', 'aoe_damage', 2n, 20n, 'all_players');
  upsertEnemyAbility('Basalt Brute', 'quake_wave', 'Quake Wave', 'aoe_damage', 3n, 25n, 'all_players');

  // Buff abilities
  upsertEnemyAbility('Hexbinder', 'warchief_rally', 'Warchief Rally', 'buff', 2n, 30n, 'all_allies');
  upsertEnemyAbility('Sootbound Mystic', 'bolster_defenses', 'Bolster Defenses', 'buff', 2n, 25n, 'all_allies');
}

export function ensureWorldLayout(ctx: any) {
  const upsertRegionByName = (args: {
    name: string;
    dangerMultiplier: bigint;
    regionType: string;
  }) => {
    const existing = [...ctx.db.region.iter()].find((row) => row.name === args.name);
    if (existing) {
      ctx.db.region.id.update({
        ...existing,
        name: args.name,
        dangerMultiplier: args.dangerMultiplier,
        regionType: args.regionType,
      });
      return ctx.db.region.id.find(existing.id) ?? { ...existing, ...args, id: existing.id };
    }
    return ctx.db.region.insert({
      id: 0n,
      name: args.name,
      dangerMultiplier: args.dangerMultiplier,
      regionType: args.regionType,
    });
  };
  const upsertLocationByName = (args: {
    name: string;
    description: string;
    zone: string;
    regionId: bigint;
    levelOffset: bigint;
    isSafe: boolean;
    terrainType: string;
    bindStone: boolean;
    craftingAvailable: boolean;
  }) => {
    const existing = [...ctx.db.location.iter()].find((row) => row.name === args.name);
    if (existing) {
      ctx.db.location.id.update({
        ...existing,
        name: args.name,
        description: args.description,
        zone: args.zone,
        regionId: args.regionId,
        levelOffset: args.levelOffset,
        isSafe: args.isSafe,
        terrainType: args.terrainType,
        bindStone: args.bindStone,
        craftingAvailable: args.craftingAvailable,
      });
      return ctx.db.location.id.find(existing.id) ?? { ...existing, ...args, id: existing.id };
    }
    return ctx.db.location.insert({
      id: 0n,
      name: args.name,
      description: args.description,
      zone: args.zone,
      regionId: args.regionId,
      levelOffset: args.levelOffset,
      isSafe: args.isSafe,
      terrainType: args.terrainType,
      bindStone: args.bindStone,
      craftingAvailable: args.craftingAvailable,
    });
  };
  const connectIfMissing = (fromId: bigint, toId: bigint) => {
    if (!areLocationsConnected(ctx, fromId, toId)) {
      connectLocations(ctx, fromId, toId);
    }
  };

  const starter = upsertRegionByName({
    name: 'Hollowmere Vale',
    dangerMultiplier: 100n,
    regionType: 'outdoor',
  });
  const border = upsertRegionByName({
    name: 'Embermarch Fringe',
    dangerMultiplier: 160n,
    regionType: 'outdoor',
  });
  const embermarchDepths = upsertRegionByName({
    name: 'Embermarch Depths',
    dangerMultiplier: 200n,
    regionType: 'dungeon',
  });

  const town = upsertLocationByName({
    name: 'Hollowmere',
    description: 'A misty river town with lantern-lit docks and a quiet market square.',
    zone: 'Starter',
    regionId: starter.id,
    levelOffset: 0n,
    isSafe: true,
    terrainType: 'town',
    bindStone: false,
    craftingAvailable: true,
  });
  const ashen = upsertLocationByName({
    name: 'Ashen Road',
    description: 'A cracked highway flanked by dead trees and drifting embers.',
    zone: 'Starter',
    regionId: starter.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'plains',
    bindStone: true,
    craftingAvailable: false,
  });
  const fogroot = upsertLocationByName({
    name: 'Fogroot Crossing',
    description: 'Twisted roots and slick stones mark a shadowy crossing.',
    zone: 'Starter',
    regionId: starter.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'swamp',
    bindStone: false,
    craftingAvailable: false,
  });
  const bramble = upsertLocationByName({
    name: 'Bramble Hollow',
    description: 'A dense thicket where tangled branches muffle the light.',
    zone: 'Starter',
    regionId: starter.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'woods',
    bindStone: false,
    craftingAvailable: false,
  });
  const gate = upsertLocationByName({
    name: 'Embermarch Gate',
    description: 'A scorched pass leading toward harsher lands.',
    zone: 'Border',
    regionId: border.id,
    levelOffset: 3n,
    isSafe: false,
    terrainType: 'mountains',
    bindStone: false,
    craftingAvailable: false,
  });
  const cinder = upsertLocationByName({
    name: 'Cinderwatch',
    description: 'Ash dunes and ember winds test the brave.',
    zone: 'Border',
    regionId: border.id,
    levelOffset: 5n,
    isSafe: false,
    terrainType: 'plains',
    bindStone: false,
    craftingAvailable: false,
  });
  const ashvault = upsertLocationByName({
    name: 'Ashvault Entrance',
    description: 'Blackened stone stairs descend into a sulfur-lit vault.',
    zone: 'Dungeon',
    regionId: embermarchDepths.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const sootveil = upsertLocationByName({
    name: 'Sootveil Hall',
    description: 'Echoing halls where soot clings to every surface.',
    zone: 'Dungeon',
    regionId: embermarchDepths.id,
    levelOffset: 3n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const furnace = upsertLocationByName({
    name: 'Furnace Crypt',
    description: 'A heat-soaked crypt of iron coffins and smoldering braziers.',
    zone: 'Dungeon',
    regionId: embermarchDepths.id,
    levelOffset: 4n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });

  const world = getWorldState(ctx);
  if (world) {
    ctx.db.worldState.id.update({
      ...world,
      startingLocationId: town.id,
    });
  } else {
    ctx.db.worldState.insert({
      id: 1n,
      startingLocationId: town.id,
      isNight: false,
      nextTransitionAtMicros: ctx.timestamp.microsSinceUnixEpoch + DAY_DURATION_MICROS,
    });
  }

  connectIfMissing(town.id, ashen.id);
  connectIfMissing(ashen.id, fogroot.id);
  connectIfMissing(fogroot.id, bramble.id);
  connectIfMissing(fogroot.id, gate.id);
  connectIfMissing(gate.id, cinder.id);
  connectIfMissing(gate.id, ashvault.id);
  connectIfMissing(ashvault.id, sootveil.id);
  connectIfMissing(sootveil.id, furnace.id);
}

