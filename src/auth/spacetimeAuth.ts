const ISSUER = import.meta.env.VITE_SPACETIMEAUTH_ISSUER ?? 'https://auth.spacetimedb.com';
const CLIENT_ID = import.meta.env.VITE_SPACETIMEAUTH_CLIENT_ID ?? '';
const REDIRECT_URI =
  import.meta.env.VITE_SPACETIMEAUTH_REDIRECT_URI ?? window.location.origin;

const STORAGE_KEYS = {
  verifier: 'spacetimeauth_verifier',
  state: 'spacetimeauth_state',
  idToken: 'spacetimeauth_id_token',
  accessToken: 'spacetimeauth_access_token',
  expiresAt: 'spacetimeauth_expires_at',
  email: 'spacetimeauth_email',
};

const randomString = (bytes = 32) => {
  const data = new Uint8Array(bytes);
  window.crypto.getRandomValues(data);
  return base64UrlEncode(data);
};

const base64UrlEncode = (data: Uint8Array | ArrayBuffer) => {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const sha256 = async (value: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  return await window.crypto.subtle.digest('SHA-256', data);
};

export const getStoredIdToken = () => {
  const token = localStorage.getItem(STORAGE_KEYS.idToken);
  const expiresAt = Number(localStorage.getItem(STORAGE_KEYS.expiresAt) ?? 0);
  if (!token) return null;
  if (expiresAt && Date.now() > expiresAt) return null;
  return token;
};

export const getStoredEmail = () => localStorage.getItem(STORAGE_KEYS.email);

export const clearAuthSession = () => {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  sessionStorage.removeItem(STORAGE_KEYS.verifier);
  sessionStorage.removeItem(STORAGE_KEYS.state);
};

export const beginSpacetimeAuthLogin = async () => {
  if (!CLIENT_ID) throw new Error('Missing VITE_SPACETIMEAUTH_CLIENT_ID');
  const verifier = randomString();
  const state = randomString(16);
  const challenge = base64UrlEncode(await sha256(verifier));
  sessionStorage.setItem(STORAGE_KEYS.verifier, verifier);
  sessionStorage.setItem(STORAGE_KEYS.state, state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });

  window.location.assign(`${ISSUER}/oidc/auth?${params.toString()}`);
};

const parseJwtEmail = (idToken: string) => {
  const parts = idToken.split('.');
  if (parts.length < 2) return null;
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(payload.padEnd(payload.length + (4 - (payload.length % 4)) % 4, '='));
  const parsed = JSON.parse(decoded);
  return parsed.email ?? parsed.preferred_username ?? null;
};

export const handleSpacetimeAuthCallback = async () => {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = sessionStorage.getItem(STORAGE_KEYS.state);
  if (!code) return null;
  if (!state || !expectedState || state !== expectedState) {
    throw new Error('Invalid auth state.');
  }

  const verifier = sessionStorage.getItem(STORAGE_KEYS.verifier);
  if (!verifier) throw new Error('Missing PKCE verifier.');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code,
    code_verifier: verifier,
  });

  const response = await fetch(`${ISSUER}/oidc/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to exchange auth code.');
  }
  const payload = await response.json();
  const idToken = payload.id_token as string | undefined;
  if (!idToken) throw new Error('Missing id_token.');
  const accessToken = payload.access_token as string | undefined;
  const expiresIn = Number(payload.expires_in ?? 0);

  localStorage.setItem(STORAGE_KEYS.idToken, idToken);
  if (accessToken) localStorage.setItem(STORAGE_KEYS.accessToken, accessToken);
  if (expiresIn) {
    localStorage.setItem(STORAGE_KEYS.expiresAt, String(Date.now() + expiresIn * 1000));
  }
  const email = parseJwtEmail(idToken);
  if (email) localStorage.setItem(STORAGE_KEYS.email, email);

  sessionStorage.removeItem(STORAGE_KEYS.verifier);
  sessionStorage.removeItem(STORAGE_KEYS.state);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, document.title, url.toString());

  return { idToken, email };
};
