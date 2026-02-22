import { SenderError } from 'spacetimedb/server';
import { Character } from '../schema/tables';
import { appendPrivateEvent, appendLocationEvent, appendGroupEvent } from './events';
import {
  BASE_HP,
  HP_STR_MULTIPLIER,
  BASE_MANA,
  MANA_MULTIPLIER,
  HYBRID_MANA_MULTIPLIER,
  HYBRID_MANA_CLASSES,
  baseArmorForClass,
  manaStatForClass,
  usesMana,
  normalizeClassName,
} from '../data/class_stats';
import { getEquippedBonuses } from './items';
import { effectiveGroupId } from './group';
import { statOffset, CHA_VENDOR_SCALE, CHA_VENDOR_SELL_SCALE } from '../data/combat_scaling.js';

export function getGroupParticipants(ctx: any, character: any, sameLocation: boolean = true) {
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

export function isGroupLeaderOrSolo(ctx: any, character: any) {
  const groupId = effectiveGroupId(character);
  if (!groupId) return true;
  const group = ctx.db.group.id.find(groupId);
  return !!group && group.leaderCharacterId === character.id;
}

export function partyMembersInLocation(ctx: any, character: any) {
  const groupId = effectiveGroupId(character);
  if (!groupId) return [character];
  const members: any[] = [];
  for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
    const memberChar = ctx.db.character.id.find(member.characterId);
    if (memberChar && memberChar.locationId === character.locationId) {
      members.push(memberChar);
    }
  }
  if (!members.find((row) => row.id === character.id)) members.unshift(character);
  return members;
}

