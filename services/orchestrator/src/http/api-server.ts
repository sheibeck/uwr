#!/usr/bin/env tsx
import http from 'http';
import { createOrchestrator } from '../index.js';
import { readFileSync } from 'fs';

const PORT = process.env.ORCHESTRATOR_API_PORT ? Number(process.env.ORCHESTRATOR_API_PORT) : 4005;
const orch = createOrchestrator();

const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/orchestrator/action') {
        try {
            let body = '';
            for await (const chunk of req) body += chunk;
            const parsed = JSON.parse(body);
            const result = await orch.processActionRequest(parsed);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        } catch (e: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(e?.message ?? e) }));
            return;
        }
    }
    res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => console.log(`Orchestrator API listening on http://localhost:${PORT}`));
