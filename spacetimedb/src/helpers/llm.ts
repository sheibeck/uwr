import { TimeDuration } from 'spacetimedb';

// Constants
export const DAILY_LLM_BUDGET = 50;

// UTC date string from SpacetimeDB timestamp (for budget reset comparison)
export function utcDateString(timestamp: any): string {
  const ms = Number(timestamp.microsSinceUnixEpoch / 1000n);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Check if player has remaining budget. Returns current count. Resets if date changed.
// MUST be called inside a reducer (transactional) to avoid race conditions.
export function checkBudget(ctx: any, playerId: any): { allowed: boolean; remaining: number } {
  const today = utcDateString(ctx.timestamp);
  const rows = [...ctx.db.llm_budget.by_player.filter(playerId)];
  const budget = rows[0];

  if (!budget) {
    // First ever call -- create budget row
    ctx.db.llm_budget.insert({ id: 0n, playerId, callCount: 0n, resetDate: today });
    return { allowed: true, remaining: DAILY_LLM_BUDGET };
  }

  if (budget.resetDate !== today) {
    // New day -- reset counter
    ctx.db.llm_budget.id.update({ ...budget, callCount: 0n, resetDate: today });
    return { allowed: true, remaining: DAILY_LLM_BUDGET };
  }

  const count = Number(budget.callCount);
  return { allowed: count < DAILY_LLM_BUDGET, remaining: DAILY_LLM_BUDGET - count };
}

// Increment budget counter. Called after successful LLM call only.
export function incrementBudget(ctx: any, playerId: any): void {
  const today = utcDateString(ctx.timestamp);
  const rows = [...ctx.db.llm_budget.by_player.filter(playerId)];
  const budget = rows[0];

  if (!budget) {
    ctx.db.llm_budget.insert({ id: 0n, playerId, callCount: 1n, resetDate: today });
    return;
  }

  ctx.db.llm_budget.id.update({
    ...budget,
    callCount: budget.callCount + 1n,
    resetDate: today,
  });
}

// Build Anthropic Messages API request body
export function buildAnthropicRequest(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1024,
): string {
  return JSON.stringify({
    model,
    max_tokens: maxTokens,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  });
}

// Parse Anthropic Messages API response. Returns { ok, text, usage, error }.
export function parseAnthropicResponse(responseText: string, responseOk: boolean): {
  ok: boolean;
  text: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } | null;
  error: string | null;
} {
  try {
    const body = JSON.parse(responseText);
    if (responseOk) {
      return {
        ok: true,
        text: body.content?.[0]?.text ?? '',
        usage: {
          inputTokens: body.usage?.input_tokens ?? 0,
          outputTokens: body.usage?.output_tokens ?? 0,
          cacheReadTokens: body.usage?.cache_read_input_tokens ?? 0,
        },
        error: null,
      };
    } else {
      return {
        ok: false,
        text: '',
        usage: null,
        error: body.error?.message ?? 'Unknown API error',
      };
    }
  } catch {
    return { ok: false, text: '', usage: null, error: 'Failed to parse API response' };
  }
}

/**
 * Shared Anthropic API caller for all procedures.
 * Handles request building, retries, response parsing, and usage logging.
 * Must be called OUTSIDE a transaction (ctx.http.fetch cannot overlap with ctx.withTx).
 */
export function callAnthropicApi(
  ctx: any,
  opts: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
    label: string; // for logging, e.g. "creation/race", "world-gen"
    maxAttempts?: number;
  }
): { ok: boolean; text: string; usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } | null; error: string | null } {
  const { apiKey, model, systemPrompt, userPrompt, maxTokens = 1024, label, maxAttempts = 2 } = opts;
  const requestBody = buildAnthropicRequest(model, systemPrompt, userPrompt, maxTokens);

  let responseText = '';
  let responseOk = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = ctx.http.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: requestBody,
        timeout: TimeDuration.fromMillis(60000),
      });
      responseText = response.text();
      responseOk = response.ok;
      if (responseOk) break;
      if (attempt < maxAttempts) {
        console.error(`[${label}] LLM attempt ${attempt} failed, retrying...`);
      }
    } catch (err: any) {
      console.error(`[${label}] LLM attempt ${attempt} threw: ${err?.message ?? err}`);
      if (attempt >= maxAttempts) {
        responseText = '';
        responseOk = false;
      }
    }
  }

  const parsed = parseAnthropicResponse(responseText, responseOk);
  if (parsed.usage) {
    console.log(`[${label}/${model}] LLM usage: input=${parsed.usage.inputTokens}, output=${parsed.usage.outputTokens}, cache_read=${parsed.usage.cacheReadTokens}`);
  }
  return parsed;
}
