import { performTravel, travelDeps } from '../helpers/travel';

export const registerMovementReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    requireCharacterOwnedBy,
  } = deps;

  spacetimedb.reducer('move_character', { characterId: t.u64(), locationId: t.u64() }, (ctx: any, args: any) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const _player = ctx.db.player.id.find(ctx.sender);
    if (_player) {
      ctx.db.player.id.update({ ..._player, lastActivityAt: ctx.timestamp });
    }

    performTravel(ctx, travelDeps(deps), character, args.locationId);
  });
};
