import type { ViewDeps } from './types';

export const registerUiViews = ({ spacetimedb, t, UiPanelLayout }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_panel_layout', public: true },
    t.array(UiPanelLayout.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player || !player.activeCharacterId) return [];
      return [...ctx.db.ui_panel_layout.by_character.filter(player.activeCharacterId)];
    }
  );
};
