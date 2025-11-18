import { ActionRequest } from '@prompt/schemas/action.js';
import { NarrativeResponse } from '@prompt/schemas/response.js';
import { z } from 'zod';
import { getValidator } from '../schemas/registry.js';

function ajvValidateOrNull(schemaName: string, input: unknown): any | null {
    const v = getValidator(schemaName);
    if (!v) return null;
    const ok = v(input);
    if (ok) return input;
    const errs = v.errors?.map((e: { instancePath?: string; message?: string }) => `${e.instancePath ?? ''} ${e.message ?? ''}`).join(', ');
    throw new Error(`JSON Schema validation failed for ${schemaName}: ${errs}`);
}

export function validateActionRequest(input: unknown): ActionRequest {
    const ajvResult = ajvValidateOrNull('ActionRequest', input);
    if (ajvResult) return ajvResult as ActionRequest;
    return (ActionRequest as unknown as z.ZodTypeAny).parse(input) as ActionRequest;
}

export function validateNarrativeResponse(input: unknown): NarrativeResponse {
    const ajvResult = ajvValidateOrNull('NarrativeResponse', input);
    if (ajvResult) return ajvResult as NarrativeResponse;
    return (NarrativeResponse as unknown as z.ZodTypeAny).parse(input) as NarrativeResponse;
}
