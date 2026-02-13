import { SenderError, t } from 'spacetimedb/server';
import { ScheduleAt, Timestamp } from 'spacetimedb';
import { registerReducers } from './reducers';
export { spacetimedb } from './schema/tables';
import {
  Player,
  User,
  FriendRequest,
  Friend,
  WorldState,
  Region,
  Location,
  LocationConnection,
  Npc,
  NpcDialog,
  QuestTemplate,
  QuestInstance,
  Character,
  ItemTemplate,
  ItemInstance,
  RecipeTemplate,
  RecipeDiscovered,
  ItemCooldown,
  ResourceNode,
  ResourceGather,
  ResourceGatherTick,
  ResourceRespawnTick,
  EnemyRespawnTick,
  TradeSession,
  TradeItem,
  CombatLoot,
  HotbarSlot,
  AbilityTemplate,
  AbilityCooldown,
  CharacterCast,
  Group,
  GroupMember,
  GroupInvite,
  EnemyTemplate,
  EnemyRoleTemplate,
  EnemyAbility,
  CombatEnemyCooldown,
  VendorInventory,
  LootTable,
  LootTableEntry,
  LocationEnemyTemplate,
  EnemySpawn,
  EnemySpawnMember,
  PullState,
  PullTick,
  CombatEnemyCast,
  CombatEncounter,
  CombatParticipant,
  CombatEnemy,
  CombatPet,
  CharacterEffect,
  CombatEnemyEffect,
  CombatPendingAdd,
  CombatResult,
  AggroEntry,
  CombatLoopTick,
  HealthRegenTick,
  HungerDecayTick,
  EffectTick,
  HotTick,
  CastTick,
  DayNightTick,
  DisconnectLogoutTick,
  CharacterLogoutTick,
  Command,
  EventWorld,
  EventLocation,
  EventPrivate,
  EventGroup,
  Race,
  Hunger,
  Faction,
  FactionStanding,
  UiPanelLayout,
} from './schema/tables';
import {
  effectiveGroupId,
  effectiveGroupKey,
  getGroupOrSoloParticipants,
  requirePullerOrLog,
} from './helpers/group';
import {
  tableHasRows,
  EVENT_TRIM_MAX,
  EVENT_TRIM_AGE_MICROS,
  trimEventRows,
  requirePlayerUserId,
  requireCharacterOwnedBy,
  activeCombatIdForCharacter,
  appendWorldEvent,
  appendLocationEvent,
  appendPrivateEvent,
  appendSystemMessage,
  logPrivateAndGroup,
  appendPrivateAndGroupEvent,
  fail,
  appendNpcDialog,
  appendGroupEvent,
} from './helpers/events';
import { startCombatForSpawn } from './reducers/combat';
import { registerViews } from './views';
import {
  ARMOR_TYPES_WITH_NONE,
  BASE_HP,
  HP_STR_MULTIPLIER,
  BASE_MANA,
  CLASS_ARMOR,
  baseArmorForClass,
  canParry,
  computeBaseStats,
  isArmorAllowedForClass,
  manaStatForClass,
  normalizeArmorType,
  normalizeClassName,
  usesMana,
  TANK_CLASSES,
  HEALER_CLASSES,
} from './data/class_stats';
import {
  ABILITIES,
  ENEMY_ABILITIES,
  GLOBAL_COOLDOWN_MICROS,
} from './data/ability_catalog';
import { MAX_LEVEL, xpModifierForDiff, xpRequiredForLevel } from './data/xp';
import { RACE_DATA, ensureRaces } from './data/races';
import { ensureFactions } from './data/faction_data';
import {
  calculateCritChance,
  getCritMultiplier,
  getAbilityStatScaling,
  getAbilityMultiplier,
  calculateHealingPower,
  applyMagicResistMitigation,
  DOT_SCALING_RATE_MODIFIER,
  AOE_DAMAGE_MULTIPLIER,
  DEBUFF_POWER_COST_PERCENT,
  ENEMY_BASE_POWER,
  ENEMY_LEVEL_POWER_SCALING,
  GLOBAL_DAMAGE_MULTIPLIER,
  TANK_THREAT_MULTIPLIER,
  HEALER_THREAT_MULTIPLIER,
  HEALING_THREAT_PERCENT,
  ABILITY_STAT_SCALING,
} from './data/combat_scaling.js';


const EQUIPMENT_SLOTS = new Set([
  'head',
  'chest',
  'wrists',
  'hands',
  'belt',
  'legs',
  'boots',
  'earrings',
  'neck',
  'cloak',
  'mainHand',
  'offHand',
]);

const STARTER_ARMOR: Record<
  string,
  { chest: { name: string; ac: bigint }; legs: { name: string; ac: bigint }; boots: { name: string; ac: bigint } }
> = {
  cloth: {
    chest: { name: 'Apprentice Robe', ac: 3n },
    legs: { name: 'Apprentice Trousers', ac: 2n },
    boots: { name: 'Apprentice Boots', ac: 1n },
  },
  leather: {
    chest: { name: 'Scout Jerkin', ac: 4n },
    legs: { name: 'Scout Pants', ac: 3n },
    boots: { name: 'Scout Boots', ac: 2n },
  },
  chain: {
    chest: { name: 'Warden Hauberk', ac: 5n },
    legs: { name: 'Warden Greaves', ac: 4n },
    boots: { name: 'Warden Boots', ac: 3n },
  },
  plate: {
    chest: { name: 'Vanguard Cuirass', ac: 6n },
    legs: { name: 'Vanguard Greaves', ac: 5n },
    boots: { name: 'Vanguard Boots', ac: 4n },
  },
};

const STARTER_WEAPONS: Record<string, { name: string; slot: string }> = {
  warrior: { name: 'Training Sword', slot: 'mainHand' },
  paladin: { name: 'Training Mace', slot: 'mainHand' },
  cleric: { name: 'Training Mace', slot: 'mainHand' },
  shaman: { name: 'Training Staff', slot: 'mainHand' },
  druid: { name: 'Training Staff', slot: 'mainHand' },
  ranger: { name: 'Training Bow', slot: 'mainHand' },
  rogue: { name: 'Training Dagger', slot: 'mainHand' },
  monk: { name: 'Training Staff', slot: 'mainHand' },
  beastmaster: { name: 'Training Axe', slot: 'mainHand' },
  spellblade: { name: 'Training Blade', slot: 'mainHand' },
  reaver: { name: 'Training Blade', slot: 'mainHand' },
  bard: { name: 'Training Rapier', slot: 'mainHand' },
  enchanter: { name: 'Training Staff', slot: 'mainHand' },
  necromancer: { name: 'Training Staff', slot: 'mainHand' },
  summoner: { name: 'Training Staff', slot: 'mainHand' },
  wizard: { name: 'Training Staff', slot: 'mainHand' },
};

function getEquippedBonuses(ctx: any, characterId: bigint) {
  const bonuses = {
    str: 0n,
    dex: 0n,
    cha: 0n,
    wis: 0n,
    int: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
  };
  for (const instance of ctx.db.itemInstance.by_owner.filter(characterId)) {
    if (!instance.equippedSlot) continue;
    const template = ctx.db.itemTemplate.id.find(instance.templateId);
    if (!template) continue;
    bonuses.str += template.strBonus;
    bonuses.dex += template.dexBonus;
    bonuses.cha += template.chaBonus;
    bonuses.wis += template.wisBonus;
    bonuses.int += template.intBonus;
    bonuses.hpBonus += template.hpBonus;
    bonuses.manaBonus += template.manaBonus;
    bonuses.armorClassBonus += template.armorClassBonus;
  }
  return bonuses;
}

function getEquippedWeaponStats(ctx: any, characterId: bigint) {
  for (const instance of ctx.db.itemInstance.by_owner.filter(characterId)) {
    if (instance.equippedSlot !== 'mainHand') continue;
    const template = ctx.db.itemTemplate.id.find(instance.templateId);
    if (!template) continue;
    return {
      baseDamage: template.weaponBaseDamage,
      dps: template.weaponDps,
      name: template.name,
      weaponType: template.weaponType,
    };
  }
  return { baseDamage: 0n, dps: 0n, name: '', weaponType: '' };
}

function abilityResourceCost(level: bigint, power: bigint) {
  return 4n + level * 2n + power;
}

function hasShieldEquipped(ctx: any, characterId: bigint) {
  for (const instance of ctx.db.itemInstance.by_owner.filter(characterId)) {
    if (instance.equippedSlot !== 'offHand') continue;
    const template = ctx.db.itemTemplate.id.find(instance.templateId);
    if (!template) continue;
    const name = template.name.toLowerCase();
    if (name.includes('shield') || template.armorType === 'shield') return true;
  }
  return false;
}

function getGroupParticipants(ctx: any, character: any, sameLocation: boolean = true) {
  const groupId = effectiveGroupId(character);
  if (!groupId) return [character];
  const participants: any[] = [];
  const seen = new Set<string>();
  for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
    const memberChar = ctx.db.character.id.find(member.characterId);
    if (!memberChar) continue;
    if (sameLocation && memberChar.locationId !== character.locationId) continue;
    const key = memberChar.id.toString();
    if (seen.has(key)) continue;
    participants.push(memberChar);
    seen.add(key);
  }
  return participants.length > 0 ? participants : [character];
}

function isGroupLeaderOrSolo(ctx: any, character: any) {
  const groupId = effectiveGroupId(character);
  if (!groupId) return true;
  const group = ctx.db.group.id.find(groupId);
  return !!group && group.leaderCharacterId === character.id;
}

function abilityCooldownMicros(ctx: any, abilityKey: string) {
  const rows = [...ctx.db.abilityTemplate.by_key.filter(abilityKey)];
  const ability = rows[0];
  if (!ability) return GLOBAL_COOLDOWN_MICROS;
  const specific = ability.cooldownSeconds ? ability.cooldownSeconds * 1_000_000n : 0n;
  return specific > GLOBAL_COOLDOWN_MICROS ? specific : GLOBAL_COOLDOWN_MICROS;
}

function abilityCastMicros(ctx: any, abilityKey: string) {
  const rows = [...ctx.db.abilityTemplate.by_key.filter(abilityKey)];
  const ability = rows[0];
  if (ability?.castSeconds) return ability.castSeconds * 1_000_000n;
  return 0n;
}

function enemyAbilityCastMicros(abilityKey: string) {
  const ability = ENEMY_ABILITIES[abilityKey as keyof typeof ENEMY_ABILITIES];
  if (ability?.castSeconds) return ability.castSeconds * 1_000_000n;
  return 0n;
}

function enemyAbilityCooldownMicros(abilityKey: string) {
  const ability = ENEMY_ABILITIES[abilityKey as keyof typeof ENEMY_ABILITIES];
  if (ability?.cooldownSeconds) return ability.cooldownSeconds * 1_000_000n;
  return 0n;
}

function rollAttackOutcome(
  seed: bigint,
  opts: {
    canBlock: boolean;
    canParry: boolean;
    canDodge: boolean;
    characterDex?: bigint;
    weaponName?: string;
    weaponType?: string;
  }
) {
  const roll = seed % 1000n;
  let cursor = 0n;
  if (opts.canDodge) {
    cursor += 50n;
    if (roll < cursor) return { outcome: 'dodge', multiplier: 0n };
  }
  if (opts.canParry) {
    cursor += 50n;
    if (roll < cursor) return { outcome: 'parry', multiplier: 0n };
  }
  if (opts.canBlock) {
    cursor += 50n;
    if (roll < cursor) return { outcome: 'block', multiplier: 50n };
  }
  // Critical strike check
  if (opts.characterDex !== undefined) {
    const critChance = calculateCritChance(opts.characterDex);
    if (roll < cursor + critChance) {
      const weaponType = opts.weaponType || '';
      const multiplier = getCritMultiplier(opts.weaponName ?? '', weaponType);
      return { outcome: 'crit', multiplier };
    }
  }
  return { outcome: 'hit', multiplier: 100n };
}

function abilityDamageFromWeapon(
  weaponDamage: bigint,
  percent: bigint,
  bonus: bigint
) {
  const scaled = (weaponDamage * percent) / 100n + bonus;
  return scaled > weaponDamage ? scaled : weaponDamage + bonus;
}

function partyMembersInLocation(ctx: any, character: typeof Character.rowType) {
  const groupId = effectiveGroupId(character);
  if (!groupId) return [character];
  const members: typeof Character.rowType[] = [];
  for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
    const memberChar = ctx.db.character.id.find(member.characterId);
    if (memberChar && memberChar.locationId === character.locationId) {
      members.push(memberChar);
    }
  }
  if (!members.find((row) => row.id === character.id)) members.unshift(character);
  return members;
}

function addCharacterEffect(
  ctx: any,
  characterId: bigint,
  effectType: string,
  magnitude: bigint,
  roundsRemaining: bigint,
  sourceAbility: string
) {
  const existing = [...ctx.db.characterEffect.by_character.filter(characterId)].find(
    (effect) => effect.effectType === effectType && effect.sourceAbility === sourceAbility
  );
  if (existing) {
    ctx.db.characterEffect.id.update({
      ...existing,
      magnitude,
      roundsRemaining,
    });
    return;
  }
  ctx.db.characterEffect.insert({
    id: 0n,
    characterId,
    effectType,
    magnitude,
    roundsRemaining,
    sourceAbility,
  });
}

function addEnemyEffect(
  ctx: any,
  combatId: bigint,
  enemyId: bigint,
  effectType: string,
  magnitude: bigint,
  roundsRemaining: bigint,
  sourceAbility: string
) {
  const existing = [...ctx.db.combatEnemyEffect.by_combat.filter(combatId)].find(
    (effect) =>
      effect.enemyId === enemyId &&
      effect.effectType === effectType &&
      effect.sourceAbility === sourceAbility
  );
  if (existing) {
    ctx.db.combatEnemyEffect.id.update({
      ...existing,
      magnitude,
      roundsRemaining,
    });
    return;
  }
  ctx.db.combatEnemyEffect.insert({
    id: 0n,
    combatId,
    enemyId,
    effectType,
    magnitude,
    roundsRemaining,
    sourceAbility,
  });
}

function applyHpBonus(
  ctx: any,
  character: typeof Character.rowType,
  amount: bigint,
  roundsRemaining: bigint,
  sourceAbility: string
) {
  ctx.db.character.id.update({
    ...character,
    maxHp: character.maxHp + amount,
    hp: character.hp + amount,
  });
  addCharacterEffect(ctx, character.id, 'hp_bonus', amount, roundsRemaining, sourceAbility);
}

function getTopAggroId(ctx: any, combatId: bigint, enemyId?: bigint) {
  let top: typeof AggroEntry.rowType | null = null;
  for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
    if (enemyId && entry.enemyId !== enemyId) continue;
    if (entry.petId) continue;
    if (!top || entry.value > top.value) top = entry;
  }
  return top?.characterId ?? null;
}

function sumCharacterEffect(ctx: any, characterId: bigint, effectType: string) {
  let total = 0n;
  for (const effect of ctx.db.characterEffect.by_character.filter(characterId)) {
    if (effect.effectType === effectType) total += BigInt(effect.magnitude);
  }
  return total;
}

function sumEnemyEffect(ctx: any, combatId: bigint, effectType: string, enemyId?: bigint) {
  let total = 0n;
  for (const effect of ctx.db.combatEnemyEffect.by_combat.filter(combatId)) {
    if (enemyId && effect.enemyId !== enemyId) continue;
    if (effect.effectType === effectType) total += BigInt(effect.magnitude);
  }
  return total;
}

