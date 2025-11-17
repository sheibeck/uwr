import { NarrativeResponse } from '@prompt/schemas/response.js';
import { ActionRequest } from '@prompt/schemas/action.js';
import { randomUUID } from 'crypto';

export interface DispatchResult {
    response: NarrativeResponse;
}

export function dispatch(req: ActionRequest): DispatchResult {
    // Placeholder deterministic stub
    const response: NarrativeResponse = {
        narration: `Stub narration for action ${req.intent.action} by ${req.intent.actorId}`,
        diegeticMessages: [],
        resolution: {
            action: req.intent.action,
            success: true,
            summary: 'Action accepted (stub)',
            effects: []
        },
        loreRefsUsed: req.loreShards.slice(0, 3),
        safetyFlags: []
    };
    // In future: write to SpaceTimeDB event log
    return { response };
}
