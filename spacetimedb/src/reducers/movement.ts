export const registerMovementReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    requireCharacterOwnedBy,
    areLocationsConnected,
    appendPrivateEvent,
    appendLocationEvent,
    ensureSpawnsForLocation,
  } = deps;

  spacetimedb.reducer('move_character', { characterId: t.u64(), locationId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const location = ctx.db.location.id.find(args.locationId);
    if (!location) throw new SenderError('Location not found');
    if (character.locationId === location.id) return;
    if (!areLocationsConnected(ctx, character.locationId, location.id)) {
      throw new SenderError('Location not connected');
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

    if (character.groupId) {
      const group = ctx.db.group.id.find(character.groupId);
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
    }

    moveOne(character);
  });
};
