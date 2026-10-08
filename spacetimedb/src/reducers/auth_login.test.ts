/**
 * CR-01 through the real login_email handler (plan 51.1-05), on the strict mock db.
 * The email linked to the caller's player row comes from the verified sign-in token
 * (ctx.senderAuth.jwt.fullPayload: the `email` claim of a SpacetimeAuth token for our client, not
 * marked unverified). A different argument or a token without a trusted email is refused with a
 * SenderError and writes nothing. Admin identities
 * (the CLI identity the live-proof scripts use) may still supply the email.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { MODULE } from '../helpers/combat_fight_fixture';
import { ADMIN_IDENTITIES } from '../data/admin';
import { SPACETIMEAUTH_CLIENT_IDS, SPACETIMEAUTH_ISSUER } from '../data/auth_config';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const NOW = T0 + 1_000_000_000n;
const player = { toHexString: () => 'a'.repeat(64) };
// The CLI / database-owner identity from data/admin.ts (used by drills.live.ts and prove-live.live.ts).
const CLI_ADMIN_HEX = 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e';
const cliAdmin = { toHexString: () => CLI_ADMIN_HEX };

let loginEmail: (...args: any[]) => any;

beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('login_email');
  if (typeof h !== 'function') {
    throw new Error("capturedReducer('login_email') is not a function: STOP and report; never edit production code to fix this.");
  }
  loginEmail = h;
}, 120_000);

const at = (micros: bigint) => ({ microsSinceUnixEpoch: micros });

const playerRow = (id: any) => ({
  id,
  createdAt: at(T0),
  lastSeenAt: at(T0),
  displayName: undefined,
  activeCharacterId: undefined,
  userId: undefined,
  sessionStartedAt: undefined,
  lastActivityAt: at(T0),
});

/** A SpacetimeAuth id token for our client (pinned issuer and audience) with these claims on top. */
const withJwt = (claims: Record<string, unknown>) => ({
  isInternal: false,
  hasJWT: true,
  jwt: { fullPayload: { iss: SPACETIMEAUTH_ISSUER, aud: SPACETIMEAUTH_CLIENT_IDS[0], ...claims } },
});
const noJwt = { isInternal: false, hasJWT: false, jwt: null };

function newCtx(senderAuth: unknown, sender: any = player, seed: Record<string, any[]> = {}) {
  const base = createMockCtx({
    seed: { player: [playerRow(sender)], user: [], ...seed },
    sender,
    timestampMicros: NOW,
    databaseIdentity: MODULE,
    strict: true,
  });
  return { ...base, senderAuth };
}

const users = (ctx: any) => ctx.db._tables.user;
const playerOf = (ctx: any, id: any) => ctx.db._tables.player.find((p: any) => p.id === id);

