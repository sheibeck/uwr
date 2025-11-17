import { ActionRequest } from '@prompt/schemas/action.js';
import { LoreShard } from '@prompt/schemas/lore.js';

export interface PromptAssemblyOptions {
    maxLoreShards?: number;
}

export function buildPrompt(req: ActionRequest, lore: LoreShard[], opts: PromptAssemblyOptions = {}): string {
    const shardLimit = opts.maxLoreShards ?? 8;
    const loreSlice = lore.slice(0, shardLimit);
    const loreText = loreSlice.map(s => `[#${s.id}] ${s.title}: ${s.body}`).join('\n');
    return [
        '=== PLAYER INTENT ===',
        `${req.intent.narrativeGoal}`,
        '=== CONTEXT REGION ===',
        `${req.context.region.name} (danger ${req.context.region.dangerLevel}) time=${req.context.timeOfDay}`,
        '=== WEATHER ===',
        `${req.context.weather.condition} intensity=${req.context.weather.intensity}`,
        '=== NPCs NEARBY ===',
        req.nearbyNPCs.map((n: any) => `${n.name}(${n.dispositionTowardsPlayer})`).join(', ') || 'None',
        '=== RECENT ACTION TYPES ===',
        req.recentActions.map((a: any) => a.type).join(', ') || 'None',
        '=== LORE SHARDS ===',
        loreText || 'None',
        '=== TASK ===',
        'Provide narrative response and structured resolution.'
    ].join('\n');
}
