export const registerUiReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    UiPanelLayout,
    requireCharacterOwnedBy,
  } = deps;

  spacetimedb.reducer(
    'save_panel_layout',
    { characterId: t.u64(), panelStatesJson: t.string() },
    (ctx: any, { characterId, panelStatesJson }: { characterId: bigint; panelStatesJson: string }) => {
      requireCharacterOwnedBy(ctx, characterId);

      if (!panelStatesJson || panelStatesJson.length === 0) {
        throw new SenderError('Panel states JSON cannot be empty');
      }
      if (panelStatesJson.length > 10000) {
        throw new SenderError('Panel states JSON exceeds maximum size');
      }

      // Find existing layout row for this character
      const existing = [...ctx.db.uiPanelLayout.by_character.filter(characterId)][0];

      if (existing) {
        // Update existing row
        ctx.db.uiPanelLayout.id.update({
          ...existing,
          panelStatesJson,
          updatedAt: ctx.timestamp,
        });
      } else {
        // Insert new row
        ctx.db.uiPanelLayout.insert({
          id: 0n,
          characterId,
          panelStatesJson,
          updatedAt: ctx.timestamp,
        });
      }
    }
  );
};
