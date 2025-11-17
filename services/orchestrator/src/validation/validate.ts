import { ActionRequest } from '@prompt/schemas/action.js';
import { NarrativeResponse } from '@prompt/schemas/response.js';
import { z } from 'zod';

export function validateActionRequest(input: unknown): ActionRequest {
    return (ActionRequest as unknown as z.ZodTypeAny).parse(input) as ActionRequest;
}

export function validateNarrativeResponse(input: unknown): NarrativeResponse {
    return (NarrativeResponse as unknown as z.ZodTypeAny).parse(input) as NarrativeResponse;
}
