import express, { Request, Response } from 'express';
// Load local .env in development so SPACETIME_ADMIN_TOKEN and others are available
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dotenv = await import('dotenv');
    dotenv.config?.();
} catch (err) {
    // ignore if dotenv not present
}
import bodyParser from 'body-parser';
import { createOrchestrator } from './index.js';
import { getRemoteConnection } from './db/spacetime.js';
import * as charactersMgr from './orchestrator/characters.js';
import safeSerialize from './utils/serialize.js';

const app = express();
app.use(bodyParser.json());

const orchestrator = createOrchestrator();

app.get('/api/health', (_req: Request, res: Response) => res.json({ ok: true }));

app.post('/api/sessionSync', async (req: Request, res: Response) => {
    try {
        const body = req.body as Record<string, unknown> | undefined;
        const provider = (body?.provider as string) || 'SUPABASE';
        const displayName = (body?.displayName as string) || '';
        // sessionSync now resolves accounts by displayName only; providerUserId is ignored.
        const result = await orchestrator.sessionSync(provider as any, '', displayName);
        res.json(safeSerialize({ ok: true, result }));
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

app.post('/api/orchestrator/action', async (req: Request, res: Response) => {
    try {
        const body = req.body;
        const result = await orchestrator.processActionRequest(body);
        // Ensure we always return a top-level response object (with narration)
        // so front-end rendering doesn't throw when accessing result.response.narration.
        const payload: any = Object.assign({}, result || {}, { ok: true });
        res.json(safeSerialize(payload));
    } catch (err: any) {
        const msg = err?.message || String(err);
        const payload = { ok: false, error: msg, response: { narration: `Server error: ${msg}` } };
        res.status(500).json(safeSerialize(payload));
    }
});

// Profession suggestion endpoint for character wizard
app.post('/api/wizard/profession', async (req: Request, res: Response) => {
    try {
        const body = req.body as { race?: string; archetype?: string } | undefined;
        const race = (body?.race as string) || '';
        const archetype = (body?.archetype as string) || '';
        // Lazy import to avoid startup cost
        const { CharacterWizard } = await import('./orchestrator/characterWizard');
        const wiz = new CharacterWizard(undefined, process.env.SPACETIME_URI || 'ws://localhost:3000', process.env.SPACETIME_DBNAME || 'unwritten-realms');
        const suggestion = await wiz.suggestProfession(race, archetype);
        res.json({ ok: true, suggestion });
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

// Proxy/mint a Spacetime websocket token for the browser.
// Helper to tolerate quoted or whitespace-padded tokens in .env
function normalizeToken(v?: string): string | undefined {
    if (!v) return v;
    const t = v.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        return t.slice(1, -1);
    }
    return t;
}

// (websocket-token endpoint removed; we rely on host identity flow and /api/spacetime/identity)

// Proxy: create an identity on the host and return the token to the client.
// This avoids CORS issues when the browser cannot call the host directly.
app.post('/api/spacetime/identity', async (req: Request, res: Response) => {
    try {
        const host = (process.env.SPACETIME_HTTP_ORIGIN || process.env.SPACETIME_URI || 'http://localhost:3000').replace(/^ws:/, 'http:');
        const url = new URL('/v1/identity', host).href;
        const body = req.body || {};
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
        const text = await r.text();
        try {
            const parsed = JSON.parse(text);
            return res.status(r.status).json(parsed);
        } catch {
            return res.status(r.status).send(text);
        }
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

// NOTE: SSE streaming removed in favor of client-side Spacetime subscriptions.

// Character management endpoints (simple wrappers around Spacetime reducers)
app.get('/api/characters', async (req: Request, res: Response) => {
    try {
        // optional query: ownerId
        const ownerId = (req.query.ownerId as string) || undefined;
        const out = await charactersMgr.listCharacters(ownerId);
        res.json({ ok: true, characters: out });
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

app.post('/api/characters', async (req: Request, res: Response) => {
    try {
        const body = req.body || {};
        // Expecting: { name, description?, race?, archetype?, profession?, starting_region?, ownerId }
        const { name, description, race, archetype, profession, starting_region, ownerId } = body;
        const result = await charactersMgr.createCharacter(name, { description, race, archetype, profession, starting_region, ownerId });
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

app.post('/api/characters/:id/activate', async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        if (!id) return res.status(400).json({ ok: false, error: 'missing id' });
        const r = await charactersMgr.activateCharacter(id as string);
        if (r.ok) return res.json({ ok: true });
        return res.status(404).json(r);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

app.delete('/api/characters/:id', async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        if (!id) return res.status(400).json({ ok: false, error: 'missing id' });
        const r = await charactersMgr.removeCharacter(id as string);
        if (r.ok) return res.json({ ok: true });
        return res.status(404).json(r);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

const port = Number(process.env.ORCHESTRATOR_PORT || 3001);
// Log whether admin token is present (do not log the token itself).
try {
    console.log('startup: SPACETIME_ADMIN_TOKEN present=', !!process.env.SPACETIME_ADMIN_TOKEN, 'len=', process.env.SPACETIME_ADMIN_TOKEN?.length ?? 0);
} catch (e) { /* ignore */ }
app.listen(port, () => console.log(`Orchestrator server listening on ${port}`));

export default app;
