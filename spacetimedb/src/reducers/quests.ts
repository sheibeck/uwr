import { awardNpcAffinity } from '../helpers/npc_affinity';
import { recordQuestCompletion } from '../helpers/npc_conversation';
import { WEAPON_TYPES } from '../data/mechanical_vocabulary';
import { findItemTemplateByName, getInventorySlotCount, MAX_INVENTORY_SLOTS } from '../helpers/items';
import { awardXp } from '../helpers/combat_rewards';
import { appendNpcDialog } from '../helpers/events';
import { fightRoster, getGroupOrSoloParticipants } from '../helpers/group';
import { activeCombatIdForCharacter } from '../helpers/events';
import { drawGroup, rollEncounter, rosterLevel, startPoolFight } from '../helpers/encounters';
import { DENSITY_RULES } from '../data/density_rules';
import { ambushLine } from '../data/density_lines';
import { MAX_LEVEL } from '../data/xp';
import { npcGender, npcPronouns } from '../data/npc_gender';

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
/** Whether turning in this quest creates an item (rewardType 'item' with a rewardItemName). */
export function questGrantsItem(qt: any): boolean {
  return qt.rewardType === 'item' && !!qt.rewardItemName;
}

/**
 * The name of a new reward template: the quest's item name, unless an item_template already carries that
 * name (case-insensitive, as findItemTemplateByName matches). Starter, material and other seeded templates
 * are found and upserted by name (ensureStarterItemTemplates, grantStarterItems, crafting), so a reward
 * sharing a name could be overwritten by the starter upsert or handed out in place of the starter item.
 * On a clash the reward becomes "<Giver>'s <name>" (a number appended if that is taken too).
 */
export function questRewardItemName(ctx: any, qt: any): string {
  const base = String(qt.rewardItemName);
  if (!findItemTemplateByName(ctx, base)) return base;
  const npc = qt.npcId ? ctx.db.npc.id.find(qt.npcId) : undefined;
  const stem = npc ? `${npc.name}'s ${base}` : `Quest-won ${base}`;
  let name = stem;
  for (let n = 2; findItemTemplateByName(ctx, name); n++) name = `${stem} ${n}`;
  return name;
}

