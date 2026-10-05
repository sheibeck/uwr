// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthModule = typeof import('./spacetimeAuth');

const b64url = (value: string) =>
  btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const makeIdToken = (payload: Record<string, unknown> = { email: 'player@example.com' }) =>
  `${b64url('{"alg":"none"}')}.${b64url(JSON.stringify(payload))}.sig`;

const loadAuth = async (clientId = 'test-client'): Promise<AuthModule> => {
  vi.stubEnv('VITE_SPACETIMEAUTH_CLIENT_ID', clientId);
  vi.resetModules();
  return await import('./spacetimeAuth');
};

const stubTokenFetch = (ok: boolean, body: unknown, text = '') => {
  const fetchMock = vi.fn(async () => ({
    ok,
    text: async () => text,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const seedCallback = (state = 's1', verifier: string | null = 'v1') => {
  window.history.replaceState({}, '', `/uwr?code=abc&state=${state}`);
  sessionStorage.setItem('spacetimeauth_state', 's1');
  if (verifier) sessionStorage.setItem('spacetimeauth_verifier', verifier);
};

const expectUrlClean = () => {
  expect(window.location.search).not.toContain('code=');
  expect(window.location.search).not.toContain('state=');
};

const authKeys = () =>
  Object.keys(localStorage).filter((key) => key.startsWith('spacetimeauth_'));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/uwr');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('handleSpacetimeAuthCallback', () => {
  it('returns null and touches no storage when there is no code', async () => {
    const auth = await loadAuth();
    sessionStorage.setItem('spacetimeauth_state', 'keep');
    expect(await auth.handleSpacetimeAuthCallback()).toBeNull();
    expect(sessionStorage.getItem('spacetimeauth_state')).toBe('keep');
    expect(authKeys()).toEqual([]);
  });

  it('throws the IdP error redirect and cleans every callback parameter and the PKCE values', async () => {
    const auth = await loadAuth();
    window.history.replaceState(
      {},
      '',
      '/uwr?error=access_denied&error_description=User%20cancelled&state=s1&iss=https%3A%2F%2Fidp&session_state=x',
    );
    sessionStorage.setItem('spacetimeauth_state', 's1');
    sessionStorage.setItem('spacetimeauth_verifier', 'v1');
    const fetchMock = stubTokenFetch(true, {});
    await expect(auth.handleSpacetimeAuthCallback()).rejects.toThrow('User cancelled');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
    expect(sessionStorage.getItem('spacetimeauth_verifier')).toBeNull();
    expect(sessionStorage.getItem('spacetimeauth_state')).toBeNull();
    expect(authKeys()).toEqual([]);
  });

  it('falls back to the error code when the IdP sends no description', async () => {
    const auth = await loadAuth();
    window.history.replaceState({}, '', '/uwr?error=access_denied&state=s1');
    await expect(auth.handleSpacetimeAuthCallback()).rejects.toThrow('access_denied');
    expect(window.location.search).toBe('');
  });

  it('throws on a state mismatch and cleans the URL and session values', async () => {
    const auth = await loadAuth();
    seedCallback('other');
    await expect(auth.handleSpacetimeAuthCallback()).rejects.toThrow('Invalid auth state.');
    expectUrlClean();
    expect(sessionStorage.getItem('spacetimeauth_verifier')).toBeNull();
    expect(sessionStorage.getItem('spacetimeauth_state')).toBeNull();
  });

  it('throws on a missing verifier and cleans the URL', async () => {
    const auth = await loadAuth();
    seedCallback('s1', null);
    await expect(auth.handleSpacetimeAuthCallback()).rejects.toThrow('Missing PKCE verifier.');
    expectUrlClean();
    expect(sessionStorage.getItem('spacetimeauth_state')).toBeNull();
  });

  it('throws with the response text when the token exchange fails', async () => {
    const auth = await loadAuth();
    seedCallback();
    stubTokenFetch(false, {}, 'invalid_grant');
    await expect(auth.handleSpacetimeAuthCallback()).rejects.toThrow('invalid_grant');
    expectUrlClean();
    expect(authKeys()).toEqual([]);
    expect(sessionStorage.getItem('spacetimeauth_verifier')).toBeNull();
  });

  it('stores the session on success and cleans the URL', async () => {
    const auth = await loadAuth();
    seedCallback();
    window.history.replaceState({}, '', '/uwr?code=abc&state=s1&iss=https%3A%2F%2Fidp&session_state=x');
    const idToken = makeIdToken();
    const fetchMock = stubTokenFetch(true, {
      id_token: idToken,
      access_token: 'access-1',
      expires_in: 3600,
    });
    const result = await auth.handleSpacetimeAuthCallback();
    expect(result).toEqual({ idToken, email: 'player@example.com' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('spacetimeauth_id_token')).toBe(idToken);
    expect(localStorage.getItem('spacetimeauth_access_token')).toBe('access-1');
    expect(Number(localStorage.getItem('spacetimeauth_expires_at'))).toBeGreaterThan(Date.now());
    expect(localStorage.getItem('spacetimeauth_email')).toBe('player@example.com');
    expect(sessionStorage.getItem('spacetimeauth_verifier')).toBeNull();
    expect(sessionStorage.getItem('spacetimeauth_state')).toBeNull();
    expectUrlClean();
    expect(window.location.search).toBe('');
  });
});

describe('handleSpacetimeAuthCallback token payload and storage', () => {
  const utf8b64url = (value: string) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(value)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  it('treats a malformed id token payload as no email instead of throwing after storage', async () => {
    const auth = await loadAuth();
    seedCallback();
    stubTokenFetch(true, { id_token: 'header.@@not-base64@@.sig', expires_in: 3600 });
    await expect(auth.handleSpacetimeAuthCallback()).resolves.toEqual({
      idToken: 'header.@@not-base64@@.sig',
      email: null,
    });
    expect(localStorage.getItem('spacetimeauth_id_token')).toBe('header.@@not-base64@@.sig');
    expect(localStorage.getItem('spacetimeauth_email')).toBeNull();
    expectUrlClean();
  });

  it('treats a payload that is valid base64 but not JSON as no email', async () => {
    const auth = await loadAuth();
    seedCallback();
    const idToken = `h.${b64url('not json')}.sig`;
    stubTokenFetch(true, { id_token: idToken });
    await expect(auth.handleSpacetimeAuthCallback()).resolves.toEqual({ idToken, email: null });
  });

  it('decodes non-ASCII claims as UTF-8', async () => {
    const auth = await loadAuth();
    seedCallback();
    const idToken = `h.${utf8b64url(JSON.stringify({ email: 'josé@exämple.com' }))}.sig`;
    stubTokenFetch(true, { id_token: idToken });
    const result = await auth.handleSpacetimeAuthCallback();
    expect(result?.email).toBe('josé@exämple.com');
    expect(localStorage.getItem('spacetimeauth_email')).toBe('josé@exämple.com');
  });

  it('removes stale expiry, access token and email from an earlier session', async () => {
    const auth = await loadAuth();
    seedCallback();
    localStorage.setItem('spacetimeauth_expires_at', '1');
    localStorage.setItem('spacetimeauth_access_token', 'old-access');
    localStorage.setItem('spacetimeauth_email', 'old@example.com');
    const idToken = makeIdToken({});
    stubTokenFetch(true, { id_token: idToken });
    await auth.handleSpacetimeAuthCallback();
    expect(localStorage.getItem('spacetimeauth_id_token')).toBe(idToken);
    expect(localStorage.getItem('spacetimeauth_expires_at')).toBeNull();
    expect(localStorage.getItem('spacetimeauth_access_token')).toBeNull();
    expect(localStorage.getItem('spacetimeauth_email')).toBeNull();
    // A fresh token with no expiry is usable, not "expired" by the old value.
    expect(auth.getStoredIdToken()).toBe(idToken);
  });

  it('stores all keys or none when a write fails', async () => {
    const auth = await loadAuth();
    seedCallback();
    stubTokenFetch(true, { id_token: makeIdToken(), access_token: 'a', expires_in: 60 });
    const real = localStorage;
    let writes = 0;
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => real.getItem(key),
      removeItem: (key: string) => real.removeItem(key),
      setItem: (key: string, value: string) => {
        writes += 1;
        if (writes === 3) throw new Error('QuotaExceededError');
        real.setItem(key, value);
      },
    });
    await expect(auth.handleSpacetimeAuthCallback()).rejects.toThrow('QuotaExceededError');
    vi.unstubAllGlobals();
    expect(authKeys()).toEqual([]);
    expectUrlClean();
  });
});

describe('token expiry', () => {
  it('treats a token past its expiry as unusable and expired', async () => {
    const auth = await loadAuth();
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    localStorage.setItem('spacetimeauth_id_token', 'tok');
    localStorage.setItem('spacetimeauth_expires_at', String(1_000_000 + 1000));

    expect(auth.getStoredIdToken()).toBe('tok');
    expect(auth.hasExpiredToken()).toBe(false);

    vi.setSystemTime(1_000_000 + 1001);
    expect(auth.getStoredIdToken()).toBeNull();
    expect(auth.hasExpiredToken()).toBe(true);
  });

  it('is not expired when no token is stored', async () => {
    const auth = await loadAuth();
    localStorage.setItem('spacetimeauth_expires_at', '1');
    expect(auth.hasExpiredToken()).toBe(false);
    expect(auth.getStoredIdToken()).toBeNull();
  });
});

describe('clearAuthSession', () => {
  it('removes every spacetimeauth_ key from both storages', async () => {
    const auth = await loadAuth();
    localStorage.setItem('spacetimeauth_id_token', 'a');
    localStorage.setItem('spacetimeauth_access_token', 'b');
    localStorage.setItem('spacetimeauth_expires_at', '1');
    localStorage.setItem('spacetimeauth_email', 'e');
    localStorage.setItem('unrelated', 'keep');
    sessionStorage.setItem('spacetimeauth_verifier', 'v');
    sessionStorage.setItem('spacetimeauth_state', 's');
    auth.clearAuthSession();
    expect(authKeys()).toEqual([]);
    expect(localStorage.getItem('unrelated')).toBe('keep');
    expect(sessionStorage.getItem('spacetimeauth_verifier')).toBeNull();
    expect(sessionStorage.getItem('spacetimeauth_state')).toBeNull();
  });
});

describe('beginSpacetimeAuthLogin', () => {
  it('rejects when the client id is not configured', async () => {
    const auth = await loadAuth('');
    await expect(auth.beginSpacetimeAuthLogin()).rejects.toThrow(
      'Missing VITE_SPACETIMEAUTH_CLIENT_ID',
    );
  });
});
