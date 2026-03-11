import { RENOWN_PERK_POOLS } from '../data/renown_data';
import { awardRenown, grantAchievement } from '../helpers/renown';
import { ensureDefaultHotbar } from '../helpers/items';
import { chooseRenownPerkLogic } from './renown_perk';

export const registerRenownReducers = (deps: any) => {
  const { spacetimedb, t, requireAdmin, requireCharacterOwnedBy, appendSystemMessage, fail } = deps;

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
      fail(ctx, character, 'No renown record found');
      return;
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
      fail(ctx, character, 'No perk choices available');
      return;
    }

    const perkPool = RENOWN_PERK_POOLS[targetRank];
    if (!perkPool) {
      fail(ctx, character, `No perk pool for rank ${targetRank}`);
      return;
    }

    // Validate perkKey exists in pool
    const perk = perkPool.find((p: any) => p.key === perkKey);
    if (!perk) {
      fail(ctx, character, 'Invalid perk choice for this rank');
      return;
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
      const hotbar = ensureDefaultHotbar(ctx, characterId);
      // Find all used hotbar slots for this character's active hotbar
      const usedSlots = new Set<number>();
      for (const slot of ctx.db.hotbar_slot.by_hotbar.filter(hotbar.id)) {
        usedSlots.add(Number(slot.slot));
      }
      // Find first empty slot 1-10 (client uses 1-based slots)
      let emptySlot: number | null = null;
      for (let i = 1; i <= 10; i++) {
        if (!usedSlots.has(i)) {
          emptySlot = i;
          break;
        }
      }
      if (emptySlot !== null) {
        // Look up the ability template by perkAbilityKey
        let abilityTemplateId = 0n;
        for (const at of ctx.db.ability_template.iter()) {
          if (at.key === perk.effect.perkAbilityKey) {
            abilityTemplateId = at.id;
            break;
          }
        }
        ctx.db.hotbar_slot.insert({
          id: 0n,
          characterId,
          hotbarId: hotbar.id,
          slot: emptySlot,
          abilityTemplateId,
          assignedAt: ctx.timestamp,
        });
        appendSystemMessage(ctx, character, `${perk.name} added to hotbar slot ${emptySlot + 1}.`);
      } else {
        appendSystemMessage(ctx, character, `${perk.name} granted! Manage your hotbar to use it.`);
      }
    }

    // Log message
    appendSystemMessage(ctx, character, `You have chosen the perk: ${perk.name}`);
  });

  spacetimedb.reducer('choose_renown_perk', { characterId: t.u64(), perkId: t.u64() }, (ctx: any, { characterId, perkId }: any) => {
    // Auth check
    const character = requireCharacterOwnedBy(ctx, characterId);
    if (!character) return;

    const result = chooseRenownPerkLogic(ctx, { characterId, perkId });
    if (!result.success) {
      fail(ctx, character, result.error || 'Invalid perk choice');
    }
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
      fail(ctx, character, 'Achievement already earned');
      return;
    }
  });
};