export function grantQuestItemReward(ctx: any, character: any, qt: any, appendPrivateEvent: any) {
  if (!questGrantsItem(qt)) return undefined;
  const itemStats = computeQuestRewardStats(character.level, qt.questType || 'kill');
  const itemName = questRewardItemName(ctx, qt);

  const itemTemplate = ctx.db.item_template.insert({
    id: 0n,
    name: itemName,
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
    `Received: ${itemName}!`);
  return instance;
}

/**
 * Awards a quest's xp through awardXp so a crossed level threshold adds pending levels, as combat xp does.
 * awardXp scales by level difference; passing the character's own level gives the 100% modifier, so the
 * amount is exactly what the quest promised. At MAX_LEVEL awardXp grants nothing; the promised xp is
 * still added there (no level-up is possible), as quest xp always was.
 */
export function awardQuestXp(ctx: any, character: any, xp: bigint): { xpGained: bigint; leveledUp: boolean; pendingLevels?: bigint } {
  if (xp <= 0n) return { xpGained: 0n, leveledUp: false };
  if (character.level >= MAX_LEVEL) {
    ctx.db.character.id.update({ ...character, xp: character.xp + xp });
    return { xpGained: xp, leveledUp: false };
  }
  return awardXp(ctx, character, character.level, xp);
}

/**
 * The NPC a completed quest is turned in to: a delivery quest's recipient (targetNpcId) when it has one,
 * otherwise the giver (npcId). Undefined when the quest has neither.
 */
export function questTurnInNpcId(qt: any): bigint | undefined {
  if ((qt.questType ?? 'kill') === 'delivery' && qt.targetNpcId) return qt.targetNpcId;
  return qt.npcId || undefined;
}

/** Whether a quest instance has been turned in: completedAt is set only by turnInCompletedQuest. */
export function isQuestTurnedIn(qi: any): boolean {
  return qi.completedAt !== undefined && qi.completedAt !== null;
}

function enemyNameOf(ctx: any, qt: any): string | undefined {
  return qt.targetEnemyTemplateId ? ctx.db.enemy_template.id.find(qt.targetEnemyTemplateId)?.name : undefined;
}

function locationNameOf(ctx: any, locationId: bigint | undefined): string | undefined {
  return locationId ? ctx.db.location.id.find(locationId)?.name : undefined;
}

function npcNameOf(ctx: any, npcId: bigint | undefined): string | undefined {
  return npcId ? ctx.db.npc.id.find(npcId)?.name : undefined;
}

/**
 * The objective sentence of a quest, worded for its type (Slay / Hunt and collect / Explore / Deliver /
 * Defeat / Gather / Escort / Interact / Discover, the verbs the quests list uses).
 */
export function questObjectiveText(ctx: any, qt: any): string {
  const count = qt.requiredCount ?? 1n;
  const enemy = enemyNameOf(ctx, qt);
  const item = qt.targetItemName as string | undefined;
  const place = locationNameOf(ctx, qt.targetLocationId);
  switch (qt.questType ?? 'kill') {
    case 'kill':
      return `Slay ${count} ${enemy ?? 'creatures'}(s).`;
    case 'kill_loot':
      return `Hunt ${enemy ?? 'creatures'}(s) and collect ${count} ${item ?? 'item'}(s).`;
    case 'explore':
      return place ? `Explore ${place}.` : 'Explore the place named in the quest.';
    case 'delivery': {
      const recipient = npcNameOf(ctx, qt.targetNpcId);
      return `Deliver ${item ?? 'the package'}${recipient ? ` to ${recipient}` : ''}${place ? ` at ${place}` : ''}.`;
    }
    case 'boss_kill':
      return `Defeat ${item ?? enemy ?? 'the named foe'}${place ? ` at ${place}` : ''}.`;
    case 'gather':
      return `Gather ${count} ${item ?? 'resource'}(s).`;
    case 'escort': {
      const charge = npcNameOf(ctx, qt.targetNpcId);
      return `Escort ${charge ?? 'your charge'}${place ? ` to ${place}` : ''}.`;
    }
    case 'interact':
      return `Interact with ${item ?? 'the object named in the quest'}${place ? ` at ${place}` : ''}.`;
    case 'discover':
      return `Discover ${item ?? place ?? 'the secret named in the quest'}.`;
    default:
      return `Complete ${qt.name}.`;
  }
}

/**
 * The line an NPC says (and the Journal keeps) when a quest is turned in to them, worded for the quest type.
 * The kill and delivery wording is what hailing used to write.
 */
export function questTurnInJournalLine(ctx: any, qt: any, npc: any): string {
  const count = qt.requiredCount ?? 1n;
  const item = qt.targetItemName as string | undefined;
  const place = locationNameOf(ctx, qt.targetLocationId);
  let said: string;
  switch (qt.questType ?? 'kill') {
    case 'kill':
      said = `Well done! You have slain ${count} ${enemyNameOf(ctx, qt) ?? 'creatures'}(s).`;
      break;
    case 'kill_loot':
      said = `Well done! You have brought me ${count} ${item ?? 'item'}(s).`;
      break;
    case 'boss_kill':
      said = `It is done, then. ${item ?? enemyNameOf(ctx, qt) ?? 'The beast'} is dead. Well done!`;
      break;
    case 'explore':
      said = place ? `So you found your way to ${place}. Well done!` : 'So you found your way there. Well done!';
      break;
    case 'delivery':
      said = item ? `Ah, you've brought ${item}. Thank you.` : "Ah, you've brought it. Thank you.";
      break;
    case 'gather':
      said = `You have gathered ${count} ${item ?? 'resource'}(s). Well done!`;
      break;
    case 'escort':
      said = 'You saw the journey through. Thank you.';
      break;
    case 'interact':
      said = "You've seen to it. Thank you.";
      break;
    case 'discover':
      said = `You found ${item ?? place ?? 'it'}, then. Well done!`;
      break;
    default:
      said = `Well done! "${qt.name}" is finished.`;
  }
  return `${npc.name} says, "${said}"`;
}

/**
 * Turns in a completed quest: the one reward path shared by the turn_in_quest reducer, the
 * "turn in <quest>" intent and hailing the turn-in NPC (commands.ts hailNpc), so all behave identically.
 * The caller has already checked that qi is the character's completed instance of qt. Awards xp, gold,
 * the item reward and affinity with the turn-in NPC (questTurnInNpcId), records the quest in the giver's
 * memory (and the recipient's, for a delivery to someone else), writes the NPC's line in the Journal,
 * removes the quest's package rows (quest_item) and marks the instance turned in (completedAt): the row
 * stays as the character's quest history and is never active again.
 *
 * Refuses (visible message, nothing applied) when the instance is already turned in (completedAt set),
 * when the character is not at the turn-in NPC's location, or when the quest's item reward would not fit
 * in their bags; in the last two the quest stays ready to turn in. Returns whether the quest was turned in.
 */
export function turnInCompletedQuest(ctx: any, character: any, qi: any, qt: any, appendPrivateEvent: any, fail: any): boolean {
  // Re-read the row: a turned-in quest (completedAt set) is history and is never paid twice.
  const row = ctx.db.quest_instance.id.find(qi.id) ?? qi;
  if (isQuestTurnedIn(row)) {
    fail(ctx, character, `You've already turned in ${qt.name}.`);
    return false;
  }

  const turnInNpcId = questTurnInNpcId(qt);
  const npc = turnInNpcId ? ctx.db.npc.id.find(turnInNpcId) : undefined;

  // The quest is turned in to its giver (a delivery to its recipient), where that NPC stands.
  if (npc && npc.locationId !== character.locationId) {
    fail(ctx, character, `You must return to ${npc.name} at ${ctx.db.location.id.find(npc.locationId)?.name || `${npcPronouns(npcGender(npc)).possessive} post`} to turn in this quest.`);
    return false;
  }

  // The item reward is a new, non-stackable item: it needs a free bag slot (the take_loot rule).
  // Checked before anything is awarded, so the player can free a slot and turn in again.
  if (questGrantsItem(qt) && getInventorySlotCount(ctx, character.id) >= MAX_INVENTORY_SLOTS) {
    const giver = npc
      ? `${npc.name} holds out your reward for "${qt.name}", but your pack is full and you cannot take it.`
      : `Your reward for "${qt.name}" waits, but your pack is full and you cannot take it.`;
    fail(ctx, character, `${giver} Free a space in your pack and turn the quest in again.`);
    return false;
  }

  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
    `You present your completed quest "${qt.name}" to ${npc?.name || 'the quest giver'}.`);

  // Award XP (through awardXp, so crossing a level threshold earns a pending level)
  const xpReward = qt.rewardXp || 0n;
  if (xpReward > 0n) {
    const freshChar = ctx.db.character.id.find(character.id)!;
    const reward = awardQuestXp(ctx, freshChar, xpReward);
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
      `Quest "${qt.name}" complete! +${reward.xpGained} XP`);
    if (reward.leveledUp) {
      // Same wording as a combat level-up (reducers/combat.ts); the level_up reducer applies it.
      const pending = reward.pendingLevels ?? 1n;
      const targetLevel = freshChar.level + 1n;
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        pending > 1n
          ? `You have ${pending} levels pending (next: level ${targetLevel})! Click [Level Up] when ready.`
          : `You can advance to level ${targetLevel}! Click [Level Up] when ready.`);
    }
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

  // NPC affinity for the completion, with the NPC who accepts it
  if (turnInNpcId) {
    awardNpcAffinity(ctx, ctx.db.character.id.find(character.id)!, turnInNpcId, 10n);
  }
  // Quest name in the giver's memory, for narrative continuity and follow-up chains; a delivery
  // recipient remembers it too.
  if (qt.npcId) recordQuestCompletion(ctx, character.id, qt.npcId, qt.name);
  if (turnInNpcId && turnInNpcId !== qt.npcId) recordQuestCompletion(ctx, character.id, turnInNpcId, qt.name);

  // The NPC's line in the Journal, worded for the quest type
  if (npc) appendNpcDialog(ctx, character.id, npc.id, questTurnInJournalLine(ctx, qt, npc));

  // The delivered package (and any other quest_item row of this quest) is spent
  for (const item of [...ctx.db.quest_item.by_character.filter(character.id)]) {
    if (item.questTemplateId === qt.id) ctx.db.quest_item.id.delete(item.id);
  }

  // Keep the instance as history: completedAt marks it turned in, so no path pays or advances it again
  ctx.db.quest_instance.id.update({ ...row, completedAt: ctx.timestamp });
  return true;
}

