import { z } from 'zod';

export const AccountId = z.string().uuid();
export const ProviderId = z.enum(['SUPABASE','AUTH0']);

export const Account = z.object({
  id: AccountId,
  provider: ProviderId,
  providerUserId: z.string(),
  displayName: z.string().min(1).max(60),
  createdAt: z.number(),
  updatedAt: z.number()
});

export const Session = z.object({
  id: z.string().uuid(),
  accountId: AccountId,
  createdAt: z.number(),
  expiresAt: z.number(),
  lastSeenAt: z.number(),
  ipHash: z.string().nullable()
});

export type Account = z.infer<typeof Account>;
export type Session = z.infer<typeof Session>;
