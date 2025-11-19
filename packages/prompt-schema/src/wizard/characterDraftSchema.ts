import { z } from 'zod';

export const CharacterDraftSchema = z.object({
    draftId: z.string().optional(),
    ownerId: z.string(),

    // Core fields (optional while drafting)
    name: z.string().min(1).max(32).optional(),
    race: z.string().optional(),
    archetype: z.enum(['Fighter', 'Mystic']).optional(),

    // Profession metadata populated by AI
    professionName: z.string().optional(),
    professionAbilities: z.array(z.string()).optional(),
    professionBonuses: z.record(z.number()).optional(),

    startingRegion: z.string().optional(),
    description: z.string().max(280).optional(),

    // attributes and derived fields
    strength: z.number().int().optional(),
    dexterity: z.number().int().optional(),
    intelligence: z.number().int().optional(),
    constitution: z.number().int().optional(),
    wisdom: z.number().int().optional(),
    charisma: z.number().int().optional(),

    // meta
    aiMetadata: z.any().optional(),
    lastUpdated: z.string().optional()
});

export type CharacterDraft = z.infer<typeof CharacterDraftSchema>;
