/**
 * CR-01 (plan 51.1-05): the sign-in email comes from the verified token, not from the client.
 * verifiedEmailFromAuth mirrors the client's parseJwtEmail claim order (email, else
 * preferred_username); resolveLoginEmail decides what login_email links. TOKEN_EMAIL_CHECK is
 * the owner's one-line rollback switch, pinned here.
 */
import { describe, it, expect } from 'vitest';
// @ts-ignore node builtins are not in the server tsconfig types
import { readFileSync } from 'node:fs';
// @ts-ignore node builtins are not in the server tsconfig types
import { fileURLToPath } from 'node:url';
import { verifiedEmailFromAuth, resolveLoginEmail } from './login_identity';

const auth = (fullPayload: unknown) => ({ isInternal: false, hasJWT: true, jwt: { fullPayload } });

describe('verifiedEmailFromAuth', () => {
  it('reads the email claim, trimmed and lower-cased', () => {
    expect(verifiedEmailFromAuth(auth({ email: '  Ann@Example.COM ' }))).toBe('ann@example.com');
  });

  it('falls back to preferred_username when there is no email claim', () => {
    expect(verifiedEmailFromAuth(auth({ preferred_username: 'Cara@Example.com' }))).toBe('cara@example.com');
  });

  it('prefers email over preferred_username', () => {
    expect(
      verifiedEmailFromAuth(auth({ email: 'ann@example.com', preferred_username: 'other@example.com' })),
    ).toBe('ann@example.com');
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
