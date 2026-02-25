import { awardNpcAffinity, getAffinityForNpc, getAffinityRow } from '../helpers/npc_affinity';
import { appendNpcDialog, appendPrivateEvent, appendSystemMessage, fail, requireCharacterOwnedBy } from '../helpers/events';

export const registerNpcInteractionReducers = (deps: any) => {
  const { spacetimedb, t } = deps;

  // Choose a dialogue option from an NPC's dialogue tree
  spacetimedb.reducer('choose_dialogue_option', {
    characterId: t.u64(),
    npcId: t.u64(),
    optionId: t.u64(),
  }, (ctx: any, args: any) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const { npcId, optionId } = args;

    const npc = ctx.db.npc.id.find(npcId);
    if (!npc) { fail(ctx, character, 'NPC not found.'); return; }

    // Check character is at NPC location
    if (character.locationId !== npc.locationId) {
      return fail(ctx, character, 'You are not near this NPC.');
    }

    // Find the dialogue option
    const option = ctx.db.npc_dialogue_option.id.find(optionId);
    if (!option || option.npcId !== npcId) {
      return fail(ctx, character, 'Invalid dialogue option.');
    }

    // Check affinity requirement
    const currentAffinity = getAffinityForNpc(ctx, character.id, npcId);
    if (currentAffinity < option.requiredAffinity) {
      return fail(ctx, character, 'Your relationship is not strong enough for this conversation.');
    }

    // Check faction requirement
    if (option.requiredFactionId) {
      const minStanding = option.requiredFactionStanding ?? 0n;
      let hasFaction = false;
      for (const fs of ctx.db.faction_standing.by_character.filter(character.id)) {
        if (fs.factionId === option.requiredFactionId && fs.standing >= minStanding) {
          hasFaction = true;
          break;
        }
      }
      if (!hasFaction) {
        return fail(ctx, character, 'Your faction standing is insufficient.');
      }
    }

    // Check renown requirement
    if (option.requiredRenownRank) {
      let renownRow: any = null;
      for (const r of ctx.db.renown.by_character.filter(character.id)) {
        renownRow = r;
        break;
      }
      if (!renownRow || renownRow.currentRank < option.requiredRenownRank) {
        return fail(ctx, character, 'Your renown rank is too low.');
      }
    }

    // Apply affinity change
    if (option.affinityChange !== 0n) {
      awardNpcAffinity(ctx, character, npcId, option.affinityChange);
    }

    // IMPORTANT: Dialogue goes to Journal (NPC Dialog panel) AND Log (private NPC message)
    // Log the player's dialogue choice to Journal
    const playerLine = `You say, "${option.playerText}"`;
    appendNpcDialog(ctx, character.id, npc.id, playerLine);
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc', playerLine);

    // Log the NPC's response to Journal AND Log
    const npcLine = `${npc.name} says, "${option.npcResponse}"`;
    appendNpcDialog(ctx, character.id, npc.id, npcLine);
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc', npcLine);
  });

  // Give an inventory item to an NPC as a gift
  spacetimedb.reducer('give_gift_to_npc', {
    characterId: t.u64(),
    npcId: t.u64(),
    itemInstanceId: t.u64(),
  }, (ctx: any, args: any) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const { npcId, itemInstanceId } = args;

    const npc = ctx.db.npc.id.find(npcId);
    if (!npc) { fail(ctx, character, 'NPC not found.'); return; }

    // Check location
    if (character.locationId !== npc.locationId) {
      return fail(ctx, character, 'You are not near this NPC.');
    }

    // Check item ownership
    const item = ctx.db.item_instance.id.find(itemInstanceId);
    if (!item || item.ownerCharacterId !== character.id) {
      return fail(ctx, character, 'Item not found in your inventory.');
    }

    // Don't allow gifting equipped items
    if (item.equippedSlot) {
      return fail(ctx, character, 'Unequip the item before gifting it.');
    }

    // Get item template for value calculation
    const template = ctx.db.item_template.id.find(item.templateId);
    if (!template) {
      return fail(ctx, character, 'Unknown item.');
    }

    // Calculate affinity gain based on item vendor value
    let affinityGain = template.vendorValue / 10n;
    if (affinityGain < 1n) affinityGain = 1n;
    if (affinityGain > 20n) affinityGain = 20n; // Cap gain per gift

    // Delete the item (consume it)
    if (item.quantity > 1n) {
      // Stackable: reduce quantity by 1
      ctx.db.item_instance.id.update({
        ...item,
        quantity: item.quantity - 1n,
      });
    } else {
      ctx.db.item_instance.id.delete(itemInstanceId);
    }

    // Award affinity
    awardNpcAffinity(ctx, character, npcId, affinityGain);

    // Update gift counter
    const affinityRow = getAffinityRow(ctx, character.id, npcId);
    if (affinityRow) {
      ctx.db.npc_affinity.id.update({
        ...affinityRow,
        giftsGiven: affinityRow.giftsGiven + 1n,
      });
    }
    // If no affinityRow exists, awardNpcAffinity already created one

    // IMPORTANT: Gift notification to Log, full conversation to Journal AND Log
    appendSystemMessage(ctx, character, `You gave ${template.name} to ${npc.name}.`);

    // Log the gift to Journal AND Log
    const giftMsg = `You give ${template.name} to ${npc.name}. (+${affinityGain} affinity)`;
    appendNpcDialog(ctx, character.id, npc.id, giftMsg);
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc', giftMsg);

    // NPC reaction based on current affinity (goes to Journal AND Log)
    const newAffinity = Number(getAffinityForNpc(ctx, character.id, npcId));
    let reaction: string;
    if (newAffinity >= 75) {
      reaction = `${npc.name} accepts your gift with genuine warmth. "You are too kind, friend."`;
    } else if (newAffinity >= 50) {
      reaction = `${npc.name} nods appreciatively. "A thoughtful gesture."`;
    } else if (newAffinity >= 25) {
      reaction = `${npc.name} accepts the gift. "Well, that is... unexpected."`;
    } else {
      reaction = `${npc.name} takes the offering with a brief nod.`;
    }
    appendNpcDialog(ctx, character.id, npc.id, reaction);
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc', reaction);
  });
};
