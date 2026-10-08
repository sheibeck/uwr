/**
 * CR-01 (plan 51.1-05): the sign-in email comes from the verified token, not from the client.
 * verifiedEmailFromAuth reads only the `email` claim of a SpacetimeAuth token for our client, and
 * refuses it when `email_verified` says no (code review CR-01, WR-01); resolveLoginEmail decides
 * what login_email links. TOKEN_EMAIL_CHECK is the owner's one-line rollback switch, pinned here.
 */
import { describe, it, expect } from 'vitest';
// @ts-ignore node builtins are not in the server tsconfig types
import { readFileSync } from 'node:fs';
// @ts-ignore node builtins are not in the server tsconfig types
import { fileURLToPath } from 'node:url';
import { verifiedEmailFromAuth, readTokenEmail, resolveLoginEmail } from './login_identity';
import { SPACETIMEAUTH_CLIENT_IDS, SPACETIMEAUTH_ISSUER } from '../data/auth_config';

/** A SpacetimeAuth id token for our client: the pinned issuer and audience. */
const TRUSTED = { iss: SPACETIMEAUTH_ISSUER, aud: SPACETIMEAUTH_CLIENT_IDS[0] };
const auth = (claims: unknown, base: Record<string, unknown> = TRUSTED) => ({
  isInternal: false,
  hasJWT: true,
  jwt: { fullPayload: claims && typeof claims === 'object' && !Array.isArray(claims) ? { ...base, ...claims } : claims },
});

describe('verifiedEmailFromAuth', () => {
  it('reads the email claim, trimmed and lower-cased', () => {
    expect(verifiedEmailFromAuth(auth({ email: '  Ann@Example.COM ' }))).toBe('ann@example.com');
  });

  it('never falls back to preferred_username, which the user chooses (WR-01)', () => {
    expect(verifiedEmailFromAuth(auth({ preferred_username: 'Cara@Example.com' }))).toBeNull();
    expect(readTokenEmail(auth({ preferred_username: 'cara@example.com' })).refusal).toBe('no_email');
  });

  it('uses email even when preferred_username differs', () => {
    expect(
      verifiedEmailFromAuth(auth({ email: 'ann@example.com', preferred_username: 'other@example.com' })),
    ).toBe('ann@example.com');
  });

  it('refuses an email the provider says is not verified (WR-01)', () => {
    expect(readTokenEmail(auth({ email: 'ann@example.com', email_verified: false }))).toEqual({
      email: null,
      refusal: 'unverified',
    });
    expect(verifiedEmailFromAuth(auth({ email: 'ann@example.com', email_verified: 'false' }))).toBeNull();
    expect(verifiedEmailFromAuth(auth({ email: 'ann@example.com', email_verified: null }))).toBeNull();
  });

  it('accepts a verified email, and an email when the token does not say', () => {
    expect(verifiedEmailFromAuth(auth({ email: 'ann@example.com', email_verified: true }))).toBe('ann@example.com');
    expect(verifiedEmailFromAuth(auth({ email: 'ann@example.com', email_verified: 'true' }))).toBe('ann@example.com');
    expect(verifiedEmailFromAuth(auth({ email: 'ann@example.com' }))).toBe('ann@example.com');
  });

  it('returns null without a usable claim', () => {
    expect(verifiedEmailFromAuth({ isInternal: false, hasJWT: false, jwt: null })).toBeNull();
    expect(verifiedEmailFromAuth(undefined)).toBeNull();
    expect(verifiedEmailFromAuth(null)).toBeNull();
    expect(verifiedEmailFromAuth({ isInternal: false, hasJWT: true, jwt: {} })).toBeNull();
    expect(verifiedEmailFromAuth(auth({}))).toBeNull();
    expect(verifiedEmailFromAuth(auth({ email: '' }))).toBeNull();
    expect(verifiedEmailFromAuth(auth({ email: '   ' }))).toBeNull();
    expect(verifiedEmailFromAuth(auth({ email: 42 }))).toBeNull();
    expect(verifiedEmailFromAuth(auth({ email: null, preferred_username: ['x@y.z'] }))).toBeNull();
  });

  it('reads a payload the platform fails to parse as no email, never a throw', () => {
    const broken = {
      isInternal: false,
      get hasJWT() { return true; },
      get jwt(): unknown { throw new Error('Expected a JSON object at the top level'); },
    };
    expect(verifiedEmailFromAuth(broken)).toBeNull();
  });
});

