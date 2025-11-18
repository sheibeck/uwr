// SpacetimeDB adapter.
// Falls back to local stubs unless SPACETIME_ENABLED=true in env.
import { upsertAccount as stubUpsertAccount } from '@spacetime/accounts.js';
import { createSession as stubCreateSession, touchSession as stubTouchSession } from '@spacetime/sessions.js';
import { Account, Session } from '@shared/index.js';

export interface SpaceTimeAdapter {
    upsertAccount(provider: string, providerUserId: string, displayName: string): Promise<Account>;
    findAccount(provider: string, providerUserId: string): Promise<Account | undefined>;
    findAccountByDisplayName(provider: string, displayName: string): Promise<Account | undefined>;
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

        // We'll wait for onConnect or onConnectError before returning the conn
        // so callers can safely call reducers after adapter resolves.
        let resolveConnected: () => void;
        let rejectConnected: (err: any) => void;
        const connectPromise = new Promise<void>((res, rej) => {
            resolveConnected = res;
            rejectConnected = rej;
        });

        const conn: DbConnectionLike = builder
            .withUri(process.env.SPACETIME_URI || 'ws://localhost:3000')
            .withModuleName(process.env.SPACETIME_DBNAME || 'unwritten-realms')
            .withToken(process.env.SPACETIME_TOKEN || undefined)
            .onConnect((_c: any, identity: any) => {
                // eslint-disable-next-line no-console
                console.info('Connected to SpacetimeDB', identity?.toHexString?.());
                // resolve the connect promise
                try { resolveConnected(); } catch { /* ignore if already resolved */ }
            })
            .onDisconnect(() => {
                // eslint-disable-next-line no-console
                console.info('Disconnected from SpacetimeDB');
            })
            .onConnectError((_ctx: any, err: Error) => {
                // eslint-disable-next-line no-console
                console.error('SpacetimeDB connection error', err);
                try { rejectConnected(err); } catch { /* ignore */ }
            })
            .build();

        // eslint-disable-next-line no-console
        console.info('Built remote SpacetimeDB connection (waiting for onConnect)');

