import { describe, it, expect } from 'vitest';
import { createOrchestrator } from '../index.js';

describe('session sync', () => {
    it('creates account and session stub', async () => {
        const orch = createOrchestrator();
        const { account, session, isNewAccount } = await orch.sessionSync('SUPABASE', 'provider-user-123', 'TestUser');
        expect(account.displayName).toBe('TestUser');
        expect(session.accountId).toBe(account.id);
        expect(isNewAccount).toBe(true);
        expect(session.expiresAt).toBeGreaterThan(session.createdAt);
    });
});
