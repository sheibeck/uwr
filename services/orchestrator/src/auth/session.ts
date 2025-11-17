import { createSpaceTimeAdapter } from '../db/spacetime.js';
import { Account, Session } from '@shared/index.js';
import { ProviderId } from '@shared/accounts.js';

export interface SessionSyncResult {
    account: Account;
    session: Session;
    isNewAccount: boolean;
}

// Adapter may initialize remote bindings asynchronously. Create a promise
// and await it where used.
const adapterPromise = createSpaceTimeAdapter();

export async function syncSession(provider: typeof ProviderId._def.values[number], providerUserId: string, displayName: string): Promise<SessionSyncResult> {
    const adapter = await adapterPromise;
    const account = await adapter.upsertAccount(provider, providerUserId, displayName);
    const session = await adapter.createOrUpdateSession(account, 60); // 60 minute TTL
    return { account, session, isNewAccount: true };
}
