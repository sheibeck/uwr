import { z } from 'zod';

export const CharacterSchema = z.object({
    id: z.string(),
    ownerId: z.string(),
    name: z.string().min(1).max(32),
    race: z.string(),
    archetype: z.enum(['Fighter', 'Mystic']),
    professionName: z.string(),
    professionAbilities: z.array(z.string()),
    professionBonuses: z.record(z.number()),
    startingRegion: z.string(),
    description: z.string().max(1000),
    strength: z.number().int(),
    dexterity: z.number().int(),
    intelligence: z.number().int(),
    constitution: z.number().int(),
    wisdom: z.number().int(),
    charisma: z.number().int(),
    maxHealth: z.number().int(),
    currentHealth: z.number().int(),
    maxMana: z.number().int(),
    currentMana: z.number().int(),
    armorType: z.string().optional(),
    starterWeapon: z.string().optional(),
    level: z.number().int(),
    xp: z.number().int(),
    backpack: z.string().optional(),
});

export type Character = z.infer<typeof CharacterSchema>;
