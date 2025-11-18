#!/usr/bin/env tsx
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listHeld, showHeld, promote } from './review-hold.js';

const PORT = process.env.ADMIN_PORT ? Number(process.env.ADMIN_PORT) : 3005;
const ROOT = process.cwd();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');

const server = http.createServer(async (req, res) => {
    const url = req.url || '/';
    if (url === '/' || url === '/admin') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(adminHtml);
        return;
    }

    if (url.startsWith('/api/holds')) {
        if (req.method === 'GET' && url === '/api/holds') {
            try {
                const out = captureList();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(out));
            } catch (err) {
                res.writeHead(500);
                res.end(String(err));
            }
            return;
        }

        const promoteMatch = url.match(/^\/api\/holds\/(.+?)\/promote$/);
        const showMatch = url.match(/^\/api\/holds\/(.+?)$/);
        if (req.method === 'GET' && showMatch) {
            const id = decodeURIComponent(showMatch[1]!);
            try {
                const out = showHeld(id);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(typeof out === 'string' ? out : JSON.stringify(out, null, 2));
            } catch (err) {
                res.writeHead(500); res.end(String(err));
            }
            return;
        }

        if (req.method === 'POST' && promoteMatch) {
            const id = decodeURIComponent(promoteMatch[1]!);
            try {
                await promote(id);
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('promoted');
            } catch (err) {
                res.writeHead(500); res.end(String(err));
            }
            return;
        }
    }

    res.writeHead(404); res.end('Not found');
});

function captureList() {
    // listHeld prints to stdout; replicate the logic locally to return structured data
    // by reading the hold directory directly.
    const HOLD_DIR = path.resolve(process.cwd(), 'data', 'orchestrator', 'hold');
    if (!fs.existsSync(HOLD_DIR)) return [];
    const files = fs.readdirSync(HOLD_DIR).filter(f => f.endsWith('.json'));
    return files.map(f => {
        const raw = fs.readFileSync(path.join(HOLD_DIR, f), 'utf8');
        const parsed = JSON.parse(raw);
        return { id: parsed.id, createdAt: parsed.createdAt, errorsCount: parsed.validationErrors?.length || 0, action: parsed.request?.intent?.action };
    });
}

server.listen(PORT, () => {
    console.log(`Admin server listening on http://localhost:${PORT}/admin`);
});
