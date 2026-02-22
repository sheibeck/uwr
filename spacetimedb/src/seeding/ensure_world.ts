import { SenderError } from 'spacetimedb/server';
import {
  connectLocations,
  findEnemyTemplateByName,
  areLocationsConnected,
  getWorldState,
  DAY_DURATION_MICROS,
} from '../helpers/location';
import { NPC_PERSONALITIES } from '../data/npc_data';
import { NPC_DIALOGUE_OPTIONS } from '../data/dialogue_data';
import { ENEMY_ABILITIES, ENEMY_TEMPLATE_ABILITIES } from '../data/abilities/enemy_abilities';

export function ensureNpcs(ctx: any) {
  const upsertNpcByName = (args: {
    name: string;
    npcType: string;
    locationName: string;
    description: string;
    greeting: string;
    factionId?: bigint;
    personalityJson?: string;
    baseMood?: string;
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
        factionId: args.factionId,
        personalityJson: args.personalityJson,
        baseMood: args.baseMood,
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
      factionId: args.factionId,
      personalityJson: args.personalityJson,
      baseMood: args.baseMood,
    });
  };

  // Lookup faction IDs
  let ironCompactFactionId: bigint | undefined = undefined;
  let verdantCircleFactionId: bigint | undefined = undefined;
  let ashenOrderFactionId: bigint | undefined = undefined;
  let freeBladesFactionId: bigint | undefined = undefined;
  for (const f of ctx.db.faction.iter()) {
    if (f.name === 'Iron Compact') {
      ironCompactFactionId = f.id;
    } else if (f.name === 'Verdant Circle') {
      verdantCircleFactionId = f.id;
    } else if (f.name === 'Ashen Order') {
      ashenOrderFactionId = f.id;
    } else if (f.name === 'Free Blades') {
      freeBladesFactionId = f.id;
    }
  }

  upsertNpcByName({
    name: 'Marla the Guide',
    npcType: 'quest',
    locationName: 'Hollowmere',
    description: 'A veteran scout who knows every trail between the river and the emberlands.',
    greeting: 'Welcome, traveler. The road is cruel, but I can help you find your footing.',
    baseMood: 'focused',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.veteran_scout),
  });
  upsertNpcByName({
    name: 'Elder Soren',
    npcType: 'lore',
    locationName: 'Hollowmere',
    description: 'A stoic town elder with a gaze that weighs every word.',
    greeting: 'Hollowmere watches over its own. Keep your blade sharp and your wits sharper.',
    baseMood: 'contemplative',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.wise_elder),
  });
  upsertNpcByName({
    name: 'Quartermaster Jyn',
    npcType: 'vendor',
    locationName: 'Hollowmere',
    description: 'A brisk quartermaster tallying supplies near the lantern-lit market.',
    greeting: 'Supplies are tight. If you can help keep the roads safe, the town will remember.',
    baseMood: 'brisk',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.friendly_merchant),
    factionId: ironCompactFactionId,
  });
  upsertNpcByName({
    name: 'Thurwick',
    npcType: 'banker',
    locationName: 'Hollowmere',
    description: 'A meticulous record-keeper who manages the town vault with quiet precision.',
    greeting: 'Your valuables are safe with me. The vault has never been breached.',
    baseMood: 'composed',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.shrewd_trader),
  });

  // Hollowmere Vale - New NPCs
  upsertNpcByName({
    name: 'Warden Kael',
    npcType: 'quest',
    locationName: 'Bramble Hollow',
    description: 'A ranger who patrols the thickets hunting Blight Stalkers.',
    greeting: 'Stay low and move quick. The thickets have teeth.',
    baseMood: 'watchful',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.veteran_scout),
  });
  upsertNpcByName({
    name: 'Herbalist Venna',
    npcType: 'quest',
    locationName: 'Willowfen',
    description: 'A Verdant Circle herbalist gathering reagents from the marshes.',
    greeting: 'The marshes give and the marshes take. I am here to make sure it gives more.',
    baseMood: 'tired',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.weary_healer),
    factionId: verdantCircleFactionId,
  });
  upsertNpcByName({
    name: 'Old Moss',
    npcType: 'lore',
    locationName: 'Lichen Ridge',
    description: 'A reclusive old man who watches the marshlands from his ridge perch.',
    greeting: 'Hmph. Another one climbing up here to gawk. Well, sit down if you must.',
    baseMood: 'gruff',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.wise_elder),
  });

  // Embermarch Fringe - New NPCs
  upsertNpcByName({
    name: 'Forgemaster Dara',
    npcType: 'vendor',
    locationName: 'Slagstone Waystation',
    description: 'An Iron Compact smith running the waystation forge.',
    greeting: 'Iron bends to will, not whim. What do you need forged?',
    baseMood: 'focused',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.friendly_merchant),
    factionId: ironCompactFactionId,
  });
  upsertNpcByName({
    name: 'Scout Thessa',
    npcType: 'quest',
    locationName: 'Cinderwatch',
    description: 'A Free Blades scout tracking enemy movement across the ash dunes.',
    greeting: 'You look like you can handle yourself. The Fringe needs fighters.',
    baseMood: 'alert',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.hardened_soldier),
    factionId: freeBladesFactionId,
  });
  upsertNpcByName({
    name: 'Ashwalker Ren',
    npcType: 'quest',
    locationName: 'Charwood Copse',
    description: 'An Ashen Order researcher studying the petrified trees and undead activity.',
    greeting: 'The dead do not rest here. I study why. Care to help?',
    baseMood: 'curious',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.curious_scholar),
    factionId: ashenOrderFactionId,
  });
  upsertNpcByName({
    name: 'Exile Voss',
    npcType: 'lore',
    locationName: 'Brimstone Gulch',
    description: 'A bitter exile who knows the mountain passes.',
    greeting: 'Keep walking. Unless you have coin or news.',
    baseMood: 'bitter',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.bitter_exile),
  });

  // Embermarch Depths - New NPCs
  upsertNpcByName({
    name: 'Torchbearer Isa',
    npcType: 'quest',
    locationName: 'Gloomspire Landing',
    description: 'A brave torchbearer who keeps the landing safe for adventurers.',
    greeting: 'This is the last safe light before the deep. Ready yourself.',
    baseMood: 'resolute',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.hardened_soldier),
  });
  upsertNpcByName({
    name: 'Keeper Mordane',
    npcType: 'lore',
    locationName: 'Sootveil Hall',
    description: 'An Ashen Order keeper who studies the vault\'s history.',
    greeting: 'These halls remember what we have forgotten. Tread carefully.',
    baseMood: 'solemn',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.dungeon_warden),
    factionId: ashenOrderFactionId,
  });
}

