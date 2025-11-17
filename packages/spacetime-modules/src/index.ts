// SpacetimeDB module schema & reducers (initial draft)
// Publish with: spacetime publish --server local --project-path packages/spacetime-modules quickstart-chat
// After publishing, generate client bindings: spacetime generate --lang typescript --out-dir services/orchestrator/src/module_bindings --project-path packages/spacetime-modules
// IMPORTANT: This file must remain the entrypoint for publishing.

import { schema, table, t, SenderError } from 'spacetimedb/server';

// Accounts table: represents external auth provider linkage.
const Accounts = table(
    { name: 'accounts', public: true },
    {
        id: t.u64().primaryKey().autoInc(),
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
        id: t.u64().primaryKey().autoInc(),
        account_id: t.u64(),
        session_token: t.string().unique(),
        created_at: t.timestamp(),
        last_seen_at: t.timestamp(),
        expires_at: t.timestamp(),
        ip_hash: t.string().optional()
    }
);

// Compose schema
const spacetimedb = schema(Accounts, Sessions);

function nowTs() {
    return BigInt(Date.now()) * BigInt(1000); // microseconds
}

spacetimedb.reducer(
    'create_account',
    { provider: t.string(), provider_user_id: t.string(), display_name: t.string().optional() },
    (ctx: any, { provider, provider_user_id, display_name }: any) => {
        // Enforce uniqueness via provider_user_id unique index.
        const existing = ctx.db.accounts.provider_user_id.find(provider_user_id);
        if (existing) {
            throw new SenderError('Account already exists');
        }
        ctx.db.accounts.insert({
            id: 0n,
            provider,
            provider_user_id,
            display_name,
            created_at: nowTs(),
            updated_at: nowTs()
        });
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
            row.updated_at = nowTs();
            ctx.db.accounts.provider_user_id.update(row);
        } else {
            ctx.db.accounts.insert({
                id: 0n,
                provider,
                provider_user_id,
                display_name,
                created_at: nowTs(),
                updated_at: nowTs()
            });
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
        const expires_at = nowTs() + BigInt(ttl_minutes) * BigInt(60 * 1_000_000);
        if (existing) {
            existing.last_seen_at = nowTs();
            existing.expires_at = expires_at;
            ctx.db.sessions.session_token.update(existing);
        } else {
            ctx.db.sessions.insert({
                id: 0n,
                account_id: account.id,
                session_token,
                created_at: nowTs(),
                last_seen_at: nowTs(),
                expires_at,
                ip_hash: undefined
            });
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
        existing.last_seen_at = nowTs();
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
