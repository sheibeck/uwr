import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { createOrchestrator } from './index.js';

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
        res.json({ ok: true, result });
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

const port = Number(process.env.ORCHESTRATOR_PORT || 3001);
app.listen(port, () => console.log(`Orchestrator server listening on ${port}`));

export default app;
