import { RENOWN_RANKS, RENOWN_PERK_POOLS, calculateRankFromPoints, ACHIEVEMENT_DEFINITIONS } from '../data/renown_data';
import type { RenownPerkInput } from '../data/llm_layers';
import { appendPrivateEvent, appendSystemMessage, appendWorldEvent } from './events';
import { enqueueLlmJob, hasActiveJobForCharacter, resolveCharacterPlayerId, SOURCE_KEYS } from './llm_queue';
import { encodeRouteInput } from './llm_inputs';

/** Keeper line posted when static perk options stand in for a generated offer. */
export const RENOWN_STATIC_OPTIONS_MESSAGE =
  'The cosmos shrugs and offers some... standard options for your consideration.';

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
        // Trigger LLM perk generation for this rank; one rank is offered at a time.
        if (triggerRenownPerkGeneration(ctx, character, rank) === 'deferred') {
          appendSystemMessage(ctx, character, renownDeferredMessage(rank));
        }
      }
    }
  }
}

/** System line when a rank's offer waits for the player to choose an earlier rank's reward. */
export function renownDeferredMessage(rank: number): string {
  return `Your rank ${rank} reward will be offered once you choose your earlier renown reward.`;
}

/**
 * True when the character already holds the reward for `rank`: a renown_perk row (passive
 * perks and the legacy choose_perk path) or a Renown ability whose key chooseRenownPerkLogic
 * writes as `renown_rank<rank>_<name>`.
 */