function executeAbility(
  ctx: any,
  character: typeof Character.rowType,
  abilityKey: string,
  targetCharacterId?: bigint
) {
  const normalizedClass = normalizeClassName(character.className);
  const abilityRows = [...ctx.db.abilityTemplate.by_key.filter(abilityKey)];
  const ability = abilityRows[0];
  if (!ability) throw new SenderError('Unknown ability');
  if (ability.className !== normalizedClass) {
    throw new SenderError('Ability not available');
  }

  if (character.level < ability.level) throw new SenderError('Ability not unlocked');

  let staminaFree = false;
  if (ability.resource === 'stamina') {
    const free = [...ctx.db.characterEffect.by_character.filter(character.id)].find(
      (effect) => effect.effectType === 'stamina_free'
    );
    if (free) {
      staminaFree = true;
      ctx.db.characterEffect.id.delete(free.id);
    }
  }
  const resourceCost =
    ability.resource === 'stamina'
      ? staminaFree
        ? 0n
        : 3n
      : abilityResourceCost(ability.level, ability.power);
  if (ability.resource === 'mana') {
    if (character.mana < resourceCost) throw new SenderError('Not enough mana');
  } else if (ability.resource === 'stamina') {
    if (character.stamina < resourceCost) throw new SenderError('Not enough stamina');
  }

  const resolvedTargetId = targetCharacterId ?? character.id;
  const actorGroupId = effectiveGroupId(character);
  let targetCharacter: typeof Character.rowType | null = null;
  if (resolvedTargetId) {
    targetCharacter = ctx.db.character.id.find(resolvedTargetId);
    if (!targetCharacter) throw new SenderError('Target not found');
    if (actorGroupId) {
      if (effectiveGroupId(targetCharacter) !== actorGroupId) {
        throw new SenderError('Target not in your group');
      }
    } else if (targetCharacter.id !== character.id) {
      throw new SenderError('Target must be yourself');
    }
  }

  if (ability.resource === 'mana') {
    ctx.db.character.id.update({ ...character, mana: character.mana - resourceCost });
  } else if (ability.resource === 'stamina') {
    ctx.db.character.id.update({ ...character, stamina: character.stamina - resourceCost });
  }

  const combatId = activeCombatIdForCharacter(ctx, character.id);
  const combat = combatId ? ctx.db.combatEncounter.id.find(combatId) : null;
  const enemies = combatId ? [...ctx.db.combatEnemy.by_combat.filter(combatId)] : [];
  const preferredEnemy = character.combatTargetEnemyId
    ? enemies.find((row) => row.id === character.combatTargetEnemyId)
    : null;
  const enemy =
    preferredEnemy ??
    enemies.find((row) => row.currentHp > 0n) ??
    enemies[0] ??
    null;
  const enemyTemplate = enemy ? ctx.db.enemyTemplate.id.find(enemy.enemyTemplateId) : null;
  const enemyName = enemy?.displayName ?? enemyTemplate?.name ?? 'enemy';
  const weapon = getEquippedWeaponStats(ctx, character.id);
  const baseWeaponDamage = 5n + character.level + weapon.baseDamage + weapon.dps / 2n;
  const damageUp = sumCharacterEffect(ctx, character.id, 'damage_up');
  const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
  const abilityHungerRow = [...ctx.db.hunger.characterId.filter(character.id)][0] ?? null;
  const abilityIsWellFed = abilityHungerRow &&
    abilityHungerRow.wellFedUntil.microsSinceUnixEpoch > nowMicros;
  const wellFedAbilityBonus = abilityIsWellFed &&
    (abilityHungerRow.wellFedBuffType === 'str' || abilityHungerRow.wellFedBuffType === 'dex')
    ? abilityHungerRow.wellFedBuffMagnitude
    : 0n;
  const totalDamageUp = damageUp + wellFedAbilityBonus;

  const summonPet = (
    petLabel: string,
    petDescription: string,
    namePool: string[],
    ability?: { key: string; cooldownSeconds: bigint },
    stats?: {
      hpBase?: bigint;
      hpPerLevel?: bigint;
      damageBase?: bigint;
      damagePerLevel?: bigint;
      weaponScalePercent?: bigint;
    }
  ) => {
    if (!combatId || !combat || combat.state !== 'active') {
      throw new SenderError('Pets can only be summoned in combat');
    }
    if (!enemy) throw new SenderError('No enemy in combat');
    for (const existing of ctx.db.combatPet.by_combat.filter(combatId)) {
      if (existing.ownerCharacterId === character.id) {
        ctx.db.combatPet.id.delete(existing.id);
      }
    }
    const pickIndex = Number((nowMicros + character.id * 7n) % BigInt(namePool.length));
    const petName = namePool[pickIndex] ?? 'Echo';
    const displayName = `${petName} (${petLabel})`;
    // Pets inherit caster level so their baseline scales with the encounter tier.
    const petLevel = character.level > 0n ? character.level : 1n;
    const hpBase = stats?.hpBase ?? 16n;
    const hpPerLevel = stats?.hpPerLevel ?? 5n;
    const damageBase = stats?.damageBase ?? 3n;
    const damagePerLevel = stats?.damagePerLevel ?? 2n;
    const weaponScalePercent = stats?.weaponScalePercent ?? 50n;
    const weaponProxy = (weapon.baseDamage * weaponScalePercent) / 100n;
    const petMaxHp = hpBase + petLevel * hpPerLevel;
    const petAttackDamage = damageBase + petLevel * damagePerLevel + weaponProxy;
    const pet = ctx.db.combatPet.insert({
      id: 0n,
      combatId,
      ownerCharacterId: character.id,
      name: displayName,
      level: petLevel,
      currentHp: petMaxHp,
      maxHp: petMaxHp,
      attackDamage: petAttackDamage,
      abilityKey: ability?.key,
      abilityCooldownSeconds: ability?.cooldownSeconds,
      // Allow pets to attempt their ability immediately on summon.
      nextAbilityAt: ability ? nowMicros : undefined,
      targetEnemyId: enemy.id,
      nextAutoAttackAt: nowMicros + AUTO_ATTACK_INTERVAL,
    });
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'ability',
      `You have summoned ${petDescription}.`
    );
    if (actorGroupId) {
      appendGroupEvent(
        ctx,
        actorGroupId,
        character.id,
        'ability',
        `${character.name} has summoned ${petDescription}.`
      );
    }
  };

  const logGroup = (kind: string, message: string) => {
    if (!actorGroupId) return;
    appendGroupEvent(ctx, actorGroupId, character.id, kind, message);
  };
  const applyDamage = (
    percent: bigint,
    bonus: bigint,
    options?: {
      hits?: bigint;
      ignoreArmor?: bigint;
      threatBonus?: bigint;
      debuff?: { type: string; magnitude: bigint; rounds: bigint; source: string };
      dot?: { magnitude: bigint; rounds: bigint; source: string };
      message?: string;
      perHitMessage?: (damage: bigint, hitIndex: bigint, totalHits: bigint) => string;
    }
  ) => {
    if (!enemy || !combatId) throw new SenderError('No enemy in combat');
    const hits = options?.hits ?? 1n;
    let armor = enemy.armorClass;
    const armorDebuff = sumEnemyEffect(ctx, combatId, 'armor_down', enemy.id);
    if (armorDebuff !== 0n) {
      armor = armor + armorDebuff;
      if (armor < 0n) armor = 0n;
    }
    if (options?.ignoreArmor) {
      armor = armor > options.ignoreArmor ? armor - options.ignoreArmor : 0n;
    }
    // Get ability info for stat scaling
    const statScaling = getAbilityStatScaling(
      { str: character.str, dex: character.dex, cha: character.cha, wis: character.wis, int: character.int },
      abilityKey,
      character.className,
      ability.statScaling ?? 'none'
    );
    const abilityMultiplier = ability
      ? getAbilityMultiplier(ability.castSeconds, ability.cooldownSeconds)
      : 100n;

    // Hybrid formula: (base + stat_scaling) * ability_multiplier / 100
    const abilityBaseDamage = ability ? (ability.power ?? 0n) * 5n : 0n;
    const scaledAbilityDamage = ((abilityBaseDamage + statScaling) * abilityMultiplier) / 100n;

    // Power budget split for DoT abilities
    const directPowerFraction = ability?.dotPowerSplit ? 1.0 - ability.dotPowerSplit : 1.0;

    // Apply power budget split to scaled ability damage
    const directAbilityDamage = (scaledAbilityDamage * BigInt(Math.floor(directPowerFraction * 100))) / 100n;

    // If ability has DoT, calculate DoT damage with reduced stat scaling
    let dotDamagePerTick = 0n;
    let dotDuration = 0n;
    if (ability?.dotPowerSplit && ability?.dotDuration) {
      const dotPowerFraction = ability.dotPowerSplit;
      const dotTotalDamage = (scaledAbilityDamage * BigInt(Math.floor(dotPowerFraction * 100))) / 100n;

      // DoT stat scaling uses REDUCED rate (50% of direct scaling)
      const dotStatScaling = (statScaling * DOT_SCALING_RATE_MODIFIER) / 100n;

      // DoT damage per tick = (total DoT power + reduced stat scaling) / duration
      dotDamagePerTick = ((dotTotalDamage + dotStatScaling) / ability.dotDuration);
      dotDuration = ability.dotDuration;
    }

    // If ability has debuff, reduce direct damage by debuff power cost
    let finalDirectDamage = directAbilityDamage;
    if (ability?.debuffType && ability?.debuffMagnitude && ability?.debuffDuration) {
      const debuffCostFraction = 1.0 - (Number(DEBUFF_POWER_COST_PERCENT) / 100);
      finalDirectDamage = (directAbilityDamage * BigInt(Math.floor(debuffCostFraction * 100))) / 100n;
    }

    // Weapon component (for weapon abilities that use percent > 0)
    const weaponComponent = percent > 0n ? abilityDamageFromWeapon(baseWeaponDamage, percent, bonus) : 0n;

    // AoE target enumeration and damage reduction
    if (ability?.aoeTargets === 'all_enemies') {
      const aoeMultiplier = Number(AOE_DAMAGE_MULTIPLIER) / 100;  // 65% = 0.65
      const enemies = [...ctx.db.combatEnemy.by_combat.filter(combatId)];

      for (const targetEnemy of enemies) {
        if (targetEnemy.currentHp === 0n) continue;  // Skip dead enemies

        // Apply AoE damage reduction to final direct damage
        const aoeDamage = (finalDirectDamage * BigInt(Math.floor(aoeMultiplier * 100))) / 100n;

        // Get target's armor for mitigation
        let targetArmor = targetEnemy.armorClass;
        const armorDebuff = sumEnemyEffect(ctx, combatId, 'armor_down', targetEnemy.id);
        if (armorDebuff !== 0n) {
          targetArmor = targetArmor + armorDebuff;
          if (targetArmor < 0n) targetArmor = 0n;
        }

        // Route mitigation by damage type
        const dmgType = ability?.damageType ?? 'physical';
        let mitigatedDamage: bigint;
        if (dmgType === 'magic') {
          mitigatedDamage = aoeDamage > 0n ? aoeDamage : 1n;
        } else {
          mitigatedDamage = applyArmorMitigation(aoeDamage, targetArmor);
        }

        // Apply damage to target
        const nextHp = targetEnemy.currentHp > mitigatedDamage ? targetEnemy.currentHp - mitigatedDamage : 0n;
        ctx.db.combatEnemy.id.update({ ...targetEnemy, currentHp: nextHp });

        // Update aggro for this target
        for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
          if (entry.characterId === character.id && entry.enemyId === targetEnemy.id) {
            const className = character.className?.toLowerCase() ?? '';
            const threatMult = TANK_CLASSES.has(className) ? TANK_THREAT_MULTIPLIER
              : HEALER_CLASSES.has(className) ? HEALER_THREAT_MULTIPLIER : 100n;
            const threat = (mitigatedDamage * threatMult) / 100n;
            ctx.db.aggroEntry.id.update({
              ...entry,
              value: entry.value + threat,
            });
            break;
          }
        }

        // Apply DoT to all AoE targets (DoT not further reduced per user decision: "Single tax")
        if (dotDamagePerTick > 0n && dotDuration > 0n && ability?.name) {
          addEnemyEffect(
            ctx,
            combatId,
            targetEnemy.id,
            'dot',
            dotDamagePerTick,
            dotDuration,
            ability.name
          );
        }

        // Log damage for each target
        const targetEnemyTemplate = ctx.db.enemyTemplate.id.find(targetEnemy.enemyTemplateId);
        const targetName = targetEnemy.displayName ?? targetEnemyTemplate?.name ?? 'enemy';
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'damage',
          `Your ${ability.name} hits ${targetName} for ${mitigatedDamage} damage.`
        );
        if (actorGroupId) {
          appendGroupEvent(
            ctx,
            actorGroupId,
            character.id,
            'damage',
            `${character.name}'s ${ability.name} hits ${targetName} for ${mitigatedDamage} damage.`
          );
        }
      }

      // AoE abilities skip single-target damage application (already processed all targets above)
      return 0n;  // Return early from applyDamage function
    }

    let totalDamage = 0n;
    const hitDamages: bigint[] = [];
    for (let i = 0n; i < hits; i += 1n) {
      // Total raw damage
      const raw = weaponComponent + finalDirectDamage + totalDamageUp + sumEnemyEffect(ctx, combatId, 'damage_taken', enemy.id);

      // Route mitigation by damage type
      const dmgType = ability?.damageType ?? 'physical';
      let reduced: bigint;
      if (dmgType === 'magic') {
        // Magic damage bypasses armor entirely (makes magic impactful)
        reduced = raw > 0n ? raw : 1n;
      } else {
        // Physical damage uses armor mitigation
        reduced = applyArmorMitigation(raw, armor);
      }
      hitDamages.push(reduced);
      totalDamage += reduced;
    }
    const nextHp = enemy.currentHp > totalDamage ? enemy.currentHp - totalDamage : 0n;
    ctx.db.combatEnemy.id.update({ ...enemy, currentHp: nextHp });
    for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
      if (entry.characterId === character.id && entry.enemyId === enemy.id) {
        const className = character.className?.toLowerCase() ?? '';
        const threatMult = TANK_CLASSES.has(className) ? TANK_THREAT_MULTIPLIER
          : HEALER_CLASSES.has(className) ? HEALER_THREAT_MULTIPLIER : 100n;
        const threat = (totalDamage * threatMult) / 100n + (options?.threatBonus ?? 0n);
        ctx.db.aggroEntry.id.update({
          ...entry,
          value: entry.value + threat,
        });
        break;
      }
    }
    if (options?.debuff) {
      addEnemyEffect(
        ctx,
        combatId,
        enemy.id,
        options.debuff.type,
        options.debuff.magnitude,
        options.debuff.rounds,
        options.debuff.source
      );
    }
    if (options?.dot) {
      addEnemyEffect(
        ctx,
        combatId,
        enemy.id,
        'dot',
        options.dot.magnitude,
        options.dot.rounds,
        options.dot.source
      );
    }

    // Apply DoT effect if ability has DoT metadata
    if (dotDamagePerTick > 0n && dotDuration > 0n && ability?.name) {
      addEnemyEffect(
        ctx,
        combatId,
        enemy.id,
        'dot',
        dotDamagePerTick,
        dotDuration,
        ability.name
      );
    }

    // Apply debuff effect if ability has debuff metadata
    if (ability?.debuffType && ability?.debuffMagnitude && ability?.debuffDuration) {
      addEnemyEffect(
        ctx,
        combatId,
        enemy.id,
        ability.debuffType,
        ability.debuffMagnitude,
        ability.debuffDuration,
        ability.name
      );
    }

    if (options?.perHitMessage) {
      for (let i = 0; i < hitDamages.length; i += 1) {
        const hitIndex = BigInt(i + 1);
        const privateMessage = options.perHitMessage(hitDamages[i], hitIndex, hits);
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'damage', privateMessage);
        // For group, replace "Your" with character name (simple text replacement for per-hit messages)
        const groupMessage = privateMessage.replace(/^Your /, `${character.name}'s `).replace(/ your /, ` ${character.name}'s `);
        logGroup('damage', groupMessage);
      }
    } else {
      const privateMessage =
        options?.message ?? `Your ${ability.name} hits ${enemyName} for ${totalDamage} damage.`;
      const groupMessage = `${character.name}'s ${ability.name} hits ${enemyName} for ${totalDamage} damage.`;
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'damage', privateMessage);
      logGroup('damage', groupMessage);
    }
    return totalDamage;
  };

  const partyMembers = partyMembersInLocation(ctx, character);
  const applyHeal = (target: typeof Character.rowType, amount: bigint, source: string) => {
    const current = ctx.db.character.id.find(target.id);
    if (!current) return;

    // Power budget split for HoT abilities
    const directHealFraction = ability?.hotPowerSplit ? 1.0 - ability.hotPowerSplit : 1.0;
    const directHeal = (amount * BigInt(Math.floor(directHealFraction * 100))) / 100n;

    // If ability has HoT, calculate HoT healing with reduced stat scaling
    if (ability?.hotPowerSplit && ability?.hotDuration && ability?.name) {
      const hotPowerFraction = ability.hotPowerSplit;
      const hotTotalHealing = (amount * BigInt(Math.floor(hotPowerFraction * 100))) / 100n;

      // HoT stat scaling uses REDUCED rate (50% of direct healing scaling)
      // Note: WIS scaling already applied via calculateHealingPower, so we split the final scaled amount
      const scaledHotTotal = calculateHealingPower(hotTotalHealing, character.wis, character.className);
      const hotHealPerTick = scaledHotTotal / ability.hotDuration;

      // Apply HoT effect to target
      addCharacterEffect(ctx, target.id, 'regen', hotHealPerTick, ability.hotDuration, ability.name);
    }

    // Apply WIS scaling to healing output (uses the CASTER's WIS, not target's)
    // Use directHeal for immediate healing (replace 'amount' with 'directHeal')
    const scaledAmount = calculateHealingPower(directHeal, character.wis, character.className);
    const nextHp = current.hp + scaledAmount > current.maxHp ? current.maxHp : current.hp + scaledAmount;
    ctx.db.character.id.update({ ...current, hp: nextHp });
    const message = `${source} restores ${scaledAmount} health to ${current.name}.`;
    appendPrivateEvent(ctx, current.id, current.ownerUserId, 'heal', message);
    if (current.id !== character.id) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'heal', message);
    }
    logGroup('heal', message);

    // Healing generates threat: 50% of healing done, split across all enemies
    if (combatId) {
      const healingThreat = (scaledAmount * HEALING_THREAT_PERCENT) / 100n;
      if (healingThreat > 0n) {
        const enemiesInCombat = [...ctx.db.combatEnemy.by_combat.filter(combatId)]
          .filter((e: any) => e.currentHp > 0n);
        if (enemiesInCombat.length > 0) {
          const threatPerEnemy = healingThreat / BigInt(enemiesInCombat.length);
          if (threatPerEnemy > 0n) {
            for (const en of enemiesInCombat) {
              for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
                if (entry.characterId === character.id && entry.enemyId === en.id) {
                  ctx.db.aggroEntry.id.update({ ...entry, value: entry.value + threatPerEnemy });
                  break;
                }
              }
            }
          }
        }
      }
    }
  };
  const applyMana = (target: typeof Character.rowType, amount: bigint, source: string) => {
    const current = ctx.db.character.id.find(target.id);
    if (!current || current.maxMana === 0n) return;
    const nextMana = current.mana + amount > current.maxMana ? current.maxMana : current.mana + amount;
    ctx.db.character.id.update({ ...current, mana: nextMana });
    const message = `${source} restores ${amount} mana to ${current.name}.`;
    appendPrivateEvent(ctx, current.id, current.ownerUserId, 'ability', message);
    if (current.id !== character.id) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability', message);
    }
    logGroup('ability', message);
  };
  const applyPartyEffect = (
    effectType: string,
    magnitude: bigint,
    rounds: bigint,
    source: string
  ) => {
    for (const member of partyMembers) {
      addCharacterEffect(ctx, member.id, effectType, magnitude, rounds, source);
    }
  };
  const applyPartyHpBonus = (amount: bigint, rounds: bigint, source: string) => {
    for (const member of partyMembers) {
      applyHpBonus(ctx, member, amount, rounds, source);
    }
  };

  switch (abilityKey) {
    case 'shaman_spirit_mender':
      if (!targetCharacter) throw new SenderError('Target required');
      applyHeal(targetCharacter, 12n, 'Spirit Mender');
      addCharacterEffect(ctx, targetCharacter.id, 'regen', 5n, 2n, 'Spirit Mender');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Spirit Mender soothes ${targetCharacter.name}.`
      );
      return;
    case 'shaman_spirit_wolf':
      summonPet('Spirit Wolf', 'a spirit wolf', [
        'Mistfang',
        'Ghostpaw',
        'Duskhowl',
        'Frostpad',
        'Silent',
      ], undefined, { damageBase: 4n, damagePerLevel: 2n, weaponScalePercent: 45n });
      return;
    case 'shaman_hex':
      applyDamage(0n, 0n, {
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 3n, source: 'Hex' },
      });
      return;
    case 'shaman_ancestral_ward':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'ac_bonus', 2n, 3n, 'Ancestral Ward');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Ancestral Ward shields ${targetCharacter.name}.`
      );
      return;
    case 'shaman_stormcall':
      applyDamage(0n, 0n);
      return;
    case 'warrior_slam':
      applyDamage(0n, 0n, {
        threatBonus: 10n,
        debuff: { type: 'skip', magnitude: 1n, rounds: 1n, source: 'Slam' },
      });
      return;
    case 'warrior_intimidating_presence':
      if (!enemy || !combatId) throw new SenderError('No enemy target');
      addEnemyEffect(ctx, combatId, enemy.id, 'damage_down', -3n, 3n, 'Intimidating Presence');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `You intimidate ${enemyName}, sapping its strength.`
      );
      return;
    case 'warrior_cleave':
      applyDamage(0n, 0n);
      return;
    case 'warrior_rally':
      applyPartyEffect('ac_bonus', 3n, 3n, 'Rally');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Your Rally fortifies the party.'
      );
      return;
    case 'warrior_crushing_blow':
      applyDamage(0n, 0n, { threatBonus: 5n });
      return;
    case 'bard_discordant_note':
      applyDamage(0n, 0n);
      applyPartyEffect('damage_up', 1n, 2n, 'Discordant Note');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Discordant Note that deals damage and sharpens the party.'
      );
      return;
    case 'bard_ballad_of_resolve':
      for (const member of partyMembers) {
        addCharacterEffect(ctx, member.id, 'str_bonus', 1n, 60n, 'Ballad of Resolve');
        recomputeCharacterDerived(ctx, member);
      }
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Ballad of Resolve strengthens the party.'
      );
      return;
    case 'bard_echoed_chord': {
      const allyBonus = BigInt(partyMembers.length - 1) > 0n ? BigInt(partyMembers.length - 1) : 0n;
      applyDamage(0n, 0n);
      return;
    }
    case 'bard_harmony':
      applyPartyEffect('damage_up', 2n, 3n, 'Harmony');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Harmony steadies the party.'
      );
      return;
    case 'bard_crushing_crescendo': {
      let bonus = 5n;
      if (enemy && enemy.currentHp * 2n <= enemy.maxHp) bonus += 3n;
      applyDamage(0n, 0n);
      return;
    }
    case 'enchanter_mind_fray':
      applyDamage(0n, 0n, {
        dot: { magnitude: 2n, rounds: 2n, source: 'Mind Fray' },
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 2n, source: 'Mind Fray' },
      });
      return;
    case 'enchanter_veil_of_calm':
      addCharacterEffect(ctx, character.id, 'pull_veil', 1n, 12n, 'Veil of Calm');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Veil of Calm settles your presence for the next pull.'
      );
      return;
    case 'enchanter_slow':
      applyDamage(0n, 0n, {
        debuff: { type: 'damage_down', magnitude: -3n, rounds: 2n, source: 'Slow' },
      });
      return;
    case 'enchanter_clarity_ii':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'mana_regen', 6n, 3n, 'Clarity II');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Clarity II restores ${targetCharacter.name}'s mana.`
      );
      return;
    case 'enchanter_charm_fray':
      applyDamage(0n, 0n, {
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 2n, source: 'Charm Fray' },
      });
      return;
    case 'cleric_mend':
      if (!targetCharacter) throw new SenderError('Target required');
      applyHeal(targetCharacter, 18n, 'Mend');
      return;
    case 'cleric_sanctify': {
      if (!targetCharacter) throw new SenderError('Target required');
      const effects = [...ctx.db.characterEffect.by_character.filter(targetCharacter.id)];
      const negative = effects.find(
        (effect) => effect.effectType === 'dot' || effect.magnitude < 0n
      );
      if (negative) {
        ctx.db.characterEffect.id.delete(negative.id);
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          `Sanctify cleanses ${targetCharacter.name}.`
        );
      } else {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          `${targetCharacter.name} has no harmful effects to cleanse.`
        );
      }
      return;
    }
    case 'cleric_smite':
      applyDamage(0n, 0n);
      return;
    case 'cleric_sanctuary':
      applyPartyEffect('ac_bonus', 3n, 3n, 'Sanctuary');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Sanctuary shelters the party.'
      );
      return;
    case 'cleric_heal':
      if (!targetCharacter) throw new SenderError('Target required');
      applyHeal(targetCharacter, 15n, 'Heal');
      return;
    case 'wizard_magic_missile':
      applyDamage(0n, 0n);
      return;
    case 'wizard_arcane_reservoir': {
      const amount =
        character.maxMana > 0n ? (character.maxMana / 4n > 10n ? character.maxMana / 4n : 10n) : 0n;
      if (amount > 0n) {
        applyMana(character, amount, 'Arcane Reservoir');
      }
      return;
    }
    case 'wizard_frost_shard':
      applyDamage(0n, 0n, {
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 2n, source: 'Frost Shard' },
      });
      return;
    case 'wizard_mana_shield':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'ac_bonus', 3n, 3n, 'Mana Shield');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Mana Shield protects ${targetCharacter.name}.`
      );
      return;
    case 'wizard_lightning_surge':
      applyDamage(0n, 0n);
      return;
    case 'rogue_shadow_cut':
      applyDamage(0n, 0n, { dot: { magnitude: 2n, rounds: 2n, source: 'Shadow Cut' } });
      return;
    case 'rogue_pickpocket': {
      const seed = ctx.timestamp.microsSinceUnixEpoch + character.id;
      const roll = Number(seed % 100n);
      const targetLabel = enemy ? enemyName : 'your mark';
      if (roll < 60) {
        const gold = 2n + (seed % 5n);
        ctx.db.character.id.update({ ...character, gold: (character.gold ?? 0n) + gold });
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          `You pickpocket ${gold} gold from ${targetLabel}.`
        );
        return;
      }
      const junk = [...ctx.db.itemTemplate.iter()].filter((row) => row.isJunk);
      if (junk.length === 0) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          'You find nothing of value.'
        );
        return;
      }
      const template = junk[Number(seed % BigInt(junk.length))];
      if (!hasInventorySpace(ctx, character.id, template.id)) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          'Your pack is full.'
        );
        return;
      }
      addItemToInventory(ctx, character.id, template.id, 1n);
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `You lift a ${template.name} from ${targetLabel}.`
      );
      return;
    }
    case 'rogue_bleed':
      applyDamage(0n, 0n, { dot: { magnitude: 3n, rounds: 2n, source: 'Bleed' } });
      return;
    case 'rogue_evasion':
      addCharacterEffect(ctx, character.id, 'ac_bonus', 3n, 2n, 'Evasion');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Evasion heightens your defenses.'
      );
      return;
    case 'rogue_shadow_strike': {
      const dotAmount = enemy ? sumEnemyEffect(ctx, combatId ?? 0n, 'dot', enemy.id) : 0n;
      const bonus = dotAmount > 0n ? 6n : 4n;
      applyDamage(0n, 0n);
      return;
    }
    case 'paladin_holy_strike':
      applyDamage(0n, 0n);
      addCharacterEffect(ctx, character.id, 'ac_bonus', 2n, 2n, 'Holy Strike');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Holy Strike steadies your guard.'
      );
      return;
    case 'paladin_lay_on_hands': {
      const target = targetCharacter ?? character;
      const missing = target.maxHp > target.hp ? target.maxHp - target.hp : 0n;
      if (missing > 0n) applyHeal(target, missing, 'Lay on Hands');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Lay on Hands restores ${target.name}.`
      );
      return;
    }
    case 'paladin_shield_of_faith':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'ac_bonus', 3n, 3n, 'Shield of Faith');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Shield of Faith protects ${targetCharacter.name}.`
      );
      return;
    case 'paladin_devotion':
      applyPartyEffect('damage_up', 3n, 3n, 'Devotion');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Devotion inspires the party.'
      );
      return;
    case 'paladin_radiant_smite':
      applyDamage(0n, 0n, { dot: { magnitude: 2n, rounds: 2n, source: 'Radiant Smite' } });
      return;
    case 'ranger_marked_shot':
      applyDamage(0n, 0n, {
        debuff: { type: 'damage_taken', magnitude: 1n, rounds: 2n, source: 'Marked Shot' },
      });
      return;
    case 'ranger_track': {
      // Get all enemy spawns at the character's location
      const spawns = [...ctx.db.enemySpawn.by_location.filter(character.locationId)];

      if (spawns.length === 0) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          'You find no tracks worth following.'
        );
        return;
      }

      // Reveal information about each enemy spawn
      let trackedCount = 0;
      for (const spawn of spawns) {
        const template = ctx.db.enemyTemplate.id.find(spawn.enemyTemplateId);
        if (!template) continue;

        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          `Tracks reveal: ${template.name} (Level ${template.level})`
        );
        trackedCount += 1;
      }

      if (trackedCount === 0) {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          'You find no tracks worth following.'
        );
      } else {
        // Add tracking buff effect (cosmetic indicator that ability worked)
        addCharacterEffect(ctx, character.id, 'tracking', 1n, 6n, 'Track');
      }

      return;
    }
    case 'ranger_rapid_shot':
      applyDamage(0n, 0n, { hits: 2n });
      return;
    case 'ranger_natures_balm':
      if (!targetCharacter) throw new SenderError('Target required');
      addCharacterEffect(ctx, targetCharacter.id, 'regen', 7n, 3n, "Nature's Balm");
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `Nature's Balm mends ${targetCharacter.name}.`
      );
      return;
    case 'ranger_piercing_arrow':
      applyDamage(0n, 0n, { ignoreArmor: 5n });
      return;
    case 'necromancer_plague_spark':
      applyDamage(0n, 0n, { dot: { magnitude: 3n, rounds: 2n, source: 'Plague Spark' } });
      applyHeal(character, 4n, 'Plague Spark');
      return;
    case 'necromancer_bone_servant':
      summonPet('Skeleton', 'a skeleton', [
        'Rattle',
        'Grin',
        'Shard',
        'Grave',
        'Morrow',
      ], undefined, { damageBase: 4n, damagePerLevel: 2n, weaponScalePercent: 45n });
      return;
    case 'necromancer_wither':
      applyDamage(0n, 0n, { dot: { magnitude: 3n, rounds: 2n, source: 'Wither' } });
      return;
    case 'necromancer_bone_ward':
      addCharacterEffect(ctx, character.id, 'ac_bonus', 3n, 3n, 'Bone Ward');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Bone Ward hardens your defenses.'
      );
      return;
    case 'necromancer_grave_surge':
      applyDamage(0n, 0n);
      return;
    case 'spellblade_arcane_slash':
      applyDamage(0n, 0n, {
        debuff: { type: 'armor_down', magnitude: -2n, rounds: 2n, source: 'Arcane Slash' },
      });
      return;
    case 'spellblade_rune_ward':
      addCharacterEffect(ctx, character.id, 'damage_shield', 10n, 6n, 'Rune Ward');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Rune Ward wraps you in protective sigils.'
      );
      return;
    case 'spellblade_runic_strike':
      applyDamage(0n, 0n, {
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 2n, source: 'Runic Strike' },
      });
      return;
    case 'spellblade_ward':
      addCharacterEffect(ctx, character.id, 'ac_bonus', 3n, 3n, 'Ward');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Ward surrounds you in arcane protection.'
      );
      return;
    case 'spellblade_spellstorm':
      applyDamage(0n, 0n, { hits: 3n });
      return;
    case 'beastmaster_pack_rush':
      applyDamage(0n, 0n, {
        hits: 2n,
        perHitMessage: (damage, hitIndex, totalHits) =>
          `Your ${ability.name} hits ${enemyName} for ${damage} damage. (${hitIndex}/${totalHits})`,
      });
      return;
    case 'beastmaster_call_beast':
      summonPet(
        'Beast',
        'a wild beast',
        ['Brindle', 'Moss', 'Cinder', 'Tawny', 'Thorn'],
        { key: 'pet_bleed', cooldownSeconds: 10n },
        { damageBase: 3n, damagePerLevel: 1n, weaponScalePercent: 35n }
      );
      return;
    case 'beastmaster_beast_fang':
      applyDamage(0n, 0n, { dot: { magnitude: 2n, rounds: 2n, source: 'Beast Fang' } });
      return;
    case 'beastmaster_wild_howl':
      applyPartyEffect('damage_up', 3n, 3n, 'Wild Howl');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Wild Howl emboldens the party.'
      );
      return;
    case 'beastmaster_alpha_assault':
      applyDamage(0n, 0n);
      return;
    case 'monk_crippling_kick':
      applyDamage(0n, 0n, {
        debuff: { type: 'damage_down', magnitude: -2n, rounds: 2n, source: 'Crippling Kick' },
      });
      return;
    case 'monk_centering':
      addCharacterEffect(ctx, character.id, 'stamina_free', 1n, 2n, 'Centering');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'You center yourself for a cost-free strike.'
      );
      return;
    case 'monk_palm_strike':
      applyDamage(0n, 0n);
      return;
    case 'monk_inner_focus':
      addCharacterEffect(ctx, character.id, 'ac_bonus', 3n, 3n, 'Inner Focus');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Inner Focus hardens your guard.'
      );
      return;
    case 'monk_tiger_flurry':
      applyDamage(0n, 0n, { hits: 3n });
      return;
    case 'druid_thorn_lash':
      applyDamage(0n, 0n, { dot: { magnitude: 2n, rounds: 2n, source: 'Thorn Lash' } });
      applyHeal(character, 6n, 'Thorn Lash');
      return;
    case 'druid_natures_mark': {
      if (activeCombatIdForCharacter(ctx, character.id)) {
        throw new SenderError('Cannot use while in combat');
      }
      // Re-read character from database to ensure fresh data after mana deduction
      const freshChar = ctx.db.character.id.find(character.id);
      if (!freshChar) {
        throw new SenderError('Character not found');
      }
      const location = ctx.db.location.id.find(freshChar.locationId);
      if (!location) throw new SenderError('Location not found');
      const pool = getGatherableResourceTemplates(ctx, location.terrainType ?? 'plains');
      if (pool.length === 0) {
        appendPrivateEvent(
          ctx,
          freshChar.id,
          freshChar.ownerUserId,
          'ability',
          'Nature yields nothing here.'
        );
        return;
      }
      const seed = ctx.timestamp.microsSinceUnixEpoch + freshChar.id;
      const picked = pool[Number(seed % BigInt(pool.length))];
      const template = picked?.template;
      if (!template) {
        appendPrivateEvent(
          ctx,
          freshChar.id,
          freshChar.ownerUserId,
          'ability',
          'Nature yields nothing here.'
        );
        return;
      }
      const quantity = 1n + (seed % 4n);
      if (!hasInventorySpace(ctx, freshChar.id, template.id)) {
        appendPrivateEvent(
          ctx,
          freshChar.id,
          freshChar.ownerUserId,
          'ability',
          'Your pack is full.'
        );
        return;
      }
      addItemToInventory(ctx, freshChar.id, template.id, quantity);
      appendPrivateEvent(
        ctx,
        freshChar.id,
        freshChar.ownerUserId,
        'ability',
        `Nature's Mark yields ${quantity} ${template.name}.`
      );
      return;
    }
    case 'druid_bramble':
      applyDamage(0n, 0n, { dot: { magnitude: 3n, rounds: 2n, source: 'Bramble' } });
      return;
    case 'druid_natures_gift':
      applyPartyHpBonus(15n, 3n, "Nature's Gift");
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        "Nature's Gift blesses the party."
      );
      return;
    case 'druid_wild_surge':
      applyDamage(0n, 0n);
      return;
    case 'reaver_blood_rend':
      {
        const dealt = applyDamage(0n, 0n);
        if (dealt > 0n) {
          const leech = (dealt * 30n) / 100n;
          applyHeal(character, leech > 0n ? leech : 1n, 'Blood Rend');
        }
      }
      return;
    case 'reaver_blood_pact':
      addCharacterEffect(ctx, character.id, 'damage_up', 3n, 3n, 'Blood Pact');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Blood Pact fuels your offense.'
      );
      return;
    case 'reaver_soul_rend':
      applyDamage(0n, 0n, { dot: { magnitude: 3n, rounds: 2n, source: 'Soul Rend' } });
      return;
    case 'reaver_dread_aura':
      applyDamage(0n, 0n, {
        debuff: { type: 'damage_down', magnitude: -3n, rounds: 2n, source: 'Dread Aura' },
      });
      return;
    case 'reaver_oblivion':
      applyDamage(0n, 0n);
      return;
    case 'summoner_conjure_vessel':
      applyDamage(0n, 0n);
      addCharacterEffect(ctx, character.id, 'mana_regen', 2n, 2n, 'Familiar Strike');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Conjure a vessel that strikes your enemy and captures some of their essence.'
      );
      return;
    case 'summoner_earth_familiar':
      summonPet(
        'Familiar',
        'an earth familiar',
        ['Cipher', 'Glim', 'Vex', 'Aster', 'Sigil'],
        { key: 'pet_taunt', cooldownSeconds: 10n },
        { hpBase: 22n, hpPerLevel: 6n, damageBase: 2n, damagePerLevel: 1n, weaponScalePercent: 30n }
      );
      return;
    case 'summoner_conjured_spike':
      applyDamage(0n, 0n);
      return;
    case 'summoner_empower':
      applyPartyEffect('damage_up', 2n, 3n, 'Empower');
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        'Empower strengthens the party.'
      );
      return;
    case 'summoner_spectral_lance':
      applyDamage(0n, 0n);
      return;
    default:
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'ability',
        `You use ${ability.name}.`
      );
  }
}

