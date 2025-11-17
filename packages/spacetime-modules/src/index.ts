// SpacetimeDB module schema & reducers (initial draft)
// Publish with: spacetime publish --server local --project-path packages/spacetime-modules unwritten-realms
// After publishing, generate client bindings: spacetime generate --lang typescript --out-dir services/orchestrator/src/module_bindings --project-path packages/spacetime-modules
// IMPORTANT: This file must remain the entrypoint for publishing.

import { schema, table, t, SenderError } from 'spacetimedb/server';

// Lightweight UUIDv4 generator to avoid depending on Node's `crypto` in the
// module runtime environment. Not cryptographically strong, but sufficient
// for development/local ids. Replace with a secure RNG if required.
function uuidv4() {
    // From https://stackoverflow.com/a/2117523
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// Accounts table: represents external auth provider linkage.
const Accounts = table(
    { name: 'accounts', public: true },
    {
        // Use string UUID primary keys instead of auto-incrementing u64
        id: t.string().primaryKey(),
        provider: t.string().index('btree'),
        provider_user_id: t.string().unique(),
        display_name: t.string().optional(),
        created_at: t.timestamp(),
        updated_at: t.timestamp()
    }
);

// Sessions table: ephemeral login sessions (could be scheduled for cleanup later)
const Sessions = table(
    { name: 'sessions', public: true },
    {
        // Use string UUID primary keys and reference account ids as strings
        id: t.string().primaryKey(),
        account_id: t.string(),
        session_token: t.string().unique(),
        created_at: t.timestamp(),
        last_seen_at: t.timestamp(),
        expires_at: t.timestamp(),
        ip_hash: t.string().optional()
    }
);

// Compose schema
const spacetimedb = schema(Accounts, Sessions);

spacetimedb.reducer(
    'create_account',
    { provider: t.string(), provider_user_id: t.string(), display_name: t.string().optional() },
    (ctx: any, { provider, provider_user_id, display_name }: any) => {
        // Enforce uniqueness via provider_user_id unique index.
        const existing = ctx.db.accounts.provider_user_id.find(provider_user_id);
        if (existing) {
            throw new SenderError('Account already exists');
        }
        // Generate a UUID for `id`.
        const newAccount = {
            id: uuidv4(),
            provider,
            provider_user_id,
            display_name,
            created_at: ctx.timestamp,
            updated_at: ctx.timestamp
        };
        // insert account; keep id placeholder so auto-increment assigns value
        ctx.db.accounts.insert(newAccount);
    }
);

spacetimedb.reducer(
    'upsert_account',
    { provider: t.string(), provider_user_id: t.string(), display_name: t.string().optional() },
    (ctx: any, { provider, provider_user_id, display_name }: any) => {
        const row = ctx.db.accounts.provider_user_id.find(provider_user_id);
        if (row) {
            // Update display name & timestamp
            row.display_name = display_name;
            row.updated_at = ctx.timestamp;
            ctx.db.accounts.provider_user_id.update(row);
        } else {
            // Let auto-increment assign id on insert.
            const newAccount2 = {
                id: uuidv4(),
                provider,
                provider_user_id,
                display_name,
                created_at: ctx.timestamp,
                updated_at: ctx.timestamp
            };
            // insert account on upsert path; use id placeholder for auto-inc
            ctx.db.accounts.insert(newAccount2);
        }
    }
);

spacetimedb.reducer(
    'create_or_update_session',
    { provider_user_id: t.string(), session_token: t.string(), ttl_minutes: t.u32() },
    (ctx: any, { provider_user_id, session_token, ttl_minutes }: any) => {
        const account = ctx.db.accounts.provider_user_id.find(provider_user_id);
        if (!account) {
            throw new SenderError('Unknown account');
        }
        const existing = ctx.db.sessions.session_token.find(session_token);
        // Calculate expires_at by adding ttl (in minutes) to ctx.timestamp.
        let expires_at = ctx.timestamp;
        try {
            const addMicros = BigInt(ttl_minutes) * BigInt(60 * 1_000_000);
            const base = (ctx.timestamp as any).__timestamp_micros_since_unix_epoch__;
            if (typeof base === 'bigint') {
                expires_at = { __timestamp_micros_since_unix_epoch__: base + addMicros };
            }
        } catch (e) {
            // fallback: leave expires_at as ctx.timestamp
        }
        if (existing) {
            existing.last_seen_at = ctx.timestamp;
            existing.expires_at = expires_at;
            ctx.db.sessions.session_token.update(existing);
        } else {
            // Generate a UUID for sessions id on insert.
            const newSession = {
                id: uuidv4(),
                account_id: account.id,
                session_token,
                created_at: ctx.timestamp,
                last_seen_at: ctx.timestamp,
                expires_at,
                ip_hash: null
            };
            // insert session; id placeholder provided for auto-increment
            ctx.db.sessions.insert(newSession);
        }
    }
);

spacetimedb.reducer(
    'touch_session',
    { session_token: t.string() },
    (ctx: any, { session_token }: any) => {
        const existing = ctx.db.sessions.session_token.find(session_token);
        if (!existing) {
            throw new SenderError('Session not found');
        }
        existing.last_seen_at = ctx.timestamp;
        ctx.db.sessions.session_token.update(existing);
    }
);

// Lifecycle hooks: mark sessions stale or perform cleanup (placeholder)
spacetimedb.init((_ctx: any) => {
    console.info('Module initialized');
});

export { };// Placeholder for SpaceTimeDB table & procedure bindings (TypeScript).
// TODO: Define modules once initial auth/session tables are finalized.
export const placeholder = true;
