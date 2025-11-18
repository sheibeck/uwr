#!/usr/bin/env tsx
/*
  rotate-telemetry.ts

  Usage:
    tsx scripts/rotate-telemetry.ts [--max-lines=1000] [--rotate]

  Behavior:
    - If the telemetry file has more than --max-lines, either rotate it (move to a timestamped file)
      when --rotate is provided, or trim it to the last --max-lines lines.
    - Default max-lines: 1000

  This is a simple dev helper for keeping telemetry from growing without bounds.
*/

import fs from 'fs';
import path from 'path';

function parseArgs() {
    const args = process.argv.slice(2);
    const out: { maxLines: number; rotate: boolean } = { maxLines: 1000, rotate: false };
    for (const a of args) {
        if (a.startsWith('--max-lines=')) out.maxLines = Number(a.split('=')[1]) || out.maxLines;
        if (a === '--rotate') out.rotate = true;
    }
    return out;
}

async function main() {
    const { maxLines, rotate } = parseArgs();
    const TELE_DIR = path.join(process.cwd(), 'data', 'orchestrator', 'telemetry');
    const TELE_FILE = path.join(TELE_DIR, 'inference.jsonl');

    if (!fs.existsSync(TELE_DIR)) {
        console.log('Telemetry directory does not exist, nothing to do:', TELE_DIR);
        return process.exit(0);
    }

    if (!fs.existsSync(TELE_FILE)) {
        console.log('Telemetry file not present, nothing to do:', TELE_FILE);
        return process.exit(0);
    }

    const raw = fs.readFileSync(TELE_FILE, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    console.log(`Telemetry file has ${lines.length} lines; maxLines=${maxLines}; rotate=${rotate}`);

    if (lines.length <= maxLines) {
        console.log('No action needed');
        return process.exit(0);
    }

    if (rotate) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archive = path.join(TELE_DIR, `inference.${stamp}.jsonl`);
        fs.renameSync(TELE_FILE, archive);
        // create an empty telemetry file
        fs.writeFileSync(TELE_FILE, '', 'utf8');
        console.log('Rotated telemetry to', archive);
        return process.exit(0);
    }

    // Otherwise trim to last maxLines lines
    const keep = lines.slice(-maxLines);
    fs.writeFileSync(TELE_FILE, keep.join('\n') + (keep.length ? '\n' : ''), 'utf8');
    console.log('Trimmed telemetry file to', keep.length, 'lines');
}

main().catch(err => {
    // eslint-disable-next-line no-console
    console.error('rotate-telemetry error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
});
