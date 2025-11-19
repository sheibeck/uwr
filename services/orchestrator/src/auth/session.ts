import { createSpaceTimeAdapter } from '../db/spacetime.js';
import { Account, Session, ProviderId } from '../../../../packages/shared-schema/dist/index.js';

export interface SessionSyncResult {
    account: Account;
    session: Session;
    isNewAccount: boolean;
}

// Adapter may initialize remote bindings asynchronously. Create a promise
// and await it where used.
const adapterPromise = createSpaceTimeAdapter();

export async function syncSession(provider: typeof ProviderId._def.values[number], _providerUserId: string, displayName: string): Promise<SessionSyncResult> {
    const adapter = await adapterPromise;
    let isNew = false;
    let account = null as Account | null;

    // Always resolve by displayName (per new requirement). Ignore providerUserId.
    if (displayName) {
        account = await adapter.findAccountByDisplayName(provider, displayName) as Account | undefined || null;
    }

    // If not found, create a new account using a synthesized providerUserId
    if (!account) {
        const effectiveProviderUserId = `local:${displayName.toLowerCase().replace(/\s+/g, '_')}`;
        account = await adapter.upsertAccount(provider, effectiveProviderUserId, displayName);
        isNew = true;
    } else {
        // Refresh display name on existing account
        account = await adapter.upsertAccount(provider, account.providerUserId, displayName);
    }
    const session = await adapter.createOrUpdateSession(account!, 60); // 60 minute TTL
    return { account: account!, session, isNewAccount: isNew };
}
