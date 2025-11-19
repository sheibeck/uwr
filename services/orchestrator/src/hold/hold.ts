import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { ActionRequest } from '@prompt/schemas/action.js';
import { NarrativeResponse } from '@prompt/schemas/response.js';

const HOLD_DIR = path.resolve(process.cwd(), 'data', 'orchestrator', 'hold');

export interface HeldItem {
    id: string;
    createdAt: number;
    request: ActionRequest;
    response: NarrativeResponse;
    validationErrors: string[];
}

export function ensureHoldDir() {
    if (!fs.existsSync(HOLD_DIR)) fs.mkdirSync(HOLD_DIR, { recursive: true });
}

export function enqueueInvalidResponse(req: ActionRequest, response: NarrativeResponse, validationErrors: string[]): string {
    ensureHoldDir();
    const id = randomUUID();
    // Defensive enrichment: if the response is missing required resolution fields, try to infer from request
    const enrichedResponse = { ...response } as any;
    if (!enrichedResponse.resolution) enrichedResponse.resolution = { success: false };
    // If action missing, use the requested intent.action as a hint
    if (!enrichedResponse.resolution.action) {
        try {
            const maybeAction = (req as any)?.intent?.action;
            if (maybeAction) enrichedResponse.resolution.action = maybeAction;
        } catch (e) { }
    }
    if (!enrichedResponse.resolution.summary) enrichedResponse.resolution.summary = 'Pending human review';
    if (!Array.isArray(enrichedResponse.resolution.effects)) enrichedResponse.resolution.effects = [];

    const item: HeldItem = {
        id,
        createdAt: Date.now(),
        request: req,
        response: enrichedResponse as NarrativeResponse,
        validationErrors
    };
    const file = path.join(HOLD_DIR, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify(item, null, 2), 'utf8');
    return id;
}

export function listHeldItems(): HeldItem[] {
    ensureHoldDir();
    const files = fs.readdirSync(HOLD_DIR).filter(f => f.endsWith('.json'));
    const out: HeldItem[] = [];
    for (const f of files) {
        try {
            const raw = fs.readFileSync(path.join(HOLD_DIR, f), 'utf8');
            out.push(JSON.parse(raw) as HeldItem);
        } catch (err) {
            // ignore malformed files
        }
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
}