function recomputeCharacterDerived(ctx: any, character: typeof Character.rowType) {
  const gear = getEquippedBonuses(ctx, character.id);
  const effectStats = {
    str: sumCharacterEffect(ctx, character.id, 'str_bonus'),
    dex: sumCharacterEffect(ctx, character.id, 'dex_bonus'),
    cha: sumCharacterEffect(ctx, character.id, 'cha_bonus'),
    wis: sumCharacterEffect(ctx, character.id, 'wis_bonus'),
    int: sumCharacterEffect(ctx, character.id, 'int_bonus'),
  };
  const totalStats = {
    str: character.str + gear.str + effectStats.str,
    dex: character.dex + gear.dex + effectStats.dex,
    cha: character.cha + gear.cha + effectStats.cha,
    wis: character.wis + gear.wis + effectStats.wis,
    int: character.int + gear.int + effectStats.int,
  };

  const manaStat = manaStatForClass(character.className, totalStats);
  const maxHp = BASE_HP + totalStats.str * HP_STR_MULTIPLIER + gear.hpBonus;
  const maxMana = usesMana(character.className)
    ? BASE_MANA + manaStat * 6n + gear.manaBonus
    : 0n;

  const hitChance = totalStats.dex * 15n;
  const dodgeChance = totalStats.dex * 12n;
  const parryChance = totalStats.dex * 10n;
  const critMelee = totalStats.dex * 12n;
  const critRanged = totalStats.dex * 12n;
  const critDivine = totalStats.wis * 12n;
  const critArcane = totalStats.int * 12n;
  const armorClass =
    baseArmorForClass(character.className) +
    gear.armorClassBonus +
    sumCharacterEffect(ctx, character.id, 'ac_bonus');
  const perception = totalStats.wis * 25n;
  const search = totalStats.int * 25n;
  const ccPower = totalStats.cha * 15n;
  const vendorBuyMod = totalStats.cha * 10n;
  const vendorSellMod = totalStats.cha * 8n;

  const updated = {
    ...character,
    maxHp,
    maxMana,
    hitChance,
    dodgeChance,
    parryChance,
    critMelee,
    critRanged,
    critDivine,
    critArcane,
    armorClass,
    perception,
    search,
    ccPower,
    vendorBuyMod,
    vendorSellMod,
  };

  const clampedHp = character.hp > maxHp ? maxHp : character.hp;
  const clampedMana = maxMana === 0n ? 0n : character.mana > maxMana ? maxMana : character.mana;
  ctx.db.character.id.update({
    ...updated,
    hp: clampedHp,
    mana: clampedMana,
  });
}

function applyEnemyAbilityDamage(
  ctx: any,
  target: any,
  rawDamage: bigint,
  damageType: string,
  enemyName: string,
  abilityName: string
): bigint {
  let finalDamage = rawDamage;
  if (damageType === 'physical') {
    const effectiveArmor = target.armorClass + sumCharacterEffect(ctx, target.id, 'ac_bonus');
    finalDamage = applyArmorMitigation(rawDamage, effectiveArmor > 0n ? effectiveArmor : 0n);
  } else if (damageType === 'magic') {
    const magicResist = sumCharacterEffect(ctx, target.id, 'magic_resist');
    finalDamage = applyMagicResistMitigation(rawDamage, magicResist);
  }
  if (finalDamage < 1n) finalDamage = 1n;
  const nextHp = target.hp > finalDamage ? target.hp - finalDamage : 0n;
  ctx.db.character.id.update({ ...target, hp: nextHp });
  return finalDamage;
}

function executeEnemyAbility(
  ctx: any,
  combatId: bigint,
  enemyId: bigint,
  abilityKey: string,
  targetCharacterId?: bigint
) {
  const combat = ctx.db.combatEncounter.id.find(combatId);
  if (!combat || combat.state !== 'active') return;
  const ability = ENEMY_ABILITIES[abilityKey as keyof typeof ENEMY_ABILITIES];
  if (!ability) return;
  const enemy = ctx.db.combatEnemy.id.find(enemyId);
  if (!enemy) return;
  const enemyTemplate = ctx.db.enemyTemplate.id.find(enemy.enemyTemplateId);
  const enemyName = enemy.displayName ?? enemyTemplate?.name ?? 'Enemy';
  const targetId = targetCharacterId ?? getTopAggroId(ctx, combatId, enemy.id);
  if (!targetId) return;
  const target = ctx.db.character.id.find(targetId);
  if (!target) return;

  // Calculate power for this enemy ability
  const enemyLevel = enemyTemplate?.level ?? 1n;
  const abilityPower = (ability as any).power ?? 3n;
  const enemyPower = ENEMY_BASE_POWER + (enemyLevel * ENEMY_LEVEL_POWER_SCALING);
  const totalPower = enemyPower + abilityPower * 5n; // Scale ability power like player system

  if (ability.kind === 'dot') {
    const damageType = (ability as any).damageType ?? 'physical';
    const dotPowerSplit = (ability as any).dotPowerSplit ?? 0.5;

    // Direct damage portion
    const directFraction = 1.0 - dotPowerSplit;
    const directDamage = (totalPower * BigInt(Math.floor(directFraction * 100))) / 100n;

    // DoT portion
    const dotFraction = dotPowerSplit;
    const dotTotalDamage = (totalPower * BigInt(Math.floor(dotFraction * 100))) / 100n;
    const dotPerTick = ability.rounds > 0n ? dotTotalDamage / ability.rounds : dotTotalDamage;

    // Apply direct damage with armor/magic resist routing
    let actualDamage = 0n;
    if (directDamage > 0n) {
      actualDamage = applyEnemyAbilityDamage(ctx, target, directDamage, damageType, enemyName, ability.name);
    }

    // Apply DoT via existing CharacterEffect system (tick_hot reducer handles it)
    if (dotPerTick > 0n) {
      addCharacterEffect(ctx, target.id, 'dot', dotPerTick, ability.rounds, ability.name);
    }

    // Log messages
    const dmgMsg = actualDamage > 0n ? ` for ${actualDamage}` : '';
    const privateMessage = `${enemyName} uses ${ability.name} on you${dmgMsg}.`;
    const groupMessage = `${enemyName} uses ${ability.name} on ${target.name}${dmgMsg}.`;
    appendPrivateEvent(ctx, target.id, target.ownerUserId, 'damage', privateMessage);
    if (target.groupId) {
      appendGroupEvent(ctx, target.groupId, target.id, 'damage', groupMessage);
    }
  } else if (ability.kind === 'debuff') {
    const damageType = (ability as any).damageType ?? 'physical';
    const debuffPowerCost = (ability as any).debuffPowerCost ?? 0.25;

    // Direct damage reduced by debuff cost
    const damageFraction = 1.0 - debuffPowerCost;
    const directDamage = (totalPower * BigInt(Math.floor(damageFraction * 100))) / 100n;

    // Apply direct damage with damage type routing
    let actualDamage = 0n;
    if (directDamage > 0n) {
      actualDamage = applyEnemyAbilityDamage(ctx, target, directDamage, damageType, enemyName, ability.name);
    }

    // Apply debuff effect (fixed magnitude from metadata, not scaled)
    const effectType = (ability as any).effectType ?? 'ac_bonus';
    addCharacterEffect(ctx, target.id, effectType, ability.magnitude, ability.rounds, ability.name);

    // Log messages
    const dmgMsg = actualDamage > 0n ? ` for ${actualDamage} and` : '';
    const privateMessage = `${enemyName} uses ${ability.name}${dmgMsg} afflicts you.`;
    const groupMessage = `${enemyName} uses ${ability.name}${dmgMsg} afflicts ${target.name}.`;
    appendPrivateEvent(ctx, target.id, target.ownerUserId, 'ability', privateMessage);
    if (target.groupId) {
      appendGroupEvent(ctx, target.groupId, target.id, 'ability', groupMessage);
    }
  } else if (ability.kind === 'heal') {
    const allies = [...ctx.db.combatEnemy.by_combat.filter(combatId)]
      .filter((e: any) => e.currentHp > 0n);
    if (allies.length === 0) return;

    // Find lowest HP ally
    let healTarget = allies[0];
    for (const ally of allies) {
      if (ally.currentHp < healTarget.currentHp) healTarget = ally;
    }

    const healPowerSplit = (ability as any).healPowerSplit ?? 1.0;
    const directHeal = (totalPower * BigInt(Math.floor(healPowerSplit * 100))) / 100n;

    // Cap at maxHp
    const healTargetTemplate = ctx.db.enemyTemplate.id.find(healTarget.enemyTemplateId);
    const maxHp = healTargetTemplate?.maxHp ?? 100n;
    const nextHp = healTarget.currentHp + directHeal > maxHp ? maxHp : healTarget.currentHp + directHeal;
    ctx.db.combatEnemy.id.update({ ...healTarget, currentHp: nextHp });

    // Apply HoT if split specified
    const hotDuration = (ability as any).hotDuration;
    if (hotDuration && healPowerSplit < 1.0) {
      const hotFraction = 1.0 - healPowerSplit;
      const hotTotal = (totalPower * BigInt(Math.floor(hotFraction * 100))) / 100n;
      const hotPerTick = hotDuration > 0n ? hotTotal / hotDuration : hotTotal;
      if (hotPerTick > 0n) {
        addEnemyEffect(ctx, combatId, healTarget.id, 'regen', hotPerTick, hotDuration, ability.name);
      }
    }

    // Log heal event to all active participants
    const healTargetName = healTarget.displayName ?? healTargetTemplate?.name ?? 'an ally';
    for (const participant of ctx.db.combatParticipant.by_combat.filter(combatId)) {
      if (participant.status !== 'active') continue;
      const pc = ctx.db.character.id.find(participant.characterId);
      if (!pc) continue;
      appendPrivateEvent(ctx, pc.id, pc.ownerUserId, 'combat',
        `${enemyName} heals ${healTargetName} for ${directHeal}.`);
    }
    const firstActive = [...ctx.db.combatParticipant.by_combat.filter(combatId)]
      .find((p: any) => p.status === 'active');
    if (firstActive) {
      const pc = ctx.db.character.id.find(firstActive.characterId);
      if (pc?.groupId) {
        appendGroupEvent(ctx, pc.groupId, pc.id, 'combat',
          `${enemyName} heals ${healTargetName} for ${directHeal}.`);
      }
    }
  } else if (ability.kind === 'aoe_damage') {
    const damageType = (ability as any).damageType ?? 'magic';
    const perTargetDamage = (totalPower * AOE_DAMAGE_MULTIPLIER) / 100n;

    // Hit all active participants
    for (const participant of ctx.db.combatParticipant.by_combat.filter(combatId)) {
      if (participant.status !== 'active') continue;
      const pc = ctx.db.character.id.find(participant.characterId);
      if (!pc || pc.hp === 0n) continue;

      const actualDamage = applyEnemyAbilityDamage(ctx, pc, perTargetDamage, damageType, enemyName, ability.name);

      appendPrivateEvent(ctx, pc.id, pc.ownerUserId, 'damage',
        `${enemyName} hits you with ${ability.name} for ${actualDamage}.`);
      if (pc.groupId) {
        appendGroupEvent(ctx, pc.groupId, pc.id, 'damage',
          `${enemyName} hits ${pc.name} with ${ability.name} for ${actualDamage}.`);
      }
    }
  } else if (ability.kind === 'buff') {
    const effectType = (ability as any).effectType ?? 'damage_bonus';
    const magnitude = ability.magnitude ?? 3n;
    const rounds = ability.rounds ?? 3n;

    // Buff all living enemy allies
    for (const ally of ctx.db.combatEnemy.by_combat.filter(combatId)) {
      if (ally.currentHp <= 0n) continue;
      addEnemyEffect(ctx, combatId, ally.id, effectType, magnitude, rounds, ability.name);
    }

    // Log buff event
    for (const participant of ctx.db.combatParticipant.by_combat.filter(combatId)) {
      if (participant.status !== 'active') continue;
      const pc = ctx.db.character.id.find(participant.characterId);
      if (!pc) continue;
      appendPrivateEvent(ctx, pc.id, pc.ownerUserId, 'combat',
        `${enemyName} rallies allies with ${ability.name}!`);
    }
    const firstActive = [...ctx.db.combatParticipant.by_combat.filter(combatId)]
      .find((p: any) => p.status === 'active');
    if (firstActive) {
      const pc = ctx.db.character.id.find(firstActive.characterId);
      if (pc?.groupId) {
        appendGroupEvent(ctx, pc.groupId, pc.id, 'combat',
          `${enemyName} rallies allies with ${ability.name}!`);
      }
    }
  }
}

