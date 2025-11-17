// SpaceTimeDB adapter stub
import { upsertAccount } from '@spacetime/accounts.js';
import { createSession, touchSession } from '@spacetime/sessions.js';
import { Account, Session } from '@shared/index.js';

export interface SpaceTimeAdapter {
  upsertAccount(provider: string, providerUserId: string, displayName: string): Promise<Account>;
  createSession(accountId: string, ttlMinutes: number): Promise<Session>;
  touchSession(session: Session): Promise<Session>;
}

export function createSpaceTimeAdapter(): SpaceTimeAdapter {
  return {
    upsertAccount,
    createSession,
    touchSession
  };
}
