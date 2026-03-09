import { awardNpcAffinity } from '../helpers/npc_affinity';
import { recordQuestCompletion } from '../helpers/npc_conversation';

function computeQuestRewardStats(playerLevel: bigint, questType: string) {
  const levelNum = Number(playerLevel);
  const baseBudget = levelNum * 2 + 5;

  // Quest type multiplier (harder quests = better rewards)
  const typeMultipliers: Record<string, number> = {
    kill: 1.0, kill_loot: 1.0, explore: 0.8, gather: 0.8,
    delivery: 0.9, discover: 0.9, interact: 0.8,
    boss_kill: 1.3, escort: 1.2,
  };
  const typeMult = typeMultipliers[questType] || 1.0;
  const totalBudget = Math.round(baseBudget * typeMult);

  // Pick slot based on level parity for variety
  const slots = ['head', 'chest', 'legs', 'feet', 'hands', 'weapon'];
  const slotIdx = levelNum % slots.length;
  const slot = slots[slotIdx];
  const isWeapon = slot === 'weapon';

  // Rarity based on total budget
  let rarity = 'common';
  if (totalBudget >= 25) rarity = 'uncommon';
  if (totalBudget >= 40) rarity = 'rare';
  if (totalBudget >= 60) rarity = 'epic';

  // Distribute stats
  const damage = isWeapon ? Math.round(totalBudget * 0.6) : 0;
  const armor = !isWeapon ? Math.round(totalBudget * 0.4) : 0;
  const primaryStat = Math.round(totalBudget * 0.15);
  const secondaryStat = Math.round(totalBudget * 0.1);

  return {
    slot,
    armorType: isWeapon ? 'none' : 'medium',
    rarity,
    vendorValue: totalBudget * 3,
    damage,
    armor,
    str: isWeapon ? primaryStat : secondaryStat,
    dex: secondaryStat,
    int: 0,
    wis: 0,
    cha: 0,
    maxHp: Math.round(totalBudget * 0.2),
    maxMana: 0,
  };
}

