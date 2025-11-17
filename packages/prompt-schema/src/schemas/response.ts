import { z } from 'zod';
import { ActionType } from './action.js';

export const ActionResolution = z.object({
    action: ActionType,
    success: z.boolean(),
    summary: z.string().max(200),
    effects: z.array(z.object({
        type: z.enum(['STAT_CHANGE', 'ITEM_GAIN', 'ITEM_LOSS', 'MOB_SPAWN', 'NPC_STATE', 'WORLD_EVENT']),
        detail: z.string().max(240)
    })).max(15),
});

export const NarrativeResponse = z.object({
    narration: z.string().max(1200),
    diegeticMessages: z.array(z.string().max(300)).max(5),
    resolution: ActionResolution,
    loreRefsUsed: z.array(z.string()).max(20),
    safetyFlags: z.array(z.enum(['CONTENT_FILTERED', 'POTENTIAL_CANON_CONFLICT', 'NEEDS_HUMAN_REVIEW'])).max(5)
});

export type NarrativeResponse = z.infer<typeof NarrativeResponse>;
