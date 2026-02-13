import { logPrivateAndGroup } from './events';

export const STANDING_PER_KILL = 10n;
export const RIVAL_STANDING_PENALTY = 5n;

export function mutateStanding(ctx: any, characterId: bigint, factionId: bigint, delta: bigint) {
  const rows = [...ctx.db.factionStanding.by_character.filter(characterId)];
  const existing = rows.find((row: any) => row.factionId === factionId);
  if (existing) {
    ctx.db.factionStanding.id.update({ ...existing, standing: existing.standing + delta });
  } else {
    ctx.db.factionStanding.insert({ id: 0n, characterId, factionId, standing: delta });
  }
}

export function grantFactionStandingForKill(ctx: any, character: any, enemyTemplateId: bigint) {
  const template = ctx.db.enemyTemplate.id.find(enemyTemplateId);
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