export const registerQuestReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    requireCharacterOwnedBy,
    appendPrivateEvent,
    fail,
    ensureSpawnsForLocation,
    startCombatForSpawn,
    spawnEnemyWithTemplate,
    effectiveGroupId,
    isGroupLeaderOrSolo,
  } = deps;

  // loot_quest_item reducer
  // The cast timer is CLIENT-SIDE only. The client shows a timed progress bar (same pattern
  // as resource gathering) and calls this reducer only when the timer elapses.
  // This reducer simply validates and marks the item as looted when called.
  spacetimedb.reducer(
    'loot_quest_item',
    { characterId: t.u64(), questItemId: t.u64() },
    (ctx: any, args: any) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);

      // Find and validate the quest item
      const questItem = ctx.db.quest_item.id.find(args.questItemId);
      if (!questItem) { fail(ctx, character, 'Quest item not found'); return; }
      if (questItem.characterId !== character.id) { fail(ctx, character, 'That quest item does not belong to your character'); return; }
      if (!questItem.discovered) { fail(ctx, character, 'You have not yet discovered this item'); return; }
      if (questItem.looted) { fail(ctx, character, 'You have already looted this item'); return; }

      // Mark as looted
      ctx.db.quest_item.id.update({ ...questItem, looted: true });

      // Find matching quest instance (not completed, matching template)
      let questInstance: any = null;
      for (const qi of ctx.db.quest_instance.by_character.filter(character.id)) {
        if (qi.completed) continue;
        if (qi.questTemplateId === questItem.questTemplateId) {
          questInstance = qi;
          break;
        }
      }

      // If found, advance explore quest progress (complete on single item loot)
      if (questInstance) {
        ctx.db.quest_instance.id.update({
          ...questInstance,
          progress: 1n,
          completed: true,
          completedAt: questInstance.completedAt,
        });

        const qt = ctx.db.quest_template.id.find(questInstance.questTemplateId);
        if (qt) {
          const npc = ctx.db.npc.id.find(qt.npcId);
          const giver = npc ? npc.name : 'the quest giver';
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
            `Quest complete: ${qt.name}. Return to ${giver}.`);
        }
      }

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
        `You found ${questItem.name}!`);

      // 30% aggro chance (deterministic roll)
      const roll = (BigInt(character.id) ^ ctx.timestamp.microsSinceUnixEpoch) % 100n;
      if (roll < 30n) {
        try {
          ensureSpawnsForLocation(ctx, character.locationId);
          // Find an available spawn at the character's location
          let availableSpawn: any = null;
          for (const spawn of ctx.db.enemy_spawn.by_location.filter(character.locationId)) {
            if (spawn.state === 'available') {
              availableSpawn = spawn;
              break;
            }
          }
          if (availableSpawn) {
            const groupId = effectiveGroupId(character);
            const participants = groupId
              ? [...ctx.db.group_member.by_group.filter(groupId)]
                  .map((m: any) => ctx.db.character.id.find(m.characterId))
                  .filter(Boolean)
              : [character];
            startCombatForSpawn(ctx, character, availableSpawn, participants, groupId ?? null);
          }
        } catch (_e) {
          // If aggro fails (safe zone etc.), skip silently
        }
      }
    }
  );

  // pull_named_enemy reducer
  spacetimedb.reducer(
    'pull_named_enemy',
    { characterId: t.u64(), namedEnemyId: t.u64() },
    (ctx: any, args: any) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);

      // Find and validate the named enemy
      const namedEnemy = ctx.db.named_enemy.id.find(args.namedEnemyId);
      if (!namedEnemy) { fail(ctx, character, 'Named enemy not found'); return; }
      if (namedEnemy.characterId !== character.id) { fail(ctx, character, 'That named enemy does not belong to your character'); return; }
      if (!namedEnemy.isAlive) { fail(ctx, character, 'That enemy is not currently alive'); return; }

      // Find the enemy template
      const enemyTemplate = ctx.db.enemy_template.id.find(namedEnemy.enemyTemplateId);
      if (!enemyTemplate) { fail(ctx, character, 'Enemy template not found'); return; }

      // Mark the named enemy as not alive
      ctx.db.named_enemy.id.update({
        ...namedEnemy,
        isAlive: false,
        lastKilledAt: ctx.timestamp,
      });

      // Spawn the named enemy using spawnEnemyWithTemplate
      const spawn = spawnEnemyWithTemplate(ctx, character.locationId, namedEnemy.enemyTemplateId);

      // Start combat for the character's group
      const groupId = effectiveGroupId(character);
      const participants = groupId
        ? [...ctx.db.group_member.by_group.filter(groupId)]
            .map((m: any) => ctx.db.character.id.find(m.characterId))
            .filter(Boolean)
        : [character];
      startCombatForSpawn(ctx, character, spawn, participants, groupId ?? null);

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'combat',
        `You engage ${namedEnemy.name}!`);
    }
  );

  // Turn in a completed quest for rewards
  spacetimedb.reducer('turn_in_quest', {
    characterId: t.u64(),
    questInstanceId: t.u64(),
  }, (ctx: any, args: any) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const qi = ctx.db.quest_instance.id.find(args.questInstanceId);
    if (!qi) { fail(ctx, character, 'Quest not found.'); return; }
    if (qi.characterId !== character.id) { fail(ctx, character, 'Not your quest.'); return; }
    if (!qi.completed) { fail(ctx, character, 'Quest is not yet complete.'); return; }

    // Find the quest template
    const qt = ctx.db.quest_template.id.find(qi.questTemplateId);
    if (!qt) { fail(ctx, character, 'Quest template not found.'); return; }

    // Award XP
    const xpReward = qt.rewardXp || 0n;
    if (xpReward > 0n) {
      ctx.db.character.id.update({
        ...character,
        xp: character.xp + xpReward,
      });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
        `Quest "${qt.name}" complete! +${xpReward} XP`);
    }

    // Award gold if specified
    const goldReward = qt.rewardGold || 0n;
    if (goldReward > 0n) {
      // Re-read character in case XP update changed it
      const freshChar = ctx.db.character.id.find(character.id);
      if (freshChar) {
        ctx.db.character.id.update({
          ...freshChar,
          gold: freshChar.gold + goldReward,
        });
      }
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
        `+${goldReward} gold from quest reward.`);
    }

    // Generate item reward if applicable
    if (qt.rewardType === 'item' && qt.rewardItemName) {
      const itemStats = computeQuestRewardStats(character.level, qt.questType || 'kill');

      const itemTemplate = ctx.db.item_template.insert({
        id: 0n,
        name: qt.rewardItemName,
        slot: itemStats.slot,
        armorType: itemStats.armorType,
        rarity: itemStats.rarity,
        tier: BigInt(Math.max(1, Math.floor(Number(character.level) / 3))),
        isJunk: false,
        vendorValue: BigInt(itemStats.vendorValue),
        damage: BigInt(itemStats.damage),
        armor: BigInt(itemStats.armor),
        str: BigInt(itemStats.str),
        dex: BigInt(itemStats.dex),
        int: BigInt(itemStats.int),
        wis: BigInt(itemStats.wis),
        cha: BigInt(itemStats.cha),
        maxHp: BigInt(itemStats.maxHp),
        maxMana: BigInt(itemStats.maxMana),
        description: qt.rewardItemDesc || undefined,
      });

      ctx.db.item_instance.insert({
        id: 0n,
        templateId: itemTemplate.id,
        ownerCharacterId: character.id,
        quantity: 1n,
      });

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
        `Received: ${qt.rewardItemName}!`);
    }

    // Award NPC affinity for quest completion
    if (qt.npcId) {
      awardNpcAffinity(ctx, character, qt.npcId, 10n);
      // Record quest name in NPC memory for narrative continuity and follow-up chains
      recordQuestCompletion(ctx, character.id, qt.npcId, qt.name);
    }

    // Delete the completed quest instance (free up quest slot)
    ctx.db.quest_instance.id.delete(qi.id);
  });

  // Abandon a quest to free up a quest slot
  spacetimedb.reducer('abandon_quest', {
    characterId: t.u64(),
    questInstanceId: t.u64(),
  }, (ctx: any, args: any) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const qi = ctx.db.quest_instance.id.find(args.questInstanceId);
    if (!qi) { fail(ctx, character, 'Quest not found.'); return; }
    if (qi.characterId !== character.id) { fail(ctx, character, 'Not your quest.'); return; }

    const qt = ctx.db.quest_template.id.find(qi.questTemplateId);
    const questName = qt ? qt.name : 'Unknown Quest';

    // Delete quest instance
    ctx.db.quest_instance.id.delete(qi.id);

    // Small affinity penalty with the quest-giving NPC
    if (qt?.npcId) {
      awardNpcAffinity(ctx, character, qt.npcId, -3n);
    }

    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
      `Quest abandoned: ${questName}. This quest may never be offered again.`);
  });
};
