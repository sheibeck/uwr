import { createSpaceTimeAdapter } from '../db/spacetime.js';
import { Account, Session } from '@shared/index.js';
import { ProviderId } from '@shared/accounts.js';

export interface SessionSyncResult {
  account: Account;
  session: Session;
  isNewAccount: boolean;
}

const adapter = createSpaceTimeAdapter();

export async function syncSession(provider: typeof ProviderId._def.values[number], providerUserId: string, displayName: string): Promise<SessionSyncResult> {
  // TODO: Lookup existing account by provider/providerUserId via SpaceTimeDB; stub always new.
  const account = await adapter.upsertAccount(provider, providerUserId, displayName);
  const session = await adapter.createSession(account.id, 60); // 60 minute TTL
  return { account, session, isNewAccount: true };
}
