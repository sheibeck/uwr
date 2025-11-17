// SpacetimeDB adapter.
// Falls back to local stubs unless SPACETIME_ENABLED=true in env.
import { upsertAccount as stubUpsertAccount } from '@spacetime/accounts.js';
import { createSession as stubCreateSession, touchSession as stubTouchSession } from '@spacetime/sessions.js';
import { Account, Session } from '@shared/index.js';

export interface SpaceTimeAdapter {
    upsertAccount(provider: string, providerUserId: string, displayName: string): Promise<Account>;
    createOrUpdateSession(account: Account, ttlMinutes: number): Promise<Session>;
    touchSession(session: Session): Promise<Session>;
    isRemote: boolean;
}

// Placeholder minimal connection types until bindings are generated.
// When `spacetime generate` has been run, replace these with real imports from module_bindings.
interface ConnectionBuilder {
    withUri(uri: string): ConnectionBuilder;
    withModuleName(name: string): ConnectionBuilder;
    withToken(token?: string): ConnectionBuilder;
    onConnect(cb: (...args: any[]) => void): ConnectionBuilder;
    onDisconnect(cb: (...args: any[]) => void): ConnectionBuilder;
    onConnectError(cb: (...args: any[]) => void): ConnectionBuilder;
    build(): any; // DbConnection
}

interface DbConnectionLike {
    reducers: Record<string, (...args: any[]) => void>;
    db: any;
}

function buildRemoteConnection(): DbConnectionLike | null {
    // Dynamic require avoided; we only attempt if bindings exist.
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const bindings = require('../module_bindings/index.js');
        const builder: ConnectionBuilder = (bindings.DbConnection as any).builder();
        const conn: DbConnectionLike = builder
            .withUri(process.env.SPACETIME_URI || 'ws://localhost:3000')
            .withModuleName(process.env.SPACETIME_DBNAME || 'quickstart-chat')
            .withToken(process.env.SPACETIME_TOKEN || undefined)
            .onConnect((_c: any, identity: any) => {
                // eslint-disable-next-line no-console
                console.info('Connected to SpacetimeDB', identity?.toHexString?.());
            })
            .onDisconnect(() => {
                // eslint-disable-next-line no-console
                console.info('Disconnected from SpacetimeDB');
            })
            .onConnectError((_ctx: any, err: Error) => {
                // eslint-disable-next-line no-console
                console.error('SpacetimeDB connection error', err);
            })
            .build();
        return conn;
    } catch (_e) {
        return null; // Bindings not present yet
    }
}

export function createSpaceTimeAdapter(): SpaceTimeAdapter {
    const enableRemote = process.env.SPACETIME_ENABLED === 'true';
    const remoteConn = enableRemote ? buildRemoteConnection() : null;

    if (!remoteConn) {
        // Fallback to stubs
        return {
            upsertAccount: stubUpsertAccount,
            createOrUpdateSession: async (account, ttlMinutes) => stubCreateSession(account.id, ttlMinutes),
            touchSession: stubTouchSession,
            isRemote: false
        };
    }

    // Remote implementation (optimistic; assumes reducers defined in module schema)
    return {
        async upsertAccount(provider: string, providerUserId: string, displayName: string): Promise<Account> {
            // Expect reducer name createAccount(provider, providerUserId, displayName)
            const r = remoteConn.reducers as any;
            if (r.createAccount) {
                r.createAccount(provider, providerUserId, displayName);
            } else if (r.upsertAccount) {
                r.upsertAccount(provider, providerUserId, displayName);
            }
            // We rely on subscription eventually populating db.accounts.unique index; for now return stub until cache populated.
            return {
                id: provider + ':' + providerUserId,
                provider: provider as any,
                providerUserId,
                displayName,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
        },
        async createOrUpdateSession(account: Account, ttlMinutes: number): Promise<Session> {
            const token = 'session_' + account.id + '_' + Date.now();
            const r = remoteConn.reducers as any;
            if (r.createOrUpdateSession) {
                r.createOrUpdateSession(account.providerUserId, token, ttlMinutes);
            } else if (r.createSession) {
                r.createSession(account.id, token, ttlMinutes);
            }
            return {
                id: token,
                accountId: account.id,
                createdAt: Date.now(),
                expiresAt: Date.now() + ttlMinutes * 60_000,
                lastSeenAt: Date.now(),
                ipHash: null
            };
        },
        async touchSession(session: Session): Promise<Session> {
            const r = remoteConn.reducers as any;
            if (r.touchSession) {
                r.touchSession(session.id);
            }
            return { ...session, lastSeenAt: Date.now() };
        },
        isRemote: true
    };
}
