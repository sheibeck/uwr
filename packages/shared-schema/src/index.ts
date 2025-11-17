import { z } from 'zod';
export * from './accounts.js';

export const CharacterId = z.string().uuid();
export const ActionEnvelope = z.object({
    id: z.string().uuid(),
    actorId: CharacterId,
    type: z.string(),
    payload: z.any(),
    ts: z.number()
});

export type ActionEnvelope = z.infer<typeof ActionEnvelope>;
