import { awardNpcAffinity } from '../helpers/npc_affinity';
import { recordQuestCompletion } from '../helpers/npc_conversation';
import { WEAPON_TYPES } from '../data/mechanical_vocabulary';

// Slots the quest reward cycles through by player level. All are EQUIPMENT_SLOTS (helpers/items.ts);
// 'mainHand' is the weapon slot.
export const QUEST_REWARD_SLOTS = ['head', 'chest', 'legs', 'boots', 'hands', 'mainHand'] as const;

export function computeQuestRewardStats(playerLevel: bigint, questType: string) {
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
  const slot = QUEST_REWARD_SLOTS[levelNum % QUEST_REWARD_SLOTS.length];
  const isWeapon = slot === 'mainHand';

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
    isWeapon,
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

// Heaviest armor first, as grantStarterItems picks starter armor.
const REWARD_ARMOR_ORDER = ['plate', 'chain', 'leather', 'cloth'] as const;

/** The heaviest armor type the character is proficient in; 'cloth' when none is listed (everyone wears cloth). */
export function questRewardArmorType(character: any): string {
  const profs = String(character.armorProficiencies ?? '').split(',').map((p) => p.trim());
  return REWARD_ARMOR_ORDER.find((a) => profs.includes(a)) ?? 'cloth';
}

/** The character's first proficient weapon type; 'sword' when none is listed (legacy characters, allowedClasses 'any'). */
export function questRewardWeaponType(character: any): string {
  const profs = String(character.weaponProficiencies ?? '').split(',').map((p) => p.trim());
  return profs.find((p) => (WEAPON_TYPES as readonly string[]).includes(p)) ?? 'sword';
}

/**
 * Creates the item reward of an item-reward quest (qt.rewardType 'item' with a rewardItemName) for the
 * character who turned it in: an item_template row with every schema column, typed so that character can
 * equip it (armor or weapon type from their proficiencies, allowedClasses 'any', requiredLevel = their
 * level), and one item_instance in their bags. Does nothing for other quests.
 */
export function grantQuestItemReward(ctx: any, character: any, qt: any, appendPrivateEvent: any) {
  if (qt.rewardType !== 'item' || !qt.rewardItemName) return undefined;
  const itemStats = computeQuestRewardStats(character.level, qt.questType || 'kill');

  const itemTemplate = ctx.db.item_template.insert({
    id: 0n,
    name: qt.rewardItemName,
    slot: itemStats.slot,
    armorType: itemStats.isWeapon ? 'none' : questRewardArmorType(character),
    rarity: itemStats.rarity,
    tier: BigInt(Math.max(1, Math.floor(Number(character.level) / 3))),
    isJunk: false,
    vendorValue: BigInt(itemStats.vendorValue),
    requiredLevel: character.level,
    allowedClasses: 'any',
    strBonus: BigInt(itemStats.str),
    dexBonus: BigInt(itemStats.dex),
    chaBonus: BigInt(itemStats.cha),
    wisBonus: BigInt(itemStats.wis),
    intBonus: BigInt(itemStats.int),
    hpBonus: BigInt(itemStats.maxHp),
    manaBonus: BigInt(itemStats.maxMana),
    armorClassBonus: BigInt(itemStats.armor),
    magicResistanceBonus: 0n,
    // Starter weapons carry dps = base damage + 1 (ensureStarterItemTemplates).
    weaponBaseDamage: BigInt(itemStats.damage),
    weaponDps: itemStats.isWeapon ? BigInt(itemStats.damage + 1) : 0n,
    weaponType: itemStats.isWeapon ? questRewardWeaponType(character) : '',
    stackable: false,
    wellFedDurationMicros: 0n,
    wellFedBuffType: '',
    wellFedBuffMagnitude: 0n,
    description: qt.rewardItemDesc || undefined,
  });

  const instance = ctx.db.item_instance.insert({
    id: 0n,
    templateId: itemTemplate.id,
    ownerCharacterId: character.id,
    equippedSlot: undefined,
    quantity: 1n,
    qualityTier: itemStats.rarity,
  });

  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
    `Received: ${qt.rewardItemName}!`);
  return instance;
}

/**
 * Turns in a completed quest: the one reward path shared by the turn_in_quest reducer and the
 * "turn in <quest>" intent, so both behave identically. The caller has already checked that qi is the
 * character's completed instance of qt. Awards xp, gold, the item reward and NPC affinity, records the
 * quest in the giver's memory, and removes the quest instance.
 */
export function turnInCompletedQuest(ctx: any, character: any, qi: any, qt: any, appendPrivateEvent: any, _fail: any): boolean {
  const npc = qt.npcId ? ctx.db.npc.id.find(qt.npcId) : undefined;

  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
    `You present your completed quest "${qt.name}" to ${npc?.name || 'the quest giver'}.`);

  // Award XP
  const xpReward = qt.rewardXp || 0n;
  if (xpReward > 0n) {
    const freshChar = ctx.db.character.id.find(character.id)!;
    ctx.db.character.id.update({ ...freshChar, xp: freshChar.xp + xpReward });
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
      `Quest "${qt.name}" complete! +${xpReward} XP`);
  }

  // Award gold
  const goldReward = qt.rewardGold || 0n;
  if (goldReward > 0n) {
    const freshChar = ctx.db.character.id.find(character.id)!;
    ctx.db.character.id.update({ ...freshChar, gold: freshChar.gold + goldReward });
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
      `+${goldReward} gold from quest reward.`);
  }

  // Award the item reward (item-reward quests only)
  grantQuestItemReward(ctx, ctx.db.character.id.find(character.id)!, qt, appendPrivateEvent);

  if (qt.npcId) {
    // NPC affinity for the completion
    awardNpcAffinity(ctx, ctx.db.character.id.find(character.id)!, qt.npcId, 10n);
    // Quest name in the giver's memory, for narrative continuity and follow-up chains
    recordQuestCompletion(ctx, character.id, qt.npcId, qt.name);
  }

  // Delete the completed quest instance (frees the quest slot)
  ctx.db.quest_instance.id.delete(qi.id);
  return true;
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

    turnInCompletedQuest(ctx, character, qi, qt, appendPrivateEvent, fail);
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