function executePetAbility(
  ctx: any,
  combatId: bigint,
  petId: bigint,
  abilityKey: string,
  targetEnemyId?: bigint
) {
  const combat = ctx.db.combatEncounter.id.find(combatId);
  if (!combat || combat.state !== 'active') return false;
  const pet = ctx.db.combatPet.id.find(petId);
  if (!pet) return false;
  const owner = ctx.db.character.id.find(pet.ownerCharacterId);
  if (!owner || owner.hp === 0n) return false;
  const target =
    (targetEnemyId ? ctx.db.combatEnemy.id.find(targetEnemyId) : null) ??
    (pet.targetEnemyId ? ctx.db.combatEnemy.id.find(pet.targetEnemyId) : null);
  if (!target || target.currentHp === 0n) return false;

  const actorGroupId = effectiveGroupId(owner);
  if (abilityKey === 'pet_taunt') {
    let maxAggro = 0n;
    let petEntry: typeof AggroEntry.rowType | null = null;
    for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
      if (entry.enemyId !== target.id) continue;
      if (entry.value > maxAggro) maxAggro = entry.value;
      if (entry.petId && entry.petId === pet.id) petEntry = entry;
    }
    const newValue = maxAggro + 5n;
    if (petEntry) {
      ctx.db.aggroEntry.id.update({ ...petEntry, value: newValue });
    } else {
      ctx.db.aggroEntry.insert({
        id: 0n,
        combatId,
        enemyId: target.id,
        characterId: owner.id,
        petId: pet.id,
        value: newValue,
      });
    }
    const message = `${pet.name} taunts ${target.displayName ?? 'the enemy'}.`;
    appendPrivateEvent(ctx, owner.id, owner.ownerUserId, 'ability', message);
    if (actorGroupId) {
      appendGroupEvent(ctx, actorGroupId, owner.id, 'ability', message);
    }
    ctx.db.combatEnemy.id.update({
      ...target,
      aggroTargetPetId: pet.id,
      aggroTargetCharacterId: owner.id,
    });
    return true;
  }

  if (abilityKey === 'pet_bleed') {
    addEnemyEffect(ctx, combatId, target.id, 'dot', 2n, 3n, 'Pet Bleed');
    const message = `${pet.name} rends ${target.displayName ?? 'the enemy'}.`;
    appendPrivateEvent(ctx, owner.id, owner.ownerUserId, 'ability', message);
    if (actorGroupId) {
      appendGroupEvent(ctx, actorGroupId, owner.id, 'ability', message);
    }
    return true;
  }

  return false;
}

function executeAbilityAction(
  ctx: any,
  args:
    | {
      actorType: 'character';
      actorId: bigint;
      abilityKey: string;
      targetCharacterId?: bigint;
    }
    | {
      actorType: 'enemy';
      actorId: bigint;
      combatId: bigint;
      abilityKey: string;
      targetCharacterId?: bigint;
    }
    | {
      actorType: 'pet';
      actorId: bigint;
      combatId: bigint;
      abilityKey: string;
      targetEnemyId?: bigint;
    }
) {
  if (args.actorType === 'character') {
    const character = ctx.db.character.id.find(args.actorId);
    if (!character) return false;
    executeAbility(ctx, character, args.abilityKey, args.targetCharacterId);
    return true;
  }
  if (args.actorType === 'enemy') {
    executeEnemyAbility(
      ctx,
      args.combatId,
      args.actorId,
      args.abilityKey,
      args.targetCharacterId
    );
    return true;
  }
  return executePetAbility(
    ctx,
    args.combatId,
    args.actorId,
    args.abilityKey,
    args.targetEnemyId
  );
}

const COMBAT_LOOP_INTERVAL_MICROS = 1_000_000n;
const AUTO_ATTACK_INTERVAL = 5_000_000n;
const DAY_DURATION_MICROS = 1_200_000_000n;
const NIGHT_DURATION_MICROS = 600_000_000n;
const DEFAULT_LOCATION_SPAWNS = 3;
const RESOURCE_NODES_PER_LOCATION = 3;
const RESOURCE_GATHER_CAST_MICROS = 8_000_000n;
const RESOURCE_RESPAWN_MICROS = 10n * 60n * 1_000_000n;
const GROUP_SIZE_DANGER_BASE = 100n;
const GROUP_SIZE_BIAS_RANGE = 200n;
const GROUP_SIZE_BIAS_MAX = 0.8;
function awardCombatXp(
  ctx: any,
  character: typeof Character.rowType,
  enemyLevel: bigint,
  baseXp: bigint
) {
  if (character.level >= MAX_LEVEL) return { xpGained: 0n, leveledUp: false };
  const diff = Number(enemyLevel - character.level);
  const mod = xpModifierForDiff(diff);
  if (mod === 0n) return { xpGained: 0n, leveledUp: false };

  const gained = (baseXp * mod) / 100n;
  if (gained <= 0n) return { xpGained: 0n, leveledUp: false };

  const newXp = character.xp + gained;
  let newLevel = character.level;
  while (newLevel < MAX_LEVEL && newXp >= xpRequiredForLevel(newLevel + 1n)) {
    newLevel += 1n;
  }

  if (newLevel === character.level) {
    ctx.db.character.id.update({ ...character, xp: newXp });
    return { xpGained: gained, leveledUp: false };
  }

  const newBase = computeBaseStats(character.className, newLevel);
  const updated = {
    ...character,
    level: newLevel,
    xp: newXp,
    str: newBase.str,
    dex: newBase.dex,
    cha: newBase.cha,
    wis: newBase.wis,
    int: newBase.int,
  };
  ctx.db.character.id.update(updated);
  recomputeCharacterDerived(ctx, updated);
  return { xpGained: gained, leveledUp: true, newLevel };
}

function applyDeathXpPenalty(ctx: any, character: typeof Character.rowType) {
  if (character.level <= 5n) return 0n;
  const currentLevelFloor = xpRequiredForLevel(character.level);
  if (character.xp <= currentLevelFloor) return 0n;
  const progress = character.xp - currentLevelFloor;
  const loss = (progress * 5n) / 100n;
  if (loss <= 0n) return 0n;
  const nextXp = character.xp - loss;
  const clamped = nextXp < currentLevelFloor ? currentLevelFloor : nextXp;
  ctx.db.character.id.update({ ...character, xp: clamped });
  return loss;
}

function isClassAllowed(allowedClasses: string, className: string) {
  if (!allowedClasses || allowedClasses.trim().length === 0) return true;
  const normalized = normalizeClassName(className);
  const allowed = allowedClasses
    .split(',')
    .map((entry) => normalizeClassName(entry))
    .filter((entry) => entry.length > 0);
  if (allowed.includes('any')) return true;
  return allowed.includes(normalized);
}

function findItemTemplateByName(ctx: any, name: string) {
  for (const row of ctx.db.itemTemplate.iter()) {
    if (row.name.toLowerCase() === name.toLowerCase()) return row;
  }
  return null;
}

function getItemCount(ctx: any, characterId: bigint, templateId: bigint): bigint {
  let count = 0n;
  for (const instance of ctx.db.itemInstance.by_owner.filter(characterId)) {
    if (instance.templateId !== templateId || instance.equippedSlot) continue;
    count += instance.quantity ?? 1n;
  }
  return count;
}

function addItemToInventory(
  ctx: any,
  characterId: bigint,
  templateId: bigint,
  quantity: bigint
): void {
  const template = ctx.db.itemTemplate.id.find(templateId);
  if (!template) throw new SenderError('Item template missing');
  const stackable = template.stackable ?? false;
  if (stackable) {
    const existing = [...ctx.db.itemInstance.by_owner.filter(characterId)].find(
      (row) => row.templateId === templateId && !row.equippedSlot
    );
    if (existing) {
      ctx.db.itemInstance.id.update({
        ...existing,
        quantity: (existing.quantity ?? 1n) + quantity,
      });
      return;
    }
  }
  ctx.db.itemInstance.insert({
    id: 0n,
    templateId,
    ownerCharacterId: characterId,
    equippedSlot: undefined,
    quantity,
  });
}

const MAX_INVENTORY_SLOTS = 20;

function getInventorySlotCount(ctx: any, characterId: bigint) {
  return [...ctx.db.itemInstance.by_owner.filter(characterId)].filter((row) => !row.equippedSlot)
    .length;
}

function hasInventorySpace(ctx: any, characterId: bigint, templateId: bigint) {
  const template = ctx.db.itemTemplate.id.find(templateId);
  if (!template) return false;
  if (template.stackable) {
    const existing = [...ctx.db.itemInstance.by_owner.filter(characterId)].find(
      (row) => row.templateId === templateId && !row.equippedSlot
    );
    if (existing) return true;
  }
  return getInventorySlotCount(ctx, characterId) < MAX_INVENTORY_SLOTS;
}

function removeItemFromInventory(
  ctx: any,
  characterId: bigint,
  templateId: bigint,
  quantity: bigint
): void {
  let remaining = quantity;
  for (const instance of ctx.db.itemInstance.by_owner.filter(characterId)) {
    if (instance.templateId !== templateId || instance.equippedSlot) continue;
    const current = instance.quantity ?? 1n;
    if (current > remaining) {
      ctx.db.itemInstance.id.update({ ...instance, quantity: current - remaining });
      return;
    }
    remaining -= current;
    ctx.db.itemInstance.id.delete(instance.id);
    if (remaining === 0n) return;
  }
  if (remaining > 0n) throw new SenderError('Not enough materials');
}

function getGatherableResourceTemplates(ctx: any, terrainType: string, timePref?: string) {
  const pools: Record<
    string,
    { name: string; weight: bigint; timeOfDay: string }[]
  > = {
    mountains: [
      { name: 'Copper Ore', weight: 3n, timeOfDay: 'any' },
      { name: 'Stone', weight: 5n, timeOfDay: 'any' },
      { name: 'Sand', weight: 3n, timeOfDay: 'day' },
      { name: 'Clear Water', weight: 2n, timeOfDay: 'any' },
    ],
    woods: [
      { name: 'Wood', weight: 5n, timeOfDay: 'any' },
      { name: 'Resin', weight: 3n, timeOfDay: 'night' },
      { name: 'Dry Grass', weight: 3n, timeOfDay: 'day' },
      { name: 'Bitter Herbs', weight: 2n, timeOfDay: 'night' },
      { name: 'Clear Water', weight: 2n, timeOfDay: 'any' },
      { name: 'Wild Berries', weight: 3n, timeOfDay: 'any' },
    ],
    plains: [
      { name: 'Flax', weight: 4n, timeOfDay: 'day' },
      { name: 'Herbs', weight: 3n, timeOfDay: 'any' },
      { name: 'Clear Water', weight: 2n, timeOfDay: 'day' },
      { name: 'Salt', weight: 2n, timeOfDay: 'any' },
      { name: 'Wild Berries', weight: 2n, timeOfDay: 'day' },
      { name: 'Root Vegetable', weight: 3n, timeOfDay: 'any' },
    ],
    swamp: [
      { name: 'Peat', weight: 4n, timeOfDay: 'any' },
      { name: 'Mushrooms', weight: 3n, timeOfDay: 'night' },
      { name: 'Murky Water', weight: 3n, timeOfDay: 'any' },
      { name: 'Bitter Herbs', weight: 2n, timeOfDay: 'night' },
    ],
    dungeon: [
      { name: 'Iron Shard', weight: 3n, timeOfDay: 'any' },
      { name: 'Ancient Dust', weight: 3n, timeOfDay: 'any' },
      { name: 'Stone', weight: 2n, timeOfDay: 'any' },
    ],
    town: [
      { name: 'Scrap Cloth', weight: 3n, timeOfDay: 'any' },
      { name: 'Lamp Oil', weight: 2n, timeOfDay: 'any' },
      { name: 'Clear Water', weight: 2n, timeOfDay: 'any' },
    ],
    city: [
      { name: 'Scrap Cloth', weight: 3n, timeOfDay: 'any' },
      { name: 'Lamp Oil', weight: 2n, timeOfDay: 'any' },
      { name: 'Clear Water', weight: 2n, timeOfDay: 'any' },
    ],
  };
  const key = (terrainType ?? '').trim().toLowerCase();
  const entries = pools[key] ?? pools.plains;
  const pref = (timePref ?? '').trim().toLowerCase();
  const filtered =
    pref && pref !== 'any'
      ? entries.filter(
        (entry) => entry.timeOfDay === 'any' || entry.timeOfDay === pref
      )
      : entries;
  const pool = filtered.length > 0 ? filtered : entries;
  const resolved = pool
    .map((entry) => {
      const template = findItemTemplateByName(ctx, entry.name);
      return template
        ? { template, weight: entry.weight, timeOfDay: entry.timeOfDay }
        : null;
    })
    .filter(Boolean) as { template: typeof ItemTemplate.rowType; weight: bigint }[];
  return resolved;
}

function ensureStarterItemTemplates(ctx: any) {
  const upsertItemTemplateByName = (row: any) => {
    const fullRow = {
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
      weaponType: '',
      magicResistanceBonus: 0n,
      ...row,
    };
    const existing = findItemTemplateByName(ctx, fullRow.name);
    if (existing) {
      ctx.db.itemTemplate.id.update({
        ...existing,
        ...fullRow,
        id: existing.id,
      });
      return existing;
    }
    return ctx.db.itemTemplate.insert({
      id: 0n,
      ...fullRow,
    });
  };

  const ARMOR_ALLOWED_CLASSES: Record<string, string> = {
    plate: 'warrior,paladin,bard,cleric',
    chain: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver',
    leather: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid',
    cloth: 'any',
  };

  for (const [armorType, pieces] of Object.entries(STARTER_ARMOR)) {
    upsertItemTemplateByName({
      name: pieces.chest.name,
      slot: 'chest',
      armorType,
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 2n,
      requiredLevel: 1n,
      allowedClasses: ARMOR_ALLOWED_CLASSES[armorType] ?? 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: pieces.chest.ac,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      stackable: false,
    });
    upsertItemTemplateByName({
      name: pieces.legs.name,
      slot: 'legs',
      armorType,
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 2n,
      requiredLevel: 1n,
      allowedClasses: ARMOR_ALLOWED_CLASSES[armorType] ?? 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: pieces.legs.ac,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      stackable: false,
    });
    upsertItemTemplateByName({
      name: pieces.boots.name,
      slot: 'boots',
      armorType,
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 2n,
      requiredLevel: 1n,
      allowedClasses: ARMOR_ALLOWED_CLASSES[armorType] ?? 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: pieces.boots.ac,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      stackable: false,
    });
  }

  const weaponTemplates: Record<string, { name: string; allowed: string; weaponType: string }> = {
    'Training Sword': { name: 'Training Sword', allowed: 'warrior', weaponType: 'sword' },
    'Training Mace': { name: 'Training Mace', allowed: 'paladin,cleric', weaponType: 'mace' },
    'Training Staff': {
      name: 'Training Staff',
      allowed: 'enchanter,necromancer,summoner,druid,shaman,monk,wizard',
      weaponType: 'staff',
    },
    'Training Bow': { name: 'Training Bow', allowed: 'ranger', weaponType: 'bow' },
    'Training Dagger': { name: 'Training Dagger', allowed: 'rogue', weaponType: 'dagger' },
    'Training Axe': { name: 'Training Axe', allowed: 'beastmaster', weaponType: 'axe' },
    'Training Blade': { name: 'Training Blade', allowed: 'spellblade,reaver', weaponType: 'blade' },
    'Training Rapier': { name: 'Training Rapier', allowed: 'bard', weaponType: 'rapier' },
  };

  for (const weapon of Object.values(weaponTemplates)) {
    upsertItemTemplateByName({
      name: weapon.name,
      slot: 'mainHand',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 3n,
      requiredLevel: 1n,
      allowedClasses: weapon.allowed,
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 4n,
      weaponDps: 6n,
      weaponType: weapon.weaponType,
      stackable: false,
    });
  }

  const accessoryTemplates = [
    { name: 'Rough Band', slot: 'earrings', rarity: 'common', stat: { dexBonus: 1n } },
    { name: 'Worn Cloak', slot: 'cloak', rarity: 'common', stat: { hpBonus: 3n } },
    { name: 'Traveler Necklace', slot: 'neck', rarity: 'common', stat: { wisBonus: 1n } },
    { name: 'Glimmer Ring', slot: 'earrings', rarity: 'uncommon', stat: { intBonus: 1n } },
    { name: 'Shaded Cloak', slot: 'cloak', rarity: 'uncommon', stat: { dexBonus: 1n } },
  ];

  for (const template of accessoryTemplates) {
    upsertItemTemplateByName({
      name: template.name,
      slot: template.slot,
      armorType: 'none',
      rarity: template.rarity,
      tier: 1n,
      isJunk: false,
      vendorValue: template.rarity === 'uncommon' ? 8n : 5n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: template.stat.strBonus ?? 0n,
      dexBonus: template.stat.dexBonus ?? 0n,
      chaBonus: template.stat.chaBonus ?? 0n,
      wisBonus: template.stat.wisBonus ?? 0n,
      intBonus: template.stat.intBonus ?? 0n,
      hpBonus: template.stat.hpBonus ?? 0n,
      manaBonus: template.stat.manaBonus ?? 0n,
      armorClassBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      stackable: false,
    });
  }

  const junkTemplates = [
    { name: 'Rat Tail', vendorValue: 1n },
    { name: 'Torn Pelt', vendorValue: 2n },
    { name: 'Cracked Fang', vendorValue: 1n },
    { name: 'Ashen Bone', vendorValue: 2n },
  ];

  for (const junk of junkTemplates) {
    upsertItemTemplateByName({
      name: junk.name,
      slot: 'junk',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: true,
      vendorValue: junk.vendorValue,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      stackable: true,
    });
  }
}

function ensureResourceItemTemplates(ctx: any) {
  const resources = [
    { name: 'Flax', slot: 'resource', vendorValue: 1n },
    { name: 'Herbs', slot: 'resource', vendorValue: 1n },
    { name: 'Wood', slot: 'resource', vendorValue: 1n },
    { name: 'Resin', slot: 'resource', vendorValue: 1n },
    { name: 'Copper Ore', slot: 'resource', vendorValue: 2n },
    { name: 'Stone', slot: 'resource', vendorValue: 1n },
    { name: 'Raw Meat', slot: 'resource', vendorValue: 1n },
    { name: 'Salt', slot: 'resource', vendorValue: 1n },
    { name: 'Clear Water', slot: 'resource', vendorValue: 1n },
    { name: 'Sand', slot: 'resource', vendorValue: 1n },
    { name: 'Dry Grass', slot: 'resource', vendorValue: 1n },
    { name: 'Bitter Herbs', slot: 'resource', vendorValue: 1n },
    { name: 'Peat', slot: 'resource', vendorValue: 1n },
    { name: 'Mushrooms', slot: 'resource', vendorValue: 1n },
    { name: 'Murky Water', slot: 'resource', vendorValue: 1n },
    { name: 'Iron Shard', slot: 'resource', vendorValue: 2n },
    { name: 'Ancient Dust', slot: 'resource', vendorValue: 2n },
    { name: 'Scrap Cloth', slot: 'resource', vendorValue: 1n },
    { name: 'Lamp Oil', slot: 'resource', vendorValue: 1n },
    { name: 'Wild Berries', slot: 'resource', vendorValue: 1n },
    { name: 'Root Vegetable', slot: 'resource', vendorValue: 1n },
  ];
  for (const resource of resources) {
    if (findItemTemplateByName(ctx, resource.name)) continue;
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: resource.name,
      slot: resource.slot,
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: resource.vendorValue,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      weaponType: '',
      stackable: true,
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
    });
  }
  if (!findItemTemplateByName(ctx, 'Bandage')) {
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: 'Bandage',
      slot: 'consumable',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 2n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      weaponType: '',
      stackable: true,
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
    });
  }
  const craftItems = [
    { name: 'Simple Rations', slot: 'consumable', vendorValue: 2n },
    { name: 'Torch', slot: 'utility', vendorValue: 2n },
    { name: 'Basic Poultice', slot: 'consumable', vendorValue: 2n },
    { name: 'Travelers Tea', slot: 'consumable', vendorValue: 2n },
    { name: 'Whetstone', slot: 'utility', vendorValue: 2n },
    { name: 'Kindling Bundle', slot: 'utility', vendorValue: 1n },
    { name: 'Rough Rope', slot: 'utility', vendorValue: 2n },
    { name: 'Charcoal', slot: 'resource', vendorValue: 1n },
    { name: 'Crude Poison', slot: 'consumable', vendorValue: 3n },
  ];
  for (const item of craftItems) {
    if (findItemTemplateByName(ctx, item.name)) continue;
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: item.name,
      slot: item.slot,
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: item.vendorValue,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      weaponType: '',
      stackable: true,
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
    });
  }
}

function ensureFoodItemTemplates(ctx: any) {
  const foodItems = [
    {
      name: 'Herb Broth',
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'mana_regen',
      wellFedBuffMagnitude: 4n,
    },
    {
      name: 'Roasted Roots',
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'str',
      wellFedBuffMagnitude: 2n,
    },
    {
      name: "Traveler's Stew",
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'stamina_regen',
      wellFedBuffMagnitude: 4n,
    },
    {
      name: "Forager's Salad",
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'dex',
      wellFedBuffMagnitude: 2n,
    },
  ];

  for (const food of foodItems) {
    const existing = findItemTemplateByName(ctx, food.name);
    if (existing) {
      ctx.db.itemTemplate.id.update({
        ...existing,
        wellFedDurationMicros: food.wellFedDurationMicros,
        wellFedBuffType: food.wellFedBuffType,
        wellFedBuffMagnitude: food.wellFedBuffMagnitude,
      });
      continue;
    }
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: food.name,
      slot: 'food',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 3n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      weaponType: '',
      stackable: true,
      wellFedDurationMicros: food.wellFedDurationMicros,
      wellFedBuffType: food.wellFedBuffType,
      wellFedBuffMagnitude: food.wellFedBuffMagnitude,
    });
  }
}

