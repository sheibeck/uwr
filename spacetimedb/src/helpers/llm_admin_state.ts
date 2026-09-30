// ============================================================================
// LLM admin state (Phase 41, pure module: duck-typed transaction)
// ============================================================================
//
// One private singleton row (id 1n) holds the key status and the last smoke
// result. It NEVER holds the key itself: the key lives only in llm_config.
//
// "Valid" is proven by a smoke test, not by the key being set: keyLastCheckOk
// and a keyVerifiedAt at or after keyUpdatedAt (a rotated key is unproven until
// the next smoke run). The executor clears keyLastCheckOk on any auth or billing
// failure and the smoke_test route sets it on success.
//
// Imports only data modules and ./measurement, so it loads in plain Node vitest.
// ============================================================================

import { LLM_ADMIN_STATE_ID, LLM_SMOKE_JSON_MAX_CHARS } from '../data/llm_limits';
import { redactSecrets } from './measurement';

/** The most code points of Claude's reply kept for the admin to see. */
export const LLM_SMOKE_REPLY_MAX_CODE_POINTS = 120;

export function getAdminState(tx: any): any | undefined {
  return tx.db.llm_admin_state.id.find(LLM_ADMIN_STATE_ID);
}

function ensureAdminState(tx: any): any {
  const existing = getAdminState(tx);
  if (existing) return existing;
  return tx.db.llm_admin_state.insert({
    id: LLM_ADMIN_STATE_ID,
    keySet: false,
    keyLength: 0n,
    keyLastCheckOk: false,
    lastSmokeJson: '{}',
  });
}

/** Insert the default row when absent, then apply the patch. Returns the updated row. */
export function patchAdminState(tx: any, patch: Record<string, unknown>): any {
  const row = ensureAdminState(tx);
  const next = { ...row, ...patch };
  tx.db.llm_admin_state.id.update(next);
  return next;
}

/** A passing check sets keyLastCheckOk and keyVerifiedAt now; a failing check clears keyLastCheckOk only. */
export function markKeyCheck(tx: any, ok: boolean): any {
  return ok
    ? patchAdminState(tx, { keyLastCheckOk: true, keyVerifiedAt: tx.timestamp })
    : patchAdminState(tx, { keyLastCheckOk: false });
}

export interface SmokeEntry {
  ok: boolean;
  class?: string;
  latencyMs: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  costMicroUsd: bigint | string;
  /** Kept only for the smoke_test route (cut to 120 code points). */
  reply?: string;
}

function parseSmoke(text: unknown): Record<string, unknown> {
  try {
    const v = JSON.parse(String(text ?? ''));
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const { truncated: _dropped, ...rest } = v as Record<string, unknown>;
      return rest;
    }
  } catch {
    // fall through: malformed stored JSON is replaced, never fatal
  }
  return {};
}

/**
 * Record one smoke result under its route (a later result for the same route
 * replaces the earlier one, so completion order does not matter). Every string
 * is redacted with the needles, and the whole JSON is kept at or under
 * LLM_SMOKE_JSON_MAX_CHARS: over the cap, only the newest entry plus
 * "truncated": true remains.
 */
export function recordSmokeResult(
  tx: any,
  route: string,
  entry: SmokeEntry,
  needles: readonly string[],
): any {
  const row = ensureAdminState(tx);
  const clean = (s: string): string => redactSecrets(s, needles);

  const stored: Record<string, unknown> = {
    ok: entry.ok === true,
    ...(entry.class !== undefined ? { class: clean(String(entry.class)) } : {}),
    latencyMs: entry.latencyMs,
    input: entry.input,
    output: entry.output,
    cacheWrite: entry.cacheWrite,
    cacheRead: entry.cacheRead,
    costMicroUsd: String(entry.costMicroUsd),
    atMicros: String(tx.timestamp.microsSinceUnixEpoch),
  };
  if (route === 'smoke_test' && typeof entry.reply === 'string') {
    // Redact first so a cut can never leave half a key, then cut by code point.
    stored.reply = [...clean(entry.reply)].slice(0, LLM_SMOKE_REPLY_MAX_CODE_POINTS).join('');
  }

  const merged = { ...parseSmoke(row.lastSmokeJson), [route]: stored };
  let json = clean(JSON.stringify(merged));
  if (json.length > LLM_SMOKE_JSON_MAX_CHARS) {
    json = clean(JSON.stringify({ [route]: stored, truncated: true }));
  }
  if (json.length > LLM_SMOKE_JSON_MAX_CHARS) json = '{"truncated":true}';

  const next = { ...row, lastSmokeJson: json, lastSmokeAt: tx.timestamp };
  tx.db.llm_admin_state.id.update(next);
  return next;
}

/** True only when the key is set, the last check passed, and it was verified at or after the key was last set. */
export function isKeyValid(state: any): boolean {
  if (!state || state.keySet !== true || state.keyLastCheckOk !== true || !state.keyVerifiedAt) return false;
  if (!state.keyUpdatedAt) return true;
  return state.keyVerifiedAt.microsSinceUnixEpoch >= state.keyUpdatedAt.microsSinceUnixEpoch;
}
