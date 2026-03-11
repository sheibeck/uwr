import { scheduledReducers } from '../schema/tables';
import {
  calculateStatScaledAutoAttack, calculateCritChance, getCritMultiplier,
  TANK_THREAT_MULTIPLIER, HEALER_THREAT_MULTIPLIER, SUMMONER_THREAT_MULTIPLIER,
  SUMMONER_PET_INITIAL_AGGRO, HEALING_THREAT_PERCENT, AOE_DAMAGE_MULTIPLIER,
  getAbilityStatScaling, getAbilityMultiplier,
  statOffset, BLOCK_CHANCE_BASE, BLOCK_CHANCE_DEX_PER_POINT,
  BLOCK_MITIGATION_BASE, BLOCK_MITIGATION_STR_PER_POINT, WIS_PULL_BONUS_PER_POINT,
  EFFECT_TICK_SECONDS, DOT_LIFE_DRAIN_PERCENT,
} from '../data/combat_scaling';
import { STARTER_ITEM_NAMES } from '../data/combat_constants';
import { ScheduleAt } from 'spacetimedb';
import { scheduleCombatTick } from '../helpers/combat';
import { ESSENCE_TIER_THRESHOLDS, MODIFIER_REAGENT_THRESHOLDS, CRAFTING_MODIFIER_DEFS } from '../data/crafting_rules';
import { awardRenown, awardServerFirst, calculatePerkBonuses, getPerkBonusByField } from '../helpers/renown';
import { addCharacterEffect, addEnemyEffect } from '../helpers/combat';
import { applyPerkProcs } from '../helpers/combat_perks';
import { partyMembersInLocation } from '../helpers/character';
import { getLocationSpawnCap } from '../helpers/location';
import { RENOWN_GAIN } from '../data/renown_data';
import { rollQualityTier, rollQualityForDrop, generateAffixData, buildDisplayName, getEquippedBonuses } from '../helpers/items';
import { incrementWorldStat } from '../helpers/world_events';
import { WORLD_EVENT_DEFINITIONS } from '../data/world_event_data';
import {
  awardEventContribution,
  advanceEventKillObjectives,
  getEventSpawnTemplateIds,
  buildFallenNamesSuffix,
  createCorpsesForDead,
  applyDeathPenalties,
  resetSpawnAfterCombat,
} from '../helpers/combat_rewards';

const AUTO_ATTACK_INTERVAL = 5_000_000n;
const RETRY_ATTACK_INTERVAL = 1_000_000n;
const PET_BASE_DAMAGE = 3n;
const DEFAULT_AI_CHANCE = 50;
const DEFAULT_AI_WEIGHT = 50;
const DEFAULT_AI_RANDOMNESS = 15;
const PULL_DELAY_CAREFUL = 2_000_000n;
const PULL_DELAY_BODY = 1_000_000n;
const PULL_ADD_DELAY_ROUNDS = 2n;
const PULL_ALLOW_EXTERNAL_ADDS = true;
const ENEMY_RESPAWN_MICROS = 5n * 60n * 1_000_000n;

const refreshSpawnGroupCount = (ctx: any, spawnId: bigint) => {
  const spawn = ctx.db.enemy_spawn.id.find(spawnId);
  if (!spawn) return;
  const remaining = [...ctx.db.enemy_spawn_member.by_spawn.filter(spawnId)].length;
  ctx.db.enemy_spawn.id.update({
    ...spawn,
    groupCount: BigInt(remaining),
    state: remaining > 0 ? spawn.state : 'depleted',
  });
};

const pickRoleTemplate = (ctx: any, templateId: bigint, seed: bigint) => {
  const options = [...ctx.db.enemy_role_template.by_template.filter(templateId)];
  if (options.length === 0) return null;
  const index = Number(seed % BigInt(options.length));
  return options[index] ?? options[0];
};

const takeSpawnMember = (ctx: any, spawnId: bigint) => {
  const members = [...ctx.db.enemy_spawn_member.by_spawn.filter(spawnId)];
  if (members.length === 0) return null;
  const index = Number(
    (ctx.timestamp.microsSinceUnixEpoch + spawnId) % BigInt(members.length)
  );
  const member = members[index];
  if (!member) return null;
  ctx.db.enemy_spawn_member.id.delete(member.id);
  refreshSpawnGroupCount(ctx, spawnId);
  return member;
};

const addEnemyToCombat = (
  deps: any,
  ctx: any,
  combat: any,
  spawnToUse: any,
  participants: any[],
  consumeSpawnCount: boolean = true,
  roleTemplateId?: bigint
) => {
  const { SenderError, computeEnemyStats } = deps;
  const template = ctx.db.enemy_template.id.find(spawnToUse.enemyTemplateId);
  if (!template) throw new SenderError('Enemy template missing');

  let roleTemplate = roleTemplateId
    ? ctx.db.enemy_role_template.id.find(roleTemplateId)
    : null;
  if (!roleTemplate && consumeSpawnCount) {
    const member = takeSpawnMember(ctx, spawnToUse.id);
    if (member) {
      roleTemplate = ctx.db.enemy_role_template.id.find(member.roleTemplateId);
    }
  }
  if (!roleTemplate) {
    roleTemplate = pickRoleTemplate(
      ctx,
      template.id,
      ctx.timestamp.microsSinceUnixEpoch + spawnToUse.id
    );
  }

  const { maxHp, attackDamage, armorClass } = computeEnemyStats(
    template,
    roleTemplate,
    participants
  );
  const displayName = roleTemplate?.displayName ?? template.name;
  const combatEnemy = ctx.db.combat_enemy.insert({
    id: 0n,
    combatId: combat.id,
    spawnId: spawnToUse.id,
    enemyTemplateId: template.id,
    enemyRoleTemplateId: roleTemplate?.id,
    displayName,
    currentHp: maxHp,
    maxHp,
    attackDamage,
    armorClass,
    aggroTargetCharacterId: undefined,
    nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + 1_000_000n + (spawnToUse.id % 2_000_000n),
  });

  for (const p of participants) {
    const charId = (p as any).characterId ?? p.id;
    ctx.db.aggro_entry.insert({
      id: 0n,
      combatId: combat.id,
      enemyId: combatEnemy.id,
      characterId: charId,
      petId: undefined,
      value: 0n,
    });
    const current = ctx.db.character.id.find(charId);
    if (current && !current.combatTargetEnemyId) {
      ctx.db.character.id.update({ ...current, combatTargetEnemyId: combatEnemy.id });
    }
  }

  if (consumeSpawnCount) {
    const refreshed = ctx.db.enemy_spawn.id.find(spawnToUse.id);
    if (refreshed) {
      ctx.db.enemy_spawn.id.update({
        ...refreshed,
        state: 'engaged',
        lockedCombatId: combat.id,
      });
    }
  }

  return combatEnemy;
};

export const startCombatForSpawn = (
  deps: any,
  ctx: any,
  leader: any,
  spawnToUse: any,
  participants: any[],
  groupId: bigint | null
) => {
  const { appendPrivateEvent } = deps;
  const combat = ctx.db.combat_encounter.insert({
    id: 0n,
    locationId: leader.locationId,
    groupId: groupId ?? undefined,
    leaderCharacterId: groupId ? leader.id : undefined,
    state: 'active',
    addCount: 0n,
    pendingAddCount: 0n,
    pendingAddAtMicros: undefined,
    createdAt: ctx.timestamp,
  });

  addEnemyToCombat(deps, ctx, combat, spawnToUse, participants);

  for (const p of participants) {
    const pWeapon = deps.getEquippedWeaponStats(ctx, p.id);
    ctx.db.combat_participant.insert({
      id: 0n,
      combatId: combat.id,
      characterId: p.id,
      status: 'active',
      nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + pWeapon.speed,
    });
  }

  for (const p of participants) {
    appendPrivateEvent(
      ctx,
      p.id,
      p.ownerUserId,
      'combat',
      `Combat begins against ${spawnToUse.name}.`
    );
  }

  // Bring any pre-summoned pets into combat by setting their combatId
  for (const p of participants) {
    for (const ap of [...ctx.db.active_pet.by_character.filter(p.id)]) {
      const pet = ctx.db.active_pet.id.update({
        ...ap,
        combatId: combat.id,
        nextAbilityAt: ap.abilityKey ? ctx.timestamp.microsSinceUnixEpoch : undefined,
        nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + AUTO_ATTACK_INTERVAL,
        targetEnemyId: undefined,
      });
      if (p.className?.toLowerCase() === 'summoner') {
        // Single-target taunt: only generate initial aggro against the primary target
        // (the spawn combat was initiated against), not every enemy in the encounter.
        const primaryEnemy = [...ctx.db.combat_enemy.by_combat.filter(combat.id)]
          .find(en => en.spawnId === spawnToUse.id && en.currentHp > 0n);
        if (primaryEnemy) {
          ctx.db.aggro_entry.insert({
            id: 0n,
            combatId: combat.id,
            enemyId: primaryEnemy.id,
            characterId: p.id,
            petId: ap.id,
            value: SUMMONER_PET_INITIAL_AGGRO,
          });
        }
      }
    }
  }

  // Static combat intro messages -- sardonic Keeper of Knowledge voice
  const COMBAT_INTRO_MESSAGES = [
    'The world holds its breath. Or perhaps it simply does not care. Either way, steel is about to meet flesh.',
    'Another battle. The Keeper yawns, but watches nonetheless -- one must have hobbies.',
    'The air thickens with the promise of violence. How delightfully predictable.',
    'And so it begins again. The eternal dance of the ambitious and the soon-to-be-deceased.',
    'The world pauses to witness what will almost certainly be a disappointing spectacle.',
  ];

  // Deterministic selection using combat ID
  const introIndex = Number(combat.id % BigInt(COMBAT_INTRO_MESSAGES.length));
  const introMessage = COMBAT_INTRO_MESSAGES[introIndex];

  // Broadcast static intro to all participants
  for (const p of participants) {
    appendPrivateEvent(ctx, p.id, p.ownerUserId, 'combat_narration', introMessage);
    appendPrivateEvent(ctx, p.id, p.ownerUserId, 'system', 'The world grows still around you.');
  }

  // Start combat immediately -- no LLM delay
  scheduleCombatTick(ctx, combat.id);

  return combat;
};