function ensureRecipeTemplates(ctx: any) {
  const flax = findItemTemplateByName(ctx, 'Flax');
  const herbs = findItemTemplateByName(ctx, 'Herbs');
  const bandage = findItemTemplateByName(ctx, 'Bandage');
  const rawMeat = findItemTemplateByName(ctx, 'Raw Meat');
  const salt = findItemTemplateByName(ctx, 'Salt');
  const simpleRations = findItemTemplateByName(ctx, 'Simple Rations');
  const wood = findItemTemplateByName(ctx, 'Wood');
  const resin = findItemTemplateByName(ctx, 'Resin');
  const torch = findItemTemplateByName(ctx, 'Torch');
  const clearWater = findItemTemplateByName(ctx, 'Clear Water');
  const basicPoultice = findItemTemplateByName(ctx, 'Basic Poultice');
  const travelersTea = findItemTemplateByName(ctx, 'Travelers Tea');
  const stone = findItemTemplateByName(ctx, 'Stone');
  const sand = findItemTemplateByName(ctx, 'Sand');
  const whetstone = findItemTemplateByName(ctx, 'Whetstone');
  const dryGrass = findItemTemplateByName(ctx, 'Dry Grass');
  const kindling = findItemTemplateByName(ctx, 'Kindling Bundle');
  const roughRope = findItemTemplateByName(ctx, 'Rough Rope');
  const charcoal = findItemTemplateByName(ctx, 'Charcoal');
  const bitterHerbs = findItemTemplateByName(ctx, 'Bitter Herbs');
  const crudePoison = findItemTemplateByName(ctx, 'Crude Poison');

  const addRecipe = (args: {
    key: string;
    name: string;
    output: typeof ItemTemplate.rowType | null;
    outputCount: bigint;
    req1: typeof ItemTemplate.rowType | null;
    req1Count: bigint;
    req2: typeof ItemTemplate.rowType | null;
    req2Count: bigint;
    req3?: typeof ItemTemplate.rowType | null;
    req3Count?: bigint;
  }) => {
    if (!args.output || !args.req1 || !args.req2) return;
    const existing = [...ctx.db.recipeTemplate.iter()].find((row) => row.key === args.key);
    if (existing) {
      ctx.db.recipeTemplate.id.update({
        ...existing,
        key: args.key,
        name: args.name,
        outputTemplateId: args.output.id,
        outputCount: args.outputCount,
        req1TemplateId: args.req1.id,
        req1Count: args.req1Count,
        req2TemplateId: args.req2.id,
        req2Count: args.req2Count,
        req3TemplateId: args.req3?.id,
        req3Count: args.req3Count,
      });
      return;
    }
    ctx.db.recipeTemplate.insert({
      id: 0n,
      key: args.key,
      name: args.name,
      outputTemplateId: args.output.id,
      outputCount: args.outputCount,
      req1TemplateId: args.req1.id,
      req1Count: args.req1Count,
      req2TemplateId: args.req2.id,
      req2Count: args.req2Count,
      req3TemplateId: args.req3?.id,
      req3Count: args.req3Count,
    });
  };

  addRecipe({
    key: 'bandage',
    name: 'Bandages',
    output: bandage,
    outputCount: 1n,
    req1: flax,
    req1Count: 1n,
    req2: herbs,
    req2Count: 1n,
  });
  addRecipe({
    key: 'simple_rations',
    name: 'Simple Rations',
    output: simpleRations,
    outputCount: 1n,
    req1: rawMeat,
    req1Count: 1n,
    req2: salt,
    req2Count: 1n,
  });
  addRecipe({
    key: 'torch',
    name: 'Torch',
    output: torch,
    outputCount: 1n,
    req1: wood,
    req1Count: 1n,
    req2: resin,
    req2Count: 1n,
  });
  addRecipe({
    key: 'basic_poultice',
    name: 'Basic Poultice',
    output: basicPoultice,
    outputCount: 1n,
    req1: herbs,
    req1Count: 1n,
    req2: flax,
    req2Count: 1n,
    req3: clearWater,
    req3Count: 1n,
  });
  addRecipe({
    key: 'travelers_tea',
    name: 'Travelers Tea',
    output: travelersTea,
    outputCount: 1n,
    req1: herbs,
    req1Count: 1n,
    req2: clearWater,
    req2Count: 1n,
  });
  addRecipe({
    key: 'whetstone',
    name: 'Whetstone',
    output: whetstone,
    outputCount: 1n,
    req1: stone,
    req1Count: 1n,
    req2: sand,
    req2Count: 1n,
  });
  addRecipe({
    key: 'kindling_bundle',
    name: 'Kindling Bundle',
    output: kindling,
    outputCount: 1n,
    req1: wood,
    req1Count: 1n,
    req2: dryGrass,
    req2Count: 1n,
  });
  addRecipe({
    key: 'rough_rope',
    name: 'Rough Rope',
    output: roughRope,
    outputCount: 1n,
    req1: flax,
    req1Count: 1n,
    req2: resin,
    req2Count: 1n,
  });
  addRecipe({
    key: 'charcoal',
    name: 'Charcoal',
    output: charcoal,
    outputCount: 1n,
    req1: wood,
    req1Count: 1n,
    req2: stone,
    req2Count: 1n,
  });
  addRecipe({
    key: 'crude_poison',
    name: 'Crude Poison',
    output: crudePoison,
    outputCount: 1n,
    req1: bitterHerbs,
    req1Count: 1n,
    req2: resin,
    req2Count: 1n,
  });

  const wildBerries = findItemTemplateByName(ctx, 'Wild Berries');
  const rootVegetable = findItemTemplateByName(ctx, 'Root Vegetable');
  const herbBroth = findItemTemplateByName(ctx, 'Herb Broth');
  const roastedRoots = findItemTemplateByName(ctx, 'Roasted Roots');
  const travelerStew = findItemTemplateByName(ctx, "Traveler's Stew");
  const foragerSalad = findItemTemplateByName(ctx, "Forager's Salad");

  addRecipe({
    key: 'herb_broth',
    name: 'Herb Broth',
    output: herbBroth,
    outputCount: 1n,
    req1: wildBerries,
    req1Count: 2n,
    req2: clearWater,
    req2Count: 1n,
  });
  addRecipe({
    key: 'roasted_roots',
    name: 'Roasted Roots',
    output: roastedRoots,
    outputCount: 1n,
    req1: rootVegetable,
    req1Count: 2n,
    req2: salt,
    req2Count: 1n,
  });
  addRecipe({
    key: 'travelers_stew',
    name: "Traveler's Stew",
    output: travelerStew,
    outputCount: 1n,
    req1: rootVegetable,
    req1Count: 1n,
    req2: rawMeat,
    req2Count: 1n,
  });
  addRecipe({
    key: 'foragers_salad',
    name: "Forager's Salad",
    output: foragerSalad,
    outputCount: 1n,
    req1: wildBerries,
    req1Count: 1n,
    req2: herbs,
    req2Count: 1n,
  });
}

function ensureAbilityTemplates(ctx: any) {
  // Descriptions are now stored in the database (seeded from ABILITIES entries)
  const resolveDescription = (entry: { name: string; description?: string }) =>
    entry.description ?? entry.name;

  // Keep one canonical row per ability key so client-side lookups do not
  // pick stale duplicates with old cast/cooldown values.
  const seenByKey = new Map<string, any>();
  for (const row of ctx.db.abilityTemplate.iter()) {
    const existing = seenByKey.get(row.key);
    if (!existing) {
      seenByKey.set(row.key, row);
      continue;
    }
    const keep = existing.id <= row.id ? existing : row;
    const drop = keep === existing ? row : existing;
    ctx.db.abilityTemplate.id.delete(drop.id);
    seenByKey.set(row.key, keep);
  }

  const utilityKeys = new Set([
    'ranger_track',
    'druid_natures_mark',
    'cleric_sanctify',
    'wizard_arcane_reservoir',
    'paladin_lay_on_hands',
    'enchanter_veil_of_calm',
    'bard_ballad_of_resolve',
  ]);
  const combatOnlyKeys = new Set([
    'shaman_spirit_wolf',
    'necromancer_bone_servant',
    'beastmaster_call_beast',
    'summoner_earth_familiar',
  ]);
  const outOfCombatOnlyKeys = new Set([
    'druid_natures_mark',
  ]);
  const combatStateFor = (key: string) =>
    combatOnlyKeys.has(key) ? 'combat_only' :
      outOfCombatOnlyKeys.has(key) ? 'out_of_combat_only' :
        'any';
  for (const [key, ability] of Object.entries(ABILITIES)) {
    const entry = ability as {
      name: string;
      className: string;
      resource: string;
      level: bigint;
      castSeconds: bigint;
      cooldownSeconds: bigint;
      description?: string;
      power: bigint;
      damageType: string;
      dotPowerSplit?: number;
      dotDuration?: bigint;
      hotPowerSplit?: number;
      hotDuration?: bigint;
      debuffType?: string;
      debuffMagnitude?: bigint;
      debuffDuration?: bigint;
      aoeTargets?: string;
    };
    const existing = seenByKey.get(key);
    if (existing) {
      ctx.db.abilityTemplate.id.update({
        ...existing,
        key,
        name: entry.name,
        className: entry.className,
        level: entry.level,
        resource: entry.resource,
        castSeconds: entry.castSeconds,
        cooldownSeconds: entry.cooldownSeconds,
        kind: utilityKeys.has(key) ? 'utility' : 'combat',
        combatState: combatStateFor(key),
        description: resolveDescription(entry),
        power: entry.power ?? undefined,
        damageType: entry.damageType ?? undefined,
        statScaling: ABILITY_STAT_SCALING[key] ?? undefined,
        dotPowerSplit: entry.dotPowerSplit ?? undefined,
        dotDuration: entry.dotDuration ?? undefined,
        hotPowerSplit: entry.hotPowerSplit ?? undefined,
        hotDuration: entry.hotDuration ?? undefined,
        debuffType: entry.debuffType ?? undefined,
        debuffMagnitude: entry.debuffMagnitude ?? undefined,
        debuffDuration: entry.debuffDuration ?? undefined,
        aoeTargets: entry.aoeTargets ?? undefined,
      });
      seenByKey.set(key, {
        ...existing,
        key,
        name: entry.name,
        className: entry.className,
        level: entry.level,
        resource: entry.resource,
        castSeconds: entry.castSeconds,
        cooldownSeconds: entry.cooldownSeconds,
        kind: utilityKeys.has(key) ? 'utility' : 'combat',
        combatState: combatStateFor(key),
        description: resolveDescription(entry),
        power: entry.power ?? undefined,
        damageType: entry.damageType ?? undefined,
        statScaling: ABILITY_STAT_SCALING[key] ?? undefined,
        dotPowerSplit: entry.dotPowerSplit ?? undefined,
        dotDuration: entry.dotDuration ?? undefined,
        hotPowerSplit: entry.hotPowerSplit ?? undefined,
        hotDuration: entry.hotDuration ?? undefined,
        debuffType: entry.debuffType ?? undefined,
        debuffMagnitude: entry.debuffMagnitude ?? undefined,
        debuffDuration: entry.debuffDuration ?? undefined,
        aoeTargets: entry.aoeTargets ?? undefined,
      });
      continue;
    }
    const inserted = ctx.db.abilityTemplate.insert({
      id: 0n,
      key,
      name: entry.name,
      className: entry.className,
      level: entry.level,
      resource: entry.resource,
      castSeconds: entry.castSeconds,
      cooldownSeconds: entry.cooldownSeconds,
      kind: utilityKeys.has(key) ? 'utility' : 'combat',
      combatState: combatStateFor(key),
      description: resolveDescription(entry),
      power: entry.power ?? undefined,
      damageType: entry.damageType ?? undefined,
      statScaling: ABILITY_STAT_SCALING[key] ?? undefined,
      dotPowerSplit: entry.dotPowerSplit ?? undefined,
      dotDuration: entry.dotDuration ?? undefined,
      hotPowerSplit: entry.hotPowerSplit ?? undefined,
      hotDuration: entry.hotDuration ?? undefined,
      debuffType: entry.debuffType ?? undefined,
      debuffMagnitude: entry.debuffMagnitude ?? undefined,
      debuffDuration: entry.debuffDuration ?? undefined,
      aoeTargets: entry.aoeTargets ?? undefined,
    });
    seenByKey.set(key, inserted);
  }
}

function spawnResourceNode(ctx: any, locationId: bigint): typeof ResourceNode.rowType {
  const location = ctx.db.location.id.find(locationId);
  if (!location) throw new SenderError('Location not found');
  const timePref = isNightTime(ctx) ? 'night' : 'day';
  const pool = getGatherableResourceTemplates(ctx, location.terrainType ?? 'plains', timePref);
  if (pool.length === 0) throw new SenderError('No resource templates for location');
  const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0n);
  let roll = (ctx.timestamp.microsSinceUnixEpoch + locationId) % totalWeight;
  let chosen = pool[0];
  for (const entry of pool) {
    if (roll < entry.weight) {
      chosen = entry;
      break;
    }
    roll -= entry.weight;
  }
  const quantitySeed = ctx.timestamp.microsSinceUnixEpoch + chosen.template.id + locationId;
  const minQty = 2n;
  const maxQty = 6n;
  const qtyRange = maxQty - minQty + 1n;
  const quantity = minQty + (quantitySeed % qtyRange);
  return ctx.db.resourceNode.insert({
    id: 0n,
    locationId,
    itemTemplateId: chosen.template.id,
    name: chosen.template.name,
    timeOfDay: chosen.timeOfDay ?? 'any',
    quantity,
    state: 'available',
    lockedByCharacterId: undefined,
    respawnAtMicros: undefined,
  });
}

function ensureResourceNodesForLocation(ctx: any, locationId: bigint) {
  let count = 0;
  for (const _row of ctx.db.resourceNode.by_location.filter(locationId)) {
    count += 1;
  }
  while (count < RESOURCE_NODES_PER_LOCATION) {
    spawnResourceNode(ctx, locationId);
    count += 1;
  }
}

function respawnResourceNodesForLocation(ctx: any, locationId: bigint) {
  for (const row of ctx.db.resourceNode.by_location.filter(locationId)) {
    ctx.db.resourceNode.id.delete(row.id);
  }
  let count = 0;
  for (const _row of ctx.db.resourceNode.by_location.filter(locationId)) {
    count += 1;
  }
  while (count < RESOURCE_NODES_PER_LOCATION) {
    spawnResourceNode(ctx, locationId);
    count += 1;
  }
}

function grantStarterItems(ctx: any, character: typeof Character.rowType) {
  ensureStarterItemTemplates(ctx);
  const armorType = CLASS_ARMOR[normalizeClassName(character.className)]?.[0] ?? 'cloth';
  const armorSet = STARTER_ARMOR[armorType] ?? STARTER_ARMOR.cloth;
  const weapon = STARTER_WEAPONS[normalizeClassName(character.className)] ?? {
    name: 'Training Staff',
    slot: 'mainHand',
  };

  const armorNames = [armorSet.chest.name, armorSet.legs.name, armorSet.boots.name];
  for (const name of armorNames) {
    const template = findItemTemplateByName(ctx, name);
    if (!template) continue;
    addItemToInventory(ctx, character.id, template.id, 1n);
  }

  const weaponTemplate = findItemTemplateByName(ctx, weapon.name);
  if (weaponTemplate) {
    addItemToInventory(ctx, character.id, weaponTemplate.id, 1n);
  }
}

const ENEMY_ROLE_CONFIG: Record<
  string,
  { hpPerLevel: bigint; damagePerLevel: bigint; baseHp: bigint; baseDamage: bigint }
> = {
  tank: { hpPerLevel: 40n, damagePerLevel: 5n, baseHp: 40n, baseDamage: 4n },
  healer: { hpPerLevel: 30n, damagePerLevel: 4n, baseHp: 30n, baseDamage: 3n },
  dps: { hpPerLevel: 35n, damagePerLevel: 6n, baseHp: 28n, baseDamage: 4n },
  support: { hpPerLevel: 25n, damagePerLevel: 4n, baseHp: 24n, baseDamage: 3n },
};

function getEnemyRole(role: string) {
  const key = role.trim().toLowerCase();
  return ENEMY_ROLE_CONFIG[key] ?? ENEMY_ROLE_CONFIG.dps;
}

function scaleByPercent(value: bigint, percent: bigint) {
  return (value * percent) / 100n;
}

/**
 * Apply armor mitigation to physical damage
 * Tuned curve: 50 armor = ~33% reduction, 100 armor = ~50% reduction
 * Formula: damage * 100 / (100 + armorClass)
 * Then apply global damage multiplier
 */
function applyArmorMitigation(damage: bigint, armorClass: bigint) {
  const armorReduced = (damage * 100n) / (100n + armorClass);
  const globalReduced = (armorReduced * GLOBAL_DAMAGE_MULTIPLIER) / 100n;
  return globalReduced > 0n ? globalReduced : 1n;
}

function computeEnemyStats(
  template: typeof EnemyTemplate.rowType,
  roleTemplate: typeof EnemyRoleTemplate.rowType | null,
  participants: typeof Character.rowType[]
) {
  const roleKey = roleTemplate?.role ?? template.role;
  const role = getEnemyRole(roleKey);
  const effectiveLevel = template.level;
  const baseHp = role.baseHp + role.hpPerLevel * effectiveLevel;
  const baseDamage = role.baseDamage + role.damagePerLevel * effectiveLevel;
  const baseArmorClass = template.armorClass + effectiveLevel;

  return {
    maxHp: baseHp,
    attackDamage: baseDamage,
    armorClass: baseArmorClass,
    avgLevel: effectiveLevel,
  };
}

function ensureLootTables(ctx: any) {
  const junkTemplates = [...ctx.db.itemTemplate.iter()].filter((row) => row.isJunk);
  const gearTemplates = [...ctx.db.itemTemplate.iter()].filter(
    (row) => !row.isJunk && row.tier <= 1n && row.requiredLevel <= 9n
  );
  const findLootTable = (terrainType: string, creatureType: string, tier: bigint) =>
    [...ctx.db.lootTable.iter()].find(
      (row) =>
        row.terrainType === terrainType &&
        row.creatureType === creatureType &&
        row.tier === tier
    );
  const upsertLootEntry = (lootTableId: bigint, itemTemplateId: bigint, weight: bigint) => {
    const existing = [...ctx.db.lootTableEntry.by_table.filter(lootTableId)].find(
      (row) => row.itemTemplateId === itemTemplateId
    );
    if (existing) {
      if (existing.weight !== weight) {
        ctx.db.lootTableEntry.id.update({ ...existing, weight });
      }
      return;
    }
    ctx.db.lootTableEntry.insert({
      id: 0n,
      lootTableId,
      itemTemplateId,
      weight,
    });
  };
  const addOrSyncTable = (
    terrainType: string,
    creatureType: string,
    junkChance: bigint,
    gearChance: bigint,
    goldMin: bigint,
    goldMax: bigint
  ) => {
    const existing = findLootTable(terrainType, creatureType, 1n);
    let tableId: bigint;
    if (existing) {
      ctx.db.lootTable.id.update({
        ...existing,
        junkChance,
        gearChance,
        goldMin,
        goldMax,
      });
      tableId = existing.id;
    } else {
      const inserted = ctx.db.lootTable.insert({
        id: 0n,
        terrainType,
        creatureType,
        tier: 1n,
        junkChance,
        gearChance,
        goldMin,
        goldMax,
      });
      tableId = inserted.id;
    }
    for (const item of junkTemplates) {
      upsertLootEntry(tableId, item.id, 10n);
    }
    const resourceTemplates = getGatherableResourceTemplates(ctx, terrainType);
    for (const entry of resourceTemplates) {
      upsertLootEntry(tableId, entry.template.id, 6n);
    }
    if (creatureType === 'animal' || creatureType === 'beast') {
      const rawMeat = findItemTemplateByName(ctx, 'Raw Meat');
      if (rawMeat) {
        upsertLootEntry(tableId, rawMeat.id, 20n);
      }
    }
    for (const item of gearTemplates) {
      upsertLootEntry(tableId, item.id, item.rarity === 'uncommon' ? 3n : 6n);
    }
  };
  const terrains = ['plains', 'woods', 'swamp', 'mountains', 'town', 'city', 'dungeon'];
  for (const terrain of terrains) {
    addOrSyncTable(terrain, 'animal', 75n, 10n, 0n, 2n);
    addOrSyncTable(terrain, 'beast', 65n, 15n, 0n, 3n);
    addOrSyncTable(terrain, 'humanoid', 40n, 25n, 2n, 6n);
    addOrSyncTable(terrain, 'undead', 55n, 20n, 1n, 4n);
    addOrSyncTable(terrain, 'spirit', 50n, 20n, 1n, 4n);
    addOrSyncTable(terrain, 'construct', 60n, 20n, 1n, 4n);
  }
}

