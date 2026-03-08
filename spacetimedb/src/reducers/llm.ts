import { checkBudget } from '../helpers/llm';

export const registerLlmReducers = (deps: any) => {
  const { spacetimedb, t, SenderError, requireAdmin, requireCharacterOwnedBy, fail } = deps;

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

  // Validate and create a pending LLM request.
  // Client calls this FIRST, then watches for the pending request, then calls the procedure.
  spacetimedb.reducer('validate_llm_request', {
    characterId: t.u64(),
    domain: t.string(),
    model: t.string(),
    userPrompt: t.string(),
  }, (ctx: any, { characterId, domain, model, userPrompt }: { characterId: bigint; domain: string; model: string; userPrompt: string }) => {
    // 1. Verify character ownership
    const character = requireCharacterOwnedBy(ctx, characterId);

    // 2. Validate domain
    const validDomains = ['character_creation', 'world_gen', 'combat_narration', 'skill_gen', 'npc_conversation'];
    if (!validDomains.includes(domain)) {
      throw new SenderError(`Invalid domain: ${domain}`);
    }

    // 3. Validate model
    const validModels = ['gpt-5.4', 'gpt-5-mini'];
    if (!validModels.includes(model)) {
      throw new SenderError(`Invalid model: ${model}`);
    }

    // 4. Check API key is configured
    const config = ctx.db.llm_config.id.find(1n);
    if (!config || !config.apiKey) {
      fail(ctx, character, 'The Keeper is... absent. It seems no one has given it a voice yet.');
      return;
    }

    // 5. Check concurrency -- one active request per player at a time
    const existingRequests = [...ctx.db.llm_request.by_player.filter(ctx.sender)];
    const activeRequest = existingRequests.find((r: any) => r.status === 'pending' || r.status === 'processing');
    if (activeRequest) {
      fail(ctx, character, 'The Keeper is already considering something for you. Patience.');
      return;
    }

    // 6. Check budget (transactional -- safe from race conditions here in the reducer)
    const budget = checkBudget(ctx, ctx.sender);
    if (!budget.allowed) {
      fail(ctx, character, 'The Keeper grows weary of your demands. Return tomorrow.');
      return;
    }

    // 7. Create pending request
    ctx.db.llm_request.insert({
      id: 0n,
      playerId: ctx.sender,
      characterId,
      domain,
      model,
      userPrompt,
      status: 'pending',
      createdAt: ctx.timestamp,
    });
  });
};
