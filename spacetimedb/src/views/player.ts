import type { ViewDeps } from './types';

export const registerPlayerViews = ({ spacetimedb, t, Player }: ViewDeps) => {
  spacetimedb.view({ name: 'my_player', public: true }, t.array(Player.rowType), (ctx: any) => {
    const player = ctx.db.player.id.find(ctx.sender);
    return player ? [player] : [];
  });
};
