export const AFFINITY_TIERS = {
  HOSTILE: -50,
  UNFRIENDLY: -25,
  STRANGER: 0,
  ACQUAINTANCE: 25,
  FRIEND: 50,
  CLOSE_FRIEND: 75,
  DEVOTED: 100,
} as const;

export const AFFINITY_TIER_NAMES: Record<number, string> = {
  [-50]: 'Hostile',
  [-25]: 'Unfriendly',
  [0]: 'Stranger',
  [25]: 'Acquaintance',
  [50]: 'Friend',
  [75]: 'Close Friend',
  [100]: 'Devoted',
};

export function getAffinityTierName(affinity: number): string {
  if (affinity >= 100) return 'Devoted';
  if (affinity >= 75) return 'Close Friend';
  if (affinity >= 50) return 'Friend';
  if (affinity >= 25) return 'Acquaintance';
  if (affinity >= 0) return 'Stranger';
  if (affinity >= -25) return 'Unfriendly';
  return 'Hostile';
}

export const CONVERSATION_COOLDOWN_MICROS = 3600_000_000n; // 1 hour
export const MAX_GIFTS_PER_DAY = 3n;
export const GIFT_COOLDOWN_MICROS = 86400_000_000n; // 24 hours for gift reset

export const NPC_PERSONALITIES = {
  friendly_merchant: {
    openness: 70,
    conscientiousness: 80,
    extraversion: 90,
    agreeableness: 85,
    neuroticism: 20,
    affinityMultiplier: 1.2,
  },
  grumpy_guard: {
    openness: 30,
    conscientiousness: 95,
    extraversion: 20,
    agreeableness: 40,
    neuroticism: 60,
    affinityMultiplier: 0.8,
  },
  wise_elder: {
    openness: 95,
    conscientiousness: 70,
    extraversion: 30,
    agreeableness: 60,
    neuroticism: 50,
    affinityMultiplier: 1.0,
  },
  veteran_scout: {
    openness: 60,
    conscientiousness: 85,
    extraversion: 50,
    agreeableness: 70,
    neuroticism: 30,
    affinityMultiplier: 1.1,
  },
  weary_healer: {
    openness: 65,
    conscientiousness: 75,
    extraversion: 40,
    agreeableness: 80,
    neuroticism: 55,
    affinityMultiplier: 1.0,
  },
  hardened_soldier: {
    openness: 35,
    conscientiousness: 90,
    extraversion: 45,
    agreeableness: 50,
    neuroticism: 40,
    affinityMultiplier: 0.9,
  },
  curious_scholar: {
    openness: 95,
    conscientiousness: 70,
    extraversion: 25,
    agreeableness: 60,
    neuroticism: 45,
    affinityMultiplier: 1.1,
  },
  shrewd_trader: {
    openness: 55,
    conscientiousness: 80,
    extraversion: 85,
    agreeableness: 65,
    neuroticism: 35,
    affinityMultiplier: 1.0,
  },
  bitter_exile: {
    openness: 40,
    conscientiousness: 60,
    extraversion: 20,
    agreeableness: 30,
    neuroticism: 75,
    affinityMultiplier: 0.8,
  },
  dungeon_warden: {
    openness: 30,
    conscientiousness: 95,
    extraversion: 35,
    agreeableness: 55,
    neuroticism: 35,
    affinityMultiplier: 0.9,
  },
} as const;
