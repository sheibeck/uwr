// Pure rules for the local live-proof harness (Plan 41-15, OPS-01). No I/O, no SDK, no secrets.
// The harness (prove-live.live.ts) imports these; tests live in proof_rules.test.mjs.

/** The live-proof steps, in the order the harness runs them (one real action per domain). */
export const PROOF_STEPS = Object.freeze([
  'smoke',
  'creation_race',
  'creation_class',
  'world_gen',
  'npc_conversation',
  'combat_narration',
  'renown_perk_gen',
  'skill_gen',
]);

/** The harness stops before any paid step that would bring spent + reserved within this of the cap ($0.20). */
export const PROOF_SPEND_MARGIN_MICRO_USD = 200_000n;

/** Longest piece of player-visible text the harness prints or records. */
export const PROOF_EXCERPT_MAX = 120;

/**
 * True when the next paid step must not start: spent + reserved has reached (cap - margin).
 * At cap - margin - 1 it is false; at exactly cap - margin it is true. Accepts bigint or integer numbers.
 */
export function shouldStopForSpend(spent, reserved, cap, margin = PROOF_SPEND_MARGIN_MICRO_USD) {
  return BigInt(spent) + BigInt(reserved) >= BigInt(cap) - BigInt(margin);
}

/** Letters-only name of 3 to 20 characters, deterministic per n, distinct for distinct n (base-26 after a fixed prefix). */
export function proofCharacterName(nowMs) {
  let n = BigInt(Math.trunc(Number(nowMs)));
  if (n < 0n) n = -n;
  let tail = '';
  do {
    tail = String.fromCharCode(97 + Number(n % 26n)) + tail;
    n /= 26n;
  } while (n > 0n);
  return 'Pr' + tail;
}

/** A unique, well-formed email per n (the server lowercases it and only needs an '@'). */
export function proofEmail(nowMs) {
  return 'proof-' + Math.trunc(Number(nowMs)) + '@example.test';
}

/**
 * Summarise llm_admin_state.lastSmokeJson: { route: { ok: boolean, ... }, ... }.
 * Malformed JSON, or JSON that is not an object, gives { total: 0, ok: 0, failed: [] } and never throws.
 */
export function summarizeSmoke(json) {
  const empty = { total: 0, ok: 0, failed: [] };
  let parsed;
  try {
    parsed = JSON.parse(String(json ?? ''));
  } catch {
    return empty;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return empty;
  const failed = [];
  let ok = 0;
  const keys = Object.keys(parsed);
  for (const key of keys) {
    const entry = parsed[key];
    if (entry !== null && typeof entry === 'object' && entry.ok === true) ok += 1;
    else failed.push(key);
  }
  return { total: keys.length, ok, failed };
}

/** A job status after which nothing more will happen to the job. */
export function isTerminalJobStatus(status) {
  return status === 'completed' || status === 'failed' || status === 'expired';
}

/** First PROOF_EXCERPT_MAX characters of text on one line (whitespace collapsed); the caller scrubs it first. */
export function excerpt(text, max = PROOF_EXCERPT_MAX) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** The next step after `current` in PROOF_STEPS, or null at the end. */
export function nextProofStep(current) {
  const i = PROOF_STEPS.indexOf(current);
  return i >= 0 && i + 1 < PROOF_STEPS.length ? PROOF_STEPS[i + 1] : null;
}
