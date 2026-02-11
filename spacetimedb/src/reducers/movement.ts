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

    const moveOne = (row: typeof deps.Character.rowType) => {
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
    };

    const groupId = effectiveGroupId(character);
    if (!groupId || !isGroupLeaderOrSolo(ctx, character)) {
      moveOne(character);
      return;
    }
    const group = ctx.db.group.id.find(groupId);
    if (group && group.leaderCharacterId === character.id) {
      for (const member of ctx.db.groupMember.by_group.filter(group.id)) {
        if (!member.followLeader) continue;
        const memberCharacter = ctx.db.character.id.find(member.characterId);
        if (
          memberCharacter &&
          memberCharacter.locationId === originLocationId &&
          memberCharacter.locationId !== location.id
        ) {
          moveOne(memberCharacter);
        }
      }
      return;
    }

    moveOne(character);
  });
};
