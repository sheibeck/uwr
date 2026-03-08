import { awardNpcAffinity, getAffinityForNpc, getAffinityRow } from '../helpers/npc_affinity';
import { appendNpcDialog, appendPrivateEvent, appendSystemMessage, fail, requireCharacterOwnedBy } from '../helpers/events';
import { checkBudget, incrementBudget } from '../helpers/llm';
import {
  getOrCreateNpcMemory,
  getAffinityTierForConversation,
  getActiveQuestCount,
  MAX_ACTIVE_QUESTS,
  parseNpcPersonality,
} from '../helpers/npc_conversation';
import {
  buildNpcConversationSystemPrompt,
  buildNpcConversationUserPrompt,
} from '../data/llm_prompts';

export const registerNpcInteractionReducers = (deps: any) => {
  const { spacetimedb, t } = deps;

  // Talk to an NPC using free-form text (LLM-driven conversation)
  spacetimedb.reducer('talk_to_npc', {
    characterId: t.u64(),
    npcId: t.u64(),
    message: t.string(),
  }, (ctx: any, args: any) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const { npcId, message } = args;

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

    // Concurrency check — one LLM task at a time per player
    const existingTasks = [...ctx.db.llm_task.by_player.filter(ctx.sender)];
    if (existingTasks.some((tk: any) => tk.status === 'pending')) {
      return fail(ctx, character, 'The Keeper is already considering something. Patience.');
    }

    // Budget check — NPC conversations share the daily LLM budget
    const budget = checkBudget(ctx, ctx.sender);
    if (!budget.allowed) {
      return fail(ctx, character, 'The Keeper grows weary. Return tomorrow.');
    }

    // Build conversation context
    const personality = parseNpcPersonality(npc);
    const location = ctx.db.location.id.find(npc.locationId);
    const region = location ? ctx.db.region.id.find(location.regionId) : null;
    const affinity = getAffinityForNpc(ctx, character.id, npcId);
    const affinityTier = getAffinityTierForConversation(affinity);
    const memory = getOrCreateNpcMemory(ctx, character.id, npcId);
    const memoryData = memory.memoryJson ? JSON.parse(memory.memoryJson) : {};
    const activeQuests = getActiveQuestCount(ctx, character.id);

    // Build prompts
    const systemPrompt = buildNpcConversationSystemPrompt(
      npc, region || { name: 'Unknown' }, location || { name: 'Unknown' }, personality, affinityTier, memoryData,
    );
    const userPrompt = buildNpcConversationUserPrompt(message, activeQuests, MAX_ACTIVE_QUESTS);

    // Log player message to NpcDialog
    appendNpcDialog(ctx, character.id, npc.id, `You: "${message}"`);
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'say', `You say to ${npc.name}: "${message}"`);

    // Create LlmTask for client proxy to pick up
    ctx.db.llm_task.insert({
      id: 0n,
      playerId: ctx.sender,
      domain: 'npc_conversation',
      model: 'gpt-5-mini',
      systemPrompt,
      userPrompt,
      maxTokens: 500n,
      status: 'pending',
      contextJson: JSON.stringify({
        characterId: character.id.toString(),
        npcId: npc.id.toString(),
        memoryId: memory.id.toString(),
      }),
      createdAt: ctx.timestamp,
    });

    // Increment budget
    incrementBudget(ctx, ctx.sender);
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