function ensureVendorInventory(ctx: any) {
  // Helper function for deterministic random selection
  function pickN(items: any[], n: number, seed: bigint): any[] {
    const selected: any[] = [];
    const pool = [...items];
    for (let i = 0; i < Math.min(n, pool.length); i++) {
      const idx = Number((seed + BigInt(i * 7)) % BigInt(pool.length));
      selected.push(pool.splice(idx, 1)[0]);
    }
    return selected;
  }

  // Iterate ALL vendor NPCs
  const vendors = [...ctx.db.npc.iter()].filter((row) => row.npcType === 'vendor');

  for (const vendor of vendors) {
    // Determine vendor tier from its region
    const location = ctx.db.location.id.find(vendor.locationId);
    if (!location) continue;

    const region = ctx.db.region.id.find(location.regionId);
    if (!region) continue;

    const tierRaw = Math.floor(Number(region.dangerMultiplier) / 100);
    const vendorTier = Math.max(1, tierRaw);

    // Filter eligible items: not junk, not resources, tier <= vendor tier
    const allEligible = [...ctx.db.itemTemplate.iter()].filter(
      (row) => !row.isJunk && row.slot !== 'resource' && row.tier <= BigInt(vendorTier)
    );

    // Group items by category
    const armor = allEligible.filter((item) =>
      item.slot === 'chest' || item.slot === 'legs' || item.slot === 'boots'
    );
    const weapons = allEligible.filter((item) =>
      item.slot === 'mainHand' || item.slot === 'offHand'
    );
    const accessories = allEligible.filter((item) =>
      item.slot === 'earrings' || item.slot === 'cloak' || item.slot === 'neck'
    );
    const consumables = allEligible.filter((item) =>
      item.slot === 'consumable' || item.slot === 'food' || item.slot === 'utility'
    );

    // Select random subset from each category using vendor.id as seed
    const selectedArmor = pickN(armor, 4, vendor.id);
    const selectedWeapons = pickN(weapons, 3, vendor.id);
    const selectedAccessories = pickN(accessories, 2, vendor.id);
    const selectedConsumables = consumables; // Keep all consumables

    // Combine all selected items
    const selectedItems = [
      ...selectedArmor,
      ...selectedWeapons,
      ...selectedAccessories,
      ...selectedConsumables
    ];

    // Upsert selected items
    const upsertVendorItem = (itemTemplateId: bigint, price: bigint) => {
      const existing = [...ctx.db.vendorInventory.by_vendor.filter(vendor.id)].find(
        (row) => row.itemTemplateId === itemTemplateId
      );
      if (existing) {
        if (existing.price !== price) {
          ctx.db.vendorInventory.id.update({ ...existing, price });
        }
        return;
      }
      ctx.db.vendorInventory.insert({
        id: 0n,
        npcId: vendor.id,
        itemTemplateId,
        price,
      });
    };

    // Track selected item IDs
    const selectedItemIds = new Set<bigint>();
    for (const template of selectedItems) {
      const price = template.vendorValue > 0n ? template.vendorValue * 6n : 10n;
      upsertVendorItem(template.id, price);
      selectedItemIds.add(template.id);
    }

    // Remove stale vendor items
    const existingInventory = [...ctx.db.vendorInventory.by_vendor.filter(vendor.id)];
    for (const inventoryRow of existingInventory) {
      if (!selectedItemIds.has(inventoryRow.itemTemplateId)) {
        ctx.db.vendorInventory.id.delete(inventoryRow.id);
      }
    }
  }
}

function computeLocationTargetLevel(ctx: any, locationId: bigint, baseLevel: bigint) {
  const location = ctx.db.location.id.find(locationId);
  if (!location) return baseLevel;
  const region = ctx.db.region.id.find(location.regionId);
  const multiplier = region?.dangerMultiplier ?? 100n;
  const scaled = (baseLevel * multiplier) / 100n;
  const offset = location.levelOffset ?? 0n;
  const result = scaled + offset;
  return result > 1n ? result : 1n;
}

function getWorldState(ctx: any) {
  return ctx.db.worldState.id.find(1n);
}

function isNightTime(ctx: any) {
  const world = getWorldState(ctx);
  return world?.isNight ?? false;
}

function connectLocations(ctx: any, fromId: bigint, toId: bigint) {
  ctx.db.locationConnection.insert({ id: 0n, fromLocationId: fromId, toLocationId: toId });
  ctx.db.locationConnection.insert({ id: 0n, fromLocationId: toId, toLocationId: fromId });
}

function areLocationsConnected(ctx: any, fromId: bigint, toId: bigint) {
  for (const row of ctx.db.locationConnection.by_from.filter(fromId)) {
    if (row.toLocationId === toId) return true;
  }
  return false;
}

function friendUserIds(ctx: any, userId: bigint): bigint[] {
  const ids: bigint[] = [];
  for (const row of ctx.db.friend.by_user.filter(userId)) {
    ids.push(row.friendUserId);
  }
  return ids;
}

function findCharacterByName(ctx: any, name: string) {
  let found: typeof Character.rowType | null = null;
  for (const row of ctx.db.character.iter()) {
    if (row.name.toLowerCase() === name.toLowerCase()) {
      if (found) throw new SenderError('Multiple characters share that name');
      found = row;
    }
  }
  return found;
}

function findEnemyTemplateByName(ctx: any, name: string) {
  for (const row of ctx.db.enemyTemplate.iter()) {
    if (row.name.toLowerCase() === name.toLowerCase()) return row;
  }
  return null;
}

function scheduleCombatTick(ctx: any, combatId: bigint) {
  const nextAt = ctx.timestamp.microsSinceUnixEpoch + COMBAT_LOOP_INTERVAL_MICROS;
  ctx.db.combatLoopTick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(nextAt),
    combatId,
  });
}

function ensureLocationEnemyTemplates(ctx: any) {
  for (const location of ctx.db.location.iter()) {
    const existing = new Set<string>();
    for (const row of ctx.db.locationEnemyTemplate.by_location.filter(location.id)) {
      existing.add(row.enemyTemplateId.toString());
    }
    const locationTerrain = (location.terrainType ?? '').trim().toLowerCase();
    for (const template of ctx.db.enemyTemplate.iter()) {
      const allowed = (template.terrainTypes ?? '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0);
      if (allowed.length > 0 && locationTerrain && !allowed.includes(locationTerrain)) {
        continue;
      }
      if (existing.has(template.id.toString())) continue;
      ctx.db.locationEnemyTemplate.insert({
        id: 0n,
        locationId: location.id,
        enemyTemplateId: template.id,
      });
    }
  }
}

function getEnemyRoleTemplates(ctx: any, templateId: bigint) {
  return [...ctx.db.enemyRoleTemplate.by_template.filter(templateId)];
}

function pickRoleTemplate(
  ctx: any,
  templateId: bigint,
  seed: bigint
): typeof EnemyRoleTemplate.rowType | null {
  const roles = getEnemyRoleTemplates(ctx, templateId);
  if (roles.length === 0) return null;
  const index = Number(seed % BigInt(roles.length));
  return roles[index];
}

function seedSpawnMembers(
  ctx: any,
  spawnId: bigint,
  templateId: bigint,
  count: bigint,
  seed: bigint
) {
  const total = Number(count);
  for (let i = 0; i < total; i += 1) {
    const role = pickRoleTemplate(ctx, templateId, seed + BigInt(i) * 7n);
    if (!role) continue;
    ctx.db.enemySpawnMember.insert({
      id: 0n,
      spawnId,
      enemyTemplateId: templateId,
      roleTemplateId: role.id,
    });
  }
}

function refreshSpawnGroupCount(ctx: any, spawnId: bigint) {
  let count = 0n;
  for (const _row of ctx.db.enemySpawnMember.by_spawn.filter(spawnId)) {
    count += 1n;
  }
  const spawn = ctx.db.enemySpawn.id.find(spawnId);
  if (spawn) {
    ctx.db.enemySpawn.id.update({ ...spawn, groupCount: count });
  }
  return count;
}

function spawnEnemy(
  ctx: any,
  locationId: bigint,
  targetLevel: bigint = 1n,
  avoidTemplateIds: bigint[] = []
): typeof EnemySpawn.rowType {
  const templates = [...ctx.db.locationEnemyTemplate.by_location.filter(locationId)];
  if (templates.length === 0) throw new SenderError('No enemy templates for location');

  const timePref = isNightTime(ctx) ? 'night' : 'day';
  const allCandidates = templates
    .map((ref) => ctx.db.enemyTemplate.id.find(ref.enemyTemplateId))
    .filter(Boolean) as (typeof EnemyTemplate.rowType)[];
  const timeFiltered = allCandidates.filter((template) => {
    const pref = (template.timeOfDay ?? '').trim().toLowerCase();
    if (!pref || pref === 'any') return true;
    return pref === timePref;
  });
  const candidates = timeFiltered.length > 0 ? timeFiltered : allCandidates;
  if (candidates.length === 0) throw new SenderError('Enemy template missing');

  const adjustedTarget = computeLocationTargetLevel(ctx, locationId, targetLevel);
  const minLevel = adjustedTarget > 1n ? adjustedTarget - 1n : 1n;
  const maxLevel = adjustedTarget + 1n;
  const filteredByLevel = candidates.filter(
    (candidate) => candidate.level >= minLevel && candidate.level <= maxLevel
  );
  const viable = filteredByLevel.length > 0 ? filteredByLevel : candidates;
  const avoidSet = new Set(avoidTemplateIds.map((id) => id.toString()));
  const nonAvoid = viable.filter((candidate) => !avoidSet.has(candidate.id.toString()));
  const pool = nonAvoid.length > 0 ? nonAvoid : viable;

  const diffFor = (candidate: typeof EnemyTemplate.rowType) =>
    candidate.level > adjustedTarget
      ? candidate.level - adjustedTarget
      : adjustedTarget - candidate.level;
  const weighted: { candidate: typeof EnemyTemplate.rowType; weight: bigint }[] = [];
  let totalWeight = 0n;
  for (const candidate of pool) {
    const diff = diffFor(candidate);
    const weight = 4n - (diff > 3n ? 3n : diff);
    const finalWeight = weight > 0n ? weight : 1n;
    weighted.push({ candidate, weight: finalWeight });
    totalWeight += finalWeight;
  }
  const seed =
    ctx.timestamp.microsSinceUnixEpoch + locationId + BigInt(pool.length) + BigInt(totalWeight);
  let roll = totalWeight > 0n ? seed % totalWeight : 0n;
  let chosen = weighted[0]?.candidate ?? pool[0];
  for (const entry of weighted) {
    if (roll < entry.weight) {
      chosen = entry.candidate;
      break;
    }
    roll -= entry.weight;
  }

  const minGroup = chosen.groupMin && chosen.groupMin > 0n ? chosen.groupMin : 1n;
  const maxGroup = chosen.groupMax && chosen.groupMax > 0n ? chosen.groupMax : minGroup;
  const groupSeed = seed + chosen.id * 11n;
  let groupCount = minGroup;
  if (maxGroup > minGroup) {
    const location = ctx.db.location.id.find(locationId);
    const region = location ? ctx.db.region.id.find(location.regionId) : undefined;
    const danger = region?.dangerMultiplier ?? GROUP_SIZE_DANGER_BASE;
    const delta = danger > GROUP_SIZE_DANGER_BASE ? danger - GROUP_SIZE_DANGER_BASE : 0n;
    const rawBias =
      Number(delta) / Math.max(1, Number(GROUP_SIZE_BIAS_RANGE));
    const bias = Math.max(0, Math.min(GROUP_SIZE_BIAS_MAX, rawBias));
    const biasScaled = Math.round(bias * 1000);
    const invBias = 1000 - biasScaled;
    const sizeCount = Number(maxGroup - minGroup + 1n);
    let totalWeight = 0;
    const weights: number[] = [];
    for (let i = 0; i < sizeCount; i += 1) {
      const lowWeight = sizeCount - i;
      const highWeight = i + 1;
      const weight = invBias * lowWeight + biasScaled * highWeight;
      weights.push(weight);
      totalWeight += weight;
    }
    let roll = groupSeed % BigInt(totalWeight);
    for (let i = 0; i < weights.length; i += 1) {
      const weight = BigInt(weights[i]);
      if (roll < weight) {
        groupCount = minGroup + BigInt(i);
        break;
      }
      roll -= weight;
    }
  }

  const spawn = ctx.db.enemySpawn.insert({
    id: 0n,
    locationId,
    enemyTemplateId: chosen.id,
    name: chosen.name,
    state: 'available',
    lockedCombatId: undefined,
    groupCount,
  });

  seedSpawnMembers(ctx, spawn.id, chosen.id, groupCount, groupSeed);
  refreshSpawnGroupCount(ctx, spawn.id);

  ctx.db.enemySpawn.id.update({
    ...spawn,
    name: `${chosen.name}`,
  });
  return ctx.db.enemySpawn.id.find(spawn.id)!;
}

function spawnEnemyWithTemplate(
  ctx: any,
  locationId: bigint,
  templateId: bigint
): typeof EnemySpawn.rowType {
  const template = ctx.db.enemyTemplate.id.find(templateId);
  if (!template) throw new SenderError('Enemy template not found');
  let allowedHere = false;
  for (const row of ctx.db.locationEnemyTemplate.by_location.filter(locationId)) {
    if (row.enemyTemplateId === templateId) {
      allowedHere = true;
      break;
    }
  }
  if (!allowedHere) throw new SenderError('That creature cannot be tracked here');
  const timePref = isNightTime(ctx) ? 'night' : 'day';
  const pref = (template.timeOfDay ?? '').trim().toLowerCase();
  if (pref && pref !== 'any' && pref !== timePref) {
    throw new SenderError('That creature is not active right now');
  }
  const seed = ctx.timestamp.microsSinceUnixEpoch + locationId + template.id;
  const minGroup = template.groupMin && template.groupMin > 0n ? template.groupMin : 1n;
  const maxGroup = template.groupMax && template.groupMax > 0n ? template.groupMax : minGroup;
  const groupSeed = seed + template.id * 11n;
  let groupCount = minGroup;
  if (maxGroup > minGroup) {
    const location = ctx.db.location.id.find(locationId);
    const region = location ? ctx.db.region.id.find(location.regionId) : undefined;
    const danger = region?.dangerMultiplier ?? GROUP_SIZE_DANGER_BASE;
    const delta = danger > GROUP_SIZE_DANGER_BASE ? danger - GROUP_SIZE_DANGER_BASE : 0n;
    const rawBias = Number(delta) / Math.max(1, Number(GROUP_SIZE_BIAS_RANGE));
    const bias = Math.max(0, Math.min(GROUP_SIZE_BIAS_MAX, rawBias));
    const biasScaled = Math.round(bias * 1000);
    const invBias = 1000 - biasScaled;
    const sizeCount = Number(maxGroup - minGroup + 1n);
    let totalWeight = 0;
    const weights: number[] = [];
    for (let i = 0; i < sizeCount; i += 1) {
      const lowWeight = sizeCount - i;
      const highWeight = i + 1;
      const weight = invBias * lowWeight + biasScaled * highWeight;
      weights.push(weight);
      totalWeight += weight;
    }
    let roll = groupSeed % BigInt(totalWeight);
    for (let i = 0; i < weights.length; i += 1) {
      const weight = BigInt(weights[i]);
      if (roll < weight) {
        groupCount = minGroup + BigInt(i);
        break;
      }
      roll -= weight;
    }
  }
  const spawn = ctx.db.enemySpawn.insert({
    id: 0n,
    locationId,
    enemyTemplateId: template.id,
    name: template.name,
    state: 'available',
    lockedCombatId: undefined,
    groupCount,
  });
  seedSpawnMembers(ctx, spawn.id, template.id, groupCount, groupSeed);
  refreshSpawnGroupCount(ctx, spawn.id);
  ctx.db.enemySpawn.id.update({ ...spawn, name: `${template.name}` });
  return ctx.db.enemySpawn.id.find(spawn.id)!;
}

function ensureAvailableSpawn(
  ctx: any,
  locationId: bigint,
  targetLevel: bigint = 1n
): typeof EnemySpawn.rowType {
  let best: typeof EnemySpawn.rowType | null = null;
  let bestDiff: bigint | null = null;
  const adjustedTarget = computeLocationTargetLevel(ctx, locationId, targetLevel);
  for (const spawn of ctx.db.enemySpawn.by_location.filter(locationId)) {
    if (spawn.state !== 'available') continue;
    if (spawn.groupCount === 0n) continue;
    const template = ctx.db.enemyTemplate.id.find(spawn.enemyTemplateId);
    if (!template) continue;
    const diff =
      template.level > adjustedTarget
        ? template.level - adjustedTarget
        : adjustedTarget - template.level;
    if (!best || bestDiff === null || diff < bestDiff) {
      best = spawn;
      bestDiff = diff;
    }
  }
  if (best && bestDiff !== null && bestDiff <= 1n) return best;
  return spawnEnemy(ctx, locationId, targetLevel);
}

function ensureHealthRegenScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.healthRegenTick.iter())) {
    ctx.db.healthRegenTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 3_000_000n),
    });
  }
}

const HUNGER_DECAY_INTERVAL_MICROS = 300_000_000n; // 5 minutes

function ensureHungerDecayScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.hungerDecayTick.iter())) {
    ctx.db.hungerDecayTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + HUNGER_DECAY_INTERVAL_MICROS),
    });
  }
}

function ensureEffectTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.effectTick.iter())) {
    ctx.db.effectTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 10_000_000n),
    });
  }
}

function ensureHotTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.hotTick.iter())) {
    ctx.db.hotTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 3_000_000n),
    });
  }
}

function ensureCastTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.castTick.iter())) {
    ctx.db.castTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 200_000n),
    });
  }
}

function ensureDayNightTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.dayNightTick.iter())) {
    const world = getWorldState(ctx);
    const nextAt =
      world?.nextTransitionAtMicros ?? ctx.timestamp.microsSinceUnixEpoch + DAY_DURATION_MICROS;
    ctx.db.dayNightTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(nextAt),
    });
  }
}

function ensureSpawnsForLocation(ctx: any, locationId: bigint) {
  const activeGroupKeys = new Set<string>();
  for (const player of ctx.db.player.iter()) {
    if (!player.activeCharacterId) continue;
    const character = ctx.db.character.id.find(player.activeCharacterId);
    if (!character || character.locationId !== locationId) continue;
    activeGroupKeys.add(effectiveGroupKey(character));
  }
  const needed = activeGroupKeys.size;
  let available = 0;
  for (const row of ctx.db.enemySpawn.by_location.filter(locationId)) {
    if (row.state === 'available') available += 1;
  }
  while (available < needed) {
    const availableTemplates: bigint[] = [];
    for (const row of ctx.db.enemySpawn.by_location.filter(locationId)) {
      if (row.state !== 'available') continue;
      availableTemplates.push(row.enemyTemplateId);
    }
    spawnEnemy(ctx, locationId, 1n, availableTemplates);
    available += 1;
  }
}

function ensureLocationRuntimeBootstrap(ctx: any) {
  for (const location of ctx.db.location.iter()) {
    ensureResourceNodesForLocation(ctx, location.id);
    let count = 0;
    for (const _row of ctx.db.enemySpawn.by_location.filter(location.id)) {
      count += 1;
    }
    while (count < DEFAULT_LOCATION_SPAWNS) {
      const existingTemplates: bigint[] = [];
      for (const row of ctx.db.enemySpawn.by_location.filter(location.id)) {
        existingTemplates.push(row.enemyTemplateId);
      }
      spawnEnemy(ctx, location.id, 1n, existingTemplates);
      count += 1;
    }
  }
}

function syncAllContent(ctx: any) {
  ensureRaces(ctx);
  ensureFactions(ctx);
  ensureWorldLayout(ctx);
  ensureStarterItemTemplates(ctx);
  ensureResourceItemTemplates(ctx);
  ensureFoodItemTemplates(ctx);
  ensureAbilityTemplates(ctx);
  ensureRecipeTemplates(ctx);
  ensureNpcs(ctx);
  ensureQuestTemplates(ctx);
  ensureEnemyTemplatesAndRoles(ctx);
  ensureEnemyAbilities(ctx);
  ensureLocationEnemyTemplates(ctx);
  ensureLocationRuntimeBootstrap(ctx);
  ensureLootTables(ctx);
  ensureVendorInventory(ctx);
}

function respawnLocationSpawns(ctx: any, locationId: bigint, desired: number) {
  for (const row of ctx.db.enemySpawn.by_location.filter(locationId)) {
    if (row.state === 'available') {
      for (const member of ctx.db.enemySpawnMember.by_spawn.filter(row.id)) {
        ctx.db.enemySpawnMember.id.delete(member.id);
      }
      ctx.db.enemySpawn.id.delete(row.id);
    }
  }
  let count = 0;
  for (const _row of ctx.db.enemySpawn.by_location.filter(locationId)) {
    count += 1;
  }
  while (count < desired) {
    const existingTemplates: bigint[] = [];
    for (const row of ctx.db.enemySpawn.by_location.filter(locationId)) {
      existingTemplates.push(row.enemyTemplateId);
    }
    spawnEnemy(ctx, locationId, 1n, existingTemplates);
    count += 1;
  }
}

spacetimedb.reducer('tick_day_night', { arg: DayNightTick.rowType }, (ctx) => {
  const world = getWorldState(ctx);
  if (!world) return;
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (world.nextTransitionAtMicros > now) {
    ctx.db.dayNightTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(world.nextTransitionAtMicros),
    });
    return;
  }
  const nextIsNight = !world.isNight;
  const nextDuration = nextIsNight ? NIGHT_DURATION_MICROS : DAY_DURATION_MICROS;
  const nextTransition = now + nextDuration;
  ctx.db.worldState.id.update({
    ...world,
    isNight: nextIsNight,
    nextTransitionAtMicros: nextTransition,
  });
  const message = nextIsNight ? 'Night falls over the realm.' : 'Dawn breaks over the realm.';
  appendWorldEvent(ctx, 'world', message);
  for (const location of ctx.db.location.iter()) {
    respawnLocationSpawns(ctx, location.id, DEFAULT_LOCATION_SPAWNS);
    respawnResourceNodesForLocation(ctx, location.id);
  }
  ctx.db.dayNightTick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(nextTransition),
  });
});

registerViews({
  spacetimedb,
  t,
  Player,
  FriendRequest,
  Friend,
  GroupInvite,
  EventGroup,
  GroupMember,
  CharacterEffect,
  CombatResult,
  CombatLoot,
  EventLocation,
  EventPrivate,
  NpcDialog,
  QuestInstance,
  Hunger,
  Faction,
  FactionStanding,
  UiPanelLayout,
});