/**
 * Turns in every completed, not-yet-turned-in quest of the character that this NPC accepts (the giver, or a
 * delivery's recipient: questTurnInNpcId) through turnInCompletedQuest, so hailing an NPC gives the same
 * rewards as turn_in_quest and the "turn in" intent. Shared by the hail_npc reducer (commands.ts hailNpc) and
 * the "hail / talk / speak <npc>" intent. A refusal (full bags) shows the NPC's in-voice message and leaves
 * the quest ready to turn in. Returns whether at least one quest was turned in; callers skip the greeting then.
 */
export function turnInQuestsAtNpc(ctx: any, character: any, npc: any, appendPrivateEvent: any, fail: any): boolean {
  const readyHere = [...ctx.db.quest_instance.by_character.filter(character.id)]
    .filter((qi: any) => qi.completed && !isQuestTurnedIn(qi))
    .map((qi: any) => ({ qi, qt: ctx.db.quest_template.id.find(qi.questTemplateId) }))
    .filter(({ qt }: any) => qt && questTurnInNpcId(qt) === npc.id);
  let turnedIn = false;
  for (const { qi, qt } of readyHere) {
    if (turnInCompletedQuest(ctx, character, qi, qt, appendPrivateEvent, fail)) turnedIn = true;
  }
  return turnedIn;
}

