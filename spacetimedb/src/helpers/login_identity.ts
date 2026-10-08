/**
 * CR-01 (plan 51.1-05, tightened by the 51.1 code review): login_email must not trust a
 * client-sent email.
 *
 * The email that links a player to a user row comes from the caller's sign-in token
 * (ctx.senderAuth.jwt.fullPayload). SpacetimeDB checks the token's signature against whatever issuer
 * the token names, so this module also checks WHO issued it: the `iss` claim must be the pinned
 * SpacetimeAuth issuer and the `aud` claim must contain one of our client ids (data/auth_config.ts).
 * A token from any other issuer or client carries no usable email. Only the `email` claim counts,
 * and only while `email_verified` (when present) is true. The email is trimmed and lower-cased like
 * the argument always was. The reducer keeps its `email` argument (no binding change) and refuses
 * an argument that differs from the token's email.
 *
 * Admin identities (data/admin.ts, which includes the CLI identity) may still supply the email,
 * so the live-proof scripts (scripts/llm/drills.live.ts, prove-live.live.ts) keep signing in.
 *
 * ROLLBACK: TOKEN_EMAIL_CHECK is the owner's one-line switch. If real sign-in is refused, set it
 * to false and republish locally; login_email then trusts the argument exactly as before (no
 * issuer, audience or email claim check at all).
 *
 * Imports nothing from spacetimedb, so it is plain logic and unit-testable.
 */
import { SPACETIMEAUTH_CLIENT_IDS, SPACETIMEAUTH_ISSUER } from '../data/auth_config';

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

/** Why a sign-in token gave no email (logged by login_email, never shown with the email). */
export type TokenEmailRefusal = 'no_token' | 'issuer' | 'audience' | 'unverified' | 'no_email';

export type TokenEmail = { email: string; refusal: null } | { email: null; refusal: TokenEmailRefusal };

const withoutTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

/** True when the token's `iss` is the pinned SpacetimeAuth issuer (a trailing slash is ignored). */
export function trustedIssuer(iss: unknown): boolean {
  return typeof iss === 'string' && withoutTrailingSlash(iss) === withoutTrailingSlash(SPACETIMEAUTH_ISSUER);
}

/** True when the token's `aud` (a string or a list) names one of our SpacetimeAuth client ids. */
export function trustedAudience(aud: unknown): boolean {
  const list = typeof aud === 'string' ? [aud] : Array.isArray(aud) ? aud : [];
  return list.some((entry) => typeof entry === 'string' && SPACETIMEAUTH_CLIENT_IDS.includes(entry));
}

/** email_verified as providers send it: true, or the string 'true'. */
const emailVerified = (value: unknown): boolean => value === true || value === 'true';

/**
 * The email in the caller's sign-in token, or the reason there is none. The token must come from
 * the pinned issuer for one of our clients. Reads only the `email` claim, trimmed and lower-cased.
 * When the token says whether the provider verified that email (`email_verified`), it must say
 * yes. `preferred_username` is never used: providers let the user choose it, so it proves nothing
 * (WR-01). Never throws.
 */
export function readTokenEmail(senderAuth: unknown): TokenEmail {
  if (!senderAuth || typeof senderAuth !== 'object') return { email: null, refusal: 'no_token' };
  try {
    // The platform parses the token payload lazily inside the `jwt` getter; a parse failure
    // reads as "no email" (never a throw), so the rollback path is never affected by it.
    const jwt = (senderAuth as { jwt?: unknown }).jwt;
    if (!jwt || typeof jwt !== 'object') return { email: null, refusal: 'no_token' };
    const payload = (jwt as { fullPayload?: unknown }).fullPayload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { email: null, refusal: 'no_token' };
    }
    const claims = payload as Record<string, unknown>;
    if (!trustedIssuer(claims.iss)) return { email: null, refusal: 'issuer' };
    if (!trustedAudience(claims.aud)) return { email: null, refusal: 'audience' };
    const email = claimString(claims.email);
    if (!email) return { email: null, refusal: 'no_email' };
    if ('email_verified' in claims && !emailVerified(claims.email_verified)) {
      return { email: null, refusal: 'unverified' };
    }
    return { email, refusal: null };
  } catch {
    return { email: null, refusal: 'no_token' };
  }
}

/** The email in the caller's trusted sign-in token, or null (see readTokenEmail). */
export function verifiedEmailFromAuth(senderAuth: unknown): string | null {
  return readTokenEmail(senderAuth).email;
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
