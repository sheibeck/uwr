import { z } from 'zod';

export const Region = z.object({
    id: z.string().uuid(),
    name: z.string(),
    dangerLevel: z.number().int().min(0).max(10),
    factionControl: z.string().nullable(),
});

export const Weather = z.object({
    condition: z.enum(['CLEAR', 'RAIN', 'STORM', 'FOG', 'ARCANE_SURGE']),
    intensity: z.number().min(0).max(1),
});

export const WorldContext = z.object({
    region: Region,
    timeOfDay: z.enum(['DAWN', 'DAY', 'DUSK', 'NIGHT']),
    weather: Weather,
    activeEvents: z.array(z.string()).max(10),
    playerStatuses: z.array(z.object({
        characterId: z.string().uuid(),
        hpPct: z.number().min(0).max(1),
        buffs: z.array(z.string()).max(8),
        debuffs: z.array(z.string()).max(8)
    })).max(8)
});

export type WorldContext = z.infer<typeof WorldContext>;
