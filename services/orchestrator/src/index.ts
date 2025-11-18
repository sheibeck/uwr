import { buildPrompt } from './prompt/builder.js';
import { loadLore, getLoreShards } from './lore/loader.js';
import { validateActionRequest } from './validation/validate.js';
import { loadGeneratedSchemas } from './schemas/registry.js';
import { dispatch } from './dispatch/dispatch.js';
import { enqueueInvalidResponse } from './hold/hold.js';
import pino from 'pino';
import { ActionRequest } from '@prompt/schemas/action.js';
import { syncSession } from './auth/session.js';

export class Orchestrator {
    private loreStore = loadLore();
    private log = pino({ name: 'orchestrator', level: process.env.LOG_LEVEL || 'info' });

    constructor() {
        // attempt to load generated JSON schemas for AJV validation
        // load asynchronously and log any loading errors
        loadGeneratedSchemas().catch((e) => this.log.warn({ err: e?.message ?? e }, 'Failed to load generated schemas'));
    }

    async processActionRequest(raw: unknown) {
        const req = validateActionRequest(raw);
        const lore = getLoreShards(req.loreShards, this.loreStore);
        const prompt = buildPrompt(req, lore);
        this.log.debug({ promptLength: prompt.length }, 'Prompt built');
        const result = await dispatch(req, prompt);
        if (!result.valid) {
            this.log.warn({ errors: result.validationErrors }, 'NarrativeResponse failed JSON Schema validation');
            // enqueue to human-in-the-loop hold queue and prevent DB dispatch
            const holdId = enqueueInvalidResponse(req, result.response, result.validationErrors || []);
            return { prompt, response: result.response, valid: false, validationErrors: result.validationErrors, holdId };
        }
        return { prompt, response: result.response, valid: true };
    }

    async sessionSync(provider: 'SUPABASE' | 'AUTH0', providerUserId: string, displayName: string) {
        const result = await syncSession(provider, providerUserId, displayName);
        this.log.info({ accountId: result.account.id, sessionId: result.session.id }, 'Session synced');
        return result;
    }
}

// Simple factory
export function createOrchestrator() {
    return new Orchestrator();
}