        // Wait up to 5s for connection; if it doesn't connect, continue but warn.
        try {
            await Promise.race([
                connectPromise,
                new Promise((_, rej) => setTimeout(() => rej(new Error('connect timeout')), 5000))
            ]);
            // eslint-disable-next-line no-console
            console.info('SpacetimeDB connection established (ready to call reducers)');
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('SpacetimeDB did not connect before timeout or errored:', (e as any)?.message || e);
        }

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
            findAccount: async (_provider: string, _providerUserId: string) => undefined,
            findAccountByDisplayName: async (_provider: string, _displayName: string) => undefined,
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
        async findAccount(provider: string, providerUserId: string): Promise<Account | undefined> {
            try {
                const db = (remoteConn as any).db;
                // try both naming conventions used in bindings
                if (db && db.accounts) {
                    const idx = db.accounts.providerUserId || db.accounts.provider_user_id;
                    if (idx && typeof idx.find === 'function') {
                        return idx.find(providerUserId);
                    }
                }
            } catch (e) {
                // ignore and return undefined
            }
            return undefined;
        },
        async findAccountByDisplayName(provider: string, displayName: string): Promise<Account | undefined> {
            try {
                const db = (remoteConn as any).db;
                if (db && db.accounts && typeof db.accounts.iter === 'function') {
                    for (const row of db.accounts.iter()) {
                        try {
                            if (row.provider === provider && row.displayName === displayName) return row as Account;
                        } catch { /* ignore row shape issues */ }
                    }
                }
            } catch (e) {
                // ignore and return undefined
            }
            return undefined;
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

// Attempt to apply a NarrativeResponse's effects to the DB via reducers.
export async function applyNarrativeResponse(response: any, adapter?: SpaceTimeAdapter): Promise<{ success: boolean; errors?: string[] }> {
    const errors: string[] = [];
    try {
        const enableRemote = process.env.SPACETIME_ENABLED === 'true';
        if (!enableRemote) {
            // Log intended effects when using stubs
            // eslint-disable-next-line no-console
            console.info('applyNarrativeResponse (stub):', JSON.stringify(response, null, 2));
            return { success: true };
        }

        // Try to build a remote connection (reuses existing helper)
        const conn = await buildRemoteConnection();
        if (!conn || !conn.reducers) {
            return { success: false, errors: ['no remote reducers available'] };
        }

        const r = conn.reducers as any;
        // Effects may contain reducer hints in the detail field using the format:
        // "reducer:<reducer_name>|arg1|arg2|..."
        // Helper: parse effect.detail which must be valid JSON.
        // Supported shapes:
        //  - Array: treated as args list
        //  - Object: { reducer?: string, args?: any[] }
        function parseEffectDetail(detail: string): { reducer?: string; args: any[] } {
            if (!detail) return { args: [] };
            try {
                const parsed = JSON.parse(detail);
                if (Array.isArray(parsed)) return { args: parsed };
                if (typeof parsed === 'object' && parsed !== null) {
                    const reducer = typeof (parsed as any).reducer === 'string' ? (parsed as any).reducer : undefined;
                    const args = Array.isArray((parsed as any).args) ? (parsed as any).args : [];
                    return { reducer, args };
                }
                // Primitive -> single arg
                return { args: [parsed] };
            } catch (e: any) {
                // Invalid JSON -> treat as no args
                // eslint-disable-next-line no-console
                console.warn('effect.detail is not valid JSON, ignoring:', detail, e?.message ?? e);
                return { args: [] };
            }
        }

        // Mapping from effect types to likely reducer names (extendable)
        const effectReducerCandidates: Record<string, string[]> = {
            STAT_CHANGE: ['stat_change', 'apply_stat_change', 'update_stats', 'statChange'],
            ITEM_GAIN: ['grant_item', 'give_item', 'add_item', 'grantItem'],
            ITEM_LOSS: ['remove_item', 'take_item', 'removeItem'],
            MOB_SPAWN: ['spawn_mob', 'spawnMob', 'create_mob', 'createMob'],
            NPC_STATE: ['set_npc_state', 'update_npc_state', 'setNpcState'],
            WORLD_EVENT: ['create_world_event', 'emit_world_event', 'trigger_world_event', 'createWorldEvent']
        };

        for (const eff of (response?.resolution?.effects || [])) {
            const detail: string = typeof eff?.detail === 'string' ? eff.detail : '';
            const type: string = (eff?.type ?? '').toString();
            let called = false;
            const reducers = r as Record<string, any>;

            // 1) Try mapping by effect.type
            const candidates = effectReducerCandidates[type] ?? [];
            const parsedDetail = parseEffectDetail(detail);
            const argsFromDetail = parsedDetail.args;
            for (const cand of candidates) {
                const candNames = [cand, cand.replace(/_([a-z])/g, (_, c) => (c || '').toUpperCase())];
                for (const name of candNames) {
                    if (name && typeof reducers[name] === 'function') {
                        try {
                            reducers[name](...argsFromDetail);
                            // eslint-disable-next-line no-console
                            console.info(`Called mapped reducer ${name} for effect type ${type} with args`, argsFromDetail);
                            called = true;
                            break;
                        } catch (e: any) {
                            errors.push(`mapped reducer ${name} threw: ${e?.message ?? String(e)}`);
                        }
                    }
                }
                if (called) break;
            }

            if (called) continue;

            // 2) If detail included an explicit reducer field, try that
            if (parsedDetail.reducer) {
                const reducerName: string = parsedDetail.reducer;
                const args = parsedDetail.args ?? [];
                const candidateNames = [reducerName, reducerName.replace(/_([a-z])/g, (_, c) => (c || '').toUpperCase())];
                let found = false;
                for (const cName of candidateNames) {
                    if (cName && typeof reducers[cName] === 'function') {
                        try {
                            reducers[cName](...args);
                            // eslint-disable-next-line no-console
                            console.info(`Called reducer ${cName} with args`, args);
                            found = true;
                            break;
                        } catch (e: any) {
                            errors.push(`reducer ${cName} threw: ${e?.message ?? String(e)}`);
                        }
                    }
                }
                if (!found) {
                    errors.push(`reducer ${reducerName} not found on remote reducers`);
                }
                continue;
            }

            // 3) No mapping or explicit reducer found — log and skip
            // eslint-disable-next-line no-console
            console.info('No reducer mapping or explicit reducer for effect, skipping:', type, detail);
        }

        if (errors.length > 0) return { success: false, errors };
        return { success: true };
    } catch (e: any) {
        return { success: false, errors: [e?.message ?? String(e)] };
    }
}
