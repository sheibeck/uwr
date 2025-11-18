#!/usr/bin/env tsx
/*
    Admin server (programmatic) - basic info

    Environment variables:
        - ADMIN_USER: admin username (default: 'admin')
        - ADMIN_PASS: admin password (default: 'password')
        - ADMIN_PORT: port to listen on (default: 3005)

    Security note:
        - Defaults are intentionally weak for local development only.
        - For any non-local deployment, set strong credentials and bind the
            admin server to localhost (127.0.0.1) or protect it with a firewall/HTTP proxy.
*/
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listHeld, showHeld, promote } from './review-hold.js';

const PORT = process.env.ADMIN_PORT ? Number(process.env.ADMIN_PORT) : 3005;
// bind host: default to localhost to avoid accidental exposure
const HOST = process.env.ADMIN_HOST || '127.0.0.1';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Repo root is three levels up from scripts folder
const ROOT = path.resolve(__dirname, '..', '..', '..');
const adminHtml = fs.readFileSync(path.join(ROOT, 'services', 'orchestrator', 'public', 'admin.html'), 'utf8');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'password';

function unauthorized(res: http.ServerResponse) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Admin"' });
    res.end('Unauthorized');
}

function checkAuth(req: http.IncomingMessage, res: http.ServerResponse) {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Basic ')) {
        unauthorized(res);
        return false;
    }
    const b64 = auth.slice(6);
    const buf = Buffer.from(b64, 'base64');
    const [user, pass] = buf.toString('utf8').split(':');
    if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
        unauthorized(res);
        return false;
    }
    return true;
}

const server = http.createServer(async (req, res) => {
    const url = req.url || '/';
    // health endpoints are public
    if (url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
        return;
    }
    if (url === '/ready') {
        const HOLD_DIR = path.join(ROOT, 'data', 'orchestrator', 'hold');
        const ready = fs.existsSync(HOLD_DIR) && fs.accessSync(HOLD_DIR, fs.constants.R_OK) === undefined;
        if (ready) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ready: true }));
        } else {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ready: false }));
        }
        return;
    }
    // protect admin UI and API endpoints
    if (url === '/' || url === '/admin' || url.startsWith('/api/holds')) {
        if (!checkAuth(req, res)) return;
    }

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
        const clearMatch = url.match(/^\/api\/holds\/(.+?)\/clear$/);
        if (req.method === 'GET' && showMatch) {
            const id = decodeURIComponent(showMatch[1]!);
            try {
                const out = showHeld(id); // returns raw JSON string
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(out);
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
        if (req.method === 'POST' && clearMatch) {
            const id = decodeURIComponent(clearMatch[1]!);
            try {
                // use the removeHeld helper in review-hold.js
                // import dynamically to avoid circular/early-load issues
                const mod = await import('./review-hold.js');
                if (typeof mod.removeHeld !== 'function') throw new Error('removeHeld not available');
                mod.removeHeld(id);
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('cleared');
            } catch (err) {
                res.writeHead(500); res.end(String(err));
            }
            return;
        }
    }

    // telemetry endpoints
    if (url.startsWith('/api/telemetry')) {
        if (!checkAuth(req, res)) return;
        const teleMatch = url.match(/^\/api\/telemetry\/inference(?:\/(\d+))?$/);
        if (req.method === 'GET' && teleMatch) {
            const limit = teleMatch[1] ? Number(teleMatch[1]) : 200;
            try {
                const TELE_DIR = path.join(ROOT, 'data', 'orchestrator', 'telemetry');
                const TELE_FILE = path.join(TELE_DIR, 'inference.jsonl');
                if (!fs.existsSync(TELE_FILE)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify([]));
                    return;
                }
                const raw = fs.readFileSync(TELE_FILE, 'utf8');
                const lines = raw.split(/\r?\n/).filter(Boolean);
                const tail = lines.slice(-limit).map(l => {
                    try { return JSON.parse(l); } catch (e) { return { raw: l }; }
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(tail));
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
    const HOLD_DIR = path.join(ROOT, 'data', 'orchestrator', 'hold');
    if (!fs.existsSync(HOLD_DIR)) return [];
    const files = fs.readdirSync(HOLD_DIR).filter(f => f.endsWith('.json'));
    return files.map(f => {
        const raw = fs.readFileSync(path.join(HOLD_DIR, f), 'utf8');
        const parsed = JSON.parse(raw);
        return {
            id: parsed.id,
            createdAt: parsed.createdAt,
            errorsCount: parsed.validationErrors?.length || 0,
            intentAction: parsed.request?.intent?.action,
            responseAction: parsed.response?.resolution?.action
        };
    });
}

server.listen(PORT, HOST, () => {
    console.log(`Admin server listening on http://${HOST}:${PORT}/admin`);
});