export function renownRankClaimed(ctx: any, characterId: bigint, rank: number): boolean {
  const rankBig = BigInt(rank);
  for (const row of ctx.db.renown_perk.by_character.filter(characterId)) {
    if (row.rank === rankBig) return true;
  }
  const prefix = `renown_rank${rank}_`;
  for (const row of ctx.db.ability_template.by_character.filter(characterId)) {
    if (row.source === 'Renown' && typeof row.abilityKey === 'string' && row.abilityKey.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * True while a renown offer is open for the character: pending options of any rank, or an
 * active renown_perk_gen job. Offers are serialized on this so two ranks never coexist.
 */
export function renownOfferOutstanding(ctx: any, characterId: bigint): boolean {
  for (const _row of ctx.db.pending_renown_perk.by_character.filter(characterId)) return true;
  return hasActiveJobForCharacter(ctx, 'renown_perk_gen', characterId);
}

/**
 * After a renown choice: offer the lowest rank (2..currentRank) the character has earned but
 * not claimed, if no other offer is open. A rank that yields no offer (no pool and no job) is
 * skipped so the chain never stalls on it.
 */
export function offerNextRenownPerk(ctx: any, character: any): void {
  if (renownOfferOutstanding(ctx, character.id)) return;
  let currentRank = 1;
  for (const row of ctx.db.renown.by_character.filter(character.id)) {
    currentRank = Number(row.currentRank);
    break;
  }
  for (let rank = 2; rank <= currentRank; rank++) {
    if (renownRankClaimed(ctx, character.id, rank)) continue;
    triggerRenownPerkGeneration(ctx, character, rank);
    if (renownOfferOutstanding(ctx, character.id)) return;
  }
}

/** True when `rank` already has pending options for the character or has been claimed. */
export function renownRankSettled(ctx: any, characterId: bigint, rank: number): boolean {
  const rankBig = BigInt(rank);
  for (const existing of ctx.db.pending_renown_perk.by_character.filter(characterId)) {
    if (existing.rank === rankBig) return true;
  }
  return renownRankClaimed(ctx, characterId, rank);
}

export type RenownOfferOutcome ='offered' | 'deferred' | 'claimed';

/**
 * Rank-up hook: enqueue a renown_perk_gen job for the character's owning player.
 * The request snapshots the route input (`input`, read by the executor) next to
 * the legacy keys applyRenownPerkResult reads. When no player identity resolves,
 * or the enqueue is refused (budget or phase cap; an earned offer is never
 * refused as busy), the static RENOWN_PERK_POOLS options are inserted with a
 * Keeper line instead, so an earned perk offer is never silently dropped.
 *
 * Offers are serialized (CR-B01): while another offer is open (pending options or an
 * active job, any rank) nothing is enqueued and 'deferred' is returned;
 * offerNextRenownPerk queues the rank once the open offer is chosen. A rank the
 * character already claimed returns 'claimed'.
 *
 * Enqueue errors are programming errors and are deliberately not swallowed
 * (the swallowed insert was the PIPE-08 defect).
 */
export function triggerRenownPerkGeneration(ctx: any, character: any, rank: number): RenownOfferOutcome {
  if (renownRankClaimed(ctx, character.id, rank)) return 'claimed';
  if (renownOfferOutstanding(ctx, character.id)) return 'deferred';

  const playerId = resolveCharacterPlayerId(ctx, character);
  if (playerId === null) {
    insertStaticRenownPerkOptions(ctx, character.id, rank);
    return 'offered';
  }

  // Collect existing renown perks for diversity context
  const existingPerks: { name: string; perkKey: string }[] = [];
  for (const perkRow of ctx.db.renown_perk.by_character.filter(character.id)) {
    existingPerks.push({ name: perkRow.perkKey, perkKey: perkRow.perkKey });
  }

  const className = character.className ?? 'Unknown';
  const raceName = character.race ?? 'Unknown';
  const input: RenownPerkInput = {
    characterName: character.name,
    className,
    raceName,
    rank,
    existingPerks,
  };

  const result = enqueueLlmJob(ctx, {
    route: 'renown_perk_gen',
    playerId,
    characterId: character.id,
    sourceKey: SOURCE_KEYS.renownPerk(character.id, rank),
    request: {
      characterId: character.id,
      rank,
      className,
      raceName,
      existingPerks,
      input: encodeRouteInput(input),
    },
  });

  if (result.refused) {
    if (insertStaticRenownPerkOptions(ctx, character.id, rank) > 0) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'narrative', RENOWN_STATIC_OPTIONS_MESSAGE);
    }
  }
  return 'offered';
}

/**
 * JSON for a passive perk effect. Effects carry bigint values (for example maxHp: 25n),
 * which JSON.stringify rejects. Safe-range bigints become plain numbers, matching the
 * {maxHp: 25} shape the perk prompt documents; anything larger becomes a decimal string.
 * perkEffectJson is not parsed anywhere downstream: chosen passives are looked up by
 * perkKey in RENOWN_PERK_POOLS, so this is a readable record only.
 */
export function serializePerkEffect(effect: unknown): string {
  return JSON.stringify(effect, (_k, v) => {
    if (typeof v !== 'bigint') return v;
    return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(v)
      : v.toString();
  });
}

/**
 * Static fallback: insert 3 options from RENOWN_PERK_POOLS for the given rank.
 * Used when no player identity resolves for the character, when the model reply is
 * unusable, and when a renown_perk_gen job fails terminally, so an earned perk offer
 * is never silently dropped.
 *
 * Idempotent per character and rank: when the character already has a pending option
 * for the rank, or has already claimed the rank, nothing is inserted. Returns the number
 * of rows inserted.
 */
export function insertStaticRenownPerkOptions(ctx: any, characterId: bigint, rank: number): number {
  const pool = RENOWN_PERK_POOLS[rank];
  if (!pool || pool.length === 0) return 0;

  if (renownRankSettled(ctx, characterId, rank)) return 0;
  const rankBig = BigInt(rank);

  const perks = pool.slice(0, 3);
  for (const perk of perks) {
    const isActive = perk.type === 'active';
    ctx.db.pending_renown_perk.insert({
      id: 0n,
      characterId,
      rank: rankBig,
      name: perk.name,
      description: perk.description,
      kind: isActive ? 'utility' : '',
      targetRule: 'self',
      resourceType: isActive ? 'stamina' : 'none',
      resourceCost: 0n,
      castSeconds: 0n,
      cooldownSeconds: isActive ? BigInt((perk.effect as any).cooldownSeconds ?? 300) : 0n,
      scaling: 'none',
      value1: 0n,
      perkEffectJson: isActive ? undefined : serializePerkEffect(perk.effect),
      perkDomain: perk.domain,
      createdAt: ctx.timestamp,
    });
  }
  return perks.length;
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
