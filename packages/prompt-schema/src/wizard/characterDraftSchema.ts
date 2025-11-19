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
    // New structured profession object
    profession: z.object({
        name: z.string().min(1).max(80),
        abilities: z.array(z.object({ name: z.string().min(1).max(80), description: z.string().min(1).max(280) })).min(1).max(3),
        bonuses: z.record(z.string(), z.number()).optional(),
        starterWeapon: z.string().min(1).max(80).optional(),
        armorType: z.string().min(1).max(80).optional(),
        flavor: z.string().optional()
    }).optional(),

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

// Export Profession schema for structured AI generation
export const ProfessionSchema = CharacterDraftSchema.shape.profession as z.ZodTypeAny;
