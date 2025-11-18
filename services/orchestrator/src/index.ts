import { buildPrompt } from './prompt/builder.js';
import { loadLore, getLoreShards } from './lore/loader.js';
import { validateActionRequest } from './validation/validate.js';
import { loadGeneratedSchemas } from './schemas/registry.js';
import { dispatch } from './dispatch/dispatch.js';
import { enqueueInvalidResponse } from './hold/hold.js';
import pino from 'pino';
import { ActionRequest } from '@prompt/schemas/action.js';
import { syncSession } from './auth/session.js';
import inferAction from './intent/inferAction.js';

export class Orchestrator {
    private loreStore = loadLore();
    private log = pino({ name: 'orchestrator', level: process.env.LOG_LEVEL || 'info' });

    constructor() {
        // attempt to load generated JSON schemas for AJV validation
        // load asynchronously and log any loading errors
        loadGeneratedSchemas().catch((e) => this.log.warn({ err: e?.message ?? e }, 'Failed to load generated schemas'));
    }

    async processActionRequest(raw: unknown) {
        // If client omitted intent.action, try to infer it from narrativeGoal.
        const rawObj = (raw as any) || {};
        const intent = rawObj.intent || {};
        const narrativeGoal = intent?.narrativeGoal || '';
        if (!intent?.action) {
            try {
                const inf = inferAction(narrativeGoal);
                // Log the narrativeGoal, raw intent and inference result for debugging/tracing
                this.log.debug({ narrativeGoal, intent: rawObj.intent, inference: inf }, 'Attempted to infer action from narrativeGoal');
                this.log.info({ inference: inf }, 'Inferred action from narrativeGoal');
                const threshold = 0.8;
                if (inf.action && inf.confidence >= threshold) {
                    // auto-fill high-confidence inference
                    intent.action = inf.action;
                    rawObj.intent = intent;
                } else {
                    // low/no confidence -> return suggestion payload and do not execute reducers
                    const suggestionPayload: any = {
                        prompt: '',
                        response: { narration: inf.action ? `Suggested action: ${inf.action} (confidence ${inf.confidence.toFixed(2)}). Please confirm by resending with intent.action.` : 'Could not infer action from narrativeGoal; please include intent.action.' },
                        valid: false,
                        inferredAction: inf.action,
                        inference: inf,
                        suggestionNeeded: true
                    };
                    // Log the suggestion decision with context so it's visible in server logs
                    this.log.info({ suggestion: suggestionPayload, raw: rawObj }, 'Returning action suggestion (no reducers executed)');
                    return suggestionPayload;
                }
            } catch (e) {
                // ignore inference errors and continue to validation
                this.log.warn({ err: (e as any)?.message ?? e }, 'Action inference failed');
            }
        }

        const req = validateActionRequest(rawObj);
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
