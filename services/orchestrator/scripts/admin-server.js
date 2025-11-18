#!/usr/bin/env node
import http from 'http';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = process.env.ADMIN_PORT ? Number(process.env.ADMIN_PORT) : 3005;
const ROOT = process.cwd();

function runCli(args) {
    return new Promise((resolve, reject) => {
        const cmd = `pnpm --silent exec tsx services/orchestrator/scripts/review-hold.ts ${args}`;
        exec(cmd, { cwd: ROOT, timeout: 30_000 }, (err, stdout, stderr) => {
            if (err && err.code !== 0) return reject(err);
            return resolve((stdout || '').trim());
        });
    });
}

function parseList(output) {
    const lines = (output || '').split(/\r?\n/).filter(Boolean);
    return lines.map(l => {
        const parts = l.split(/\s+/);
        return { id: parts[0], createdAt: parts[1], errorsCount: Number(parts[2] || 0), action: parts[3] || '' };
    });
}

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
                const out = await runCli('list');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(parseList(out)));
            } catch (err) {
                res.writeHead(500);
                res.end(String(err));
            }
            return;
        }

        const promoteMatch = url.match(/^\/api\/holds\/(.+?)\/promote$/);
        const showMatch = url.match(/^\/api\/holds\/(.+?)$/);
        if (req.method === 'GET' && showMatch) {
            const id = decodeURIComponent(showMatch[1]);
            try {
                const out = await runCli(`show ${id}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                try { res.end(JSON.stringify(JSON.parse(out), null, 2)); } catch (e) { res.end(out); }
            } catch (err) {
                res.writeHead(500); res.end(String(err));
            }
            return;
        }

        if (req.method === 'POST' && promoteMatch) {
            const id = decodeURIComponent(promoteMatch[1]);
            try {
                const out = await runCli(`promote ${id}`);
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(out);
            } catch (err) {
                res.writeHead(500); res.end(String(err));
            }
            return;
        }
    }

    res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
    console.log(`Admin server listening on http://localhost:${PORT}/admin`);
});
