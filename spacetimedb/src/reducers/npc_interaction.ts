import { awardNpcAffinity, getAffinityForNpc, getAffinityRow } from '../helpers/npc_affinity';
import { appendNpcDialog, appendPrivateEvent, appendSystemMessage, fail, requireCharacterOwnedBy } from '../helpers/events';
import { enqueueLlmJob, llmRefusalMessage, SOURCE_KEYS } from '../helpers/llm_queue';
import { encodeRouteInput } from '../helpers/llm_inputs';
import {
  getOrCreateNpcMemory,
  getAffinityTierForConversation,
  getActiveQuestCount,
  getActiveQuestCountForNpc,
  getCompletedQuestNamesForNpc,
  getNearbyEnemyContext,
  MAX_ACTIVE_QUESTS,
  MAX_QUESTS_PER_NPC,
  parseNpcPersonality,
} from '../helpers/npc_conversation';
import { flattenLineBreaks } from '../helpers/chat_text';
import { recentRumors } from '../helpers/pool_events';
import { regionFamilyHistories } from '../helpers/families';
import { PLAYER_INPUT_MAX_CHARS, truncateCodePoints, type NpcConversationInput } from '../data/llm_layers';
import { npcGender } from '../data/npc_gender';

export const registerNpcInteractionReducers = (deps: any) => {
  const { spacetimedb, t } = deps;

  // Talk to an NPC using free-form text (LLM-driven conversation)
  spacetimedb.reducer('talk_to_npc', {
    characterId: t.u64(),
    npcId: t.u64(),
    message: t.string(),
  }, (ctx: any, args: any) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const { npcId } = args;
    // Capped here, before the job snapshot and the echo: the model only ever sees this many code
    // points, so the reservation, the stored snapshot and the log never carry more.
    const message = truncateCodePoints(typeof args.message === 'string' ? flattenLineBreaks(args.message) : '', PLAYER_INPUT_MAX_CHARS);

    const npc = ctx.db.npc.id.find(npcId);
    if (!npc) { fail(ctx, character, 'NPC not found.'); return; }

    // Location check
    if (character.locationId !== npc.locationId) {
      return fail(ctx, character, 'You are not near this NPC.');
    }

    // Combat check
    if (character.combatTargetEnemyId) {
      return fail(ctx, character, 'You cannot converse while in combat.');
    }

    if (message.length === 0) {
      return fail(ctx, character, 'You open your mouth, but nothing comes out.');
    }

    // Build conversation context (snapshotted into the job, so a retry sees what the player saw)
    const personality = parseNpcPersonality(npc);
    const location = ctx.db.location.id.find(npc.locationId);
    const region = location ? ctx.db.region.id.find(location.regionId) : null;
    const affinity = getAffinityForNpc(ctx, character.id, npcId);
    const affinityTier = getAffinityTierForConversation(affinity);
    const memory = getOrCreateNpcMemory(ctx, character.id, npcId);
    const memoryData = memory.memoryJson ? JSON.parse(memory.memoryJson) : {};
    const activeQuests = getActiveQuestCount(ctx, character.id);

    // Collect nearby location names for LLM context
    const connections = [...ctx.db.location_connection.by_from.filter(character.locationId)];
    const nearbyLocationNames = connections
      .map((c: any) => ctx.db.location.id.find(c.toLocationId))
      .filter(Boolean)
      .map((l: any) => l!.name);

    // Collect enriched quest context
    const completedQuestNames = getCompletedQuestNamesForNpc(ctx, character.id, npcId);
    const activeQuestFromThisNpc = getActiveQuestCountForNpc(ctx, character.id, npcId) >= MAX_QUESTS_PER_NPC;
    const nearbyEnemies = getNearbyEnemyContext(ctx, character.locationId);
    const recentQuestNames = completedQuestNames.slice(-5);
    // 51.3.1.1-26 (D-22): recent word about population shifts in this NPC's region (read-only).
    const regionRumors = location ? recentRumors(ctx, location.regionId, ctx.timestamp.microsSinceUnixEpoch) : [];
    // 51.3.1.1-30 (D-68): the histories of the region's creature families, this NPC's place first (read-only).
    const familyHistories = location ? regionFamilyHistories(ctx, location.regionId, location.id) : [];

    const input: NpcConversationInput = {
      npc: { name: npc.name, npcType: npc.npcType, gender: npcGender(npc) },
      region: region
        ? {
            name: region.name,
            biome: region.biome ?? undefined,
            landmarks: region.landmarks ?? undefined,
            threats: region.threats ?? undefined,
          }
        : { name: 'Unknown' },
      location: { name: location ? location.name : 'Unknown' },
      personality,
      affinityTier,
      memory: memoryData,
      completedQuestNames,
      activeQuestFromThisNpc,
      playerMessage: message,
      activeQuestCount: activeQuests,
      maxQuests: MAX_ACTIVE_QUESTS,
      nearbyLocationNames,
      nearbyEnemies,
      recentQuestNames,
      regionRumors,
      familyHistories,
    };

    // The turn marker is read after getOrCreateNpcMemory, so two racing tabs see the same key
    // and one reply is applied before the next message can start a new job.
    const result = enqueueLlmJob(ctx, {
      route: 'npc_conversation',
      playerId: ctx.sender,
      characterId: character.id,
      sourceKey: SOURCE_KEYS.npcConversation(
        character.id,
        npc.id,
        memory.lastUpdated.microsSinceUnixEpoch,
      ),
      request: {
        characterId: character.id.toString(),
        npcId: npc.id.toString(),
        memoryId: memory.id.toString(),
        input: encodeRouteInput(input),
      },
    });
    if (result.refused) {
      return fail(ctx, character, llmRefusalMessage(result.refused));
    }
    if (!result.created) {
      return fail(ctx, character, 'The Keeper is already considering something. Patience.');
    }

    // Echo the player's line only once the job exists, so the log never shows a line the NPC will not answer.
    appendNpcDialog(ctx, character.id, npc.id, `You: "${message}"`);
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'say', `You say to ${npc.name}: "${message}"`);
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
