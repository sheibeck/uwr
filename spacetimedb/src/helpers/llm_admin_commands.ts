// ============================================================================
// LLM admin console commands (Phase 43, OPS-02 and COST-03)
// ============================================================================
//
// /llm stats, /llm on, /llm off and /llm ceiling <dollars>, typed in the
// narrative input and dispatched from submit_command. This is a reducer path
// and not a view: views may only use index lookups and llm_call_log has no route
// or time index (PLANNING-NOTES item 1). The reducer scans llm_call_log once and
// writes one plain-text system event to the admin's console.
//
// Output is plain text: the console renders with v-html and turns [text] into a
// link, so no '[' or '<' is ever printed. Only route names, counts, money and
// latency are shown; no identity, prompt, reply or key material is read.
//
// The admin check is ADMIN_IDENTITIES membership on ctx.sender, answered with an
// in-voice refusal through fail(). The throwing admin guard is wrong for the
// slash path (it raises a SenderError), so it is deliberately not used here.
// ============================================================================

import { ADMIN_IDENTITIES } from '../data/admin';
import { LLM_ROUTE_NAMES } from '../data/llm_routes';
import { fail, appendPrivateEvent } from './events';
import { dailyCeilingProblem, llmGate, setDailyCeiling, setLlmEnabled } from './llm_admin_state';
import { getPhaseLedger, ledgerDaySpent, utcDay } from './llm_budget';
import { aggregateLlmStats, formatLlmStatsText, formatMicroUsd, type LlmLedgerSummary } from './llm_stats';

/** What a non-admin hears. The Keeper is he/his. */
export const LLM_ADMIN_REFUSAL_LINE = 'The Keeper does not discuss his accounts with you.';

export const LLM_COMMAND_USAGE = 'Usage: /llm stats, /llm on, /llm off, /llm ceiling 12.50';

export type LlmCommand =
  | { verb: 'stats' }
  | { verb: 'on' }
  | { verb: 'off' }
  | { verb: 'ceiling'; arg: string }
  | { verb: 'help' };

/**
 * Parse "/llm ..." text. Returns null when the text is not an /llm command at all
 * ("/llmx", "llm stats", other slash commands). Anything that is /llm but not a
 * well-formed stats, on, off or ceiling form is 'help'.
 */
export function parseLlmCommand(text: string): LlmCommand | null {
  const trimmed = String(text ?? '').trim();
  if (!/^\/llm(?:\s|$)/i.test(trimmed)) return null;
  const tokens = trimmed.split(/\s+/).slice(1);
  const verb = tokens[0]?.toLowerCase();
  if ((verb === 'stats' || verb === 'on' || verb === 'off') && tokens.length === 1) return { verb };
  if (verb === 'ceiling' && tokens.length === 2) return { verb: 'ceiling', arg: tokens[1] };
  return { verb: 'help' };
}

/**
 * Whole dollars with up to two decimals to micro-USD, by string and bigint math
 * only. Anything else (exponent, sign, three decimals, more than four digits,
 * blank) is null.
 */
export function parseDollarsToMicroUsd(text: string): bigint | null {
  const match = /^(\d{1,4})(?:\.(\d{1,2}))?$/.exec(String(text ?? ''));
  if (!match) return null;
  const cents = (match[2] ?? '').padEnd(2, '0');
  return BigInt(match[1]) * 1_000_000n + BigInt(cents) * 10_000n;
}

/** The whole /llm stats block: one scan of llm_call_log plus the two singletons. */
export function buildLlmStatsText(ctx: any): string {
  const rows = [...ctx.db.llm_call_log.iter()];
  const stats = aggregateLlmStats(rows, ctx.timestamp.microsSinceUnixEpoch, LLM_ROUTE_NAMES);
  const ledger = getPhaseLedger(ctx);
  const gate = llmGate(ctx);
  const summary: LlmLedgerSummary = {
    allTimeSpentMicroUsd: ledger?.spentMicroUsd ?? 0n,
    allTimeCalls: ledger?.calls ?? 0n,
    todaySpentMicroUsd: ledgerDaySpent(ledger, utcDay(ctx.timestamp)),
    reservedMicroUsd: ledger?.reservedMicroUsd ?? 0n,
    dailyCeilingMicroUsd: gate.ceilingMicroUsd,
    enabled: !gate.halted,
  };
  return formatLlmStatsText(stats, summary);
}

/**
 * Handle one submit_command text. Returns false when the text is not an /llm
 * command (nothing written), true when it was handled.
 */
export function handleLlmAdminCommand(ctx: any, character: any, text: string): boolean {
  const cmd = parseLlmCommand(text);
  if (!cmd) return false;

  // Admin is decided from ctx.sender only, never from the command text.
  if (!ADMIN_IDENTITIES.has(ctx.sender.toHexString())) {
    fail(ctx, character, LLM_ADMIN_REFUSAL_LINE);
    return true;
  }

  const say = (line: string) => appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', line);

  switch (cmd.verb) {
    case 'stats':
      say(buildLlmStatsText(ctx));
      return true;
    case 'off':
      setLlmEnabled(ctx, false);
      say('LLM calls are off. Players see the resting line; calls already in flight finish.');
      return true;
    case 'on':
      setLlmEnabled(ctx, true);
      say('LLM calls are on.');
      return true;
    case 'ceiling': {
      const micro = parseDollarsToMicroUsd(cmd.arg);
      if (micro === null) {
        fail(ctx, character, LLM_COMMAND_USAGE);
        return true;
      }
      const problem = dailyCeilingProblem(micro);
      if (problem) {
        fail(ctx, character, problem);
        return true;
      }
      setDailyCeiling(ctx, micro);
      say(`Daily LLM ceiling set to ${formatMicroUsd(micro)}.`);
      return true;
    }
    default:
      say(LLM_COMMAND_USAGE);
      return true;
  }
}
