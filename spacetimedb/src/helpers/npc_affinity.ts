import { CONVERSATION_COOLDOWN_MICROS } from '../data/npc_data';
import { appendSystemMessage } from './events';
import { getPerkBonusByField } from './renown';
import { statOffset, CHA_AFFINITY_BONUS_PER_POINT } from '../data/combat_scaling.js';

export function getAffinityForNpc(ctx: any, characterId: bigint, npcId: bigint): bigint {
  for (const row of ctx.db.npcAffinity.by_character.filter(characterId)) {
    if (row.npcId === npcId) return row.affinity;
  }
  return 0n;
}

export function getAffinityRow(ctx: any, characterId: bigint, npcId: bigint): any | null {
  for (const row of ctx.db.npcAffinity.by_character.filter(characterId)) {
    if (row.npcId === npcId) return row;
  }
  return null;
}

// Helper to get affinity tier name
function getAffinityTierName(affinity: number): string {
  if (affinity >= 100) return 'Devoted';
  if (affinity >= 75) return 'Close Friend';
  if (affinity >= 50) return 'Friend';
  if (affinity >= 25) return 'Acquaintance';
  if (affinity >= 0) return 'Stranger';
  if (affinity >= -25) return 'Wary';
  if (affinity >= -50) return 'Unfriendly';
  return 'Hostile';
}

export function awardNpcAffinity(ctx: any, character: any, npcId: bigint, baseChange: bigint) {
  const npc = ctx.db.npc.id.find(npcId);
  if (!npc) return;

  // Apply personality modifier
  let multiplier = 1.0;
  if (npc.personalityJson) {
    try {
      const personality = JSON.parse(npc.personalityJson);
      multiplier = personality.affinityMultiplier || 1.0;
    } catch {}
  }

  // Apply NPC affinity gain perk bonus (only for positive affinity changes)
  if (baseChange > 0n) {
    const affinityBonus = getPerkBonusByField(ctx, character.id, 'npcAffinityGainBonus', character.level);
    if (affinityBonus > 0) {
      multiplier = multiplier * (1.0 + affinityBonus / 100.0);
    }
    // CHA off-stat hook: boosts positive affinity gains
    const chaOffsetPct = Number(statOffset(character.cha, CHA_AFFINITY_BONUS_PER_POINT));
    if (chaOffsetPct !== 0) {
      multiplier = multiplier * (1.0 + chaOffsetPct / 100.0);
      if (multiplier < 0.01) multiplier = 0.01; // floor at near-zero, don't flip sign
    }
  }

  const adjustedChange = BigInt(Math.round(Number(baseChange) * multiplier));

  // Get or create affinity row
  const existing = getAffinityRow(ctx, character.id, npcId);
  const oldAffinity = existing ? Number(existing.affinity) : 0;
  const oldTier = getAffinityTierName(oldAffinity);

  if (existing) {
    // Clamp to -100..100 range
    let newAffinity = existing.affinity + adjustedChange;
    if (newAffinity > 100n) newAffinity = 100n;
    if (newAffinity < -100n) newAffinity = -100n;

    ctx.db.npcAffinity.id.update({
      ...existing,
      affinity: newAffinity,
      lastInteraction: ctx.timestamp,
      conversationCount: existing.conversationCount + 1n,
    });

    // IMPORTANT: Check for tier change and log to Log panel (NOT Journal)
    const newTier = getAffinityTierName(Number(newAffinity));
    if (oldTier !== newTier) {
      appendSystemMessage(ctx, character, `Your relationship with ${npc.name} improved to ${newTier}.`);
    }
  } else {
    let initial = adjustedChange;
    if (initial > 100n) initial = 100n;
    if (initial < -100n) initial = -100n;

    ctx.db.npcAffinity.insert({
      id: 0n,
      characterId: character.id,
      npcId,
      affinity: initial,
      lastInteraction: ctx.timestamp,
      giftsGiven: 0n,
      conversationCount: 1n,
      hasGreeted: false,
    });

    // IMPORTANT: Check for tier change (from Stranger baseline) and log to Log panel
    const newTier = getAffinityTierName(Number(initial));
    if (oldTier !== newTier) {
      appendSystemMessage(ctx, character, `Your relationship with ${npc.name} improved to ${newTier}.`);
    }
  }
}

export function canConverseWithNpc(ctx: any, characterId: bigint, npcId: bigint): boolean {
  const row = getAffinityRow(ctx, characterId, npcId);
  if (!row) return true; // First conversation always allowed
  const now = ctx.timestamp.microsSinceUnixEpoch;
  return (now - row.lastInteraction.microsSinceUnixEpoch) >= CONVERSATION_COOLDOWN_MICROS;
}

export function getAvailableDialogueOptions(ctx: any, characterId: bigint, npcId: bigint, parentOptionId: bigint | null): any[] {
  const affinity = getAffinityForNpc(ctx, characterId, npcId);
  const options: any[] = [];

  for (const opt of ctx.db.npcDialogueOption.by_npc.filter(npcId)) {
    // Filter by parent
    if (parentOptionId === null) {
      if (opt.parentOptionId !== undefined && opt.parentOptionId !== null) continue;
    } else {
      if (opt.parentOptionId !== parentOptionId) continue;
    }

    // Check affinity requirement
    if (affinity < opt.requiredAffinity) continue;

    // Check faction requirement
    if (opt.requiredFactionId) {
      let hasFaction = false;
      const minStanding = opt.requiredFactionStanding ?? 0n;
      for (const fs of ctx.db.factionStanding.by_character.filter(characterId)) {
        if (fs.factionId === opt.requiredFactionId && fs.standing >= minStanding) {
          hasFaction = true;
          break;
        }
      }
      if (!hasFaction) continue;
    }

    // Check renown requirement
    if (opt.requiredRenownRank) {
      let renownRow: any = null;
      for (const r of ctx.db.renown.by_character.filter(characterId)) {
        renownRow = r;
        break;
      }
      if (!renownRow || renownRow.currentRank < opt.requiredRenownRank) continue;
    }

    options.push(opt);
  }

  // Sort by sortOrder
  options.sort((a: any, b: any) => {
    const diff = a.sortOrder - b.sortOrder;
    return diff < 0n ? -1 : diff > 0n ? 1 : 0;
  });

  return options;
}
