export const RENOWN_RANKS = [
  // Tier 1: Fast early progression (ranks 1-3)
  { rank: 1, name: 'Unsung', threshold: 0n },
  { rank: 2, name: 'Whispered', threshold: 100n },
  { rank: 3, name: 'Recognized', threshold: 250n },
  // Tier 2: Moderate scaling (ranks 4-6)
  { rank: 4, name: 'Proven', threshold: 500n },
  { rank: 5, name: 'Stalwart', threshold: 900n },
  { rank: 6, name: 'Vanguard', threshold: 1500n },
  // Tier 3: Steeper climb (ranks 7-9)
  { rank: 7, name: 'Champion', threshold: 2500n },
  { rank: 8, name: 'Paragon', threshold: 4000n },
  { rank: 9, name: 'Exemplar', threshold: 6500n },
  // Tier 4: Prestige territory (ranks 10-12)
  { rank: 10, name: 'Hero', threshold: 10000n },
  { rank: 11, name: 'Exalted', threshold: 15000n },
  { rank: 12, name: 'Ascendant', threshold: 22000n },
  // Tier 5: Endgame legends (ranks 13-15)
  { rank: 13, name: 'Legend', threshold: 32000n },
  { rank: 14, name: 'Mythic', threshold: 47000n },
  { rank: 15, name: 'Eternal', threshold: 70000n },
] as const;

export function calculateRankFromPoints(points: bigint): number {
  let currentRank = 1;
  for (const rankData of RENOWN_RANKS) {
    if (points >= rankData.threshold) {
      currentRank = rankData.rank;
    } else {
      break;
    }
  }
  return currentRank;
}

type PerkEffect = {
  // Stat bonuses (existing)
  maxHp?: bigint;
  str?: bigint;
  dex?: bigint;
  int?: bigint;
  wis?: bigint;
  cha?: bigint;
  armorClass?: bigint;
  critMelee?: bigint;
  critRanged?: bigint;
  cooldownSeconds?: number;
  description?: string;

  // Proc effects
  procType?: 'on_crit' | 'on_hit' | 'on_kill' | 'on_damage_taken';
  procChance?: number;           // percentage 0-100
  procDamageMultiplier?: bigint; // percentage, e.g. 200n = 200% weapon damage
  procHealPercent?: number;      // heal for X% of damage dealt
  procBonusDamage?: bigint;      // flat bonus damage on proc

  // Crafting/gathering
  gatherDoubleChance?: number;   // percentage chance for 2x yield
  gatherSpeedBonus?: number;     // percentage faster gathering
  craftQualityBonus?: number;    // percentage better item stats
  rareGatherChance?: number;     // percentage chance for rare materials

  // Social/utility
  npcAffinityGainBonus?: number; // percentage bonus to affinity gains
  vendorBuyDiscount?: number;    // percentage discount on purchases
  vendorSellBonus?: number;      // percentage better sell prices
  travelCooldownReduction?: number; // percentage reduction
  goldFindBonus?: number;        // percentage bonus gold from all sources
  xpBonus?: number;              // percentage bonus XP from all sources

  // Scaling
  scalesWithLevel?: boolean;     // effect grows with character level
  perLevelBonus?: number;        // multiplier per character level, e.g. 0.5 = +0.5 per level
};

type Perk = {
  key: string;
  name: string;
  type: 'passive' | 'active';
  description: string;
  effect: PerkEffect;
  domain: 'combat' | 'crafting' | 'social';
};

