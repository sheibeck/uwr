import { RENOWN_RANKS, RENOWN_PERK_POOLS, calculateRankFromPoints, ACHIEVEMENT_DEFINITIONS } from '../data/renown_data';
import { appendSystemMessage, appendWorldEvent } from './events';

export function awardRenown(ctx: any, character: any, points: bigint, reason: string) {
  // Get or lazy-create Renown row
  let renownRow: any = null;
  for (const row of ctx.db.renown.by_character.filter(character.id)) {
    renownRow = row;
    break;
  }

  if (!renownRow) {
    // Create new renown record starting at rank 1
    renownRow = ctx.db.renown.insert({
      id: 0n,
      characterId: character.id,
      points: 0n,
      currentRank: 1n,
      updatedAt: ctx.timestamp,
    });
  }

  // Add points to existing total
  const newPoints = renownRow.points + points;
  const oldRank = Number(renownRow.currentRank);
  const newRank = calculateRankFromPoints(newPoints);

  // Update Renown row
  ctx.db.renown.id.update({
    ...renownRow,
    points: newPoints,
    currentRank: BigInt(newRank),
    updatedAt: ctx.timestamp,
  });

  // Log renown gain
  appendSystemMessage(ctx, character, `You earned ${points} renown: ${reason}`);

  // If rank increased, announce each intermediate rank
  if (newRank > oldRank) {
    for (let rank = oldRank + 1; rank <= newRank; rank++) {
      const rankData = RENOWN_RANKS.find((r) => r.rank === rank);
      const rankName = rankData ? rankData.name : `Rank ${rank}`;
      appendSystemMessage(ctx, character, `You have achieved rank: ${rankName}!`);
      // Only broadcast world event for the highest achieved rank (avoid spam)
      if (rank === newRank) {
        appendWorldEvent(ctx, 'renown', `${character.name} has achieved the rank of ${rankName}!`);
      }
      // Notify about available perk (ranks 2+ have perk pools)
      if (rank >= 2) {
        appendSystemMessage(ctx, character, `A new perk is available for rank ${rank}: ${rankName}!`);
      }
    }
  }
}

export function awardServerFirst(
  ctx: any,
  character: any,
  category: string,
  achievementKey: string,
  baseRenown: bigint,
  displayLabel?: string
): bigint {
  // Use single-column index by_category, then manually filter by achievementKey
  const existing: any[] = [];
  for (const row of ctx.db.renown_server_first.by_category.filter(category)) {
    if (row.achievementKey === achievementKey) {
      existing.push(row);
    }
  }

  // Determine position (1-indexed)
  const position = BigInt(existing.length + 1);

  // Insert server-first record
  ctx.db.renown_server_first.insert({
    id: 0n,
    category,
    achievementKey,
    characterId: character.id,
    characterName: character.name,
    achievedAt: ctx.timestamp,
    position,
  });

  // Calculate diminishing returns: baseRenown / (2^(position - 1))
  let renownAmount = baseRenown;
  for (let i = 1n; i < position; i += 1n) {
    renownAmount = renownAmount / 2n;
  }
  if (renownAmount < 1n) renownAmount = 1n;

  // Only broadcast actual world firsts (position 1)
  if (position === 1n) {
    const label = displayLabel || `${category}: ${achievementKey}`;
    appendWorldEvent(
      ctx,
      'server_first',
      `${character.name} achieved World First: ${label}!`
    );
  }

  return renownAmount;
}

export function calculatePerkBonuses(ctx: any, characterId: bigint) {
  const totals = {
    maxHp: 0n,
    str: 0n,
    dex: 0n,
    int: 0n,
    wis: 0n,
    cha: 0n,
    armorClass: 0n,
    critMelee: 0n,
    critRanged: 0n,
  };

  // Query all perks for this character
  for (const perkRow of ctx.db.renown_perk.by_character.filter(characterId)) {
    // Find the perk definition
    let perkDef: any = null;
    for (const rankNum in RENOWN_PERK_POOLS) {
      const pool = RENOWN_PERK_POOLS[Number(rankNum)];
      const found = pool.find((p) => p.key === perkRow.perkKey);
      if (found) {
        perkDef = found;
        break;
      }
    }

    if (!perkDef || perkDef.type !== 'passive') continue;

    // Accumulate bonuses
    const effect = perkDef.effect;
    if (effect.maxHp) totals.maxHp += effect.maxHp;
    if (effect.str) totals.str += effect.str;
    if (effect.dex) totals.dex += effect.dex;
    if (effect.int) totals.int += effect.int;
    if (effect.wis) totals.wis += effect.wis;
    if (effect.cha) totals.cha += effect.cha;
    if (effect.armorClass) totals.armorClass += effect.armorClass;
    if (effect.critMelee) totals.critMelee += effect.critMelee;
    if (effect.critRanged) totals.critRanged += effect.critRanged;
  }

  return totals;
}

