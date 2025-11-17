import { z } from 'zod';
import { CharacterId, ActionEnvelope } from '@shared/index.js';
import { WorldContext } from './context.js';
import { NPCProfile } from './npc.js';

export const ActionType = z.enum([
    'MOVE',
    'LOOK',
    'TALK',
    'ATTACK',
    'LOOT',
    'CAST_RITUAL',
    'CRAFT',
    'EMOTE'
]);

export const PlayerIntent = z.object({
    actorId: CharacterId,
    action: ActionType,
    target: z.string().nullable().describe('Target entity id or contextual token'),
    narrativeGoal: z.string().min(3).max(280).describe('Player described intent / command text'),
    clientTs: z.number().describe('Client timestamp in ms'),
});

export const ActionRequest = z.object({
    intent: PlayerIntent,
    context: WorldContext,
    nearbyNPCs: z.array(NPCProfile).max(12),
    recentActions: z.array(ActionEnvelope).max(25),
    loreShards: z.array(z.string()).max(20).describe('Relevant lore snippet IDs fetched for grounding')
});

export type ActionRequest = z.infer<typeof ActionRequest>;
export type PlayerIntent = z.infer<typeof PlayerIntent>;
export type ActionType = z.infer<typeof ActionType>;
