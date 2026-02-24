import type { ViewDeps } from './types';

export const registerEventViews = ({ spacetimedb, t, EventLocation, EventPrivate }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_private_events', public: true },
    t.array(EventPrivate.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player || player.userId == null) return [];
      return [...ctx.db.event_private.by_owner_user.filter(player.userId)];
    }
  );

  spacetimedb.view(
    { name: 'my_location_events', public: true },
    t.array(EventLocation.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player?.activeCharacterId) return [];
      const character = ctx.db.character.id.find(player.activeCharacterId);
      if (!character) return [];
      const events = [...ctx.db.event_location.by_location.filter(character.locationId)];
      return events.filter(
        (event) => !event.excludeCharacterId || event.excludeCharacterId !== character.id
      );
    }
  );
};
