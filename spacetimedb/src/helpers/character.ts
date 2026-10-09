import { SenderError } from 'spacetimedb/server';
import { Character } from '../schema/tables';
import { appendPrivateEvent, appendLocationEvent, appendGroupEvent, activeCombatIdForCharacter } from './events';
import { cleanupDecayedCorpses } from './corpse';
import { deathPromptLine, RESPAWN_IN_COMBAT, RESPAWN_NOT_DEAD } from '../data/death_lines';
import { markLocationVisited } from './visited';
import { collapsePassageAfterLeaving } from './passages';
import { syncCharacterOnline } from './online';
import { settleGroupAfterLeave } from './group_invites';
import {
  BASE_HP,
  HP_STR_MULTIPLIER,
  BASE_MANA,
  MANA_MULTIPLIER,
  characterUsesResource,
  bestCasterStat,
} from '../data/class_stats';
import { isClassAllowed } from '../data/item_usability';
import { getEquippedBonuses } from './items';
import { effectiveGroupId } from './group';
import { statOffset, CHA_VENDOR_SCALE, CHA_VENDOR_SELL_SCALE } from '../data/combat_scaling.js';
import { RACE_DATA } from '../data/races';

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
  for (const member of ctx.db.group_member.by_group.filter(groupId)) {
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
  for (const effect of ctx.db.character_effect.by_character.filter(character.id)) {
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

  const maxHp = BASE_HP + totalStats.str * HP_STR_MULTIPLIER + gear.hpBonus + racialMaxHp;
  const hasManaAbilities = characterUsesResource(ctx, character.id, 'mana');
  const manaStat = hasManaAbilities ? bestCasterStat(totalStats) : 0n;
  const maxMana = hasManaAbilities
    ? BASE_MANA + manaStat * MANA_MULTIPLIER + gear.manaBonus + racialMaxMana
    : 0n;
  const maxStamina = 19n + racialMaxStamina + character.level + (character.level >= 50n ? 1n : 0n);

  const hitChance = totalStats.dex * 15n + racialHitBonus;
  const dodgeChance = totalStats.dex * 5n + racialDodgeBonus;
  const parryChance = totalStats.dex * 4n + racialParryBonus;
  const critMelee = totalStats.dex * 12n + racialCritBonus;
  const critRanged = totalStats.dex * 12n + racialCritBonus;
  const critDivine = totalStats.wis * 12n;
  const critArcane = totalStats.int * 12n;

  // Compute AC bonus inline to avoid circular dependency with combat helper
  let acBonus = 0n;
  for (const effect of ctx.db.character_effect.by_character.filter(character.id)) {
    if (effect.effectType === 'ac_bonus') acBonus += BigInt(effect.magnitude);
  }

  // Default base armor of 2n (cloth equivalent). Actual armor comes from equipped gear + effects.
  const armorClass = 2n + gear.armorClassBonus + acBonus + racialArmorBonus;
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
  const oldMaxStamina = character.maxStamina ?? 0n;
  const clampedStamina = maxStamina > oldMaxStamina
    ? maxStamina
    : (character.stamina > maxStamina ? maxStamina : character.stamina);
  ctx.db.character.id.update({
    ...updated,
    hp: clampedHp,
    mana: clampedMana,
    stamina: clampedStamina,
  });
}

// isClassAllowed lives in the import-free data module (shared with equip_item's canEquipItem and
// the client); re-exported here so existing imports keep working.
export { isClassAllowed };

export function campCharacter(ctx: any, player: any, character: any, afk = false) {
  appendLocationEvent(ctx, character.locationId, 'system', `${character.name} heads to camp.`, character.id);

  if (character.groupId) {
    const groupId = character.groupId;
    for (const member of ctx.db.group_member.by_group.filter(groupId)) {
      if (member.characterId === character.id) { ctx.db.group_member.id.delete(member.id); break; }
    }
    ctx.db.character.id.update({ ...character, groupId: undefined });
    const departure = afk ? `${character.name} headed to camp (AFK).` : `${character.name} headed to camp.`;
    appendGroupEvent(ctx, groupId, character.id, 'group', departure);

    // The shared rule with leave_group, kick and delete_character: successor (online first),
    // withdrawn invites, or the lone-group dissolve (WR-04, WR-05).
    settleGroupAfterLeave(ctx, groupId, character.id, departure);
  }

  ctx.db.player.id.update({ ...player, activeCharacterId: undefined, lastActivityAt: undefined });
  // Online status (51.1): offline unless another session still holds the character.
  syncCharacterOnline(ctx, character.id);
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

/**
 * Grant a race ability to a character at creation.
 * - Only grants for races present in RACE_DATA (LLM-generated custom races are skipped).
 * - Idempotent: checks for existing ability with same abilityKey before inserting.
 */
export function grantRaceAbility(ctx: any, character: any, raceData: any): void {
  // Only grant for races that exist in RACE_DATA (skip LLM-generated custom races)
  const isKnownRace = RACE_DATA.some(r => r.name === raceData.name);
  if (!isKnownRace) return;

  // Idempotency: check if character already has an ability with this abilityKey
  for (const existing of ctx.db.ability_template.by_character.filter(character.id)) {
    if (existing.abilityKey === raceData.abilityKey) return;
  }

  ctx.db.ability_template.insert({
    id: 0n,
    characterId: character.id,
    name: raceData.abilityName,
    description: raceData.abilityDescription,
    kind: raceData.abilityKind,
    targetRule: raceData.abilityTargetRule,
    resourceType: 'none',
    resourceCost: 0n,
    castSeconds: 0n,
    cooldownSeconds: raceData.abilityCooldownSeconds,
    scaling: 'none',
    value1: raceData.abilityValue,
    value2: undefined,
    damageType: undefined,
    effectType: raceData.abilityEffectType ?? undefined,
    effectMagnitude: raceData.abilityEffectMagnitude ?? undefined,
    effectDuration: raceData.abilityEffectDuration ?? undefined,
    levelRequired: 1n,
    isGenerated: false,
    source: 'Race',
    abilityKey: raceData.abilityKey,
  });
}

/** The name of the place a dead character would wake at: the bind point, else where he fell. */
export function respawnPlaceName(ctx: any, character: any): string {
  const nextLocationId = character.boundLocationId ?? character.locationId;
  return ctx.db.location.id.find(nextLocationId)?.name ?? 'your bind point';
}

/**
 * The death prompt with its clickable [respawn] (owner, 2026-10-09), written privately when the
 * character is dead and no fight holds him. Called after a fight in which he fell, when he comes back
 * in (set_active_character, a reconnect) and when the command is refused for being early. Returns
 * whether a line was written.
 */
export function promptRespawnIfDead(ctx: any, character: any): boolean {
  if (!character || character.hp > 0n) return false;
  if (activeCombatIdForCharacter(ctx, character.id)) return false;
  appendPrivateEvent(
    ctx,
    character.id,
    character.ownerUserId,
    'system',
    deathPromptLine(respawnPlaceName(ctx, character), ctx.timestamp.microsSinceUnixEpoch + character.id),
  );
  return true;
}

/**
 * Brings a dead character back at his bind point (else where he fell) with 1 hp, mana and stamina:
 * effects, pending casts and travel cooldowns cleared, the place marked visited, a passage he died in
 * collapsed once empty, and his corpses listed. The one path for the respawn_character reducer and the
 * typed respawn command. Refuses (with a private line, returning false) when he is alive or a fight
 * still holds him.
 */
export function respawnDeadCharacter(ctx: any, character: any): boolean {
  if (character.hp > 0n) {
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', RESPAWN_NOT_DEAD);
    return false;
  }
  if (activeCombatIdForCharacter(ctx, character.id)) {
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', RESPAWN_IN_COMBAT);
    return false;
  }

  // Clean up decayed corpses opportunistically
  cleanupDecayedCorpses(ctx);

  for (const effect of ctx.db.character_effect.by_character.filter(character.id)) {
    ctx.db.character_effect.id.delete(effect.id);
  }
  for (const cast of ctx.db.character_cast.by_character.filter(character.id)) {
    ctx.db.character_cast.id.delete(cast.id);
  }
  for (const cd of ctx.db.travel_cooldown.by_character.filter(character.id)) {
    ctx.db.travel_cooldown.id.delete(cd.id);
  }
  const nextLocationId = character.boundLocationId ?? character.locationId;
  const respawnLocation = respawnPlaceName(ctx, character);
  ctx.db.character.id.update({
    ...character,
    locationId: nextLocationId,
    hp: 1n,
    mana: character.maxMana > 0n ? 1n : 0n,
    stamina: character.maxStamina > 0n ? 1n : 0n,
  });
  // Visited places: the respawn place counts as stood in (no origin).
  markLocationVisited(ctx, character.id, nextLocationId);
  // A passage the character died in collapses once nobody is left in it.
  collapsePassageAfterLeaving(ctx, character.locationId, nextLocationId);
  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'combat', `You awaken at ${respawnLocation}, shaken but alive.`);

  const corpses = [...ctx.db.corpse.by_character.filter(character.id)];
  if (corpses.length > 0) {
    const locationNames = corpses.map((c: any) => ctx.db.location.id.find(c.locationId)?.name ?? 'unknown');
    const unique = [...new Set(locationNames)];
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      `You have ${corpses.length} corpse(s) containing your belongings at: ${unique.join(', ')}.`,
    );
  }

  if (character.groupId) {
    appendGroupEvent(ctx, character.groupId, character.id, 'combat', `${character.name} awakens at ${respawnLocation}, shaken but alive.`);
  }
  return true;
}

export function autoRespawnDeadCharacter(ctx: any, character: any): void {
  // Clear character effects
  for (const effect of ctx.db.character_effect.by_character.filter(character.id)) {
    ctx.db.character_effect.id.delete(effect.id);
  }
  // Clear travel cooldowns — death is penalty enough
  for (const cd of ctx.db.travel_cooldown.by_character.filter(character.id)) {
    ctx.db.travel_cooldown.id.delete(cd.id);
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
  // Visited places: the respawn place counts as stood in (no origin).
  markLocationVisited(ctx, character.id, nextLocationId);
  // A passage the character died in collapses once nobody is left in it.
  collapsePassageAfterLeaving(ctx, character.locationId, nextLocationId);
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
