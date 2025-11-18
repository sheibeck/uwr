import { NarrativeResponse } from '@prompt/schemas/response.js';

export async function sendPrompt(prompt: string): Promise<NarrativeResponse> {
    // Very small deterministic mock: echo back a narration and a trivial resolution
    const narration = `MOCK: ${prompt.slice(0, 120).replace(/\n/g, ' ')}...`;
    return {
        narration,
        diegeticMessages: [],
        resolution: { action: 'MOCK_ACTION', success: true, summary: 'Mock accepted', effects: [] },
        loreRefsUsed: [],
        safetyFlags: []
    } as unknown as NarrativeResponse;
}
