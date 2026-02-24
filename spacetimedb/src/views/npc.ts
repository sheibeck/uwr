import type { ViewDeps } from './types';

export const registerNpcViews = ({ spacetimedb, t, NpcDialog }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_npc_dialog', public: true },
    t.array(NpcDialog.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player?.activeCharacterId) return [];
      return [...ctx.db.npc_dialog.by_character.filter(player.activeCharacterId)];
    }
  );
};