export function recomputeCharacterDerived(ctx: any, character: any) {
  const gear = getEquippedBonuses(ctx, character.id);

  // Import sumCharacterEffect from combat - need to handle circular dependency
  // For now, we'll compute effect stats inline
  let strEffect = 0n, dexEffect = 0n, chaEffect = 0n, wisEffect = 0n, intEffect = 0n;
  for (const effect of ctx.db.characterEffect.by_character.filter(character.id)) {
    if (effect.effectType === 'str_bonus') strEffect += BigInt(effect.magnitude);
    if (effect.effectType === 'dex_bonus') dexEffect += BigInt(effect.magnitude);
    if (effect.effectType === 'cha_bonus') chaEffect += BigInt(effect.magnitude);
    if (effect.effectType === 'wis_bonus') wisEffect += BigInt(effect.magnitude);
    if (effect.effectType === 'int_bonus') intEffect += BigInt(effect.magnitude);
  }

  const totalStats = {
    str: character.str + gear.str + strEffect,
    dex: character.dex + gear.dex + dexEffect,
    cha: character.cha + gear.cha + chaEffect,
    wis: character.wis + gear.wis + wisEffect,
    int: character.int + gear.int + intEffect,
  };

  // Read racial bonus columns (optional — default to 0n if not set)
  const racialMaxHp = character.racialMaxHp ?? 0n;
  const racialMaxMana = character.racialMaxMana ?? 0n;
  const racialCritBonus = character.racialCritBonus ?? 0n;
  const racialArmorBonus = character.racialArmorBonus ?? 0n;
  const racialDodgeBonus = character.racialDodgeBonus ?? 0n;
  const racialHitBonus = character.racialHitBonus ?? 0n;
  const racialParryBonus = character.racialParryBonus ?? 0n;
  const racialPerceptionBonus = character.racialPerceptionBonus ?? 0n;
  const racialMaxStamina = character.racialMaxStamina ?? 0n;

  const manaStat = manaStatForClass(character.className, totalStats);
  const maxHp = BASE_HP + totalStats.str * HP_STR_MULTIPLIER + gear.hpBonus + racialMaxHp;
  const manaMultiplier = HYBRID_MANA_CLASSES.has(normalizeClassName(character.className))
    ? HYBRID_MANA_MULTIPLIER
    : MANA_MULTIPLIER;
  const maxMana = usesMana(character.className)
    ? BASE_MANA + manaStat * manaMultiplier + gear.manaBonus + racialMaxMana
    : 0n;
  const maxStamina = 20n + racialMaxStamina;

  const hitChance = totalStats.dex * 15n + racialHitBonus;
  const dodgeChance = totalStats.dex * 5n + racialDodgeBonus;
  const parryChance = totalStats.dex * 4n + racialParryBonus;
  const critMelee = totalStats.dex * 12n + racialCritBonus;
  const critRanged = totalStats.dex * 12n + racialCritBonus;
  const critDivine = totalStats.wis * 12n;
  const critArcane = totalStats.int * 12n;

  // Compute AC bonus inline to avoid circular dependency with combat helper
  let acBonus = 0n;
  for (const effect of ctx.db.characterEffect.by_character.filter(character.id)) {
    if (effect.effectType === 'ac_bonus') acBonus += BigInt(effect.magnitude);
  }

  const armorClass = baseArmorForClass(character.className) + gear.armorClassBonus + acBonus + racialArmorBonus;
  const perception = totalStats.wis * 25n + racialPerceptionBonus;
  const search = totalStats.int * 25n;
  const ccPower = totalStats.cha * 15n;
  // Symmetric CHA formula: (cha - 10) * scale, clamped to 0 (no penalty, just no bonus)
  const vendorBuyModRaw  = statOffset(totalStats.cha, CHA_VENDOR_SCALE);
  const vendorSellModRaw = statOffset(totalStats.cha, CHA_VENDOR_SELL_SCALE);
  const vendorBuyMod  = vendorBuyModRaw  < 0n ? 0n : vendorBuyModRaw;
  const vendorSellMod = vendorSellModRaw < 0n ? 0n : vendorSellModRaw;

  const updated = {
    ...character,
    maxHp,
    maxMana,
    maxStamina,
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

export function isClassAllowed(allowedClasses: string, className: string) {
  if (!allowedClasses || allowedClasses.trim().length === 0) return true;
  const normalized = normalizeClassName(className);
  const allowed = allowedClasses
    .split(',')
    .map((entry) => normalizeClassName(entry))
    .filter((entry) => entry.length > 0);
  if (allowed.includes('any')) return true;
  return allowed.includes(normalized);
}

export function campCharacter(ctx: any, player: any, character: any, afk = false) {
  appendLocationEvent(ctx, character.locationId, 'system', `${character.name} heads to camp.`, character.id);

  if (character.groupId) {
    const groupId = character.groupId;
    for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
      if (member.characterId === character.id) { ctx.db.groupMember.id.delete(member.id); break; }
    }
    ctx.db.character.id.update({ ...character, groupId: undefined });
    appendGroupEvent(ctx, groupId, character.id, 'group',
      afk ? `${character.name} headed to camp (AFK).` : `${character.name} headed to camp.`);

    const remaining = [...ctx.db.groupMember.by_group.filter(groupId)];
    if (remaining.length === 0) {
      for (const invite of ctx.db.groupInvite.by_group.filter(groupId)) {
        ctx.db.groupInvite.id.delete(invite.id);
      }
      ctx.db.group.id.delete(groupId);
    } else {
      const group = ctx.db.group.id.find(groupId);
      if (group && group.leaderCharacterId === character.id) {
        const newLeader = ctx.db.character.id.find(remaining[0].characterId);
        if (newLeader) {
          ctx.db.group.id.update({
            ...group,
            leaderCharacterId: newLeader.id,
            pullerCharacterId: group.pullerCharacterId === character.id ? newLeader.id : group.pullerCharacterId,
          });
          ctx.db.groupMember.id.update({ ...remaining[0], role: 'leader' });
          appendGroupEvent(ctx, groupId, newLeader.id, 'group', `${newLeader.name} is now the group leader.`);
        }
      }
    }
  }

  ctx.db.player.id.update({ ...player, activeCharacterId: undefined, lastActivityAt: undefined });
}

export function friendUserIds(ctx: any, userId: bigint): bigint[] {
  const ids: bigint[] = [];
  for (const row of ctx.db.friend.by_user.filter(userId)) {
    ids.push(row.friendUserId);
  }
  return ids;
}

export function findCharacterByName(ctx: any, name: string) {
  let found: any | null = null;
  for (const row of ctx.db.character.iter()) {
    if (row.name.toLowerCase() === name.toLowerCase()) {
      if (found) throw new SenderError('Multiple characters share that name');
      found = row;
    }
  }
  return found;
}

export function autoRespawnDeadCharacter(ctx: any, character: any): void {
  // Clear character effects
  for (const effect of ctx.db.characterEffect.by_character.filter(character.id)) {
    ctx.db.characterEffect.id.delete(effect.id);
  }
  // Clear travel cooldowns — death is penalty enough
  for (const cd of ctx.db.travelCooldown.by_character.filter(character.id)) {
    ctx.db.travelCooldown.id.delete(cd.id);
  }
  const nextLocationId = character.boundLocationId ?? character.locationId;
  const respawnLocation = ctx.db.location.id.find(nextLocationId)?.name ?? 'your bind point';
  ctx.db.character.id.update({
    ...character,
    locationId: nextLocationId,
    hp: 1n,
    mana: character.maxMana > 0n ? 1n : 0n,
    stamina: character.maxStamina > 0n ? 1n : 0n,
  });
  appendPrivateEvent(
    ctx,
    character.id,
    character.ownerUserId,
    'combat',
    `You awaken at ${respawnLocation}, shaken but alive.`
  );
  // Notify about corpse location(s)
  const corpses = [...ctx.db.corpse.by_character.filter(character.id)];
  if (corpses.length > 0) {
    const locationNames = corpses.map((c: any) => {
      const loc = ctx.db.location.id.find(c.locationId);
      return loc?.name ?? 'unknown';
    });
    const unique = [...new Set(locationNames)];
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      `You have ${corpses.length} corpse(s) containing your belongings at: ${unique.join(', ')}.`
    );
  }
}
