// Which sign-in tokens login_email trusts (CR-01, code review of Phase 51.1). Imports nothing.
// Rollback: TOKEN_EMAIL_CHECK in helpers/login_identity.ts switches every token check off at once.
//
// SpacetimeDB accepts a JWT from ANY OpenID issuer whose keys check out, so the module itself must
// decide which issuer and which client its email claim may come from. These are the public values
// the client signs in with (src/auth/spacetimeAuth.ts):
// - the issuer is the `issuer` of https://auth.spacetimedb.com/oidc/.well-known/openid-configuration
//   (the client's VITE_SPACETIMEAUTH_ISSUER base + '/oidc');
// - the audience of the id token is the client id, VITE_SPACETIMEAUTH_CLIENT_ID.
// Neither is a secret: both ship in the browser bundle. If the owner registers another SpacetimeAuth
// client (for example a separate production client), add its id to SPACETIMEAUTH_CLIENT_IDS.

/** The `iss` claim of a SpacetimeAuth id token. */
export const SPACETIMEAUTH_ISSUER = 'https://auth.spacetimedb.com/oidc';

/** Client ids whose id tokens may sign a player in (the token's `aud` must contain one). */
export const SPACETIMEAUTH_CLIENT_IDS: readonly string[] = ['client_032PmGBhDqP6SjkKuAORIQ'];
