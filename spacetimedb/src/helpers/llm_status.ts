// ============================================================================
// Keeper-voice status lines for llm_job rows (Phase 40, pure module)
// ============================================================================
//
// The my_llm_jobs view attaches one of these to every row so the client never
// shows raw error text. Lines follow the NARRATOR_PREAMBLE tone (sardonic,
// weary) and never name a provider, an HTTP status, a key or any error internals.
// ============================================================================

/** Transient failures: worth waiting out. */
const TRANSIENT_CLASSES = new Set(['rate_limit', 'overloaded', 'server', 'timeout', 'network']);
/** Account-side failures: phrased without revealing what is wrong. */
const ACCOUNT_CLASSES = new Set(['auth', 'billing']);
/** The model produced something unusable. */
const MALFORMED_CLASSES = new Set([
  'truncated',
  'invalid_json',
  'schema_mismatch',
  'empty_output',
  'unexpected_stop',
  'bad_request',
]);

const FAILED_TRANSIENT =
  'The Keeper lost the thread mid-thought. Give it a moment and ask again.';
const FAILED_ACCOUNT =
  'The Keeper is indisposed, and no amount of poking from you will fix that. Try again later.';
const FAILED_REFUSAL =
  'The Keeper declined to narrate that one. Even omniscience has standards, apparently.';
const FAILED_MALFORMED =
  'The Keeper muttered something unusable. Ask again and hope for better diction.';
const FAILED_GENERIC = 'Something went wrong in the Keeper\'s archives. Try again shortly.';

/** Coarse, player-safe failure buckets exposed by my_llm_jobs in place of the raw class. */
export type PublicErrorBucket = 'transient' | 'unavailable' | 'declined' | 'failed';

/**
 * Map a raw failure class to a coarse public bucket (SEC-01). The raw class
 * ('auth', 'billing', ...) tells a player what is wrong with the operator's
 * account, so it must never leave the server; only this bucket does.
 * Returns undefined when there is no error.
 */
export function publicErrorBucket(errorCode: string | undefined | null): PublicErrorBucket | undefined {
  if (errorCode === undefined || errorCode === null || errorCode === '') return undefined;
  if (TRANSIENT_CLASSES.has(errorCode)) return 'transient';
  if (ACCOUNT_CLASSES.has(errorCode)) return 'unavailable';
  if (errorCode === 'refusal') return 'declined';
  return 'failed';
}

/**
 * A short in-voice line for a job's current state. Pure and deterministic:
 * identical arguments always give identical text. `route` is accepted so future
 * copy can vary by domain; the current lines are route-independent.
 */
export function keeperMessageForJob(
  status: string,
  errorCode: string | undefined,
  _route: string,
): string {
  switch (status) {
    case 'pending':
      return 'The Keeper has your request and will get to it, eventually.';
    case 'in_flight':
      return 'The Keeper is thinking. Try not to hover.';
    case 'received':
      return 'The Keeper has spoken and is now sorting out what he meant.';
    case 'completed':
      return 'The Keeper has had his say. Go and see.';
    case 'expired':
      return 'The Keeper lost interest and moved on. Ask again if you must.';
    case 'failed': {
      const code = errorCode ?? '';
      if (TRANSIENT_CLASSES.has(code)) return FAILED_TRANSIENT;
      if (ACCOUNT_CLASSES.has(code)) return FAILED_ACCOUNT;
      if (code === 'refusal') return FAILED_REFUSAL;
      if (MALFORMED_CLASSES.has(code)) return FAILED_MALFORMED;
      return FAILED_GENERIC;
    }
    default:
      return FAILED_GENERIC;
  }
}
