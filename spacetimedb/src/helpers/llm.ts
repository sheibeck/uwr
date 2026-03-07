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

