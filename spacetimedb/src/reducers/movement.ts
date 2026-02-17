import { TRAVEL_CONFIG } from '../data/travel_config';
import { performPassiveSearch } from '../helpers/search';

export const registerMovementReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    requireCharacterOwnedBy,
    areLocationsConnected,
    activeCombatIdForCharacter,
    appendPrivateEvent,
    appendLocationEvent,
    ensureSpawnsForLocation,
    isGroupLeaderOrSolo,
    effectiveGroupId,
  } = deps;

  const fail = (ctx: any, character: any, message: string) => {
    deps.appendSystemMessage(ctx, character, message);
    return;
  };

  spacetimedb.reducer('move_character', { characterId: t.u64(), locationId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const location = ctx.db.location.id.find(args.locationId);
    if (!location) return fail(ctx, character, 'Location not found');
    if (character.locationId === location.id) return;
    if (activeCombatIdForCharacter(ctx, character.id)) {
      return fail(ctx, character, 'Cannot travel while in combat');
    }
    const activeGather = [...ctx.db.resourceGather.by_character.filter(character.id)][0];
    if (activeGather) {
      return fail(ctx, character, 'Cannot travel while gathering');
    }
    if (!areLocationsConnected(ctx, character.locationId, location.id)) {
      return fail(ctx, character, 'Location not connected');
    }

    const originLocationId = character.locationId;

    // Determine if travel crosses regions
    const fromLocation = ctx.db.location.id.find(character.locationId);
    const toLocation = location;
    const isCrossRegion = fromLocation!.regionId !== toLocation.regionId;
    const staminaCost = isCrossRegion ? TRAVEL_CONFIG.CROSS_REGION_STAMINA : TRAVEL_CONFIG.WITHIN_REGION_STAMINA;

    // Collect all traveling characters
    const travelingCharacters: (typeof deps.Character.rowType)[] = [];
    const groupId = effectiveGroupId(character);
    if (groupId && isGroupLeaderOrSolo(ctx, character)) {
      const group = ctx.db.group.id.find(groupId);
      if (group && group.leaderCharacterId === character.id) {
        // Group leader - add leader and following members at same location
        travelingCharacters.push(character);
        for (const member of ctx.db.groupMember.by_group.filter(group.id)) {
          if (!member.followLeader) continue;
          const memberCharacter = ctx.db.character.id.find(member.characterId);
          if (
            memberCharacter &&
            memberCharacter.locationId === originLocationId &&
            memberCharacter.locationId !== location.id
          ) {
            travelingCharacters.push(memberCharacter);
          }
        }
      } else {
        // Solo
        travelingCharacters.push(character);
      }
    } else {
      // Solo or follower (follower shouldn't move on their own, but handle as solo)
      travelingCharacters.push(character);
    }

    // Validate ALL-OR-NOTHING stamina
    for (const traveler of travelingCharacters) {
      if (traveler.stamina < staminaCost) {
        return fail(ctx, character, `${traveler.name} does not have enough stamina to travel`);
      }
    }

    // Check cross-region cooldown (only for cross-region travel)
    if (isCrossRegion) {
      for (const traveler of travelingCharacters) {
        const cooldowns = [...ctx.db.travelCooldown.by_character.filter(traveler.id)];
        const activeCooldown = cooldowns.find(cd => cd.readyAtMicros > ctx.timestamp.microsSinceUnixEpoch);
        if (activeCooldown) {
          const remainingSec = Number((activeCooldown.readyAtMicros - ctx.timestamp.microsSinceUnixEpoch) / 1_000_000n);
          return fail(ctx, character, `${traveler.name} cannot travel to another region yet (${remainingSec}s remaining)`);
        }
        // Clean up expired cooldowns opportunistically
        for (const cd of cooldowns) {
          if (cd.readyAtMicros <= ctx.timestamp.microsSinceUnixEpoch) {
            ctx.db.travelCooldown.id.delete(cd.id);
          }
        }
      }
    }

    // Deduct stamina and apply cooldowns
    for (const traveler of travelingCharacters) {
      ctx.db.character.id.update({ ...traveler, stamina: traveler.stamina - staminaCost });
      if (isCrossRegion) {
        const existingCd = [...ctx.db.travelCooldown.by_character.filter(traveler.id)][0];
        const readyAt = ctx.timestamp.microsSinceUnixEpoch + TRAVEL_CONFIG.CROSS_REGION_COOLDOWN_MICROS;
        if (existingCd) {
          ctx.db.travelCooldown.id.update({ ...existingCd, readyAtMicros: readyAt });
        } else {
          ctx.db.travelCooldown.insert({ id: 0n, characterId: traveler.id, readyAtMicros: readyAt });
        }
      }
    }

    // Execute movement for each character (re-read fresh row for location update)
    const moveOne = (charId: bigint) => {
      const row = ctx.db.character.id.find(charId)!;
      ctx.db.character.id.update({ ...row, locationId: location.id });
      appendPrivateEvent(
        ctx,
        row.id,
        row.ownerUserId,
        'move',
        `You travel to ${location.name}. ${location.description}`
      );
      appendLocationEvent(ctx, originLocationId, 'move', `${row.name} departs.`, row.id);
      appendLocationEvent(ctx, location.id, 'move', `${row.name} arrives.`, row.id);
      ensureSpawnsForLocation(ctx, location.id);
      performPassiveSearch(ctx, ctx.db.character.id.find(charId)!, location.id, appendPrivateEvent);
    };

    for (const traveler of travelingCharacters) {
      moveOne(traveler.id);
    }
  });
};
