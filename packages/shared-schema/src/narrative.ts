import { z } from 'zod';

export const NarrativeResponse = z.object({
    narration: z.string(),
    diegeticMessages: z.array(z.any()),
    resolution: z.object({ success: z.boolean() }).optional(),
    loreRefsUsed: z.array(z.any()),
    safetyFlags: z.array(z.any())
});

export type NarrativeResponse = z.infer<typeof NarrativeResponse>;

export default NarrativeResponse;
