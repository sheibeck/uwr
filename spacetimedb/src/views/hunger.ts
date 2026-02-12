import type { ViewDeps } from './types';

export const registerHungerViews = ({ spacetimedb, t, Hunger }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_hunger', public: true },
    t.array(Hunger.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player || !player.activeCharacterId) return [];
      return [...ctx.db.hunger.characterId.filter(player.activeCharacterId)];
    }
  );
};
