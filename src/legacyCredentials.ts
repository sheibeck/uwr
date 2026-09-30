// ============================================================================
// Legacy LLM credential cleanup (Plan 42-02, SEC-03)
// ============================================================================
//
// Before Phase 42 the browser kept a proxy secret in localStorage under 'llm_proxy_secret'.
// LLM calls now run on the server, so the browser holds no LLM credential. Returning players
// may still have the old value stored, so every app load removes it.
//
// Removing a missing key does nothing, so no "already cleaned" flag is kept. Storage can be
// blocked or absent (private mode, node), so the call never throws. Nothing is shown to the
// player.
//
// The key name is written directly inside the removeItem(...) call: the dist bundle guard
// (scripts/check-bundle.mjs) allows exactly that one shape and fails on any other use.
// ============================================================================

/** Remove the retired proxy credential. Safe to call on every load; never throws. */
export function clearLegacyLlmCredential(storage?: Pick<Storage, 'removeItem'>): void {
  try {
    (storage ?? globalThis.localStorage).removeItem('llm_proxy_secret');
  } catch {
    // Storage blocked or absent: nothing to clear.
  }
}
