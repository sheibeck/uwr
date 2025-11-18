import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { createOrchestrator } from './index.js';

// Helper: safely serialize objects that may contain BigInt values.
// JSON.stringify throws on BigInt, so we convert BigInt to Number when it
// fits in JS safe integer range, otherwise to string.
function bigintReplacer(_key: string, value: any) {
    if (typeof value === 'bigint') {
        const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
        const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
        if (value <= maxSafe && value >= minSafe) return Number(value);
        return value.toString();
    }
    return value;
}

function safeSerialize<T>(obj: T): T {
    try {
        // stringify with replacer then parse back to object to remove BigInt
        return JSON.parse(JSON.stringify(obj, bigintReplacer));
    } catch (e) {
        // As a fallback, do a shallow transform that replaces BigInt values
        // with strings on plain objects/arrays.
        const seen = new WeakSet();
        const transform = (v: any): any => {
            if (v === null || v === undefined) return v;
            if (typeof v === 'bigint') return v.toString();
            if (typeof v !== 'object') return v;
            if (seen.has(v)) return undefined;
            seen.add(v);
            if (Array.isArray(v)) return v.map(transform);
            const out: any = {};
            for (const k of Object.keys(v)) {
                out[k] = transform(v[k]);
            }
            return out;
        };
        return transform(obj) as T;
    }
}

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
    res.json(safeSerialize(result));
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

const port = Number(process.env.ORCHESTRATOR_PORT || 3001);
app.listen(port, () => console.log(`Orchestrator server listening on ${port}`));

export default app;
