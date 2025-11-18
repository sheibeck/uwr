#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getValidator } from '../src/schemas/registry.js';
import { applyNarrativeResponse } from '../src/db/spacetime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Compute repo root from script location to avoid depending on process.cwd()
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const HOLD_DIR = path.join(REPO_ROOT, 'data', 'orchestrator', 'hold');

export function listHeld() {
    if (!fs.existsSync(HOLD_DIR)) {
        console.log('No held items');
        return;
    }
    const files = fs.readdirSync(HOLD_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
        const raw = fs.readFileSync(path.join(HOLD_DIR, f), 'utf8');
        const parsed = JSON.parse(raw);
        console.log(parsed.id, new Date(parsed.createdAt).toISOString(), parsed.validationErrors?.length || 0, parsed.request.intent.action);
    }
}

export function showHeld(id: string) {
    const file = path.join(HOLD_DIR, `${id}.json`);
    if (!fs.existsSync(file)) {
        console.error('Not found', id);
        process.exit(2);
    }
    const raw = fs.readFileSync(file, 'utf8');
    return raw;
}

export async function promote(id: string) {
    const file = path.join(HOLD_DIR, `${id}.json`);
    if (!fs.existsSync(file)) {
        console.error('Not found', id);
        process.exit(2);
    }
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);

    const v = getValidator('NarrativeResponse');
    if (!v) {
        console.warn('No JSON schema validator available for NarrativeResponse — aborting');
        process.exit(2);
    }
    const ok = v(parsed.response);
    if (!ok) {
        console.error('Revalidation failed:', v.errors);
        process.exit(3);
    }

    // attempt to apply to DB
    const res = await applyNarrativeResponse(parsed.response);
    if (!res.success) {
        console.error('Failed to apply response to DB:', res.errors);
        process.exit(4);
    }

    // remove held file
    fs.unlinkSync(file);
    console.log('Promoted and removed hold:', id);
}

export function removeHeld(id: string) {
    const file = path.join(HOLD_DIR, `${id}.json`);
    if (!fs.existsSync(file)) {
        throw new Error('Not found');
    }
    fs.unlinkSync(file);
}

async function main() {
    const [, , cmd, arg] = process.argv;
    if (!cmd || cmd === 'help') {
        console.log('Usage: review-hold.ts <list|show|promote> [id]');
        return;
    }
    if (cmd === 'list') return listHeld();
    if (cmd === 'show') {
        if (!arg) { console.error('show requires id'); process.exit(2); }
        const out = showHeld(arg);
        console.log(out);
        return;
    }
    if (cmd === 'promote') {
        if (!arg) { console.error('promote requires id'); process.exit(2); }
        return promote(arg);
    }
    console.log('Unknown command', cmd);
}

main().catch(e => {
    console.error('error', e);
    process.exit(1);
});
