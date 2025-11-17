import { z } from 'zod';

export const NPCProfile = z.object({
    id: z.string().uuid(),
    name: z.string(),
    faction: z.string().nullable(),
    dispositionTowardsPlayer: z.enum(['ALLY', 'NEUTRAL', 'HOSTILE', 'CURIOUS']),
    motivationSummary: z.string().max(140),
    recentDialogue: z.array(z.object({
        ts: z.number(),
        from: z.enum(['NPC', 'PLAYER']),
        text: z.string().max(300)
    })).max(10)
});

export type NPCProfile = z.infer<typeof NPCProfile>;
