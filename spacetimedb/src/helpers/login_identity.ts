/**
 * CR-01 (plan 51.1-05): login_email must not trust a client-sent email.
 *
 * The email that links a player to a user row comes from the caller's verified sign-in token
 * (ctx.senderAuth.jwt.fullPayload). The claim order matches the client's parseJwtEmail
 * (src/auth/spacetimeAuth.ts): `email`, else `preferred_username`, a non-empty string; it is
 * trimmed and lower-cased like the argument always was. The reducer keeps its `email` argument
 * (no binding change) and refuses an argument that differs from the token's email.
 *
 * Admin identities (data/admin.ts, which includes the CLI identity) may still supply the email,
 * so the live-proof scripts (scripts/llm/drills.live.ts, prove-live.live.ts) keep signing in.
 *
 * ROLLBACK: TOKEN_EMAIL_CHECK is the owner's one-line switch. If real sign-in is refused, set it
 * to false and republish locally; login_email then trusts the argument exactly as before.
 *
 * Imports nothing from spacetimedb, so it is plain logic and unit-testable.
 */

export const TOKEN_EMAIL_CHECK = true;

export type LoginEmailResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'invalid' | 'no_claim' | 'mismatch' };

const normalise = (value: string): string => value.trim().toLowerCase();

const claimString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const email = normalise(value);
  return email ? email : null;
};

/**
 * The email in the caller's verified sign-in token, or null when there is no token or no usable
 * claim. Reads `email`, else `preferred_username` (the client's order), trimmed and lower-cased.
 */
export function verifiedEmailFromAuth(senderAuth: unknown): string | null {
  if (!senderAuth || typeof senderAuth !== 'object') return null;
  try {
    // The platform parses the token payload lazily inside the `jwt` getter; a parse failure
    // reads as "no email" (never a throw), so the rollback path is never affected by it.
    const jwt = (senderAuth as { jwt?: unknown }).jwt;
    if (!jwt || typeof jwt !== 'object') return null;
    const payload = (jwt as { fullPayload?: unknown }).fullPayload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const claims = payload as Record<string, unknown>;
    const raw = claims.email ?? claims.preferred_username ?? null;
    return claimString(raw);
  } catch {
    return null;
  }
}

/**
 * Which email login_email links. An argument without '@' is always invalid. With the switch off
 * (rollback) or for an admin identity, the normalised argument is used. Otherwise the token must
 * carry an email and the argument must equal it (ignoring case and surrounding spaces).
 */
export function resolveLoginEmail(input: {
  argument: string;
  claimed: string | null;
  isAdmin: boolean;
  enforce: boolean;
}): LoginEmailResult {
  const argument = normalise(input.argument);
  if (!argument || !argument.includes('@')) return { ok: false, reason: 'invalid' };
  if (!input.enforce || input.isAdmin) return { ok: true, email: argument };
  const claimed = input.claimed == null ? null : claimString(input.claimed);
  if (!claimed) return { ok: false, reason: 'no_claim' };
  if (claimed !== argument) return { ok: false, reason: 'mismatch' };
  return { ok: true, email: claimed };
}
