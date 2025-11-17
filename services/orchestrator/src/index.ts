import { buildPrompt } from './prompt/builder.js';
import { loadLore, getLoreShards } from './lore/loader.js';
import { validateActionRequest } from './validation/validate.js';
import { dispatch } from './dispatch/dispatch.js';
import pino from 'pino';
import { ActionRequest } from '@prompt/schemas/action';

export class Orchestrator {
    private loreStore = loadLore();
    private log = pino({ name: 'orchestrator', level: process.env.LOG_LEVEL || 'info' });

    processActionRequest(raw: unknown) {
        const req = validateActionRequest(raw);
        const lore = getLoreShards(req.loreShards, this.loreStore);
        const prompt = buildPrompt(req, lore);
        this.log.debug({ promptLength: prompt.length }, 'Prompt built');
        const { response } = dispatch(req);
        return { prompt, response };
    }
}

// Simple factory
export function createOrchestrator() {
    return new Orchestrator();
}