export function ensureQuestTemplates(ctx: any) {
  const upsertQuestByName = (args: {
    name: string;
    npcName: string;
    enemyName?: string;
    requiredCount: bigint;
    minLevel: bigint;
    maxLevel: bigint;
    rewardXp: bigint;
    questType?: string;
    targetLocationName?: string;
    targetNpcName?: string;
    targetItemName?: string;
    itemDropChance?: bigint;
  }) => {
    const npc = [...ctx.db.npc.iter()].find((row) => row.name === args.npcName);
    const enemy = args.enemyName ? findEnemyTemplateByName(ctx, args.enemyName) : null;
    const targetLocation = args.targetLocationName
      ? [...ctx.db.location.iter()].find((row) => row.name === args.targetLocationName)
      : null;
    const targetNpc = args.targetNpcName
      ? [...ctx.db.npc.iter()].find((row) => row.name === args.targetNpcName)
      : null;
    if (!npc) return;
    // enemy is optional for non-kill quests
    const existing = [...ctx.db.questTemplate.iter()].find((row) => row.name === args.name);
    if (existing) {
      ctx.db.questTemplate.id.update({
        ...existing,
        name: args.name,
        npcId: npc.id,
        targetEnemyTemplateId: enemy?.id ?? existing.targetEnemyTemplateId ?? 0n,
        requiredCount: args.requiredCount,
        minLevel: args.minLevel,
        maxLevel: args.maxLevel,
        rewardXp: args.rewardXp,
        questType: args.questType ?? 'kill',
        targetLocationId: targetLocation?.id,
        targetNpcId: targetNpc?.id,
        targetItemName: args.targetItemName,
        itemDropChance: args.itemDropChance,
      });
      return;
    }
    ctx.db.questTemplate.insert({
      id: 0n,
      name: args.name,
      npcId: npc.id,
      targetEnemyTemplateId: enemy?.id ?? 0n,
      requiredCount: args.requiredCount,
      minLevel: args.minLevel,
      maxLevel: args.maxLevel,
      rewardXp: args.rewardXp,
      questType: args.questType ?? 'kill',
      targetLocationId: targetLocation?.id,
      targetNpcId: targetNpc?.id,
      targetItemName: args.targetItemName,
      itemDropChance: args.itemDropChance,
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

  // Hollowmere Vale quests
  upsertQuestByName({
    name: 'Wolf Pack Thinning',
    npcName: 'Warden Kael',
    enemyName: 'Thicket Wolf',
    requiredCount: 5n,
    minLevel: 1n,
    maxLevel: 3n,
    rewardXp: 50n,
  });
  upsertQuestByName({
    name: 'Stalker Hunt',
    npcName: 'Warden Kael',
    enemyName: 'Blight Stalker',
    requiredCount: 3n,
    minLevel: 2n,
    maxLevel: 5n,
    rewardXp: 70n,
  });
  upsertQuestByName({
    name: 'Croaker Culling',
    npcName: 'Herbalist Venna',
    enemyName: 'Marsh Croaker',
    requiredCount: 6n,
    minLevel: 1n,
    maxLevel: 3n,
    rewardXp: 45n,
  });

  // Embermarch Fringe quests
  upsertQuestByName({
    name: 'Jackal Purge',
    npcName: 'Scout Thessa',
    enemyName: 'Ash Jackal',
    requiredCount: 5n,
    minLevel: 2n,
    maxLevel: 5n,
    rewardXp: 80n,
  });
  upsertQuestByName({
    name: 'Sentinel Dismantling',
    npcName: 'Scout Thessa',
    enemyName: 'Cinder Sentinel',
    requiredCount: 3n,
    minLevel: 3n,
    maxLevel: 6n,
    rewardXp: 100n,
  });
  upsertQuestByName({
    name: 'Sprite Specimens',
    npcName: 'Ashwalker Ren',
    enemyName: 'Thorn Sprite',
    requiredCount: 4n,
    minLevel: 2n,
    maxLevel: 5n,
    rewardXp: 65n,
  });

  // Embermarch Depths quests
  upsertQuestByName({
    name: 'Revenant Scourge',
    npcName: 'Torchbearer Isa',
    enemyName: 'Ashforged Revenant',
    requiredCount: 4n,
    minLevel: 4n,
    maxLevel: 8n,
    rewardXp: 140n,
  });
  upsertQuestByName({
    name: 'Vault Clearing',
    npcName: 'Torchbearer Isa',
    enemyName: 'Vault Sentinel',
    requiredCount: 5n,
    minLevel: 4n,
    maxLevel: 7n,
    rewardXp: 120n,
  });
  upsertQuestByName({
    name: 'Mystic Suppression',
    npcName: 'Keeper Mordane',
    enemyName: 'Sootbound Mystic',
    requiredCount: 4n,
    minLevel: 4n,
    maxLevel: 8n,
    rewardXp: 130n,
  });

  // === Phase 6: New Quest Types ===

  // Marla the Guide — delivery quest
  upsertQuestByName({
    name: 'Old Debts',
    npcName: 'Marla the Guide',
    requiredCount: 1n,
    minLevel: 1n,
    maxLevel: 10n,
    rewardXp: 80n,
    questType: 'delivery',
    targetNpcName: 'Scout Thessa',
  });

  // Warden Kael — kill_loot + explore
  upsertQuestByName({
    name: 'Stolen Supply Cache',
    npcName: 'Warden Kael',
    enemyName: 'Thicket Wolf',
    requiredCount: 1n,
    minLevel: 1n,
    maxLevel: 5n,
    rewardXp: 70n,
    questType: 'kill_loot',
    targetItemName: 'Stolen Supply Pack',
    itemDropChance: 25n,
  });
  upsertQuestByName({
    name: "The Ranger's Cache",
    npcName: 'Warden Kael',
    requiredCount: 1n,
    minLevel: 2n,
    maxLevel: 6n,
    rewardXp: 100n,
    questType: 'explore',
    targetLocationName: 'Bramble Hollow',
    targetItemName: 'Buried Supply Cache',
  });

  // Herbalist Venna — explore + kill_loot
  upsertQuestByName({
    name: 'Bogfen Healing Moss',
    npcName: 'Herbalist Venna',
    requiredCount: 1n,
    minLevel: 1n,
    maxLevel: 5n,
    rewardXp: 65n,
    questType: 'explore',
    targetLocationName: 'Willowfen',
    targetItemName: 'Rare Healing Moss',
  });
  upsertQuestByName({
    name: 'Croaker Bile Glands',
    npcName: 'Herbalist Venna',
    enemyName: 'Marsh Croaker',
    requiredCount: 1n,
    minLevel: 2n,
    maxLevel: 5n,
    rewardXp: 90n,
    questType: 'kill_loot',
    targetItemName: 'Fresh Bile Gland',
    itemDropChance: 30n,
  });

  // Scout Thessa — explore + delivery (unlocked via Marla delivery chain)
  upsertQuestByName({
    name: 'Enemy Scouting Reports',
    npcName: 'Scout Thessa',
    requiredCount: 1n,
    minLevel: 3n,
    maxLevel: 8n,
    rewardXp: 120n,
    questType: 'explore',
    targetLocationName: 'Cinderwatch',
    targetItemName: 'Scouting Reports',
  });
  upsertQuestByName({
    name: 'The Iron Compact Leak',
    npcName: 'Scout Thessa',
    requiredCount: 1n,
    minLevel: 3n,
    maxLevel: 8n,
    rewardXp: 110n,
    questType: 'delivery',
    targetNpcName: 'Keeper Mordane',
  });

  // Ashwalker Ren — kill_loot + boss_kill
  upsertQuestByName({
    name: 'Encryption Key',
    npcName: 'Ashwalker Ren',
    enemyName: 'Cinder Sentinel',
    requiredCount: 1n,
    minLevel: 3n,
    maxLevel: 7n,
    rewardXp: 100n,
    questType: 'kill_loot',
    targetItemName: 'Cipher Key Fragment',
    itemDropChance: 20n,
  });
  upsertQuestByName({
    name: 'The Ashforged Commander',
    npcName: 'Ashwalker Ren',
    enemyName: 'Cinder Sentinel',
    requiredCount: 1n,
    minLevel: 4n,
    maxLevel: 8n,
    rewardXp: 200n,
    questType: 'boss_kill',
    targetLocationName: 'Scoria Flats',
    targetItemName: 'Ashforged Commander',
  });

  // Torchbearer Isa — boss_kill + explore
  upsertQuestByName({
    name: 'The Revenant Lord',
    npcName: 'Torchbearer Isa',
    enemyName: 'Ashforged Revenant',
    requiredCount: 1n,
    minLevel: 4n,
    maxLevel: 8n,
    rewardXp: 200n,
    questType: 'boss_kill',
    targetLocationName: 'Furnace Crypt',
    targetItemName: 'Revenant Lord',
  });
  upsertQuestByName({
    name: 'The Binding Seal',
    npcName: 'Torchbearer Isa',
    requiredCount: 1n,
    minLevel: 4n,
    maxLevel: 8n,
    rewardXp: 150n,
    questType: 'explore',
    targetLocationName: 'Embervault Sanctum',
    targetItemName: 'Ancient Binding Seal',
  });

  // Keeper Mordane — explore + boss_kill (unlocked via Thessa delivery chain)
  upsertQuestByName({
    name: "The Keeper's Ledger",
    npcName: 'Keeper Mordane',
    requiredCount: 1n,
    minLevel: 5n,
    maxLevel: 10n,
    rewardXp: 160n,
    questType: 'explore',
    targetLocationName: 'Bonecinder Gallery',
    targetItemName: "Keeper's Ledger",
  });
  upsertQuestByName({
    name: 'The Vault Warden',
    npcName: 'Keeper Mordane',
    enemyName: 'Vault Sentinel',
    requiredCount: 1n,
    minLevel: 5n,
    maxLevel: 10n,
    rewardXp: 250n,
    questType: 'boss_kill',
    targetLocationName: 'The Crucible',
    targetItemName: 'Vault Warden',
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

  // Upsert current abilities from the map
  for (const [templateName, abilityKeys] of Object.entries(ENEMY_TEMPLATE_ABILITIES)) {
    for (const abilityKey of abilityKeys) {
      const ability = ENEMY_ABILITIES[abilityKey as keyof typeof ENEMY_ABILITIES];
      if (!ability) continue;
      upsertEnemyAbility(
        templateName,
        abilityKey,
        ability.name,
        ability.kind,
        ability.castSeconds,
        ability.cooldownSeconds,
        ability.targetRule,
      );
    }
  }

  // Clean up stale DB rows for abilities that were removed from the map.
  // Iterates all enemy templates: if a template has DB ability rows that are
  // no longer listed in ENEMY_TEMPLATE_ABILITIES, delete them.
  for (const template of ctx.db.enemyTemplate.iter()) {
    const allowedKeys = new Set(
      ENEMY_TEMPLATE_ABILITIES[template.name as keyof typeof ENEMY_TEMPLATE_ABILITIES] ?? []
    );
    for (const row of ctx.db.enemyAbility.by_template.filter(template.id)) {
      if (!allowedKeys.has(row.abilityKey)) {
        ctx.db.enemyAbility.id.delete(row.id);
      }
    }
  }
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
    bindStone: true,
    craftingAvailable: true,
  });
  const ashen = upsertLocationByName({
    name: 'Ashen Road',
    description: 'A cracked highway flanked by dead trees and drifting embers.',
    zone: 'Starter',
    regionId: starter.id,
    levelOffset: 0n,
    isSafe: false,
    terrainType: 'plains',
    bindStone: false,
    craftingAvailable: false,
  });
  const fogroot = upsertLocationByName({
    name: 'Fogroot Crossing',
    description: 'Twisted roots and slick stones mark a shadowy crossing.',
    zone: 'Starter',
    regionId: starter.id,
    levelOffset: 1n,
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
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'woods',
    bindStone: false,
    craftingAvailable: false,
  });
  const willowfen = upsertLocationByName({
    name: 'Willowfen',
    description: 'Drooping willows arch over stagnant pools buzzing with marsh flies.',
    zone: 'Starter',
    regionId: starter.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'swamp',
    bindStone: false,
    craftingAvailable: false,
  });
  const ironbell = upsertLocationByName({
    name: 'Ironbell Farmstead',
    description: 'An abandoned farmstead where a rusted bell still hangs in the rafters.',
    zone: 'Starter',
    regionId: starter.id,
    levelOffset: 0n,
    isSafe: false,
    terrainType: 'plains',
    bindStone: false,
    craftingAvailable: false,
  });
  const duskwater = upsertLocationByName({
    name: 'Duskwater Shallows',
    description: 'Ankle-deep water stretches across a grey mudflat dotted with reeds.',
    zone: 'Starter',
    regionId: starter.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'swamp',
    bindStone: false,
    craftingAvailable: false,
  });
  const thornveil = upsertLocationByName({
    name: 'Thornveil Thicket',
    description: 'Barbed vines weave a living wall between ancient oaks.',
    zone: 'Starter',
    regionId: starter.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'woods',
    bindStone: false,
    craftingAvailable: false,
  });
  const lichenRidge = upsertLocationByName({
    name: 'Lichen Ridge',
    description: 'A low ridge of mossy boulders overlooking the marshlands below.',
    zone: 'Starter',
    regionId: starter.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'mountains',
    bindStone: false,
    craftingAvailable: false,
  });
  const cairnMeadow = upsertLocationByName({
    name: 'Cairn Meadow',
    description: 'Tall grass sways around weathered stone cairns left by forgotten travelers.',
    zone: 'Starter',
    regionId: starter.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'plains',
    bindStone: false,
    craftingAvailable: false,
  });
  const gate = upsertLocationByName({
    name: 'Embermarch Gate',
    description: 'A scorched pass leading toward harsher lands.',
    zone: 'Border',
    regionId: border.id,
    levelOffset: 1n,
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
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'plains',
    bindStone: false,
    craftingAvailable: false,
  });
  const slagstone = upsertLocationByName({
    name: 'Slagstone Waystation',
    description: 'A crumbling waystation built from dark volcanic stone, offering meager shelter.',
    zone: 'Border',
    regionId: border.id,
    levelOffset: 2n,
    isSafe: true,
    terrainType: 'town',
    bindStone: true,
    craftingAvailable: true,
  });
  const scoria = upsertLocationByName({
    name: 'Scoria Flats',
    description: 'Black glass shards crunch underfoot across a blasted volcanic plain.',
    zone: 'Border',
    regionId: border.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'plains',
    bindStone: false,
    craftingAvailable: false,
  });
  const brimstone = upsertLocationByName({
    name: 'Brimstone Gulch',
    description: 'Sulfurous fumes rise from cracks in this narrow ravine.',
    zone: 'Border',
    regionId: border.id,
    levelOffset: 3n,
    isSafe: false,
    terrainType: 'mountains',
    bindStone: false,
    craftingAvailable: false,
  });
  const charwood = upsertLocationByName({
    name: 'Charwood Copse',
    description: 'Petrified trees stand like black sentinels in this scorched woodland.',
    zone: 'Border',
    regionId: border.id,
    levelOffset: 3n,
    isSafe: false,
    terrainType: 'woods',
    bindStone: false,
    craftingAvailable: false,
  });
  const smolder = upsertLocationByName({
    name: 'Smolder Marsh',
    description: 'Steam curls from warm, bubbling pools in this geothermal swamp.',
    zone: 'Border',
    regionId: border.id,
    levelOffset: 3n,
    isSafe: false,
    terrainType: 'swamp',
    bindStone: false,
    craftingAvailable: false,
  });
  const ironvein = upsertLocationByName({
    name: 'Ironvein Pass',
    description: 'Exposed ore veins streak the walls of this wind-scoured mountain pass.',
    zone: 'Border',
    regionId: border.id,
    levelOffset: 4n,
    isSafe: false,
    terrainType: 'mountains',
    bindStone: false,
    craftingAvailable: false,
  });
  const pyre = upsertLocationByName({
    name: 'Pyre Overlook',
    description: 'A scorched clifftop with a commanding view of the ember-lit valleys below.',
    zone: 'Border',
    regionId: border.id,
    levelOffset: 4n,
    isSafe: false,
    terrainType: 'mountains',
    bindStone: false,
    craftingAvailable: false,
  });
  const ashfen = upsertLocationByName({
    name: 'Ashfen Hollow',
    description: 'Ash-grey reeds choke a low basin where embers drift on the wind.',
    zone: 'Border',
    regionId: border.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'swamp',
    bindStone: false,
    craftingAvailable: false,
  });
  const ashvault = upsertLocationByName({
    name: 'Ashvault Entrance',
    description: 'Blackened stone stairs descend into a sulfur-lit vault.',
    zone: 'Dungeon',
    regionId: embermarchDepths.id,
    levelOffset: 1n,
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
    levelOffset: 2n,
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
    levelOffset: 3n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const slagTunnels = upsertLocationByName({
    name: 'Slag Tunnels',
    description: 'Narrow passages carved by ancient lava flows, walls still warm to the touch.',
    zone: 'Dungeon',
    regionId: embermarchDepths.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const crucible = upsertLocationByName({
    name: 'The Crucible',
    description: 'A vast underground forge hall where molten metal once flowed like rivers.',
    zone: 'Dungeon',
    regionId: embermarchDepths.id,
    levelOffset: 3n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const bonecinder = upsertLocationByName({
    name: 'Bonecinder Gallery',
    description: 'Charred skeletal remains line alcoves in this grim processional corridor.',
    zone: 'Dungeon',
    regionId: embermarchDepths.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const embervault = upsertLocationByName({
    name: 'Embervault Sanctum',
    description: 'A sealed chamber where restless embers orbit a cracked obsidian altar.',
    zone: 'Dungeon',
    regionId: embermarchDepths.id,
    levelOffset: 3n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const cinderWellspring = upsertLocationByName({
    name: 'Cinder Wellspring',
    description: 'A deep shaft where magma glows far below, heating the stone floor above.',
    zone: 'Dungeon',
    regionId: embermarchDepths.id,
    levelOffset: 3n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const gloomspire = upsertLocationByName({
    name: 'Gloomspire Landing',
    description: 'A wide ledge overlooking a bottomless chasm spanned by a chain bridge. An old forge setup sits near the wall.',
    zone: 'Dungeon',
    regionId: embermarchDepths.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: true,
    craftingAvailable: true,
  });
  const ashwarden = upsertLocationByName({
    name: 'Ashwarden Throne',
    description: 'The deepest chamber where an empty throne of fused iron and bone awaits.',
    zone: 'Dungeon',
    regionId: embermarchDepths.id,
    levelOffset: 3n,
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

  // Hollowmere Vale connections (keep existing + add new)
  connectIfMissing(town.id, ashen.id);
  connectIfMissing(town.id, ironbell.id);
  connectIfMissing(town.id, cairnMeadow.id);
  connectIfMissing(ashen.id, fogroot.id);
  connectIfMissing(ashen.id, cairnMeadow.id);
  connectIfMissing(ashen.id, lichenRidge.id);
  connectIfMissing(fogroot.id, bramble.id);
  connectIfMissing(fogroot.id, willowfen.id);
  connectIfMissing(fogroot.id, duskwater.id);
  connectIfMissing(bramble.id, thornveil.id);
  connectIfMissing(willowfen.id, duskwater.id);
  connectIfMissing(thornveil.id, lichenRidge.id);
  connectIfMissing(ironbell.id, cairnMeadow.id);

  // Cross-region connection: Hollowmere Vale -> Embermarch Fringe
  connectIfMissing(fogroot.id, gate.id);

  // Embermarch Fringe connections (keep existing + add new)
  connectIfMissing(gate.id, cinder.id);
  connectIfMissing(gate.id, slagstone.id);
  connectIfMissing(gate.id, scoria.id);
  connectIfMissing(gate.id, ashfen.id);
  connectIfMissing(slagstone.id, brimstone.id);
  connectIfMissing(slagstone.id, scoria.id);
  connectIfMissing(scoria.id, charwood.id);
  connectIfMissing(scoria.id, ashfen.id);
  connectIfMissing(brimstone.id, ironvein.id);
  connectIfMissing(charwood.id, smolder.id);
  connectIfMissing(cinder.id, charwood.id);
  connectIfMissing(cinder.id, pyre.id);
  connectIfMissing(ironvein.id, pyre.id);
  connectIfMissing(smolder.id, ashfen.id);

  // Cross-region connection: Embermarch Fringe -> Embermarch Depths
  connectIfMissing(gate.id, ashvault.id);

  // Embermarch Depths connections (keep existing + add new)
  connectIfMissing(ashvault.id, sootveil.id);
  connectIfMissing(ashvault.id, slagTunnels.id);
  connectIfMissing(ashvault.id, bonecinder.id);
  connectIfMissing(slagTunnels.id, gloomspire.id);
  connectIfMissing(sootveil.id, bonecinder.id);
  connectIfMissing(sootveil.id, crucible.id);
  connectIfMissing(sootveil.id, furnace.id);
  connectIfMissing(bonecinder.id, gloomspire.id);
  connectIfMissing(gloomspire.id, crucible.id);
  connectIfMissing(crucible.id, cinderWellspring.id);
  connectIfMissing(furnace.id, embervault.id);
  connectIfMissing(furnace.id, cinderWellspring.id);
  connectIfMissing(cinderWellspring.id, ashwarden.id);
  connectIfMissing(embervault.id, ashwarden.id);
}

export function ensureDialogueOptions(ctx: any) {
  for (const option of NPC_DIALOGUE_OPTIONS) {
    // Resolve npcName to npcId
    let npcId: bigint | null = null;
    for (const npc of ctx.db.npc.iter()) {
      if (npc.name === option.npcName) {
        npcId = npc.id;
        break;
      }
    }
    if (!npcId) continue;

    // Resolve parentOptionKey to parentOptionId (if set)
    let parentOptionId: bigint | undefined = undefined;
    if (option.parentOptionKey) {
      for (const opt of ctx.db.npcDialogueOption.by_npc.filter(npcId)) {
        if (opt.optionKey === option.parentOptionKey) {
          parentOptionId = opt.id;
          break;
        }
      }
      if (!parentOptionId) continue; // Parent not found, skip this option
    }

    // Check if option already exists
    let existing: any = null;
    for (const opt of ctx.db.npcDialogueOption.by_npc.filter(npcId)) {
      if (opt.optionKey === option.optionKey) {
        existing = opt;
        break;
      }
    }

    if (existing) {
      // Update existing option
      ctx.db.npcDialogueOption.id.update({
        ...existing,
        npcId,
        parentOptionId,
        optionKey: option.optionKey,
        playerText: option.playerText,
        npcResponse: option.npcResponse,
        requiredAffinity: option.requiredAffinity,
        requiredFactionId: undefined,
        requiredFactionStanding: undefined,
        requiredRenownRank: undefined,
        affinityChange: option.affinityChange,
        sortOrder: option.sortOrder,
        questTemplateName: option.questTemplateName,
        affinityHint: option.affinityHint,
        isAffinityLocked: option.isAffinityLocked,
      });
    } else {
      // Insert new option
      ctx.db.npcDialogueOption.insert({
        id: 0n,
        npcId,
        parentOptionId,
        optionKey: option.optionKey,
        playerText: option.playerText,
        npcResponse: option.npcResponse,
        requiredAffinity: option.requiredAffinity,
        requiredFactionId: undefined,
        requiredFactionStanding: undefined,
        requiredRenownRank: undefined,
        affinityChange: option.affinityChange,
        sortOrder: option.sortOrder,
        questTemplateName: option.questTemplateName,
        affinityHint: option.affinityHint,
        isAffinityLocked: option.isAffinityLocked,
      });
    }
  }
}

