import { z } from 'zod';

export const LoreShard = z.object({
    id: z.string(),
    category: z.enum(['WORLD', 'FACTION', 'ITEM', 'RITUAL', 'HISTORY', 'CREATURE', 'STYLE']),
    canonical: z.boolean().default(true),
    title: z.string(),
    body: z.string().describe('Structured markdown or plain text canonical lore snippet'),
    lastUpdatedBy: z.string().nullable(),
    version: z.number().int().min(1),
});

export const LoreBundle = z.object({
    generatedAt: z.number(),
    shards: z.array(LoreShard).max(100)
});

export type LoreShard = z.infer<typeof LoreShard>;
export type LoreBundle = z.infer<typeof LoreBundle>;