function ensureNpcs(ctx: any) {
  const upsertNpcByName = (args: {
    name: string;
    npcType: string;
    locationName: string;
    description: string;
    greeting: string;
  }) => {
    const location = [...ctx.db.location.iter()].find((row) => row.name === args.locationName);
    if (!location) return;
    const existing = [...ctx.db.npc.iter()].find((row) => row.name === args.name);
    if (existing) {
      ctx.db.npc.id.update({
        ...existing,
        name: args.name,
        npcType: args.npcType,
        locationId: location.id,
        description: args.description,
        greeting: args.greeting,
      });
      return;
    }
    ctx.db.npc.insert({
      id: 0n,
      name: args.name,
      npcType: args.npcType,
      locationId: location.id,
      description: args.description,
      greeting: args.greeting,
    });
  };

  upsertNpcByName({
    name: 'Marla the Guide',
    npcType: 'quest',
    locationName: 'Hollowmere',
    description: 'A veteran scout who knows every trail between the river and the emberlands.',
    greeting: 'Welcome, traveler. The road is cruel, but I can help you find your footing.',
  });
  upsertNpcByName({
    name: 'Elder Soren',
    npcType: 'lore',
    locationName: 'Hollowmere',
    description: 'A stoic town elder with a gaze that weighs every word.',
    greeting: 'Hollowmere watches over its own. Keep your blade sharp and your wits sharper.',
  });
  upsertNpcByName({
    name: 'Quartermaster Jyn',
    npcType: 'vendor',
    locationName: 'Hollowmere',
    description: 'A brisk quartermaster tallying supplies near the lantern-lit market.',
    greeting: 'Supplies are tight. If you can help keep the roads safe, the town will remember.',
  });
}

function ensureQuestTemplates(ctx: any) {
  const upsertQuestByName = (args: {
    name: string;
    npcName: string;
    enemyName: string;
    requiredCount: bigint;
    minLevel: bigint;
    maxLevel: bigint;
    rewardXp: bigint;
  }) => {
    const npc = [...ctx.db.npc.iter()].find((row) => row.name === args.npcName);
    const enemy = findEnemyTemplateByName(ctx, args.enemyName);
    if (!npc || !enemy) return;
    const existing = [...ctx.db.questTemplate.iter()].find((row) => row.name === args.name);
    if (existing) {
      ctx.db.questTemplate.id.update({
        ...existing,
        name: args.name,
        npcId: npc.id,
        targetEnemyTemplateId: enemy.id,
        requiredCount: args.requiredCount,
        minLevel: args.minLevel,
        maxLevel: args.maxLevel,
        rewardXp: args.rewardXp,
      });
      return;
    }
    ctx.db.questTemplate.insert({
      id: 0n,
      name: args.name,
      npcId: npc.id,
      targetEnemyTemplateId: enemy.id,
      requiredCount: args.requiredCount,
      minLevel: args.minLevel,
      maxLevel: args.maxLevel,
      rewardXp: args.rewardXp,
    });
  };

  upsertQuestByName({
    name: 'Bog Rat Cleanup',
    npcName: 'Marla the Guide',
    enemyName: 'Bog Rat',
    requiredCount: 3n,
    minLevel: 1n,
    maxLevel: 3n,
    rewardXp: 40n,
  });
  upsertQuestByName({
    name: 'Thicket Wolf Cull',
    npcName: 'Marla the Guide',
    enemyName: 'Thicket Wolf',
    requiredCount: 4n,
    minLevel: 2n,
    maxLevel: 5n,
    rewardXp: 60n,
  });
}

function ensureEnemyAbilities(ctx: any) {
  const upsertEnemyAbility = (
    templateName: string,
    abilityKey: string,
    name: string,
    kind: string,
    castSeconds: bigint,
    cooldownSeconds: bigint,
    targetRule: string
  ) => {
    const template = findEnemyTemplateByName(ctx, templateName);
    if (!template) return;
    const existing = [...ctx.db.enemyAbility.by_template.filter(template.id)].find(
      (row) => row.abilityKey === abilityKey
    );
    if (existing) {
      ctx.db.enemyAbility.id.update({
        ...existing,
        enemyTemplateId: template.id,
        abilityKey,
        name,
        kind,
        castSeconds,
        cooldownSeconds,
        targetRule,
      });
      return;
    }
    ctx.db.enemyAbility.insert({
      id: 0n,
      enemyTemplateId: template.id,
      abilityKey,
      name,
      kind,
      castSeconds,
      cooldownSeconds,
      targetRule,
    });
  };

  upsertEnemyAbility('Bog Rat', 'poison_bite', 'Poison Bite', 'dot', 3n, 20n, 'aggro');
  upsertEnemyAbility('Ember Wisp', 'ember_burn', 'Ember Burn', 'dot', 2n, 18n, 'aggro');
  upsertEnemyAbility('Bandit', 'bleeding_shot', 'Bleeding Shot', 'dot', 1n, 15n, 'aggro');
  upsertEnemyAbility('Blight Stalker', 'shadow_rend', 'Shadow Rend', 'dot', 2n, 18n, 'aggro');
  upsertEnemyAbility('Grave Acolyte', 'sapping_chant', 'Sapping Chant', 'debuff', 2n, 20n, 'aggro');
  upsertEnemyAbility('Hexbinder', 'withering_hex', 'Withering Hex', 'debuff', 2n, 20n, 'aggro');
  upsertEnemyAbility('Thicket Wolf', 'rending_bite', 'Rending Bite', 'dot', 1n, 12n, 'aggro');
  upsertEnemyAbility('Marsh Croaker', 'bog_slime', 'Bog Slime', 'dot', 1n, 12n, 'aggro');
  upsertEnemyAbility('Dust Hare', 'quick_nip', 'Quick Nip', 'dot', 1n, 10n, 'aggro');
  upsertEnemyAbility('Ash Jackal', 'scorching_snap', 'Scorching Snap', 'dot', 1n, 14n, 'aggro');
  upsertEnemyAbility('Thorn Sprite', 'thorn_venom', 'Thorn Venom', 'dot', 2n, 16n, 'aggro');
  upsertEnemyAbility('Gloom Stag', 'crushing_gore', 'Crushing Gore', 'debuff', 2n, 18n, 'aggro');
  upsertEnemyAbility('Mire Leech', 'blood_drain', 'Blood Drain', 'dot', 2n, 18n, 'aggro');
  upsertEnemyAbility('Fen Witch', 'mire_curse', 'Mire Curse', 'debuff', 2n, 20n, 'aggro');
  upsertEnemyAbility('Grave Skirmisher', 'rusty_bleed', 'Rusty Bleed', 'dot', 1n, 12n, 'aggro');
  upsertEnemyAbility('Cinder Sentinel', 'ember_slam', 'Ember Slam', 'debuff', 2n, 20n, 'aggro');
  upsertEnemyAbility('Emberling', 'ember_spark', 'Ember Spark', 'dot', 1n, 12n, 'aggro');
  upsertEnemyAbility('Frostbone Acolyte', 'chill_touch', 'Chill Touch', 'debuff', 2n, 18n, 'aggro');
  upsertEnemyAbility('Ridge Skirmisher', 'stone_cleave', 'Stone Cleave', 'dot', 1n, 14n, 'aggro');
  upsertEnemyAbility('Emberhawk', 'searing_talon', 'Searing Talon', 'dot', 2n, 18n, 'aggro');
  upsertEnemyAbility('Basalt Brute', 'quake_stomp', 'Quake Stomp', 'debuff', 2n, 22n, 'aggro');
  upsertEnemyAbility('Grave Servant', 'grave_shield_break', 'Grave Shield Break', 'debuff', 2n, 18n, 'aggro');
  upsertEnemyAbility('Alley Shade', 'shadow_bleed', 'Shadow Bleed', 'dot', 2n, 18n, 'aggro');
  upsertEnemyAbility('Vault Sentinel', 'vault_crush', 'Vault Crush', 'debuff', 2n, 20n, 'aggro');
  upsertEnemyAbility('Sootbound Mystic', 'soot_hex', 'Soot Hex', 'debuff', 2n, 18n, 'aggro');
  upsertEnemyAbility('Ember Priest', 'cinder_blight', 'Cinder Blight', 'dot', 2n, 16n, 'aggro');
  upsertEnemyAbility('Ashforged Revenant', 'molten_bleed', 'Molten Bleed', 'dot', 3n, 20n, 'aggro');

  // Heal abilities
  upsertEnemyAbility('Fen Witch', 'shaman_heal', 'Shaman Heal', 'heal', 2n, 15n, 'lowest_hp');
  upsertEnemyAbility('Grave Acolyte', 'dark_mend', 'Dark Mend', 'heal', 3n, 20n, 'lowest_hp');

  // AoE abilities
  upsertEnemyAbility('Cinder Sentinel', 'flame_burst', 'Flame Burst', 'aoe_damage', 2n, 20n, 'all_players');
  upsertEnemyAbility('Basalt Brute', 'quake_wave', 'Quake Wave', 'aoe_damage', 3n, 25n, 'all_players');

  // Buff abilities
  upsertEnemyAbility('Hexbinder', 'warchief_rally', 'Warchief Rally', 'buff', 2n, 30n, 'all_allies');
  upsertEnemyAbility('Sootbound Mystic', 'bolster_defenses', 'Bolster Defenses', 'buff', 2n, 25n, 'all_allies');
}

