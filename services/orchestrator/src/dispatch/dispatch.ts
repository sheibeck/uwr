import { NarrativeResponse } from '@prompt/schemas/response.js';
import { ActionRequest } from '@prompt/schemas/action.js';
import { getValidator } from '../schemas/registry.js';
import { createModelAdapter } from '../ai/index.js';

export interface DispatchResult {
    response: NarrativeResponse;
    valid: boolean;
    validationErrors?: string[];
}

export async function dispatch(req: ActionRequest, prompt: string): Promise<DispatchResult> {
    const adapter = createModelAdapter();
    let response: NarrativeResponse | null = null;
    try {
        const out = await adapter.sendPrompt(prompt);
        response = out as NarrativeResponse;
    } catch (e: any) {
        const err = String(e?.message ?? e);
        // return a held response-like object
        return { response: { narration: `Model error: ${err}` } as unknown as NarrativeResponse, valid: false, validationErrors: [err] };
    }

    const validator = getValidator('NarrativeResponse');
    if (!validator) {
        return { response: response as NarrativeResponse, valid: true };
    }

    const ok = validator(response);
    if (ok) return { response: response as NarrativeResponse, valid: true };
    const errors = (validator.errors || []).map((e: { instancePath?: string; message?: string }) => `${e.instancePath ?? ''} ${e.message ?? ''}`);
    return { response: response as NarrativeResponse, valid: false, validationErrors: errors };
}

