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

async function buildRemoteConnection(): Promise<DbConnectionLike | null> {
    // Try to dynamically import generated bindings using file URLs. This works
    // in ESM runtime (tsx / node --experimental-loader) and supports .ts
    // sources when running under tsx.
    try {
        const candidates = [
            new URL('../module_bindings/index.js', import.meta.url).href,
            new URL('../module_bindings/index.ts', import.meta.url).href,
            new URL('../module_bindings/index', import.meta.url).href,
        ];

        let bindings: any = null;
        for (const c of candidates) {
            try {
                // dynamic import
                // eslint-disable-next-line no-console
                const mod = await import(c);
                bindings = mod;
                // eslint-disable-next-line no-console
                console.info(`Loaded module bindings from ${c}`);
                break;
            } catch (e) {
                // eslint-disable-next-line no-console
                // console.debug(`Could not import bindings ${c}:`, e?.message || e);
            }
        }

        if (!bindings) throw new Error('module_bindings not found');

        const builder: ConnectionBuilder = (bindings.DbConnection as any).builder();
        const conn: DbConnectionLike = builder
            .withUri(process.env.SPACETIME_URI || 'ws://localhost:3000')
            .withModuleName(process.env.SPACETIME_DBNAME || 'unwritten-realms')
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

        // eslint-disable-next-line no-console
        console.info('Built remote SpacetimeDB connection');
        return conn;
    } catch (_e) {
        // eslint-disable-next-line no-console
        console.info('No module bindings available; using local stubs');
        return null; // Bindings not present yet
    }
}

export async function createSpaceTimeAdapter(): Promise<SpaceTimeAdapter> {
    const enableRemote = process.env.SPACETIME_ENABLED === 'true';
    const remoteConn = enableRemote ? await buildRemoteConnection() : null;

    if (!remoteConn) {
        // Fallback to stubs
        return {
            upsertAccount: stubUpsertAccount,
            createOrUpdateSession: async (account, ttlMinutes) => stubCreateSession(account.id, ttlMinutes),
            touchSession: stubTouchSession,
            isRemote: false,
        };
    }

    // Remote implementation (optimistic; assumes reducers defined in module schema)
    return {
        async upsertAccount(provider: string, providerUserId: string, displayName: string): Promise<Account> {
            const r = remoteConn.reducers as any;
            try {
                // Log available reducers for easier debugging.
                // eslint-disable-next-line no-console
                console.info('Spacetime reducers available:', Object.keys(r || {}));
            } catch { }

            // Try common reducer name variants (snake_case and camelCase)
            const tryReducer = (names: string[], ...args: any[]) => {
                for (const name of names) {
                    if (r && typeof r[name] === 'function') {
                        try {
                            r[name](...args);
                            // eslint-disable-next-line no-console
                            console.info(`Called reducer ${name}`);
                        } catch (e) {
                            // eslint-disable-next-line no-console
                            console.error(`Reducer ${name} threw`, e);
                        }
                        return true;
                    }
                }
                return false;
            };

            // Try insert/update reducer variants
            tryReducer(['create_account', 'createAccount', 'upsert_account', 'upsertAccount'], provider, providerUserId, displayName);

            // We rely on subscription eventually populating db.accounts.unique index; for now return a local representation.
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

            const tryReducer = (names: string[], ...args: any[]) => {
                for (const name of names) {
                    if (r && typeof r[name] === 'function') {
                        try {
                            r[name](...args);
                            // eslint-disable-next-line no-console
                            console.info(`Called reducer ${name}`);
                        } catch (e) {
                            // eslint-disable-next-line no-console
                            console.error(`Reducer ${name} threw`, e);
                        }
                        return true;
                    }
                }
                return false;
            };

            // Try various reducer names. create_or_update_session expects (provider_user_id, session_token, ttl_minutes)
            tryReducer(['create_or_update_session', 'createOrUpdateSession', 'create_session', 'createSession'], account.providerUserId, token, ttlMinutes);

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
            try {
                const tryNames = ['touch_session', 'touchSession'];
                for (const n of tryNames) {
                    if (r && typeof r[n] === 'function') {
                        try {
                            r[n](session.id);
                            // eslint-disable-next-line no-console
                            console.info(`Called reducer ${n}`);
                        } catch (e) {
                            // eslint-disable-next-line no-console
                            console.error(`Reducer ${n} threw`, e);
                        }
                        break;
                    }
                }
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error('Error calling touch reducer', e);
            }
            return { ...session, lastSeenAt: Date.now() };
        },
        isRemote: true
    };
}