function ensureWorldLayout(ctx: any) {
  const upsertRegionByName = (args: {
    name: string;
    dangerMultiplier: bigint;
    regionType: string;
  }) => {
    const existing = [...ctx.db.region.iter()].find((row) => row.name === args.name);
    if (existing) {
      ctx.db.region.id.update({
        ...existing,
        name: args.name,
        dangerMultiplier: args.dangerMultiplier,
        regionType: args.regionType,
      });
      return ctx.db.region.id.find(existing.id) ?? { ...existing, ...args, id: existing.id };
    }
    return ctx.db.region.insert({
      id: 0n,
      name: args.name,
      dangerMultiplier: args.dangerMultiplier,
      regionType: args.regionType,
    });
  };
  const upsertLocationByName = (args: {
    name: string;
    description: string;
    zone: string;
    regionId: bigint;
    levelOffset: bigint;
    isSafe: boolean;
    terrainType: string;
    bindStone: boolean;
    craftingAvailable: boolean;
  }) => {
    const existing = [...ctx.db.location.iter()].find((row) => row.name === args.name);
    if (existing) {
      ctx.db.location.id.update({
        ...existing,
        name: args.name,
        description: args.description,
        zone: args.zone,
        regionId: args.regionId,
        levelOffset: args.levelOffset,
        isSafe: args.isSafe,
        terrainType: args.terrainType,
        bindStone: args.bindStone,
        craftingAvailable: args.craftingAvailable,
      });
      return ctx.db.location.id.find(existing.id) ?? { ...existing, ...args, id: existing.id };
    }
    return ctx.db.location.insert({
      id: 0n,
      name: args.name,
      description: args.description,
      zone: args.zone,
      regionId: args.regionId,
      levelOffset: args.levelOffset,
      isSafe: args.isSafe,
      terrainType: args.terrainType,
      bindStone: args.bindStone,
      craftingAvailable: args.craftingAvailable,
    });
  };
  const connectIfMissing = (fromId: bigint, toId: bigint) => {
    if (!areLocationsConnected(ctx, fromId, toId)) {
      connectLocations(ctx, fromId, toId);
    }
  };

  const starter = upsertRegionByName({
    name: 'Hollowmere Vale',
    dangerMultiplier: 100n,
    regionType: 'outdoor',
  });
  const border = upsertRegionByName({
    name: 'Embermarch Fringe',
    dangerMultiplier: 160n,
    regionType: 'outdoor',
  });
  const embermarchDepths = upsertRegionByName({
    name: 'Embermarch Depths',
    dangerMultiplier: 200n,
    regionType: 'dungeon',
  });

  const town = upsertLocationByName({
    name: 'Hollowmere',
    description: 'A misty river town with lantern-lit docks and a quiet market square.',
    zone: 'Starter',
    regionId: starter.id,
    levelOffset: 0n,
    isSafe: true,
    terrainType: 'town',
    bindStone: false,
    craftingAvailable: true,
  });
  const ashen = upsertLocationByName({
    name: 'Ashen Road',
    description: 'A cracked highway flanked by dead trees and drifting embers.',
    zone: 'Starter',
    regionId: starter.id,
    levelOffset: 1n,
    isSafe: false,
    terrainType: 'plains',
    bindStone: true,
    craftingAvailable: false,
  });
  const fogroot = upsertLocationByName({
    name: 'Fogroot Crossing',
    description: 'Twisted roots and slick stones mark a shadowy crossing.',
    zone: 'Starter',
    regionId: starter.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'swamp',
    bindStone: false,
    craftingAvailable: false,
  });
  const bramble = upsertLocationByName({
    name: 'Bramble Hollow',
    description: 'A dense thicket where tangled branches muffle the light.',
    zone: 'Starter',
    regionId: starter.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'woods',
    bindStone: false,
    craftingAvailable: false,
  });
  const gate = upsertLocationByName({
    name: 'Embermarch Gate',
    description: 'A scorched pass leading toward harsher lands.',
    zone: 'Border',
    regionId: border.id,
    levelOffset: 3n,
    isSafe: false,
    terrainType: 'mountains',
    bindStone: false,
    craftingAvailable: false,
  });
  const cinder = upsertLocationByName({
    name: 'Cinderwatch',
    description: 'Ash dunes and ember winds test the brave.',
    zone: 'Border',
    regionId: border.id,
    levelOffset: 5n,
    isSafe: false,
    terrainType: 'plains',
    bindStone: false,
    craftingAvailable: false,
  });
  const ashvault = upsertLocationByName({
    name: 'Ashvault Entrance',
    description: 'Blackened stone stairs descend into a sulfur-lit vault.',
    zone: 'Dungeon',
    regionId: embermarchDepths.id,
    levelOffset: 2n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const sootveil = upsertLocationByName({
    name: 'Sootveil Hall',
    description: 'Echoing halls where soot clings to every surface.',
    zone: 'Dungeon',
    regionId: embermarchDepths.id,
    levelOffset: 3n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });
  const furnace = upsertLocationByName({
    name: 'Furnace Crypt',
    description: 'A heat-soaked crypt of iron coffins and smoldering braziers.',
    zone: 'Dungeon',
    regionId: embermarchDepths.id,
    levelOffset: 4n,
    isSafe: false,
    terrainType: 'dungeon',
    bindStone: false,
    craftingAvailable: false,
  });

  const world = getWorldState(ctx);
  if (world) {
    ctx.db.worldState.id.update({
      ...world,
      startingLocationId: town.id,
    });
  } else {
    ctx.db.worldState.insert({
      id: 1n,
      startingLocationId: town.id,
      isNight: false,
      nextTransitionAtMicros: ctx.timestamp.microsSinceUnixEpoch + DAY_DURATION_MICROS,
    });
  }

  connectIfMissing(town.id, ashen.id);
  connectIfMissing(ashen.id, fogroot.id);
  connectIfMissing(fogroot.id, bramble.id);
  connectIfMissing(fogroot.id, gate.id);
  connectIfMissing(gate.id, cinder.id);
  connectIfMissing(gate.id, ashvault.id);
  connectIfMissing(ashvault.id, sootveil.id);
  connectIfMissing(sootveil.id, furnace.id);
}

function ensureEnemyTemplatesAndRoles(ctx: any) {
  const addEnemyTemplate = (row: any) => {
    const existing = findEnemyTemplateByName(ctx, row.name);
    if (existing) {
      ctx.db.enemyTemplate.id.update({
        ...existing,
        ...row,
        id: existing.id,
      });
      return ctx.db.enemyTemplate.id.find(existing.id) ?? { ...existing, ...row, id: existing.id };
    }
    return ctx.db.enemyTemplate.insert({
      id: 0n,
      ...row,
    });
  };
  const addRoleTemplate = (
    template: typeof EnemyTemplate.rowType,
    roleKey: string,
    displayName: string,
    role: string,
    roleDetail: string,
    abilityProfile: string
  ) => {
    const existing = [...ctx.db.enemyRoleTemplate.by_template.filter(template.id)].find(
      (row) => row.roleKey === roleKey
    );
    if (existing) {
      ctx.db.enemyRoleTemplate.id.update({
        ...existing,
        enemyTemplateId: template.id,
        roleKey,
        displayName,
        role,
        roleDetail,
        abilityProfile,
      });
      return;
    }
    ctx.db.enemyRoleTemplate.insert({
      id: 0n,
      enemyTemplateId: template.id,
      roleKey,
      displayName,
      role,
      roleDetail,
      abilityProfile,
    });
  };

  const factionIdByName = (name: string): bigint | undefined =>
    ([...ctx.db.faction.iter()] as any[]).find((r: any) => r.name === name)?.id;

  const fIronCompact = factionIdByName('Iron Compact');
  const fVerdantCircle = factionIdByName('Verdant Circle');
  const fAshenOrder = factionIdByName('Ashen Order');
  const fFreeBlades = factionIdByName('Free Blades');

  const bogRat = addEnemyTemplate({
    name: 'Bog Rat',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'swamp',
    creatureType: 'animal',
    timeOfDay: 'any',
    socialGroup: 'animal',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 12n,
    level: 2n,
    maxHp: 32n,
    baseDamage: 5n,
    xpReward: 18n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(bogRat, 'bog_rat', 'Bog Rat', 'tank', 'melee', 'thick hide, taunt');
  addRoleTemplate(bogRat, 'bog_rat_brute', 'Bog Rat Brute', 'tank', 'melee', 'thick hide, taunt');
  addRoleTemplate(bogRat, 'bog_rat_scavenger', 'Bog Rat Scavenger', 'dps', 'melee', 'gnaw, dart');

  const emberWisp = addEnemyTemplate({
    name: 'Ember Wisp',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'plains,mountains',
    creatureType: 'spirit',
    timeOfDay: 'night',
    socialGroup: 'spirit',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 3n,
    armorClass: 8n,
    level: 2n,
    maxHp: 28n,
    baseDamage: 6n,
    xpReward: 20n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(emberWisp, 'ember_wisp', 'Ember Wisp', 'dps', 'magic', 'fire bolts, ignite');
  addRoleTemplate(emberWisp, 'ember_wisp_flare', 'Ember Wisp Flare', 'dps', 'magic', 'flare, ignite');
  addRoleTemplate(emberWisp, 'ember_wisp_spark', 'Ember Wisp Spark', 'support', 'magic', 'spark, veil');

  const bandit = addEnemyTemplate({
    name: 'Bandit',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'plains,woods',
    creatureType: 'humanoid',
    timeOfDay: 'day',
    socialGroup: 'humanoid',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 3n,
    armorClass: 8n,
    level: 2n,
    maxHp: 24n,
    baseDamage: 7n,
    xpReward: 18n,
    factionId: fFreeBlades,
  });
  addRoleTemplate(bandit, 'bandit_archer', 'Bandit Archer', 'dps', 'ranged', 'rapid shot, bleed');
  addRoleTemplate(bandit, 'bandit_ruffian', 'Bandit Ruffian', 'tank', 'melee', 'shield bash, taunt');
  addRoleTemplate(bandit, 'bandit_cutthroat', 'Bandit Cutthroat', 'dps', 'melee', 'quick slash, feint');

  const blightStalker = addEnemyTemplate({
    name: 'Blight Stalker',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'woods,swamp',
    creatureType: 'beast',
    timeOfDay: 'night',
    socialGroup: 'beast',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 4n,
    armorClass: 9n,
    level: 3n,
    maxHp: 30n,
    baseDamage: 8n,
    xpReward: 24n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(blightStalker, 'blight_stalker', 'Blight Stalker', 'dps', 'melee', 'pounce, shred');
  addRoleTemplate(blightStalker, 'blight_stalker_brute', 'Blight Stalker Brute', 'tank', 'melee', 'maul, snarl');
  addRoleTemplate(blightStalker, 'blight_stalker_prowler', 'Blight Stalker Prowler', 'dps', 'melee', 'ambush, shred');

  const graveAcolyte = addEnemyTemplate({
    id: 0n,
    name: 'Grave Acolyte',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'town,city',
    creatureType: 'undead',
    timeOfDay: 'night',
    socialGroup: 'undead',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 9n,
    level: 2n,
    maxHp: 22n,
    baseDamage: 4n,
    xpReward: 18n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(graveAcolyte, 'grave_acolyte', 'Grave Acolyte', 'healer', 'support', 'mend, cleanse');
  addRoleTemplate(graveAcolyte, 'grave_ritualist', 'Grave Ritualist', 'support', 'control', 'curse, drain');
  addRoleTemplate(graveAcolyte, 'grave_zealot', 'Grave Zealot', 'dps', 'melee', 'slash, frenzy');

  const hexbinder = addEnemyTemplate({
    id: 0n,
    name: 'Hexbinder',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'woods,swamp',
    creatureType: 'humanoid',
    timeOfDay: 'night',
    socialGroup: 'humanoid',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 9n,
    level: 3n,
    maxHp: 26n,
    baseDamage: 5n,
    xpReward: 22n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(hexbinder, 'hexbinder', 'Hexbinder', 'support', 'control', 'weaken, slow, snare');
  addRoleTemplate(hexbinder, 'hexbinder_stalker', 'Hexbinder Stalker', 'dps', 'melee', 'hex strike, feint');
  addRoleTemplate(hexbinder, 'hexbinder_warder', 'Hexbinder Warder', 'tank', 'melee', 'ward, taunt');

  const thicketWolf = addEnemyTemplate({
    id: 0n,
    name: 'Thicket Wolf',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'woods,plains',
    creatureType: 'animal',
    timeOfDay: 'day',
    socialGroup: 'animal',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 3n,
    armorClass: 9n,
    level: 1n,
    maxHp: 22n,
    baseDamage: 4n,
    xpReward: 12n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(thicketWolf, 'thicket_wolf', 'Thicket Wolf', 'dps', 'melee', 'pack bite, lunge');
  addRoleTemplate(thicketWolf, 'thicket_wolf_alpha', 'Thicket Wolf Alpha', 'tank', 'melee', 'alpha bite, howl');
  addRoleTemplate(thicketWolf, 'thicket_wolf_prowler', 'Thicket Wolf Prowler', 'dps', 'melee', 'lunge, rake');

  const marshCroaker = addEnemyTemplate({
    id: 0n,
    name: 'Marsh Croaker',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'swamp',
    creatureType: 'animal',
    timeOfDay: 'day',
    socialGroup: 'animal',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 8n,
    level: 1n,
    maxHp: 20n,
    baseDamage: 3n,
    xpReward: 10n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(marshCroaker, 'marsh_croaker', 'Marsh Croaker', 'dps', 'melee', 'tongue lash, croak');
  addRoleTemplate(marshCroaker, 'marsh_croaker_bully', 'Marsh Croaker Bully', 'tank', 'melee', 'slam, croak');

  const dustHare = addEnemyTemplate({
    id: 0n,
    name: 'Dust Hare',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'plains',
    creatureType: 'animal',
    timeOfDay: 'day',
    socialGroup: 'animal',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 7n,
    level: 1n,
    maxHp: 18n,
    baseDamage: 3n,
    xpReward: 10n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(dustHare, 'dust_hare', 'Dust Hare', 'dps', 'melee', 'dart, nip');
  addRoleTemplate(dustHare, 'dust_hare_skitter', 'Dust Hare Skitter', 'dps', 'melee', 'skitter, nip');
  addRoleTemplate(dustHare, 'dust_hare_scout', 'Dust Hare Scout', 'support', 'melee', 'distract, dart');

  const ashJackal = addEnemyTemplate({
    id: 0n,
    name: 'Ash Jackal',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'plains',
    creatureType: 'beast',
    timeOfDay: 'any',
    socialGroup: 'beast',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 8n,
    level: 2n,
    maxHp: 24n,
    baseDamage: 6n,
    xpReward: 18n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(ashJackal, 'ash_jackal', 'Ash Jackal', 'dps', 'melee', 'snap, pack feint');
  addRoleTemplate(ashJackal, 'ash_jackal_alpha', 'Ash Jackal Alpha', 'tank', 'melee', 'alpha snap, snarl');

  const thornSprite = addEnemyTemplate({
    id: 0n,
    name: 'Thorn Sprite',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'woods',
    creatureType: 'spirit',
    timeOfDay: 'night',
    socialGroup: 'spirit',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 8n,
    level: 2n,
    maxHp: 20n,
    baseDamage: 4n,
    xpReward: 16n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(thornSprite, 'thorn_sprite', 'Thorn Sprite', 'support', 'magic', 'sting, wither pollen');
  addRoleTemplate(thornSprite, 'thorn_sprite_stinger', 'Thorn Sprite Stinger', 'dps', 'magic', 'sting, dart');

  const gloomStag = addEnemyTemplate({
    id: 0n,
    name: 'Gloom Stag',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'woods',
    creatureType: 'beast',
    timeOfDay: 'any',
    socialGroup: 'beast',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 12n,
    level: 3n,
    maxHp: 34n,
    baseDamage: 7n,
    xpReward: 24n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(gloomStag, 'gloom_stag', 'Gloom Stag', 'tank', 'melee', 'gore, bulwark');
  addRoleTemplate(gloomStag, 'gloom_stag_charger', 'Gloom Stag Charger', 'dps', 'melee', 'charge, gore');

  const mireLeech = addEnemyTemplate({
    id: 0n,
    name: 'Mire Leech',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'swamp',
    creatureType: 'beast',
    timeOfDay: 'any',
    socialGroup: 'beast',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 9n,
    level: 2n,
    maxHp: 26n,
    baseDamage: 6n,
    xpReward: 18n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(mireLeech, 'mire_leech', 'Mire Leech', 'dps', 'melee', 'drain, latch');
  addRoleTemplate(mireLeech, 'mire_leech_bulwark', 'Mire Leech Bulwark', 'tank', 'melee', 'latch, bulwark');

  const fenWitch = addEnemyTemplate({
    id: 0n,
    name: 'Fen Witch',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'swamp',
    creatureType: 'humanoid',
    timeOfDay: 'night',
    socialGroup: 'humanoid',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 9n,
    level: 3n,
    maxHp: 28n,
    baseDamage: 6n,
    xpReward: 22n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(fenWitch, 'fen_witch', 'Fen Witch', 'support', 'magic', 'curse, mire ward');
  addRoleTemplate(fenWitch, 'fen_witch_hexer', 'Fen Witch Hexer', 'dps', 'magic', 'hex, sting');

  const graveSkirmisher = addEnemyTemplate({
    id: 0n,
    name: 'Grave Skirmisher',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'town,city',
    creatureType: 'undead',
    timeOfDay: 'day',
    socialGroup: 'undead',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 3n,
    armorClass: 9n,
    level: 2n,
    maxHp: 26n,
    baseDamage: 6n,
    xpReward: 18n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(graveSkirmisher, 'grave_skirmisher', 'Grave Skirmisher', 'dps', 'melee', 'rusty slash, feint');
  addRoleTemplate(graveSkirmisher, 'grave_skirmisher_guard', 'Grave Skirmisher Guard', 'tank', 'melee', 'guard, slam');

  const cinderSentinel = addEnemyTemplate({
    id: 0n,
    name: 'Cinder Sentinel',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains,plains',
    creatureType: 'construct',
    timeOfDay: 'day',
    socialGroup: 'construct',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 13n,
    level: 3n,
    maxHp: 36n,
    baseDamage: 6n,
    xpReward: 26n,
    factionId: fIronCompact,
  });
  addRoleTemplate(cinderSentinel, 'cinder_sentinel', 'Cinder Sentinel', 'tank', 'melee', 'stone wall, slam');
  addRoleTemplate(cinderSentinel, 'cinder_sentinel_breaker', 'Cinder Sentinel Breaker', 'dps', 'melee', 'breaker slam, cleave');

  const emberling = addEnemyTemplate({
    id: 0n,
    name: 'Emberling',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains,plains',
    creatureType: 'spirit',
    timeOfDay: 'day',
    socialGroup: 'spirit',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 3n,
    armorClass: 7n,
    level: 1n,
    maxHp: 18n,
    baseDamage: 4n,
    xpReward: 12n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(emberling, 'emberling', 'Emberling', 'support', 'magic', 'ember spark, kindle');
  addRoleTemplate(emberling, 'emberling_spark', 'Emberling Spark', 'dps', 'magic', 'spark, ignite');

  const frostboneAcolyte = addEnemyTemplate({
    id: 0n,
    name: 'Frostbone Acolyte',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains,city',
    creatureType: 'undead',
    timeOfDay: 'night',
    socialGroup: 'undead',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 9n,
    level: 4n,
    maxHp: 30n,
    baseDamage: 6n,
    xpReward: 30n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(
    frostboneAcolyte,
    'frostbone_acolyte',
    'Frostbone Acolyte',
    'healer',
    'support',
    'ice mend, ward'
  );
  addRoleTemplate(
    frostboneAcolyte,
    'frostbone_binder',
    'Frostbone Binder',
    'support',
    'control',
    'chill bind, ward'
  );
  addRoleTemplate(
    frostboneAcolyte,
    'frostbone_zealot',
    'Frostbone Zealot',
    'dps',
    'melee',
    'ice strike, frenzy'
  );

  const ridgeSkirmisher = addEnemyTemplate({
    id: 0n,
    name: 'Ridge Skirmisher',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains',
    creatureType: 'humanoid',
    timeOfDay: 'day',
    socialGroup: 'humanoid',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 3n,
    armorClass: 10n,
    level: 3n,
    maxHp: 28n,
    baseDamage: 7n,
    xpReward: 24n,
    factionId: fFreeBlades,
  });
  addRoleTemplate(ridgeSkirmisher, 'ridge_skirmisher', 'Ridge Skirmisher', 'dps', 'melee', 'rock slash, feint');
  addRoleTemplate(
    ridgeSkirmisher,
    'ridge_skirmisher_guard',
    'Ridge Skirmisher Guard',
    'tank',
    'melee',
    'guard, slam'
  );

  const emberhawk = addEnemyTemplate({
    id: 0n,
    name: 'Emberhawk',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains,plains',
    creatureType: 'beast',
    timeOfDay: 'day',
    socialGroup: 'beast',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 9n,
    level: 4n,
    maxHp: 26n,
    baseDamage: 8n,
    xpReward: 30n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(emberhawk, 'emberhawk', 'Emberhawk', 'dps', 'ranged', 'burning dive');
  addRoleTemplate(emberhawk, 'emberhawk_screecher', 'Emberhawk Screecher', 'support', 'ranged', 'screech, dive');

  const basaltBrute = addEnemyTemplate({
    id: 0n,
    name: 'Basalt Brute',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains',
    creatureType: 'construct',
    timeOfDay: 'any',
    socialGroup: 'construct',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 14n,
    level: 4n,
    maxHp: 40n,
    baseDamage: 7n,
    xpReward: 32n,
    factionId: fIronCompact,
  });
  addRoleTemplate(basaltBrute, 'basalt_brute', 'Basalt Brute', 'tank', 'melee', 'stone slam, brace');

  const ashenRam = addEnemyTemplate({
    id: 0n,
    name: 'Ashen Ram',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains',
    creatureType: 'beast',
    timeOfDay: 'day',
    socialGroup: 'beast',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 12n,
    level: 4n,
    maxHp: 34n,
    baseDamage: 8n,
    xpReward: 32n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(ashenRam, 'ashen_ram', 'Ashen Ram', 'tank', 'melee', 'ram charge, shove');
  addRoleTemplate(ashenRam, 'ashen_ram_runner', 'Ashen Ram Runner', 'dps', 'melee', 'charging gore');

  const sootboundSentry = addEnemyTemplate({
    id: 0n,
    name: 'Sootbound Sentry',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains',
    creatureType: 'construct',
    timeOfDay: 'any',
    socialGroup: 'construct',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 14n,
    level: 5n,
    maxHp: 42n,
    baseDamage: 9n,
    xpReward: 38n,
    factionId: fIronCompact,
  });
  addRoleTemplate(sootboundSentry, 'sootbound_sentry', 'Sootbound Sentry', 'tank', 'melee', 'iron guard');
  addRoleTemplate(
    sootboundSentry,
    'sootbound_sentry_watcher',
    'Sootbound Watcher',
    'support',
    'magic',
    'alarm pulse'
  );
  addRoleTemplate(basaltBrute, 'basalt_brute_crusher', 'Basalt Brute Crusher', 'dps', 'melee', 'crusher slam, cleave');

  const graveServant = addEnemyTemplate({
    id: 0n,
    name: 'Grave Servant',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'town,city',
    creatureType: 'undead',
    timeOfDay: 'night',
    socialGroup: 'undead',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 12n,
    level: 3n,
    maxHp: 34n,
    baseDamage: 6n,
    xpReward: 24n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(graveServant, 'grave_servant', 'Grave Servant', 'tank', 'melee', 'shield crush, watchful');
  addRoleTemplate(graveServant, 'grave_servant_reaver', 'Grave Servant Reaver', 'dps', 'melee', 'reaver slash, feint');

  const alleyShade = addEnemyTemplate({
    id: 0n,
    name: 'Alley Shade',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'town,city',
    creatureType: 'undead',
    timeOfDay: 'night',
    socialGroup: 'undead',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 3n,
    armorClass: 10n,
    level: 4n,
    maxHp: 28n,
    baseDamage: 9n,
    xpReward: 30n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(alleyShade, 'alley_shade', 'Alley Shade', 'dps', 'melee', 'shadow cut, vanish');
  addRoleTemplate(alleyShade, 'alley_shade_stalker', 'Alley Shade Stalker', 'dps', 'melee', 'stalk, strike');
  addRoleTemplate(alleyShade, 'alley_shade_warden', 'Alley Shade Warden', 'tank', 'melee', 'ward, counter');

  const vaultSentinel = addEnemyTemplate({
    id: 0n,
    name: 'Vault Sentinel',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'dungeon',
    creatureType: 'construct',
    timeOfDay: 'any',
    socialGroup: 'construct',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 14n,
    level: 4n,
    maxHp: 42n,
    baseDamage: 7n,
    xpReward: 34n,
    factionId: fIronCompact,
  });
  addRoleTemplate(vaultSentinel, 'vault_sentinel', 'Vault Sentinel', 'tank', 'melee', 'iron guard, shield bash');
  addRoleTemplate(vaultSentinel, 'vault_sentinel_crusher', 'Vault Sentinel Crusher', 'dps', 'melee', 'crusher bash, cleave');

  const sootboundMystic = addEnemyTemplate({
    id: 0n,
    name: 'Sootbound Mystic',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'dungeon',
    creatureType: 'humanoid',
    timeOfDay: 'any',
    socialGroup: 'humanoid',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 10n,
    level: 5n,
    maxHp: 36n,
    baseDamage: 8n,
    xpReward: 38n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(
    sootboundMystic,
    'sootbound_mystic',
    'Sootbound Mystic',
    'support',
    'magic',
    'cinder hex, ember veil'
  );
  addRoleTemplate(
    sootboundMystic,
    'sootbound_seer',
    'Sootbound Seer',
    'support',
    'magic',
    'seer veil, ward'
  );
  addRoleTemplate(
    sootboundMystic,
    'sootbound_flayer',
    'Sootbound Flayer',
    'dps',
    'magic',
    'flay, hex'
  );

  const emberPriest = addEnemyTemplate({
    id: 0n,
    name: 'Ember Priest',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'dungeon',
    creatureType: 'humanoid',
    timeOfDay: 'any',
    socialGroup: 'humanoid',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 11n,
    level: 5n,
    maxHp: 38n,
    baseDamage: 6n,
    xpReward: 36n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(emberPriest, 'ember_priest', 'Ember Priest', 'healer', 'support', 'ashen mend, warding flame');
  addRoleTemplate(emberPriest, 'ember_priest_zealot', 'Ember Priest Zealot', 'dps', 'magic', 'zeal, flame');

  const ashforgedRevenant = addEnemyTemplate({
    id: 0n,
    name: 'Ashforged Revenant',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'dungeon',
    creatureType: 'undead',
    timeOfDay: 'any',
    socialGroup: 'undead',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 12n,
    level: 6n,
    maxHp: 48n,
    baseDamage: 10n,
    xpReward: 44n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(
    ashforgedRevenant,
    'ashforged_revenant',
    'Ashforged Revenant',
    'dps',
    'melee',
    'searing cleave, molten strike'
  );
  addRoleTemplate(
    ashforgedRevenant,
    'ashforged_bulwark',
    'Ashforged Bulwark',
    'tank',
    'melee',
    'bulwark, cleave'
  );
}

spacetimedb.init((ctx) => {
  syncAllContent(ctx);

  ensureHealthRegenScheduled(ctx);
  ensureEffectTickScheduled(ctx);
  ensureHotTickScheduled(ctx);
  ensureCastTickScheduled(ctx);
  ensureDayNightTickScheduled(ctx);
  ensureHungerDecayScheduled(ctx);
});

spacetimedb.clientConnected((ctx) => {
  const existing = ctx.db.player.id.find(ctx.sender);
  if (!existing) {
    ctx.db.player.insert({
      id: ctx.sender,
      createdAt: ctx.timestamp,
      lastSeenAt: ctx.timestamp,
      displayName: undefined,
      activeCharacterId: undefined,
      userId: undefined,
    });
  } else {
    ctx.db.player.id.update({ ...existing, lastSeenAt: ctx.timestamp });
  }
  ensureHealthRegenScheduled(ctx);
  ensureEffectTickScheduled(ctx);
  ensureHotTickScheduled(ctx);
  ensureCastTickScheduled(ctx);
  ensureDayNightTickScheduled(ctx);
  ensureHungerDecayScheduled(ctx);
});

spacetimedb.clientDisconnected((_ctx) => {
  // Presence events are written here so others see logout.
  // Note: _ctx.sender is still available in disconnect.
  const ctx = _ctx as any;
  const player = ctx.db.player.id.find(ctx.sender);
  if (player) {
    ctx.db.player.id.update({ ...player, lastSeenAt: ctx.timestamp });
  }

  if (player) {
    const disconnectAtMicros = ctx.timestamp.microsSinceUnixEpoch;
    ctx.db.disconnectLogoutTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(disconnectAtMicros + 30_000_000n),
      playerId: player.id,
      disconnectAtMicros,
    });
  }
});

const STANDING_PER_KILL = 10n;
const RIVAL_STANDING_PENALTY = 5n;

function mutateStanding(ctx: any, characterId: bigint, factionId: bigint, delta: bigint) {
  const rows = [...ctx.db.factionStanding.by_character.filter(characterId)];
  const existing = rows.find((row: any) => row.factionId === factionId);
  if (existing) {
    ctx.db.factionStanding.id.update({ ...existing, standing: existing.standing + delta });
  } else {
    ctx.db.factionStanding.insert({ id: 0n, characterId, factionId, standing: delta });
  }
}

function grantFactionStandingForKill(ctx: any, character: any, enemyTemplateId: bigint) {
  const template = ctx.db.enemyTemplate.id.find(enemyTemplateId);
  if (!template?.factionId) return;
  const faction = ctx.db.faction.id.find(template.factionId);
  if (!faction) return;
  mutateStanding(ctx, character.id, faction.id, STANDING_PER_KILL);
  logPrivateAndGroup(
    ctx,
    character,
    'faction',
    `You gained ${STANDING_PER_KILL} standing with ${faction.name}.`,
    `${character.name} gained ${STANDING_PER_KILL} standing with ${faction.name}.`
  );
  if (faction.rivalFactionId) {
    mutateStanding(ctx, character.id, faction.rivalFactionId, -RIVAL_STANDING_PENALTY);
    const rivalFaction = ctx.db.faction.id.find(faction.rivalFactionId);
    if (rivalFaction) {
      logPrivateAndGroup(
        ctx,
        character,
        'faction',
        `You lost ${RIVAL_STANDING_PENALTY} standing with ${rivalFaction.name}.`,
        `${character.name} lost ${RIVAL_STANDING_PENALTY} standing with ${rivalFaction.name}.`
      );
    }
  }
}

const reducerDeps = {
  spacetimedb,
  t,
  SenderError,
  ScheduleAt,
  Timestamp,
  Character,
  Hunger,
  HungerDecayTick,
  HUNGER_DECAY_INTERVAL_MICROS,
  GroupMember,
  GroupInvite,
  CombatParticipant,
  CombatLoopTick,
  PullState,
  PullTick,
  HealthRegenTick,
  EffectTick,
  HotTick,
  CastTick,
  DayNightTick,
  DisconnectLogoutTick,
  CharacterLogoutTick,
  ResourceGatherTick,
  ResourceRespawnTick,
  EnemyRespawnTick,
  TradeSession,
  TradeItem,
  EnemyAbility,
  CombatEnemyCooldown,
  CombatEnemyCast,
  CombatPendingAdd,
  AggroEntry,
  requirePlayerUserId,
  requireCharacterOwnedBy,
  findCharacterByName,
  friendUserIds,
  appendPrivateEvent,
  appendSystemMessage,
  fail,
  appendNpcDialog,
  appendGroupEvent,
  logPrivateAndGroup,
  appendPrivateAndGroupEvent,
  appendLocationEvent,
  ensureSpawnsForLocation,
  ensureAvailableSpawn,
  computeEnemyStats,
  activeCombatIdForCharacter,
  scheduleCombatTick,
  recomputeCharacterDerived,
  executeAbilityAction,
  isClassAllowed,
  RACE_DATA,
  isArmorAllowedForClass,
  normalizeArmorType,
  EQUIPMENT_SLOTS,
  ARMOR_TYPES_WITH_NONE,
  computeBaseStats,
  manaStatForClass,
  baseArmorForClass,
  BASE_HP,
  HP_STR_MULTIPLIER,
  BASE_MANA,
  abilityCooldownMicros,
  abilityCastMicros,
  enemyAbilityCastMicros,
  enemyAbilityCooldownMicros,
  grantStarterItems,
  areLocationsConnected,
  sumCharacterEffect,
  sumEnemyEffect,
  applyArmorMitigation,
  spawnEnemy,
  spawnEnemyWithTemplate,
  getEquippedWeaponStats,
  addItemToInventory,
  removeItemFromInventory,
  getItemCount,
  getGatherableResourceTemplates,
  ensureStarterItemTemplates,
  ensureResourceItemTemplates,
  ensureFoodItemTemplates,
  ensureHungerDecayScheduled,
  ensureLootTables,
  ensureVendorInventory,
  ensureAbilityTemplates,
  ensureRecipeTemplates,
  ensureNpcs,
  ensureQuestTemplates,
  ensureEnemyTemplatesAndRoles,
  ensureEnemyAbilities,
  ensureWorldLayout,
  ensureLocationEnemyTemplates,
  ensureLocationRuntimeBootstrap,
  syncAllContent,
  spawnResourceNode,
  ensureResourceNodesForLocation,
  respawnResourceNodesForLocation,
  awardCombatXp,
  xpRequiredForLevel,
  MAX_LEVEL,
  applyDeathXpPenalty,
  rollAttackOutcome,
  hasShieldEquipped,
  canParry,
  getGroupParticipants,
  isGroupLeaderOrSolo,
  effectiveGroupId,
  effectiveGroupKey,
  getGroupOrSoloParticipants,
  requirePullerOrLog,
  getInventorySlotCount,
  hasInventorySpace,
  usesMana,
  Faction,
  FactionStanding,
  grantFactionStandingForKill,
  UiPanelLayout,
};

reducerDeps.startCombatForSpawn = (
  ctx: any,
  leader: any,
  spawnToUse: any,
  participants: any[],
  groupId: bigint | null
) => startCombatForSpawn(reducerDeps, ctx, leader, spawnToUse, participants, groupId);

registerReducers(reducerDeps);


