export const RENOWN_PERK_POOLS: Record<number, Perk[]> = {
  // Rank 2 - Tier 1: Simple single-effect perks
  2: [
    {
      key: 'iron_will',
      name: 'Iron Will',
      type: 'passive',
      description: '+25 max HP, +1 Strength',
      effect: { maxHp: 25n, str: 1n },
      domain: 'combat',
    },
    {
      key: 'keen_eye',
      name: 'Keen Eye',
      type: 'passive',
      description: '10% chance to gather double resources',
      effect: { gatherDoubleChance: 10 },
      domain: 'crafting',
    },
    {
      key: 'smooth_talker',
      name: 'Smooth Talker',
      type: 'passive',
      description: '+15% NPC affinity gain from conversations',
      effect: { npcAffinityGainBonus: 15 },
      domain: 'social',
    },
  ],
  // Rank 3 - Tier 1: Simple single-effect perks
  3: [
    {
      key: 'quick_reflexes',
      name: 'Quick Reflexes',
      type: 'passive',
      description: '+1 Dexterity, +2% melee crit chance',
      effect: { dex: 1n, critMelee: 200n },
      domain: 'combat',
    },
    {
      key: 'efficient_hands',
      name: 'Efficient Hands',
      type: 'passive',
      description: '15% faster gathering speed',
      effect: { gatherSpeedBonus: 15 },
      domain: 'crafting',
    },
    {
      key: 'shrewd_bargainer',
      name: 'Shrewd Bargainer',
      type: 'passive',
      description: '5% discount on vendor purchases, 5% better sell prices',
      effect: { vendorBuyDiscount: 5, vendorSellBonus: 5 },
      domain: 'social',
    },
  ],
  // Rank 4 - Tier 2: Moderate effects, introduce first procs
  4: [
    {
      key: 'bloodthirst',
      name: 'Bloodthirst',
      type: 'passive',
      description: '3% chance on kill to restore 20% HP',
      effect: { procType: 'on_kill', procChance: 3, procHealPercent: 20 },
      domain: 'combat',
    },
    {
      key: 'prospectors_luck',
      name: "Prospector's Luck",
      type: 'passive',
      description: '15% chance for rare material drops when gathering',
      effect: { rareGatherChance: 15 },
      domain: 'crafting',
    },
    {
      key: 'wanderers_pace',
      name: "Wanderer's Pace",
      type: 'passive',
      description: '20% travel cooldown reduction',
      effect: { travelCooldownReduction: 20 },
      domain: 'social',
    },
  ],
  // Rank 5 - Tier 2: Moderate effects
  5: [
    {
      key: 'savage_strikes',
      name: 'Savage Strikes',
      type: 'passive',
      description: '5% chance on crit to deal 150% bonus damage as a burst',
      effect: { procType: 'on_crit', procChance: 5, procDamageMultiplier: 150n },
      domain: 'combat',
    },
    {
      key: 'master_harvester',
      name: 'Master Harvester',
      type: 'passive',
      description: '20% double gather chance, 10% faster gathering',
      effect: { gatherDoubleChance: 20, gatherSpeedBonus: 10 },
      domain: 'crafting',
    },
    {
      key: 'silver_tongue',
      name: 'Silver Tongue',
      type: 'passive',
      description: '+25% NPC affinity gain, +5% vendor discounts',
      effect: { npcAffinityGainBonus: 25, vendorBuyDiscount: 5 },
      domain: 'social',
    },
  ],
  // Rank 6 - Tier 2: First actives appear
  6: [
    {
      key: 'second_wind',
      name: 'Second Wind',
      type: 'active',
      description: 'Restore 20% of your maximum health (5 min cooldown)',
      effect: { cooldownSeconds: 300, description: 'Restores 20% HP' },
      domain: 'combat',
    },
    {
      key: 'artisans_touch',
      name: "Artisan's Touch",
      type: 'passive',
      description: '+15% craft quality bonus on all crafted items',
      effect: { craftQualityBonus: 15 },
      domain: 'crafting',
    },
    {
      key: 'fortunes_favor',
      name: "Fortune's Favor",
      type: 'passive',
      description: '+10% gold from all sources, +5% XP bonus',
      effect: { goldFindBonus: 10, xpBonus: 5 },
      domain: 'social',
    },
  ],
  // Rank 7 - Tier 3: Multi-part effects
  7: [
    {
      key: 'vampiric_strikes',
      name: 'Vampiric Strikes',
      type: 'passive',
      description: '5% on-hit chance to heal for 30% of damage dealt',
      effect: { procType: 'on_hit', procChance: 5, procHealPercent: 30 },
      domain: 'combat',
    },
    {
      key: 'bountiful_harvest',
      name: 'Bountiful Harvest',
      type: 'passive',
      description: '25% double gather chance, 5% rare material chance',
      effect: { gatherDoubleChance: 25, rareGatherChance: 5 },
      domain: 'crafting',
    },
    {
      key: 'diplomats_grace',
      name: "Diplomat's Grace",
      type: 'passive',
      description: '+30% NPC affinity gain, 25% travel cooldown reduction',
      effect: { npcAffinityGainBonus: 30, travelCooldownReduction: 25 },
      domain: 'social',
    },
  ],
  // Rank 8 - Tier 3: Complex effects
  8: [
    {
      key: 'thunderous_blow',
      name: 'Thunderous Blow',
      type: 'active',
      description: 'Deal 300% weapon damage to target (5 min cooldown)',
      effect: { cooldownSeconds: 300, procDamageMultiplier: 300n, description: '300% weapon damage' },
      domain: 'combat',
    },
    {
      key: 'resourceful',
      name: 'Resourceful',
      type: 'passive',
      description: '20% double gather, 20% faster gathering, +10% craft quality',
      effect: { gatherDoubleChance: 20, gatherSpeedBonus: 20, craftQualityBonus: 10 },
      domain: 'crafting',
    },
    {
      key: 'merchant_prince',
      name: 'Merchant Prince',
      type: 'passive',
      description: '10% vendor discount, 10% better sell prices, +10% gold find',
      effect: { vendorBuyDiscount: 10, vendorSellBonus: 10, goldFindBonus: 10 },
      domain: 'social',
    },
  ],
  // Rank 9 - Tier 3: Scaling perks
  9: [
    {
      key: 'deathbringer',
      name: 'Deathbringer',
      type: 'passive',
      description: '8% on-kill chance to deal 200% weapon damage to all nearby enemies',
      effect: { procType: 'on_kill', procChance: 8, procDamageMultiplier: 200n },
      domain: 'combat',
    },
    {
      key: 'masterwork',
      name: 'Masterwork',
      type: 'passive',
      description: '+25% craft quality, scales with character level (+0.5% per level)',
      effect: { craftQualityBonus: 25, scalesWithLevel: true, perLevelBonus: 0.5 },
      domain: 'crafting',
    },
    {
      key: 'voice_of_authority',
      name: 'Voice of Authority',
      type: 'passive',
      description: '+40% NPC affinity, +8% vendor discounts, +8% XP bonus',
      effect: { npcAffinityGainBonus: 40, vendorBuyDiscount: 8, xpBonus: 8 },
      domain: 'social',
    },
  ],
  // Rank 10 - Tier 4: Powerful effects
  10: [
    {
      key: 'wrath_of_the_fallen',
      name: 'Wrath of the Fallen',
      type: 'active',
      description: '+25% all damage for 20 seconds (10 min cooldown)',
      effect: { cooldownSeconds: 600, description: '+25% all damage for 20s' },
      domain: 'combat',
    },
    {
      key: 'golden_touch',
      name: 'Golden Touch',
      type: 'passive',
      description: '30% double gather, 15% rare materials, +15% craft quality',
      effect: { gatherDoubleChance: 30, rareGatherChance: 15, craftQualityBonus: 15 },
      domain: 'crafting',
    },
    {
      key: 'legends_presence',
      name: "Legend's Presence",
      type: 'passive',
      description: '+50% NPC affinity, 30% travel cooldown reduction, +15% gold find',
      effect: { npcAffinityGainBonus: 50, travelCooldownReduction: 30, goldFindBonus: 15 },
      domain: 'social',
    },
  ],
  // Rank 11 - Tier 4: Powerful effects, complex interactions
  11: [
    {
      key: 'undying_fury',
      name: 'Undying Fury',
      type: 'passive',
      description: '3% on-damage-taken chance to gain +50% damage for 10 seconds',
      effect: { procType: 'on_damage_taken', procChance: 3, description: '+50% damage for 10s on proc' },
      domain: 'combat',
    },
    {
      key: 'grand_artisan',
      name: 'Grand Artisan',
      type: 'passive',
      description: '35% double gather, 20% rare materials, +25% craft quality, scales +0.5%/level',
      effect: { gatherDoubleChance: 35, rareGatherChance: 20, craftQualityBonus: 25, scalesWithLevel: true, perLevelBonus: 0.5 },
      domain: 'crafting',
    },
    {
      key: 'world_shaper',
      name: 'World Shaper',
      type: 'passive',
      description: '+15% XP, +15% gold find, +10% vendor both ways, 35% travel CD reduction',
      effect: { xpBonus: 15, goldFindBonus: 15, vendorBuyDiscount: 10, vendorSellBonus: 10, travelCooldownReduction: 35 },
      domain: 'social',
    },
  ],
  // Rank 12 - Tier 4: Capstone (unchanged)
  12: [
    {
      key: 'int_boost_4',
      name: 'Arcane Mastery',
      type: 'passive',
      description: '+4 Intelligence',
      effect: { int: 4n },
      domain: 'combat',
    },
    {
      key: 'wis_boost_4',
      name: 'Divine Wisdom',
      type: 'passive',
      description: '+4 Wisdom',
      effect: { wis: 4n },
      domain: 'combat',
    },
    {
      key: 'life_steal',
      name: 'Life Steal',
      type: 'active',
      description: 'Heal for 25% of damage dealt for 15 seconds (10 minute cooldown)',
      effect: { cooldownSeconds: 600, description: 'Heal for 25% of damage dealt for 15s' },
      domain: 'combat',
    },
  ],
  // Rank 13 - Tier 5: Legendary bonuses (unchanged)
  13: [
    {
      key: 'hp_boost_5',
      name: 'Legendary Constitution',
      type: 'passive',
      description: '+150 max health',
      effect: { maxHp: 150n },
      domain: 'combat',
    },
    {
      key: 'str_boost_5',
      name: 'Godlike Strength',
      type: 'passive',
      description: '+5 Strength',
      effect: { str: 5n },
      domain: 'combat',
    },
    {
      key: 'phoenix_rebirth',
      name: 'Phoenix Rebirth',
      type: 'active',
      description: 'Automatically revive with 50% health when killed (30 minute cooldown)',
      effect: { cooldownSeconds: 1800, description: 'Auto-revive at 50% HP on death' },
      domain: 'combat',
    },
  ],
  // Rank 14 - Tier 5: Legendary bonuses + signature actives (unchanged)
  14: [
    {
      key: 'dex_boost_5',
      name: 'Legendary Agility',
      type: 'passive',
      description: '+5 Dexterity',
      effect: { dex: 5n },
      domain: 'combat',
    },
    {
      key: 'armor_boost_3',
      name: 'Legendary Armor',
      type: 'passive',
      description: '+3 Armor Class',
      effect: { armorClass: 3n },
      domain: 'combat',
    },
    {
      key: 'timestop',
      name: 'Timestop',
      type: 'active',
      description: 'Freeze all enemies for 5 seconds (30 minute cooldown)',
      effect: { cooldownSeconds: 1800, description: 'Freeze all enemies for 5s' },
      domain: 'combat',
    },
  ],
  // Rank 15 - Tier 5: Ultimate legendary bonuses (unchanged)
  15: [
    {
      key: 'all_stats_boost',
      name: 'Eternal Excellence',
      type: 'passive',
      description: '+3 to all stats',
      effect: { str: 3n, dex: 3n, int: 3n, wis: 3n, cha: 3n },
      domain: 'combat',
    },
    {
      key: 'crit_boost_2',
      name: 'Perfect Strike',
      type: 'passive',
      description: '+10% critical strike chance',
      effect: { critMelee: 1000n, critRanged: 1000n },
      domain: 'combat',
    },
    {
      key: 'defy_death',
      name: 'Defy Death',
      type: 'active',
      description: 'Prevent the next lethal blow and heal to 25% health (30 minute cooldown)',
      effect: { cooldownSeconds: 1800, description: 'Prevent lethal blow, heal to 25% HP' },
      domain: 'combat',
    },
  ],
};

export const RENOWN_GAIN = {
  BOSS_KILL_BASE: 500n,           // Base renown for boss kills (modified by server-first)
  QUEST_COMPLETE_BASE: 50n,       // Base renown per quest completion
  ACHIEVEMENT_BASE: 200n,         // Base renown per achievement
  EVENT_PARTICIPATION_BASE: 100n, // Base renown per event participation
  PERSONAL_FIRST_BONUS: 50n,      // Additional bonus for personal-first completion
} as const;

export const ACHIEVEMENT_DEFINITIONS: Record<string, { name: string; description: string; renown: bigint }> = {
  test_achievement: {
    name: 'First Steps',
    description: 'Begin your journey.',
    renown: 200n
  },
  first_boss_kill: {
    name: 'Slayer',
    description: 'Defeat a powerful foe.',
    renown: 500n
  },
  reach_level_5: {
    name: 'Veteran Adventurer',
    description: 'Reach character level 5.',
    renown: 300n
  },
  complete_10_quests: {
    name: 'Quest Master',
    description: 'Complete 10 quests.',
    renown: 400n
  },
};
