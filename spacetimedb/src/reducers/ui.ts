export const registerUiReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    UiPanelLayout,
    requireCharacterOwnedBy,
    fail,
  } = deps;

  spacetimedb.reducer(
    'save_panel_layout',
    { characterId: t.u64(), panelStatesJson: t.string() },
    (ctx: any, { characterId, panelStatesJson }: { characterId: bigint; panelStatesJson: string }) => {
      const character = requireCharacterOwnedBy(ctx, characterId);

      if (!panelStatesJson || panelStatesJson.length === 0) {
        fail(ctx, character, 'Panel states JSON cannot be empty');
        return;
      }
      if (panelStatesJson.length > 10000) {
        fail(ctx, character, 'Panel states JSON exceeds maximum size');
        return;
      }

      // Find existing layout row for this character
      const existing = [...ctx.db.ui_panel_layout.by_character.filter(characterId)][0];

      if (existing) {
        // Update existing row
        ctx.db.ui_panel_layout.id.update({
          ...existing,
          panelStatesJson,
          updatedAt: ctx.timestamp,
        });
      } else {
        // Insert new row
        ctx.db.ui_panel_layout.insert({
          id: 0n,
          characterId,
          panelStatesJson,
          updatedAt: ctx.timestamp,
        });
      }
    }
  );
};