/**
 * Picks up a discovered quest item (a delivery's package, an explore quest's object): the one path shared by
 * the loot_quest_item reducer and the "loot <item>" intent. The caller has validated the row (the
 * character's own, discovered, not yet looted). Marks it looted, completes the character's matching
 * unfinished quest instance (a turned-in or completed row is never touched), says so, and then rolls a
 * quest-item ambush from the place's density pools (Phase 51.3.1.1 Plan 11, D-13): the seeded
 * encounter roll of helpers/encounters.ts (phase 'aggro', factor QUEST_ITEM_AMBUSH_FACTOR_PCT, the
 * roster's lowest level). A safe place, a wiped-out place or a character already fighting never
 * ambushes; a hit draws a group (origin 'ambush_other') with an ambush line. A failed fight start is
 * logged and skipped. Without `aggro.startCombat` (the "loot <item>" intent's bag until intent.ts
 * passes it) the pickup draws no ambush.
 */
export function pickUpQuestItem(
  ctx: any,
  character: any,
  questItem: any,
  appendPrivateEvent: any,
  aggro: { ensurePoolsForLocation: any; effectiveGroupId: any; startCombat?: any; startCombatForSpawn?: any },
): void {
  ctx.db.quest_item.id.update({ ...questItem, looted: true });

  // Find the matching quest instance (not completed, matching template)
  let questInstance: any = null;
  for (const qi of ctx.db.quest_instance.by_character.filter(character.id)) {
    if (qi.completed) continue;
    if (qi.questTemplateId === questItem.questTemplateId) {
      questInstance = qi;
      break;
    }
  }

  // Picking the item up completes the quest's objective
  if (questInstance) {
    ctx.db.quest_instance.id.update({ ...questInstance, progress: 1n, completed: true });

    const qt = ctx.db.quest_template.id.find(questInstance.questTemplateId);
    if (qt) {
      const turnInNpcId = questTurnInNpcId(qt);
      const npc = turnInNpcId ? ctx.db.npc.id.find(turnInNpcId) : undefined;
      const giver = npc ? npc.name : 'the quest giver';
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
        `Quest complete: ${qt.name}. Return to ${giver}.`);
    }
  }

  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest', `You found ${questItem.name}!`);

  questItemAmbush(ctx, character, aggro);
}