describe('login_email takes the email from the sign-in token (CR-01)', () => {
  it('links the token email when the argument matches it, and a second login reuses the row', () => {
    const ctx = newCtx(withJwt({ email: 'Ann@Example.com' }));
    loginEmail(ctx, { email: 'ann@example.com' });
    expect(users(ctx)).toHaveLength(1);
    expect(users(ctx)[0].email).toBe('ann@example.com');
    const linked = users(ctx)[0].id;
    expect(playerOf(ctx, player).userId).toBe(linked);
    expect(playerOf(ctx, player).sessionStartedAt).toEqual(at(NOW));

    loginEmail(ctx, { email: ' ANN@example.com ' });
    expect(users(ctx)).toHaveLength(1);
    expect(playerOf(ctx, player).userId).toBe(linked);
  });

  it('links an existing user row with the token email', () => {
    const ctx = newCtx(withJwt({ email: 'ann@example.com' }), player, {
      user: [{ id: 5n, email: 'ann@example.com', createdAt: at(T0) }],
    });
    loginEmail(ctx, { email: 'ann@example.com' });
    expect(users(ctx)).toHaveLength(1);
    expect(playerOf(ctx, player).userId).toBe(5n);
  });

  it("refuses another user's email and writes nothing", () => {
    const ctx = newCtx(withJwt({ email: 'ann@example.com' }), player, {
      user: [{ id: 9n, email: 'bob@example.com', createdAt: at(T0) }],
    });
    expect(() => loginEmail(ctx, { email: 'bob@example.com' })).toThrow('Email does not match the sign-in token.');
    expect(users(ctx)).toHaveLength(1);
    expect(playerOf(ctx, player)).toEqual(playerRow(player));
  });

  it('refuses a connection without a sign-in token and writes nothing', () => {
    const ctx = newCtx(noJwt);
    expect(() => loginEmail(ctx, { email: 'ann@example.com' })).toThrow('Sign-in token carries no email.');
    expect(users(ctx)).toHaveLength(0);
    expect(playerOf(ctx, player)).toEqual(playerRow(player));
  });

  it('refuses a token that carries no email claim', () => {
    const ctx = newCtx(withJwt({ sub: 'abc' }));
    expect(() => loginEmail(ctx, { email: 'ann@example.com' })).toThrow('Sign-in token carries no email.');
    expect(users(ctx)).toHaveLength(0);
  });

  it("refuses a foreign issuer's token carrying the victim's email and writes nothing (code review CR-01)", () => {
    const ctx = newCtx(
      withJwt({ iss: 'https://attacker.example/oidc', email: 'victim@example.com' }),
      player,
      { user: [{ id: 9n, email: 'victim@example.com', createdAt: at(T0) }] },
    );
    expect(() => loginEmail(ctx, { email: 'victim@example.com' })).toThrow('Sign-in token carries no email.');
    expect(users(ctx)).toHaveLength(1);
    expect(playerOf(ctx, player)).toEqual(playerRow(player));
  });

  it('refuses a SpacetimeAuth token minted for another client (wrong audience)', () => {
    const ctx = newCtx(withJwt({ aud: 'client_someone_else', email: 'victim@example.com' }));
    expect(() => loginEmail(ctx, { email: 'victim@example.com' })).toThrow('Sign-in token carries no email.');
    expect(users(ctx)).toHaveLength(0);
  });

  it('refuses a token that carries only preferred_username (WR-01) and writes nothing', () => {
    const ctx = newCtx(withJwt({ preferred_username: 'cara@example.com' }), player, {
      user: [{ id: 9n, email: 'cara@example.com', createdAt: at(T0) }],
    });
    expect(() => loginEmail(ctx, { email: 'cara@example.com' })).toThrow('Sign-in token carries no email.');
    expect(users(ctx)).toHaveLength(1);
    expect(playerOf(ctx, player)).toEqual(playerRow(player));
  });

  it('refuses an email the provider marks unverified (WR-01)', () => {
    const ctx = newCtx(withJwt({ email: 'ann@example.com', email_verified: false }));
    expect(() => loginEmail(ctx, { email: 'ann@example.com' })).toThrow('Sign-in token carries no email.');
    expect(users(ctx)).toHaveLength(0);
  });

  it('links a verified email', () => {
    const ctx = newCtx(withJwt({ email: 'ann@example.com', email_verified: true }));
    loginEmail(ctx, { email: 'ann@example.com' });
    expect(users(ctx).map((u: any) => u.email)).toEqual(['ann@example.com']);
  });

  it('keeps the old "Invalid email" refusal for an argument without @', () => {
    const ctx = newCtx(withJwt({ email: 'ann@example.com' }));
    expect(() => loginEmail(ctx, { email: 'ann' })).toThrow('Invalid email');
    expect(users(ctx)).toHaveLength(0);
  });

  it('lets an admin identity (the CLI) supply a live-proof email without a token', () => {
    expect(ADMIN_IDENTITIES.has(CLI_ADMIN_HEX)).toBe(true);
    const ctx = newCtx(noJwt, cliAdmin);
    loginEmail(ctx, { email: 'proof-1700000000000@example.test' });
    expect(users(ctx)).toHaveLength(1);
    expect(users(ctx)[0].email).toBe('proof-1700000000000@example.test');
    expect(playerOf(ctx, cliAdmin).userId).toBe(users(ctx)[0].id);
  });

  it("refuses an admin identity linking a real player's email without a matching token (IN-07)", () => {
    const ctx = newCtx(noJwt, cliAdmin, { user: [{ id: 9n, email: 'victim@example.com', createdAt: at(T0) }] });
    expect(() => loginEmail(ctx, { email: 'victim@example.com' })).toThrow('Sign-in token carries no email.');
    expect(users(ctx)).toHaveLength(1);
    expect(playerOf(ctx, cliAdmin)).toEqual(playerRow(cliAdmin));
  });
});
