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
        'Provide narrative response and structured resolution.',
        '',
        'Important output format rules (for orchestrator validation):',
        ' - Return a JSON object matching the NarrativeResponse schema: { narration, diegeticMessages, resolution, loreRefsUsed, safetyFlags }',
        ' - Inside resolution.effects each item must include { type, detail } where detail MUST be valid JSON (no pipe-delimited strings).',
        ' - Supported detail shapes (JSON):',
        '     1) Array of args (e.g. ["player:123", 5]) — the array will be passed as reducer args.',
        '     2) Object { "reducer": "reducer_name", "args": [ ... ] } — explicitly target a reducer and args.',
        ' - Prefer structured JSON to ensure safe, typed reducer invocation; DO NOT emit plain text or pipe-separated args.'
    ].join('\n');
}
