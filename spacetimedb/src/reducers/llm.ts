export const registerLlmReducers = (deps: any) => {
  const { spacetimedb, t, SenderError, requireAdmin } = deps;

  // Admin-only: Set or update the Anthropic API key
  spacetimedb.reducer('set_api_key', { apiKey: t.string() }, (ctx: any, { apiKey }: { apiKey: string }) => {
    requireAdmin(ctx);
    if (!apiKey || apiKey.trim().length === 0) {
      throw new SenderError('API key cannot be empty');
    }
    const existing = ctx.db.llm_config.id.find(1n);
    if (existing) {
      ctx.db.llm_config.id.update({ ...existing, apiKey: apiKey.trim(), updatedAt: ctx.timestamp });
    } else {
      ctx.db.llm_config.insert({ id: 1n, apiKey: apiKey.trim(), updatedAt: ctx.timestamp });
    }
  });
};
