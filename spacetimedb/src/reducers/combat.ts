import { ENEMY_ABILITIES } from '../data/abilities/enemy_abilities';
import { calculateStatScaledAutoAttack, calculateCritChance, getCritMultiplier } from '../data/combat_scaling';
import { TANK_CLASSES, HEALER_CLASSES } from '../data/class_stats';
import { TANK_THREAT_MULTIPLIER, HEALER_THREAT_MULTIPLIER, SUMMONER_THREAT_MULTIPLIER, SUMMONER_PET_INITIAL_AGGRO, HEALING_THREAT_PERCENT } from '../data/combat_scaling';
import {
  statOffset,
  BLOCK_CHANCE_BASE,
  BLOCK_CHANCE_DEX_PER_POINT,
  BLOCK_MITIGATION_BASE,
  BLOCK_MITIGATION_STR_PER_POINT,
  WIS_PULL_BONUS_PER_POINT,
} from '../data/combat_scaling';
import { STARTER_ITEM_NAMES } from '../data/combat_constants';
import { ESSENCE_TIER_THRESHOLDS, MODIFIER_REAGENT_THRESHOLDS, CRAFTING_MODIFIER_DEFS } from '../data/crafting_materials';
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
  const spawn = ctx.db.enemySpawn.id.find(spawnId);
  if (!spawn) return;
  const remaining = [...ctx.db.enemySpawnMember.by_spawn.filter(spawnId)].length;
  ctx.db.enemySpawn.id.update({
    ...spawn,
    groupCount: BigInt(remaining),
    state: remaining > 0 ? spawn.state : 'depleted',
  });
};

const pickRoleTemplate = (ctx: any, templateId: bigint, seed: bigint) => {
  const options = [...ctx.db.enemyRoleTemplate.by_template.filter(templateId)];
  if (options.length === 0) return null;
  const index = Number(seed % BigInt(options.length));
  return options[index] ?? options[0];
};