describe('only a SpacetimeAuth token for our client is trusted (CR-01, code review)', () => {
  const email = { email: 'victim@example.com' };

  it('refuses a token from a foreign issuer that carries any email', () => {
    const foreign = auth(email, { iss: 'https://attacker.example/realms/x', aud: SPACETIMEAUTH_CLIENT_IDS[0] });
    expect(verifiedEmailFromAuth(foreign)).toBeNull();
    expect(readTokenEmail(foreign)).toEqual({ email: null, refusal: 'issuer' });
  });

  it('refuses a token without an issuer, or with a near-miss issuer', () => {
    expect(readTokenEmail(auth(email, { aud: SPACETIMEAUTH_CLIENT_IDS[0] })).refusal).toBe('issuer');
    expect(readTokenEmail(auth(email, { iss: 'https://auth.spacetimedb.com', aud: SPACETIMEAUTH_CLIENT_IDS[0] })).refusal).toBe('issuer');
    expect(readTokenEmail(auth(email, { iss: 'https://auth.spacetimedb.com/oidc.evil', aud: SPACETIMEAUTH_CLIENT_IDS[0] })).refusal).toBe('issuer');
  });

  it('ignores a trailing slash on the issuer', () => {
    expect(verifiedEmailFromAuth(auth(email, { ...TRUSTED, iss: SPACETIMEAUTH_ISSUER + '/' }))).toBe('victim@example.com');
  });

  it('refuses a token for another client (wrong or missing audience)', () => {
    expect(readTokenEmail(auth(email, { iss: SPACETIMEAUTH_ISSUER, aud: 'client_someone_else' }))).toEqual({
      email: null,
      refusal: 'audience',
    });
    expect(readTokenEmail(auth(email, { iss: SPACETIMEAUTH_ISSUER })).refusal).toBe('audience');
    expect(readTokenEmail(auth(email, { iss: SPACETIMEAUTH_ISSUER, aud: [] })).refusal).toBe('audience');
  });

  it('accepts an audience list that contains our client id', () => {
    const list = auth(email, { iss: SPACETIMEAUTH_ISSUER, aud: ['other', SPACETIMEAUTH_CLIENT_IDS[0]] });
    expect(readTokenEmail(list)).toEqual({ email: 'victim@example.com', refusal: null });
  });

  it('pins the issuer to the SpacetimeAuth OpenID issuer the client signs in with', () => {
    expect(SPACETIMEAUTH_ISSUER).toBe('https://auth.spacetimedb.com/oidc');
    expect(SPACETIMEAUTH_CLIENT_IDS.length).toBeGreaterThan(0);
  });
});

describe('resolveLoginEmail', () => {
  const base = { argument: 'ann@example.com', claimed: 'ann@example.com', isAdmin: false, enforce: true };

  it('refuses an argument without @ as invalid, whatever the token says', () => {
    expect(resolveLoginEmail({ ...base, argument: 'nobody' })).toEqual({ ok: false, reason: 'invalid' });
    expect(resolveLoginEmail({ ...base, argument: '   ' })).toEqual({ ok: false, reason: 'invalid' });
    expect(resolveLoginEmail({ ...base, argument: 'nobody', enforce: false })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('with the switch off trusts the normalised argument (the rollback path)', () => {
    expect(resolveLoginEmail({ argument: ' Bob@Example.com ', claimed: null, isAdmin: false, enforce: false })).toEqual({
      ok: true,
      email: 'bob@example.com',
    });
    expect(
      resolveLoginEmail({ argument: 'bob@example.com', claimed: 'ann@example.com', isAdmin: false, enforce: false }),
    ).toEqual({ ok: true, email: 'bob@example.com' });
  });

  it('lets an admin identity supply the email', () => {
    expect(resolveLoginEmail({ argument: 'Proof@Example.com', claimed: null, isAdmin: true, enforce: true })).toEqual({
      ok: true,
      email: 'proof@example.com',
    });
  });

  it('refuses a token with no email claim', () => {
    expect(resolveLoginEmail({ ...base, claimed: null })).toEqual({ ok: false, reason: 'no_claim' });
  });

  it('refuses an argument that differs from the token email', () => {
    expect(resolveLoginEmail({ ...base, argument: 'bob@example.com' })).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('accepts an argument equal to the claim ignoring case and spaces, and links the claim', () => {
    expect(resolveLoginEmail({ ...base, argument: '  ANN@example.com ', claimed: 'ann@example.com' })).toEqual({
      ok: true,
      email: 'ann@example.com',
    });
  });
});

describe('TOKEN_EMAIL_CHECK (the one-line rollback switch)', () => {
  it('is on', () => {
    const src = readFileSync(fileURLToPath(new URL('./login_identity.ts', import.meta.url)), 'utf8');
    expect(src).toContain('export const TOKEN_EMAIL_CHECK = true;');
  });
});