export function getPerkProcs(ctx: any, characterId: bigint, eventType: string) {
  const procs: any[] = [];
  for (const perkRow of ctx.db.renown_perk.by_character.filter(characterId)) {
    for (const rankNum in RENOWN_PERK_POOLS) {
      const pool = RENOWN_PERK_POOLS[Number(rankNum)];
      const found = pool.find((p) => p.key === perkRow.perkKey);
      if (found && found.effect.procType === eventType) {
        procs.push(found);
        break;
      }
    }
  }
  return procs;
}

export function getPerkBonusByField(ctx: any, characterId: bigint, fieldName: string, characterLevel?: bigint): number {
  let total = 0;
  for (const perkRow of ctx.db.renown_perk.by_character.filter(characterId)) {
    let perkDef: any = null;
    for (const rankNum in RENOWN_PERK_POOLS) {
      const pool = RENOWN_PERK_POOLS[Number(rankNum)];
      const found = pool.find((p) => p.key === perkRow.perkKey);
      if (found) {
        perkDef = found;
        break;
      }
    }
    if (!perkDef) continue;
    const effect = perkDef.effect;
    const fieldValue = (effect as any)[fieldName];
    if (fieldValue === undefined || fieldValue === null) continue;
    let value = typeof fieldValue === 'bigint' ? Number(fieldValue) : fieldValue;
    // Handle scaling perks
    if (effect.scalesWithLevel && effect.perLevelBonus && characterLevel !== undefined) {
      value += effect.perLevelBonus * Number(characterLevel);
    }
    total += value;
  }
  return total;
}

export function getAllPerkEffects(ctx: any, characterId: bigint, characterLevel?: bigint) {
  const totals: Record<string, number> = {
    gatherDoubleChance: 0,
    gatherSpeedBonus: 0,
    craftQualityBonus: 0,
    rareGatherChance: 0,
    npcAffinityGainBonus: 0,
    vendorBuyDiscount: 0,
    vendorSellBonus: 0,
    travelCooldownReduction: 0,
    goldFindBonus: 0,
    xpBonus: 0,
  };
  for (const key of Object.keys(totals)) {
    totals[key] = getPerkBonusByField(ctx, characterId, key, characterLevel);
  }
  return totals;
}

export function grantAchievement(ctx: any, character: any, achievementKey: string): boolean {
  // Check if character already has this achievement
  for (const row of ctx.db.achievement.by_character.filter(character.id)) {
    if (row.achievementKey === achievementKey) {
      return false; // Already achieved
    }
  }

  // Insert Achievement row
  ctx.db.achievement.insert({
    id: 0n,
    characterId: character.id,
    achievementKey,
    achievedAt: ctx.timestamp,
  });

  // Look up achievement definition
  const achievementDef = ACHIEVEMENT_DEFINITIONS[achievementKey];
  if (!achievementDef) {
    appendSystemMessage(ctx, character, `Achievement unlocked: ${achievementKey}`);
    return true;
  }

  // Award server-first bonus
  const serverFirstRenown = awardServerFirst(ctx, character, 'achievement', achievementKey, achievementDef.renown, achievementDef.name);

  // Award personal-first bonus on top
  const PERSONAL_FIRST_BONUS = 50n;
  const totalRenown = serverFirstRenown + PERSONAL_FIRST_BONUS;
  awardRenown(ctx, character, totalRenown, `Achievement: ${achievementDef.name}`);

  // Log achievement message
  appendSystemMessage(ctx, character, `Achievement unlocked: ${achievementDef.name} - ${achievementDef.description}`);

  return true;
}
