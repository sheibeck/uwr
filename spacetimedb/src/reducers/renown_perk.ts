/**
 * Renown perk choice logic — extracted for testability.
 * The actual reducer in renown.ts wraps this with auth checks.
 */
import { appendSystemMessage } from '../helpers/events';

/**
 * Pure logic for choose_renown_perk:
 * - Validates pending perk exists for character
 * - Active perk (non-empty kind) -> ability_template with source='Renown'
 * - Passive perk (perkEffectJson set, kind empty) -> renown_perk table
 * - Cleans up ALL pending_renown_perk rows for character after choice
 * - Logs a message to the player
 *
 * Returns { success: boolean, error?: string }
 */
export function chooseRenownPerkLogic(
  ctx: any,
  { characterId, perkId }: { characterId: bigint; perkId: bigint }
): { success: boolean; error?: string } {
  // Look up character
  const character = ctx.db.character.id.find(characterId);
  if (!character) {
    return { success: false, error: 'Character not found' };
  }

  // Find all pending perk rows for character
  const pendingPerks: any[] = [...ctx.db.pending_renown_perk.by_character.filter(characterId)];

  if (pendingPerks.length === 0) {
    return { success: false, error: 'No pending renown perk choices' };
  }

  // Find the requested perk
  const perk = pendingPerks.find((p: any) => p.id === perkId);
  if (!perk) {
    return { success: false, error: 'Invalid perk selection' };
  }

  const isActivePerk = typeof perk.kind === 'string' && perk.kind.trim().length > 0;

  if (isActivePerk) {
    // Active ability perk -> insert as ability_template with source='Renown'
    const sanitizedName = perk.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const abilityKey = `renown_rank${perk.rank}_${sanitizedName}`;

    ctx.db.ability_template.insert({
      id: 0n,
      characterId,
      name: perk.name,
      description: perk.description,
      kind: perk.kind,
      targetRule: perk.targetRule,
      resourceType: perk.resourceType,
      resourceCost: perk.resourceCost,
      castSeconds: perk.castSeconds,
      cooldownSeconds: perk.cooldownSeconds,
      scaling: perk.scaling,
      value1: perk.value1,
      value2: perk.value2 ?? undefined,
      damageType: perk.damageType ?? undefined,
      effectType: perk.effectType ?? undefined,
      effectMagnitude: perk.effectMagnitude ?? undefined,
      effectDuration: perk.effectDuration ?? undefined,
      levelRequired: 1n,
      isGenerated: true,
      source: 'Renown',
      abilityKey,
    });
  } else {
    // Passive perk -> insert into renown_perk table with perkKey
    const perkKey = `renown_rank${perk.rank}_${perk.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    ctx.db.renown_perk.insert({
      id: 0n,
      characterId,
      rank: perk.rank,
      perkKey,
      chosenAt: ctx.timestamp,
    });
  }

  // Delete ALL pending_renown_perk rows for this character (player chose, clear the rest)
  const toDelete = [...ctx.db.pending_renown_perk.by_character.filter(characterId)];
  for (const row of toDelete) {
    ctx.db.pending_renown_perk.id.delete(row.id);
  }

  // Log the choice
  appendSystemMessage(ctx, character, `You chose ${perk.name} as your rank ${perk.rank} renown reward.`);

  return { success: true };
}
