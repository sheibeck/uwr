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

// === Provider abstraction ===
// Set to 'openai' or 'anthropic'
export const LLM_PROVIDER: 'openai' | 'anthropic' = 'openai';

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

// Build OpenAI Chat Completions API request body
export function buildOpenAiRequest(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): string {
  return JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
}

// Parse Anthropic Messages API response
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

// Parse OpenAI Chat Completions API response
export function parseOpenAiResponse(responseText: string, responseOk: boolean): {
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
        text: body.choices?.[0]?.message?.content ?? '',
        usage: {
          inputTokens: body.usage?.prompt_tokens ?? 0,
          outputTokens: body.usage?.completion_tokens ?? 0,
          cacheReadTokens: 0,
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
 * Shared LLM API caller for all procedures.
 * Supports Anthropic and OpenAI backends via LLM_PROVIDER constant.
 * Handles request building, retries, response parsing, and usage logging.
 * Must be called OUTSIDE a transaction (ctx.http.fetch cannot overlap with ctx.withTx).
 */
export function callLlmApi(
  ctx: any,
  opts: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
    label: string;
    maxAttempts?: number;
  }
): { ok: boolean; text: string; usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } | null; error: string | null } {
  const { apiKey, model, systemPrompt, userPrompt, maxTokens = 1024, label, maxAttempts = 6 } = opts;

  const isOpenAi = LLM_PROVIDER === 'openai';
  const requestBody = isOpenAi
    ? buildOpenAiRequest(model, systemPrompt, userPrompt)
    : buildAnthropicRequest(model, systemPrompt, userPrompt, maxTokens);
  const url = isOpenAi
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.anthropic.com/v1/messages';
  const headers: Record<string, string> = isOpenAi
    ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }
    : { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };

  let responseText = '';
  let responseOk = false;

  console.log(`[${label}] Starting LLM call, provider=${LLM_PROVIDER}, model=${model}, url=${url}, body_len=${requestBody.length}`);
  console.log(`[${label}] Headers: ${JSON.stringify(Object.keys(headers))}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[${label}] Attempt ${attempt}/${maxAttempts} starting...`);
    try {
      const response = ctx.http.fetch(url, {
        method: 'POST',
        headers,
        body: requestBody,
        timeout: TimeDuration.fromMillis(60000),
      });
      console.log(`[${label}] Attempt ${attempt} got response, ok=${response.ok}, status=${response.status}`);
      responseText = response.text();
      responseOk = response.ok;
      if (responseOk) {
        console.log(`[${label}] Attempt ${attempt} success, response_len=${responseText.length}`);
        break;
      }
      console.error(`[${label}] Attempt ${attempt} failed, ok=${responseOk}, body=${responseText.slice(0, 500)}`);
      if (attempt >= maxAttempts) {
        console.error(`[${label}] No retries left`);
      }
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      const errStack = err?.stack ?? 'no stack';
      console.error(`[${label}] Attempt ${attempt} threw: ${errMsg}`);
      console.error(`[${label}] Stack: ${errStack}`);
      if (attempt >= maxAttempts) {
        responseText = '';
        responseOk = false;
      }
    }
  }

  const parsed = isOpenAi
    ? parseOpenAiResponse(responseText, responseOk)
    : parseAnthropicResponse(responseText, responseOk);
  if (parsed.usage) {
    console.log(`[${label}/${model}] LLM usage: input=${parsed.usage.inputTokens}, output=${parsed.usage.outputTokens}, cache_read=${parsed.usage.cacheReadTokens}`);
  }
  if (!parsed.ok) {
    console.error(`[${label}] Final result: FAILED, error=${parsed.error}, responseText_len=${responseText.length}`);
  }
  return parsed;
}
