import { NarrativeResponse } from '@prompt/schemas/response.js';
import { Action } from '../intent/types.js';

export async function sendPrompt(prompt: string): Promise<NarrativeResponse> {
    // Very small deterministic mock: echo back a narration and a trivial resolution
    const narration = `MOCK: ${prompt.slice(0, 120).replace(/\n/g, ' ')}...`;
    return {
        narration,
        diegeticMessages: [],
        // Return a valid action enum value instead of a placeholder
        resolution: { action: Action.LOOK as unknown as string, success: true, summary: 'Mock accepted', effects: [] },
        loreRefsUsed: [],
        safetyFlags: []
    } as unknown as NarrativeResponse;
}
