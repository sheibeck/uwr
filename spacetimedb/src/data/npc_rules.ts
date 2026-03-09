// npc_rules.ts
// Mechanical rules extracted from legacy npc_data.ts.
// Contains affinity tier constants and conversation cooldowns.
// All specific NPC personality templates are discarded -- NPCs are generated through play.

// ---------------------------------------------------------------------------
// AFFINITY TIERS
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CONVERSATION & GIFT COOLDOWNS
// ---------------------------------------------------------------------------

export const CONVERSATION_COOLDOWN_MICROS = 30_000_000n; // 30 seconds
export const MAX_GIFTS_PER_DAY = 3n;
export const GIFT_COOLDOWN_MICROS = 86400_000_000n; // 24 hours for gift reset
