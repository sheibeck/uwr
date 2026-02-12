import type { ViewDeps } from './types';

export const registerFactionViews = ({ spacetimedb, t, FactionStanding }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_faction_standings', public: true },
    t.array(FactionStanding.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player?.activeCharacterId) return [];
      return [...ctx.db.factionStanding.by_character.filter(player.activeCharacterId)];
    }
  );
};
