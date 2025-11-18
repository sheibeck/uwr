import { NarrativeResponse } from '@prompt/schemas/response.js';
import { ActionRequest } from '@prompt/schemas/action.js';
import { getValidator } from '../schemas/registry.js';

export interface DispatchResult {
    response: NarrativeResponse;
    valid: boolean;
    validationErrors?: string[];
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

    const validator = getValidator('NarrativeResponse');
    if (!validator) {
        // If no generated validator exists, assume zod parsing will be used elsewhere; return as valid
        return { response, valid: true };
    }

    const ok = validator(response);
    if (ok) return { response, valid: true };
    const errors = (validator.errors || []).map((e: { instancePath?: string; message?: string }) => `${e.instancePath ?? ''} ${e.message ?? ''}`);
    return { response, valid: false, validationErrors: errors };
}

