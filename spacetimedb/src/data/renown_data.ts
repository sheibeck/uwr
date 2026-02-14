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
};

type Perk = {
  key: string;
  name: string;
  type: 'passive' | 'active';
  description: string;
  effect: PerkEffect;
};

export const RENOWN_PERK_POOLS: Record<number, Perk[]> = {
  // Rank 2 - Tier 1: Simple stat bonuses
  2: [
    {
      key: 'hp_boost_1',
      name: 'Vitality',
      type: 'passive',
      description: '+25 max health',
      effect: { maxHp: 25n },
    },
    {
      key: 'str_boost_1',
      name: 'Might',
      type: 'passive',
      description: '+1 Strength',
      effect: { str: 1n },
    },
    {
      key: 'dex_boost_1',
      name: 'Agility',
      type: 'passive',
      description: '+1 Dexterity',
      effect: { dex: 1n },
    },
  ],
  // Rank 3 - Tier 1: Simple stat bonuses
  3: [
    {
      key: 'int_boost_1',
      name: 'Cunning',
      type: 'passive',
      description: '+1 Intelligence',
      effect: { int: 1n },
    },
    {
      key: 'wis_boost_1',
      name: 'Insight',
      type: 'passive',
      description: '+1 Wisdom',
      effect: { wis: 1n },
    },
    {
      key: 'cha_boost_1',
      name: 'Presence',
      type: 'passive',
      description: '+1 Charisma',
      effect: { cha: 1n },
    },
  ],
  // Rank 4 - Tier 2: Larger stat bonuses
  4: [
    {
      key: 'hp_boost_2',
      name: 'Endurance',
      type: 'passive',
      description: '+50 max health',
      effect: { maxHp: 50n },
    },
    {
      key: 'str_boost_2',
      name: 'Brawn',
      type: 'passive',
      description: '+2 Strength',
      effect: { str: 2n },
    },
    {
      key: 'dex_boost_2',
      name: 'Swiftness',
      type: 'passive',
      description: '+2 Dexterity',
      effect: { dex: 2n },
    },
  ],
  // Rank 5 - Tier 2: Larger stat bonuses + first active ability
  5: [
    {
      key: 'int_boost_2',
      name: 'Brilliance',
      type: 'passive',
      description: '+2 Intelligence',
      effect: { int: 2n },
    },
    {
      key: 'wis_boost_2',
      name: 'Sagacity',
      type: 'passive',
      description: '+2 Wisdom',
      effect: { wis: 2n },
    },
    {
      key: 'second_wind',
      name: 'Second Wind',
      type: 'active',
      description: 'Restore 20% of your maximum health (5 minute cooldown)',
      effect: { cooldownSeconds: 300, description: 'Restores 20% HP' },
    },
  ],
  // Rank 6 - Tier 2: Mixed passive and active
  6: [
    {
      key: 'cha_boost_2',
      name: 'Magnetism',
      type: 'passive',
      description: '+2 Charisma',
      effect: { cha: 2n },
    },
    {
      key: 'armor_boost_1',
      name: 'Fortitude',
      type: 'passive',
      description: '+1 Armor Class',
      effect: { armorClass: 1n },
    },
    {
      key: 'battle_focus',
      name: 'Battle Focus',
      type: 'active',
      description: 'Increase critical strike chance by 10% for 30 seconds (5 minute cooldown)',
      effect: { cooldownSeconds: 300, description: '+10% crit for 30s' },
    },
  ],
  // Rank 7 - Tier 3: Significant bonuses
  7: [
    {
      key: 'hp_boost_3',
      name: 'Resilience',
      type: 'passive',
      description: '+75 max health',
      effect: { maxHp: 75n },
    },
    {
      key: 'str_boost_3',
      name: 'Power',
      type: 'passive',
      description: '+3 Strength',
      effect: { str: 3n },
    },
    {
      key: 'warcry',
      name: 'Warcry',
      type: 'active',
      description: 'Increase all damage dealt by 10% for 15 seconds (5 minute cooldown)',
      effect: { cooldownSeconds: 300, description: '+10% damage for 15s' },
    },
  ],
  // Rank 8 - Tier 3: Significant bonuses + active abilities
  8: [
    {
      key: 'dex_boost_3',
      name: 'Precision',
      type: 'passive',
      description: '+3 Dexterity',
      effect: { dex: 3n },
    },
    {
      key: 'int_boost_3',
      name: 'Genius',
      type: 'passive',
      description: '+3 Intelligence',
      effect: { int: 3n },
    },
    {
      key: 'evasion',
      name: 'Evasion',
      type: 'active',
      description: 'Dodge the next attack against you (5 minute cooldown)',
      effect: { cooldownSeconds: 300, description: 'Dodge next attack' },
    },
  ],
  // Rank 9 - Tier 3: High stat bonuses
  9: [
    {
      key: 'wis_boost_3',
      name: 'Enlightenment',
      type: 'passive',
      description: '+3 Wisdom',
      effect: { wis: 3n },
    },
    {
      key: 'crit_boost_1',
      name: 'Deadly Aim',
      type: 'passive',
      description: '+5% critical strike chance',
      effect: { critMelee: 500n, critRanged: 500n },
    },
    {
      key: 'shield_wall',
      name: 'Shield Wall',
      type: 'active',
      description: 'Reduce damage taken by 50% for 10 seconds (5 minute cooldown)',
      effect: { cooldownSeconds: 300, description: '-50% damage taken for 10s' },
    },
  ],
  // Rank 10 - Tier 4: Major bonuses
  10: [
    {
      key: 'hp_boost_4',
      name: 'Indomitable',
      type: 'passive',
      description: '+100 max health',
      effect: { maxHp: 100n },
    },
    {
      key: 'str_boost_4',
      name: 'Titan Strength',
      type: 'passive',
      description: '+4 Strength',
      effect: { str: 4n },
    },
    {
      key: 'rally',
      name: 'Rally',
      type: 'active',
      description: 'Restore 15% health to all nearby group members (10 minute cooldown)',
      effect: { cooldownSeconds: 600, description: 'Group heal 15% HP' },
    },
  ],
  // Rank 11 - Tier 4: Major bonuses + powerful actives
  11: [
    {
      key: 'dex_boost_4',
      name: 'Lightning Reflexes',
      type: 'passive',
      description: '+4 Dexterity',
      effect: { dex: 4n },
    },
    {
      key: 'armor_boost_2',
      name: 'Iron Skin',
      type: 'passive',
      description: '+2 Armor Class',
      effect: { armorClass: 2n },
    },
    {
      key: 'berserker_rage',
      name: 'Berserker Rage',
      type: 'active',
      description: 'Increase damage by 25% but take 10% more damage for 20 seconds (10 minute cooldown)',
      effect: { cooldownSeconds: 600, description: '+25% damage, +10% damage taken for 20s' },
    },
  ],
  // Rank 12 - Tier 4: Major stat bonuses
  12: [
    {
      key: 'int_boost_4',
      name: 'Arcane Mastery',
      type: 'passive',
      description: '+4 Intelligence',
      effect: { int: 4n },
    },
    {
      key: 'wis_boost_4',
      name: 'Divine Wisdom',
      type: 'passive',
      description: '+4 Wisdom',
      effect: { wis: 4n },
    },
    {
      key: 'life_steal',
      name: 'Life Steal',
      type: 'active',
      description: 'Heal for 25% of damage dealt for 15 seconds (10 minute cooldown)',
      effect: { cooldownSeconds: 600, description: 'Heal for 25% of damage dealt for 15s' },
    },
  ],
  // Rank 13 - Tier 5: Legendary bonuses
  13: [
    {
      key: 'hp_boost_5',
      name: 'Legendary Constitution',
      type: 'passive',
      description: '+150 max health',
      effect: { maxHp: 150n },
    },
    {
      key: 'str_boost_5',
      name: 'Godlike Strength',
      type: 'passive',
      description: '+5 Strength',
      effect: { str: 5n },
    },
    {
      key: 'phoenix_rebirth',
      name: 'Phoenix Rebirth',
      type: 'active',
      description: 'Automatically revive with 50% health when killed (30 minute cooldown)',
      effect: { cooldownSeconds: 1800, description: 'Auto-revive at 50% HP on death' },
    },
  ],
  // Rank 14 - Tier 5: Legendary bonuses + signature actives
  14: [
    {
      key: 'dex_boost_5',
      name: 'Legendary Agility',
      type: 'passive',
      description: '+5 Dexterity',
      effect: { dex: 5n },
    },
    {
      key: 'armor_boost_3',
      name: 'Legendary Armor',
      type: 'passive',
      description: '+3 Armor Class',
      effect: { armorClass: 3n },
    },
    {
      key: 'timestop',
      name: 'Timestop',
      type: 'active',
      description: 'Freeze all enemies for 5 seconds (30 minute cooldown)',
      effect: { cooldownSeconds: 1800, description: 'Freeze all enemies for 5s' },
    },
  ],
  // Rank 15 - Tier 5: Ultimate legendary bonuses
  15: [
    {
      key: 'all_stats_boost',
      name: 'Eternal Excellence',
      type: 'passive',
      description: '+3 to all stats',
      effect: { str: 3n, dex: 3n, int: 3n, wis: 3n, cha: 3n },
    },
    {
      key: 'crit_boost_2',
      name: 'Perfect Strike',
      type: 'passive',
      description: '+10% critical strike chance',
      effect: { critMelee: 1000n, critRanged: 1000n },
    },
    {
      key: 'defy_death',
      name: 'Defy Death',
      type: 'active',
      description: 'Prevent the next lethal blow and heal to 25% health (30 minute cooldown)',
      effect: { cooldownSeconds: 1800, description: 'Prevent lethal blow, heal to 25% HP' },
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