/**
 * The quest-item ambush (D-13): one seeded pool roll at the character's place, then the drawn group.
 * Never at a safe place, never for a character already in a fight, never without aggro.startCombat.
 */
function questItemAmbush(
  ctx: any,
  character: any,
  aggro: { ensurePoolsForLocation: any; effectiveGroupId: any; startCombat?: any },
): void {
  if (typeof aggro.startCombat !== 'function') return;
  if (activeCombatIdForCharacter(ctx, character.id) !== null) return;
  const location = ctx.db.location.id.find(character.locationId);
  if (!location || location.isSafe) return;
  try {
    aggro.ensurePoolsForLocation(ctx, character.locationId);
    const now: bigint = ctx.timestamp.microsSinceUnixEpoch;
    const candidates = getGroupOrSoloParticipants(ctx, character);
    const roster = fightRoster(character, candidates, (characterId: bigint) => activeCombatIdForCharacter(ctx, characterId) !== null);
    const level = rosterLevel(roster);
    const hit = rollEncounter(ctx, {
      locationId: character.locationId,
      isSafe: false,
      partyLevel: level,
      phase: 'aggro',
      leaderId: character.id,
      now,
      factorPct: DENSITY_RULES.QUEST_ITEM_AMBUSH_FACTOR_PCT,
    });
    if (!hit) return;
    const drawn = drawGroup(ctx, { pool: hit.pool, family: hit.family, partyLevel: level, seed: hit.seed });
    if (drawn.length === 0) return;
    const family = hit.family;
    startPoolFight({ startCombat: aggro.startCombat }, ctx, {
      leader: character,
      candidates,
      groupId: aggro.effectiveGroupId(character) ?? null,
      pool: hit.pool,
      family,
      drawn,
      originKind: 'ambush_other',
      line: {
        kind: 'ambush',
        text: ambushLine({
          phase: 'other',
          party: roster.length > 1,
          placeName: location.name,
          count: drawn.length,
          singular: family.singularNoun,
          plural: family.pluralNoun,
          verb: family.ambushVerb ?? '',
          rest: family.ambushRest ?? '',
        }),
      },
    });
  } catch (e) {
    // The pickup stands; the ambush is skipped.
    console.error(`pickUpQuestItem: quest-item ambush failed for character ${character.id}: ${e}`);
  }
}

export const registerQuestReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    requireCharacterOwnedBy,
    appendPrivateEvent,
    fail,
    ensurePoolsForLocation,
    startCombat,
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

      pickUpQuestItem(ctx, character, questItem, appendPrivateEvent, { ensurePoolsForLocation, effectiveGroupId, startCombat });
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
      // Same fight rule as start_combat: only online members at this place come in (CR-02).
      const participants = getGroupOrSoloParticipants(ctx, character);
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

    // A turned-in quest is history, not an open quest
    if (isQuestTurnedIn(qi)) { fail(ctx, character, `You've already turned in ${questName}; it cannot be abandoned.`); return; }

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
