import { RENOWN_PERK_POOLS } from '../data/renown_data';
import { awardRenown, grantAchievement } from '../helpers/renown';

export const registerRenownReducers = (deps: any) => {
  const { spacetimedb, t, SenderError, requireAdmin, requireCharacterOwnedBy, appendSystemMessage } = deps;

  spacetimedb.reducer('choose_perk', { characterId: t.u64(), perkKey: t.string() }, (ctx: any, { characterId, perkKey }: any) => {
    // Auth check
    const character = requireCharacterOwnedBy(ctx, characterId);

    // Get Renown row
    let renownRow: any = null;
    for (const row of ctx.db.renown.by_character.filter(characterId)) {
      renownRow = row;
      break;
    }

    if (!renownRow) {
      throw new SenderError('No renown record found');
    }

    const currentRank = Number(renownRow.currentRank);

    // Find the lowest rank (2..currentRank) that still needs a perk choice
    const chosenRanks = new Set<number>();
    for (const existingPerk of ctx.db.renown_perk.by_character.filter(characterId)) {
      chosenRanks.add(Number(existingPerk.rank));
    }

    let targetRank: number | null = null;
    for (let rank = 2; rank <= currentRank; rank++) {
      if (!chosenRanks.has(rank) && RENOWN_PERK_POOLS[rank]) {
        targetRank = rank;
        break;
      }
    }

    if (targetRank === null) {
      throw new SenderError('No perk choices available');
    }

    const perkPool = RENOWN_PERK_POOLS[targetRank];
    if (!perkPool) {
      throw new SenderError(`No perk pool for rank ${targetRank}`);
    }

    // Validate perkKey exists in pool
    const perk = perkPool.find((p: any) => p.key === perkKey);
    if (!perk) {
      throw new SenderError('Invalid perk choice for this rank');
    }

    // Insert RenownPerk row
    ctx.db.renown_perk.insert({
      id: 0n,
      characterId,
      rank: BigInt(targetRank),
      perkKey,
      chosenAt: ctx.timestamp,
    });

    // Auto-assign active ability perks to the hotbar
    if (perk.type === 'active' && perk.effect.perkAbilityKey) {
      const abilityKey = perk.effect.perkAbilityKey;
      // Find all used hotbar slots for this character
      const usedSlots = new Set<number>();
      for (const slot of ctx.db.hotbar_slot.by_character.filter(characterId)) {
        usedSlots.add(Number(slot.slot));
      }
      // Find first empty slot 0-11
      let emptySlot: number | null = null;
      for (let i = 0; i <= 11; i++) {
        if (!usedSlots.has(i)) {
          emptySlot = i;
          break;
        }
      }
      if (emptySlot !== null) {
        ctx.db.hotbar_slot.insert({
          id: 0n,
          characterId,
          slot: emptySlot,
          abilityKey,
          assignedAt: ctx.timestamp,
        });
        appendSystemMessage(ctx, character, `${perk.name} added to hotbar slot ${emptySlot}.`);
      } else {
        appendSystemMessage(ctx, character, `${perk.name} granted! Manage your hotbar to use it.`);
      }
    }

    // Log message
    appendSystemMessage(ctx, character, `You have chosen the perk: ${perk.name}`);
  });

  spacetimedb.reducer('grant_test_renown', { characterId: t.u64(), points: t.u64() }, (ctx: any, { characterId, points }: any) => {
    requireAdmin(ctx);
    const character = requireCharacterOwnedBy(ctx, characterId);
    awardRenown(ctx, character, points, 'Test grant');
  });

  spacetimedb.reducer('grant_test_achievement', { characterId: t.u64(), achievementKey: t.string() }, (ctx: any, { characterId, achievementKey }: any) => {
    requireAdmin(ctx);
    const character = requireCharacterOwnedBy(ctx, characterId);
    const granted = grantAchievement(ctx, character, achievementKey);
    if (!granted) {
      throw new SenderError('Achievement already earned');
    }
  });
};