export const registerCombatReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    requireAdmin,
    ScheduleAt,
    CombatLoopTick,
    HealthRegenTick,
    EffectTick,
    HotTick,
    CastTick,
    requireCharacterOwnedBy,
    appendPrivateEvent,
    appendGroupEvent,
    activeCombatIdForCharacter,
    ensureAvailableSpawn,
    computeEnemyStats,
    getEnemyAttackSpeed,
    scheduleCombatTick,
    sumCharacterEffect,
    sumEnemyEffect,
    applyArmorMitigation,
    applyVariance,
    abilityCooldownMicros,
    abilityCastMicros,
    ensureCastTickScheduled,
    executeAbilityAction,
    rollAttackOutcome,
    EnemyAbility,
    CombatEnemyCast,
    CombatEnemyCooldown,
    CombatPendingAdd,
    getGroupOrSoloParticipants,
    effectiveGroupId,

    hasShieldEquipped,
    EnemyRespawnTick,
    PullState,
    PullTick,
    logPrivateAndGroup,
    fail,
    grantFactionStandingForKill,
    calculateFleeChance,
    RoundTimerTick,
    getEquippedWeaponStats,
  } = deps;
  const failCombat = (ctx: any, character: any, message: string) =>
    fail(ctx, character, message, 'combat');

  /** Clamp a bigint value to [min, max]. Replaces repeated inline IIFE patterns. */
  const clampBigInt = (value: bigint, min: bigint, max: bigint): bigint =>
    value < min ? min : value > max ? max : value;

  const logGroupEvent = (
    ctx: any,
    combatId: bigint,
    characterId: bigint,
    kind: string,
    message: string
  ) => {
    const combat = ctx.db.combat_encounter.id.find(combatId);
    if (!combat?.groupId) return;
    appendGroupEvent(ctx, combat.groupId, characterId, kind, message);
  };

  const clearCharacterEffectsOnDeath = (ctx: any, character: any) => {
    for (const effect of ctx.db.character_effect.by_character.filter(character.id)) {
      if (effect.effectType === 'hp_bonus') {
        const nextMax = character.maxHp > effect.magnitude ? character.maxHp - effect.magnitude : 0n;
        const nextHp = character.hp > nextMax ? nextMax : character.hp;
        ctx.db.character.id.update({ ...character, maxHp: nextMax, hp: nextHp });
      }
      ctx.db.character_effect.id.delete(effect.id);
    }
    // Clear any pending casts
    for (const cast of ctx.db.character_cast.by_character.filter(character.id)) {
      ctx.db.character_cast.id.delete(cast.id);
    }
  };

  const markParticipantDead = (
    ctx: any,
    participant: any,
    character: any,
    enemyName: string
  ) => {
    const current = ctx.db.combat_participant.id.find(participant.id);
    if (!current || current.status === 'dead') return;
    ctx.db.combat_participant.id.update({ ...participant, status: 'dead' });
    clearCharacterEffectsOnDeath(ctx, character);
    logPrivateAndGroup(
      ctx,
      character,
      'combat',
      `You have died. Killed by ${enemyName}.`
    );
    for (const pet of ctx.db.active_pet.by_combat.filter(participant.combatId)) {
      if (pet.characterId === character.id) {
        ctx.db.active_pet.id.delete(pet.id);
      }
    }
  };

  const clearCombatArtifacts = (ctx: any, combatId: bigint) => {
    const loopTable = ctx.db.combat_loop_tick;
    if (loopTable && loopTable.iter && loopTable.scheduledId) {
      for (const row of loopTable.iter()) {
        if (row.combatId !== combatId) continue;
        loopTable.scheduledId.delete(row.scheduledId);
      }
    }
    // Clean up round-based combat artifacts
    const roundTimerTable = ctx.db.round_timer_tick;
    if (roundTimerTable && roundTimerTable.iter) {
      for (const row of roundTimerTable.iter()) {
        if (row.combatId !== combatId) continue;
        roundTimerTable.scheduledId.delete(row.scheduledId);
      }
    }
    for (const row of ctx.db.combat_action.by_combat.filter(combatId)) {
      ctx.db.combat_action.id.delete(row.id);
    }
    for (const row of ctx.db.combat_round.by_combat.filter(combatId)) {
      ctx.db.combat_round.id.delete(row.id);
    }
    const participantIds: bigint[] = [];
    for (const row of ctx.db.combat_participant.by_combat.filter(combatId)) {
      participantIds.push(row.characterId);
      ctx.db.combat_participant.id.delete(row.id);
    }
    for (const pet of ctx.db.active_pet.by_combat.filter(combatId)) {
      if (pet.currentHp > 0n) {
        // Surviving pet returns to out-of-combat state.
        // Heal pets arm their out-of-combat tick immediately on combat exit.
        ctx.db.active_pet.id.update({
          ...pet,
          combatId: undefined,
          nextAbilityAt: (pet.abilityKey === 'pet_heal' || pet.abilityKey === 'pet_aoe_heal') ? ctx.timestamp.microsSinceUnixEpoch : undefined,
          targetEnemyId: undefined,
          nextAutoAttackAt: undefined,
        });
      } else {
        // Dead pet is dismissed
        ctx.db.active_pet.id.delete(pet.id);
      }
    }
    for (const characterId of participantIds) {
      const character = ctx.db.character.id.find(characterId);
      if (character) {
        ctx.db.character.id.update({
          ...character,
          combatTargetEnemyId: undefined,
          lastCombatEndAt: ctx.timestamp.microsSinceUnixEpoch,
        });
      }
      for (const cast of ctx.db.character_cast.by_character.filter(characterId)) {
        const ability = ctx.db.ability_template.id.find(cast.abilityTemplateId);
        // Only cancel combat-only casts (utility kind); friendly/utility casts persist through combat transitions
        if (!ability || ability.kind === 'utility') {
          ctx.db.character_cast.id.delete(cast.id);
        }
      }
      // Remove expired cooldown rows to prevent stale data
      for (const cd of ctx.db.ability_cooldown.by_character.filter(characterId)) {
        if (cd.startedAtMicros + cd.durationMicros <= ctx.timestamp.microsSinceUnixEpoch) {
          ctx.db.ability_cooldown.id.delete(cd.id);
        }
      }
    }
    for (const row of ctx.db.aggro_entry.by_combat.filter(combatId)) {
      ctx.db.aggro_entry.id.delete(row.id);
    }
    for (const row of ctx.db.combat_enemy.by_combat.filter(combatId)) {
      ctx.db.combat_enemy.id.delete(row.id);
    }
    for (const row of ctx.db.combat_enemy_effect.by_combat.filter(combatId)) {
      ctx.db.combat_enemy_effect.id.delete(row.id);
    }
    if (ctx.db.combat_pending_add) {
      for (const row of ctx.db.combat_pending_add.by_combat.filter(combatId)) {
        // Restore the spawn for any pending add that never actually joined combat.
        // reserveAdds() set these spawns to state='engaged'; if combat ends before
        // they arrive, their spawn must be released back to 'available' so the
        // enemies are not permanently lost from the location.
        if (row.spawnId) {
          const pendingSpawn = ctx.db.enemy_spawn.id.find(row.spawnId);
          if (pendingSpawn && pendingSpawn.state === 'engaged' && pendingSpawn.lockedCombatId === combatId) {
            ctx.db.enemy_spawn.id.update({
              ...pendingSpawn,
              state: 'available',
              lockedCombatId: undefined,
            });
          }
        }
        ctx.db.combat_pending_add.id.delete(row.id);
      }
    }
    for (const row of ctx.db.combat_enemy_cast.by_combat.filter(combatId)) {
      ctx.db.combat_enemy_cast.id.delete(row.id);
    }
    if (ctx.db.combat_enemy_cooldown) {
      for (const row of ctx.db.combat_enemy_cooldown.by_combat.filter(combatId)) {
        ctx.db.combat_enemy_cooldown.id.delete(row.id);
      }
    }
  };

  const schedulePullResolve = (ctx: any, pullId: bigint, resolveAtMicros: bigint) => {
    ctx.db.pull_tick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(resolveAtMicros),
      pullId,
    });
  };

  const updateQuestProgressForKill = (
    ctx: any,
    character: any,
    enemyTemplateId: bigint
  ) => {
    for (const quest of ctx.db.quest_instance.by_character.filter(character.id)) {
      if (quest.completed) continue;
      const template = ctx.db.quest_template.id.find(quest.questTemplateId);
      if (!template) continue;
      // Skip kill_loot quests — they advance only via item drop, not kill count
      if ((template.questType ?? 'kill') === 'kill_loot') continue;
      if (template.targetEnemyTemplateId !== enemyTemplateId) continue;
      const nextProgress =
        quest.progress + 1n > template.requiredCount
          ? template.requiredCount
          : quest.progress + 1n;
      const isComplete = nextProgress >= template.requiredCount;
      ctx.db.quest_instance.id.update({
        ...quest,
        progress: nextProgress,
        completed: isComplete,
        // Don't set completedAt here - only when turning in to NPC
        completedAt: quest.completedAt,
      });
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'quest',
        `Quest progress: ${template.name} (${nextProgress}/${template.requiredCount}).`
      );
      if (isComplete) {
        const npc = ctx.db.npc.id.find(template.npcId);
        const giver = npc ? npc.name : 'the quest giver';
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'quest',
          `Quest complete: ${template.name}. Return to ${giver}.`
        );
        // REQ-032: Increment world stat tracker for threshold-triggered events
        incrementWorldStat(ctx, 'total_quests_completed', 1n);
      }
    }
  };

  function rollKillLootDrop(
    ctx: any,
    character: any,
    enemyTemplateId: bigint
  ) {
    // Check for active kill_loot quests targeting this enemy
    for (const quest of ctx.db.quest_instance.by_character.filter(character.id)) {
      if (quest.completed) continue;
      const template = ctx.db.quest_template.id.find(quest.questTemplateId);
      if (!template) continue;
      if ((template.questType ?? 'kill') !== 'kill_loot') continue;
      if (template.targetEnemyTemplateId !== enemyTemplateId) continue;

      // Roll drop chance
      const dropChance = template.itemDropChance ?? 25n;
      const roll = (BigInt(character.id) ^ ctx.timestamp.microsSinceUnixEpoch) % 100n;
      if (roll < dropChance) {
        // Item drops! Create a QuestItem (discovered + looted since it drops directly)
        ctx.db.quest_item.insert({
          id: 0n,
          characterId: character.id,
          questTemplateId: template.id,
          locationId: character.locationId,
          name: template.targetItemName ?? 'Quest Item',
          discovered: true,
          looted: true,
        });

        // Update quest progress
        const nextProgress = quest.progress + 1n;
        const isComplete = nextProgress >= template.requiredCount;
        ctx.db.quest_instance.id.update({
          ...quest,
          progress: nextProgress,
          completed: isComplete,
          completedAt: quest.completedAt,
        });

        deps.appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
          `${template.targetItemName ?? 'Quest item'} drops! (${nextProgress}/${template.requiredCount})`);

        if (isComplete) {
          deps.appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
            `Quest ready to turn in: ${template.name}. Return to the quest giver.`);
        }
      } else {
        deps.appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
          `No ${template.targetItemName ?? 'quest item'} dropped this time.`);
      }
    }
  }

  const resolveAttack = (
    ctx: any,
    {
      seed,
      baseDamage,
      targetArmor,
      canBlock,
      blockChanceBasis,
      blockMitigationPercent,
      canParry,
      canDodge,
      dodgeChanceBasis,
      parryChanceBasis,
      attackerHitBonus,
      currentHp,
      logTargetId,
      logOwnerId,
      messages,
      applyHp,
      targetCharacterId,
      groupId,
      groupActorId,
      characterDex,
      weaponName,
      weaponType,
      groupMessages,
    }: {
      seed: bigint;
      baseDamage: bigint;
      targetArmor: bigint;
      canBlock: boolean;
      blockChanceBasis?: bigint;        // stat-derived, on 1000-scale
      blockMitigationPercent?: bigint;  // stat-derived, on 100n-scale
      canParry: boolean;
      canDodge: boolean;
      dodgeChanceBasis?: bigint;        // stat-derived, on 1000-scale
      parryChanceBasis?: bigint;        // stat-derived, on 1000-scale
      attackerHitBonus?: bigint;        // stat-derived, on 1000-scale
      currentHp: bigint;
      logTargetId: bigint;
      logOwnerId: bigint;
      messages: {
        dodge: string | ((damage: bigint) => string);
        miss: string | ((damage: bigint) => string);
        parry: string | ((damage: bigint) => string);
        block: string | ((damage: bigint) => string);
        hit: string | ((damage: bigint) => string);
        crit?: string | ((damage: bigint) => string);
      };
      applyHp: (nextHp: bigint) => void;
      targetCharacterId?: bigint;
      groupId?: bigint;
      groupActorId?: bigint;
      characterDex?: bigint;
      weaponName?: string;
      weaponType?: string;
      groupMessages?: {
        dodge: string | ((damage: bigint) => string);
        miss: string | ((damage: bigint) => string);
        parry: string | ((damage: bigint) => string);
        block: string | ((damage: bigint) => string);
        hit: string | ((damage: bigint) => string);
        crit?: string | ((damage: bigint) => string);
      };
    }
  ) => {
    const reducedDamage = applyArmorMitigation(baseDamage, targetArmor);
    const variedDamage = applyVariance(reducedDamage, seed + 7919n);
    const outcome = rollAttackOutcome(seed, {
      canBlock,
      blockChanceBasis,       // undefined if not provided, rollAttackOutcome uses ?? 50n default
      blockMitigationPercent, // undefined if not provided, rollAttackOutcome uses ?? 50n default
      canParry,
      canDodge,
      dodgeChanceBasis,       // undefined if not provided, rollAttackOutcome uses ?? 50n default
      parryChanceBasis,       // undefined if not provided, rollAttackOutcome uses ?? 50n default
      attackerHitBonus,       // undefined if not provided, rollAttackOutcome uses ?? 0n default
      characterDex,
      weaponName,
      weaponType,
    });
    let finalDamage = (variedDamage * outcome.multiplier) / 100n;
    if (finalDamage < 0n) finalDamage = 0n;
    if (outcome.outcome === 'hit' && targetCharacterId) {
      const shield = [...ctx.db.character_effect.by_character.filter(targetCharacterId)].find(
        (effect) => effect.effectType === 'damage_shield'
      );
      if (shield) {
        const absorbed = shield.magnitude >= finalDamage ? finalDamage : shield.magnitude;
        finalDamage -= absorbed;
        ctx.db.character_effect.id.delete(shield.id);
        appendPrivateEvent(
          ctx,
          targetCharacterId,
          logOwnerId,
          'ability',
          `${shield.sourceAbility ?? 'A ward'} absorbs ${absorbed} damage.`
        );
      }
    }
    const nextHp = currentHp > finalDamage ? currentHp - finalDamage : 0n;
    applyHp(nextHp);

    const resolveMessageTemplate = (
      outcomeType: string,
      msgs: typeof messages
    ) => msgs[outcomeType as keyof typeof msgs] ?? msgs.hit;
    const template = resolveMessageTemplate(outcome.outcome, messages);
    const message = typeof template === 'function' ? template(finalDamage) : template;
    const type = outcome.outcome === 'hit' || outcome.outcome === 'crit' ? 'damage' : 'avoid';
    appendPrivateEvent(ctx, logTargetId, logOwnerId, type, message);
    if (groupId && groupActorId && groupMessages) {
      const groupTemplate = resolveMessageTemplate(outcome.outcome, groupMessages);
      const groupMessage = typeof groupTemplate === 'function' ? groupTemplate(finalDamage) : groupTemplate;
      appendGroupEvent(ctx, groupId, groupActorId, type, groupMessage);
    }

    return { outcome: outcome.outcome, finalDamage, nextHp };
  };

  const pickTemplate = (templates: any[], seed: bigint) => {
    if (templates.length === 0) return null;
    const index = Number(seed % BigInt(templates.length));
    return templates[index] ?? null;
  };

  const findLootTable = (ctx: any, enemyTemplate: any) => {
    const terrain = enemyTemplate.terrainTypes?.split(',')[0]?.trim() ?? 'plains';
    const creatureType = enemyTemplate.creatureType ?? 'beast';
    // Boss/named enemies: try named-specific loot table first (tier 2)
    if (enemyTemplate.isBoss) {
      const namedKey = 'named_' + enemyTemplate.name.toLowerCase().replace(/\s+/g, '_');
      for (const row of ctx.db.loot_table.iter()) {
        if (row.tier !== 2n) continue;
        if (row.terrainType !== namedKey) continue;
        if (row.creatureType !== creatureType) continue;
        return row;
      }
    }
    // Normal fallback: tier 1
    let best: any | null = null;
    for (const row of ctx.db.loot_table.iter()) {
      if (row.tier !== 1n) continue;
      if (row.terrainType !== terrain) continue;
      if (row.creatureType !== creatureType) continue;
      best = row;
      break;
    }
    if (best) return best;
    for (const row of ctx.db.loot_table.iter()) {
      if (row.tier !== 1n) continue;
      if (row.terrainType !== 'plains') continue;
      if (row.creatureType !== creatureType) continue;
      return row;
    }
    return null;
  };

  const rollPercent = (seed: bigint) => Number(seed % 100n);

  const pickWeightedEntry = (entries: any[], seed: bigint) => {
    if (entries.length === 0) return null;
    let total = 0n;
    for (const entry of entries) total += entry.weight;
    if (total <= 0n) return null;
    let roll = seed % total;
    for (const entry of entries) {
      if (roll < entry.weight) return entry;
      roll -= entry.weight;
    }
    return entries[0];
  };

  const generateLootTemplates = (ctx: any, enemyTemplate: any, seedBase: bigint, dangerMultiplier?: bigint) => {
    const lootTable = findLootTable(ctx, enemyTemplate);
    if (!lootTable) return [];
    const entries = [...ctx.db.loot_table_entry.by_table.filter(lootTable.id)];
    const junkEntries = entries.filter((entry) => {
      const template = ctx.db.item_template.id.find(entry.itemTemplateId);
      return template?.isJunk;
    });
    const gearEntries = entries.filter((entry) => {
      const template = ctx.db.item_template.id.find(entry.itemTemplateId);
      return template && !template.isJunk && !STARTER_ITEM_NAMES.has(template.name) && template.requiredLevel <= (enemyTemplate.level ?? 1n) + 1n;
    });

    const level = enemyTemplate.level ?? 1n;
    const gearBoost = BigInt(Math.min(25, Number(level) * 2));
    const gearChance = lootTable.gearChance + gearBoost;

    const lootItems: { template: any; qualityTier?: string; affixDataJson?: string; isNamed?: boolean; craftQuality?: string }[] = [];
    const pick = pickWeightedEntry(junkEntries, seedBase + 11n);
    if (pick) {
      const template = ctx.db.item_template.id.find(pick.itemTemplateId);
      if (template) lootItems.push({ template });
    }

    const rollGear = rollPercent(seedBase + 19n);
    if (rollGear < Number(gearChance)) {
      const pick = pickWeightedEntry(gearEntries, seedBase + 23n);
      if (pick) {
        const template = ctx.db.item_template.id.find(pick.itemTemplateId);
        if (template) {
          const quality = rollQualityTier(enemyTemplate.level ?? 1n, seedBase, dangerMultiplier);
          const craftQual = rollQualityForDrop(enemyTemplate.level ?? 1n, seedBase);
          const JEWELRY_SLOTS_COMBAT = new Set(['earrings', 'neck']);
          const effectiveQuality =
            JEWELRY_SLOTS_COMBAT.has(template.slot) && template.armorClassBonus === 0n && quality === 'common'
              ? 'uncommon'
              : quality;
          if (effectiveQuality !== 'common') {
            const affixes = generateAffixData(template.slot, effectiveQuality, seedBase);
            // Convert BigInt magnitude to Number before JSON serialization (BigInt is not JSON-serializable)
            const affixDataJson = JSON.stringify(affixes.map((a) => ({ ...a, magnitude: Number(a.magnitude) })));
            lootItems.push({ template, qualityTier: effectiveQuality, affixDataJson, isNamed: false, craftQuality: craftQual });
          } else {
            lootItems.push({ template, qualityTier: effectiveQuality, isNamed: false, craftQuality: craftQual });
          }
        }
      }
    }

    return lootItems;
  };

  const rollGold = (seed: bigint, min: bigint, max: bigint) => {
    if (max <= min) return min;
    const range = max - min + 1n;
    return min + (seed % range);
  };

  const hashString = (value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  };

  const pickEnemyTarget = (
    rule: string | undefined,
    activeParticipants: typeof deps.CombatParticipant.rowType[],
    ctx: any,
    combatId: bigint,
    enemyId: bigint
  ): { characterId?: bigint; petId?: bigint } | undefined => {
    if (activeParticipants.length === 0) return undefined;
    const normalized = (rule ?? 'aggro').toLowerCase();
    if (normalized === 'lowest_hp') {
      const lowest = activeParticipants
        .map((p) => ctx.db.character.id.find(p.characterId))
        .filter((c) => Boolean(c))
        .sort((a, b) => (a.hp > b.hp ? 1 : a.hp < b.hp ? -1 : 0))[0];
      return lowest ? { characterId: lowest.id } : undefined;
    }
    if (normalized === 'random') {
      const idx = Number((ctx.timestamp.microsSinceUnixEpoch % BigInt(activeParticipants.length)));
      const charId = activeParticipants[idx]?.characterId;
      return charId ? { characterId: charId } : undefined;
    }
    if (normalized === 'self') return undefined;
    if (normalized === 'all_allies') {
      // Buff applies to all living enemy allies via executeAbilityAction.
      // Return any active participant as a placeholder so the cast is not skipped.
      const charId = activeParticipants[0]?.characterId;
      return charId ? { characterId: charId } : undefined;
    }
    // Aggro branch: include pet entries so pets with top aggro can be targeted
    const topEntry = [...ctx.db.aggro_entry.by_combat.filter(combatId)]
      .filter((entry) => entry.enemyId === enemyId)
      .filter((entry) => {
        if (entry.petId) return true; // pet entries always eligible
        return activeParticipants.some((p) => p.characterId === entry.characterId);
      })
      .sort((a, b) => (a.value > b.value ? -1 : a.value < b.value ? 1 : 0))[0];
    if (!topEntry) {
      const charId = activeParticipants[0]?.characterId;
      return charId ? { characterId: charId } : undefined;
    }
    if (topEntry.petId) return { petId: topEntry.petId };
    return { characterId: topEntry.characterId };
  };

  spacetimedb.reducer('start_combat', { characterId: t.u64(), enemySpawnId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const _player = ctx.db.player.id.find(ctx.sender);
    if (_player) {
      ctx.db.player.id.update({ ..._player, lastActivityAt: ctx.timestamp });
    }
    const activeGather = [...ctx.db.resource_gather.by_character.filter(character.id)][0];
    if (activeGather) {
      return failCombat(ctx, character, 'Cannot start combat while gathering');
    }
    const locationId = character.locationId;

    // Anyone in a group can start combat (puller restriction removed)
    const membership = [...ctx.db.group_member.by_character.filter(character.id)][0];
    let groupId: bigint | null = membership ? membership.groupId : null;

    // Determine participants (virtual solo group)
    const participants: typeof deps.Character.rowType[] = getGroupOrSoloParticipants(ctx, character);
    if (participants.length === 0) return failCombat(ctx, character, 'No participants available');
    for (const p of participants) {
      if (activeCombatIdForCharacter(ctx, p.id)) {
        return failCombat(ctx, character, `${p.name} is already in combat`);
      }
    }

    const spawn = ctx.db.enemy_spawn.id.find(args.enemySpawnId);
    let desiredLevel = 1n;
    const spawnToUse =
      spawn && spawn.locationId === locationId && spawn.state === 'available'
        ? spawn
        : ensureAvailableSpawn(ctx, locationId, desiredLevel);

    startCombatForSpawn(deps, ctx, character, spawnToUse, participants, groupId);
  });

  spacetimedb.reducer(
    'start_tracked_combat',
    { characterId: t.u64(), enemyTemplateId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const _player = ctx.db.player.id.find(ctx.sender);
      if (_player) {
        ctx.db.player.id.update({ ..._player, lastActivityAt: ctx.timestamp });
      }
      const activeGather = [...ctx.db.resource_gather.by_character.filter(character.id)][0];
      if (activeGather) {
        return failCombat(ctx, character, 'Cannot start combat while gathering');
      }
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return failCombat(ctx, character, 'Already in combat');
      }
      const locationId = character.locationId;
      // Anyone in a group can start combat (puller restriction removed)
      const membership = [...ctx.db.group_member.by_character.filter(character.id)][0];
      let groupId: bigint | null = membership ? membership.groupId : null;
      const participants: typeof deps.Character.rowType[] = getGroupOrSoloParticipants(ctx, character);
      if (participants.length === 0) return failCombat(ctx, character, 'No participants available');
      for (const p of participants) {
        if (activeCombatIdForCharacter(ctx, p.id)) {
          return failCombat(ctx, character, `${p.name} is already in combat`);
        }
      }
      const spawn = deps.spawnEnemyWithTemplate(ctx, locationId, args.enemyTemplateId);
      startCombatForSpawn(deps, ctx, character, spawn, participants, groupId);
    }
  );

  spacetimedb.reducer(
    'start_pull',
    { characterId: t.u64(), enemySpawnId: t.u64(), pullType: t.string() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const _player = ctx.db.player.id.find(ctx.sender);
      if (_player) {
        ctx.db.player.id.update({ ..._player, lastActivityAt: ctx.timestamp });
      }
      const activeGather = [...ctx.db.resource_gather.by_character.filter(character.id)][0];
      if (activeGather) {
        return failCombat(ctx, character, 'Cannot pull while gathering');
      }
      // Mid-combat pulling allowed — resolve_pull handles adding to existing fight
      const locationId = character.locationId;
      const pullType = args.pullType.trim().toLowerCase();
      if (pullType !== 'careful' && pullType !== 'body') {
        return failCombat(ctx, character, 'Invalid pull type');
      }

      // Anyone in a group can pull (puller restriction removed)
      const membership = [...ctx.db.group_member.by_character.filter(character.id)][0];
      let groupId: bigint | null = membership ? membership.groupId : null;

      for (const pull of ctx.db.pull_state.by_character.filter(character.id)) {
        if (pull.state === 'pending') {
          return failCombat(ctx, character, 'Pull already in progress');
        }
      }

      const spawn = ctx.db.enemy_spawn.id.find(args.enemySpawnId);
      if (!spawn || spawn.locationId !== locationId || spawn.state !== 'available') {
        return failCombat(ctx, character, 'Enemy is not available to pull');
      }

      ctx.db.enemy_spawn.id.update({ ...spawn, state: 'pulling' });

      const delayMicros = pullType === 'careful' ? PULL_DELAY_CAREFUL : PULL_DELAY_BODY;
      const resolveAt = ctx.timestamp.microsSinceUnixEpoch + delayMicros;
      const pull = ctx.db.pull_state.insert({
        id: 0n,
        characterId: character.id,
        groupId: groupId ?? undefined,
        locationId,
        enemySpawnId: spawn.id,
        pullType,
        state: 'pending',
        outcome: undefined,
        delayedAdds: undefined,
        delayedAddsAtMicros: undefined,
        createdAt: ctx.timestamp,
      });
      schedulePullResolve(ctx, pull.id, resolveAt);

      logPrivateAndGroup(
        ctx,
        character,
        'system',
        `You begin a ${pullType === 'careful' ? 'Careful Pull' : 'Body Pull'} on ${spawn.name}.`,
        `${character.name} begins a ${pullType === 'careful' ? 'Careful Pull' : 'Body Pull'} on ${spawn.name}.`
      );
    }
  );

  spacetimedb.reducer(
    'set_combat_target',
    { characterId: t.u64(), enemyId: t.u64().optional() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const combatId = activeCombatIdForCharacter(ctx, character.id);
      if (!combatId) return failCombat(ctx, character, 'Not in combat');
      if (args.enemyId) {
        const enemy = ctx.db.combat_enemy.id.find(args.enemyId);
        if (!enemy || enemy.combatId !== combatId) {
          return failCombat(ctx, character, 'Enemy not in combat');
        }
        ctx.db.character.id.update({ ...character, combatTargetEnemyId: enemy.id });
      } else {
        ctx.db.character.id.update({ ...character, combatTargetEnemyId: undefined });
      }
    }
  );

  scheduledReducers['resolve_pull'] = spacetimedb.reducer('resolve_pull', { arg: PullTick.rowType }, (ctx, { arg }) => {
    const pull = ctx.db.pull_state.id.find(arg.pullId);
    if (!pull || pull.state !== 'pending') return;

    const character = ctx.db.character.id.find(pull.characterId);
    const spawn = ctx.db.enemy_spawn.id.find(pull.enemySpawnId);
    if (!character || !spawn || spawn.locationId !== pull.locationId) {
      if (spawn && spawn.state === 'pulling') {
        ctx.db.enemy_spawn.id.update({ ...spawn, state: 'available' });
      }
      ctx.db.pull_state.id.delete(pull.id);
      return;
    }
    const existingCombatId = activeCombatIdForCharacter(ctx, character.id);
    if (existingCombatId) {
      // Mid-combat pull: add new enemies to existing combat
      const combat = ctx.db.combat_encounter.id.find(existingCombatId);
      if (combat) {
        const existingParticipants = [...ctx.db.combat_participant.by_combat.filter(existingCombatId)]
          .map((p: any) => ctx.db.character.id.find(p.characterId))
          .filter(Boolean);

        addEnemyToCombat(deps, ctx, combat, spawn, existingParticipants);

        logPrivateAndGroup(ctx, character, 'combat',
          `You pull ${spawn.name} into the existing fight!`,
          `${character.name} pulls ${spawn.name} into the fight!`);

        ctx.db.pull_state.id.update({ ...pull, state: 'resolved', outcome: 'success' });
        return;
      }
      // Combat disappeared between check and lookup — fall through to start fresh
    }

    const template = ctx.db.enemy_template.id.find(spawn.enemyTemplateId);
    if (!template) {
      ctx.db.enemy_spawn.id.update({ ...spawn, state: 'available' });
      ctx.db.pull_state.id.delete(pull.id);
      return;
    }

    const candidates = PULL_ALLOW_EXTERNAL_ADDS
      ? [...ctx.db.enemy_spawn.by_location.filter(pull.locationId)]
        .filter((row) => row.id !== spawn.id && row.state === 'available')
        .map((row) => ({
          spawn: row,
          template: ctx.db.enemy_template.id.find(row.enemyTemplateId),
        }))
        .filter(
          (row) =>
            row.template &&
            row.template.isSocial === true &&
            row.template.id === template.id
        )
      : [];

    const targetRadius = Number(template.socialRadius ?? 0n);
    const overlapPressure = targetRadius + candidates.length;
    let success = pull.pullType === 'careful' ? 80 : 40;
    let partial = pull.pullType === 'careful' ? 15 : 30;
    let fail = 100 - success - partial;
    const pressurePenalty = Math.min(30, overlapPressure * 5);
    success -= pressurePenalty;
    fail += pressurePenalty;
    const veil = deps.sumCharacterEffect(ctx, character.id, 'pull_veil');
    if (veil > 0n) {
      success = Math.min(95, success + 15);
      fail = Math.max(5, fail - 15);
      for (const effect of ctx.db.character_effect.by_character.filter(character.id)) {
        if (effect.effectType === 'pull_veil') ctx.db.character_effect.id.delete(effect.id);
      }
    }
    const awarenessAlert =
      template.awareness?.toLowerCase() === 'alert' ||
      candidates.some((row) => row.template?.awareness?.toLowerCase() === 'alert');
    if (awarenessAlert) {
      success = Math.max(5, success - 10);
      fail = Math.min(95, fail + 10);
    }
    partial = Math.max(5, 100 - success - fail);

    // WIS off-stat hook: WIS shifts pull success% up and fail% down (same pattern as pull_veil)
    const wisOffset = Number(statOffset(character.wis, WIS_PULL_BONUS_PER_POINT));
    if (wisOffset !== 0) {
      success = Math.min(95, Math.max(5, success + wisOffset));
      fail = Math.max(5, Math.min(95, fail - wisOffset));
      // partial is the remainder (100 - success - fail), not adjusted directly
    }

    const roll =
      Number(
        (ctx.timestamp.microsSinceUnixEpoch + spawn.id + character.id) % 100n
      );
    let outcome: 'success' | 'partial' | 'failure' = 'success';
    if (roll < success) {
      outcome = 'success';
    } else if (roll < success + partial) {
      outcome = 'partial';
    } else {
      outcome = 'failure';
    }

    const maxAdds = candidates.length;
    const addCount = maxAdds > 0 ? Math.min(maxAdds, Math.max(1, targetRadius || 1)) : 0;

    const participants: typeof deps.Character.rowType[] = getGroupOrSoloParticipants(ctx, character);
    if (participants.length === 0) {
      ctx.db.enemy_spawn.id.update({ ...spawn, state: 'available' });
      ctx.db.pull_state.id.delete(pull.id);
      return;
    }

    const combat = startCombatForSpawn(
      deps,
      ctx,
      character,
      spawn,
      participants,
      pull.groupId ?? null
    );

    const reasons: string[] = [];
    if (awarenessAlert) {
      reasons.push('The area is on alert.');
    }
    if (veil > 0n) {
      reasons.push('A veil of calm muffles your pull.');
    }
    if (PULL_ALLOW_EXTERNAL_ADDS && overlapPressure > 0) {
      reasons.push(`Other ${template.name}s are nearby and may answer the call.`);
    }
    const reasonSuffix = reasons.length > 0 ? ` ${reasons.join(' ')}` : '';

    const reserveAdds = (count: number) => {
      if (count <= 0) return [] as { spawn: any; roleTemplateId?: bigint }[];
      const reserved: { spawn: any; roleTemplateId?: bigint }[] = [];
      let remaining = count;
      for (const candidate of candidates) {
        if (remaining <= 0) break;
        if (!candidate.spawn) continue;
        const candidateSpawn = ctx.db.enemy_spawn.id.find(candidate.spawn.id);
        if (!candidateSpawn || candidateSpawn.state !== 'available') continue;
        ctx.db.enemy_spawn.id.update({
          ...candidateSpawn,
          state: 'engaged',
          lockedCombatId: combat.id,
        });
        reserved.push({ spawn: candidateSpawn, roleTemplateId: undefined });
        remaining -= 1;
      }
      return reserved;
    };

    if (outcome === 'partial' && addCount > 0) {
      const delayMicros = AUTO_ATTACK_INTERVAL * PULL_ADD_DELAY_ROUNDS;
      const reserved = reserveAdds(addCount);
      for (const add of reserved) {
        ctx.db.combat_pending_add.insert({
          id: 0n,
          combatId: combat.id,
          enemyTemplateId: add.spawn.enemyTemplateId,
          enemyRoleTemplateId: add.roleTemplateId,
          spawnId: add.spawn.id,
          arriveAtMicros: ctx.timestamp.microsSinceUnixEpoch + delayMicros,
        });
      }
      for (const p of participants) {
        logPrivateAndGroup(
          ctx,
          p,
          'system',
          `Your ${pull.pullType} pull draws attention. You engage ${spawn.name}, but ${reserved.length} ${reserved.length === 1 ? 'add' : 'adds'} will arrive in ${Number(delayMicros / 1_000_000n)}s.${reasonSuffix}`,
          `${character.name}'s pull draws attention. ${reserved.length} ${reserved.length === 1 ? 'add' : 'adds'} will arrive in ${Number(delayMicros / 1_000_000n)}s.`
        );
      }
    } else if (outcome === 'failure' && addCount > 0) {
      const reserved = reserveAdds(addCount);
      for (const add of reserved) {
        addEnemyToCombat(
          deps,
          ctx,
          combat,
          add.spawn,
          participants,
          false,
          add.roleTemplateId
        );
      }
      // Send private message to each participant (participants are Character rows)
      for (const p of participants) {
        const privateMsg = p.id === character.id
          ? `Your ${pull.pullType} pull is noticed. You engage ${spawn.name} and ${reserved.length} ${reserved.length === 1 ? 'add' : 'adds'} rush in immediately.${reasonSuffix}`
          : `${character.name}'s ${pull.pullType} pull is noticed. ${reserved.length} ${reserved.length === 1 ? 'add' : 'adds'} rush in immediately.${reasonSuffix}`;
        appendPrivateEvent(ctx, p.id, p.ownerUserId, 'system', privateMsg);
      }
      // Send group message once
      if (combat.groupId) {
        appendGroupEvent(ctx, combat.groupId, character.id, 'system', `${character.name}'s pull is noticed. ${reserved.length} ${reserved.length === 1 ? 'add' : 'adds'} rush in immediately.`);
      }
    } else {
      // Send private message to each participant (participants are Character rows)
      for (const p of participants) {
        const privateMsg = p.id === character.id
          ? `Your ${pull.pullType} pull is clean. You engage ${spawn.name} alone.${reasonSuffix}`
          : `${character.name}'s pull is clean.`;
        appendPrivateEvent(ctx, p.id, p.ownerUserId, 'system', privateMsg);
      }
      // Send group message once
      if (combat.groupId) {
        appendGroupEvent(ctx, combat.groupId, character.id, 'system', `${character.name}'s pull is clean.`);
      }
    }
    ctx.db.pull_state.id.delete(pull.id);
  });

  spacetimedb.reducer('flee_combat', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const combatId = activeCombatIdForCharacter(ctx, character.id);
    if (!combatId) return failCombat(ctx, character, 'Combat not active');
    const combat = ctx.db.combat_encounter.id.find(combatId);
    if (!combat || combat.state !== 'active') return failCombat(ctx, character, 'Combat not active');

    // Real-time flee: attempt immediately
    for (const participant of ctx.db.combat_participant.by_combat.filter(combat.id)) {
      if (participant.characterId !== character.id) continue;
      if (participant.status !== 'active') return;
      ctx.db.combat_participant.id.update({
        ...participant,
        status: 'fleeing',
      });
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'combat',
        'You attempt to flee...'
      );
      const groupId = effectiveGroupId(character);
      if (groupId) {
        appendGroupEvent(ctx, groupId, character.id, 'combat', `${character.name} attempts to flee.`);
      }
      return;
    }
  });

  scheduledReducers['respawn_enemy'] = spacetimedb.reducer('respawn_enemy', { arg: EnemyRespawnTick.rowType }, (ctx, { arg }) => {
    const location = ctx.db.location.id.find(arg.locationId);
    if (location?.isSafe) return;
    // Respect spawn cap — event spawns don't count against it
    const nonEventCount = [...ctx.db.enemy_spawn.by_location.filter(arg.locationId)]
      .filter(row => [...ctx.db.event_spawn_enemy.by_spawn.filter(row.id)].length === 0).length;
    const cap = getLocationSpawnCap(ctx, arg.locationId);
    if (nonEventCount >= cap) return;
    deps.spawnEnemy(ctx, arg.locationId, 1n);
  });

  spacetimedb.reducer(
    'dismiss_combat_results',
    { characterId: t.u64(), force: t.bool().optional() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const groupId = effectiveGroupId(character);
      if (groupId) {
        // Each character dismisses only their own result and loot
        const myResults = [...ctx.db.combat_result.by_owner_user.filter(character.ownerUserId)]
          .filter(r => r.groupId && r.groupId === groupId);
        const combatIds = new Set<bigint>();
        for (const row of myResults) {
          combatIds.add(row.combatId);
          ctx.db.combat_result.id.delete(row.id);
        }
        // Delete only this character's loot
        for (const combatId of combatIds) {
          for (const loot of ctx.db.combat_loot.by_character.filter(character.id)) {
            if (loot.combatId === combatId) {
              ctx.db.combat_loot.id.delete(loot.id);
            }
          }
        }
        return;
      }
      const combatIds = new Set<bigint>();
      for (const row of ctx.db.combat_result.by_owner_user.filter(character.ownerUserId)) {
        combatIds.add(row.combatId);
        ctx.db.combat_result.id.delete(row.id);
      }
      for (const combatId of combatIds) {
        for (const loot of ctx.db.combat_loot.by_combat.filter(combatId)) {
          ctx.db.combat_loot.id.delete(loot.id);
        }
      }
    }
  );

  spacetimedb.reducer('end_combat', { characterId: t.u64() }, (ctx, args) => {
    requireAdmin(ctx);
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    let combatId = activeCombatIdForCharacter(ctx, character.id);
    if (!combatId) {
      const fallback = [...ctx.db.combat_participant.by_character.filter(character.id)][0];
      combatId = fallback?.combatId ?? null;
    }
    if (!combatId) return failCombat(ctx, character, 'No active combat');
    const combat = ctx.db.combat_encounter.id.find(combatId);
    if (!combat) return failCombat(ctx, character, 'Combat not active');

    if (combat.groupId && combat.state === 'active') {
      const group = ctx.db.group.id.find(combat.groupId);
      if (!group) return failCombat(ctx, character, 'Group not found');
      if (group.leaderCharacterId !== character.id) {
        return failCombat(ctx, character, 'Only the group leader can end combat');
      }
    }

    const participants = [...ctx.db.combat_participant.by_combat.filter(combat.id)];
    for (const p of participants) {
      const participantChar = ctx.db.character.id.find(p.characterId);
      if (!participantChar) continue;
      appendPrivateEvent(
        ctx,
        participantChar.id,
        participantChar.ownerUserId,
        'combat',
        'Combat was ended by the leader.'
      );
      ctx.db.combat_result.insert({
        id: 0n,
        ownerUserId: participantChar.ownerUserId,
        characterId: participantChar.id,
        groupId: combat.groupId,
        combatId: combat.id,
        summary: 'Combat ended by leader.',
        createdAt: ctx.timestamp,
      });
    }

    const spawn = [...ctx.db.enemy_spawn.by_location.filter(combat.locationId)].find(
      (s) => s.lockedCombatId === combat.id
    );
    if (spawn) {
      ctx.db.enemy_spawn.id.update({ ...spawn, state: 'available', lockedCombatId: undefined });
    }

    clearCombatArtifacts(ctx, combat.id);
    ctx.db.combat_encounter.id.update({ ...combat, state: 'resolved' });
  });

  const HP_REGEN_IN = 2n;
  const MANA_REGEN_IN = 2n;
  const STAMINA_REGEN_IN = 2n;  // bumped from 1
  const COMBAT_COOLDOWN_MICROS = 3_000_000n;  // 3 seconds post-combat cooldown
  const REGEN_TICK_MICROS = 8_000_000n;
  const EFFECT_TICK_MICROS = 10_000_000n;
  const HOT_TICK_MICROS = 3_000_000n;

  scheduledReducers['regen_health'] = spacetimedb.reducer('regen_health', { arg: HealthRegenTick.rowType }, (ctx) => {
    for (const character of ctx.db.character.iter()) {
      const activelyInCombat = !!activeCombatIdForCharacter(ctx, character.id);
      const inCooldown = !activelyInCombat && character.lastCombatEndAt !== undefined && character.lastCombatEndAt !== null &&
        (ctx.timestamp.microsSinceUnixEpoch - character.lastCombatEndAt) < COMBAT_COOLDOWN_MICROS;
      const inCombat = activelyInCombat || inCooldown;
      if (character.hp === 0n) {
        if (!inCombat) {
          for (const effect of ctx.db.character_effect.by_character.filter(character.id)) {
            ctx.db.character_effect.id.delete(effect.id);
          }
        }
        continue;
      }
      const hpRegen = inCombat ? HP_REGEN_IN : (character.maxHp / 15n || 1n);
      const manaRegen = inCombat ? MANA_REGEN_IN : (character.maxMana > 0n ? character.maxMana / 20n || 1n : 0n);
      const staminaRegen = inCombat ? STAMINA_REGEN_IN : (character.maxStamina / 12n > 3n ? character.maxStamina / 12n : 3n);

      // Sum food regen bonus effects (food_mana_regen, food_stamina_regen, food_health_regen)
      // These increase the per-tick regen rate instead of granting periodic heals
      // Applies both in combat and out of combat since this reducer handles both paths
      let hpRegenBonus = 0n;
      let manaRegenBonus = 0n;
      let staminaRegenBonus = 0n;
      for (const effect of ctx.db.character_effect.by_character.filter(character.id)) {
        if (effect.effectType === 'food_health_regen') hpRegenBonus += effect.magnitude;
        else if (effect.effectType === 'food_mana_regen') manaRegenBonus += effect.magnitude;
        else if (effect.effectType === 'food_stamina_regen') staminaRegenBonus += effect.magnitude;
        else if (effect.effectType === 'mana_regen_bonus') manaRegenBonus += effect.magnitude;
      }

      // Add racial regen bonuses from Character row (these persist through death, unlike CharacterEffects)
      hpRegenBonus += character.racialHpRegen ?? 0n;
      manaRegenBonus += character.racialManaRegen ?? 0n;
      staminaRegenBonus += character.racialStaminaRegen ?? 0n;

      // Add gear manaRegen affix bonuses
      const gear = getEquippedBonuses(ctx, character.id);
      manaRegenBonus += gear.manaRegen;

      const nextHp =
        character.hp >= character.maxHp ? character.hp : character.hp + hpRegen + hpRegenBonus;
      const nextMana =
        character.mana >= character.maxMana ? character.mana : character.mana + manaRegen + manaRegenBonus;
      const nextStamina =
        character.stamina >= character.maxStamina
          ? character.stamina
          : character.stamina + staminaRegen + staminaRegenBonus;

      ctx.db.character.id.update({
        ...character,
        hp: nextHp > character.maxHp ? character.maxHp : nextHp,
        mana: nextMana > character.maxMana ? character.maxMana : nextMana,
        stamina: nextStamina > character.maxStamina ? character.maxStamina : nextStamina,
      });

      // Clean up expired cooldown rows for out-of-combat characters
      if (!inCombat) {
        for (const cd of ctx.db.ability_cooldown.by_character.filter(character.id)) {
          if (cd.startedAtMicros + cd.durationMicros <= ctx.timestamp.microsSinceUnixEpoch) {
            ctx.db.ability_cooldown.id.delete(cd.id);
          }
        }
      }
    }

    // Pet HP regen — mirrors character regen rates
    const PET_HP_REGEN_OUT = 3n;
    const PET_HP_REGEN_IN = 2n;

    for (const pet of ctx.db.active_pet.iter()) {
      // Dismiss timed pets when their duration has elapsed
      if (pet.expiresAtMicros !== undefined && pet.expiresAtMicros !== null &&
        ctx.timestamp.microsSinceUnixEpoch >= pet.expiresAtMicros) {
        ctx.db.active_pet.id.delete(pet.id);
        continue;
      }
      if (pet.currentHp === 0n) continue;           // dead pet — skip
      if (pet.currentHp >= pet.maxHp) continue;     // full HP — skip

      const petInCombat = pet.combatId !== undefined && pet.combatId !== null;

      const regenAmount = petInCombat ? PET_HP_REGEN_IN : PET_HP_REGEN_OUT;
      const nextHp = pet.currentHp + regenAmount;

      ctx.db.active_pet.id.update({
        ...pet,
        currentHp: nextHp > pet.maxHp ? pet.maxHp : nextHp,
      });
    }

    // Out-of-combat pet_heal ability ticks
    for (const pet of ctx.db.active_pet.iter()) {
      if (pet.abilityKey !== 'pet_heal') continue;
      if (pet.combatId !== undefined && pet.combatId !== null) continue; // in combat: handled by combat loop
      if (pet.currentHp === 0n) continue;
      if (!pet.nextAbilityAt) continue;
      if (pet.nextAbilityAt > ctx.timestamp.microsSinceUnixEpoch) continue;

      const healPetOwner = ctx.db.character.id.find(pet.characterId);
      if (!healPetOwner || healPetOwner.hp === 0n) continue;

      // Find lowest-HP party member (owner + group members at same location)
      const groupId = healPetOwner.groupId ?? null;
      let healTarget: any = null;
      let lowestHpRatio = 101n;

      // Check owner
      if (healPetOwner.hp > 0n && healPetOwner.hp < healPetOwner.maxHp) {
        const ratio = (healPetOwner.hp * 100n) / healPetOwner.maxHp;
        if (ratio < lowestHpRatio) {
          lowestHpRatio = ratio;
          healTarget = healPetOwner;
        }
      }

      // Check group members at same location
      if (groupId) {
        for (const membership of ctx.db.group_member.by_group.filter(groupId)) {
          const member = ctx.db.character.id.find(membership.characterId);
          if (!member || member.hp === 0n || member.locationId !== healPetOwner.locationId) continue;
          if (member.hp >= member.maxHp) continue;
          const ratio = (member.hp * 100n) / member.maxHp;
          if (ratio < lowestHpRatio) {
            lowestHpRatio = ratio;
            healTarget = member;
          }
        }
      }

      // Consider the pet itself as a heal candidate
      let healTargetIsPet = false;
      if (pet.currentHp > 0n && pet.currentHp < pet.maxHp) {
        const petRatio = (pet.currentHp * 100n) / pet.maxHp;
        if (petRatio < lowestHpRatio) {
          lowestHpRatio = petRatio;
          healTarget = pet;
          healTargetIsPet = true;
        }
      }

      if (!healTarget) {
        // Everyone at full HP — disarm until combat exit re-arms (clear nextAbilityAt)
        ctx.db.active_pet.id.update({ ...pet, nextAbilityAt: undefined });
        continue;
      }

      const healAmount = 10n + pet.level * 5n;
      const cooldownMicros = (pet.abilityCooldownSeconds ?? 10n) * 1_000_000n;
      if (healTargetIsPet) {
        const newHp = pet.currentHp + healAmount > pet.maxHp ? pet.maxHp : pet.currentHp + healAmount;
        ctx.db.active_pet.id.update({ ...pet, currentHp: newHp, nextAbilityAt: ctx.timestamp.microsSinceUnixEpoch + cooldownMicros });
      } else {
        const newHp = healTarget.hp + healAmount > healTarget.maxHp
          ? healTarget.maxHp
          : healTarget.hp + healAmount;
        ctx.db.character.id.update({ ...healTarget, hp: newHp });
        ctx.db.active_pet.id.update({ ...pet, nextAbilityAt: ctx.timestamp.microsSinceUnixEpoch + cooldownMicros });
      }

      const healMsg = `${pet.name} heals ${healTarget.name} for ${healAmount}.`;
      appendPrivateEvent(ctx, healPetOwner.id, healPetOwner.ownerUserId, 'ability', healMsg);
      if (healPetOwner.groupId) {
        appendGroupEvent(ctx, healPetOwner.groupId, healPetOwner.id, 'ability', healMsg);
      }
    }

    // Out-of-combat pet_aoe_heal ability ticks
    for (const pet of ctx.db.active_pet.iter()) {
      if (pet.abilityKey !== 'pet_aoe_heal') continue;
      if (pet.combatId !== undefined && pet.combatId !== null) continue; // in combat: handled by combat loop
      if (pet.currentHp === 0n) continue;
      if (!pet.nextAbilityAt) continue;
      if (pet.nextAbilityAt > ctx.timestamp.microsSinceUnixEpoch) continue;

      const petOwner = ctx.db.character.id.find(pet.characterId);
      if (!petOwner || petOwner.hp === 0n) continue;

      const groupId = petOwner.groupId ?? null;
      const healAmount = 10n + pet.level * 5n;
      let healedCount = 0n;

      // Heal owner if injured
      if (petOwner.hp > 0n && petOwner.hp < petOwner.maxHp) {
        const newHp = petOwner.hp + healAmount > petOwner.maxHp ? petOwner.maxHp : petOwner.hp + healAmount;
        ctx.db.character.id.update({ ...petOwner, hp: newHp });
        healedCount++;
      }

      // Heal group members at same location
      if (groupId) {
        for (const membership of ctx.db.group_member.by_group.filter(groupId)) {
          const member = ctx.db.character.id.find(membership.characterId);
          if (!member || member.id === petOwner.id) continue;
          if (member.hp === 0n || member.hp >= member.maxHp) continue;
          if (member.locationId !== petOwner.locationId) continue;
          const newHp = member.hp + healAmount > member.maxHp ? member.maxHp : member.hp + healAmount;
          ctx.db.character.id.update({ ...member, hp: newHp });
          healedCount++;
        }
      }

      // Also heal the pet itself if injured
      let petHealedHp = pet.currentHp;
      if (pet.currentHp > 0n && pet.currentHp < pet.maxHp) {
        petHealedHp = pet.currentHp + healAmount > pet.maxHp ? pet.maxHp : pet.currentHp + healAmount;
        healedCount++;
      }

      if (healedCount === 0n) {
        ctx.db.active_pet.id.update({ ...pet, nextAbilityAt: undefined });
        continue;
      }

      const healMsg = `${pet.name} heals the party for ${healAmount}!`;
      appendPrivateEvent(ctx, petOwner.id, petOwner.ownerUserId, 'ability', healMsg);
      if (petOwner.groupId) {
        appendGroupEvent(ctx, petOwner.groupId, petOwner.id, 'ability', healMsg);
      }

      const cooldownMicros = (pet.abilityCooldownSeconds ?? 10n) * 1_000_000n;
      ctx.db.active_pet.id.update({ ...pet, currentHp: petHealedHp, nextAbilityAt: ctx.timestamp.microsSinceUnixEpoch + cooldownMicros });
    }

    // Combat loop ticks via scheduled combat_loop reducer — no watchdog needed here

    ctx.db.health_regen_tick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + REGEN_TICK_MICROS),
    });
  });

  scheduledReducers['tick_effects'] = spacetimedb.reducer('tick_effects', { arg: deps.EffectTick.rowType }, (ctx) => {
    // Old real-time effect ticking disabled — effects tick per-round in resolveRound
    return;
  });

  scheduledReducers['tick_hot'] = spacetimedb.reducer('tick_hot', { arg: deps.HotTick.rowType }, (ctx) => {
    // Old real-time HoT ticking disabled — HoTs tick per-round in resolveRound
    return;
  });

  // Bard song tick: fires every 6 seconds to apply active song group effects.
  scheduledReducers['tick_bard_songs'] = spacetimedb.reducer('tick_bard_songs', { arg: deps.BardSongTick.rowType }, (ctx, { arg }) => {
    const bardCombatId = arg.combatId;
    if (bardCombatId !== undefined) {
      const combat = ctx.db.combat_encounter.id.find(bardCombatId);
      if (!combat || combat.state !== 'active') {
        // Combat over — clean up active song rows for this bard
        for (const song of ctx.db.active_bard_song.by_bard.filter(arg.bardCharacterId)) {
          ctx.db.active_bard_song.id.delete(song.id);
        }
        return;
      }
    }

    const bard = ctx.db.character.id.find(arg.bardCharacterId);
    if (!bard) return;

    const songs = [...ctx.db.active_bard_song.by_bard.filter(arg.bardCharacterId)];
    if (songs.length === 0) return;

    // Gather party members and living enemies (shared across all songs this tick)
    const partyMembers = bardCombatId !== undefined
      ? [...ctx.db.combat_participant.by_combat.filter(bardCombatId)]
        .map((p: any) => ctx.db.character.id.find(p.characterId))
        .filter(Boolean)
      : partyMembersInLocation(ctx, bard);
    const enemies = bardCombatId !== undefined
      ? [...ctx.db.combat_enemy.by_combat.filter(bardCombatId)].filter((e: any) => e.currentHp > 0n)
      : [];

    // Process ALL songs (both active and fading) in this tick pass.
    // Fading songs fire their final effect then get deleted. Non-fading ones are rescheduled.
    for (const song of songs) {
      switch (song.songKey) {
        case 'bard_discordant_note': {
          // AoE sonic damage to all enemies — scales with level + CHA
          let totalDamage = 0n;
          for (const en of enemies) {
            const abilityBase = 2n * 5n;  // Discordant Note power=2
            const statScale = getAbilityStatScaling(
              { str: bard.str, dex: bard.dex, cha: bard.cha, wis: bard.wis, int: bard.int },
              'bard_discordant_note', bard.className, 'hybrid'
            );
            const abilityMult = getAbilityMultiplier(0n, 1n);
            const scaledDmg = ((abilityBase + statScale) * abilityMult) / 100n;
            const dmg = (scaledDmg * AOE_DAMAGE_MULTIPLIER) / 100n;
            const actualDmg = en.currentHp > dmg ? dmg : en.currentHp;
            totalDamage += actualDmg;
            const nextHp = en.currentHp > dmg ? en.currentHp - dmg : 0n;
            ctx.db.combat_enemy.id.update({ ...en, currentHp: nextHp });
          }
          // Small mana drain per pulse
          const freshBardDN = ctx.db.character.id.find(bard.id);
          if (freshBardDN && freshBardDN.mana > 0n) {
            const manaCost = 3n;
            const newMana = freshBardDN.mana > manaCost ? freshBardDN.mana - manaCost : 0n;
            ctx.db.character.id.update({ ...freshBardDN, mana: newMana });
          }
          logPrivateAndGroup(ctx, bard, 'damage', `Discordant Note deals ${totalDamage} damage to all enemies.`);
          break;
        }
        case 'bard_melody_of_mending': {
          // Group HP regen tick — accumulate total healed for feedback
          let totalHealed = 0n;
          for (const member of partyMembers) {
            if (!member) continue;
            const fresh = ctx.db.character.id.find(member.id);
            if (!fresh) continue;
            const healAmt = (10n * 65n) / 100n;
            const newHp = fresh.hp + healAmt > fresh.maxHp ? fresh.maxHp : fresh.hp + healAmt;
            totalHealed += newHp - fresh.hp;
            ctx.db.character.id.update({ ...fresh, hp: newHp });
          }
          // Small mana drain per pulse
          const freshBardMoM = ctx.db.character.id.find(bard.id);
          if (freshBardMoM && freshBardMoM.mana > 0n) {
            const manaCost = 3n;
            const newMana = freshBardMoM.mana > manaCost ? freshBardMoM.mana - manaCost : 0n;
            ctx.db.character.id.update({ ...freshBardMoM, mana: newMana });
          }
          logPrivateAndGroup(ctx, bard, 'heal', `Melody of Mending heals the group for ${totalHealed} health.`);
          break;
        }
        case 'bard_chorus_of_vigor': {
          // Group mana regen tick — accumulate total restored for feedback
          let totalMana = 0n;
          for (const member of partyMembers) {
            if (!member || member.maxMana === 0n) continue;
            const fresh = ctx.db.character.id.find(member.id);
            if (!fresh || fresh.maxMana === 0n) continue;
            const manaAmt = (8n * 65n) / 100n;
            const newMana = fresh.mana + manaAmt > fresh.maxMana ? fresh.maxMana : fresh.mana + manaAmt;
            totalMana += newMana - fresh.mana;
            ctx.db.character.id.update({ ...fresh, mana: newMana });
          }
          logPrivateAndGroup(ctx, bard, 'ability', `Chorus of Vigor restores ${totalMana} mana to the group.`);
          break;
        }
        case 'bard_march_of_wayfarers':
          // Refresh travel discount for all party members
          for (const member of partyMembers) {
            if (!member) continue;
            addCharacterEffect(ctx, member.id, 'travel_discount', 3n, 2n, 'March of Wayfarers');
          }
          appendPrivateEvent(ctx, bard.id, bard.ownerUserId, 'ability', 'March of Wayfarers refreshes travel stamina discount.');
          break;
        case 'bard_requiem_of_ruin': {
          if (!combatId) break;
          for (const en of enemies) {
            addEnemyEffect(ctx, combatId, en.id, 'damage_taken', 3n, 1n, 'Requiem of Ruin', bard.id);
          }
          logPrivateAndGroup(ctx, bard, 'ability', 'Requiem of Ruin weakens all enemies, increasing damage they take.');
          break;
        }
      }

      // Fading songs fire their final effect and are then removed — no reschedule
      if (song.isFading) {
        ctx.db.active_bard_song.id.delete(song.id);
      }
    }

    // Reschedule next tick only if at least one non-fading song remains
    const stillActive = songs.filter((s: any) => !s.isFading);
    if (stillActive.length > 0) {
      ctx.db.bard_song_tick.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 6_000_000n),
        bardCharacterId: arg.bardCharacterId,
        combatId: arg.combatId ?? undefined,
      });
    }
  });

  scheduledReducers['tick_casts'] = spacetimedb.reducer('tick_casts', { arg: deps.CastTick.rowType }, (ctx) => {
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    for (const cast of ctx.db.character_cast.iter()) {
      if (cast.endsAtMicros > nowMicros) continue;
      const character = ctx.db.character.id.find(cast.characterId);
      if (!character) {
        ctx.db.character_cast.id.delete(cast.id);
        continue;
      }
      // Check combat state before executing ability
      const castCombatId = activeCombatIdForCharacter(ctx, character.id);
      if (castCombatId) {
        const participant = [...ctx.db.combat_participant.by_combat.filter(castCombatId)].find(
          (row) => row.characterId === character.id
        );
        if (participant && participant.status !== 'active') {
          ctx.db.character_cast.id.delete(cast.id);
          continue;
        }
      }
      // Apply cooldown on use, not on success — prevents kill-shot abilities from losing
      // their cooldown when combat ends before the subscription row arrives.
      const cooldown = abilityCooldownMicros(ctx, cast.abilityTemplateId);
      const existingCooldown = [...ctx.db.ability_cooldown.by_character.filter(character.id)].find(
        (row) => row.abilityTemplateId === cast.abilityTemplateId
      );
      if (cooldown > 0n) {
        if (existingCooldown) {
          ctx.db.ability_cooldown.id.update({
            ...existingCooldown,
            startedAtMicros: nowMicros,
            durationMicros: cooldown,
          });
        } else {
          ctx.db.ability_cooldown.insert({
            id: 0n,
            characterId: character.id,
            abilityTemplateId: cast.abilityTemplateId,
            startedAtMicros: nowMicros,
            durationMicros: cooldown,
          });
        }
      }
      try {
        deps.executeAbilityAction(ctx, {
          actorType: 'character',
          actorId: character.id,
          abilityTemplateId: cast.abilityTemplateId,
          targetCharacterId: cast.targetCharacterId,
        });
      } catch (error) {
        // Ability failed due to validation — revert the cooldown so the player can retry
        if (cooldown > 0n) {
          if (existingCooldown) {
            ctx.db.ability_cooldown.id.update({ ...existingCooldown });
          } else {
            const revertCd = [...ctx.db.ability_cooldown.by_character.filter(character.id)]
              .find((row) => row.abilityTemplateId === cast.abilityTemplateId);
            if (revertCd) ctx.db.ability_cooldown.id.delete(revertCd.id);
          }
        }
        const message = String(error).replace(/^SenderError:\s*/i, '');
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          `Ability failed: ${message}`
        );
      }
      ctx.db.character_cast.id.delete(cast.id);
    }

    ctx.db.cast_tick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 200_000n),
    });
  });

  // ── Combat Loop Sub-Functions ──────────────────────────────────────────
  // Each function encapsulates one phase of the combat loop. They capture
  // closured variables (deps, ScheduleAt, etc.) from registerCombatReducers.

  /** Phase 1: Mark active participants with hp===0 as dead, clear effects & aggro. */
  const markNewlyDeadParticipants = (ctx: any, combat: any, participants: any[]) => {
    for (const p of participants) {
      if (p.status !== 'active') continue;
      const character = ctx.db.character.id.find(p.characterId);
      if (character && character.hp === 0n) {
        ctx.db.combat_participant.id.update({ ...p, status: 'dead' });
        clearCharacterEffectsOnDeath(ctx, character);
        for (const entry of ctx.db.aggro_entry.by_combat.filter(combat.id)) {
          if (entry.characterId === character.id && !entry.petId) {
            ctx.db.aggro_entry.id.delete(entry.id);
          }
        }
      }
    }
  };

  /** Phase 4: Materialize pending add enemies that have arrived. */
  const processPendingAdds = (ctx: any, combat: any, participants: any[], activeParticipants: any[], enemyName: string, nowMicros: bigint) => {
    for (const pending of ctx.db.combat_pending_add.by_combat.filter(combat.id)) {
      if (pending.arriveAtMicros > nowMicros) continue;
      const spawnRow = pending.spawnId ? ctx.db.enemy_spawn.id.find(pending.spawnId) : null;
      if (spawnRow) {
        const newEnemy = addEnemyToCombat(deps, ctx, combat, spawnRow, participants, true, pending.enemyRoleTemplateId ?? undefined);
        if (newEnemy && activeParticipants.length > 0) {
          ctx.db.combat_enemy.id.update({ ...newEnemy, aggroTargetCharacterId: activeParticipants[0].characterId });
        }
      }
      ctx.db.combat_pending_add.id.delete(pending.id);
      for (const p of activeParticipants) {
        const character = ctx.db.character.id.find(p.characterId);
        if (!character) continue;
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'combat', `A social add arrives to assist ${enemyName}.`);
      }
    }
  };



  /** Phase 7: Pet auto-attacks and ability usage. */
  const processPetCombat = (ctx: any, combat: any, livingEnemies: any[], nowMicros: bigint) => {
    const pets = [...ctx.db.active_pet.by_combat.filter(combat.id)];
    for (let pet of pets) {
      const owner = ctx.db.character.id.find(pet.characterId);
      if (!owner || owner.hp === 0n) {
        ctx.db.active_pet.id.delete(pet.id);
        continue;
      }
      let target = pet.targetEnemyId ? ctx.db.combat_enemy.id.find(pet.targetEnemyId) : null;
      if (!target || target.currentHp === 0n) {
        const preferred = owner.combatTargetEnemyId ? ctx.db.combat_enemy.id.find(owner.combatTargetEnemyId) : null;
        target = preferred ?? livingEnemies[0] ?? null;
      }
      if (!target) {
        if (pet.nextAutoAttackAt && pet.nextAutoAttackAt <= nowMicros) {
          ctx.db.active_pet.id.update({ ...pet, nextAutoAttackAt: nowMicros + RETRY_ATTACK_INTERVAL, targetEnemyId: undefined });
        }
        continue;
      }
      let nextAbilityAt = pet.nextAbilityAt;
      if (pet.abilityKey && pet.nextAbilityAt && pet.nextAbilityAt <= nowMicros) {
        const used = executeAbilityAction(ctx, {
          actorType: 'pet',
          actorId: pet.id,
          combatId: combat.id,
          abilityKey: pet.abilityKey,
          targetEnemyId: target.id,
        });
        if (used) {
          const cooldownMicros = (pet.abilityCooldownSeconds ?? 10n) * 1_000_000n;
          nextAbilityAt = nowMicros + cooldownMicros;
          pet = ctx.db.active_pet.id.find(pet.id) ?? pet;
        }
      }
      if (pet.nextAutoAttackAt && pet.nextAutoAttackAt > nowMicros) {
        if (nextAbilityAt !== pet.nextAbilityAt || target.id !== pet.targetEnemyId) {
          ctx.db.active_pet.id.update({ ...pet, nextAbilityAt, targetEnemyId: target.id });
        }
        continue;
      }
      const targetName = target.displayName ?? 'enemy';
      const { finalDamage } = resolveAttack(ctx, {
        seed: nowMicros + pet.id + target.id,
        baseDamage: pet.attackDamage ?? PET_BASE_DAMAGE,
        targetArmor: target.armorClass,
        canBlock: false,
        canParry: false,
        canDodge: true,
        currentHp: target.currentHp,
        logTargetId: owner.id,
        logOwnerId: owner.ownerUserId,
        messages: {
          dodge: `${targetName} dodges ${pet.name}'s attack.`,
          miss: `${pet.name} misses ${targetName}.`,
          parry: `${targetName} parries ${pet.name}'s attack.`,
          block: (damage) => `${targetName} blocks ${pet.name}'s attack for ${damage}.`,
          hit: (damage) => `${pet.name} hits ${targetName} for ${damage}.`,
        },
        applyHp: (updatedHp) => {
          ctx.db.combat_enemy.id.update({ ...target, currentHp: updatedHp });
        },
        groupId: combat.groupId,
        groupActorId: owner.id,
      });
      if (finalDamage > 0n) {
        let petEntry: typeof deps.AggroEntry.rowType | null = null;
        for (const entry of ctx.db.aggro_entry.by_combat.filter(combat.id)) {
          if (entry.enemyId !== target.id) continue;
          if (entry.petId && entry.petId === pet.id) {
            petEntry = entry;
            break;
          }
        }
        const tauntBonus = pet.abilityKey === 'pet_taunt' ? 5n : 0n;
        const aggroGain = finalDamage + tauntBonus;
        if (petEntry) {
          ctx.db.aggro_entry.id.update({ ...petEntry, value: petEntry.value + aggroGain });
        } else {
          ctx.db.aggro_entry.insert({
            id: 0n,
            combatId: combat.id,
            enemyId: target.id,
            characterId: owner.id,
            petId: pet.id,
            value: aggroGain,
          });
        }
      }
      ctx.db.active_pet.id.update({ ...pet, nextAutoAttackAt: nowMicros + AUTO_ATTACK_INTERVAL, nextAbilityAt, targetEnemyId: target.id });
    }
  };

  /** Phase 8: Victory — all enemies dead. Quest progress, loot, XP, renown, spawn cleanup. */
  const handleVictory = (
    ctx: any, combat: any, enemies: any[], participants: any[],
    activeParticipants: any[], enemyName: string, nowMicros: bigint
  ) => {
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      const currentParticipant = ctx.db.combat_participant.id.find(p.id);
      if (!character || !currentParticipant) continue;
      if (character.hp === 0n && currentParticipant.status !== 'dead') {
        markParticipantDead(ctx, currentParticipant, character, enemyName);
      }
    }
    const enemyTemplates = enemies
      .map((row) => ctx.db.enemy_template.id.find(row.enemyTemplateId))
      .filter((row): row is typeof deps.EnemyTemplate.rowType => Boolean(row));
    const totalBaseXp = enemyTemplates.reduce((sum, template) => {
      const base = template.xpReward && template.xpReward > 0n ? template.xpReward : template.level * 20n;
      return sum + base;
    }, 0n);
    const avgLevel = enemyTemplates.length > 0
      ? enemyTemplates.reduce((sum, template) => sum + template.level, 0n) / BigInt(enemyTemplates.length)
      : 1n;
    const primaryName = enemies[0]?.displayName ?? enemyTemplates[0]?.name ?? enemyName;
    const enemySpawnIds = new Map<bigint, bigint>();
    for (const enemyRow of enemies) {
      enemySpawnIds.set(enemyRow.id, enemyRow.spawnId);
    }
    resetSpawnAfterCombat(ctx, enemies, ScheduleAt, ENEMY_RESPAWN_MICROS, false);
    const combatLoc = ctx.db.location.id.find(combat.locationId);
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      if (!character) continue;
      for (const template of enemyTemplates) {
        updateQuestProgressForKill(ctx, character, template.id);
        rollKillLootDrop(ctx, character, template.id);
        grantFactionStandingForKill(ctx, character, template.id);
        incrementWorldStat(ctx, 'total_enemies_killed', 1n);
        if (combatLoc) {
          for (const activeEvent of ctx.db.world_event.by_status.filter('active')) {
            if (activeEvent.regionId !== combatLoc.regionId) continue;
            const eventSpawnTemplateIds = getEventSpawnTemplateIds(ctx, enemies, enemySpawnIds, activeEvent.id);
            if (!eventSpawnTemplateIds.has(template.id)) continue;
            awardEventContribution(ctx, character, activeEvent);
          }
        }
      }
    }
    if (combatLoc) {
      for (const template of enemyTemplates) {
        for (const activeEvent of ctx.db.world_event.by_status.filter('active')) {
          if (activeEvent.regionId !== combatLoc.regionId) continue;
          const eventKillTemplateIds = getEventSpawnTemplateIds(ctx, enemies, enemySpawnIds, activeEvent.id);
          if (!eventKillTemplateIds.has(template.id)) continue;
          advanceEventKillObjectives(ctx, activeEvent);
        }
      }
    }
    const eligible = participants.filter((p) => p.status !== 'dead');
    const splitCount = eligible.length > 0 ? BigInt(eligible.length) : 1n;
    const groupBonus = BigInt(Math.min(20, Math.max(0, (participants.length - 1) * 5)));
    const bonusMultiplier = 100n + groupBonus;
    const adjustedBase = (totalBaseXp * bonusMultiplier) / 100n;
    const fallenSuffix = buildFallenNamesSuffix(ctx, participants, (p, _char) => p.status === 'dead');
    const summaryName = enemies.length > 1 ? `${primaryName} and allies` : primaryName;
    const lootLocation = ctx.db.location.id.find(combat.locationId);
    const lootRegion = lootLocation ? ctx.db.region.id.find(lootLocation.regionId) : null;
    const lootDanger = lootRegion?.dangerMultiplier ?? 100n;
    const essenceTemplateMap = new Map<string, any>();
    for (const threshold of ESSENCE_TIER_THRESHOLDS) {
      const tmpl = [...ctx.db.item_template.iter()].find((t: any) => t.name === threshold.essenceName);
      if (tmpl) essenceTemplateMap.set(threshold.essenceName, tmpl);
    }
    const modifierTemplateMap = new Map<string, any>();
    for (const def of CRAFTING_MODIFIER_DEFS) {
      const tmpl = [...ctx.db.item_template.iter()].find((t: any) => t.name === def.name);
      if (tmpl) modifierTemplateMap.set(def.name, tmpl);
    }
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      if (!character) continue;
      const staleLoot = [...ctx.db.combat_loot.by_character.filter(character.id)];
      const staleCombatIds = new Set(staleLoot.map(row => row.combatId));
      for (const row of staleLoot) {
        ctx.db.combat_loot.id.delete(row.id);
      }
      for (const oldCombatId of staleCombatIds) {
        for (const result of ctx.db.combat_result.by_owner_user.filter(character.ownerUserId)) {
          if (result.combatId === oldCombatId && result.characterId === character.id) {
            ctx.db.combat_result.id.delete(result.id);
          }
        }
      }
      for (const template of enemyTemplates) {
        const lootTemplates = template
          ? generateLootTemplates(ctx, template, ctx.timestamp.microsSinceUnixEpoch + character.id, lootDanger)
          : [];
        for (const lootItem of lootTemplates) {
          ctx.db.combat_loot.insert({
            id: 0n,
            combatId: combat.id,
            ownerUserId: character.ownerUserId,
            characterId: character.id,
            itemTemplateId: lootItem.template.id,
            createdAt: ctx.timestamp,
            qualityTier: lootItem.qualityTier ?? undefined,
            affixDataJson: lootItem.affixDataJson ?? undefined,
            isNamed: lootItem.isNamed ?? undefined,
            craftQuality: lootItem.craftQuality ?? undefined,
          });
        }
        const essenceSeed = (character.id * 7n ^ ctx.timestamp.microsSinceUnixEpoch + template.id * 31n) % 100n;
        if (essenceSeed < 6n) {
          const enemyLevel = template.level ?? 1n;
          let essenceToDrop: any = null;
          for (const threshold of ESSENCE_TIER_THRESHOLDS) {
            if (enemyLevel >= threshold.minLevel) {
              essenceToDrop = essenceTemplateMap.get(threshold.essenceName);
              break;
            }
          }
          if (essenceToDrop) {
            ctx.db.combat_loot.insert({
              id: 0n, combatId: combat.id, ownerUserId: character.ownerUserId,
              characterId: character.id, itemTemplateId: essenceToDrop.id,
              createdAt: ctx.timestamp, qualityTier: undefined, affixDataJson: undefined, isNamed: undefined,
            });
          }
        }
        const modifierSeed = (character.id * 11n ^ ctx.timestamp.microsSinceUnixEpoch + template.id * 43n) % 100n;
        if (modifierSeed < 10n) {
          const enemyLevel = template.level ?? 1n;
          let eligibleNames: string[] = [];
          for (const threshold of MODIFIER_REAGENT_THRESHOLDS) {
            if (enemyLevel >= threshold.minLevel) {
              eligibleNames = threshold.reagentNames;
              break;
            }
          }
          if (eligibleNames.length > 0) {
            const pickIndex = Number((character.id + template.id) % BigInt(eligibleNames.length));
            const pickedName = eligibleNames[pickIndex];
            const modifierTemplate = modifierTemplateMap.get(pickedName);
            if (modifierTemplate) {
              ctx.db.combat_loot.insert({
                id: 0n, combatId: combat.id, ownerUserId: character.ownerUserId,
                characterId: character.id, itemTemplateId: modifierTemplate.id,
                createdAt: ctx.timestamp, qualityTier: undefined, affixDataJson: undefined, isNamed: undefined,
              });
            }
          }
        }
        const lootTable = template ? findLootTable(ctx, template) : null;
        const baseGoldReward = lootTable
          ? rollGold(ctx.timestamp.microsSinceUnixEpoch + character.id * 3n + template.id, lootTable.goldMin, lootTable.goldMax) + template.level
          : template.level;
        const goldFindBonus = getPerkBonusByField(ctx, character.id, 'goldFindBonus', character.level);
        const goldReward = goldFindBonus > 0 && baseGoldReward > 0n
          ? (baseGoldReward * BigInt(100 + goldFindBonus)) / 100n
          : baseGoldReward;
        if (goldReward > 0n) {
          ctx.db.character.id.update({ ...character, gold: (character.gold ?? 0n) + goldReward });
          const goldMsg = goldFindBonus > 0 ? `You gain ${goldReward} gold. (+${goldFindBonus}% gold find)` : `You gain ${goldReward} gold.`;
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward', goldMsg);
          logGroupEvent(ctx, combat.id, character.id, 'reward', `${character.name} gained ${goldReward} gold.`);
        }
      }
      // Announce all loot as clickable links
      const charLoot = [...ctx.db.combat_loot.by_character.filter(character.id)].filter(row => row.combatId === combat.id);
      if (charLoot.length > 0) {
        const RARITY_COLORS: Record<string, string> = {
          common: '#ffffff', uncommon: '#22c55e', rare: '#3b82f6', epic: '#aa44ff', legendary: '#ff8800',
        };
        const lootLines: string[] = ['Loot dropped:'];
        for (const lootRow of charLoot) {
          const tmpl = ctx.db.item_template.id.find(lootRow.itemTemplateId);
          if (!tmpl) continue;
          const rarity = (lootRow.qualityTier || tmpl.rarity || 'common').toLowerCase();
          const color = RARITY_COLORS[rarity] || '#ffffff';
          lootLines.push(`  {{color:${color}}}[Take ${tmpl.name}]{{/color}}`);
        }
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward', lootLines.join('\n'));
      } else {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
          `No loot dropped from ${summaryName}.`);
      }
      const resultRow = ctx.db.combat_result.insert({
        id: 0n, ownerUserId: character.ownerUserId, characterId: character.id,
        groupId: combat.groupId, combatId: combat.id,
        summary: `Victory against ${summaryName}.${fallenSuffix}`, createdAt: ctx.timestamp,
      });
      if (charLoot.length === 0) {
        ctx.db.combat_result.id.delete(resultRow.id);
      }
    }
    createCorpsesForDead(ctx, deps, participants);
    applyDeathPenalties(ctx, deps, participants, appendPrivateEvent, logGroupEvent, combat.id);
    clearCombatArtifacts(ctx, combat.id);
    ctx.db.combat_encounter.id.update({ ...combat, state: 'resolved' });
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      if (!character) continue;
      if (p.status === 'dead') {
        const reward = deps.awardXp(ctx, character, avgLevel, (adjustedBase / splitCount) / 2n);
        if (reward.xpGained > 0n) {
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward', `You gain ${reward.xpGained} XP (reduced for defeat).`);
          logGroupEvent(ctx, combat.id, character.id, 'reward', `${character.name} gained ${reward.xpGained} XP (reduced for defeat).`);
        }
        if (reward.leveledUp) {
          const pending = reward.pendingLevels ?? 1n;
          const targetLevel = character.level + 1n;
          const levelText = pending > 1n ? `${character.name} has ${pending} levels pending (next: level ${targetLevel})!` : `${character.name} is ready to advance to level ${targetLevel}!`;
          logGroupEvent(ctx, combat.id, character.id, 'system', levelText);
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
            pending > 1n ? `You have ${pending} levels pending (next: level ${targetLevel})! Click [Level Up] when ready.` : `You can advance to level ${targetLevel}! Click [Level Up] when ready.`);
        }
        continue;
      }
      const xpBonusPct = getPerkBonusByField(ctx, character.id, 'xpBonus', character.level);
      const baseXpAmount = adjustedBase / splitCount;
      const scaledXpAmount = xpBonusPct > 0 ? (baseXpAmount * BigInt(100 + xpBonusPct)) / 100n : baseXpAmount;
      const reward = deps.awardXp(ctx, character, avgLevel, scaledXpAmount);
      if (reward.xpGained > 0n) {
        const xpMsg = xpBonusPct > 0 ? `You gain ${reward.xpGained} XP. (+${xpBonusPct}% XP bonus)` : `You gain ${reward.xpGained} XP.`;
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward', xpMsg);
        logGroupEvent(ctx, combat.id, character.id, 'reward', `${character.name} gained ${reward.xpGained} XP.`);
      }
      if (reward.leveledUp) {
        const pending = reward.pendingLevels ?? 1n;
        const targetLevel = character.level + 1n;
        const levelText = pending > 1n ? `${character.name} has ${pending} levels pending (next: level ${targetLevel})!` : `${character.name} is ready to advance to level ${targetLevel}!`;
        logGroupEvent(ctx, combat.id, character.id, 'system', levelText);
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          pending > 1n ? `You have ${pending} levels pending (next: level ${targetLevel})! Click [Level Up] when ready.` : `You can advance to level ${targetLevel}! Click [Level Up] when ready.`);
      }
      const primaryEnemy = enemies[0];
      if (primaryEnemy) {
        const template = ctx.db.enemy_template.id.find(primaryEnemy.enemyTemplateId);
        if (template) {
          if (template.isBoss) {
            const bossKey = `boss_${template.name.toLowerCase().replace(/\s+/g, '_')}`;
            const serverFirstRenown = awardServerFirst(ctx, character, 'boss_kill', bossKey, RENOWN_GAIN.BOSS_KILL_BASE, `${template.name} slain`);
            awardRenown(ctx, character, serverFirstRenown, `Defeating ${template.name}`);
          } else {
            const renownAmount = template.level > 0n ? template.level : 1n;
            awardRenown(ctx, character, renownAmount, `Victory in combat`);
          }
        }
      }
    }
  };


  /** Phase 10: Defeat — all participants dead/fled. Spawn reset, event credit, corpses, XP penalty. */
  const handleDefeat = (
    ctx: any, combat: any, enemies: any[], participants: any[], enemyName: string, nowMicros: bigint
  ) => {
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      const currentParticipant = ctx.db.combat_participant.id.find(p.id);
      if (!currentParticipant) continue;
      if (character && character.hp === 0n && currentParticipant.status !== 'dead') {
        markParticipantDead(ctx, currentParticipant, character, enemyName);
      }
    }
    resetSpawnAfterCombat(ctx, enemies, ScheduleAt, ENEMY_RESPAWN_MICROS, true);
    const killedEnemies = enemies.filter((e: any) => e.currentHp === 0n);
    if (killedEnemies.length > 0) {
      const deathCombatLoc = ctx.db.location.id.find(combat.locationId);
      if (deathCombatLoc) {
        for (const activeEvent of ctx.db.world_event.by_status.filter('active')) {
          if (activeEvent.regionId !== deathCombatLoc.regionId) continue;
          for (const killedEnemy of killedEnemies) {
            const isEventKill = [...ctx.db.event_spawn_enemy.by_spawn.filter(killedEnemy.spawnId)]
              .some(link => link.eventId === activeEvent.id);
            if (!isEventKill) continue;
            for (const p of participants) {
              const character = ctx.db.character.id.find(p.characterId);
              if (!character) continue;
              awardEventContribution(ctx, character, activeEvent);
            }
            advanceEventKillObjectives(ctx, activeEvent);
          }
        }
      }
    }
    const fallenSuffix = buildFallenNamesSuffix(ctx, participants, (_p, character) => character.hp === 0n);
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      if (!character) continue;
      const defeatResult = ctx.db.combat_result.insert({
        id: 0n, ownerUserId: character.ownerUserId, characterId: character.id,
        groupId: combat.groupId, combatId: combat.id,
        summary: `Defeat against ${enemyName}.${fallenSuffix}`, createdAt: ctx.timestamp,
      });
      ctx.db.combat_result.id.delete(defeatResult.id);
    }
    createCorpsesForDead(ctx, deps, participants);
    clearCombatArtifacts(ctx, combat.id);
    ctx.db.combat_encounter.id.update({ ...combat, state: 'resolved' });
    applyDeathPenalties(ctx, deps, participants, appendPrivateEvent);
  };

  // ── Round-Based Combat Functions (REMOVED -- real-time combat_loop handles everything) ──

  // (getCurrentRound, upsertCombatAction, checkAllSubmittedAndResolve, resolveRound all removed)

  /** Process a single player auto-attack during round resolution. */
  // NOTE: Ability damage is logged separately via executeAbility -> resolveAbility -> appendPrivateEvent
  // in spacetimedb/src/helpers/combat.ts. This function only handles weapon auto-attacks.
  const processPlayerAutoAttackForRound = (
    ctx: any, combat: any, character: any, participant: any,
    enemies: any[], nowMicros: bigint
  ) => {
    const livingEnemies = enemies
      .map((e: any) => ctx.db.combat_enemy.id.find(e.id))
      .filter((e: any) => e && e.currentHp > 0n);
    if (livingEnemies.length === 0) return;

    const targetEnemy = character.combatTargetEnemyId
      ? livingEnemies.find((e: any) => e.id === character.combatTargetEnemyId) ?? livingEnemies[0]
      : livingEnemies[0];

    const weapon = deps.getEquippedWeaponStats(ctx, character.id);
    const bonuses = getEquippedBonuses(ctx, character.id);
    const weaponLabel = weapon.name || 'fists';
    // Auto-attack damage: weapon base + DPS contribution + level scaling + STR
    // DPS/2 adds weapon quality; level adds progression; STR adds stat scaling
    const baseDamage = (weapon.baseDamage ?? 0n) + (weapon.dps ?? 0n) / 2n + (character.level ?? 1n) + (bonuses.str ?? 0n);
    const template = ctx.db.enemy_template.id.find(targetEnemy.enemyTemplateId);
    const eName = targetEnemy.displayName ?? template?.name ?? 'enemy';
    const groupId = effectiveGroupId(character);
    const seed = nowMicros + character.id * 37n + targetEnemy.id;
    const shieldEquipped = hasShieldEquipped(ctx, character.id);

    resolveAttack(ctx, {
      seed,
      baseDamage,
      targetArmor: targetEnemy.armorClass ?? 0n,
      canBlock: false,
      canParry: false,
      canDodge: false,
      currentHp: targetEnemy.currentHp,
      logTargetId: character.id,
      logOwnerId: character.ownerUserId,
      messages: {
        dodge: `${eName} dodges your ${weaponLabel} swing.`,
        miss: `Your ${weaponLabel} misses ${eName}.`,
        parry: `${eName} parries your ${weaponLabel} swing.`,
        block: (d: bigint) => `${eName} blocks your ${weaponLabel} swing, taking ${d} damage.`,
        hit: (d: bigint) => `Your ${weaponLabel} hits ${eName} for ${d} damage.`,
        crit: (d: bigint) => `Your ${weaponLabel} crits ${eName} for ${d} damage!`,
      },
      applyHp: (nextHp: bigint) => {
        ctx.db.combat_enemy.id.update({ ...targetEnemy, currentHp: nextHp });
        if (nextHp === 0n) {
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'combat',
            `${eName} falls!`);
        }
      },
      characterDex: character.dex,
      weaponName: weapon.name,
      weaponType: weapon.type,
      groupId: groupId ?? undefined,
      groupActorId: character.id,
      groupMessages: groupId ? {
        dodge: `${eName} dodges ${character.name}'s ${weaponLabel} swing.`,
        miss: `${character.name}'s ${weaponLabel} misses ${eName}.`,
        parry: `${eName} parries ${character.name}'s ${weaponLabel} swing.`,
        block: (d: bigint) => `${eName} blocks ${character.name}'s ${weaponLabel} swing (${d} damage).`,
        hit: (d: bigint) => `${character.name}'s ${weaponLabel} hits ${eName} for ${d} damage.`,
        crit: (d: bigint) => `${character.name}'s ${weaponLabel} crits ${eName} for ${d} damage!`,
      } : undefined,
    });

    // Generate aggro
    const aggroTable = ctx.db.aggro_entry;
    const existingAggro = [...aggroTable.by_combat.filter(combat.id)]
      .find((e: any) => e.enemyId === targetEnemy.id && e.characterId === character.id && !e.petId);
    if (existingAggro) {
      aggroTable.id.update({ ...existingAggro, value: existingAggro.value + baseDamage });
    }
  };

  /** Try to use an enemy ability for the round; returns true if ability was used. */
  const tryEnemyAbilityForRound = (
    ctx: any, combat: any, enemy: any, template: any,
    activeParticipants: any[], nowMicros: bigint
  ): boolean => {
    const enemyAbilities = [...ctx.db.enemy_ability.by_template.filter(template.id)];
    if (enemyAbilities.length === 0) return false;

    // Check for stun
    const stunEffect = [...ctx.db.combat_enemy_effect.by_enemy.filter(enemy.id)]
      .find((e: any) => e.effectType === 'stun');
    if (stunEffect && stunEffect.roundsRemaining > 0n) return false;

    const cooldownTable = ctx.db.combat_enemy_cooldown;
    if (!cooldownTable) return false;

    // Score and pick an ability (same AI as existing processEnemyAbilities)
    type Candidate = { ability: any; target: any; score: number };
    const candidates: Candidate[] = [];
    for (const ability of enemyAbilities) {
      const cooldown = [...cooldownTable.by_enemy.filter(enemy.id)]
        .find((row: any) => row.abilityKey === ability.abilityKey);
      if (cooldown && cooldown.readyAtMicros > nowMicros) continue;
      // Clean up expired cooldowns
      if (cooldown && cooldown.readyAtMicros <= nowMicros) {
        for (const row of cooldownTable.by_enemy.filter(enemy.id)) {
          if (row.abilityKey === ability.abilityKey) cooldownTable.id.delete(row.id);
        }
      }
      const target = pickEnemyTarget(ability.targetRule, activeParticipants, ctx, combat.id, enemy.id);
      if (!target) continue;

      // Skip duplicate effects
      if (!target.petId && ability.kind === 'dot') {
        const alreadyApplied = [...ctx.db.character_effect.by_character.filter(target.characterId!)]
          .some((effect: any) => effect.effectType === 'dot' && effect.sourceAbility === ability.name);
        if (alreadyApplied) continue;
      }

      let score = DEFAULT_AI_WEIGHT;
      if (ability.kind === 'dot') score += 10;
      if (ability.targetRule === 'lowest_hp') score += 20;
      if (ability.kind === 'heal') score += 30;
      if (ability.kind === 'buff') score += 15;
      const hash = hashString(`${ability.abilityKey}:${combat.id}:${enemy.id}`);
      score += (hash % (DEFAULT_AI_RANDOMNESS * 2)) - DEFAULT_AI_RANDOMNESS;
      candidates.push({ ability, target, score });
    }

    if (candidates.length === 0) return false;
    const chosen = candidates.sort((a, b) => b.score - a.score)[0];
    const roll = Number((nowMicros + enemy.id + combat.id) % 100n);
    if (roll >= DEFAULT_AI_CHANCE) return false;

    // Execute the ability immediately (round resolution, no cast time)
    executeAbilityAction(ctx, {
      actorType: 'enemy',
      actorId: enemy.id,
      combatId: combat.id,
      abilityKey: chosen.ability.abilityKey,
      targetCharacterId: chosen.target.characterId,
      targetPetId: chosen.target.petId,
    });

    // Set cooldown
    const cooldownMicros = (chosen.ability.cooldownSeconds ?? 0n) * 1_000_000n;
    if (cooldownMicros > 0n) {
      for (const row of cooldownTable.by_enemy.filter(enemy.id)) {
        if (row.abilityKey === chosen.ability.abilityKey) cooldownTable.id.delete(row.id);
      }
      cooldownTable.insert({
        id: 0n, combatId: combat.id, enemyId: enemy.id,
        abilityKey: chosen.ability.abilityKey, readyAtMicros: nowMicros + cooldownMicros,
      });
    }
    return true;
  };

  /** Process a single enemy auto-attack during round resolution. */
  const processEnemyAutoAttackForRound = (
    ctx: any, combat: any, enemy: any, template: any,
    participants: any[], activeParticipants: any[], nowMicros: bigint
  ) => {
    if (activeParticipants.length === 0) return;
    const target = pickEnemyTarget('aggro', activeParticipants, ctx, combat.id, enemy.id);
    if (!target) return;

    if (target.petId) {
      // Attack pet
      const pet = ctx.db.active_pet.id.find(target.petId);
      if (!pet || pet.currentHp === 0n) return;
      const rawDmg = enemy.attackDamage ?? template.baseDamage ?? 5n;
      const nextHp = pet.currentHp > rawDmg ? pet.currentHp - rawDmg : 0n;
      ctx.db.active_pet.id.update({ ...pet, currentHp: nextHp });
      const owner = ctx.db.character.id.find(pet.characterId);
      if (owner) {
        appendPrivateEvent(ctx, owner.id, owner.ownerUserId, 'damage',
          `${enemy.displayName} strikes ${pet.name} for ${rawDmg} damage.${nextHp === 0n ? ` ${pet.name} falls!` : ''}`);
      }
      if (nextHp === 0n) ctx.db.active_pet.id.delete(pet.id);
      return;
    }

    const character = ctx.db.character.id.find(target.characterId!);
    if (!character || character.hp === 0n) return;
    const participant = [...ctx.db.combat_participant.by_combat.filter(combat.id)]
      .find((p: any) => p.characterId === character.id);
    if (!participant || participant.status !== 'active') return;

    const groupId = effectiveGroupId(character);
    const eName = enemy.displayName ?? template?.name ?? 'enemy';
    const baseDamage = enemy.attackDamage ?? template.baseDamage ?? 5n;
    const seed = nowMicros + enemy.id * 41n + character.id;
    const shieldEquipped = hasShieldEquipped(ctx, character.id);

    const result = resolveAttack(ctx, {
      seed,
      baseDamage,
      targetArmor: character.armorClass ?? 0n,
      canBlock: shieldEquipped,
      blockChanceBasis: shieldEquipped ? (character.dex ?? 0n) : undefined,
      blockMitigationPercent: shieldEquipped ? (50n + (character.str ?? 0n) / 5n) : undefined,
      canParry: true, // v2.0: all player characters can parry
      canDodge: true,
      dodgeChanceBasis: character.dodgeChance ?? 50n,
      parryChanceBasis: character.parryChance ?? 50n,
      attackerHitBonus: 0n,
      currentHp: character.hp,
      logTargetId: character.id,
      logOwnerId: character.ownerUserId,
      messages: {
        dodge: `You dodge ${eName}'s strike.`,
        miss: `${eName}'s strike misses you.`,
        parry: `You parry ${eName}'s strike.`,
        block: (d: bigint) => `You block ${eName}'s strike, taking ${d} damage.`,
        hit: (d: bigint) => `${eName} strikes you for ${d} damage.`,
        crit: (d: bigint) => `${eName} lands a crushing blow for ${d} damage!`,
      },
      applyHp: (nextHp: bigint) => {
        ctx.db.character.id.update({ ...character, hp: nextHp });
        if (nextHp === 0n) {
          markParticipantDead(ctx, participant, character, eName);
        }
      },
      targetCharacterId: character.id,
      groupId: groupId ?? undefined,
      groupActorId: character.id,
      groupMessages: groupId ? {
        dodge: `${character.name} dodges ${eName}'s strike.`,
        miss: `${eName}'s strike misses ${character.name}.`,
        parry: `${character.name} parries ${eName}'s strike.`,
        block: (d: bigint) => `${character.name} blocks ${eName}'s strike (${d}).`,
        hit: (d: bigint) => `${eName} strikes ${character.name} for ${d} damage.`,
        crit: (d: bigint) => `${eName} lands a crushing blow on ${character.name} for ${d}!`,
      } : undefined,
    });
  };

  /** Tick all effects once per round (replaces EffectTick/HotTick). */
  const tickEffectsForRound = (ctx: any, combatId: bigint, participants: any[], _nowMicros: bigint) => {
    // Tick character effects (DoTs, HoTs, buffs)
    // Duration decrements every 1s tick, but damage/heal only applies every EFFECT_TICK_SECONDS
    for (const p of participants) {
      const effects = [...ctx.db.character_effect.by_character.filter(p.characterId)];
      for (const effect of effects) {
        const character = ctx.db.character.id.find(p.characterId);
        if (!character) continue;

        // Only apply DoT/HoT damage on tick boundaries (every 3s)
        const isDamageTick = effect.roundsRemaining % EFFECT_TICK_SECONDS === 0n;

        if (effect.effectType === 'regen' && character.hp > 0n && isDamageTick) {
          const healed = character.hp + effect.magnitude > character.maxHp
            ? character.maxHp : character.hp + effect.magnitude;
          ctx.db.character.id.update({ ...character, hp: healed });
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'heal',
            `${effect.sourceAbility ?? 'Regeneration'} soothes you for ${effect.magnitude} HP.`);
        } else if (effect.effectType === 'dot' && character.hp > 0n && isDamageTick) {
          const dmg = effect.magnitude > 0n ? effect.magnitude : -effect.magnitude;
          const nextHp = character.hp > dmg ? character.hp - dmg : 0n;
          ctx.db.character.id.update({ ...character, hp: nextHp });
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'damage',
            `You suffer ${dmg} damage from ${effect.sourceAbility ?? 'a lingering effect'}.`);
          if (nextHp === 0n) {
            const participant = [...ctx.db.combat_participant.by_combat.filter(combatId)]
              .find((cp: any) => cp.characterId === character.id);
            if (participant) markParticipantDead(ctx, participant, character, effect.sourceAbility ?? 'an effect');
          }
        }

        // Decrement duration
        const newRounds = effect.roundsRemaining > 0n ? effect.roundsRemaining - 1n : 0n;
        if (newRounds <= 0n) {
          // Remove hp_bonus before deleting
          if (effect.effectType === 'hp_bonus') {
            const c = ctx.db.character.id.find(p.characterId);
            if (c) {
              const nextMax = c.maxHp > effect.magnitude ? c.maxHp - effect.magnitude : 0n;
              const nextHp = c.hp > nextMax ? nextMax : c.hp;
              ctx.db.character.id.update({ ...c, maxHp: nextMax, hp: nextHp });
            }
          }
          // Log expiry for combat-relevant effects (skip food/travel to avoid spam)
          const EXPIRY_LOG_TYPES = ['regen', 'dot', 'damage_up', 'armor_up', 'ac_bonus', 'damage_shield', 'hp_bonus', 'magic_resist', 'stamina_free', 'stun', 'armor_down'];
          if (EXPIRY_LOG_TYPES.includes(effect.effectType)) {
            const expiryChar = ctx.db.character.id.find(p.characterId);
            if (expiryChar) {
              const effectLabel = effect.effectType === 'regen' ? 'regeneration' : effect.effectType === 'dot' ? 'damage over time' : effect.effectType === 'damage_up' ? 'damage boost' : effect.effectType === 'armor_up' ? 'armor boost' : effect.effectType === 'ac_bonus' ? 'AC bonus' : effect.effectType === 'damage_shield' ? 'damage shield' : effect.effectType === 'hp_bonus' ? 'HP bonus' : effect.effectType === 'magic_resist' ? 'magic resistance' : effect.effectType === 'stamina_free' ? 'free stamina' : effect.effectType === 'stun' ? 'stun' : effect.effectType === 'armor_down' ? 'armor reduction' : effect.effectType;
              appendPrivateEvent(ctx, expiryChar.id, expiryChar.ownerUserId, 'system',
                `The effect of ${effect.sourceAbility ?? effect.effectType} (${effectLabel}) has worn off.`);
            }
          }
          ctx.db.character_effect.id.delete(effect.id);
        } else {
          ctx.db.character_effect.id.update({ ...effect, roundsRemaining: newRounds });
        }
      }
    }

    // Tick enemy effects (DoTs on enemies)
    for (const effect of ctx.db.combat_enemy_effect.by_combat.filter(combatId)) {
      const enemy = ctx.db.combat_enemy.id.find(effect.enemyId);
      if (!enemy || enemy.currentHp === 0n) {
        ctx.db.combat_enemy_effect.id.delete(effect.id);
        continue;
      }

      // Only apply DoT damage on tick boundaries (every 3s)
      if (effect.effectType === 'dot' && effect.roundsRemaining % EFFECT_TICK_SECONDS === 0n) {
        const dmg = effect.magnitude > 0n ? effect.magnitude : -effect.magnitude;
        const nextHp = enemy.currentHp > dmg ? enemy.currentHp - dmg : 0n;
        ctx.db.combat_enemy.id.update({ ...enemy, currentHp: nextHp });

        // Notify participants
        for (const p of participants) {
          const character = ctx.db.character.id.find(p.characterId);
          if (character) {
            appendPrivateEvent(ctx, character.id, character.ownerUserId, 'damage',
              `${effect.sourceAbility ?? 'A lingering effect'} sears ${enemy.displayName} for ${dmg}.`);
          }
        }

        // Life drain: heal the caster
        if (effect.ownerCharacterId) {
          const caster = ctx.db.character.id.find(effect.ownerCharacterId);
          if (caster && caster.hp > 0n) {
            const healAmt = (dmg * DOT_LIFE_DRAIN_PERCENT) / 100n > 0n ? (dmg * DOT_LIFE_DRAIN_PERCENT) / 100n : 1n;
            const newHp = caster.hp + healAmt > caster.maxHp ? caster.maxHp : caster.hp + healAmt;
            ctx.db.character.id.update({ ...caster, hp: newHp });
          }
        }
      }

      // Stun: decrement rounds
      if (effect.effectType === 'stun') {
        const newRounds = effect.roundsRemaining > 0n ? effect.roundsRemaining - 1n : 0n;
        if (newRounds <= 0n) {
          // Notify all participants that enemy stun faded
          for (const p of participants) {
            const pc = ctx.db.character.id.find(p.characterId);
            if (pc) appendPrivateEvent(ctx, pc.id, pc.ownerUserId, 'system',
              `${effect.sourceAbility ?? 'Stun'} on ${enemy.displayName} fades.`);
          }
          ctx.db.combat_enemy_effect.id.delete(effect.id);
        } else {
          ctx.db.combat_enemy_effect.id.update({ ...effect, roundsRemaining: newRounds });
        }
        continue;
      }

      // Decrement duration for non-stun effects
      const newRounds = effect.roundsRemaining > 0n ? effect.roundsRemaining - 1n : 0n;
      if (newRounds <= 0n) {
        // Notify all participants that enemy effect faded
        for (const p of participants) {
          const pc = ctx.db.character.id.find(p.characterId);
          if (pc) appendPrivateEvent(ctx, pc.id, pc.ownerUserId, 'system',
            `${effect.sourceAbility ?? effect.effectType} on ${enemy.displayName} fades.`);
        }
        ctx.db.combat_enemy_effect.id.delete(effect.id);
      } else {
        ctx.db.combat_enemy_effect.id.update({ ...effect, roundsRemaining: newRounds });
      }
    }
  };

  // ── Use Ability Realtime Reducer ──────────────────────────────────────

  spacetimedb.reducer('use_ability_realtime', {
    characterId: t.u64(),
    abilityTemplateId: t.u64(),
    targetEnemyId: t.u64().optional(),
    targetCharacterId: t.u64().optional(),
  }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const combatId = activeCombatIdForCharacter(ctx, character.id);
    if (!combatId) return failCombat(ctx, character, 'Not in combat');

    const ability = ctx.db.ability_template.id.find(args.abilityTemplateId);
    if (!ability || ability.characterId !== character.id) {
      return failCombat(ctx, character, 'Ability not available');
    }

    // Check cooldown
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    const cd = [...ctx.db.ability_cooldown.by_character.filter(character.id)]
      .find((row: any) => row.abilityTemplateId === args.abilityTemplateId);
    if (cd && cd.startedAtMicros + cd.durationMicros > nowMicros) {
      return failCombat(ctx, character, `${ability.name} is on cooldown`);
    }

    // Check if already casting
    const existingCast = [...ctx.db.character_cast.by_character.filter(character.id)][0];
    if (existingCast && existingCast.endsAtMicros > nowMicros) {
      return failCombat(ctx, character, 'Already casting');
    }

    // Determine cast time (with mana floor applied)
    const castMicros = abilityCastMicros(ctx, args.abilityTemplateId);

    if (castMicros > 0n) {
      // Has cast time — insert character_cast row, tick_casts will execute when done
      if (existingCast) ctx.db.character_cast.id.delete(existingCast.id);
      ctx.db.character_cast.insert({
        id: 0n,
        characterId: character.id,
        abilityTemplateId: args.abilityTemplateId,
        targetCharacterId: args.targetCharacterId,
        endsAtMicros: nowMicros + castMicros,
      });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
        `Casting ${ability.name}...`);
      // Ensure cast tick chain is running to process this cast
      ensureCastTickScheduled(ctx);
      return;
    }

    // No cast time — execute immediately
    try {
      executeAbilityAction(ctx, {
        actorType: 'character',
        actorId: character.id,
        abilityTemplateId: args.abilityTemplateId,
        targetCharacterId: args.targetCharacterId,
      });
      // Set cooldown
      const cooldownDuration = abilityCooldownMicros(ctx, args.abilityTemplateId);
      if (cooldownDuration > 0n) {
        for (const cdRow of ctx.db.ability_cooldown.by_character.filter(character.id)) {
          if (cdRow.abilityTemplateId === args.abilityTemplateId) {
            ctx.db.ability_cooldown.id.delete(cdRow.id);
          }
        }
        ctx.db.ability_cooldown.insert({
          id: 0n,
          characterId: character.id,
          abilityTemplateId: args.abilityTemplateId,
          startedAtMicros: nowMicros,
          durationMicros: cooldownDuration,
        });
      }
    } catch (_e) {
      failCombat(ctx, character, 'Ability failed');
    }
  });

  // ── Post-Combat Summary (removed — LLM narration too slow) ──

  // ── Resolve Round Timer (kept registered but no-ops -- tables still exist) ──

  if (RoundTimerTick) {
    scheduledReducers['resolve_round_timer'] = spacetimedb.reducer(
      'resolve_round_timer', { arg: RoundTimerTick.rowType }, (ctx, { arg }) => {
        // No-op: round-based combat removed
        return;
      }
    );
  }

  // ── Real-Time Combat Loop ───────────────────────────────────────────

  scheduledReducers['combat_loop'] = spacetimedb.reducer('combat_loop', { arg: CombatLoopTick.rowType }, (ctx, { arg }) => {
    const combat = ctx.db.combat_encounter.id.find(arg.combatId);
    if (!combat || combat.state !== 'active') return;

    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    const participants = [...ctx.db.combat_participant.by_combat.filter(combat.id)];
    const enemies = [...ctx.db.combat_enemy.by_combat.filter(combat.id)];

    // Mark newly dead participants
    markNewlyDeadParticipants(ctx, combat, participants);

    const activeParticipants = [...ctx.db.combat_participant.by_combat.filter(combat.id)]
      .filter((p: any) => p.status === 'active');

    const enemyName = enemies[0]?.displayName ??
      ctx.db.enemy_template.id.find(enemies[0]?.enemyTemplateId)?.name ?? 'enemy';

    // Process pending adds
    processPendingAdds(ctx, combat, participants, activeParticipants, enemyName, nowMicros);

    // Player auto-attacks (check nextAutoAttackAt timing)
    for (const p of activeParticipants) {
      const character = ctx.db.character.id.find(p.characterId);
      if (!character || character.hp === 0n) continue;
      const participant = ctx.db.combat_participant.id.find(p.id);
      if (!participant || participant.status !== 'active') continue;
      // Only auto-attack if nextAutoAttackAt has passed
      if (participant.nextAutoAttackAt > nowMicros) continue;
      processPlayerAutoAttackForRound(ctx, combat, character, participant, enemies, nowMicros);
      // Schedule next auto-attack based on weapon speed
      const weapon = deps.getEquippedWeaponStats(ctx, character.id);
      ctx.db.combat_participant.id.update({
        ...ctx.db.combat_participant.id.find(participant.id)!,
        nextAutoAttackAt: nowMicros + weapon.speed,
      });
    }

    // Enemy actions (abilities + auto-attacks, check nextAutoAttackAt timing)
    const refreshedEnemies = [...ctx.db.combat_enemy.by_combat.filter(combat.id)];
    const refreshedActive = [...ctx.db.combat_participant.by_combat.filter(combat.id)]
      .filter((p: any) => p.status === 'active');

    for (const enemy of refreshedEnemies) {
      if (enemy.currentHp === 0n) continue;
      if (enemy.nextAutoAttackAt > nowMicros) continue;
      const template = ctx.db.enemy_template.id.find(enemy.enemyTemplateId);
      if (!template) continue;
      const usedAbility = tryEnemyAbilityForRound(ctx, combat, enemy, template, refreshedActive, nowMicros);
      if (!usedAbility) {
        processEnemyAutoAttackForRound(ctx, combat, enemy, template, participants, refreshedActive, nowMicros);
      }
      // Schedule next enemy auto-attack
      const speed = deps.getEnemyAttackSpeed(template.role ?? 'damage');
      ctx.db.combat_enemy.id.update({
        ...ctx.db.combat_enemy.id.find(enemy.id)!,
        nextAutoAttackAt: nowMicros + speed,
      });
    }

    // Pet combat
    const livingEnemies = [...ctx.db.combat_enemy.by_combat.filter(combat.id)]
      .filter((e: any) => e.currentHp > 0n);
    processPetCombat(ctx, combat, livingEnemies, nowMicros);

    // Tick effects — damage/heal ticks every 3s, duration decrements every 1s
    tickEffectsForRound(ctx, combat.id, participants, nowMicros);

    // Retarget characters whose target died
    const aliveEnemyIds = new Set(livingEnemies.map((e: any) => e.id));
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      if (!character) continue;
      if (character.combatTargetEnemyId && !aliveEnemyIds.has(character.combatTargetEnemyId)) {
        ctx.db.character.id.update({
          ...character,
          combatTargetEnemyId: livingEnemies[0]?.id ?? undefined,
        });
      }
    }

    // Victory check
    if (livingEnemies.length === 0) {
      handleVictory(ctx, combat, enemies, participants, activeParticipants, enemyName, nowMicros);
      return;
    }

    // Defeat check
    let stillActive = false;
    for (const p of ctx.db.combat_participant.by_combat.filter(combat.id)) {
      if (p.status !== 'active') continue;
      const character = ctx.db.character.id.find(p.characterId);
      if (character && character.hp > 0n) { stillActive = true; break; }
    }
    if (!stillActive) {
      handleDefeat(ctx, combat, enemies, participants, enemyName, nowMicros);
      return;
    }

    // Schedule next tick
    scheduleCombatTick(ctx, combat.id);
  });
};

