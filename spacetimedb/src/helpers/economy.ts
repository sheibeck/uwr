import { logPrivateAndGroup } from './events';
import { statOffset, CHA_FACTION_BONUS_PER_POINT } from '../data/combat_scaling.js';

// ---------------------------------------------------------------------------
// SELL PRICE CALCULATION
// Shared by items.ts (sell_item reducer) and intent.ts (natural language sell).
// vendorSellMod is on a 1000-scale (e.g. 50n = +5%).
// ---------------------------------------------------------------------------

export function computeSellValue(baseValue: bigint, vendorSellMod: bigint): bigint {
  if (vendorSellMod > 0n && baseValue > 0n) {
    return (baseValue * (1000n + vendorSellMod)) / 1000n;
  }
  return baseValue;
}

export const STANDING_PER_KILL = 10n;
export const RIVAL_STANDING_PENALTY = 5n;

export function mutateStanding(ctx: any, characterId: bigint, factionId: bigint, delta: bigint) {
  // Apply racial faction bonus if positive delta (Human's level bonus)
  let effectiveDelta = delta;
  if (delta > 0n) {
    const character = ctx.db.character.id.find(characterId);
    const racialBonus = character?.racialFactionBonus ?? 0n;
    if (racialBonus > 0n) {
      effectiveDelta = delta + (delta * racialBonus) / 100n; // racialFactionBonus = +1% per point
    }
    // CHA off-stat hook: boosts positive faction gains
    if (character) {
      const chaOffset = statOffset(character.cha, CHA_FACTION_BONUS_PER_POINT);
      if (chaOffset !== 0n) {
        effectiveDelta = effectiveDelta + (effectiveDelta * chaOffset) / 100n;
        if (effectiveDelta < 1n) effectiveDelta = 1n; // floor at 1 on positive delta
      }
    }
  }

  const rows = [...ctx.db.faction_standing.by_character.filter(characterId)];
  const existing = rows.find((row: any) => row.factionId === factionId);
  if (existing) {
    ctx.db.faction_standing.id.update({ ...existing, standing: existing.standing + effectiveDelta });
  } else {
    ctx.db.faction_standing.insert({ id: 0n, characterId, factionId, standing: effectiveDelta });
  }
}

export function grantFactionStandingForKill(ctx: any, character: any, enemyTemplateId: bigint) {
  const template = ctx.db.enemy_template.id.find(enemyTemplateId);
  if (!template?.factionId) return;
  const faction = ctx.db.faction.id.find(template.factionId);
  if (!faction) return;
  mutateStanding(ctx, character.id, faction.id, STANDING_PER_KILL);
  logPrivateAndGroup(
    ctx,
    character,
    'faction',
    `You gained ${STANDING_PER_KILL} standing with ${faction.name}.`,
    `${character.name} gained ${STANDING_PER_KILL} standing with ${faction.name}.`
  );
  if (faction.rivalFactionId) {
    mutateStanding(ctx, character.id, faction.rivalFactionId, -RIVAL_STANDING_PENALTY);
    const rivalFaction = ctx.db.faction.id.find(faction.rivalFactionId);
    if (rivalFaction) {
      logPrivateAndGroup(
        ctx,
        character,
        'faction',
        `You lost ${RIVAL_STANDING_PENALTY} standing with ${rivalFaction.name}.`,
        `${character.name} lost ${RIVAL_STANDING_PENALTY} standing with ${rivalFaction.name}.`
      );
    }
  }
}
