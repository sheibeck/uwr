// SpaceTimeDB sessions module stub
import { Session } from '../../shared-schema/dist/index.js';
import { randomUUID } from 'crypto';

export async function createSession(accountId: string, ttlMinutes: number): Promise<Session> {
    const now = Date.now();
    const expiresAt = now + ttlMinutes * 60_000;
    return {
        id: randomUUID(),
        accountId,
        createdAt: now,
        expiresAt,
        lastSeenAt: now,
        ipHash: null
    };
}

export async function touchSession(session: Session): Promise<Session> {
    const updated = { ...session, lastSeenAt: Date.now() };
    return updated;
}