const takeSpawnMember = (ctx: any, spawnId: bigint) => {
  const members = [...ctx.db.enemySpawnMember.by_spawn.filter(spawnId)];
  if (members.length === 0) return null;
  const index = Number(
    (ctx.timestamp.microsSinceUnixEpoch + spawnId) % BigInt(members.length)
  );
  const member = members[index];
  if (!member) return null;
  ctx.db.enemySpawnMember.id.delete(member.id);
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
  const template = ctx.db.enemyTemplate.id.find(spawnToUse.enemyTemplateId);
  if (!template) throw new SenderError('Enemy template missing');

  let roleTemplate = roleTemplateId
    ? ctx.db.enemyRoleTemplate.id.find(roleTemplateId)
    : null;
  if (!roleTemplate && consumeSpawnCount) {
    const member = takeSpawnMember(ctx, spawnToUse.id);
    if (member) {
      roleTemplate = ctx.db.enemyRoleTemplate.id.find(member.roleTemplateId);
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
  const combatEnemy = ctx.db.combatEnemy.insert({
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
    ctx.db.aggroEntry.insert({
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
    const refreshed = ctx.db.enemySpawn.id.find(spawnToUse.id);
    if (refreshed) {
      ctx.db.enemySpawn.id.update({
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
  const { appendPrivateEvent, scheduleCombatTick } = deps;
  const combat = ctx.db.combatEncounter.insert({
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
    ctx.db.combatParticipant.insert({
      id: 0n,
      combatId: combat.id,
      characterId: p.id,
      status: 'active',
      nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + AUTO_ATTACK_INTERVAL,
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
    for (const ap of [...ctx.db.activePet.by_character.filter(p.id)]) {
      const pet = ctx.db.activePet.id.update({
        ...ap,
        combatId: combat.id,
        nextAbilityAt: ap.abilityKey ? ctx.timestamp.microsSinceUnixEpoch : undefined,
        nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + AUTO_ATTACK_INTERVAL,
        targetEnemyId: undefined,
      });
      if (p.className?.toLowerCase() === 'summoner') {
        // Single-target taunt: only generate initial aggro against the primary target
        // (the spawn combat was initiated against), not every enemy in the encounter.
        const primaryEnemy = [...ctx.db.combatEnemy.by_combat.filter(combat.id)]
          .find(en => en.spawnId === spawnToUse.id && en.currentHp > 0n);
        if (primaryEnemy) {
          ctx.db.aggroEntry.insert({
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
    scheduleCombatTick,
    sumCharacterEffect,
    sumEnemyEffect,
    applyArmorMitigation,
    abilityCooldownMicros,
    executeAbilityAction,
    rollAttackOutcome,
    EnemyAbility,
    CombatEnemyCast,
    CombatEnemyCooldown,
    CombatPendingAdd,
    getGroupOrSoloParticipants,
    effectiveGroupId,
    requirePullerOrLog,
    hasShieldEquipped,
    canParry,
    EnemyRespawnTick,
    enemyAbilityCastMicros,
    enemyAbilityCooldownMicros,
    PullState,
    PullTick,
    logPrivateAndGroup,
    fail,
    grantFactionStandingForKill,
    calculateFleeChance,
    autoRespawnDeadCharacter,
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
    const combat = ctx.db.combatEncounter.id.find(combatId);
    if (!combat?.groupId) return;
    appendGroupEvent(ctx, combat.groupId, characterId, kind, message);
  };

  const clearCharacterEffectsOnDeath = (ctx: any, character: any) => {
    for (const effect of ctx.db.characterEffect.by_character.filter(character.id)) {
      if (effect.effectType === 'hp_bonus') {
        const nextMax = character.maxHp > effect.magnitude ? character.maxHp - effect.magnitude : 0n;
        const nextHp = character.hp > nextMax ? nextMax : character.hp;
        ctx.db.character.id.update({ ...character, maxHp: nextMax, hp: nextHp });
      }
      ctx.db.characterEffect.id.delete(effect.id);
    }
  };

  const markParticipantDead = (
    ctx: any,
    participant: any,
    character: any,
    enemyName: string
  ) => {
    const current = ctx.db.combatParticipant.id.find(participant.id);
    if (!current || current.status === 'dead') return;
    ctx.db.combatParticipant.id.update({ ...participant, status: 'dead' });
    clearCharacterEffectsOnDeath(ctx, character);
    logPrivateAndGroup(
      ctx,
      character,
      'combat',
      `You have died. Killed by ${enemyName}.`
    );
    for (const pet of ctx.db.activePet.by_combat.filter(participant.combatId)) {
      if (pet.characterId === character.id) {
        ctx.db.activePet.id.delete(pet.id);
      }
    }
  };

  const clearCombatArtifacts = (ctx: any, combatId: bigint) => {
    const loopTable = ctx.db.combatLoopTick;
    if (loopTable && loopTable.iter && loopTable.id && loopTable.id.delete) {
      for (const row of loopTable.iter()) {
        if (row.combatId !== combatId) continue;
        loopTable.id.delete(row.scheduledId);
      }
    }
    const participantIds: bigint[] = [];
    for (const row of ctx.db.combatParticipant.by_combat.filter(combatId)) {
      participantIds.push(row.characterId);
      ctx.db.combatParticipant.id.delete(row.id);
    }
    for (const pet of ctx.db.activePet.by_combat.filter(combatId)) {
      if (pet.currentHp > 0n) {
        // Surviving pet returns to out-of-combat state.
        // Heal pets arm their out-of-combat tick immediately on combat exit.
        ctx.db.activePet.id.update({
          ...pet,
          combatId: undefined,
          nextAbilityAt: (pet.abilityKey === 'pet_heal' || pet.abilityKey === 'pet_aoe_heal') ? ctx.timestamp.microsSinceUnixEpoch : undefined,
          targetEnemyId: undefined,
          nextAutoAttackAt: undefined,
        });
      } else {
        // Dead pet is dismissed
        ctx.db.activePet.id.delete(pet.id);
      }
    }
    for (const characterId of participantIds) {
      const character = ctx.db.character.id.find(characterId);
      if (character && character.combatTargetEnemyId) {
        ctx.db.character.id.update({ ...character, combatTargetEnemyId: undefined });
      }
      for (const cast of ctx.db.characterCast.by_character.filter(characterId)) {
        const abilityRows = [...ctx.db.abilityTemplate.by_key.filter(cast.abilityKey)];
        const ability = abilityRows[0];
        // Only cancel combat-only casts; friendly/utility casts persist through combat transitions
        if (!ability || ability.combatState === 'combat_only') {
          ctx.db.characterCast.id.delete(cast.id);
        }
      }
      // Remove expired cooldown rows to prevent stale data
      for (const cd of ctx.db.abilityCooldown.by_character.filter(characterId)) {
        if (cd.startedAtMicros + cd.durationMicros <= ctx.timestamp.microsSinceUnixEpoch) {
          ctx.db.abilityCooldown.id.delete(cd.id);
        }
      }
    }
    for (const row of ctx.db.aggroEntry.by_combat.filter(combatId)) {
      ctx.db.aggroEntry.id.delete(row.id);
    }
    for (const row of ctx.db.combatEnemy.by_combat.filter(combatId)) {
      ctx.db.combatEnemy.id.delete(row.id);
    }
    for (const row of ctx.db.combatEnemyEffect.by_combat.filter(combatId)) {
      ctx.db.combatEnemyEffect.id.delete(row.id);
    }
    if (ctx.db.combatPendingAdd) {
      for (const row of ctx.db.combatPendingAdd.by_combat.filter(combatId)) {
        // Restore the spawn for any pending add that never actually joined combat.
        // reserveAdds() set these spawns to state='engaged'; if combat ends before
        // they arrive, their spawn must be released back to 'available' so the
        // enemies are not permanently lost from the location.
        if (row.spawnId) {
          const pendingSpawn = ctx.db.enemySpawn.id.find(row.spawnId);
          if (pendingSpawn && pendingSpawn.state === 'engaged' && pendingSpawn.lockedCombatId === combatId) {
            ctx.db.enemySpawn.id.update({
              ...pendingSpawn,
              state: 'available',
              lockedCombatId: undefined,
            });
          }
        }
        ctx.db.combatPendingAdd.id.delete(row.id);
      }
    }
    for (const row of ctx.db.combatEnemyCast.by_combat.filter(combatId)) {
      ctx.db.combatEnemyCast.id.delete(row.id);
    }
    if (ctx.db.combatEnemyCooldown) {
      for (const row of ctx.db.combatEnemyCooldown.by_combat.filter(combatId)) {
        ctx.db.combatEnemyCooldown.id.delete(row.id);
      }
    }
  };

  const schedulePullResolve = (ctx: any, pullId: bigint, resolveAtMicros: bigint) => {
    ctx.db.pullTick.insert({
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
    for (const quest of ctx.db.questInstance.by_character.filter(character.id)) {
      if (quest.completed) continue;
      const template = ctx.db.questTemplate.id.find(quest.questTemplateId);
      if (!template) continue;
      // Skip kill_loot quests — they advance only via item drop, not kill count
      if ((template.questType ?? 'kill') === 'kill_loot') continue;
      if (template.targetEnemyTemplateId !== enemyTemplateId) continue;
      const nextProgress =
        quest.progress + 1n > template.requiredCount
          ? template.requiredCount
          : quest.progress + 1n;
      const isComplete = nextProgress >= template.requiredCount;
      ctx.db.questInstance.id.update({
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
    for (const quest of ctx.db.questInstance.by_character.filter(character.id)) {
      if (quest.completed) continue;
      const template = ctx.db.questTemplate.id.find(quest.questTemplateId);
      if (!template) continue;
      if ((template.questType ?? 'kill') !== 'kill_loot') continue;
      if (template.targetEnemyTemplateId !== enemyTemplateId) continue;

      // Roll drop chance
      const dropChance = template.itemDropChance ?? 25n;
      const roll = (BigInt(character.id) ^ ctx.timestamp.microsSinceUnixEpoch) % 100n;
      if (roll < dropChance) {
        // Item drops! Create a QuestItem (discovered + looted since it drops directly)
        ctx.db.questItem.insert({
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
        ctx.db.questInstance.id.update({
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
    let finalDamage = (reducedDamage * outcome.multiplier) / 100n;
    if (finalDamage < 0n) finalDamage = 0n;
    if (outcome.outcome === 'hit' && targetCharacterId) {
      const shield = [...ctx.db.characterEffect.by_character.filter(targetCharacterId)].find(
        (effect) => effect.effectType === 'damage_shield'
      );
      if (shield) {
        const absorbed = shield.magnitude >= finalDamage ? finalDamage : shield.magnitude;
        finalDamage -= absorbed;
        ctx.db.characterEffect.id.delete(shield.id);
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
    let best: any | null = null;
    for (const row of ctx.db.lootTable.iter()) {
      if (row.tier !== 1n) continue;
      if (row.terrainType !== terrain) continue;
      if (row.creatureType !== creatureType) continue;
      best = row;
      break;
    }
    if (best) return best;
    for (const row of ctx.db.lootTable.iter()) {
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
    const entries = [...ctx.db.lootTableEntry.by_table.filter(lootTable.id)];
    const junkEntries = entries.filter((entry) => {
      const template = ctx.db.itemTemplate.id.find(entry.itemTemplateId);
      return template?.isJunk;
    });
    const gearEntries = entries.filter((entry) => {
      const template = ctx.db.itemTemplate.id.find(entry.itemTemplateId);
      return template && !template.isJunk && !STARTER_ITEM_NAMES.has(template.name) && template.requiredLevel <= (enemyTemplate.level ?? 1n) + 1n;
    });

    const level = enemyTemplate.level ?? 1n;
    const gearBoost = BigInt(Math.min(25, Number(level) * 2));
    const gearChance = lootTable.gearChance + gearBoost;

    const lootItems: { template: any; qualityTier?: string; affixDataJson?: string; isNamed?: boolean; craftQuality?: string }[] = [];
    const pick = pickWeightedEntry(junkEntries, seedBase + 11n);
    if (pick) {
      const template = ctx.db.itemTemplate.id.find(pick.itemTemplateId);
      if (template) lootItems.push({ template });
    }

    const rollGear = rollPercent(seedBase + 19n);
    if (rollGear < Number(gearChance)) {
      const pick = pickWeightedEntry(gearEntries, seedBase + 23n);
      if (pick) {
        const template = ctx.db.itemTemplate.id.find(pick.itemTemplateId);
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
    const topEntry = [...ctx.db.aggroEntry.by_combat.filter(combatId)]
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
    const activeGather = [...ctx.db.resourceGather.by_character.filter(character.id)][0];
    if (activeGather) {
      return failCombat(ctx, character, 'Cannot start combat while gathering');
    }
    const locationId = character.locationId;

    const pullerCheck = requirePullerOrLog(ctx, character, fail, 'Only the group puller can start combat.');
    if (!pullerCheck.ok) return;
    let groupId: bigint | null = pullerCheck.groupId;

    // Determine participants (virtual solo group)
    const participants: typeof deps.Character.rowType[] = getGroupOrSoloParticipants(ctx, character);
    if (participants.length === 0) return failCombat(ctx, character, 'No participants available');
    for (const p of participants) {
      if (activeCombatIdForCharacter(ctx, p.id)) {
        return failCombat(ctx, character, `${p.name} is already in combat`);
      }
    }

    const spawn = ctx.db.enemySpawn.id.find(args.enemySpawnId);
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
      const activeGather = [...ctx.db.resourceGather.by_character.filter(character.id)][0];
      if (activeGather) {
        return failCombat(ctx, character, 'Cannot start combat while gathering');
      }
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return failCombat(ctx, character, 'Already in combat');
      }
      const locationId = character.locationId;
      const pullerCheck = requirePullerOrLog(ctx, character, fail, 'Only the group puller can start combat.');
      if (!pullerCheck.ok) return;
      let groupId: bigint | null = pullerCheck.groupId;
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
      const activeGather = [...ctx.db.resourceGather.by_character.filter(character.id)][0];
      if (activeGather) {
        return failCombat(ctx, character, 'Cannot pull while gathering');
      }
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return failCombat(ctx, character, 'Already in combat');
      }
      const locationId = character.locationId;
      const pullType = args.pullType.trim().toLowerCase();
      if (pullType !== 'careful' && pullType !== 'body') {
        return failCombat(ctx, character, 'Invalid pull type');
      }

      const pullerCheck = requirePullerOrLog(ctx, character, fail, 'Only the group puller can pull.');
      if (!pullerCheck.ok) return;
      let groupId: bigint | null = pullerCheck.groupId;

      for (const pull of ctx.db.pullState.by_character.filter(character.id)) {
        if (pull.state === 'pending') {
          return failCombat(ctx, character, 'Pull already in progress');
        }
      }

      const spawn = ctx.db.enemySpawn.id.find(args.enemySpawnId);
      if (!spawn || spawn.locationId !== locationId || spawn.state !== 'available') {
        return failCombat(ctx, character, 'Enemy is not available to pull');
      }

      ctx.db.enemySpawn.id.update({ ...spawn, state: 'pulling' });

      const delayMicros = pullType === 'careful' ? PULL_DELAY_CAREFUL : PULL_DELAY_BODY;
      const resolveAt = ctx.timestamp.microsSinceUnixEpoch + delayMicros;
      const pull = ctx.db.pullState.insert({
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
        const enemy = ctx.db.combatEnemy.id.find(args.enemyId);
        if (!enemy || enemy.combatId !== combatId) {
          return failCombat(ctx, character, 'Enemy not in combat');
        }
        ctx.db.character.id.update({ ...character, combatTargetEnemyId: enemy.id });
      } else {
        ctx.db.character.id.update({ ...character, combatTargetEnemyId: undefined });
      }
    }
  );

  spacetimedb.reducer('resolve_pull', { arg: PullTick.rowType }, (ctx, { arg }) => {
    const pull = ctx.db.pullState.id.find(arg.pullId);
    if (!pull || pull.state !== 'pending') return;

    const character = ctx.db.character.id.find(pull.characterId);
    const spawn = ctx.db.enemySpawn.id.find(pull.enemySpawnId);
    if (!character || !spawn || spawn.locationId !== pull.locationId) {
      if (spawn && spawn.state === 'pulling') {
        ctx.db.enemySpawn.id.update({ ...spawn, state: 'available' });
      }
      ctx.db.pullState.id.delete(pull.id);
      return;
    }
    if (activeCombatIdForCharacter(ctx, character.id)) {
      if (spawn.state === 'pulling') {
        ctx.db.enemySpawn.id.update({ ...spawn, state: 'available' });
      }
      ctx.db.pullState.id.delete(pull.id);
      return;
    }

    const template = ctx.db.enemyTemplate.id.find(spawn.enemyTemplateId);
    if (!template) {
      ctx.db.enemySpawn.id.update({ ...spawn, state: 'available' });
      ctx.db.pullState.id.delete(pull.id);
      return;
    }

    const candidates = PULL_ALLOW_EXTERNAL_ADDS
      ? [...ctx.db.enemySpawn.by_location.filter(pull.locationId)]
        .filter((row) => row.id !== spawn.id && row.state === 'available')
        .map((row) => ({
          spawn: row,
          template: ctx.db.enemyTemplate.id.find(row.enemyTemplateId),
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
      for (const effect of ctx.db.characterEffect.by_character.filter(character.id)) {
        if (effect.effectType === 'pull_veil') ctx.db.characterEffect.id.delete(effect.id);
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
      ctx.db.enemySpawn.id.update({ ...spawn, state: 'available' });
      ctx.db.pullState.id.delete(pull.id);
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
        const candidateSpawn = ctx.db.enemySpawn.id.find(candidate.spawn.id);
        if (!candidateSpawn || candidateSpawn.state !== 'available') continue;
        ctx.db.enemySpawn.id.update({
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
        ctx.db.combatPendingAdd.insert({
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
    ctx.db.pullState.id.delete(pull.id);
  });

  spacetimedb.reducer('flee_combat', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const combatId = activeCombatIdForCharacter(ctx, character.id);
    if (!combatId) return failCombat(ctx, character, 'Combat not active');
    const combat = ctx.db.combatEncounter.id.find(combatId);
    if (!combat || combat.state !== 'active') return failCombat(ctx, character, 'Combat not active');

    for (const participant of ctx.db.combatParticipant.by_combat.filter(combat.id)) {
      if (participant.characterId !== character.id) continue;
      if (participant.status !== 'active') return;
      ctx.db.combatParticipant.id.update({
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

  spacetimedb.reducer('respawn_enemy', { arg: EnemyRespawnTick.rowType }, (ctx, { arg }) => {
    const location = ctx.db.location.id.find(arg.locationId);
    if (location?.isSafe) return;
    // Respect spawn cap — event spawns don't count against it
    const nonEventCount = [...ctx.db.enemySpawn.by_location.filter(arg.locationId)]
      .filter(row => [...ctx.db.eventSpawnEnemy.by_spawn.filter(row.id)].length === 0).length;
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
        const myResults = [...ctx.db.combatResult.by_owner_user.filter(character.ownerUserId)]
          .filter(r => r.groupId && r.groupId === groupId);
        const combatIds = new Set<bigint>();
        for (const row of myResults) {
          combatIds.add(row.combatId);
          ctx.db.combatResult.id.delete(row.id);
        }
        // Delete only this character's loot
        for (const combatId of combatIds) {
          for (const loot of ctx.db.combatLoot.by_character.filter(character.id)) {
            if (loot.combatId === combatId) {
              ctx.db.combatLoot.id.delete(loot.id);
            }
          }
        }
        return;
      }
      const combatIds = new Set<bigint>();
      for (const row of ctx.db.combatResult.by_owner_user.filter(character.ownerUserId)) {
        combatIds.add(row.combatId);
        ctx.db.combatResult.id.delete(row.id);
      }
      for (const combatId of combatIds) {
        for (const loot of ctx.db.combatLoot.by_combat.filter(combatId)) {
          ctx.db.combatLoot.id.delete(loot.id);
        }
      }
    }
  );

  spacetimedb.reducer('end_combat', { characterId: t.u64() }, (ctx, args) => {
    requireAdmin(ctx);
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    let combatId = activeCombatIdForCharacter(ctx, character.id);
    if (!combatId) {
      const fallback = [...ctx.db.combatParticipant.by_character.filter(character.id)][0];
      combatId = fallback?.combatId ?? null;
    }
    if (!combatId) return failCombat(ctx, character, 'No active combat');
    const combat = ctx.db.combatEncounter.id.find(combatId);
    if (!combat) return failCombat(ctx, character, 'Combat not active');

    if (combat.groupId && combat.state === 'active') {
      const group = ctx.db.group.id.find(combat.groupId);
      if (!group) return failCombat(ctx, character, 'Group not found');
      if (group.leaderCharacterId !== character.id) {
        return failCombat(ctx, character, 'Only the group leader can end combat');
      }
    }

    const participants = [...ctx.db.combatParticipant.by_combat.filter(combat.id)];
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
      ctx.db.combatResult.insert({
        id: 0n,
        ownerUserId: participantChar.ownerUserId,
        characterId: participantChar.id,
        groupId: combat.groupId,
        combatId: combat.id,
        summary: 'Combat ended by leader.',
        createdAt: ctx.timestamp,
      });
    }

    const spawn = [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
      (s) => s.lockedCombatId === combat.id
    );
    if (spawn) {
      ctx.db.enemySpawn.id.update({ ...spawn, state: 'available', lockedCombatId: undefined });
    }

    clearCombatArtifacts(ctx, combat.id);
    ctx.db.combatEncounter.id.update({ ...combat, state: 'resolved' });
  });

  const HP_REGEN_IN = 2n;
  const MANA_REGEN_IN = 2n;
  const STAMINA_REGEN_IN = 1n;
  const REGEN_TICK_MICROS = 8_000_000n;
  const EFFECT_TICK_MICROS = 10_000_000n;
  const HOT_TICK_MICROS = 3_000_000n;

  spacetimedb.reducer('regen_health', { arg: HealthRegenTick.rowType }, (ctx) => {
    const tickIndex = ctx.timestamp.microsSinceUnixEpoch / REGEN_TICK_MICROS;
    const halfTick = tickIndex % 2n === 0n;

    for (const character of ctx.db.character.iter()) {
      const inCombat = !!activeCombatIdForCharacter(ctx, character.id);
      if (character.hp === 0n) {
        if (!inCombat) {
          for (const effect of ctx.db.characterEffect.by_character.filter(character.id)) {
            ctx.db.characterEffect.id.delete(effect.id);
          }
        }
        continue;
      }
      if (inCombat && !halfTick) continue;

      const hpRegen = inCombat ? HP_REGEN_IN : (character.maxHp / 15n || 1n);
      const manaRegen = inCombat ? MANA_REGEN_IN : (character.maxMana > 0n ? character.maxMana / 20n || 1n : 0n);
      const staminaRegen = inCombat ? STAMINA_REGEN_IN : (character.maxStamina / 12n > 2n ? character.maxStamina / 12n : 2n);

      // Sum food regen bonus effects (food_mana_regen, food_stamina_regen, food_health_regen)
      // These increase the per-tick regen rate instead of granting periodic heals
      // Applies both in combat and out of combat since this reducer handles both paths
      let hpRegenBonus = 0n;
      let manaRegenBonus = 0n;
      let staminaRegenBonus = 0n;
      for (const effect of ctx.db.characterEffect.by_character.filter(character.id)) {
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
        for (const cd of ctx.db.abilityCooldown.by_character.filter(character.id)) {
          if (cd.startedAtMicros + cd.durationMicros <= ctx.timestamp.microsSinceUnixEpoch) {
            ctx.db.abilityCooldown.id.delete(cd.id);
          }
        }
      }
    }

    // Pet HP regen — mirrors character regen rates
    const PET_HP_REGEN_OUT = 3n;
    const PET_HP_REGEN_IN = 2n;

    for (const pet of ctx.db.activePet.iter()) {
      // Dismiss timed pets when their duration has elapsed
      if (pet.expiresAtMicros !== undefined && pet.expiresAtMicros !== null &&
        ctx.timestamp.microsSinceUnixEpoch >= pet.expiresAtMicros) {
        ctx.db.activePet.id.delete(pet.id);
        continue;
      }
      if (pet.currentHp === 0n) continue;           // dead pet — skip
      if (pet.currentHp >= pet.maxHp) continue;     // full HP — skip

      const petInCombat = pet.combatId !== undefined && pet.combatId !== null;

      // In combat: only regen on halfTick (every other 8s tick = every 16s)
      if (petInCombat && !halfTick) continue;

      const regenAmount = petInCombat ? PET_HP_REGEN_IN : PET_HP_REGEN_OUT;
      const nextHp = pet.currentHp + regenAmount;

      ctx.db.activePet.id.update({
        ...pet,
        currentHp: nextHp > pet.maxHp ? pet.maxHp : nextHp,
      });
    }

    // Out-of-combat pet_heal ability ticks
    for (const pet of ctx.db.activePet.iter()) {
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
        for (const membership of ctx.db.groupMember.by_group.filter(groupId)) {
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
        ctx.db.activePet.id.update({ ...pet, nextAbilityAt: undefined });
        continue;
      }

      const healAmount = 10n + pet.level * 5n;
      const cooldownMicros = (pet.abilityCooldownSeconds ?? 10n) * 1_000_000n;
      if (healTargetIsPet) {
        const newHp = pet.currentHp + healAmount > pet.maxHp ? pet.maxHp : pet.currentHp + healAmount;
        ctx.db.activePet.id.update({ ...pet, currentHp: newHp, nextAbilityAt: ctx.timestamp.microsSinceUnixEpoch + cooldownMicros });
      } else {
        const newHp = healTarget.hp + healAmount > healTarget.maxHp
          ? healTarget.maxHp
          : healTarget.hp + healAmount;
        ctx.db.character.id.update({ ...healTarget, hp: newHp });
        ctx.db.activePet.id.update({ ...pet, nextAbilityAt: ctx.timestamp.microsSinceUnixEpoch + cooldownMicros });
      }

      const healMsg = `${pet.name} heals ${healTarget.name} for ${healAmount}.`;
      appendPrivateEvent(ctx, healPetOwner.id, healPetOwner.ownerUserId, 'ability', healMsg);
      if (healPetOwner.groupId) {
        appendGroupEvent(ctx, healPetOwner.groupId, healPetOwner.id, 'ability', healMsg);
      }
    }

    // Out-of-combat pet_aoe_heal ability ticks
    for (const pet of ctx.db.activePet.iter()) {
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
        for (const membership of ctx.db.groupMember.by_group.filter(groupId)) {
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
        ctx.db.activePet.id.update({ ...pet, nextAbilityAt: undefined });
        continue;
      }

      const healMsg = `${pet.name} heals the party for ${healAmount}!`;
      appendPrivateEvent(ctx, petOwner.id, petOwner.ownerUserId, 'ability', healMsg);
      if (petOwner.groupId) {
        appendGroupEvent(ctx, petOwner.groupId, petOwner.id, 'ability', healMsg);
      }

      const cooldownMicros = (pet.abilityCooldownSeconds ?? 10n) * 1_000_000n;
      ctx.db.activePet.id.update({ ...pet, currentHp: petHealedHp, nextAbilityAt: ctx.timestamp.microsSinceUnixEpoch + cooldownMicros });
    }

    // Watchdog: ensure active combats always have a scheduled tick.
    for (const combat of ctx.db.combatEncounter.iter()) {
      if (combat.state !== 'active') continue;
      let hasTick = false;
      for (const tick of ctx.db.combatLoopTick.iter()) {
        if (tick.combatId === combat.id) {
          hasTick = true;
          break;
        }
      }
      if (!hasTick) {
        scheduleCombatTick(ctx, combat.id);
      }
    }

    ctx.db.healthRegenTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + REGEN_TICK_MICROS),
    });
  });

  spacetimedb.reducer('tick_effects', { arg: deps.EffectTick.rowType }, (ctx) => {
    for (const effect of ctx.db.characterEffect.iter()) {
      const owner = ctx.db.character.id.find(effect.characterId);
      if (!owner) {
        ctx.db.characterEffect.id.delete(effect.id);
        continue;
      }
      if (effect.effectType === 'regen' || effect.effectType === 'dot') {
        continue;
      }
      if (effect.roundsRemaining === 0n) {
        if (effect.effectType === 'hp_bonus') {
          const nextMax = owner.maxHp > effect.magnitude ? owner.maxHp - effect.magnitude : 0n;
          const nextHp = owner.hp > nextMax ? nextMax : owner.hp;
          ctx.db.character.id.update({ ...owner, maxHp: nextMax, hp: nextHp });
        }
        if (
          effect.effectType === 'str_bonus' ||
          effect.effectType === 'dex_bonus' ||
          effect.effectType === 'cha_bonus' ||
          effect.effectType === 'wis_bonus' ||
          effect.effectType === 'int_bonus'
        ) {
          deps.recomputeCharacterDerived(ctx, owner);
        }
        ctx.db.characterEffect.id.delete(effect.id);
        continue;
      }
      const source = effect.sourceAbility ?? 'a lingering effect';
      if (effect.effectType === 'mana_regen') {
        const nextMana =
          owner.mana + effect.magnitude > owner.maxMana ? owner.maxMana : owner.mana + effect.magnitude;
        ctx.db.character.id.update({ ...owner, mana: nextMana });
        appendPrivateEvent(
          ctx,
          owner.id,
          owner.ownerUserId,
          'ability',
          `You recover ${effect.magnitude} mana from ${source}.`
        );
      } else if (effect.effectType === 'stamina_regen') {
        const nextStamina =
          owner.stamina + effect.magnitude > owner.maxStamina
            ? owner.maxStamina
            : owner.stamina + effect.magnitude;
        ctx.db.character.id.update({ ...owner, stamina: nextStamina });
        appendPrivateEvent(
          ctx,
          owner.id,
          owner.ownerUserId,
          'ability',
          `You recover ${effect.magnitude} stamina from ${source}.`
        );
      }
      const remaining = effect.roundsRemaining - 1n;
      if (remaining === 0n) {
        if (effect.effectType === 'hp_bonus') {
          const nextMax = owner.maxHp > effect.magnitude ? owner.maxHp - effect.magnitude : 0n;
          const nextHp = owner.hp > nextMax ? nextMax : owner.hp;
          ctx.db.character.id.update({ ...owner, maxHp: nextMax, hp: nextHp });
        }
        if (
          effect.effectType === 'str_bonus' ||
          effect.effectType === 'dex_bonus' ||
          effect.effectType === 'cha_bonus' ||
          effect.effectType === 'wis_bonus' ||
          effect.effectType === 'int_bonus'
        ) {
          deps.recomputeCharacterDerived(ctx, owner);
        }
        ctx.db.characterEffect.id.delete(effect.id);
      } else {
        ctx.db.characterEffect.id.update({ ...effect, roundsRemaining: remaining });
      }
    }

    for (const effect of ctx.db.combatEnemyEffect.iter()) {
      if (effect.effectType === 'dot') continue;
      // Stun effects are time-based (magnitude = expiry micros); delete when expired.
      if (effect.effectType === 'stun') {
        if (effect.magnitude <= ctx.timestamp.microsSinceUnixEpoch) {
          ctx.db.combatEnemyEffect.id.delete(effect.id);
        }
        continue;
      }
      const enemy = ctx.db.combatEnemy.id.find(effect.enemyId);
      if (!enemy) {
        ctx.db.combatEnemyEffect.id.delete(effect.id);
        continue;
      }
      if (effect.roundsRemaining === 0n) {
        ctx.db.combatEnemyEffect.id.delete(effect.id);
        continue;
      }
      ctx.db.combatEnemyEffect.id.update({
        ...effect,
        roundsRemaining: effect.roundsRemaining - 1n,
      });
    }

    ctx.db.effectTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + EFFECT_TICK_MICROS),
    });
  });

  spacetimedb.reducer('tick_hot', { arg: deps.HotTick.rowType }, (ctx) => {
    for (const effect of ctx.db.characterEffect.iter()) {
      const owner = ctx.db.character.id.find(effect.characterId);
      if (!owner) {
        ctx.db.characterEffect.id.delete(effect.id);
        continue;
      }
      if (owner.hp === 0n) continue;
      if (effect.effectType !== 'regen' && effect.effectType !== 'dot')
        continue;
      if (effect.roundsRemaining === 0n) {
        ctx.db.characterEffect.id.delete(effect.id);
        continue;
      }
      const source = effect.sourceAbility ?? 'a lingering effect';
      if (effect.effectType === 'regen') {
        const nextHp = owner.hp + effect.magnitude > owner.maxHp ? owner.maxHp : owner.hp + effect.magnitude;
        ctx.db.character.id.update({ ...owner, hp: nextHp });
        appendPrivateEvent(
          ctx,
          owner.id,
          owner.ownerUserId,
          'heal',
          `You are healed for ${effect.magnitude} by ${source}.`
        );
        if (owner.groupId) {
          appendGroupEvent(
            ctx,
            owner.groupId,
            owner.id,
            'heal',
            `${owner.name} is healed for ${effect.magnitude} by ${source}.`
          );
        }
      } else if (effect.effectType === 'dot') {
        const nextHp = owner.hp > effect.magnitude ? owner.hp - effect.magnitude : 0n;
        ctx.db.character.id.update({ ...owner, hp: nextHp });
        appendPrivateEvent(
          ctx,
          owner.id,
          owner.ownerUserId,
          'damage',
          `You take ${effect.magnitude} damage from ${source}.`
        );
        if (owner.groupId) {
          appendGroupEvent(
            ctx,
            owner.groupId,
            owner.id,
            'damage',
            `${owner.name} takes ${effect.magnitude} damage from ${source}.`
          );
        }
      }
      const remaining = effect.roundsRemaining - 1n;
      if (remaining === 0n) {
        ctx.db.characterEffect.id.delete(effect.id);
      } else {
        ctx.db.characterEffect.id.update({ ...effect, roundsRemaining: remaining });
      }
    }

    for (const effect of ctx.db.combatEnemyEffect.iter()) {
      if (effect.effectType !== 'dot') continue;
      if (effect.roundsRemaining === 0n) {
        ctx.db.combatEnemyEffect.id.delete(effect.id);
        continue;
      }
      const combat = ctx.db.combatEncounter.id.find(effect.combatId);
      if (!combat || combat.state !== 'active') continue;
      const enemy = ctx.db.combatEnemy.id.find(effect.enemyId);
      if (!enemy) {
        ctx.db.combatEnemyEffect.id.delete(effect.id);
        continue;
      }
      const enemyTemplate = ctx.db.enemyTemplate.id.find(enemy.enemyTemplateId);
      const enemyName = enemy.displayName ?? enemyTemplate?.name ?? 'enemy';
      const bonus = sumEnemyEffect(ctx, effect.combatId, 'damage_taken', enemy.id);
      const total = effect.magnitude + bonus;
      const nextHp = enemy.currentHp > total ? enemy.currentHp - total : 0n;
      ctx.db.combatEnemy.id.update({ ...enemy, currentHp: nextHp });
      // Life-drain: heal the ownerCharacterId for the same tick amount
      if (effect.ownerCharacterId && total > 0n) {
        const drainTarget = ctx.db.character.id.find(effect.ownerCharacterId);
        if (drainTarget && drainTarget.hp > 0n) {
          const healedHp = drainTarget.hp + total > drainTarget.maxHp
            ? drainTarget.maxHp
            : drainTarget.hp + total;
          ctx.db.character.id.update({ ...drainTarget, hp: healedHp });
        }
      }
      const source = effect.sourceAbility ?? 'a lingering effect';
      for (const participant of ctx.db.combatParticipant.by_combat.filter(effect.combatId)) {
        const character = ctx.db.character.id.find(participant.characterId);
        if (!character) continue;
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'damage',
          `${source} deals ${total} damage to ${enemyName}.`
        );
      }
      const remaining = effect.roundsRemaining - 1n;
      if (remaining === 0n) {
        ctx.db.combatEnemyEffect.id.delete(effect.id);
      } else {
        ctx.db.combatEnemyEffect.id.update({ ...effect, roundsRemaining: remaining });
      }
    }

    ctx.db.hotTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + HOT_TICK_MICROS),
    });
  });

  // Bard song tick: fires every 6 seconds to apply active song group effects.
  spacetimedb.reducer('tick_bard_songs', { arg: deps.BardSongTick.rowType }, (ctx, { arg }) => {
    const bardCombatId = arg.combatId;
    if (bardCombatId !== undefined) {
      const combat = ctx.db.combatEncounter.id.find(bardCombatId);
      if (!combat || combat.state !== 'active') {
        // Combat over — clean up active song rows for this bard
        for (const song of ctx.db.activeBardSong.by_bard.filter(arg.bardCharacterId)) {
          ctx.db.activeBardSong.id.delete(song.id);
        }
        return;
      }
    }

    const bard = ctx.db.character.id.find(arg.bardCharacterId);
    if (!bard) return;

    const songs = [...ctx.db.activeBardSong.by_bard.filter(arg.bardCharacterId)];
    if (songs.length === 0) return;

    // Gather party members and living enemies (shared across all songs this tick)
    const partyMembers = bardCombatId !== undefined
      ? [...ctx.db.combatParticipant.by_combat.filter(bardCombatId)]
        .map((p: any) => ctx.db.character.id.find(p.characterId))
        .filter(Boolean)
      : partyMembersInLocation(ctx, bard);
    const enemies = bardCombatId !== undefined
      ? [...ctx.db.combatEnemy.by_combat.filter(bardCombatId)].filter((e: any) => e.currentHp > 0n)
      : [];

    // Process ALL songs (both active and fading) in this tick pass.
    // Fading songs fire their final effect then get deleted. Non-fading ones are rescheduled.
    for (const song of songs) {
      switch (song.songKey) {
        case 'bard_discordant_note': {
          // AoE sonic damage to all enemies — scales with level + CHA
          let totalDamage = 0n;
          for (const en of enemies) {
            const dmg = ((8n + bard.level * 2n + bard.cha) * 65n) / 100n;
            const actualDmg = en.currentHp > dmg ? dmg : en.currentHp;
            totalDamage += actualDmg;
            const nextHp = en.currentHp > dmg ? en.currentHp - dmg : 0n;
            ctx.db.combatEnemy.id.update({ ...en, currentHp: nextHp });
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
        ctx.db.activeBardSong.id.delete(song.id);
      }
    }

    // Reschedule next tick only if at least one non-fading song remains
    const stillActive = songs.filter((s: any) => !s.isFading);
    if (stillActive.length > 0) {
      ctx.db.bardSongTick.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 6_000_000n),
        bardCharacterId: arg.bardCharacterId,
        combatId: arg.combatId ?? undefined,
      });
    }
  });

  spacetimedb.reducer('tick_casts', { arg: deps.CastTick.rowType }, (ctx) => {
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    for (const cast of ctx.db.characterCast.iter()) {
      if (cast.endsAtMicros > nowMicros) continue;
      const character = ctx.db.character.id.find(cast.characterId);
      if (!character) {
        ctx.db.characterCast.id.delete(cast.id);
        continue;
      }
      // Check combat state before executing ability
      const castCombatId = activeCombatIdForCharacter(ctx, character.id);
      if (castCombatId) {
        const participant = [...ctx.db.combatParticipant.by_combat.filter(castCombatId)].find(
          (row) => row.characterId === character.id
        );
        if (participant && participant.status !== 'active') {
          ctx.db.characterCast.id.delete(cast.id);
          continue;
        }
      }
      // Apply cooldown on use, not on success — prevents kill-shot abilities from losing
      // their cooldown when combat ends before the subscription row arrives.
      const cooldown = abilityCooldownMicros(ctx, cast.abilityKey);
      const existingCooldown = [...ctx.db.abilityCooldown.by_character.filter(character.id)].find(
        (row) => row.abilityKey === cast.abilityKey
      );
      if (cooldown > 0n) {
        if (existingCooldown) {
          ctx.db.abilityCooldown.id.update({
            ...existingCooldown,
            startedAtMicros: nowMicros,
            durationMicros: cooldown,
          });
        } else {
          ctx.db.abilityCooldown.insert({
            id: 0n,
            characterId: character.id,
            abilityKey: cast.abilityKey,
            startedAtMicros: nowMicros,
            durationMicros: cooldown,
          });
        }
      }
      try {
        deps.executeAbilityAction(ctx, {
          actorType: 'character',
          actorId: character.id,
          abilityKey: cast.abilityKey,
          targetCharacterId: cast.targetCharacterId,
        });
      } catch (error) {
        // Ability failed due to validation — revert the cooldown so the player can retry
        if (cooldown > 0n) {
          if (existingCooldown) {
            ctx.db.abilityCooldown.id.update({ ...existingCooldown });
          } else {
            const revertCd = [...ctx.db.abilityCooldown.by_character.filter(character.id)]
              .find((row) => row.abilityKey === cast.abilityKey);
            if (revertCd) ctx.db.abilityCooldown.id.delete(revertCd.id);
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
      ctx.db.characterCast.id.delete(cast.id);
    }

    ctx.db.castTick.insert({
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
        ctx.db.combatParticipant.id.update({ ...p, status: 'dead' });
        clearCharacterEffectsOnDeath(ctx, character);
        for (const entry of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
          if (entry.characterId === character.id && !entry.petId) {
            ctx.db.aggroEntry.id.delete(entry.id);
          }
        }
      }
    }
  };

  /** Phase 2: Process fleeing participants — roll flee chance, mark fled or revert. */
  const resolveFleeAttempts = (ctx: any, combat: any, participants: any[], nowMicros: bigint) => {
    for (const p of participants) {
      if (p.status !== 'fleeing') continue;
      const fleeingChar = ctx.db.character.id.find(p.characterId);
      if (!fleeingChar) continue;
      const fleeLocation = ctx.db.location.id.find(combat.locationId);
      const fleeRegion = fleeLocation ? ctx.db.region.id.find(fleeLocation.regionId) : null;
      const dangerMultiplier = fleeRegion?.dangerMultiplier ?? 100n;
      const fleeChance = calculateFleeChance(dangerMultiplier);
      const fleeRoll = Number((nowMicros + fleeingChar.id * 13n) % 100n);
      if (fleeRoll < fleeChance) {
        ctx.db.combatParticipant.id.update({ ...p, status: 'fled' });
        for (const entry of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
          if (entry.characterId === fleeingChar.id && !entry.petId) {
            ctx.db.aggroEntry.id.delete(entry.id);
          }
        }
        for (const pet of ctx.db.activePet.by_combat.filter(combat.id)) {
          if (pet.characterId === fleeingChar.id) {
            ctx.db.activePet.id.update({
              ...pet,
              combatId: undefined,
              nextAbilityAt: (pet.abilityKey === 'pet_heal' || pet.abilityKey === 'pet_aoe_heal') ? ctx.timestamp.microsSinceUnixEpoch : undefined,
              targetEnemyId: undefined,
              nextAutoAttackAt: undefined,
            });
          }
        }
        ctx.db.character.id.update({ ...fleeingChar, combatTargetEnemyId: undefined });
        appendPrivateEvent(ctx, fleeingChar.id, fleeingChar.ownerUserId, 'combat', 'You successfully flee.');
        const fleeGroupId = effectiveGroupId(fleeingChar);
        if (fleeGroupId) {
          appendGroupEvent(ctx, fleeGroupId, fleeingChar.id, 'combat', `${fleeingChar.name} successfully flees.`);
        }
      } else {
        ctx.db.combatParticipant.id.update({ ...p, status: 'active' });
        appendPrivateEvent(ctx, fleeingChar.id, fleeingChar.ownerUserId, 'combat', 'You fail to flee!');
        const fleeGroupId = effectiveGroupId(fleeingChar);
        if (fleeGroupId) {
          appendGroupEvent(ctx, fleeGroupId, fleeingChar.id, 'combat', `${fleeingChar.name} fails to flee.`);
        }
      }
    }
  };

  /** Phase 3: Leash check — if no active participants, reset enemies and end combat. Returns true if combat ended. */
  const handleLeashEviction = (ctx: any, combat: any, enemies: any[], participants: any[], activeParticipants: any[]): boolean => {
    if (activeParticipants.length !== 0) return false;
    // Reset all enemies to full HP
    for (const enemyRow of enemies) {
      const tmpl = ctx.db.enemyTemplate.id.find(enemyRow.enemyTemplateId);
      if (tmpl) {
        ctx.db.combatEnemy.id.update({ ...enemyRow, currentHp: tmpl.maxHp });
      }
    }
    // Return enemies to spawn — restore surviving composition
    const spawnIds = new Set(enemies.map((e: any) => e.spawnId));
    for (const spawnId of spawnIds) {
      const spawn = ctx.db.enemySpawn.id.find(spawnId);
      if (spawn) {
        const savedMembers = [...ctx.db.enemySpawnMember.by_spawn.filter(spawnId)];
        for (const member of savedMembers) {
          ctx.db.enemySpawnMember.id.delete(member.id);
        }
        let count = 0n;
        for (const member of savedMembers) {
          ctx.db.enemySpawnMember.insert({
            id: 0n,
            spawnId: spawnId,
            enemyTemplateId: member.enemyTemplateId,
            roleTemplateId: member.roleTemplateId,
          });
          count += 1n;
        }
        for (const enemy of enemies) {
          if (enemy.spawnId === spawnId && enemy.currentHp > 0n) {
            ctx.db.enemySpawnMember.insert({
              id: 0n,
              spawnId: spawnId,
              enemyTemplateId: enemy.enemyTemplateId,
              roleTemplateId: enemy.enemyRoleTemplateId ?? 0n,
            });
            count += 1n;
          }
        }
        if (count > 0n) {
          ctx.db.enemySpawn.id.update({
            ...spawn,
            state: 'available',
            lockedCombatId: undefined,
            groupCount: count,
          });
        } else {
          for (const member of ctx.db.enemySpawnMember.by_spawn.filter(spawn.id)) {
            ctx.db.enemySpawnMember.id.delete(member.id);
          }
          ctx.db.enemySpawn.id.delete(spawn.id);
          const respawnAt = ctx.timestamp.microsSinceUnixEpoch + ENEMY_RESPAWN_MICROS;
          ctx.db.enemyRespawnTick.insert({
            scheduledId: 0n,
            scheduledAt: ScheduleAt.time(respawnAt),
            locationId: spawn.locationId,
          });
        }
      }
    }
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      if (!character) continue;
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'combat',
        `The enemies lose interest and return to their posts.`);
    }
    clearCombatArtifacts(ctx, combat.id);
    ctx.db.combatEncounter.id.update({ ...combat, state: 'resolved' });
    return true;
  };

  /** Phase 4: Materialize pending add enemies that have arrived. */
  const processPendingAdds = (ctx: any, combat: any, participants: any[], activeParticipants: any[], enemyName: string, nowMicros: bigint) => {
    for (const pending of ctx.db.combatPendingAdd.by_combat.filter(combat.id)) {
      if (pending.arriveAtMicros > nowMicros) continue;
      const spawnRow = pending.spawnId ? ctx.db.enemySpawn.id.find(pending.spawnId) : null;
      if (spawnRow) {
        const newEnemy = addEnemyToCombat(deps, ctx, combat, spawnRow, participants, true, pending.enemyRoleTemplateId ?? undefined);
        if (newEnemy && activeParticipants.length > 0) {
          ctx.db.combatEnemy.id.update({ ...newEnemy, aggroTargetCharacterId: activeParticipants[0].characterId });
        }
      }
      ctx.db.combatPendingAdd.id.delete(pending.id);
      for (const p of activeParticipants) {
        const character = ctx.db.character.id.find(p.characterId);
        if (!character) continue;
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'combat', `A social add arrives to assist ${enemyName}.`);
      }
    }
  };

  /** Phase 5: Enemy AI ability selection and cast resolution. */
  const processEnemyAbilities = (ctx: any, combat: any, enemies: any[], activeParticipants: any[], nowMicros: bigint) => {
    for (const enemy of enemies) {
      if (enemy.currentHp === 0n) continue;
      const template = ctx.db.enemyTemplate.id.find(enemy.enemyTemplateId);
      const enemyAbilities = template ? [...ctx.db.enemyAbility.by_template.filter(template.id)] : [];
      const existingCast = [...ctx.db.combatEnemyCast.by_combat.filter(combat.id)].find((row) => row.enemyId === enemy.id);
      if (existingCast && existingCast.endsAtMicros <= nowMicros) {
        const stunEffectAtCast = [...ctx.db.combatEnemyEffect.by_enemy.filter(enemy.id)].find((e: any) => e.effectType === 'stun');
        const isStunnedNow = stunEffectAtCast && stunEffectAtCast.magnitude > nowMicros;
        if (isStunnedNow) {
          ctx.db.combatEnemyCast.id.delete(existingCast.id);
          const eName = template?.name ?? 'Enemy';
          for (const participant of activeParticipants) {
            const character = ctx.db.character.id.find(participant.characterId);
            if (!character) continue;
            appendPrivateEvent(ctx, character.id, character.ownerUserId, 'combat', `${eName}'s spell is interrupted!`);
          }
        } else {
          executeAbilityAction(ctx, {
            actorType: 'enemy',
            actorId: enemy.id,
            combatId: combat.id,
            abilityKey: existingCast.abilityKey,
            targetCharacterId: existingCast.targetCharacterId,
            targetPetId: existingCast.targetPetId,
          });
          const cooldownTable = ctx.db.combatEnemyCooldown;
          if (cooldownTable) {
            const abilityRow = enemyAbilities.find((row) => row.abilityKey === existingCast.abilityKey);
            const cooldownMicros = enemyAbilityCooldownMicros(existingCast.abilityKey) || (abilityRow?.cooldownSeconds ?? 0n) * 1_000_000n;
            if (cooldownMicros > 0n) {
              for (const row of cooldownTable.by_enemy.filter(enemy.id)) {
                if (row.abilityKey === existingCast.abilityKey) {
                  cooldownTable.id.delete(row.id);
                }
              }
              cooldownTable.insert({
                id: 0n,
                combatId: combat.id,
                enemyId: enemy.id,
                abilityKey: existingCast.abilityKey,
                readyAtMicros: nowMicros + cooldownMicros,
              });
            }
          }
          ctx.db.combatEnemyCast.id.delete(existingCast.id);
        }
      }
      const stunEffectForCast = [...ctx.db.combatEnemyEffect.by_enemy.filter(enemy.id)].find((e: any) => e.effectType === 'stun');
      const isStunned = stunEffectForCast && stunEffectForCast.magnitude > nowMicros;
      if (enemyAbilities.length > 0 && !existingCast && !isStunned) {
        const cooldownTable = ctx.db.combatEnemyCooldown;
        if (!cooldownTable) {
          // cooldown table missing; skip casting to avoid spam
        } else {
          type Candidate = {
            ability: typeof deps.EnemyAbility.rowType;
            target: { characterId?: bigint; petId?: bigint };
            score: number;
            castMicros: bigint;
            cooldownMicros: bigint;
            chance: number;
          };
          const candidates: Candidate[] = [];
          for (const ability of enemyAbilities) {
            const cooldown = [...cooldownTable.by_enemy.filter(enemy.id)].find((row) => row.abilityKey === ability.abilityKey);
            if (cooldown && cooldown.readyAtMicros > nowMicros) continue;
            if (cooldown && cooldown.readyAtMicros <= nowMicros) {
              for (const row of cooldownTable.by_enemy.filter(enemy.id)) {
                if (row.abilityKey === ability.abilityKey) {
                  cooldownTable.id.delete(row.id);
                }
              }
            }
            const target = pickEnemyTarget(ability.targetRule, activeParticipants, ctx, combat.id, enemy.id);
            if (!target) continue;
            const meta = ENEMY_ABILITIES[ability.abilityKey as keyof typeof ENEMY_ABILITIES];
            const castMicros = enemyAbilityCastMicros(ability.abilityKey) || (ability.castSeconds ?? 0n) * 1_000_000n;
            const cooldownMicros = enemyAbilityCooldownMicros(ability.abilityKey) || (ability.cooldownSeconds ?? 0n) * 1_000_000n;
            if (!target.petId) {
              if (ability.kind === 'dot') {
                const alreadyApplied = [...ctx.db.characterEffect.by_character.filter(target.characterId!)].some(
                  (effect) => effect.effectType === 'dot' && effect.sourceAbility === ability.name
                );
                if (alreadyApplied) continue;
              } else if (ability.kind === 'debuff') {
                const alreadyApplied = [...ctx.db.characterEffect.by_character.filter(target.characterId!)].some(
                  (effect) => effect.sourceAbility === ability.name
                );
                if (alreadyApplied) continue;
              }
            }
            const baseWeight = meta?.aiWeight ?? DEFAULT_AI_WEIGHT;
            const baseChance = meta?.aiChance ?? DEFAULT_AI_CHANCE;
            const randomness = meta?.aiRandomness ?? DEFAULT_AI_RANDOMNESS;
            let score = baseWeight;
            if (ability.kind === 'dot') score += 10;
            if (ability.targetRule === 'lowest_hp') score += 20;
            if (ability.targetRule === 'aggro') score += 10;
            if (ability.kind === 'heal') {
              const allies = [...ctx.db.combatEnemy.by_combat.filter(combat.id)]
                .filter((e: any) => e.currentHp > 0n && e.id !== enemy.id);
              const lowestAlly = allies.reduce((low: any, e: any) => {
                const tmpl = ctx.db.enemyTemplate.id.find(e.enemyTemplateId);
                const maxHp = tmpl?.maxHp ?? 100n;
                const hpPercent = (e.currentHp * 100n) / maxHp;
                const lowTmpl = low ? ctx.db.enemyTemplate.id.find(low.enemyTemplateId) : null;
                const lowMaxHp = lowTmpl?.maxHp ?? 100n;
                const lowPercent = low ? (low.currentHp * 100n) / lowMaxHp : 100n;
                return hpPercent < lowPercent ? e : low;
              }, null as any);
              if (lowestAlly) {
                const tmpl = ctx.db.enemyTemplate.id.find(lowestAlly.enemyTemplateId);
                const maxHp = tmpl?.maxHp ?? 100n;
                const hpPercent = Number((lowestAlly.currentHp * 100n) / maxHp);
                if (hpPercent < 30) {
                  score += 100;
                } else if (hpPercent < 60) {
                  score += 40;
                }
              }
              const selfTemplate = ctx.db.enemyTemplate.id.find(enemy.enemyTemplateId);
              const selfMaxHp = selfTemplate?.maxHp ?? 100n;
              const selfHpPercent = Number((enemy.currentHp * 100n) / selfMaxHp);
              if (selfHpPercent < 30) {
                score += 80;
              }
            }
            if (ability.kind === 'buff') {
              const combatAge = nowMicros - combat.createdAt.microsSinceUnixEpoch;
              if (combatAge < 10_000_000n) {
                score += 50;
              } else if (combatAge < 30_000_000n) {
                score += 20;
              }
            }
            if (ability.kind === 'debuff') {
              const highestThreatEntry = [...ctx.db.aggroEntry.by_combat.filter(combat.id)]
                .filter((e: any) => e.enemyId === enemy.id && !e.petId)
                .sort((a: any, b: any) => a.value > b.value ? -1 : a.value < b.value ? 1 : 0)[0];
              if (highestThreatEntry && highestThreatEntry.characterId === target.characterId) {
                score += 25;
              }
            }
            const hash = hashString(`${ability.abilityKey}:${combat.id}:${enemy.id}`);
            const jitter = (hash % (randomness * 2)) - randomness;
            score += jitter;
            candidates.push({ ability, target, score, castMicros, cooldownMicros, chance: baseChance });
          }
          if (candidates.length > 0) {
            const chosen = candidates.sort((a, b) => b.score - a.score)[0];
            const roll = Number((nowMicros + enemy.id + combat.id + BigInt(hashString(chosen.ability.abilityKey))) % 100n);
            if (roll < chosen.chance) {
              ctx.db.combatEnemyCast.insert({
                id: 0n,
                combatId: combat.id,
                enemyId: enemy.id,
                abilityKey: chosen.ability.abilityKey,
                endsAtMicros: nowMicros + chosen.castMicros,
                targetCharacterId: chosen.target.characterId,
                targetPetId: chosen.target.petId,
              });
              ctx.db.combatEnemy.id.update({
                ...enemy,
                nextAutoAttackAt: nowMicros + chosen.castMicros,
                aggroTargetCharacterId: chosen.target.characterId,
              });
            }
          }
        }
      }
    }
  };

  /** Phase 6: Player auto-attack resolution against enemies. */
  const processPlayerAutoAttacks = (ctx: any, combat: any, enemies: any[], activeParticipants: any[], nowMicros: bigint) => {
    for (const participant of activeParticipants) {
      const character = ctx.db.character.id.find(participant.characterId);
      if (!character) continue;
      const activeCast = [...ctx.db.characterCast.by_character.filter(character.id)].find((row) => row.endsAtMicros > nowMicros);
      if (activeCast) continue;
      if (participant.nextAutoAttackAt > nowMicros) continue;
      const preferredEnemy = character.combatTargetEnemyId ? enemies.find((row) => row.id === character.combatTargetEnemyId) : null;
      const currentEnemy = preferredEnemy ?? enemies.find((row) => row.currentHp > 0n) ?? enemies[0] ?? null;
      if (!currentEnemy || currentEnemy.currentHp === 0n) continue;
      const enemyTemplate = ctx.db.enemyTemplate.id.find(currentEnemy.enemyTemplateId);
      const targetName = currentEnemy.displayName ?? enemyTemplate?.name ?? 'enemy';
      const weapon = deps.getEquippedWeaponStats(ctx, character.id);
      const rawWeaponDamage = 5n + character.level + weapon.baseDamage + (weapon.dps / 2n);
      const perkBonuses = calculatePerkBonuses(ctx, character.id);
      const effectiveStr = character.str + perkBonuses.str;
      const statScaledDamage = calculateStatScaledAutoAttack(rawWeaponDamage, effectiveStr);
      const baseDamage = statScaledDamage + sumEnemyEffect(ctx, combat.id, 'damage_taken', currentEnemy.id);
      const damageBoostPercent = sumCharacterEffect(ctx, character.id, 'damage_boost');
      const damage = damageBoostPercent > 0n ? (baseDamage * (100n + damageBoostPercent)) / 100n : baseDamage;
      const outcomeSeed = nowMicros + character.id + currentEnemy.id;
      const attackerHitBonus = clampBigInt(character.hitChance, 0n, 300n);
      const { outcome: attackOutcome, finalDamage, nextHp } = resolveAttack(ctx, {
        seed: outcomeSeed,
        baseDamage: damage,
        targetArmor: currentEnemy.armorClass + sumEnemyEffect(ctx, combat.id, 'armor_down', currentEnemy.id),
        canBlock: hasShieldEquipped(ctx, character.id),
        canParry: canParry(character.className) && weapon.weaponType !== 'bow',
        canDodge: true,
        attackerHitBonus,
        currentHp: currentEnemy.currentHp,
        logTargetId: character.id,
        logOwnerId: character.ownerUserId,
        messages: {
          dodge: `${targetName} dodges your auto-attack.`,
          miss: `You miss ${targetName} with auto-attack.`,
          parry: `${targetName} parries your auto-attack.`,
          block: (damage) => `${targetName} blocks your auto-attack for ${damage}.`,
          hit: (damage) => `You hit ${targetName} with auto-attack for ${damage}.`,
          crit: (damage) => `Critical hit! You hit ${targetName} for ${damage} damage.`,
        },
        applyHp: (updatedHp) => {
          ctx.db.combatEnemy.id.update({ ...currentEnemy, currentHp: updatedHp });
        },
        groupId: combat.groupId,
        groupActorId: character.id,
        characterDex: character.dex,
        weaponName: weapon.name,
        weaponType: weapon.weaponType,
        groupMessages: {
          dodge: `${targetName} dodges ${character.name}'s auto-attack.`,
          miss: `${character.name} misses ${targetName} with auto-attack.`,
          parry: `${targetName} parries ${character.name}'s auto-attack.`,
          block: (damage) => `${targetName} blocks ${character.name}'s auto-attack for ${damage}.`,
          hit: (damage) => `${character.name} hits ${targetName} with auto-attack for ${damage}.`,
          crit: (damage) => `Critical hit! ${character.name} hits ${targetName} for ${damage} damage.`,
        },
      });
      if (finalDamage > 0n) {
        const className = character.className?.toLowerCase() ?? '';
        const threatMult = TANK_CLASSES.has(className) ? TANK_THREAT_MULTIPLIER
          : HEALER_CLASSES.has(className) ? HEALER_THREAT_MULTIPLIER
            : className === 'summoner' ? SUMMONER_THREAT_MULTIPLIER : 100n;
        const threat = (finalDamage * threatMult) / 100n;
        for (const entry of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
          if (entry.characterId === character.id && entry.enemyId === currentEnemy.id && !entry.petId) {
            ctx.db.aggroEntry.id.update({ ...entry, value: entry.value + threat });
            break;
          }
        }
        if (attackOutcome === 'hit' || attackOutcome === 'crit') {
          const freshEnemy = ctx.db.combatEnemy.id.find(currentEnemy.id);
          applyPerkProcs(ctx, character, 'on_hit', finalDamage, outcomeSeed, combat.id, freshEnemy);
          if (attackOutcome === 'crit') {
            const freshEnemyForCrit = ctx.db.combatEnemy.id.find(currentEnemy.id);
            applyPerkProcs(ctx, character, 'on_crit', finalDamage, outcomeSeed + 1000n, combat.id, freshEnemyForCrit);
          }
        }
        const postAttackEnemy = ctx.db.combatEnemy.id.find(currentEnemy.id);
        if (postAttackEnemy && postAttackEnemy.currentHp === 0n) {
          applyPerkProcs(ctx, character, 'on_kill', finalDamage, outcomeSeed + 2000n, combat.id, postAttackEnemy);
        }
      }
      ctx.db.combatParticipant.id.update({ ...participant, nextAutoAttackAt: nowMicros + AUTO_ATTACK_INTERVAL });
    }
  };

  /** Phase 7: Pet auto-attacks and ability usage. */
  const processPetCombat = (ctx: any, combat: any, livingEnemies: any[], nowMicros: bigint) => {
    const pets = [...ctx.db.activePet.by_combat.filter(combat.id)];
    for (let pet of pets) {
      const owner = ctx.db.character.id.find(pet.characterId);
      if (!owner || owner.hp === 0n) {
        ctx.db.activePet.id.delete(pet.id);
        continue;
      }
      let target = pet.targetEnemyId ? ctx.db.combatEnemy.id.find(pet.targetEnemyId) : null;
      if (!target || target.currentHp === 0n) {
        const preferred = owner.combatTargetEnemyId ? ctx.db.combatEnemy.id.find(owner.combatTargetEnemyId) : null;
        target = preferred ?? livingEnemies[0] ?? null;
      }
      if (!target) {
        if (pet.nextAutoAttackAt && pet.nextAutoAttackAt <= nowMicros) {
          ctx.db.activePet.id.update({ ...pet, nextAutoAttackAt: nowMicros + RETRY_ATTACK_INTERVAL, targetEnemyId: undefined });
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
          pet = ctx.db.activePet.id.find(pet.id) ?? pet;
        }
      }
      if (pet.nextAutoAttackAt && pet.nextAutoAttackAt > nowMicros) {
        if (nextAbilityAt !== pet.nextAbilityAt || target.id !== pet.targetEnemyId) {
          ctx.db.activePet.id.update({ ...pet, nextAbilityAt, targetEnemyId: target.id });
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
          ctx.db.combatEnemy.id.update({ ...target, currentHp: updatedHp });
        },
        groupId: combat.groupId,
        groupActorId: owner.id,
      });
      if (finalDamage > 0n) {
        let petEntry: typeof deps.AggroEntry.rowType | null = null;
        for (const entry of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
          if (entry.enemyId !== target.id) continue;
          if (entry.petId && entry.petId === pet.id) {
            petEntry = entry;
            break;
          }
        }
        const tauntBonus = pet.abilityKey === 'pet_taunt' ? 5n : 0n;
        const aggroGain = finalDamage + tauntBonus;
        if (petEntry) {
          ctx.db.aggroEntry.id.update({ ...petEntry, value: petEntry.value + aggroGain });
        } else {
          ctx.db.aggroEntry.insert({
            id: 0n,
            combatId: combat.id,
            enemyId: target.id,
            characterId: owner.id,
            petId: pet.id,
            value: aggroGain,
          });
        }
      }
      ctx.db.activePet.id.update({ ...pet, nextAutoAttackAt: nowMicros + AUTO_ATTACK_INTERVAL, nextAbilityAt, targetEnemyId: target.id });
    }
  };

  /** Phase 8: Victory — all enemies dead. Quest progress, loot, XP, renown, spawn cleanup. */
  const handleVictory = (
    ctx: any, combat: any, enemies: any[], participants: any[],
    activeParticipants: any[], enemyName: string, nowMicros: bigint
  ) => {
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      const currentParticipant = ctx.db.combatParticipant.id.find(p.id);
      if (!character || !currentParticipant) continue;
      if (character.hp === 0n && currentParticipant.status !== 'dead') {
        markParticipantDead(ctx, currentParticipant, character, enemyName);
      }
    }
    const enemyTemplates = enemies
      .map((row) => ctx.db.enemyTemplate.id.find(row.enemyTemplateId))
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
          for (const activeEvent of ctx.db.worldEvent.by_status.filter('active')) {
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
        for (const activeEvent of ctx.db.worldEvent.by_status.filter('active')) {
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
      const tmpl = [...ctx.db.itemTemplate.iter()].find((t: any) => t.name === threshold.essenceName);
      if (tmpl) essenceTemplateMap.set(threshold.essenceName, tmpl);
    }
    const modifierTemplateMap = new Map<string, any>();
    for (const def of CRAFTING_MODIFIER_DEFS) {
      const tmpl = [...ctx.db.itemTemplate.iter()].find((t: any) => t.name === def.name);
      if (tmpl) modifierTemplateMap.set(def.name, tmpl);
    }
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      if (!character) continue;
      const staleLoot = [...ctx.db.combatLoot.by_character.filter(character.id)];
      const staleCombatIds = new Set(staleLoot.map(row => row.combatId));
      for (const row of staleLoot) {
        ctx.db.combatLoot.id.delete(row.id);
      }
      for (const oldCombatId of staleCombatIds) {
        for (const result of ctx.db.combatResult.by_owner_user.filter(character.ownerUserId)) {
          if (result.combatId === oldCombatId && result.characterId === character.id) {
            ctx.db.combatResult.id.delete(result.id);
          }
        }
      }
      for (const template of enemyTemplates) {
        const lootTemplates = template
          ? generateLootTemplates(ctx, template, ctx.timestamp.microsSinceUnixEpoch + character.id, lootDanger)
          : [];
        for (const lootItem of lootTemplates) {
          ctx.db.combatLoot.insert({
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
            ctx.db.combatLoot.insert({
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
              ctx.db.combatLoot.insert({
                id: 0n, combatId: combat.id, ownerUserId: character.ownerUserId,
                characterId: character.id, itemTemplateId: modifierTemplate.id,
                createdAt: ctx.timestamp, qualityTier: undefined, affixDataJson: undefined, isNamed: undefined,
              });
            }
          }
        }
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
          lootTemplates.length > 0
            ? `Loot generated: ${lootTemplates.map(li => li.template.name).join(', ')}`
            : `No loot dropped from ${template?.name ?? 'enemy'}.`
        );
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
      const resultRow = ctx.db.combatResult.insert({
        id: 0n, ownerUserId: character.ownerUserId, characterId: character.id,
        groupId: combat.groupId, combatId: combat.id,
        summary: `Victory against ${summaryName}.${fallenSuffix}`, createdAt: ctx.timestamp,
      });
      const charLoot = [...ctx.db.combatLoot.by_character.filter(character.id)].filter(row => row.combatId === combat.id);
      if (charLoot.length === 0) {
        ctx.db.combatResult.id.delete(resultRow.id);
      }
    }
    createCorpsesForDead(ctx, deps, participants);
    applyDeathPenalties(ctx, deps, participants, appendPrivateEvent, logGroupEvent, combat.id);
    clearCombatArtifacts(ctx, combat.id);
    ctx.db.combatEncounter.id.update({ ...combat, state: 'resolved' });
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
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', `You reached level ${reward.newLevel}.`);
          logGroupEvent(ctx, combat.id, character.id, 'system', `${character.name} reached level ${reward.newLevel}.`);
        }
        const deadChar = ctx.db.character.id.find(p.characterId);
        if (deadChar) autoRespawnDeadCharacter(ctx, deadChar);
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
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', `You reached level ${reward.newLevel}.`);
        logGroupEvent(ctx, combat.id, character.id, 'system', `${character.name} reached level ${reward.newLevel}.`);
      }
      const primaryEnemy = enemies[0];
      if (primaryEnemy) {
        const template = ctx.db.enemyTemplate.id.find(primaryEnemy.enemyTemplateId);
        if (template) {
          if (template.isBoss) {
            const bossKey = `boss_${template.name.toLowerCase().replace(/\s+/g, '_')}`;
            const serverFirstRenown = awardServerFirst(ctx, character, 'boss_kill', bossKey, RENOWN_GAIN.BOSS_KILL_BASE);
            awardRenown(ctx, character, serverFirstRenown, `Defeating ${template.name}`);
          } else {
            const renownAmount = template.level > 0n ? template.level : 1n;
            awardRenown(ctx, character, renownAmount, `Victory in combat`);
          }
        }
      }
    }
  };

  /** Phase 9: Enemy auto-attacks against highest aggro targets (characters and pets). */
  const processEnemyAutoAttacks = (
    ctx: any, combat: any, enemies: any[], participants: any[],
    activeParticipants: any[], enemyName: string, nowMicros: bigint
  ) => {
    const activeIds = new Set(activeParticipants.map((p) => p.characterId));
    for (const enemy of enemies) {
      if (enemy.currentHp === 0n) continue;
      let topAggro: typeof deps.AggroEntry.rowType | null = null;
      let topPet: typeof deps.ActivePet.rowType | null = null;
      for (const entry of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
        if (entry.enemyId !== enemy.id) continue;
        if (entry.petId) {
          const pet = ctx.db.activePet.id.find(entry.petId);
          if (!pet || pet.currentHp === 0n) continue;
          if (!topAggro || entry.value > topAggro.value) { topAggro = entry; topPet = pet; }
          continue;
        }
        if (!activeIds.has(entry.characterId)) continue;
        if (!topAggro || entry.value > topAggro.value) { topAggro = entry; topPet = null; }
      }
      const enemySnapshot = ctx.db.combatEnemy.id.find(enemy.id);
      const enemyTemplate = ctx.db.enemyTemplate.id.find(enemy.enemyTemplateId);
      const name = enemySnapshot?.displayName ?? enemyTemplate?.name ?? enemyName;
      if (topAggro && enemySnapshot && enemySnapshot.currentHp > 0n && enemySnapshot.nextAutoAttackAt <= nowMicros) {
        const stunEffectForAuto = [...ctx.db.combatEnemyEffect.by_enemy.filter(enemy.id)].find((effect: any) => effect.effectType === 'stun');
        const timeStunned = stunEffectForAuto && stunEffectForAuto.magnitude > nowMicros;
        const skipEffect = !timeStunned
          ? [...ctx.db.combatEnemyEffect.by_enemy.filter(enemy.id)].find((effect) => effect.effectType === 'skip')
          : null;
        if (timeStunned) {
          ctx.db.combatEnemy.id.update({ ...enemySnapshot, nextAutoAttackAt: stunEffectForAuto.magnitude });
          const firstActive = activeParticipants[0]?.characterId;
          if (firstActive) logGroupEvent(ctx, combat.id, firstActive, 'combat', `${name} is stunned.`);
          for (const participant of activeParticipants) {
            const character = ctx.db.character.id.find(participant.characterId);
            if (!character) continue;
            appendPrivateEvent(ctx, character.id, character.ownerUserId, 'combat', `${name} is stunned.`);
          }
        } else if (skipEffect) {
          ctx.db.combatEnemyEffect.id.delete(skipEffect.id);
          ctx.db.combatEnemy.id.update({ ...enemySnapshot, nextAutoAttackAt: nowMicros + AUTO_ATTACK_INTERVAL });
          const firstActive = activeParticipants[0]?.characterId;
          if (firstActive) {
            logGroupEvent(ctx, combat.id, firstActive, 'combat', `${name} is staggered and misses a turn.`);
          }
          for (const participant of activeParticipants) {
            const character = ctx.db.character.id.find(participant.characterId);
            if (!character) continue;
            appendPrivateEvent(ctx, character.id, character.ownerUserId, 'combat', `${name} is staggered and misses a turn.`);
          }
        } else if (topPet) {
          const owner = ctx.db.character.id.find(topAggro.characterId);
          if (!owner) {
            ctx.db.combatEnemy.id.update({ ...enemySnapshot, nextAutoAttackAt: nowMicros + RETRY_ATTACK_INTERVAL, aggroTargetCharacterId: undefined });
          } else {
            const targetName = topPet.name;
            const outcomeSeed = nowMicros + enemySnapshot.id + topPet.id;
            const { nextHp } = resolveAttack(ctx, {
              seed: outcomeSeed, baseDamage: enemySnapshot.attackDamage, targetArmor: 0n,
              canBlock: false, canParry: false, canDodge: true, currentHp: topPet.currentHp,
              logTargetId: owner.id, logOwnerId: owner.ownerUserId,
              messages: {
                dodge: `${targetName} dodges ${name}'s attack.`,
                miss: `${name} misses ${targetName}.`,
                parry: `${name} is deflected by ${targetName}.`,
                block: (damage) => `${targetName} blocks ${name}'s attack for ${damage}.`,
                hit: (damage) => `${name} hits ${targetName} for ${damage}.`,
              },
              applyHp: (updatedHp) => { ctx.db.activePet.id.update({ ...topPet, currentHp: updatedHp }); },
            });
            if (nextHp === 0n) {
              ctx.db.activePet.id.delete(topPet.id);
              for (const entry of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
                if (entry.petId && entry.petId === topPet.id) { ctx.db.aggroEntry.id.delete(entry.id); }
              }
            }
            ctx.db.combatEnemy.id.update({
              ...enemySnapshot, nextAutoAttackAt: nowMicros + AUTO_ATTACK_INTERVAL,
              aggroTargetCharacterId: topAggro.characterId, aggroTargetPetId: topPet.id,
            });
          }
        } else {
          const targetCharacter = ctx.db.character.id.find(topAggro.characterId);
          if (targetCharacter && targetCharacter.hp > 0n) {
            const enemyLevel = enemyTemplate?.level ?? 1n;
            const levelDiff = enemyLevel > targetCharacter.level ? enemyLevel - targetCharacter.level : 0n;
            const damageMultiplier = 100n + levelDiff * 20n;
            const debuff = sumEnemyEffect(ctx, combat.id, 'damage_down', enemy.id);
            const baseDamage = enemySnapshot.attackDamage + debuff;
            const scaledDamage = (baseDamage * damageMultiplier) / 100n;
            const effectiveArmor = targetCharacter.armorClass + sumCharacterEffect(ctx, targetCharacter.id, 'ac_bonus');
            const outcomeSeed = nowMicros + enemySnapshot.id + targetCharacter.id;
            const blockChanceBasis = clampBigInt(BLOCK_CHANCE_BASE + statOffset(targetCharacter.dex, BLOCK_CHANCE_DEX_PER_POINT), 10n, 200n);
            const blockMitigationPercent = clampBigInt(BLOCK_MITIGATION_BASE + statOffset(targetCharacter.str, BLOCK_MITIGATION_STR_PER_POINT), 10n, 80n);
            const clampedDodge = clampBigInt(targetCharacter.dodgeChance, 0n, 250n);
            const clampedParry = clampBigInt(targetCharacter.parryChance, 0n, 200n);
            const { outcome: enemyAttackOutcome, finalDamage: enemyFinalDamage, nextHp } = resolveAttack(ctx, {
              seed: outcomeSeed, baseDamage: scaledDamage, targetArmor: effectiveArmor,
              canBlock: hasShieldEquipped(ctx, targetCharacter.id),
              blockChanceBasis, blockMitigationPercent,
              dodgeChanceBasis: clampedDodge, parryChanceBasis: clampedParry,
              canParry: canParry(targetCharacter.className), canDodge: true,
              currentHp: targetCharacter.hp, logTargetId: targetCharacter.id, logOwnerId: targetCharacter.ownerUserId,
              messages: {
                dodge: `You dodge ${name}'s auto-attack.`,
                miss: `${name} misses you with auto-attack.`,
                parry: `You parry ${name}'s auto-attack.`,
                block: (damage) => `You block ${name}'s auto-attack for ${damage}.`,
                hit: (damage) => `${name} hits you with auto-attack for ${damage}.`,
              },
              applyHp: (updatedHp) => { ctx.db.character.id.update({ ...targetCharacter, hp: updatedHp }); },
              targetCharacterId: targetCharacter.id,
              groupId: combat.groupId, groupActorId: targetCharacter.id,
              groupMessages: {
                dodge: `${targetCharacter.name} dodges ${name}'s auto-attack.`,
                miss: `${name} misses ${targetCharacter.name} with auto-attack.`,
                parry: `${targetCharacter.name} parries ${name}'s auto-attack.`,
                block: (damage) => `${targetCharacter.name} blocks ${name}'s auto-attack for ${damage}.`,
                hit: (damage) => `${name} hits ${targetCharacter.name} with auto-attack for ${damage}.`,
              },
            });
            if ((enemyAttackOutcome === 'hit' || enemyAttackOutcome === 'crit') && enemyFinalDamage > 0n) {
              applyPerkProcs(ctx, targetCharacter, 'on_damage_taken', enemyFinalDamage, outcomeSeed + 3000n, combat.id, null);
            }
            if (nextHp === 0n) {
              for (const p of participants) {
                if (p.characterId === targetCharacter.id) { markParticipantDead(ctx, p, targetCharacter, name); break; }
              }
            }
            ctx.db.combatEnemy.id.update({
              ...enemySnapshot, nextAutoAttackAt: nowMicros + AUTO_ATTACK_INTERVAL,
              aggroTargetCharacterId: targetCharacter.id, aggroTargetPetId: undefined,
            });
          } else {
            ctx.db.combatEnemy.id.update({
              ...enemySnapshot, nextAutoAttackAt: nowMicros + RETRY_ATTACK_INTERVAL,
              aggroTargetCharacterId: undefined, aggroTargetPetId: undefined,
            });
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
      const currentParticipant = ctx.db.combatParticipant.id.find(p.id);
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
        for (const activeEvent of ctx.db.worldEvent.by_status.filter('active')) {
          if (activeEvent.regionId !== deathCombatLoc.regionId) continue;
          for (const killedEnemy of killedEnemies) {
            const isEventKill = [...ctx.db.eventSpawnEnemy.by_spawn.filter(killedEnemy.spawnId)]
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
      const defeatResult = ctx.db.combatResult.insert({
        id: 0n, ownerUserId: character.ownerUserId, characterId: character.id,
        groupId: combat.groupId, combatId: combat.id,
        summary: `Defeat against ${enemyName}.${fallenSuffix}`, createdAt: ctx.timestamp,
      });
      ctx.db.combatResult.id.delete(defeatResult.id);
    }
    createCorpsesForDead(ctx, deps, participants);
    clearCombatArtifacts(ctx, combat.id);
    ctx.db.combatEncounter.id.update({ ...combat, state: 'resolved' });
    applyDeathPenalties(ctx, deps, participants, appendPrivateEvent);
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      if (character && character.hp === 0n) {
        autoRespawnDeadCharacter(ctx, character);
      }
    }
  };

  // ── End Combat Loop Sub-Functions ─────────────────────────────────────

  spacetimedb.reducer('combat_loop', { arg: CombatLoopTick.rowType }, (ctx, { arg }) => {
    const combat = ctx.db.combatEncounter.id.find(arg.combatId);
    if (!combat || combat.state !== 'active') return;

    const enemies = [...ctx.db.combatEnemy.by_combat.filter(combat.id)];
    if (enemies.length === 0) {
      const survivorsBySpawn = new Map<bigint, number>();
      for (const enemyRow of ctx.db.combatEnemy.by_combat.filter(combat.id)) {
        if (enemyRow.currentHp === 0n) continue;
        const count = survivorsBySpawn.get(enemyRow.spawnId) ?? 0;
        survivorsBySpawn.set(enemyRow.spawnId, count + 1);
      }
      for (const [spawnId, count] of survivorsBySpawn.entries()) {
        const spawn = ctx.db.enemySpawn.id.find(spawnId);
        if (!spawn) continue;
        ctx.db.enemySpawn.id.update({
          ...spawn,
          state: 'available',
          lockedCombatId: undefined,
          groupCount: spawn.groupCount + BigInt(count),
        });
      }
      clearCombatArtifacts(ctx, combat.id);
      ctx.db.combatEncounter.id.update({ ...combat, state: 'resolved' });
      return;
    }

    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;

    const participants = [...ctx.db.combatParticipant.by_combat.filter(combat.id)];
    markNewlyDeadParticipants(ctx, combat, participants);
    resolveFleeAttempts(ctx, combat, participants, nowMicros);

    const refreshedParticipants = [...ctx.db.combatParticipant.by_combat.filter(combat.id)];
    const activeParticipants = refreshedParticipants.filter((p) => p.status === 'active');

    if (handleLeashEviction(ctx, combat, enemies, participants, activeParticipants)) return;
    const spawnName =
      [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
        (s) => s.lockedCombatId === combat.id
      )?.name ?? 'enemy';
    const enemyTemplate = enemies[0]
      ? ctx.db.enemyTemplate.id.find(enemies[0].enemyTemplateId)
      : null;
    const enemyName = enemies[0]?.displayName ?? enemyTemplate?.name ?? spawnName;

    processPendingAdds(ctx, combat, participants, activeParticipants, enemyName, nowMicros);
    processEnemyAbilities(ctx, combat, enemies, activeParticipants, nowMicros);
    processPlayerAutoAttacks(ctx, combat, enemies, activeParticipants, nowMicros);

    const livingEnemies = enemies
      .map((row) => ctx.db.combatEnemy.id.find(row.id))
      .filter((row): row is typeof deps.CombatEnemy.rowType => Boolean(row) && row.currentHp > 0n);
    const aliveEnemyIds = new Set(livingEnemies.map((row) => row.id));

    processPetCombat(ctx, combat, livingEnemies, nowMicros);
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      if (!character) continue;
      if (character.combatTargetEnemyId && !aliveEnemyIds.has(character.combatTargetEnemyId)) {
        const nextTarget = livingEnemies[0]?.id;
        ctx.db.character.id.update({
          ...character,
          combatTargetEnemyId: nextTarget ?? undefined,
        });
      }
    }

    // Victory: all enemies dead
    if (livingEnemies.length === 0) {
      handleVictory(ctx, combat, enemies, participants, activeParticipants, enemyName, nowMicros);
      return;
    }

    // Enemy auto-attacks against highest aggro
    processEnemyAutoAttacks(ctx, combat, enemies, participants, activeParticipants, enemyName, nowMicros);

    // Defeat check: no active participants with hp > 0
    let stillActive = false;
    for (const p of ctx.db.combatParticipant.by_combat.filter(combat.id)) {
      if (p.status !== 'active') continue;
      const character = ctx.db.character.id.find(p.characterId);
      if (character && character.hp > 0n) { stillActive = true; break; }
    }
    if (!stillActive) {
      const defeatEnemyName = enemies[0]?.displayName ??
        [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find((s) => s.lockedCombatId === combat.id)?.name ?? 'enemy';
      handleDefeat(ctx, combat, enemies, participants, defeatEnemyName, nowMicros);
      return;
    }

    scheduleCombatTick(ctx, combat.id);
  });
};

