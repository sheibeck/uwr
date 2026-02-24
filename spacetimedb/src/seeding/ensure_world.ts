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

  // Greyveil Moors NPCs
  upsertNpcByName({
    name: 'Taverness Ellyn',
    npcType: 'vendor',
    locationName: 'Greyveil Crossroads',
    description: 'A no-nonsense innkeeper who trades supplies for news of the road.',
    greeting: 'Warm food and cold ale. What else do you need?',
    baseMood: 'brisk',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.friendly_merchant),
    factionId: freeBladesFactionId,
  });
  upsertNpcByName({
    name: 'Moorcaller Phelan',
    npcType: 'quest',
    locationName: 'Greyveil Crossroads',
    description: 'A hooded figure who communes with the spirits of the moor.',
    greeting: 'The moors speak to those who listen. Do you hear them?',
    baseMood: 'contemplative',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.curious_scholar),
    factionId: verdantCircleFactionId,
  });
  upsertNpcByName({
    name: 'Gravewatcher Maren',
    npcType: 'quest',
    locationName: 'Barrowfield',
    description: 'A somber woman who guards the barrow tombs from desecration.',
    greeting: 'The dead deserve their rest. Help me protect them.',
    baseMood: 'solemn',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.hardened_soldier),
    factionId: ashenOrderFactionId,
  });
  upsertNpcByName({
    name: 'Hermit Dunstan',
    npcType: 'lore',
    locationName: 'Wraith Hollow',
    description: 'A wild-eyed hermit who claims to hear the dead speak.',
    greeting: 'Shhh! They are talking. Always talking. Can you not hear them?',
    baseMood: 'nervous',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.bitter_exile),
  });

  // Silverpine Forest NPCs
  upsertNpcByName({
    name: 'Rootwarden Lyria',
    npcType: 'quest',
    locationName: 'Silverroot Camp',
    description: 'A Verdant Circle ranger who protects the oldest trees.',
    greeting: 'The forest is under siege from within. Will you help defend it?',
    baseMood: 'determined',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.veteran_scout),
    factionId: verdantCircleFactionId,
  });
  upsertNpcByName({
    name: 'Alchemist Corwin',
    npcType: 'vendor',
    locationName: 'Silverroot Camp',
    description: 'A traveling alchemist who studies the unique properties of silverpine sap.',
    greeting: 'Fascinating specimens here. Need potions? I have the finest silverpine distillates.',
    baseMood: 'enthusiastic',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.shrewd_trader),
    factionId: verdantCircleFactionId,
  });
  upsertNpcByName({
    name: 'Spider Hunter Vex',
    npcType: 'quest',
    locationName: 'Webwood Thicket',
    description: 'A scarred hunter who tracks the giant spiders deeper into the forest.',
    greeting: 'Watch where you step. The webs are everywhere.',
    baseMood: 'alert',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.hardened_soldier),
    factionId: freeBladesFactionId,
  });
  upsertNpcByName({
    name: 'Sage Tindra',
    npcType: 'lore',
    locationName: 'Mossgrave Ruins',
    description: 'An elderly scholar piecing together the history of the ruined civilization.',
    greeting: 'These walls speak of a people who came before us. Their story must not be lost.',
    baseMood: 'focused',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.wise_elder),
  });

  // Ironhold Garrison NPCs
  upsertNpcByName({
    name: 'Marshal Greyholt',
    npcType: 'quest',
    locationName: 'Ironhold Keep',
    description: 'The garrison\'s commanding officer, stern and unyielding.',
    greeting: 'State your business. The garrison has no time for idle chatter.',
    baseMood: 'stern',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.grumpy_guard),
    factionId: ironCompactFactionId,
  });
  upsertNpcByName({
    name: 'Field Medic Saera',
    npcType: 'quest',
    locationName: 'Quarantine Ward',
    description: 'A tired healer working tirelessly to contain the plague.',
    greeting: 'More patients every day. If you are healthy, count your blessings.',
    baseMood: 'exhausted',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.weary_healer),
    factionId: ironCompactFactionId,
  });
  upsertNpcByName({
    name: 'Armorer Brant',
    npcType: 'vendor',
    locationName: 'Ironhold Keep',
    description: 'A master smith who forges the garrison\'s finest equipment.',
    greeting: 'Iron Compact steel. The best in the land. What do you need?',
    baseMood: 'proud',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.friendly_merchant),
    factionId: ironCompactFactionId,
  });
  upsertNpcByName({
    name: 'Deserter Callum',
    npcType: 'lore',
    locationName: 'Siege Fields',
    description: 'A former knight who questions the Compact\'s methods.',
    greeting: 'I served. I saw. I left. Do not judge what you do not understand.',
    baseMood: 'weary',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.bitter_exile),
    factionId: freeBladesFactionId,
  });

  // Dreadspire Ruins NPCs
  upsertNpcByName({
    name: 'Pathfinder Zara',
    npcType: 'quest',
    locationName: 'Spire Barracks',
    description: 'A fearless explorer who maps the ruins\' shifting corridors.',
    greeting: 'Another brave soul. Good. We need all the help we can get down here.',
    baseMood: 'resolute',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.veteran_scout),
    factionId: freeBladesFactionId,
  });
  upsertNpcByName({
    name: 'Arcanist Morvaine',
    npcType: 'quest',
    locationName: 'Runecarver Chamber',
    description: 'An Ashen Order scholar studying the spire\'s dark magic.',
    greeting: 'The runes here predate the Ashfall. Their power is immense and dangerous.',
    baseMood: 'intense',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.curious_scholar),
    factionId: ashenOrderFactionId,
  });
  upsertNpcByName({
    name: 'Keeper of Bones',
    npcType: 'lore',
    locationName: 'Bone Reliquary',
    description: 'A disturbing figure who catalogs the dead with unsettling care.',
    greeting: 'Every bone tells a story. I listen. I catalog. I remember.',
    baseMood: 'eerie',
    personalityJson: JSON.stringify(NPC_PERSONALITIES.dungeon_warden),
    factionId: ashenOrderFactionId,
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
    const existing = [...ctx.db.quest_template.iter()].find((row) => row.name === args.name);
    if (existing) {
      ctx.db.quest_template.id.update({
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
    ctx.db.quest_template.insert({
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

  // === Greyveil Moors quests ===
  upsertQuestByName({
    name: 'Harrier Harassment',
    npcName: 'Moorcaller Phelan',
    enemyName: 'Moorland Harrier',
    requiredCount: 4n,
    minLevel: 3n,
    maxLevel: 5n,
    rewardXp: 80n,
  });
  upsertQuestByName({
    name: 'Barrow Blight',
    npcName: 'Gravewatcher Maren',
    enemyName: 'Barrow Wight',
    requiredCount: 3n,
    minLevel: 4n,
    maxLevel: 6n,
    rewardXp: 110n,
  });
  upsertQuestByName({
    name: 'Wight Relics',
    npcName: 'Gravewatcher Maren',
    enemyName: 'Barrow Wight',
    requiredCount: 1n,
    minLevel: 4n,
    maxLevel: 6n,
    rewardXp: 120n,
    questType: 'kill_loot',
    targetItemName: 'Ancient Wight Relic',
    itemDropChance: 25n,
  });
  upsertQuestByName({
    name: "The Hermit's Warning",
    npcName: 'Gravewatcher Maren',
    requiredCount: 1n,
    minLevel: 3n,
    maxLevel: 10n,
    rewardXp: 90n,
    questType: 'delivery',
    targetNpcName: 'Hermit Dunstan',
  });
  upsertQuestByName({
    name: 'Moorland Survey',
    npcName: 'Moorcaller Phelan',
    requiredCount: 1n,
    minLevel: 3n,
    maxLevel: 6n,
    rewardXp: 100n,
    questType: 'explore',
    targetLocationName: 'Hauntwell Springs',
    targetItemName: 'Moorland Survey Notes',
  });

  // === Silverpine Forest quests ===
  upsertQuestByName({
    name: 'Spider Infestation',
    npcName: 'Spider Hunter Vex',
    enemyName: 'Webspinner',
    requiredCount: 5n,
    minLevel: 4n,
    maxLevel: 6n,
    rewardXp: 120n,
  });
  upsertQuestByName({
    name: 'Sentinel Communion',
    npcName: 'Rootwarden Lyria',
    enemyName: 'Silverpine Sentinel',
    requiredCount: 3n,
    minLevel: 5n,
    maxLevel: 7n,
    rewardXp: 140n,
  });
  upsertQuestByName({
    name: 'Troll Slaying',
    npcName: 'Spider Hunter Vex',
    enemyName: 'Moss Troll',
    requiredCount: 2n,
    minLevel: 5n,
    maxLevel: 8n,
    rewardXp: 160n,
  });
  upsertQuestByName({
    name: 'Druid Corruption',
    npcName: 'Rootwarden Lyria',
    enemyName: 'Feral Druid',
    requiredCount: 4n,
    minLevel: 5n,
    maxLevel: 7n,
    rewardXp: 130n,
  });
  upsertQuestByName({
    name: 'Roots of Darkness',
    npcName: 'Rootwarden Lyria',
    requiredCount: 1n,
    minLevel: 4n,
    maxLevel: 7n,
    rewardXp: 110n,
    questType: 'explore',
    targetLocationName: 'Rootknot Caves',
    targetItemName: 'Corrupted Root Sample',
  });
  upsertQuestByName({
    name: 'The Lost Expedition',
    npcName: 'Sage Tindra',
    requiredCount: 1n,
    minLevel: 5n,
    maxLevel: 7n,
    rewardXp: 120n,
    questType: 'explore',
    targetLocationName: 'Mossgrave Ruins',
    targetItemName: 'Expedition Journal',
  });
  upsertQuestByName({
    name: 'Venom Harvest',
    npcName: 'Spider Hunter Vex',
    enemyName: 'Webspinner',
    requiredCount: 1n,
    minLevel: 4n,
    maxLevel: 6n,
    rewardXp: 100n,
    questType: 'kill_loot',
    targetItemName: 'Spider Venom Sac',
    itemDropChance: 30n,
  });

  // === Ironhold Garrison quests ===
  upsertQuestByName({
    name: 'Golem Malfunction',
    npcName: 'Marshal Greyholt',
    enemyName: 'Iron Golem',
    requiredCount: 3n,
    minLevel: 6n,
    maxLevel: 8n,
    rewardXp: 180n,
  });
  upsertQuestByName({
    name: 'Renegade Roundup',
    npcName: 'Marshal Greyholt',
    enemyName: 'Renegade Knight',
    requiredCount: 4n,
    minLevel: 6n,
    maxLevel: 9n,
    rewardXp: 200n,
  });
  upsertQuestByName({
    name: 'Plague Source',
    npcName: 'Field Medic Saera',
    enemyName: 'Plague Cultist',
    requiredCount: 5n,
    minLevel: 6n,
    maxLevel: 8n,
    rewardXp: 170n,
  });
  upsertQuestByName({
    name: 'Cure Components',
    npcName: 'Field Medic Saera',
    enemyName: 'Plague Cultist',
    requiredCount: 1n,
    minLevel: 6n,
    maxLevel: 8n,
    rewardXp: 190n,
    questType: 'kill_loot',
    targetItemName: 'Plague Sample',
    itemDropChance: 20n,
  });
  upsertQuestByName({
    name: 'Foundry Sabotage',
    npcName: 'Marshal Greyholt',
    requiredCount: 1n,
    minLevel: 7n,
    maxLevel: 9n,
    rewardXp: 220n,
    questType: 'explore',
    targetLocationName: 'Forgecinder Foundry',
    targetItemName: 'Foundry Control Key',
  });
  upsertQuestByName({
    name: "The Deserter's Intel",
    npcName: 'Field Medic Saera',
    requiredCount: 1n,
    minLevel: 6n,
    maxLevel: 10n,
    rewardXp: 150n,
    questType: 'delivery',
    targetNpcName: 'Deserter Callum',
  });

  // === Dreadspire Ruins quests (group content, higher rewards) ===
  upsertQuestByName({
    name: 'Wraith Purge',
    npcName: 'Pathfinder Zara',
    enemyName: 'Dreadspire Wraith',
    requiredCount: 5n,
    minLevel: 8n,
    maxLevel: 12n,
    rewardXp: 280n,
  });
  upsertQuestByName({
    name: 'Golem Dismantling',
    npcName: 'Pathfinder Zara',
    enemyName: 'Runebound Golem',
    requiredCount: 3n,
    minLevel: 9n,
    maxLevel: 12n,
    rewardXp: 320n,
  });
  upsertQuestByName({
    name: 'Necromancer Hunt',
    npcName: 'Arcanist Morvaine',
    enemyName: 'Shadow Necromancer',
    requiredCount: 3n,
    minLevel: 9n,
    maxLevel: 12n,
    rewardXp: 340n,
  });
  upsertQuestByName({
    name: 'Fiend Banishment',
    npcName: 'Arcanist Morvaine',
    enemyName: 'Abyssal Fiend',
    requiredCount: 2n,
    minLevel: 10n,
    maxLevel: 12n,
    rewardXp: 380n,
  });
  upsertQuestByName({
    name: 'The Dread Knight',
    npcName: 'Arcanist Morvaine',
    enemyName: 'Dread Knight',
    requiredCount: 1n,
    minLevel: 10n,
    maxLevel: 12n,
    rewardXp: 500n,
    questType: 'boss_kill',
    targetLocationName: 'Throne of Whispers',
    targetItemName: 'Dread Knight',
  });
  upsertQuestByName({
    name: 'Abyssal Vault Key',
    npcName: 'Pathfinder Zara',
    requiredCount: 1n,
    minLevel: 10n,
    maxLevel: 12n,
    rewardXp: 400n,
    questType: 'explore',
    targetLocationName: 'The Abyssal Vault',
    targetItemName: 'Abyssal Vault Key',
  });
  upsertQuestByName({
    name: 'Dark Tomes',
    npcName: 'Arcanist Morvaine',
    enemyName: 'Shadow Necromancer',
    requiredCount: 1n,
    minLevel: 9n,
    maxLevel: 12n,
    rewardXp: 360n,
    questType: 'kill_loot',
    targetItemName: 'Dark Tome',
    itemDropChance: 15n,
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
    const existing = [...ctx.db.enemy_ability.by_template.filter(template.id)].find(
      (row) => row.abilityKey === abilityKey
    );
    if (existing) {
      ctx.db.enemy_ability.id.update({
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
    ctx.db.enemy_ability.insert({
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
  for (const template of ctx.db.enemy_template.iter()) {
    const allowedKeys = new Set(
      ENEMY_TEMPLATE_ABILITIES[template.name as keyof typeof ENEMY_TEMPLATE_ABILITIES] ?? []
    );
    for (const row of ctx.db.enemy_ability.by_template.filter(template.id)) {
      if (!allowedKeys.has(row.abilityKey)) {
        ctx.db.enemy_ability.id.delete(row.id);
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

  // === Region 4: Greyveil Moors ===
  const greyveilMoors = upsertRegionByName({
    name: 'Greyveil Moors',
    dangerMultiplier: 300n,
    regionType: 'outdoor',
  });

  const greyveilCrossroads = upsertLocationByName({
    name: 'Greyveil Crossroads',
    description: 'A windswept crossroads where moss-covered signposts point in every direction. A small inn offers warmth.',
    zone: 'Greyveil',
    regionId: greyveilMoors.id,
    levelOffset: 0n,
    isSafe: true,
    terrainType: 'town',
    bindStone: true,
    craftingAvailable: true,
  });
  const misthollowBog = upsertLocationByName({
    name: 'Misthollow Bog',
    description: 'Thick fog clings to pools of dark water where unseen things splash and gurgle.',
    zone: 'Greyveil',
    regionId: greyveilMoors.id,
    levelOffset: 0n,
    isSafe: false,
    terrainType: 'swamp',
    bindStone: false,
    craftingAvailable: false,
  });
  const standingStoneCircle = upsertLocationByName({
    name: 'Standing Stone Circle',
    description: 'Twelve weathered megaliths form a circle on a treeless hilltop. Faint runes glow at dusk.',
    zone: 'Greyveil',
    regionId: greyveilMoors.id,
    levelOffset: 0n,
    isSafe: false,
    terrainType: 'plains',
    bindStone: false,
    craftingAvailable: false,
  });
  const barrowfield = upsertLocationByName({
    name: 'Barrowfield',
    description: 'Low earthen mounds stretch across a grey field. Some have been broken open.',
    zone: 'Greyveil',
    regionId: greyveilMoors.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'plains',
    bindStone: false,
    craftingAvailable: false,
  });
  const thornmireEdge = upsertLocationByName({
    name: 'Thornmire Edge',
    description: 'Where the moor meets tangled briars, the ground squelches with every step.',
    zone: 'Greyveil',
    regionId: greyveilMoors.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'swamp',
    bindStone: false,
    craftingAvailable: false,
  });
  const cairnHeights = upsertLocationByName({
    name: 'Cairn Heights',
    description: 'Rocky outcrops and cairn markers overlook the misty lowlands.',
    zone: 'Greyveil',
    regionId: greyveilMoors.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'mountains',
    bindStone: false,
    craftingAvailable: false,
  });
  const wraithHollow = upsertLocationByName({
    name: 'Wraith Hollow',
    description: 'Gnarled trees with bone-white bark grow in a silent depression. No birds sing here.',
    zone: 'Greyveil',
    regionId: greyveilMoors.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'woods',
    bindStone: false,
    craftingAvailable: false,
  });
  const peatQuarry = upsertLocationByName({
    name: 'Peat Quarry',
    description: 'An abandoned peat-cutting operation. Tools still rust where they were dropped.',
    zone: 'Greyveil',
    regionId: greyveilMoors.id,
    levelOffset: 0n,
    isSafe: false,
    terrainType: 'plains',
    bindStone: false,
    craftingAvailable: false,
  });
  const greywindPass = upsertLocationByName({
    name: 'Greywind Pass',
    description: 'A narrow mountain pass where wind screams through rocky teeth.',
    zone: 'Greyveil',
    regionId: greyveilMoors.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'mountains',
    bindStone: false,
    craftingAvailable: false,
  });
  const hauntwellSprings = upsertLocationByName({
    name: 'Hauntwell Springs',
    description: 'Natural springs bubble up from deep underground, their water tinged grey with mineral deposits.',
    zone: 'Greyveil',
    regionId: greyveilMoors.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'swamp',
    bindStone: false,
    craftingAvailable: false,
  });

  // === Region 5: Silverpine Forest ===
  const silverpineForest = upsertRegionByName({
    name: 'Silverpine Forest',
    dangerMultiplier: 400n,
    regionType: 'outdoor',
  });

  const silverrootCamp = upsertLocationByName({
    name: 'Silverroot Camp',
    description: 'A Verdant Circle outpost built around the roots of an enormous silver pine. Rope bridges connect platforms.',
    zone: 'Silverpine',
    regionId: silverpineForest.id,
    levelOffset: 0n,
    isSafe: true,
    terrainType: 'town',
    bindStone: true,
    craftingAvailable: true,
  });
  const dappledGlade = upsertLocationByName({
    name: 'Dappled Glade',
    description: 'Shafts of pale light pierce the canopy, illuminating a clearing of soft moss and wildflowers.',
    zone: 'Silverpine',
    regionId: silverpineForest.id,
    levelOffset: 0n,
    isSafe: false,
    terrainType: 'woods',
    bindStone: false,
    craftingAvailable: false,
  });
  const webwoodThicket = upsertLocationByName({
    name: 'Webwood Thicket',
    description: 'Dense webs stretch between trunks. The silk is strong as rope and sticky as pitch.',
    zone: 'Silverpine',
    regionId: silverpineForest.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'woods',
    bindStone: false,
    craftingAvailable: false,
  });
  const moonwellClearing = upsertLocationByName({
    name: 'Moonwell Clearing',
    description: 'A natural clearing where a crystalline pool reflects the sky. The water hums faintly.',
    zone: 'Silverpine',
    regionId: silverpineForest.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'plains',
    bindStone: false,
    craftingAvailable: false,
  });
  const rootknotCaves = upsertLocationByName({
    name: 'Rootknot Caves',
    description: 'Tree roots have broken through cave ceilings, creating a labyrinth of stone and wood.',
    zone: 'Silverpine',
    regionId: silverpineForest.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const darkpineHollow = upsertLocationByName({
    name: 'Darkpine Hollow',
    description: 'The oldest trees grow here, their bark nearly black. Strange fungi glow between their roots.',
    zone: 'Silverpine',
    regionId: silverpineForest.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'woods',
    bindStone: false,
    craftingAvailable: false,
  });
  const owlwatchRidge = upsertLocationByName({
    name: 'Owlwatch Ridge',
    description: 'A forested ridge where ancient owls roost in hollow trunks. Their eyes track all movement.',
    zone: 'Silverpine',
    regionId: silverpineForest.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'mountains',
    bindStone: false,
    craftingAvailable: false,
  });
  const frostfernDell = upsertLocationByName({
    name: 'Frostfern Dell',
    description: 'Delicate frost-covered ferns grow year-round in this shaded valley. The air is always cold.',
    zone: 'Silverpine',
    regionId: silverpineForest.id,
    levelOffset: 0n,
    isSafe: false,
    terrainType: 'woods',
    bindStone: false,
    craftingAvailable: false,
  });
  const mossgraveRuins = upsertLocationByName({
    name: 'Mossgrave Ruins',
    description: 'Crumbling walls and broken arches of a civilization older than memory, reclaimed by moss and vine.',
    zone: 'Silverpine',
    regionId: silverpineForest.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'plains',
    bindStone: false,
    craftingAvailable: false,
  });
  const briarthornGate = upsertLocationByName({
    name: 'Briarthorn Gate',
    description: 'Massive thorny growths form a natural archway. Beyond lies the road to harder lands.',
    zone: 'Silverpine',
    regionId: silverpineForest.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'woods',
    bindStone: false,
    craftingAvailable: false,
  });

  // === Region 6: Ironhold Garrison ===
  const ironholdGarrison = upsertRegionByName({
    name: 'Ironhold Garrison',
    dangerMultiplier: 600n,
    regionType: 'outdoor',
  });

  const ironholdKeep = upsertLocationByName({
    name: 'Ironhold Keep',
    description: 'A massive stone keep with iron-banded gates. The Iron Compact banner flies from every tower.',
    zone: 'Ironhold',
    regionId: ironholdGarrison.id,
    levelOffset: 0n,
    isSafe: true,
    terrainType: 'town',
    bindStone: true,
    craftingAvailable: true,
  });
  const sentinelWalk = upsertLocationByName({
    name: 'Sentinel Walk',
    description: 'A raised stone walkway connecting watchtowers. Patrols march here constantly.',
    zone: 'Ironhold',
    regionId: ironholdGarrison.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'plains',
    bindStone: false,
    craftingAvailable: false,
  });
  const rustedArmory = upsertLocationByName({
    name: 'Rusted Armory',
    description: 'An underground armory where weapons and armor from forgotten wars line the walls.',
    zone: 'Ironhold',
    regionId: ironholdGarrison.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const windshearBluffs = upsertLocationByName({
    name: 'Windshear Bluffs',
    description: 'Howling winds tear across exposed cliff faces. Only the sure-footed survive.',
    zone: 'Ironhold',
    regionId: ironholdGarrison.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'mountains',
    bindStone: false,
    craftingAvailable: false,
  });
  const siegeFields = upsertLocationByName({
    name: 'Siege Fields',
    description: 'Scarred battlegrounds where siege engines rot. Bones still surface after rain.',
    zone: 'Ironhold',
    regionId: ironholdGarrison.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'plains',
    bindStone: false,
    craftingAvailable: false,
  });
  const quarantineWard = upsertLocationByName({
    name: 'Quarantine Ward',
    description: 'A walled-off section of the garrison where the sick and cursed are kept.',
    zone: 'Ironhold',
    regionId: ironholdGarrison.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'town',
    bindStone: false,
    craftingAvailable: false,
  });
  const ashfallowTrenches = upsertLocationByName({
    name: 'Ashfallow Trenches',
    description: 'Deep trenches dug into volcanic soil. The air tastes of sulphur and iron.',
    zone: 'Ironhold',
    regionId: ironholdGarrison.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'plains',
    bindStone: false,
    craftingAvailable: false,
  });
  const forgecinder = upsertLocationByName({
    name: 'Forgecinder Foundry',
    description: 'A massive underground foundry still burning with ancient fires. Constructs patrol the halls.',
    zone: 'Ironhold',
    regionId: ironholdGarrison.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const rampartRoad = upsertLocationByName({
    name: 'Rampart Road',
    description: 'A fortified mountain road lined with arrow slits and murder holes.',
    zone: 'Ironhold',
    regionId: ironholdGarrison.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'mountains',
    bindStone: false,
    craftingAvailable: false,
  });
  const dreadgate = upsertLocationByName({
    name: 'Dreadgate',
    description: 'The final fortification before the Dreadspire. Its gates have been breached from within.',
    zone: 'Ironhold',
    regionId: ironholdGarrison.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'mountains',
    bindStone: false,
    craftingAvailable: false,
  });

  // === Region 7: Dreadspire Ruins ===
  const dreadspireRuins = upsertRegionByName({
    name: 'Dreadspire Ruins',
    dangerMultiplier: 800n,
    regionType: 'dungeon',
  });

  const shatteredVestibule = upsertLocationByName({
    name: 'Shattered Vestibule',
    description: 'Broken columns and cracked floor tiles mark the entrance to the ruined spire. A cold wind blows upward from below.',
    zone: 'Dreadspire',
    regionId: dreadspireRuins.id,
    levelOffset: 0n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const wailingGallery = upsertLocationByName({
    name: 'Wailing Gallery',
    description: 'A long corridor where the wind produces an eerie wailing. Tattered tapestries line the walls.',
    zone: 'Dreadspire',
    regionId: dreadspireRuins.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const spireBarracks = upsertLocationByName({
    name: 'Spire Barracks',
    description: 'An old military barracks repurposed as a forward camp. A forge still glows.',
    zone: 'Dreadspire',
    regionId: dreadspireRuins.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: true,
    craftingAvailable: true,
  });
  const runecarverChamber = upsertLocationByName({
    name: 'Runecarver Chamber',
    description: 'Arcane circles cover every surface. The air crackles with residual magic.',
    zone: 'Dreadspire',
    regionId: dreadspireRuins.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const collapsingAtrium = upsertLocationByName({
    name: 'Collapsing Atrium',
    description: 'The central hall of the spire, its ceiling half-caved. Rubble creates natural chokepoints.',
    zone: 'Dreadspire',
    regionId: dreadspireRuins.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const shadowveinDepths = upsertLocationByName({
    name: 'Shadowvein Depths',
    description: 'Deep tunnels where veins of dark crystal pulse with faint light. The darkness feels alive.',
    zone: 'Dreadspire',
    regionId: dreadspireRuins.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const boneReliquary = upsertLocationByName({
    name: 'Bone Reliquary',
    description: 'Shelves of preserved bones and jars of viscera. A necromancer\'s laboratory.',
    zone: 'Dreadspire',
    regionId: dreadspireRuins.id,
    levelOffset: 3n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const dreadlordAscent = upsertLocationByName({
    name: 'Dreadlord Ascent',
    description: 'A spiraling staircase ascending through the intact upper levels. Guards watch from alcoves.',
    zone: 'Dreadspire',
    regionId: dreadspireRuins.id,
    levelOffset: 3n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const throneOfWhispers = upsertLocationByName({
    name: 'Throne of Whispers',
    description: 'The seat of power of the fallen Dreadlord. Shadows coalesce and disperse around the throne.',
    zone: 'Dreadspire',
    regionId: dreadspireRuins.id,
    levelOffset: 4n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const abyssalVault = upsertLocationByName({
    name: 'The Abyssal Vault',
    description: 'The deepest chamber, sealed behind wards. Something immensely powerful stirs within.',
    zone: 'Dreadspire',
    regionId: dreadspireRuins.id,
    levelOffset: 4n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });

  const world = getWorldState(ctx);
  if (world) {
    ctx.db.world_state.id.update({
      ...world,
      startingLocationId: town.id,
    });
  } else {
    ctx.db.world_state.insert({
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

  // === Greyveil Moors connections ===
  connectIfMissing(greyveilCrossroads.id, misthollowBog.id);
  connectIfMissing(greyveilCrossroads.id, standingStoneCircle.id);
  connectIfMissing(greyveilCrossroads.id, peatQuarry.id);
  connectIfMissing(greyveilCrossroads.id, barrowfield.id);
  connectIfMissing(misthollowBog.id, thornmireEdge.id);
  connectIfMissing(misthollowBog.id, hauntwellSprings.id);
  connectIfMissing(standingStoneCircle.id, barrowfield.id);
  connectIfMissing(standingStoneCircle.id, cairnHeights.id);
  connectIfMissing(barrowfield.id, wraithHollow.id);
  connectIfMissing(barrowfield.id, thornmireEdge.id);
  connectIfMissing(cairnHeights.id, greywindPass.id);
  connectIfMissing(wraithHollow.id, hauntwellSprings.id);
  connectIfMissing(thornmireEdge.id, hauntwellSprings.id);
  connectIfMissing(greywindPass.id, wraithHollow.id);

  // Cross-region connections: Hollowmere Vale <-> Greyveil Moors
  connectIfMissing(lichenRidge.id, greyveilCrossroads.id);
  connectIfMissing(cairnMeadow.id, standingStoneCircle.id);

  // Cross-region connection: Greyveil Moors <-> Silverpine Forest
  connectIfMissing(greyveilCrossroads.id, silverrootCamp.id);

  // === Silverpine Forest connections ===
  connectIfMissing(silverrootCamp.id, dappledGlade.id);
  connectIfMissing(silverrootCamp.id, frostfernDell.id);
  connectIfMissing(silverrootCamp.id, owlwatchRidge.id);
  connectIfMissing(dappledGlade.id, webwoodThicket.id);
  connectIfMissing(dappledGlade.id, moonwellClearing.id);
  connectIfMissing(webwoodThicket.id, darkpineHollow.id);
  connectIfMissing(webwoodThicket.id, rootknotCaves.id);
  connectIfMissing(moonwellClearing.id, mossgraveRuins.id);
  connectIfMissing(moonwellClearing.id, owlwatchRidge.id);
  connectIfMissing(darkpineHollow.id, briarthornGate.id);
  connectIfMissing(darkpineHollow.id, mossgraveRuins.id);
  connectIfMissing(owlwatchRidge.id, frostfernDell.id);
  connectIfMissing(frostfernDell.id, rootknotCaves.id);
  connectIfMissing(briarthornGate.id, mossgraveRuins.id);

  // Cross-region connection: Hollowmere Vale <-> Silverpine Forest
  connectIfMissing(thornveil.id, dappledGlade.id);

  // Cross-region connection: Silverpine Forest <-> Ironhold Garrison
  connectIfMissing(briarthornGate.id, ironholdKeep.id);

  // === Ironhold Garrison connections ===
  connectIfMissing(ironholdKeep.id, sentinelWalk.id);
  connectIfMissing(ironholdKeep.id, siegeFields.id);
  connectIfMissing(ironholdKeep.id, rampartRoad.id);
  connectIfMissing(sentinelWalk.id, windshearBluffs.id);
  connectIfMissing(sentinelWalk.id, quarantineWard.id);
  connectIfMissing(siegeFields.id, ashfallowTrenches.id);
  connectIfMissing(siegeFields.id, rustedArmory.id);
  connectIfMissing(windshearBluffs.id, rampartRoad.id);
  connectIfMissing(ashfallowTrenches.id, forgecinder.id);
  connectIfMissing(quarantineWard.id, rustedArmory.id);
  connectIfMissing(rampartRoad.id, dreadgate.id);
  connectIfMissing(forgecinder.id, dreadgate.id);
  connectIfMissing(rustedArmory.id, forgecinder.id);

  // Cross-region connection: Embermarch Fringe <-> Ironhold Garrison
  connectIfMissing(pyre.id, rampartRoad.id);

  // Cross-region connection: Ironhold Garrison <-> Dreadspire Ruins
  connectIfMissing(dreadgate.id, shatteredVestibule.id);

  // === Dreadspire Ruins connections ===
  connectIfMissing(shatteredVestibule.id, wailingGallery.id);
  connectIfMissing(shatteredVestibule.id, spireBarracks.id);
  connectIfMissing(wailingGallery.id, runecarverChamber.id);
  connectIfMissing(wailingGallery.id, collapsingAtrium.id);
  connectIfMissing(spireBarracks.id, collapsingAtrium.id);
  connectIfMissing(runecarverChamber.id, boneReliquary.id);
  connectIfMissing(collapsingAtrium.id, shadowveinDepths.id);
  connectIfMissing(collapsingAtrium.id, dreadlordAscent.id);
  connectIfMissing(shadowveinDepths.id, boneReliquary.id);
  connectIfMissing(shadowveinDepths.id, throneOfWhispers.id);
  connectIfMissing(boneReliquary.id, dreadlordAscent.id);
  connectIfMissing(dreadlordAscent.id, throneOfWhispers.id);
  connectIfMissing(throneOfWhispers.id, abyssalVault.id);

  // Cross-region connection: Embermarch Depths <-> Dreadspire Ruins (underground passage)
  connectIfMissing(ashwarden.id, shadowveinDepths.id);
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
      for (const opt of ctx.db.npc_dialogue_option.by_npc.filter(npcId)) {
        if (opt.optionKey === option.parentOptionKey) {
          parentOptionId = opt.id;
          break;
        }
      }
      if (!parentOptionId) continue; // Parent not found, skip this option
    }

    // Check if option already exists
    let existing: any = null;
    for (const opt of ctx.db.npc_dialogue_option.by_npc.filter(npcId)) {
      if (opt.optionKey === option.optionKey) {
        existing = opt;
        break;
      }
    }

    if (existing) {
      // Update existing option
      ctx.db.npc_dialogue_option.id.update({
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
      ctx.db.npc_dialogue_option.insert({
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

